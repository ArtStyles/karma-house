import {isUuid} from '../messaging/domain.ts';
import { validateDraft, type Listing, type ListingDraft, type ListingStatus } from '../domain/listings.ts';

export type SaveModeration = 'draft' | 'pending';
export type ReviewDecision = 'approved' | 'rejected';
/**
 * The connected catalogue is paginated by src/catalog, so a session snapshot carries only
 * what belongs to the account: no screen holds a complete listing array any more.
 */
export interface RemoteCatalogSnapshot {
  ownListings: Listing[];
  favoriteIds: string[];
}
export interface RemoteMarketplaceState extends RemoteCatalogSnapshot {
  ready: boolean;
  storageError: string | null;
  sessionUserId: string | null;
  moderationQueue: Listing[];
}
export interface RemoteMarketplaceRepository {
  load(ownerId: string | null, checkpoint: () => void): Promise<RemoteCatalogSnapshot>;
  resolvePropertyAlias?(id:string,checkpoint:()=>void):Promise<string>;
  save(draft: ListingDraft, ownerId: string, current: Listing | undefined, moderation: SaveModeration, checkpoint: () => void): Promise<Listing>;
  setFavorite(ownerId: string, listingId: string, favorite: boolean, checkpoint: () => void): Promise<void>;
  setStatus(id: string, status: ListingStatus, checkpoint: () => void): Promise<void>;
  submit(id: string, checkpoint: () => void): Promise<void>;
  loadModerationQueue(checkpoint: () => void): Promise<Listing[]>;
  review(id: string, decision: ReviewDecision, note: string, version: number, checkpoint: () => void): Promise<void>;
}

export function emptyRemoteState(userId: string | null = null): RemoteMarketplaceState {
  return { ready: false, storageError: null, sessionUserId: userId, ownListings: [], favoriteIds: [], moderationQueue: [] };
}

