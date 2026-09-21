import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { filterListings, type Listing, type ListingFilters } from '../domain/listings';
import { createRowSigner } from '../data/supabaseMarketplace';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createCatalogController, emptyCatalogState, type CatalogState } from './controller';
import { createCatalogRepository } from './repository';
import { COUNT_DEBOUNCE_MS, type BoundingBox, type CatalogRepository, type MapView } from './types';

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

export interface CatalogPageResult extends CatalogState {
  loadMore(): void;
  refresh(): Promise<void>;
}

export function useCatalogPage(filters: ListingFilters): CatalogPageResult {
  const { mode, demoCatalog } = useMarketplace();
  const { user } = useAuth();
  const repository = useCatalogRepository();
  const controller = useMemo(
    () => repository ? createCatalogController(repository) : null,
    [repository],
  );
  const remote = useSyncExternalStore(
    controller ? controller.subscribe : noSubscribe,
    controller ? controller.getState : emptySnapshot,
    controller ? controller.getState : emptySnapshot,
  );

  // A new account must not keep the previous account's pages on screen.
  useEffect(() => { controller?.setSession(); }, [controller, user?.id]);

  useEffect(() => {
    if (!controller) return;
    const timer = setTimeout(() => { void controller.setFilters(filters).catch(() => {}); }, COUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [controller, filters, user?.id]);

  const demoRows = useMemo(
    () => mode === 'demo' ? filterListings(demoCatalog ?? [], filters) : [],
    [mode, demoCatalog, filters],
  );

  const loadMore = useCallback(() => { void controller?.loadMore().catch(() => {}); }, [controller]);
  const refresh = useCallback(async () => { await controller?.refresh(); }, [controller]);

  if (mode === 'demo') {
    return { rows: demoRows, total: demoRows.length, cursor: null, hasMore: false, ready: true, loading: false, pageError: null, searchMode: 'none', loadMore: () => {}, refresh: async () => {} };
  }
  return { ...remote, loadMore, refresh };
}

export function useListing(id: string | undefined): { listing: Listing | undefined; ready: boolean; error: string | null } {
  const { mode, demoCatalog, ownListings } = useMarketplace();
  const repository = useCatalogRepository();
  const [state, setState] = useState<{ listing: Listing | undefined; ready: boolean; error: string | null }>({ listing: undefined, ready: false, error: null });

  useEffect(() => {
    if (mode === 'demo' || !repository || !id) return;
    let cancelled = false;
    setState({ listing: undefined, ready: false, error: null });
    repository.byId(id, passthrough)
      .then((listing) => { if (!cancelled) setState({ listing: listing ?? undefined, ready: true, error: null }); })
      .catch((error) => { if (!cancelled) setState({ listing: undefined, ready: true, error: error instanceof Error ? error.message : String(error) }); });
    return () => { cancelled = true; };
  }, [mode, repository, id]);

  if (mode === 'demo') {
    return { listing: (demoCatalog ?? []).find((item) => item.id === id), ready: true, error: null };
  }
  // An owner editing their own paused listing reads it from the account snapshot without a round trip.
  const own = ownListings.find((item) => item.id === id);
  return own ? { listing: own, ready: true, error: null } : state;
}

export function useFavoriteListings(): { listings: Listing[]; ready: boolean; error: string | null } {
  const { mode, demoCatalog, favoriteIds } = useMarketplace();
  const repository = useCatalogRepository();
  const [state, setState] = useState<{ listings: Listing[]; ready: boolean; error: string | null }>({ listings: [], ready: false, error: null });
  const key = favoriteIds.join(',');

  useEffect(() => {
    if (mode === 'demo' || !repository) return;
    let cancelled = false;
    setState((current) => ({ ...current, ready: favoriteIds.length === 0, error: null }));
    repository.byIds(favoriteIds, passthrough)
      .then((listings) => { if (!cancelled) setState({ listings, ready: true, error: null }); })
      .catch((error) => { if (!cancelled) setState({ listings: [], ready: true, error: error instanceof Error ? error.message : String(error) }); });
    return () => { cancelled = true; };
    // favoriteIds is rebuilt on every toggle, so the joined key is the stable dependency.
  }, [mode, repository, key]);

  const visible = (mode === 'demo' ? (demoCatalog ?? []) : state.listings)
    .filter((item) => favoriteIds.includes(item.id) && item.status === 'active' && (!item.moderationStatus || item.moderationStatus === 'approved'));
  return { listings: visible, ready: mode === 'demo' ? true : state.ready, error: mode === 'demo' ? null : state.error };
}

export function useMapView(bbox: BoundingBox | null, zoom: number, filters: ListingFilters): { view: MapView; ready: boolean } {
  const { mode, demoCatalog } = useMarketplace();
  const repository = useCatalogRepository();
  const [view, setView] = useState<MapView>({ mode: 'points', items: [] });
  const [ready, setReady] = useState(false);
  const latest = useRef(0);

  const box = bbox ? `${bbox.west},${bbox.south},${bbox.east},${bbox.north}` : '';
  useEffect(() => {
    if (mode === 'demo' || !repository || !bbox) return;
    const mine = ++latest.current;
    setReady(false);
    repository.mapView(bbox, zoom, filters, passthrough)
      .then((next) => { if (mine === latest.current) { setView(next); setReady(true); } })
      .catch(() => { if (mine === latest.current) setReady(true); });
  }, [mode, repository, box, zoom, filters]);

  if (mode === 'demo') {
    const items = filterListings(demoCatalog ?? [], filters)
      .filter((item) => item.mapLocation)
      .map((item) => ({ id: item.id, price: item.price, ...item.mapLocation! }));
    return { view: { mode: 'points', items }, ready: true };
  }
  return { view, ready };
}
