import { normalizeSearch, type ListingFilters } from '../domain/listings.ts';
import { parseDecimal } from '../domain/numericInput.ts';
import { CATALOG_PAGE_SIZE, type CatalogCursor, type SearchMode } from './types.ts';

const SORTS: ReadonlySet<string> = new Set(['recent', 'price-asc', 'price-desc', 'area-desc']);
const MODES: ReadonlySet<string> = new Set(['fts', 'trgm', 'none']);

/**
 * Cursor fields are joined with a pipe rather than base64: React Native provides no
 * btoa/atob, and no field can contain the separator (enum word, uuid, ISO timestamp
 * or decimal number). The server reads it back with split_part.
 */
const SEPARATOR = '|';

/** Blank, whitespace and unparseable values are absent predicates, not zeroes. */
function optionalNumber(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = parseDecimal(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function encodeCursor(cursor: CatalogCursor): string {
  if (cursor.id.includes(SEPARATOR) || cursor.key.includes(SEPARATOR)) throw new Error('KH_INVALID_CURSOR');
  return [cursor.sort, cursor.mode, cursor.id, cursor.key].join(SEPARATOR);
}

export function decodeCursor(value: unknown): CatalogCursor {
  if (typeof value !== 'string') throw new Error('KH_INVALID_CURSOR');
  const parts = value.split(SEPARATOR);
  if (parts.length !== 4) throw new Error('KH_INVALID_CURSOR');
  const [sort, mode, id, key] = parts;
  if (!SORTS.has(sort)) throw new Error('KH_INVALID_CURSOR');
  if (!MODES.has(mode)) throw new Error('KH_INVALID_CURSOR');
  if (!id || !key) throw new Error('KH_INVALID_CURSOR');
  return { sort: sort as ListingFilters['sort'], mode: mode as SearchMode, id, key };
}

export interface SearchPayload {
  query: string;
  type: string | null;
  province: string | null;
  condition: string | null;
  min_price: number | null;
  max_price: number | null;
  min_area: number | null;
  max_area: number | null;
  min_bedrooms: number;
  min_bathrooms: number | null;
  negotiable_only: true | null;
  amenities: string[];
  sort: ListingFilters['sort'];
  cursor: string | null;
  with_total: boolean;
  limit: number;
}

export function searchPayload(filters: ListingFilters, cursor: string | null, withTotal: boolean): SearchPayload {
  return {
    query: normalizeSearch(filters.query ?? ''),
    type: filters.type === 'Todas' ? null : filters.type,
    province: optionalText(filters.province),
    condition: optionalText(filters.condition),
    min_price: optionalNumber(filters.minPrice),
    max_price: optionalNumber(filters.maxPrice),
    min_area: optionalNumber(filters.minArea),
    max_area: optionalNumber(filters.maxArea),
    min_bedrooms: Number.isFinite(filters.minBedrooms) && filters.minBedrooms > 0 ? Math.floor(filters.minBedrooms) : 0,
    min_bathrooms: filters.minBathrooms && filters.minBathrooms > 0 ? Math.floor(filters.minBathrooms) : null,
    negotiable_only: filters.negotiableOnly === true ? true : null,
    amenities: (filters.amenities ?? []).map((value) => normalizeSearch(value)).filter(Boolean),
    sort: filters.sort,
    // Re-encoding a decoded cursor fails here, on the client, instead of at the server.
    cursor: cursor === null ? null : encodeCursor(decodeCursor(cursor)),
    with_total: withTotal,
    limit: CATALOG_PAGE_SIZE,
  };
}
