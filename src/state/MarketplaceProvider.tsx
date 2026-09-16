import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { demoListings } from '../domain/demo';
import type { Listing, ListingDraft, ListingStatus } from '../domain/listings';
import {
  createMarketplaceController,
  type MarketplaceController,
} from './marketplaceStore';

export interface MarketplaceContextValue {
  ready: boolean;
  storageError: string | null;
  listings: Listing[];
  favoriteIds: string[];
  toggleFavorite(id: string): Promise<void>;
  saveListing(draft: ListingDraft, existingId?: string): Promise<string>;
  setStatus(id: string, status: ListingStatus): Promise<void>;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: PropsWithChildren) {
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
      toggleFavorite: controller.toggleFavorite,
      saveListing: controller.saveListing,
      setStatus: controller.setStatus,
    }),
    [controller, state],
  );

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
