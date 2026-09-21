import type { Coordinates, MapLocation } from '../domain/geo.ts';
import type { Listing, ListingFilters } from '../domain/listings.ts';

/** Which index answered the text search. Carried in the cursor so later pages keep one criterion. */
export type SearchMode = 'fts' | 'trgm' | 'none';

export const CATALOG_PAGE_SIZE = 24;
/** Above this many located listings in the box the map returns grid clusters instead of pins. */
export const MAP_POINT_LIMIT = 200;
/** Debounce before the filter sheet asks the server for an exact count. */
export const COUNT_DEBOUNCE_MS = 300;
/** The trigram index cannot serve shorter needles, so only the prefix path runs below this. */
export const MIN_TRIGRAM_LENGTH = 3;

export interface CatalogPage {
  rows: Listing[];
  total: number;
  nextCursor: string | null;
  searchMode: SearchMode;
}

export interface CatalogCursor {
  sort: ListingFilters['sort'];
  mode: SearchMode;
  id: string;
  /** created_at for 'recent', price for the price orders, area for 'area-desc'. */
  key: string;
}

export interface BoundingBox { west: number; south: number; east: number; north: number }
export interface MapCluster extends Coordinates { key: string; count: number }
export interface MapPoint extends MapLocation { id: string; price: number }
export type MapView =
  | { mode: 'points'; items: MapPoint[] }
  | { mode: 'clusters'; items: MapCluster[] };

export interface CatalogRepository {
  search(filters: ListingFilters, cursor: string | null, withTotal: boolean, checkpoint: () => void): Promise<CatalogPage>;
  mapView(bbox: BoundingBox, zoom: number, filters: ListingFilters, checkpoint: () => void): Promise<MapView>;
  byId(id: string, checkpoint: () => void): Promise<Listing | null>;
  byIds(ids: string[], checkpoint: () => void): Promise<Listing[]>;
}
