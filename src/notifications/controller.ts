import type { MessagingRequestContext } from '../messaging/types.ts';
import { compareNotificationSequence, notificationErrorMessage } from './domain.ts';
import type { AppNotification, NotificationPreferences, NotificationRepository, NotificationSummary } from './types.ts';

export interface NotificationListState {
  items: AppNotification[];
  nextCursor: string | null;
  unreadOnly: boolean;
  ready: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}
export interface NotificationsState {
  userId: string | null;
  unreadCount: number;
  readThrough: string;
  summaryReady: boolean;
  summaryLoading: boolean;
  summaryError: string | null;
  list: NotificationListState;
  marking: string | null;
  mutationError: string | null;
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  preferencesError: string | null;
  savingPreferences: boolean;
}
type PreferencesInput = Parameters<NotificationRepository['savePreferences']>[0];
type RequestKind = 'summary' | 'list' | 'preferences' | 'write' | 'mark';
const emptyList = (unreadOnly = false): NotificationListState => ({ items: [], nextCursor: null, unreadOnly, ready: false, loading: false, loadingMore: false, error: null });
export const emptyNotificationsState = (userId: string | null = null): NotificationsState => ({
  userId, unreadCount: 0, readThrough: '0', summaryReady: false, summaryLoading: false, summaryError: null,
  list: emptyList(), marking: null, mutationError: null, preferences: null, preferencesLoading: false,
  preferencesError: null, savingPreferences: false,
});

