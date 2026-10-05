import type { DraftStorage } from '../domain/draftPersistence.ts';
import type { ListingFilters } from '../domain/listings.ts';
import { isUuid } from '../messaging/domain.ts';
import { decodeFilters } from '../searches/domain.ts';
import type { SavedSearchFilters } from '../searches/types.ts';

export type PendingIntent = { kind: 'contact' | 'favorite'; propertyId: string }
  | { kind: 'search'; filters: SavedSearchFilters; sort: ListingFilters['sort'] };
const LIFETIME = 30 * 60_000;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => key in value);
function decodeIntent(value: unknown): PendingIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('No pudimos conservar el contexto de esta acción.');
  const item = value as Record<string, unknown>;
  if ((item.kind === 'contact' || item.kind === 'favorite') && exact(item, ['kind', 'propertyId']) && isUuid(item.propertyId)) {
    return { kind: item.kind, propertyId: item.propertyId as string };
  }
  if (item.kind === 'search' && exact(item, ['kind', 'filters', 'sort']) && ['recent', 'price-asc', 'price-desc', 'area-desc'].includes(String(item.sort))) {
    return { kind: 'search', filters: decodeFilters(item.filters), sort: item.sort as ListingFilters['sort'] };
  }
  throw Error('No pudimos conservar el contexto de esta acción.');
}

export function pendingIntentDestination(intent: PendingIntent): string {
  const value = decodeIntent(intent);
  return value.kind === 'search' ? '/' : `/property/${value.propertyId}`;
}

/** Saves context only. Reading or restoring it never writes a favourite, search or message. */
export function createPendingIntentStore({ storage, now, key = '@karma-house/pending-intent-v1' }: { storage: DraftStorage; now(): number; key?: string }) {
  let queue: Promise<unknown> = Promise.resolve();
  let cleared = false;
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }
  async function read(): Promise<PendingIntent | null> {
    if (cleared) return null;
    let raw: string | null;
    try { raw = await storage.getItem(key); } catch { return null; }
    if (!raw) return null;
    try {
      if (raw.length > 8192) throw Error('oversized');
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !exact(saved, ['createdAt', 'intent']) || !Number.isSafeInteger(saved.createdAt)) throw Error('invalid');
      const age = now() - saved.createdAt;
      if (age < 0 || age >= LIFETIME) throw Error('expired');
      return decodeIntent(saved.intent);
    } catch {
      await storage.removeItem(key).catch(() => undefined);
      return null;
    }
  }
  return {
    write(intent: PendingIntent) { return serialize(async () => {
      const value = decodeIntent(intent);
      await storage.setItem(key, JSON.stringify({ createdAt: now(), intent: value }));
      cleared = false;
    }); },
    read() { return serialize(read); },
    clear() { return serialize(async () => { cleared = true; await storage.removeItem(key); }); },
  };
}
