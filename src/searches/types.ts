import type { ListingOperation } from '../domain/listings.ts';
import type { MessagingRequestContext } from '../messaging/types.ts';

/** The catalogue payload without paging: the server stores exactly these keys. */
export interface SavedSearchFilters {
  query: string; type: 'Casa' | 'Apartamento' | null; province: string | null; condition: string | null;
  min_price: number | null; max_price: number | null; min_area: number | null; max_area: number | null;
  min_bedrooms: number; min_bathrooms: number | null; negotiable_only: true | null; amenities: string[]; operations: ListingOperation[];
}
export interface SavedSearch { id: string; name: string; filters: SavedSearchFilters; enabled: boolean; version: number; createdAt: string; updatedAt: string }
export interface SaveSearchInput { id?: string; name: string; filters: SavedSearchFilters; enabled: boolean; expectedVersion?: number }
export interface SavedSearchRepository {
  list(context: MessagingRequestContext): Promise<SavedSearch[]>;
  save(input: SaveSearchInput, context: MessagingRequestContext): Promise<SavedSearch>;
  remove(id: string, context: MessagingRequestContext): Promise<void>;
}
