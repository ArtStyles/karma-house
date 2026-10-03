import type { DraftStorage as KeyValueStorage } from '../domain/draftPersistence.ts';
import { defaultFilters, type Listing, type ListingFilters } from '../domain/listings.ts';
import { isUuid } from '../messaging/domain.ts';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore.ts';
import { searchPayload } from './query.ts';
import { isMapLocation } from '../domain/geo.ts';
import { isListingOperation, isRentPeriod, isSwapBalance, isWantedOperations } from '../domain/listingOptions.ts';

export const SNAPSHOT_ROWS = 24;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function isRow(value: unknown): value is Listing {
  const row = value as Listing;
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
  const optionalNumber = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value));
  return !!row && isUuid(row.id) && typeof row.title === 'string' && row.title.length > 0
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && typeof row.location === 'string' && typeof row.province === 'string'
    && typeof row.description === 'string' && strings(row.amenities)
    && typeof row.bedrooms === 'number' && Number.isFinite(row.bedrooms)
    && optionalNumber(row.bathrooms) && optionalNumber(row.area) && optionalNumber(row.floor)
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
    && (row.photoUri === undefined || typeof row.photoUri === 'string')
    && (row.photos === undefined || (Array.isArray(row.photos) && row.photos.every(photo => photo && typeof photo.uri === 'string')))
    && (row.coverThumb === undefined || (!!row.coverThumb && typeof row.coverThumb.uri === 'string' && typeof row.coverThumb.storagePath === 'string'))
    && (row.mapLocation === undefined || isMapLocation(row.mapLocation))
    && (row.operation === undefined || isListingOperation(row.operation))
    && (row.swap === undefined || (!!row.swap && typeof row.swap.wants === 'string' && strings(row.swap.provinces) && isSwapBalance(row.swap.balance) && optionalNumber(row.swap.amount)))
    && (row.rent === undefined || (!!row.rent && isRentPeriod(row.rent.period) && optionalNumber(row.rent.minStay)))
    && (row.wantedOperations === undefined || isWantedOperations(row.wantedOperations));
}

/** The first catalogue page with default filters, kept so Explore can open without a network. */
export function createOfflineSnapshot({ storage, now, key = 'karmahouse.catalogSnapshot.v1', maxAgeMs = 7 * DAY }: {
  storage: KeyValueStorage; now: () => number; key?: string; maxAgeMs?: number;
}) {
  return {
    /** Best effort: a failed write keeps the previous snapshot. */
    async save(rows: Listing[]): Promise<void> {
      await storage.setItem(key, JSON.stringify({ savedAt: now(), rows: rows.slice(0, SNAPSHOT_ROWS) })).catch(() => undefined);
    },
    async load(): Promise<{ rows: Listing[]; savedAt: number } | null> {
      try {
        const saved = JSON.parse(await storage.getItem(key) ?? 'null');
        if (!saved || !Number.isFinite(saved.savedAt) || now() - saved.savedAt > maxAgeMs) return null;
        const rows: unknown = saved.rows;
        if (!Array.isArray(rows) || rows.length === 0 || rows.length > SNAPSHOT_ROWS || !rows.every(isRow)) return null;
        return { rows, savedAt: saved.savedAt };
      } catch { return null; }
    },
  };
}

/** Compared as the server sees them, so blank strings, spacing and absent optionals all count as default. */
export function isDefaultCatalog(filters: ListingFilters): boolean {
  return JSON.stringify(searchPayload(filters, null, false)) === JSON.stringify(searchPayload(defaultFilters, null, false));
}

/** Every transport failure (TypeError, the deadline abort) reaches the catalogue as this one message. */
const NETWORK_FAILURE = remoteErrorMessage(new TypeError('Network request failed'));
export const isNetworkFailure = (message: string | null | undefined) => message === NETWORK_FAILURE;

/**
 * Whether Explore should stand on the snapshot. It starts when a load fails for the network with
 * nothing on screen, survives the retry's loading state so the list does not blink, and ends as
 * soon as rows arrive or the server answers (even with an empty list or another error).
 */
export function nextOffline(previous: boolean, state: { rows: unknown[]; loading: boolean; pageError: string | null }): boolean {
  if (state.rows.length > 0) return false;
  if (state.pageError) return isNetworkFailure(state.pageError);
  return state.loading && previous;
}

export function snapshotAgeText(savedAt: number, now: number): string {
  const hours = Math.floor((now - savedAt) / HOUR);
  if (hours < 1) return 'hace unos minutos';
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
