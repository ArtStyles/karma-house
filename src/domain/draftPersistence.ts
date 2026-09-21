import type { ListingDraft } from './listings.ts';
import { isMapLocation, normalizeMapLocation } from './geo.ts';
import { isDraftFloor, isListingCondition } from './listingOptions.ts';

export function restoreDraft(raw: string | null, fallback: ListingDraft): ListingDraft {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    const strings = ['title', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'area', 'description'];
    if (!value || !strings.every(key => typeof value[key] === 'string') || !['Casa', 'Apartamento'].includes(value.type)
      || !Array.isArray(value.amenities) || !value.amenities.every((item: unknown) => typeof item === 'string')
      || !['vedado', 'interior', 'terrace'].includes(value.imageKey)
      || (value.photoUri !== undefined && typeof value.photoUri !== 'string')
      || (value.mapLocation !== undefined && !isMapLocation(value.mapLocation))
      || (value.condition !== undefined && value.condition !== '' && !isListingCondition(value.condition))
      || (value.floor !== undefined && !isDraftFloor(value.floor))
      || (value.priceNegotiable != null && typeof value.priceNegotiable !== 'boolean')
      || (value.photos !== undefined && (!Array.isArray(value.photos) || value.photos.length > 6 || !value.photos.every((photo: { uri?: unknown; storagePath?: unknown; uploadId?: unknown }) => photo && typeof photo.uri === 'string'
        && (photo.storagePath === undefined || typeof photo.storagePath === 'string') && (photo.uploadId === undefined || typeof photo.uploadId === 'string'))))
      || (value.clientRequestId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(value.clientRequestId))
      || (value.expectedVersion !== undefined && (!Number.isInteger(value.expectedVersion) || value.expectedVersion < 1))) return fallback;
    const photos = value.photos?.map((photo: NonNullable<ListingDraft['photos']>[number]) => {
      const current = photo.storagePath && fallback.photos?.find(item => item.storagePath === photo.storagePath);
      return current ? { ...photo, uri: current.uri } : photo;
    });
    return { ...value, ...(value.mapLocation ? { mapLocation: normalizeMapLocation(value.mapLocation) } : {}), ...(photos ? { photos, ...(value.photoUri !== undefined ? { photoUri: photos[0]?.uri } : {}) } : {}), ...(value.clientRequestId === undefined && fallback.clientRequestId ? { clientRequestId: fallback.clientRequestId } : {}) };
  } catch { return fallback; }
}

export function draftToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function hasDraftVersionConflict(draft: Pick<ListingDraft, 'expectedVersion' | 'clientRequestId'>, latest?: Pick<ListingDraft, 'expectedVersion' | 'clientRequestId'>): boolean {
  return !!latest && (latest.expectedVersion !== undefined && latest.expectedVersion !== draft.expectedVersion
    || latest.clientRequestId !== undefined && latest.clientRequestId !== draft.clientRequestId);
}

export interface DraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Prevent stale local data from reappearing in this process if cleanup failed after a confirmed save.
const submittedKeys = new Set<string>();
const writeQueues = new Map<string, Promise<unknown>>();
const currentInstances = new Map<string, symbol>();
function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const result = (writeQueues.get(key) ?? Promise.resolve()).then(work, work);
  writeQueues.set(key, result);
  void result.finally(() => { if (writeQueues.get(key) === result) writeQueues.delete(key); }).catch(() => undefined);
  return result;
}

export function createDraftPersistence(storage: DraftStorage, key: string) {
  const instance = Symbol(key);
  currentInstances.set(key, instance);
  let readSucceeded = false;
  let submitted = false;
  return {
    async read(): Promise<string | null> {
      const raw = await serialize(key, async () => submittedKeys.has(key) ? null : storage.getItem(key));
      readSucceeded = true;
      return raw;
    },
    write(draft: ListingDraft): Promise<void> {
      const serialized = JSON.stringify({ ...draft, ...(draft.mapLocation ? { mapLocation: normalizeMapLocation(draft.mapLocation) } : {}) });
      return serialize(key, async () => {
        if (submitted || currentInstances.get(key) !== instance) return;
        if (!readSucceeded) throw new Error('Primero hay que recuperar el borrador guardado.');
        await storage.setItem(key, serialized);
        submittedKeys.delete(key);
      });
    },
    async complete(): Promise<boolean> {
      submitted = true;
      return serialize(key, async () => {
        if (currentInstances.get(key) !== instance) return false;
        submittedKeys.add(key);
        try { await storage.removeItem(key); return true; } catch { return false; }
      });
    },
    beginNext() { submitted = false; },
  };
}
