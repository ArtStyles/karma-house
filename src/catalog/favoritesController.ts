import type { Listing } from '../domain/listings.ts';
import type { CatalogRepository } from './types.ts';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore.ts';

export interface FavoriteListingsState { listings: Listing[]; ready: boolean; loading: boolean; error: string | null; sessionId: string | null }
export function emptyFavoriteListingsState(sessionId: string | null = null): FavoriteListingsState {
  return { listings: [], ready: false, loading: false, error: null, sessionId };
}

/** One account owns each read; a failed retry cannot turn known favourites into removed ads. */
export function createFavoriteListingsController(repository: Pick<CatalogRepository, 'byIds'>) {
  let state = emptyFavoriteListingsState();
  let ids: string[] = [];
  let generation = 0;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const publish = (next: FavoriteListingsState) => { state = next; listeners.forEach(listener => listener()); };
  async function read() {
    const epoch = generation;
    const mine = ++sequence;
    const requestedIds = [...ids];
    const checkpoint = () => { if (epoch !== generation || mine !== sequence) throw Error('KH_ACCOUNT_CHANGED'); };
    if (!requestedIds.length) { publish({ ...state, listings: [], ready: true, loading: false, error: null }); return; }
    publish({ ...state, listings: state.listings.filter(row => requestedIds.includes(row.id)), ready: false, loading: true, error: null });
    try {
      const listings = await repository.byIds(requestedIds, checkpoint);
      checkpoint();
      publish({ ...state, listings, ready: true, loading: false, error: null });
    } catch (error) {
      if (epoch !== generation || mine !== sequence) return;
      publish({ ...state, ready: true, loading: false, error: remoteErrorMessage(error) });
    }
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession(sessionId: string | null) { generation += 1; sequence += 1; ids = []; publish(emptyFavoriteListingsState(sessionId)); },
    setIds(next: string[]) { ids = [...next]; return read(); },
    retry: read,
  };
}