export function createNotificationsController(repository: NotificationRepository) {
  let state = emptyNotificationsState();
  let accessToken: string | null = null;
  let epoch = 0;
  let disposed = false;
  let summaryVersion = 0;
  let listVersion = 0;
  let preferencesVersion = 0;
  let markVersion = 0;
  let countRequest = 0;
  let countApplied = 0;
  let loadedPages = 0;
  const requests = new Map<AbortController, RequestKind>();
  const listeners = new Set<() => void>();

  function publish(patch: Partial<NotificationsState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function abort(kind?: RequestKind) {
    for (const [controller, requestKind] of requests) {
      if (!kind || requestKind === kind) { controller.abort(); requests.delete(controller); }
    }
  }
  function context(kind: RequestKind, expectedActor?: string) {
    const userId = state.userId;
    const token = accessToken;
    const capturedEpoch = epoch;
    if (disposed || !userId || !token || expectedActor !== undefined && expectedActor !== userId) throw new Error('KH_ACCOUNT_CHANGED');
    const controller = new AbortController();
    requests.set(controller, kind);
    return {
      userId, accessToken: token, signal: controller.signal,
      checkpoint() {
        if (disposed || controller.signal.aborted || capturedEpoch !== epoch || state.userId !== userId) throw new Error('KH_ACCOUNT_CHANGED');
      },
      release() { requests.delete(controller); },
    } satisfies MessagingRequestContext & { release(): void };
  }
  function applySummary(summary: NotificationSummary, requestNumber: number) {
    if (requestNumber < countApplied) return;
    countApplied = requestNumber;
    publish({ unreadCount: summary.unreadCount, readThrough: summary.readThrough, summaryReady: true, summaryError: null });
  }
  function invalidateReadResults() {
    summaryVersion++;
    listVersion++;
    abort('summary');
    abort('list');
    publish({ summaryLoading: false, list: { ...state.list, loading: false, loadingMore: false } });
  }

  async function refreshSummary(expectedActor?: string) {
    if (!state.userId || !accessToken || disposed || state.summaryLoading || state.marking) return;
    const ctx = context('summary', expectedActor);
    const capturedEpoch = epoch;
    const version = ++summaryVersion;
    const requestNumber = ++countRequest;
    publish({ summaryLoading: true, summaryError: null });
    try {
      const result = await repository.summary(ctx);
      ctx.checkpoint();
      if (version !== summaryVersion) return;
      applySummary(result, requestNumber);
    } catch (error) {
      if (!disposed && epoch === capturedEpoch && version === summaryVersion) publish({ summaryReady: true, summaryError: notificationErrorMessage(error) });
    } finally {
      ctx.release();
      if (!disposed && epoch === capturedEpoch && version === summaryVersion) publish({ summaryLoading: false });
    }
  }

  async function loadList(more: boolean, expectedActor?: string) {
    if (!state.userId || !accessToken || disposed || state.marking || state.list.loading || state.list.loadingMore) return;
    if (more && (!state.list.ready || !state.list.nextCursor)) return;
    const ctx = context('list', expectedActor);
    const capturedEpoch = epoch;
    const version = ++listVersion;
    const requestNumber = ++countRequest;
    const options = { unreadOnly: state.list.unreadOnly, ...(more ? { beforeSeq: state.list.nextCursor! } : {}) };
    publish({ list: { ...state.list, loading: !more, loadingMore: more, error: null } });
    try {
      const result = await repository.list(options, ctx);
      ctx.checkpoint();
      if (version !== listVersion) return;
      if (result.items.some(item => item.recipientId !== ctx.userId)) throw new Error('KH_NOTIFICATION_INVALID');
      const merged = new Map((more ? state.list.items : []).map(item => [item.id, item]));
      for (const item of result.items) merged.set(item.id, item);
      loadedPages = more ? loadedPages + 1 : 1;
      publish({ list: { ...state.list, items: [...merged.values()], nextCursor: result.nextCursor, ready: true, error: null }, mutationError: null });
      applySummary(result, requestNumber);
    } catch (error) {
      if (!disposed && epoch === capturedEpoch && version === listVersion) publish({ list: { ...state.list, ready: true, error: notificationErrorMessage(error) } });
    } finally {
      ctx.release();
      if (!disposed && epoch === capturedEpoch && version === listVersion) publish({ list: { ...state.list, loading: false, loadingMore: false } });
    }
  }

  async function mark(kind: string, actorId: string, matches: (item: AppNotification) => boolean, operation: (ctx: MessagingRequestContext) => Promise<{ unreadCount: number }>) {
    const ctx = context('mark', actorId);
    const capturedEpoch = epoch;
    if (state.marking) { ctx.release(); throw new Error('Espera a que termine el marcado actual.'); }
    const version = ++markVersion;
    invalidateReadResults();
    const requestNumber = ++countRequest;
    publish({ marking: kind, mutationError: null });
    try {
      const result = await operation(ctx);
      ctx.checkpoint();
      const readAt = new Date().toISOString();
      const updated = state.list.items.map(item => matches(item) && !item.readAt ? { ...item, readAt } : item);
      countApplied = requestNumber;
      publish({ unreadCount: result.unreadCount, summaryReady: true, summaryError: null,
        list: { ...state.list, items: state.list.unreadOnly ? updated.filter(item => !item.readAt) : updated },
      });
    } catch (error) {
      if (!disposed && epoch === capturedEpoch && version === markVersion) publish({ mutationError: notificationErrorMessage(error) });
      throw error;
    } finally {
      ctx.release();
      if (!disposed && epoch === capturedEpoch && version === markVersion) publish({ marking: null });
    }
  }

  async function loadPreferences(expectedActor?: string) {
    if (!state.userId || !accessToken || disposed || state.preferencesLoading || state.savingPreferences) return;
    const ctx = context('preferences', expectedActor);
    const capturedEpoch = epoch;
    const version = ++preferencesVersion;
    publish({ preferencesLoading: true, preferencesError: null });
    try {
      const result = await repository.preferences(ctx);
      ctx.checkpoint();
      if (version === preferencesVersion) publish({ preferences: result, preferencesError: null });
    } catch (error) {
      if (!disposed && epoch === capturedEpoch && version === preferencesVersion) publish({ preferencesError: notificationErrorMessage(error) });
    } finally {
      ctx.release();
      if (!disposed && epoch === capturedEpoch && version === preferencesVersion) publish({ preferencesLoading: false });
    }
  }

  async function savePreferences(input: PreferencesInput, actorId: string) {
    const ctx = context('write', actorId);
    const capturedEpoch = epoch;
    if (state.savingPreferences) { ctx.release(); throw new Error('Espera a que se guarden las preferencias.'); }
    preferencesVersion++;
    abort('preferences');
    publish({ savingPreferences: true, preferencesLoading: false, preferencesError: null });
    try {
      const result = await repository.savePreferences({ ...input }, ctx);
      ctx.checkpoint();
      publish({ preferences: result, preferencesError: null });
      return result;
    } catch (error) {
      if (!disposed && epoch === capturedEpoch) publish({ preferencesError: notificationErrorMessage(error) });
      throw error;
    } finally {
      ctx.release();
      if (!disposed && epoch === capturedEpoch) publish({ savingPreferences: false });
    }
  }

  return {
    getState: () => state,
    getSessionKey: () => epoch,
    assertSession(actorId: string, sessionKey: number) {
      if (disposed || state.userId !== actorId || epoch !== sessionKey) throw new Error('KH_ACCOUNT_CHANGED');
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession(userId: string | null, token: string | null) {
      disposed = false;
      if (state.userId === userId && (token !== null || accessToken === null)) { accessToken = token; return; }
      epoch++; summaryVersion++; listVersion++; preferencesVersion++; abort();
      accessToken = token; loadedPages = 0; countRequest = 0; countApplied = 0;
      state = emptyNotificationsState(userId); publish({});
    },
    refreshSummary,
    refreshList: (actorId?: string) => loadList(false, actorId),
    autoRefreshList: (actorId?: string) => loadedPages > 1 ? Promise.resolve() : loadList(false, actorId),
    loadMore: (actorId?: string) => loadList(true, actorId),
    pauseList(actorId?: string) {
      if (actorId !== undefined && actorId !== state.userId) return;
      listVersion++; abort('list');
      publish({ list: { ...state.list, loading: false, loadingMore: false } });
    },
    async invalidateAfterBlockChange(actorId: string) {
      const ctx = context('write', actorId); ctx.release();
      summaryVersion++; listVersion++; markVersion++;
      abort('summary'); abort('list'); abort('mark'); loadedPages = 0;
      publish({ list: emptyList(state.list.unreadOnly), unreadCount: 0, readThrough: '0',
        summaryReady: false, summaryLoading: false, summaryError: null, marking: null, mutationError: null });
      await refreshSummary(actorId);
    },
    setUnreadOnly(unreadOnly: boolean, actorId?: string) {
      if (actorId !== undefined && actorId !== state.userId) return;
      if (unreadOnly === state.list.unreadOnly) return;
      listVersion++; abort('list'); loadedPages = 0;
      publish({ list: emptyList(unreadOnly), mutationError: null });
    },
    markRead: (id: string, actorId: string) => mark(id, actorId, item => item.id === id, ctx => repository.markRead(id, ctx)),
    markAllRead: (cutoff: string, actorId: string) => mark('all', actorId, item => compareNotificationSequence(item.seq, cutoff) <= 0, ctx => repository.markAllRead(cutoff, ctx)),
    loadPreferences, savePreferences,
    dispose() {
      epoch++; summaryVersion++; listVersion++; preferencesVersion++; abort();
      disposed = true; accessToken = null; loadedPages = 0;
      state = emptyNotificationsState();
    },
  };
}
