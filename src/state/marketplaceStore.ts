import {
  createListing,
  isSupportedPhotoUri,
  updateListing,
  validateDraft,
  type Listing,
  type ListingDraft,
  type ListingStatus,
} from '../domain/listings.ts';

export const MARKETPLACE_STORAGE_KEY = '@karma-house/marketplace-v1';

export interface MarketplaceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface MarketplaceSnapshot {
  version: 1;
  localListings: Listing[];
  favoriteIds: string[];
}

export interface MarketplaceState {
  ready: boolean;
  storageError: string | null;
  listings: Listing[];
  favoriteIds: string[];
}

export interface MarketplaceController {
  getState(): MarketplaceState;
  subscribe(listener: (state: MarketplaceState) => void): () => void;
  hydrate(): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  saveListing(draft: ListingDraft, existingId?: string): Promise<string>;
  setStatus(id: string, status: ListingStatus): Promise<void>;
}

export interface MarketplaceControllerOptions {
  storage: MarketplaceStorage;
  demoListings: Listing[];
  storageKey?: string;
  idFactory?: () => string;
  now?: () => string;
}

export interface DecodedMarketplaceSnapshot {
  snapshot: MarketplaceSnapshot;
  issue: string | null;
}

const EMPTY_SNAPSHOT: MarketplaceSnapshot = {
  version: 1,
  localListings: [],
  favoriteIds: [],
};

export function decodeMarketplaceSnapshot(raw: string | null): DecodedMarketplaceSnapshot {
  if (raw === null) return { snapshot: cloneSnapshot(EMPTY_SNAPSHOT), issue: null };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      snapshot: cloneSnapshot(EMPTY_SNAPSHOT),
      issue: 'No se pudieron leer los datos guardados. Se usó un estado seguro.',
    };
  }

  if (!isRecord(value) || value.version !== 1) {
    return {
      snapshot: cloneSnapshot(EMPTY_SNAPSHOT),
      issue: 'El formato de los datos guardados no es compatible. Se usó un estado seguro.',
    };
  }

  let foundInvalidData = false;
  const localListings: Listing[] = [];
  const localListingIds = new Set<string>();
  if (Array.isArray(value.localListings)) {
    for (const candidate of value.localListings) {
      const listing = readLocalListing(candidate);
      if (!listing || localListingIds.has(listing.id)) {
        foundInvalidData = true;
        continue;
      }
      localListingIds.add(listing.id);
      localListings.push(listing);
    }
  } else {
    foundInvalidData = true;
  }

  const favoriteIds: string[] = [];
  if (Array.isArray(value.favoriteIds)) {
    for (const candidate of value.favoriteIds) {
      if (typeof candidate !== 'string' || candidate.trim() === '') {
        foundInvalidData = true;
        continue;
      }
      const id = candidate.trim();
      if (!favoriteIds.includes(id)) favoriteIds.push(id);
    }
  } else {
    foundInvalidData = true;
  }

  return {
    snapshot: { version: 1, localListings, favoriteIds },
    issue: foundInvalidData
      ? 'Se ignoraron datos inválidos del almacenamiento y se conservaron los campos válidos.'
      : null,
  };
}

export function createMarketplaceController(
  options: MarketplaceControllerOptions,
): MarketplaceController {
  const storageKey = options.storageKey ?? MARKETPLACE_STORAGE_KEY;
  const demoListings = options.demoListings.map(cloneListing);
  const listeners = new Set<(state: MarketplaceState) => void>();
  let snapshot = cloneSnapshot(EMPTY_SNAPSHOT);
  let state: MarketplaceState = buildState(false, null, demoListings, snapshot);
  let hydrationPromise: Promise<void> | null = null;
  let hydrationReadFailed = false;
  let mutationQueue: Promise<void> = Promise.resolve();

  const publish = (next: MarketplaceState): void => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const hydrate = (): Promise<void> => {
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
      try {
        const raw = await options.storage.getItem(storageKey);
        const decoded = decodeMarketplaceSnapshot(raw);
        const demoIds = new Set(demoListings.map((listing) => listing.id));
        const localListings = decoded.snapshot.localListings.filter(
          (listing) => !demoIds.has(listing.id),
        );
        const hasDemoIdCollision = localListings.length !== decoded.snapshot.localListings.length;
        snapshot = { ...decoded.snapshot, localListings };
        hydrationReadFailed = false;
        const hydrationIssue = [
          decoded.issue,
          hasDemoIdCollision
            ? 'Se ignoraron anuncios locales con identificadores en colisión con el catálogo demo.'
            : null,
        ]
          .filter(Boolean)
          .join(' ');
        publish(buildState(true, hydrationIssue || null, demoListings, snapshot));
      } catch (error) {
        snapshot = cloneSnapshot(EMPTY_SNAPSHOT);
        hydrationReadFailed = true;
        publish(buildState(true, errorMessage(error), demoListings, snapshot));
      }
    })();
    return hydrationPromise;
  };

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(async () => {
      await hydrate();
      if (hydrationReadFailed) {
        hydrationPromise = null;
        await hydrate();
        if (hydrationReadFailed) {
          throw new Error(state.storageError ?? 'No se pudo leer el almacenamiento.');
        }
      }
      return operation();
    });
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const persist = async (nextSnapshot: MarketplaceSnapshot): Promise<void> => {
    try {
      await options.storage.setItem(storageKey, JSON.stringify(nextSnapshot));
    } catch (error) {
      publish({ ...state, storageError: errorMessage(error) });
      throw error;
    }
    snapshot = cloneSnapshot(nextSnapshot);
    publish(buildState(true, null, demoListings, snapshot));
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    toggleFavorite(id) {
      return enqueue(async () => {
        const normalizedId = id.trim();
        if (!normalizedId) throw new Error('El identificador del favorito no es válido.');
        const favoriteIds = snapshot.favoriteIds.includes(normalizedId)
          ? snapshot.favoriteIds.filter((favoriteId) => favoriteId !== normalizedId)
          : [...snapshot.favoriteIds, normalizedId];
        await persist({ ...snapshot, favoriteIds });
      });
    },
    saveListing(draft, existingId) {
      return enqueue(async () => {
        let listing: Listing;
        if (existingId !== undefined) {
          const current = snapshot.localListings.find((item) => item.id === existingId);
          if (!current) {
            const demo = demoListings.find((item) => item.id === existingId);
            if (demo) throw new Error('Solo puedes editar anuncios locales.');
            throw new Error('No se encontró el anuncio local que deseas editar.');
          }
          listing = updateListing(current, draft);
        } else {
          const id = (options.idFactory?.() ?? createControllerId()).trim();
          if (
            !id ||
            snapshot.localListings.some((item) => item.id === id) ||
            demoListings.some((item) => item.id === id)
          ) {
            throw new Error('No se pudo generar un identificador único para el anuncio.');
          }
          listing = createListing(draft, { id, now: options.now?.() });
        }

        const localListings = existingId
          ? snapshot.localListings.map((item) => (item.id === existingId ? listing : item))
          : [...snapshot.localListings, listing];
        await persist({ ...snapshot, localListings });
        return listing.id;
      });
    },
    setStatus(id, status) {
      return enqueue(async () => {
        if (!isListingStatus(status)) throw new Error('El estado del anuncio no es válido.');
        const index = snapshot.localListings.findIndex((listing) => listing.id === id);
        if (index < 0) {
          if (demoListings.some((listing) => listing.id === id)) {
            throw new Error('Solo puedes cambiar anuncios locales.');
          }
          throw new Error('No se encontró el anuncio local.');
        }
        const localListings = snapshot.localListings.map((listing, listingIndex) =>
          listingIndex === index ? { ...listing, status } : listing,
        );
        await persist({ ...snapshot, localListings });
      });
    },
  };
}

