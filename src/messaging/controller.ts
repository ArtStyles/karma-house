import type { ChatMessage, Conversation, ConversationHistory, MessagingContextValue, MessagingRepository, MessagingRequestContext, MessagingStorage, PendingMessage, ReportReason } from './types.ts';
import { acknowledgedPending, createMessageId, decodeOutbox, isUuid, MAX_PENDING_MESSAGES, mergeHistoryWindow, MessagingError, messagingErrorMessage, normalizeMessageBody, validateReport } from './domain.ts';

export type MessagingState = Pick<MessagingContextValue, 'ready' | 'userId' | 'conversations' | 'unreadCount' | 'error' | 'pending' | 'histories'>;
export function emptyMessagingState(userId: string | null = null): MessagingState {
  return { userId, ready: !userId, conversations: [], histories: {}, pending: [], unreadCount: 0, error: null };
}
const emptyHistory = (): ConversationHistory => ({ messages: [], hasMore: false, loading: false, error: null });

// Serializes reads and writes even across an A -> B -> A remount with an old write in flight.
const storageQueues = new WeakMap<MessagingStorage, Map<string, Promise<unknown>>>();
function serializedStorage<T>(storage: MessagingStorage, key: string, operation: () => Promise<T>): Promise<T> {
  let queues = storageQueues.get(storage);
  if (!queues) { queues = new Map(); storageQueues.set(storage, queues); }
  const queue = queues;
  const result = (queue.get(key) ?? Promise.resolve()).then(operation, operation);
  queue.set(key, result);
  void result.finally(() => { if (queue.get(key) === result) queue.delete(key); }).catch(() => {});
  return result;
}

interface Scope { userId: string; epoch: number; checkpoint(): void }
interface ControllerOptions { createId?: () => string; now?: () => string }

