import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { createSupabaseMarketplaceRepository } from '../data/supabaseMarketplace';
import { demoListings } from '../domain/demo';
import type { Listing, ListingDraft, ListingStatus } from '../domain/listings';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { createRemoteMarketplaceController, emptyRemoteState, type ReviewDecision, type SaveModeration } from './remoteMarketplaceStore';
import {
  createMarketplaceController,
  type MarketplaceController,
} from './marketplaceStore';

export interface MarketplaceContextValue {
  mode: 'demo' | 'cloud';
  ready: boolean;
  storageError: string | null;
  listings: Listing[];
  favoriteIds: string[];
  ownListings: Listing[];
  moderationQueue: Listing[];
  refresh(): Promise<void>;
  isOwnListing(listing: Listing): boolean;
  toggleFavorite(id: string): Promise<void>;
  saveListing(draft: ListingDraft, existingId?: string, moderation?: SaveModeration): Promise<string>;
  setStatus(id: string, status: ListingStatus): Promise<void>;
  submitForReview(id: string): Promise<void>;
  loadModerationQueue(): Promise<void>;
  reviewListing(id: string, decision: ReviewDecision, note: string, version: number): Promise<void>;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: PropsWithChildren) {
  return isSupabaseConfigured ? <CloudMarketplaceProvider>{children}</CloudMarketplaceProvider> :
    <DemoMarketplaceProvider>{children}</DemoMarketplaceProvider>;
}

function DemoMarketplaceProvider({ children }: PropsWithChildren) {
  const controller = useMemo(
    () => createMarketplaceController({ storage: AsyncStorage, demoListings }),
    [],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    void controller.hydrate();
  }, [controller]);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      ...state,
      mode: 'demo',
      ownListings: state.listings.filter((listing) => listing.owner === 'local'),
      moderationQueue: [],
      refresh: controller.hydrate,
      isOwnListing: (listing) => listing.owner === 'local',
      toggleFavorite: controller.toggleFavorite,
      saveListing: controller.saveListing,
      setStatus: controller.setStatus,
      submitForReview: async () => { throw new Error('La revisión está disponible en el catálogo conectado.'); },
      loadModerationQueue: async () => {},
      reviewListing: async () => { throw new Error('La revisión está disponible en el catálogo conectado.'); },
    }),
    [controller, state],
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

function CloudMarketplaceProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const controller = useMemo(() => {
    if (!supabase) throw new Error('No se pudo inicializar la conexión del catálogo.');
    return createRemoteMarketplaceController(createSupabaseMarketplaceRepository(supabase, AsyncStorage));
  }, []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  // Invalidate in-flight reads/writes before the next paint when identity changes.
  useLayoutEffect(() => { controller.setSession(userId, auth.isAdmin); }, [controller, userId, auth.isAdmin]);
  useEffect(() => {
    if (!auth.ready) return;
    const refresh = () => { void controller.refresh().catch(() => {}); };
    refresh();
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [auth.ready, userId, auth.isAdmin, controller]);

  const value = useMemo<MarketplaceContextValue>(() => {
    // React may render the new auth context before the layout effect invalidates the
    // controller. Never expose the previous account's private snapshot in that render.
    const visible = auth.ready && state.sessionUserId === userId ? state : emptyRemoteState(userId);
    return {
      ...visible,
      mode: 'cloud',
      moderationQueue: auth.isAdmin ? visible.moderationQueue : [],
      isOwnListing: (listing) => !!userId && listing.owner === 'remote' && listing.ownerId === userId,
      refresh: controller.refresh,
      toggleFavorite: controller.toggleFavorite,
      saveListing: controller.saveListing,
      setStatus: controller.setStatus,
      submitForReview: controller.submitForReview,
      loadModerationQueue: controller.loadModerationQueue,
      reviewListing: controller.reviewListing,
    };
  }, [auth.ready, auth.isAdmin, userId, state, controller]);

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace(): MarketplaceContextValue {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace debe usarse dentro de MarketplaceProvider.');
  }
  return context;
}

export function createMarketplaceForStorage(
  storage: Parameters<typeof createMarketplaceController>[0]['storage'],
): MarketplaceController {
  return createMarketplaceController({ storage, demoListings });
}

export default MarketplaceProvider;