function buildState(
  ready: boolean,
  storageError: string | null,
  demoListings: Listing[],
  snapshot: MarketplaceSnapshot,
): MarketplaceState {
  return {
    ready,
    storageError,
    listings: [...demoListings.map(cloneListing), ...snapshot.localListings.map(cloneListing)],
    favoriteIds: [...snapshot.favoriteIds],
  };
}

function readLocalListing(value: unknown): Listing | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.location) ||
    !isNonEmptyString(value.province) ||
    !isFiniteWithin(value.price, 0, 100_000_000, true) ||
    !isIntegerWithin(value.bedrooms, 1, 20) ||
    !isIntegerWithin(value.bathrooms, 1, 20) ||
    !isFiniteWithin(value.area, 0, 10_000, true) ||
    (value.type !== 'Casa' && value.type !== 'Apartamento') ||
    !isNonEmptyString(value.description) ||
    !Array.isArray(value.amenities) ||
    !value.amenities.every((item) => typeof item === 'string') ||
    !['vedado', 'interior', 'terrace'].includes(String(value.imageKey)) ||
    value.owner !== 'local' ||
    !isListingStatus(value.status) ||
    !isNonEmptyString(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    (value.photoUri !== undefined &&
      (typeof value.photoUri !== 'string' || !isSupportedPhotoUri(value.photoUri)))
  ) {
    return null;
  }

  const draft: ListingDraft = {
    title: value.title,
    location: value.location,
    province: value.province,
    price: String(value.price),
    bedrooms: String(value.bedrooms),
    bathrooms: String(value.bathrooms),
    area: String(value.area),
    type: value.type,
    description: value.description,
    amenities: value.amenities,
    imageKey: value.imageKey as Listing['imageKey'],
    ...(value.photoUri === undefined ? {} : { photoUri: value.photoUri }),
  };
  if (!validateDraft(draft).ok) return null;

  return {
    id: value.id.trim(),
    title: value.title.trim(),
    location: value.location.trim(),
    province: value.province.trim(),
    price: value.price,
    bedrooms: value.bedrooms,
    bathrooms: value.bathrooms,
    area: value.area,
    type: value.type,
    description: value.description.trim(),
    amenities: [...new Set(value.amenities.map((item) => item.trim()).filter(Boolean))],
    imageKey: value.imageKey as Listing['imageKey'],
    ...(value.photoUri?.trim() ? { photoUri: value.photoUri.trim() } : {}),
    owner: 'local',
    status: value.status,
    createdAt: value.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteWithin(
  value: unknown,
  min: number,
  max: number,
  exclusiveMin = false,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (exclusiveMin ? value > min : value >= min) &&
    value <= max
  );
}

function isIntegerWithin(value: unknown, min: number, max: number): value is number {
  return isFiniteWithin(value, min, max) && Number.isInteger(value);
}

function isListingStatus(value: unknown): value is ListingStatus {
  return value === 'active' || value === 'paused' || value === 'sold';
}

function cloneListing(listing: Listing): Listing {
  return { ...listing, amenities: [...listing.amenities] };
}

function cloneSnapshot(snapshot: MarketplaceSnapshot): MarketplaceSnapshot {
  return {
    version: 1,
    localListings: snapshot.localListings.map(cloneListing),
    favoriteIds: [...snapshot.favoriteIds],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo acceder al almacenamiento.';
}

function createControllerId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
