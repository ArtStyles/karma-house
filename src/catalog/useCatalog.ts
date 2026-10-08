import {useFocusEffect} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { filterListings, type Listing, type ListingFilters } from '../domain/listings';
import { createRowSigner } from '../data/supabaseMarketplace';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
// Supabase rejects with a plain object, never an Error, so String(error) yields "[object Object]".
import { remoteErrorMessage } from '../state/remoteMarketplaceStore';
import { createCatalogController, emptyCatalogState, type CatalogState } from './controller';
import { createCatalogRepository } from './repository';
import { createOfflineSnapshot, isDefaultCatalog, isNetworkFailure, nextOffline } from './offlineSnapshot';
import { draftStorage } from '../data/draftStorage';
import { COUNT_DEBOUNCE_MS, type BoundingBox, type CatalogRepository, type MapView } from './types';
import {listingManagementEvents} from '../state/listingManagementEvents';
import { catalogFiltersKey, catalogQueryStatus } from './presentation';
import { createAccountFavoriteReader, visibleFavoriteListings, createFavoriteListingsController, emptyFavoriteListingsState } from './favoritesController';

/** Null while Supabase is unconfigured; the screens never branch on mode themselves. */
function useCatalogRepository(): CatalogRepository | null {
  return useMemo(() => supabase ? createCatalogRepository(supabase, createRowSigner(supabase)) : null, []);
}

/**
 * useSyncExternalStore compares snapshots by identity, so the demo fallback must return one
 * frozen object rather than build a fresh state on every call, which loops forever.
 */
const EMPTY_STATE: CatalogState = Object.freeze(emptyCatalogState());
const emptySnapshot = () => EMPTY_STATE;
const noSubscribe = () => () => {};
/** Reads outside the controller have no epoch of their own, so they pass a no-op checkpoint. */
const passthrough = () => {};
const catalogSnapshot = createOfflineSnapshot({ storage: draftStorage, now: Date.now });
type Snapshot = Awaited<ReturnType<typeof catalogSnapshot.load>>;

export interface CatalogPageResult extends CatalogState {
  /** Set while Explore shows the saved first page because the network failed; `rows` are then the snapshot's. */
  offlineSince: number | null;
  updating: boolean;
  current: boolean;
  loadMore(): void;
  refresh(): Promise<void>;
}

export function useCatalogPage(filters: ListingFilters): CatalogPageResult {
  const managementGeneration=useSyncExternalStore(listingManagementEvents.subscribe,listingManagementEvents.getSnapshot,listingManagementEvents.getSnapshot);
  const { mode, demoCatalog } = useMarketplace();
  const { user } = useAuth();
  const repository = useCatalogRepository();
  const controller = useMemo(
    () => repository ? createCatalogController(repository, {
      onFirstPage(rows, filters) {
        // Empty results replace stale adverts; late responses never reach this callback.
        if (isDefaultCatalog(filters)) void catalogSnapshot.save(rows);
      },
    }) : null,
    [repository],
  );
  const remote = useSyncExternalStore(
    controller ? controller.subscribe : noSubscribe,
    controller ? controller.getState : emptySnapshot,
    controller ? controller.getState : emptySnapshot,
  );

  // A new account must not keep the previous account's pages on screen.
  useEffect(() => { controller?.setSession(); }, [controller, user?.id]);
  useEffect(()=>listingManagementEvents.subscribe(()=>{void controller?.invalidateListingManagement().catch(()=>{});}),[controller]);

  useEffect(() => {
    if (!controller) return;
    const timer = setTimeout(() => { void controller.setFilters(filters).catch(() => {}); }, COUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [controller, filters, user?.id]);

  const demoRows = useMemo(
    () => mode === 'demo' ? filterListings(demoCatalog ?? [], filters) : [],
    [mode, demoCatalog, filters],
  );

  const queryStatus = catalogQueryStatus(remote, filters);
  const loadMore = useCallback(() => { if (!queryStatus.updating && queryStatus.current) void controller?.loadMore().catch(() => {}); }, [controller, queryStatus.updating, queryStatus.current]);
  const refresh = useCallback(async () => { await controller?.setFilters(filters); }, [controller, filters]);

  // A successful load earlier in this session may have replaced the snapshot.
  const [snapshot, setSnapshot] = useState<Snapshot>(null);
  useEffect(() => {
    let cancelled = false;
    if (mode === 'cloud') void catalogSnapshot.load().then(saved => { if (!cancelled) setSnapshot(saved); });
    return () => { cancelled = true; };
  }, [mode, remote.pageError, remote.loading]);
  // Sticky across a retry's loading state; the transition is pure and idempotent, so a ref is enough.
  const offline = useRef(false);
  offline.current = nextOffline(offline.current, remote);

  if (mode === 'demo') {
    const key = catalogFiltersKey(filters);
    return { rows: demoRows, total: demoRows.length, cursor: null, hasMore: false, ready: true, loading: false, requestKey: key, resultKey: key, pageError: null, searchMode: 'none', offlineSince: null, updating: false, current: true, loadMore: () => {}, refresh: async () => {} };
  }
  if (offline.current && snapshot) {
    return { ...remote, rows: snapshot.rows, total: snapshot.rows.length, cursor: null, hasMore: false, ready: true, pageError: null, offlineSince: snapshot.savedAt, updating: false, current: false, loadMore: () => {}, refresh };
  }
  return { ...remote, ...queryStatus, offlineSince: null, loadMore, refresh };
}

interface ListingResult {
  listing: Listing | undefined;
  ready: boolean;
  error: string | null;
  /** The listing came from the offline snapshot; anything that writes needs the network first. */
  offline: boolean;
}

export function useListing(id: string | undefined): ListingResult & { retry(): void } {
  const {user}=useAuth();
  const managementGeneration=useSyncExternalStore(listingManagementEvents.subscribe,listingManagementEvents.getSnapshot,listingManagementEvents.getSnapshot);
  const scope=`${id}:${user?.id??''}:${managementGeneration}`;
  const latestScope=useRef(scope);latestScope.current=scope;
  const loadedScope=useRef('');
  const { mode, demoCatalog, ownListings } = useMarketplace();
  const repository = useCatalogRepository();
  const [state, setState] = useState<ListingResult>({ listing: undefined, ready: false, error: null, offline: false });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (mode === 'demo' || !repository || !id) return;
    let cancelled = false;
    const capturedScope=scope;
    const keepPrevious = loadedScope.current === scope;
    loadedScope.current=scope;
    const managementCheckpoint=listingManagementEvents.checkpoint();
    const checkpoint=()=>{managementCheckpoint();if(cancelled||latestScope.current!==capturedScope)throw Error('KH_ACCOUNT_CHANGED');};
    setState(current => ({ listing: keepPrevious ? current.listing : undefined, ready: false, error: null, offline: false }));
    repository.byId(id, checkpoint)
      .then((listing) => { checkpoint(); setState({ listing: listing ?? undefined, ready: true, error: null, offline: false }); })
      .catch(async (failure) => {
        const error = remoteErrorMessage(failure);
        const saved = isNetworkFailure(error) ? (await catalogSnapshot.load())?.rows.find((row) => row.id === id) : undefined;
        if (!cancelled && latestScope.current === capturedScope) setState(current => {
          const listing = current.listing ?? saved;
          return { listing, ready: true, error, offline: !!listing && isNetworkFailure(error) };
        });
      });
    return () => { cancelled = true; };
  }, [mode, repository, id, attempt,scope]);

  if (mode === 'demo') {
    return { listing: (demoCatalog ?? []).find((item) => item.id === id), ready: true, error: null, offline: false, retry };
  }
  // An owner editing their own paused listing reads it from the account snapshot without a round trip.
  const own = ownListings.find((item) => item.id === id);
  return own ? { listing: own, ready: true, error: null, offline: false, retry } : loadedScope.current===scope ? { ...state, retry } : {listing:undefined,ready:false,error:null,offline:false,retry};
}