export function createRemoteMarketplaceController(repository: RemoteMarketplaceRepository) {
  let state = emptyRemoteState();
  let userId: string | null = null;
  let isAdmin = false;
  let generation = 0;
  let refreshSequence = 0;
  let reviewSequence = 0;
  let mutationQueue: Promise<void> = Promise.resolve();
  let favoriteAliases=new Map<string,string>();
  let resolvedHearts=new Set<string>();
  const canonicalFrom=(id:string,aliases:ReadonlyMap<string,string>)=>{const seen=new Set<string>();while(aliases.has(id)){if(seen.has(id))throw Error('El servidor devolvió un enlace de vivienda no válido.');seen.add(id);id=aliases.get(id)!}return id};
  const canonicalFavoriteId=(id:string)=>canonicalFrom(id,favoriteAliases);
  const resolveFavorites=async(extra:string[],checkpoint:()=>void)=>{
    checkpoint();const ids=[...new Set([...state.favoriteIds,...extra])],resolved=new Map(favoriteAliases);
    for(let start=0;start<ids.length;start+=50){
      const pairs=await Promise.all(ids.slice(start,start+50).map(async id=>{const canonical=repository.resolvePropertyAlias?await repository.resolvePropertyAlias(id,checkpoint):id;checkpoint();if(repository.resolvePropertyAlias&&!isUuid(canonical))throw Error('El servidor devolvió un enlace de vivienda no válido.');return [id,canonical] as const}));
      for(const [id,canonical]of pairs)if(id!==canonical)resolved.set(id,canonical);
    }
    checkpoint();for(const id of resolved.keys())canonicalFrom(id,resolved);
    favoriteAliases=resolved;refreshSequence+=1;
    const favoriteIds=[...new Set(state.favoriteIds.map(canonicalFavoriteId))];
    publish({...state,favoriteIds});return favoriteIds;
  };
  const listeners = new Set<() => void>();
  const publish = (next: RemoteMarketplaceState) => { state = next; listeners.forEach((listener) => listener()); };
  const checkpointFor = (epoch: number) => () => {
    if (epoch !== generation) throw new Error('La sesión cambió. Vuelve a abrir el anuncio con tu cuenta actual.');
  };
  const reportError = (error: unknown, epoch: number) => {
    if (epoch === generation) publish({ ...state, ready: true, storageError: remoteErrorMessage(error) });
  };

  const refresh = async (): Promise<void> => {
    const epoch = generation;
    const sequence = ++refreshSequence;
    const checkpoint = checkpointFor(epoch);
    try {
      const result = await repository.load(userId, checkpoint);
      if (epoch !== generation || sequence !== refreshSequence) return;
      resolvedHearts.clear();
      publish({ ...state, ...result, favoriteIds:[...new Set(result.favoriteIds.map(canonicalFavoriteId))], ready: true, storageError: null });
    } catch (error) {
      if (epoch !== generation || sequence !== refreshSequence) return;
      reportError(error, epoch);
      throw new Error(remoteErrorMessage(error));
    }
  };

  const enqueue = <T>(operation: (ownerId: string, checkpoint: () => void) => Promise<T>,report=true): Promise<T> => {
    const epoch = generation;
    const capturedUserId = userId;
    const checkpoint = checkpointFor(epoch);
    const result = mutationQueue.then(async () => {
      try {
        checkpoint();
        if (!capturedUserId) throw new Error('Inicia sesión para guardar favoritos o publicar anuncios.');
        const value = await operation(capturedUserId, checkpoint);
        checkpoint();
        return value;
      } catch (error) { if(report)reportError(error, epoch); throw new Error(remoteErrorMessage(error)); }
    });
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const requireOwn = (id: string, ownerId: string): Listing => {
    const listing = state.ownListings.find((item) => item.id === id && item.ownerId === ownerId);
    if (!listing) throw new Error('Solo puedes modificar los anuncios de tu cuenta.');
    return listing;
  };

  const loadModerationQueue = async (): Promise<void> => {
    const epoch = generation;
    const sequence = ++reviewSequence;
    const checkpoint = checkpointFor(epoch);
    try {
      if (!userId || !isAdmin) throw new Error('Necesitas una cuenta administradora para revisar anuncios.');
      const result = await repository.loadModerationQueue(checkpoint);
      if (epoch !== generation || sequence !== reviewSequence) return;
      publish({ ...state, moderationQueue: result, storageError: null });
    } catch (error) {
      if (epoch !== generation || sequence !== reviewSequence) return;
      reportError(error, epoch); throw new Error(remoteErrorMessage(error));
    }
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    setSession(nextUserId: string | null, nextAdmin: boolean) {
      if (userId === nextUserId && isAdmin === nextAdmin) return;
      userId = nextUserId; isAdmin = nextAdmin; generation += 1;favoriteAliases=new Map();resolvedHearts=new Set();
      refreshSequence += 1; reviewSequence += 1;
      // A new account must never wait behind another account's pending network request.
      mutationQueue = Promise.resolve();
      publish(emptyRemoteState(userId));
    },
    refresh,
    invalidateListingManagement(ids:readonly string[]) {
      generation += 1; refreshSequence += 1; reviewSequence += 1;
      mutationQueue = Promise.resolve();
      publish({...state,ownListings:state.ownListings.filter(row=>!ids.includes(row.id)),moderationQueue:state.moderationQueue.filter(row=>!ids.includes(row.id))});
      return refresh();
    },
    isOwnListing: (listing: Listing) => !!userId && listing.owner === 'remote' && listing.ownerId === userId,
    canonicalFavoriteId,
    favoriteMembership(id:string):boolean|null {
      return resolvedHearts.has(id)?state.favoriteIds.includes(canonicalFavoriteId(id)):null;
    },
    prepareFavoriteHeart(id:string) {
      resolvedHearts.delete(id);
      publish({...state});
      return enqueue(async(_ownerId,checkpoint)=>{
        await resolveFavorites([id],checkpoint);checkpoint();
        resolvedHearts.add(id);publish({...state});
      },false);
    },
    normalizeFavoriteIds(externalCheckpoint:()=>void=()=>{}) {
      return enqueue(async(_ownerId,checkpoint)=>resolveFavorites([],()=>{checkpoint();externalCheckpoint()}),false);
    },
    toggleFavorite(id: string, intendedFavorite?:boolean) {
      return enqueue(async (ownerId, checkpoint) => {
        await resolveFavorites([id],checkpoint);checkpoint();id=canonicalFavoriteId(id);
        const favorite = intendedFavorite ?? !state.favoriteIds.includes(id);
        await repository.setFavorite(ownerId, id, favorite, checkpoint); checkpoint();
        refreshSequence += 1;
        publish({ ...state, storageError: null, favoriteIds: favorite ? [...new Set([...state.favoriteIds, id])] : state.favoriteIds.filter((value) => value !== id) });
      });
    },
    saveListing(draft: ListingDraft, id?: string, moderation: SaveModeration = 'pending') {
      return enqueue(async (ownerId, checkpoint) => {
        const validation = validateDraft(draft);
        if (!validation.ok) throw new Error(Object.values(validation.errors).join(' '));
        if (!draft.clientRequestId) throw new Error('Falta el identificador estable del borrador. Vuelve a abrir el formulario.');
        const current = id ? requireOwn(id, ownerId) : undefined;
        const listing = await repository.save(draft, ownerId, current, moderation, checkpoint); checkpoint();
        const ownListings = [...state.ownListings.filter((item) => item.id !== listing.id), listing];
        // Invalidate refreshes started before this save so they cannot restore stale moderation.
        refreshSequence += 1;
        publish({ ...state, ready: true, storageError: null, ownListings });
        return listing.id;
      });
    },
    setStatus(id: string, status: ListingStatus) {
      return enqueue(async (ownerId, checkpoint) => {
        requireOwn(id, ownerId);
        if (!['active', 'paused', 'sold'].includes(status)) throw new Error('El estado no es válido.');
        await repository.setStatus(id, status, checkpoint); checkpoint();
        await refresh(); checkpoint();
      });
    },
    submitForReview(id: string) {
      return enqueue(async (ownerId, checkpoint) => {
        requireOwn(id, ownerId);
        await repository.submit(id, checkpoint); checkpoint();
        await refresh(); checkpoint();
      });
    },
    loadModerationQueue,
    reviewListing(id: string, decision: ReviewDecision, note: string, version: number, refreshLegacyQueue = true) {
      return enqueue(async (_ownerId, checkpoint) => {
        if (!isAdmin) throw new Error('Necesitas una cuenta administradora para revisar anuncios.');
        if (decision === 'rejected' && !note.trim()) throw new Error('Indica el motivo del rechazo.');
        await repository.review(id, decision, note.trim(), version, checkpoint); checkpoint();
        await Promise.all([refresh(), ...(refreshLegacyQueue ? [loadModerationQueue()] : [])]); checkpoint();
      });
    },
  };
}

export function remoteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message :
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/KH_ACCOUNT_SUSPENDED/.test(message)) return 'Tu cuenta está suspendida. No puedes publicar ni modificar anuncios.';
  if (/KH_VERSION_CONFLICT/.test(message)) return 'Este anuncio cambió en otra sesión. Actualiza el catálogo y vuelve a abrirlo antes de guardar.';
  if (/KH_REQUEST_CONFLICT/.test(message)) return 'Este borrador ya se envió con otros datos. Actualiza Mis anuncios y edita la propiedad guardada.';
  if (/KH_ACCOUNT_CHANGED/.test(message)) return 'La sesión cambió. Vuelve a abrir el formulario con tu cuenta actual.';
  if (/KH_INVALID_MAP_LOCATION/.test(message)) return 'La ubicación del mapa no es válida. Vuelve a seleccionar el punto de la vivienda.';
  if (/failed to fetch|fetch failed|network request failed|networkerror|network error|load failed|timed?\s*out|timeout/i.test(message) ||
    (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
    return 'No se pudo completar la conexión con KarmaHouse. Comprueba tu conexión a Internet e inténtalo de nuevo.';
  }
  return message || 'No se pudo completar la conexión con el catálogo. Inténtalo de nuevo.';
}
