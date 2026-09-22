import type { Listing, ListingFilters } from '../domain/listings.ts';
import type { CatalogRepository, SearchMode } from './types.ts';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore.ts';

export interface CatalogState {
  rows: Listing[];
  total: number;
  cursor: string | null;
  hasMore: boolean;
  ready: boolean;
  loading: boolean;
  /** A failed page keeps the rows already visible; the screen shows a retry instead of blanking. */
  pageError: string | null;
  searchMode: SearchMode;
}

export function emptyCatalogState(): CatalogState {
  return { rows: [], total: 0, cursor: null, hasMore: false, ready: false, loading: false, pageError: null, searchMode: 'none' };
}

export function createCatalogController(repository: CatalogRepository) {
  let state = emptyCatalogState();
  let filters: ListingFilters | null = null;
  let generation = 0;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const publish = (next: CatalogState) => { state = next; listeners.forEach((listener) => listener()); };
  // Same guard as remoteMarketplaceStore: a request started under one account must never
  // publish after the account changed, and an older page must never replace a newer one.
  const checkpointFor = (epoch: number) => () => {
    if (epoch !== generation) throw new Error('KH_ACCOUNT_CHANGED');
  };

  const fetchPage = async (cursor: string | null, append: boolean): Promise<void> => {
    if (!filters) return;
    const epoch = generation;
    const mine = ++sequence;
    const checkpoint = checkpointFor(epoch);
    publish({ ...state, loading: true, pageError: null });
    try {
      const page = await repository.search(filters, cursor, !append, checkpoint);
      if (epoch !== generation || mine !== sequence) return;
      const rows = append
        ? [...state.rows, ...page.rows.filter((row) => !state.rows.some((seen) => seen.id === row.id))]
        : page.rows;
      publish({
        rows,
        total: append ? state.total : page.total,
        cursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
        ready: true,
        loading: false,
        pageError: null,
        searchMode: page.searchMode,
      });
    } catch (error) {
      if (epoch !== generation || mine !== sequence) return;
      const message = remoteErrorMessage(error);
      publish({
        ...state,
        ready: true,
        loading: false,
        // A rejected cursor means the list moved underneath; restart from the first page.
        cursor: /KH_INVALID_CURSOR/.test(message) ? null : state.cursor,
        hasMore: /KH_INVALID_CURSOR/.test(message) ? false : state.hasMore,
        pageError: message,
      });
      throw error;
    }
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    setSession() {
      generation += 1;
      sequence += 1;
      filters = null;
      publish(emptyCatalogState());
    },
    setFilters(next: ListingFilters) { filters = next; return fetchPage(null, false); },
    loadMore() { return state.hasMore && !state.loading ? fetchPage(state.cursor, true) : Promise.resolve(); },
    refresh() { return fetchPage(null, false); },
  };
}