export function createMessagingController(repository: MessagingRepository, storage: MessagingStorage, options: ControllerOptions = {}) {
  let state = emptyMessagingState();
  let userId: string | null = null;
  let accessToken: string | null = null;
  let epoch = 0;
  let revision = 0;
  let hydrated = false;
  let hydration: Promise<void> | null = null;
  let refreshTask: Promise<void> | null = null;
  let outboxError: string | null = null;
  let outboxDirty = false;
  let outboxQueue: Promise<unknown> = Promise.resolve();
  let sendQueue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const requests = new Set<AbortController>();
  const historyTasks = new Map<string, Promise<void>>();
  const retryTasks = new Map<string, Promise<void>>();
  const historyBusy = new Map<string, number>();
  const readSequences = new Map<string, number>();
  const readRequests = new Map<string, number>();
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.createId ?? createMessageId;
  const publish = (next: MessagingState) => {
    state = { ...next, unreadCount: next.conversations.reduce((total, item) => total + item.unreadCount, 0) };
    listeners.forEach(listener => listener());
  };
  const current = (scope: Scope) => scope.epoch === epoch && scope.userId === userId;
  const scopeForSession = (): Scope => {
    if (!userId || !accessToken) throw new MessagingError('Inicia sesión para abrir tus mensajes.');
    const capturedUserId = userId;
    const capturedEpoch = epoch;
    return { userId: capturedUserId, epoch: capturedEpoch, checkpoint() {
      if (capturedEpoch !== epoch || capturedUserId !== userId) throw new Error('KH_ACCOUNT_CHANGED');
    } };
  };
  const request = async <T>(scope: Scope, operation: (context: MessagingRequestContext) => Promise<T>): Promise<T> => {
    scope.checkpoint();
    if (!accessToken) throw new Error('KH_AUTH_REQUIRED');
    const controller = new AbortController();
    requests.add(controller);
    const context = { userId: scope.userId, accessToken, signal: controller.signal, checkpoint: scope.checkpoint };
    try { const result = await operation(context); scope.checkpoint(); return result; }
    finally { requests.delete(controller); }
  };
  const fail = (error: unknown, scope: Scope, conversationId?: string): MessagingError => {
    const message = messagingErrorMessage(error);
    if (current(scope)) {
      const histories = conversationId ? { ...state.histories, [conversationId]: { ...(state.histories[conversationId] ?? emptyHistory()), error: message } } : state.histories;
      publish({ ...state, histories, ready: true, error: message });
    }
    return new MessagingError(message);
  };
  const keyFor = (owner: string) => `@karma-house/messages/outbox/v1/${owner}`;

  const ensureHydrated = (scope: Scope): Promise<void> => {
    scope.checkpoint();
    if (hydrated) return Promise.resolve();
    if (hydration) return hydration;
    const task = (async () => {
      try {
        const raw = await serializedStorage(storage, keyFor(scope.userId), async () => { scope.checkpoint(); return storage.getItem(keyFor(scope.userId)); });
        scope.checkpoint();
        const pending = decodeOutbox(raw, scope.userId);
        hydrated = true; outboxError = null;
        publish({ ...state, pending });
      } catch (error) {
        if (!current(scope)) throw error;
        outboxError = error instanceof MessagingError ? error.message : 'No se pudieron recuperar tus mensajes pendientes. Vuelve a intentar antes de enviar.';
        throw new MessagingError(outboxError);
      }
    })();
    hydration = task;
    void task.finally(() => { if (hydration === task) hydration = null; }).catch(() => {});
    return task;
  };

  const changePending = (scope: Scope, update: (items: PendingMessage[]) => PendingMessage[], publishBeforeStorage = false): Promise<void> => {
    const task = outboxQueue.then(async () => {
      scope.checkpoint();
      if (!hydrated) throw new MessagingError('Primero recupera tus mensajes pendientes.');
      const next = update(state.pending);
      if (next === state.pending) return;
      const raw = JSON.stringify({ version: 1, ownerId: scope.userId, pending: next });
      if (publishBeforeStorage) publish({ ...state, pending: next });
      try {
        await serializedStorage(storage, keyFor(scope.userId), async () => { scope.checkpoint(); await storage.setItem(keyFor(scope.userId), raw); });
        scope.checkpoint();
        outboxError = null; outboxDirty = false;
        if (!publishBeforeStorage) publish({ ...state, pending: next });
      } catch (error) {
        if (!current(scope)) throw error;
        if (publishBeforeStorage) outboxDirty = true;
        outboxError = publishBeforeStorage ? 'El mensaje está confirmado, pero no se pudo actualizar su copia pendiente en este dispositivo. Vuelve a sincronizar.' : 'No se pudo guardar el mensaje en este dispositivo. Comprueba el espacio libre y vuelve a intentar.';
        publish({ ...state, error: outboxError });
        throw new MessagingError(outboxError);
      }
    });
    outboxQueue = task.catch(() => {});
    return task;
  };

  const upsertConversation = (conversation: Conversation) => {
    const previous = state.conversations.find(item => item.id === conversation.id);
    if (previous && previous.lastSeq > conversation.lastSeq) return;
    const conversations = [...state.conversations.filter(item => item.id !== conversation.id), conversation]
      .sort((left, right) => (right.lastMessageAt ?? right.createdAt).localeCompare(left.lastMessageAt ?? left.createdAt) || left.id.localeCompare(right.id));
    publish({ ...state, conversations });
  };

  const reconcilePending = async (messages: ChatMessage[], scope: Scope) => {
    scope.checkpoint();
    if (!hydrated || !state.pending.some(item => messages.some(message => acknowledgedPending(item, message)))) return;
    try {
      await changePending(scope, items => items.filter(item => !messages.some(message => acknowledgedPending(item, message))), true);
    } catch (error) { if (current(scope)) fail(error, scope); }
  };

  const acknowledge = async (messages: ChatMessage[], scope: Scope) => {
    scope.checkpoint();
    for (const message of messages) {
      const history = state.histories[message.conversationId] ?? emptyHistory();
      const merged = mergeHistoryWindow(history.messages, [message]);
      publish({ ...state, histories: { ...state.histories, [message.conversationId]: { ...history, messages: merged, hasMore: merged[0].seq > 1, error: null } } });
      const conversation = state.conversations.find(item => item.id === message.conversationId);
      if (conversation && message.seq >= conversation.lastSeq) upsertConversation({ ...conversation, lastSeq: message.seq, lastMessage: message.body, lastMessageAt: message.createdAt });
    }
    if (messages.length) revision++;
    await reconcilePending(messages, scope);
  };

  const requireConversation = (id: string, scope: Scope, sending = false): Conversation => {
    scope.checkpoint();
    if (!isUuid(id)) throw new MessagingError('Esta conversación no está disponible.');
    const conversation = state.conversations.find(item => item.id === id);
    if (!conversation || ![conversation.buyerId, conversation.sellerId].includes(scope.userId)) throw new MessagingError('Actualiza la conversación antes de continuar.');
    if (sending && !conversation.canSend) {
      if (conversation.blockedByMe || conversation.blockedByOther) throw new Error('KH_CHAT_BLOCKED');
      throw new Error('KH_CHAT_PROPERTY_UNAVAILABLE');
    }
    return conversation;
  };

  const launchSend = (clientMessageId: string, scope: Scope) => {
    const task = sendQueue.then(async () => {
      try {
        scope.checkpoint();
        const pending = state.pending.find(item => item.clientMessageId === clientMessageId && item.status === 'sending');
        if (!pending) return;
        const result = await request(scope, context => repository.sendMessage({ ...pending }, context));
        if (!acknowledgedPending(pending, result)) throw new MessagingError('No se pudo confirmar el contenido enviado. Actualiza la conversación.');
        await acknowledge([result], scope);
      } catch (error) {
        if (!current(scope)) return;
        const message = messagingErrorMessage(error);
        try {
          await changePending(scope, items => items.map(item => item.clientMessageId === clientMessageId ? { ...item, status: 'failed', error: message } : item));
        } catch {
          if (current(scope)) publish({ ...state, pending: state.pending.map(item => item.clientMessageId === clientMessageId ? { ...item, status: 'failed', error: message } : item) });
        }
      }
    });
    sendQueue = task.catch(() => {});
  };

  const refresh = (): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (refreshTask) return refreshTask;
    const scope = scopeForSession();
    const task = (async () => {
      try {
        await ensureHydrated(scope);
        if (outboxDirty) await changePending(scope, items => [...items]);
        const capturedRevision = revision;
        const ids = state.pending.map(item => item.clientMessageId);
        const [conversations, receipts] = await request(scope, context => Promise.all([
          repository.listConversations(context), ids.length ? repository.findSentMessages(ids, context) : Promise.resolve([]),
        ]));
        scope.checkpoint();
        if (capturedRevision === revision) publish({ ...state, conversations, ready: true, error: outboxError });
        else publish({ ...state, ready: true, error: outboxError });
        await acknowledge(receipts, scope);
      } catch (error) { throw fail(error, scope); }
    })();
    refreshTask = task;
    void task.finally(() => { if (refreshTask === task) refreshTask = null; }).catch(() => {});
    return task;
  };

  const setHistoryBusy = (id: string, delta: number) => {
    const count = Math.max(0, (historyBusy.get(id) ?? 0) + delta);
    historyBusy.set(id, count);
    const history = state.histories[id] ?? emptyHistory();
    publish({ ...state, histories: { ...state.histories, [id]: { ...history, loading: count > 0, ...(delta > 0 ? { error: null } : {}) } } });
  };

  const loadHistory = (id: string, older: boolean): Promise<void> => {
    const scope = scopeForSession();
    if (!isUuid(id)) return Promise.reject(new MessagingError('Esta conversación no está disponible.'));
    const key = `${id}:${older ? 'older' : 'latest'}`;
    if (historyTasks.has(key)) return historyTasks.get(key)!;
    const initial = state.histories[id];
    const before = older ? initial?.messages[0]?.seq ?? null : null;
    if (older && initial && !initial.hasMore) return Promise.resolve();
    setHistoryBusy(id, 1);
    const capturedRevision = revision;
    const task = (async () => {
      try {
        const [conversation, messages] = await request(scope, context => Promise.all([
          older ? Promise.resolve(null) : repository.getConversation(id, context), repository.listMessages(id, before, context),
        ]));
        scope.checkpoint();
        if (conversation && capturedRevision === revision) upsertConversation(conversation);
        const history = state.histories[id] ?? emptyHistory();
        const merged = mergeHistoryWindow(history.messages, messages);
        publish({ ...state, histories: { ...state.histories, [id]: { ...history, messages: merged, hasMore: merged.length > 0 && merged[0].seq > 1 && (!older || messages.length > 0), error: null } } });
        await reconcilePending(messages, scope);
      } catch (error) { throw fail(error, scope, id); }
      finally { if (current(scope)) setHistoryBusy(id, -1); }
    })();
    historyTasks.set(key, task);
    void task.finally(() => { if (historyTasks.get(key) === task) historyTasks.delete(key); }).catch(() => {});
    return task;
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession(nextUserId: string | null, nextAccessToken: string | null) {
      if (userId === nextUserId) { accessToken = nextAccessToken; return; }
      epoch++; revision++;
      requests.forEach(controller => controller.abort(new Error('KH_ACCOUNT_CHANGED'))); requests.clear();
      userId = nextUserId; accessToken = nextAccessToken;
      hydrated = false; hydration = null; refreshTask = null; outboxError = null; outboxDirty = false;
      outboxQueue = Promise.resolve(); sendQueue = Promise.resolve();
      historyTasks.clear(); retryTasks.clear(); historyBusy.clear(); readSequences.clear(); readRequests.clear();
      publish(emptyMessagingState(userId));
    },
    dispose() { this.setSession(null, null); },
    refresh,
    async startConversation(propertyId: string): Promise<string> {
      const scope = scopeForSession();
      try {
        if (!isUuid(propertyId)) throw new MessagingError('Este anuncio no está disponible para contactar.');
        const conversation = await request(scope, context => repository.startConversation(propertyId, context));
        revision++; upsertConversation(conversation);
        return conversation.id;
      } catch (error) { throw fail(error, scope); }
    },
    openConversation: (id: string) => loadHistory(id, false),
    loadOlder: (id: string) => loadHistory(id, true),
    async sendMessage(id: string, body: string): Promise<void> {
      const scope = scopeForSession();
      try {
        const normalized = normalizeMessageBody(body);
        await ensureHydrated(scope);
        requireConversation(id, scope, true);
        const clientMessageId = newId();
        if (!isUuid(clientMessageId)) throw new MessagingError('No se pudo preparar el mensaje. Vuelve a intentar.');
        const pending: PendingMessage = { clientMessageId, conversationId: id, senderId: scope.userId, body: normalized, createdAt: now(), status: 'sending' };
        await changePending(scope, items => {
          if (items.length >= MAX_PENDING_MESSAGES) throw new MessagingError('Tienes 50 mensajes pendientes. Reintenta o retira alguno antes de enviar otro.');
          if (items.some(item => item.clientMessageId === clientMessageId)) throw new MessagingError('No se pudo preparar un nuevo envío. Vuelve a intentar.');
          return [...items, pending];
        });
        // Only this explicit user action starts transmission. Hydration and polling never do.
        launchSend(clientMessageId, scope);
      } catch (error) { throw fail(error, scope); }
    },
    retryMessage(clientMessageId: string): Promise<void> {
      if (retryTasks.has(clientMessageId)) return retryTasks.get(clientMessageId)!;
      const scope = scopeForSession();
      const task = (async () => {
        try {
          await ensureHydrated(scope);
          const pending = state.pending.find(item => item.clientMessageId === clientMessageId);
          if (!pending || pending.status === 'sending') return;
          const receipts = await request(scope, context => repository.findSentMessages([clientMessageId], context));
          await acknowledge(receipts, scope);
          if (!state.pending.some(item => item.clientMessageId === clientMessageId)) return;
          requireConversation(pending.conversationId, scope, true);
          await changePending(scope, items => items.map(item => item.clientMessageId === clientMessageId ? { ...item, status: 'sending', error: undefined } : item));
          launchSend(clientMessageId, scope);
        } catch (error) { throw fail(error, scope); }
      })();
      retryTasks.set(clientMessageId, task);
      void task.finally(() => { if (retryTasks.get(clientMessageId) === task) retryTasks.delete(clientMessageId); }).catch(() => {});
      return task;
    },
    async discardMessage(clientMessageId: string): Promise<void> {
      const scope = scopeForSession();
      try {
        await ensureHydrated(scope);
        await changePending(scope, items => {
          if (items.find(item => item.clientMessageId === clientMessageId)?.status === 'sending') throw new MessagingError('Espera a que termine el intento de envío.');
          return items.filter(item => item.clientMessageId !== clientMessageId);
        });
      } catch (error) { throw fail(error, scope); }
    },
    async markRead(id: string, lastSeq: number): Promise<void> {
      const scope = scopeForSession();
      try {
        requireConversation(id, scope);
        if (!Number.isSafeInteger(lastSeq) || lastSeq < 1 || !state.histories[id]?.messages.some(item => item.seq === lastSeq)) return;
        if (lastSeq <= Math.max(readSequences.get(id) ?? 0, readRequests.get(id) ?? 0)) return;
        readRequests.set(id, lastSeq);
        await request(scope, context => repository.markRead(id, lastSeq, context));
        readSequences.set(id, Math.max(readSequences.get(id) ?? 0, lastSeq));
        revision++;
        const capturedRevision = revision;
        const conversation = await request(scope, context => repository.getConversation(id, context));
        if ((readSequences.get(id) ?? 0) === lastSeq && capturedRevision === revision) upsertConversation(conversation);
      } catch (error) { throw fail(error, scope, id); }
      finally { if (current(scope) && readRequests.get(id) === lastSeq) readRequests.delete(id); }
    },
    async setBlocked(id: string, blocked: boolean): Promise<void> {
      const scope = scopeForSession();
      try {
        const conversation = requireConversation(id, scope);
        await request(scope, context => repository.setBlocked(conversation.otherUserId, blocked, context));
        revision++;
        publish({ ...state, conversations: state.conversations.map(item => item.otherUserId === conversation.otherUserId ? { ...item, blockedByMe: blocked, canSend: !blocked && !item.blockedByOther && item.propertyAvailable } : item), error: outboxError });
      } catch (error) { throw fail(error, scope, id); }
    },
    async reportConversation(id: string, reason: ReportReason, details: string, clientReportId: string): Promise<void> {
      const scope = scopeForSession();
      try {
        requireConversation(id, scope);
        validateReport(reason, details, clientReportId);
        await request(scope, context => repository.reportConversation(id, reason, details, clientReportId, context));
      } catch (error) { throw fail(error, scope, id); }
    },
  };
}