const EMPTY_FAVORITES = Object.freeze(emptyFavoriteListingsState());
const emptyFavorites = () => EMPTY_FAVORITES;
export function useFavoriteListings(): { listings: Listing[]; ready: boolean; loading: boolean; error: string | null; retry(): Promise<void> } {
  const managementGeneration=useSyncExternalStore(listingManagementEvents.subscribe,listingManagementEvents.getSnapshot,listingManagementEvents.getSnapshot);
  const { mode, demoCatalog, favoriteIds, normalizeFavoriteIds, ready: marketplaceReady } = useMarketplace();
  const { user } = useAuth();
  const sessionId = user?.id ?? null;
  const repository = useCatalogRepository();
  const controller = useMemo(() => repository ? createFavoriteListingsController(createAccountFavoriteReader(repository,normalizeFavoriteIds)) : null, [repository,normalizeFavoriteIds]);
  const remote = useSyncExternalStore(controller ? controller.subscribe : noSubscribe, controller ? controller.getState : emptyFavorites, controller ? controller.getState : emptyFavorites);
  const state = remote.sessionId === sessionId ? remote : EMPTY_FAVORITES;
  const key = favoriteIds.join(',');
  useEffect(() => { controller?.setSession(sessionId); }, [controller, sessionId]);
  useFocusEffect(useCallback(() => {
    if (mode !== 'demo' && marketplaceReady) void controller?.setIds(favoriteIds);
    return ()=>controller?.cancelRead();
  }, [mode, controller, key, sessionId, managementGeneration, marketplaceReady]));
  const retry = useCallback(async () => { await controller?.retry(); }, [controller]);

  const visible = visibleFavoriteListings(mode === 'demo' ? (demoCatalog ?? []) : state.listings,favoriteIds);
  return { listings: visible, ready: mode === 'demo' ? true : marketplaceReady && state.ready, loading: mode !== 'demo' && (!marketplaceReady || state.loading), error: mode === 'demo' ? null : state.error, retry };
}

export function useMapView(bbox: BoundingBox | null, zoom: number, filters: ListingFilters): { view: MapView; ready: boolean; error: string | null; retry(): void } {
  const { mode, demoCatalog } = useMarketplace();
  const repository = useCatalogRepository();
  const [view, setView] = useState<MapView>({ mode: 'points', items: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const box = bbox ? `${bbox.west},${bbox.south},${bbox.east},${bbox.north}` : '';
  useEffect(() => {
    if (mode === 'demo' || !repository || !bbox) return;
    const mine = ++latest.current;
    setReady(false);
    // A failed viewport must not read as an empty one; the screen needs the reason and a retry.
    repository.mapView(bbox, zoom, filters, passthrough)
      .then((next) => { if (mine === latest.current) { setView(next); setError(null); setReady(true); } })
      .catch((failure) => { if (mine === latest.current) { setError(remoteErrorMessage(failure)); setReady(true); } });
  }, [mode, repository, box, zoom, filters, attempt]);

  if (mode === 'demo') {
    const items = filterListings(demoCatalog ?? [], filters)
      .filter((item) => item.mapLocation)
      .map((item) => ({ id: item.id, price: item.price, ...item.mapLocation! }));
    return { view: { mode: 'points', items }, ready: true, error: null, retry: () => {} };
  }
  return { view, ready, error, retry };
}
