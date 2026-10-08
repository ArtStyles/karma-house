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
      publish({ ...state, listings: [...new Map(listings.map(row => [row.id, row])).values()], ready: true, loading: false, error: null });
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
    cancelRead(){sequence+=1;publish({...state,loading:false});},
    retry: read,
  };
}

/** Account reconciliation precedes the row read, so every consumer shares heart/count identity. */
export function createAccountFavoriteReader(repository:Pick<CatalogRepository,'byIds'>,normalize:(checkpoint:()=>void)=>Promise<string[]>):Pick<CatalogRepository,'byIds'>{
 return {async byIds(_ids,checkpoint){const ids=await normalize(checkpoint);checkpoint();return repository.byIds(ids,checkpoint)}};
}
export function visibleFavoriteListings(listings:Listing[],favoriteIds:string[]):Listing[]{return listings.filter(item=>favoriteIds.includes(item.id)&&item.status==='active'&&(!item.moderationStatus||item.moderationStatus==='approved'))}
export function canonicalFavoriteCards(listings:Listing[],canonical:(id:string)=>string):Listing[]{
 const items=new Map<string,Listing>();for(const listing of listings){const id=canonical(listing.id);const previous=items.get(id);if(!previous||listing.id===id)items.set(id,{...listing,id})}return [...items.values()];
}
