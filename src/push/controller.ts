import { changed, isExpoPushToken, isUuid, nextRevision, parsePushPayload, PushError, registrationError, revocationError } from './domain.ts';
import type { InstallationState, InstallationStore, PushAdapter, PushPayload, PushRepository, PushRequestContext, PushSession, PushState } from './types.ts';

interface Dependencies {
  store: InstallationStore;
  repository: PushRepository;
  adapter: PushAdapter;
  projectId: string;
  navigate(conversationId: string): void;
  refreshSummary(): Promise<void>;
}
const sameSession = (a: PushSession | null, b: PushSession | null) => a?.userId === b?.userId && a?.sessionId === b?.sessionId;

export function createPushController({ store, repository, adapter, projectId, navigate, refreshSummary }: Dependencies) {
  let state: PushState = { supported: true, ready: false, enabled: false, busy: false, permission: 'undetermined', canAskAgain: true, error: null };
  let session: PushSession | null = null, hydrated = false, disposed = false, suspended = false, epoch = 0, intentEpoch = 0, navigationReady = false;
  let reconcileTail: Promise<void> = Promise.resolve();
  let reconciliationEpoch = -1;
  let registration: { epoch: number; intentEpoch: number; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>(), requests = new Set<AbortController>(), seen = new Set<string>();
  const pendingResponses: { id: string; payload: PushPayload }[] = [];
  let handlingResponses = false;
  let processingResponseId: string | null = null;
  function publish(patch: Partial<PushState>) { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); } }
  function abortRequests() { for (const request of requests) request.abort(); requests.clear(); }
  function assertCurrent(expectedEpoch: number, expectedIntent?: number) {
    if (disposed || suspended || epoch !== expectedEpoch || expectedIntent !== undefined && expectedIntent !== intentEpoch) throw changed();
  }
  function context(expectedEpoch: number, expectedIntent?: number): PushRequestContext & { release(): void } {
    assertCurrent(expectedEpoch, expectedIntent); if (!session) throw changed();
    const captured = { ...session }, abort = new AbortController(); requests.add(abort);
    return { ...captured, signal: abort.signal,
      checkpoint() { assertCurrent(expectedEpoch, expectedIntent); if (abort.signal.aborted || !sameSession(captured, session)) throw changed(); },
      release() { requests.delete(abort); },
    };
  }
  function confirmedForCurrent(saved: InstallationState) {
    const item = saved.intent;
    return !!item && item.userId === session?.userId && item.sessionId === session?.sessionId
      && (item.enabled ? item.confirmed || item.wasEnabled : !item.confirmed && item.wasEnabled);
  }
  async function revoke() {
    const saved = await store.change(current => {
      if (current.intent && !current.intent.enabled) return current;
      return { ...current, revision: nextRevision(current.revision), intent: { enabled: false,
        userId: current.intent?.userId ?? session?.userId ?? null, sessionId: current.intent?.sessionId ?? session?.sessionId ?? null,
        expoPushToken: null, confirmed: false, wasEnabled: !!(current.intent?.confirmed || current.intent?.wasEnabled) } };
    });
    if (saved.intent?.confirmed) return saved;
    try {
      const result = await repository.disable({ installationId: saved.installationId, installationSecret: saved.installationSecret, revision: saved.revision });
      if (result.enabled !== false || result.revision !== saved.revision) throw revocationError();
      return await store.change(current => current.revision === saved.revision && current.intent && !current.intent.enabled
        ? { ...current, intent: { ...current.intent, confirmed: true, wasEnabled: false } } : current);
    } catch { throw revocationError(); }
  }
  function enqueueReconcile(action: () => Promise<void>) {
    const result = reconcileTail.then(action, action); reconcileTail = result.catch(() => {}); return result;
  }
  function setSession(next: PushSession | null, isHydrated = true): Promise<void> {
    if (disposed) return Promise.resolve();
    if (hydrated === isHydrated && sameSession(session, next) && reconciliationEpoch === epoch) { session = next; return reconcileTail; }
    const mustReset = hydrated && !sameSession(session, next);
    session = next; hydrated = isHydrated; epoch++; intentEpoch++; abortRequests(); registration = null;
    const capturedEpoch = epoch;
    reconciliationEpoch = capturedEpoch;
    publish({ ready: false, enabled: false, busy: false, error: null });
    if (!isHydrated) return Promise.resolve();
    const result = enqueueReconcile(async () => {
      try {
        let saved = await store.read();
        const ownerChanged = saved.intent?.enabled && (saved.intent.userId !== next?.userId || saved.intent.sessionId !== next?.sessionId);
        if (epoch === capturedEpoch) publish({ enabled: confirmedForCurrent(saved) });
        if (mustReset && saved.intent || ownerChanged || saved.intent && !saved.intent.enabled && !saved.intent.confirmed) saved = await revoke();
        if (epoch === capturedEpoch) publish({ ready: true, enabled: confirmedForCurrent(saved), error: null });
      } catch (cause) {
        if (epoch === capturedEpoch) publish({ ready: true, error: cause instanceof PushError ? cause.message : revocationError().message });
        throw cause;
      } finally { void processResponses(); }
    });
    return result;
  }
  async function register(explicit: boolean, expectedEpoch: number, expectedIntent: number) {
    await reconcileTail; assertCurrent(expectedEpoch, expectedIntent);
    if (!session) throw new PushError('Inicia sesión para activar los avisos de este teléfono.');
    if (!isUuid(projectId)) throw registrationError();
    let saved = await store.read(); assertCurrent(expectedEpoch, expectedIntent);
    if (!explicit && !saved.intent?.enabled) return;
    if (saved.intent && !saved.intent.enabled && !saved.intent.confirmed) { await revoke(); assertCurrent(expectedEpoch, expectedIntent); }
    await adapter.ensureChannel(); assertCurrent(expectedEpoch, expectedIntent);
    let permission = await adapter.getPermission(); assertCurrent(expectedEpoch, expectedIntent);
    if (explicit && permission.permission !== 'granted' && permission.canAskAgain) {
      permission = await adapter.requestPermission(); assertCurrent(expectedEpoch, expectedIntent);
    }
    publish(permission);
    if (permission.permission !== 'granted') {
      if (saved.intent?.enabled) { await revoke(); assertCurrent(expectedEpoch, expectedIntent); publish({ enabled: false }); }
      if (explicit) throw new PushError('Permite las notificaciones de KarmaHouse en los ajustes de Android para activar los avisos.');
      return;
    }
    const token = await adapter.getToken(); assertCurrent(expectedEpoch, expectedIntent);
    if (!isExpoPushToken(token)) throw registrationError();
    const captured = { ...session };
    saved = await store.change(current => {
      assertCurrent(expectedEpoch, expectedIntent);
      const previous = current.intent;
      if (previous?.enabled && previous.userId === captured.userId && previous.sessionId === captured.sessionId && previous.expoPushToken === token) return current;
      return { ...current, revision: nextRevision(current.revision), intent: { enabled: true, userId: captured.userId, sessionId: captured.sessionId, expoPushToken: token, confirmed: false,
        wasEnabled: !!(previous?.enabled && previous.userId === captured.userId && previous.sessionId === captured.sessionId && (previous.confirmed || previous.wasEnabled)) } };
    });
    assertCurrent(expectedEpoch, expectedIntent);
    const request = context(expectedEpoch, expectedIntent);
    try {
      const result = await repository.register({ installationId: saved.installationId, installationSecret: saved.installationSecret, revision: saved.revision, expoPushToken: token, platform: 'android', projectId }, request);
      request.checkpoint();
      if (result.enabled !== true || result.revision !== saved.revision || result.platform !== 'android') throw registrationError();
      await store.change(current => { request.checkpoint(); return current.revision === saved.revision && current.intent?.enabled ? { ...current, intent: { ...current.intent, confirmed: true } } : current; });
      request.checkpoint(); publish({ enabled: true, error: null });
    } finally { request.release(); }
  }
  function runRegistration(explicit: boolean): Promise<void> {
    if (registration?.epoch === epoch && registration.intentEpoch === intentEpoch) return registration.promise;
    if (explicit) intentEpoch++;
    const expectedEpoch = epoch, expectedIntent = intentEpoch;
    publish({ busy: true, error: null });
    const promise = register(explicit, expectedEpoch, expectedIntent).catch(cause => {
      if (epoch !== expectedEpoch || intentEpoch !== expectedIntent || disposed) throw changed();
      const error = cause instanceof PushError ? cause : registrationError(); publish({ error: error.message }); throw error;
    }).finally(() => {
      if (registration?.promise === promise) registration = null;
      if (epoch === expectedEpoch && intentEpoch === expectedIntent) publish({ busy: false });
    });
    registration = { epoch: expectedEpoch, intentEpoch: expectedIntent, promise }; return promise;
  }
  async function refresh() {
    if (!hydrated || disposed || suspended) return;
    if (registration?.epoch === epoch && registration.intentEpoch === intentEpoch) return registration.promise;
    const expectedEpoch = epoch;
    await reconcileTail; assertCurrent(expectedEpoch);
    try {
      const saved = await store.read(); assertCurrent(expectedEpoch);
      if (saved.intent && !saved.intent.enabled && !saved.intent.confirmed) { await disable(); return; }
      if (saved.intent?.enabled && session) return runRegistration(false);
      const permission = await adapter.getPermission(); assertCurrent(expectedEpoch); publish({ ...permission, error: null });
    } catch (cause) {
      if (epoch !== expectedEpoch || disposed) throw changed();
      const error = cause instanceof PushError ? cause : registrationError(); publish({ error: error.message }); throw error;
    }
  }
  function disable(): Promise<void> {
    const expectedEpoch = epoch, expectedIntent = ++intentEpoch; abortRequests(); registration = null; publish({ busy: true, error: null });
    return enqueueReconcile(async () => {
      try { await revoke(); if (epoch === expectedEpoch && intentEpoch === expectedIntent) publish({ enabled: false, error: null }); }
      catch { const error = revocationError(); if (epoch === expectedEpoch && intentEpoch === expectedIntent) publish({ error: error.message }); throw error; }
      finally { if (epoch === expectedEpoch && intentEpoch === expectedIntent) publish({ busy: false }); }
    });
  }
  async function beforeSignOut(userId: string) {
    if (session?.userId !== userId) throw changed();
    const expectedEpoch = epoch;
    // Invalidate token/permission work first. No persisted intent means no registration could have escaped.
    intentEpoch++; abortRequests(); registration = null;
    await reconcileTail; assertCurrent(expectedEpoch);
    const saved = await store.read(); assertCurrent(expectedEpoch);
    if (!saved.intent || !saved.intent.enabled && saved.intent.confirmed) { publish({ busy: false, enabled: false }); return; }
    await disable(); assertCurrent(expectedEpoch);
  }
  async function clearResponse(id: string) { try { await adapter.clearLastResponse(id); } catch { /* Deduplication still holds during this process. */ } }
  async function processResponses() {
    if (handlingResponses || !hydrated || !navigationReady || disposed || suspended) return;
    handlingResponses = true;
    try {
      while (pendingResponses.length && hydrated && navigationReady && !disposed && !suspended) {
        const response = pendingResponses.shift()!;
        if (!session || response.payload.recipientId !== session.userId) { await clearResponse(response.id); continue; }
        const request = context(epoch);
        processingResponseId = response.id;
        try {
          const resolved = await repository.resolve(response.payload.notificationId, request); request.checkpoint();
          if (resolved.notificationId === response.payload.notificationId && resolved.recipientId === request.userId && isUuid(resolved.conversationId)) navigate(resolved.conversationId);
        } catch { /* Deleted, blocked, stale and inaccessible notices do not open a conversation. */ }
        finally { request.release(); processingResponseId = null; await clearResponse(response.id); }
      }
    } finally { handlingResponses = false; }
  }
  function receiveResponse(id: string, value: unknown) {
    if (disposed || suspended || seen.has(id)) return;
    seen.add(id); if (seen.size > 256) seen.delete(seen.values().next().value!);
    const payload = parsePushPayload(value);
    if (!payload) { void clearResponse(id); return; }
    pendingResponses.push({ id, payload }); void processResponses();
  }
  function shouldPresent(value: unknown) { const payload = parsePushPayload(value); return !disposed && !suspended && hydrated && !!session && payload?.recipientId === session.userId; }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSession, enable: () => runRegistration(true), disable, refresh, beforeSignOut,
    openSettings: () => adapter.openSettings(),
    setNavigationReady(value: boolean) { navigationReady = value; void processResponses(); },
    receiveResponse, shouldPresent,
    receiveNotification(value: unknown) { if (shouldPresent(value)) void refreshSummary().catch(() => {}); },
    // React can replay effect setup/cleanup. Suspend immediately cancels work without discarding secure intent.
    suspend() { suspended = true; epoch++; intentEpoch++; abortRequests(); registration = null; if (processingResponseId) seen.delete(processingResponseId); },
    resume() {
      if (!disposed) {
        suspended = false; publish({ busy: false });
        // Replay may have interrupted the first SecureStore read. Reconcile that same session again.
        if (hydrated && reconciliationEpoch !== epoch) void setSession(session, hydrated).catch(() => {});
        void processResponses();
      }
    },
    dispose() { disposed = true; epoch++; intentEpoch++; abortRequests(); listeners.clear(); pendingResponses.length = 0; },
  };
}
