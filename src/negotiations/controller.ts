import type { MessagingRequestContext } from '../messaging/types.ts';
import type { CreateNegotiationInput, Negotiation, NegotiationListOptions, NegotiationRepository, RespondNegotiationInput } from './types.ts';

export interface NegotiationsState {
  userId: string | null; items: Negotiation[]; ready: boolean; loading: boolean; loadingMore: boolean;
  mutating: boolean; hasMore: boolean; error: string | null;
}
export const emptyNegotiationsState = (userId: string | null = null): NegotiationsState => ({ userId, items: [], ready: false, loading: false, loadingMore: false, mutating: false, hasMore: false, error: null });
const PAGE_SIZE = 30;

export function createNegotiationsController(repository: NegotiationRepository, query: Omit<NegotiationListOptions,'offset'> = {}) {
  let state = emptyNegotiationsState(), token: string | null = null, epoch = 0, readVersion = 0, offset = 0, disposed = false;
  const listeners = new Set<() => void>(), reads = new Set<AbortController>(), requests = new Set<AbortController>();
  const publish = (patch: Partial<NegotiationsState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const invalidateReads = () => { readVersion++; for (const controller of reads) controller.abort(); reads.clear(); };
  function context(expectedActor?: string): MessagingRequestContext & { release(): void; controller: AbortController } {
    const userId = state.userId, accessToken = token, capturedEpoch = epoch;
    if (disposed || !userId || !accessToken || expectedActor && expectedActor !== userId) throw new Error('La sesión cambió. Abre de nuevo tus solicitudes.');
    const controller = new AbortController(); requests.add(controller);
    return { userId, accessToken, signal: controller.signal, controller,
      checkpoint() { if (disposed || controller.signal.aborted || capturedEpoch !== epoch || state.userId !== userId) throw new Error('La sesión cambió. Abre de nuevo tus solicitudes.'); },
      release() { requests.delete(controller); reads.delete(controller); },
    };
  }
  async function load(more: boolean): Promise<void> {
    if (!state.userId || !token || disposed || state.mutating || more && (state.loading || state.loadingMore || !state.hasMore)) return;
    invalidateReads();
    const generation = readVersion, capturedEpoch = epoch, requestOffset = more ? offset : 0;
    const ctx = context(); reads.add(ctx.controller);
    publish({ loading: !more, loadingMore: more, error: null });
    try {
      const items = await repository.list({ ...query, offset: requestOffset },ctx); ctx.checkpoint();
      if (generation !== readVersion) return;
      const merged = new Map((more ? state.items : []).map(item => [item.id,item]));
      for (const item of items) merged.set(item.id,item);
      offset = requestOffset + items.length;
      publish({ items: [...merged.values()], ready: true, hasMore: items.length === PAGE_SIZE, error: null });
    } catch {
      if (capturedEpoch === epoch && generation === readVersion && !disposed) publish({ ready: true, error: 'No pudimos actualizar las solicitudes. Comprueba la conexión y vuelve a intentarlo.' });
    } finally {
      ctx.release();
      if (capturedEpoch === epoch && generation === readVersion && !disposed) publish({ loading: false, loadingMore: false });
    }
  }
  async function mutate(operation: (ctx: MessagingRequestContext) => Promise<Negotiation>, actorId: string): Promise<Negotiation> {
    const ctx = context(actorId), capturedEpoch = epoch;
    let confirmed = false;
    if (state.mutating) { ctx.release(); throw new Error('Espera a que termine la solicitud actual.'); }
    invalidateReads(); publish({ mutating: true, loading: false, loadingMore: false, error: null });
    try {
      const result = await operation(ctx); ctx.checkpoint();
      invalidateReads();
      const remaining = state.items.filter(item => item.id !== result.id && !(query.pendingOnly && item.id === result.parentId))
        .map(item => item.id === result.parentId && item.status === 'pending' ? { ...item,status:'superseded' as const,version:item.version+1,updatedAt:result.createdAt } : item);
      const visible = !query.pendingOnly || result.status === 'pending';
      publish({ items: visible ? [result,...remaining] : remaining, ready: true });
      confirmed = true;
      return result;
    } finally {
      ctx.release();
      if (capturedEpoch === epoch && !disposed) {
        publish({ mutating: false });
        // A confirmed write resolves immediately; resync failure never changes its successful outcome.
        if (confirmed) void load(false);
      }
    }
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getState: () => state,
    setSession(userId: string | null, accessToken: string | null) {
      disposed = false;
      if (state.userId !== userId || !accessToken && !!token) {
        epoch++; invalidateReads(); for (const controller of requests) controller.abort(); requests.clear(); offset = 0;
        state = emptyNegotiationsState(userId); token = accessToken; publish({});
      } else token = accessToken;
    },
    refresh: () => load(false), autoRefresh: () => offset > PAGE_SIZE || state.loading || state.loadingMore || state.mutating ? Promise.resolve() : load(false), loadMore: () => load(true),
    create: (input: CreateNegotiationInput, actorId: string) => mutate(ctx => repository.create({ ...input },ctx),actorId),
    respond: (input: RespondNegotiationInput, actorId: string) => mutate(ctx => repository.respond({ ...input },ctx),actorId),
    dispose() { epoch++; disposed = true; invalidateReads(); for (const controller of requests) controller.abort(); requests.clear(); token = null; state = emptyNegotiationsState(); },
  };
}
