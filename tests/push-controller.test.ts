import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstallationStore } from '../src/push/installationStore.ts';
import { createPushController } from '../src/push/controller.ts';
import type { PushAdapter, PushRepository, PushSession, RegistrationInput } from '../src/push/types.ts';

const actor = '51000000-0000-4000-8000-000000000001', other = '51000000-0000-4000-8000-000000000002';
const installationId = '51000000-0000-4000-8000-000000000003', sessionId = '51000000-0000-4000-8000-000000000004';
const noticeId = '51000000-0000-4000-8000-000000000005', conversationId = '51000000-0000-4000-8000-000000000006';
const projectId = 'e054aea9-38b4-4211-826b-521b3cc0be9f';
const session = (userId = actor): PushSession => ({ userId, sessionId, accessToken: `jwt-${userId}` });
const payload = (recipientId = actor) => ({ kind: 'karmahouse.notification', notificationId: noticeId, recipientId });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(r => { resolve = r; }), resolve }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(overrides: Partial<PushRepository> = {}, native: Partial<PushAdapter> = {}) {
  let saved: string | null = null, prompts = 0, clears = 0, summaries = 0;
  const clearedResponses: string[] = [];
  const calls: { kind: string; revision: number; userId?: string }[] = [], routes: string[] = [];
  const storage = { getItem: async () => saved, setItem: async (_key: string, value: string) => { saved = value; } };
  const store = createInstallationStore(storage, () => ({ installationId, installationSecret: 'a'.repeat(64) }));
  const repository: PushRepository = {
    register: async (input, context) => { calls.push({ kind: 'register', revision: input.revision, userId: context.userId }); return { enabled: true, revision: input.revision, platform: 'android' }; },
    disable: async input => { calls.push({ kind: 'disable', revision: input.revision }); return { enabled: false, revision: input.revision }; },
    resolve: async (id, context) => ({ notificationId: id, recipientId: context.userId, conversationId }), ...overrides,
  };
  const adapter: PushAdapter = { ensureChannel: async () => {}, getPermission: async () => ({ permission: 'granted', canAskAgain: true }), requestPermission: async () => { prompts++; return { permission: 'granted', canAskAgain: true }; }, getToken: async () => 'ExpoPushToken[test_token]', clearLastResponse: async id => { clears++; clearedResponses.push(id); }, openSettings: async () => {}, ...native };
  const controller = createPushController({ store, repository, adapter, projectId, navigate: id => { routes.push(id); }, refreshSummary: async () => { summaries++; } });
  return { controller, store, storage, calls, routes, clearedResponses, prompts: () => prompts, clears: () => clears, summaries: () => summaries };
}

test('hydration and refresh never request permission; activation is explicit', async () => {
  const f = fixture({}, { getPermission: async () => ({ permission: 'undetermined', canAskAgain: true }) });
  await f.controller.setSession(session()); await f.controller.refresh();
  assert.equal(f.prompts(), 0); assert.equal(f.calls.length, 0); assert.equal(f.controller.getState().enabled, false);
  await f.controller.enable(); assert.equal(f.prompts(), 1); assert.equal(f.controller.getState().enabled, true);
});

test('network registration failure keeps desired state and retries the identical revision', async () => {
  const inputs: RegistrationInput[] = []; let fail = true;
  const f = fixture({ register: async input => { inputs.push(input); if (fail) throw new Error('offline'); return { enabled: true, revision: input.revision, platform: 'android' }; } });
  await f.controller.setSession(session()); await assert.rejects(f.controller.enable());
  assert.equal(f.controller.getState().enabled, false); assert.ok(f.controller.getState().error);
  fail = false; await f.controller.refresh();
  assert.deepEqual(inputs[0], inputs[1]); assert.equal(f.controller.getState().enabled, true);
});

test('repeated foreground refresh neither invalidates pending registration nor increments revision', async () => {
  const pending = deferred<{ enabled: true; revision: number; platform: 'android' }>(); let registrations = 0;
  const f = fixture({ register: async () => { registrations++; return pending.promise; } });
  await f.controller.setSession(session()); const enabling = f.controller.enable(); await tick();
  const refresh = f.controller.refresh(); await tick();
  assert.equal(registrations, 1); pending.resolve({ enabled: true, revision: 1, platform: 'android' });
  await Promise.all([enabling, refresh]); assert.equal(f.controller.getState().enabled, true);
});

test('disable persists a newer tombstone before a late registration response and survives restart', async () => {
  const pending = deferred<{ enabled: true; revision: number; platform: 'android' }>();
  const f = fixture({ register: async () => pending.promise });
  await f.controller.setSession(session()); const enabling = f.controller.enable().catch(() => {}); await tick();
  await f.controller.disable(); pending.resolve({ enabled: true, revision: 1, platform: 'android' }); await enabling;
  assert.equal(f.controller.getState().enabled, false);
  const restarted = createInstallationStore(f.storage, () => { throw new Error('must retain identity'); });
  const saved = await restarted.read(); assert.equal(saved.intent?.enabled, false); assert.equal(saved.revision, 2);
});

test('disable before any registration still writes and sends a revocation tombstone', async () => {
  const f = fixture(); await f.controller.setSession(session()); await f.controller.disable();
  assert.deepEqual(f.calls, [{ kind: 'disable', revision: 1 }]); assert.equal((await f.store.read()).intent?.enabled, false);
});

test('failed revocation preserves confirmed enabled status and blocks logout until retry confirms', async () => {
  let offline = true;
  const f = fixture({ disable: async input => { if (offline) throw new Error('offline token private'); return { enabled: false, revision: input.revision }; } });
  await f.controller.setSession(session()); await f.controller.enable();
  await assert.rejects(f.controller.beforeSignOut(actor), /desactivar|conexión|inténtalo/i);
  assert.equal(f.controller.getState().enabled, true); assert.doesNotMatch(f.controller.getState().error ?? '', /token private/);
  const failedRevision = (await f.store.read()).revision;
  offline = false; await f.controller.beforeSignOut(actor);
  assert.equal(f.controller.getState().enabled, false); assert.equal((await f.store.read()).revision, failedRevision);
});

test('A to B to A cancels the old operation, revokes it, and requires another explicit activation', async () => {
  const pending = deferred<{ enabled: true; revision: number; platform: 'android' }>(); let first = true;
  const f = fixture({ register: async input => { if (first) { first = false; return pending.promise; } return { enabled: true, revision: input.revision, platform: 'android' }; } });
  await f.controller.setSession(session()); const old = f.controller.enable().catch(() => {}); await tick();
  const toB = f.controller.setSession(session(other)), toA = f.controller.setSession(session()); await Promise.all([toB, toA]);
  pending.resolve({ enabled: true, revision: 1, platform: 'android' }); await old; await f.controller.refresh();
  assert.equal(f.controller.getState().enabled, false); assert.ok(f.calls.some(call => call.kind === 'disable'));
  await f.controller.enable(); assert.equal(f.controller.getState().enabled, true); assert.ok((await f.store.read()).revision >= 3);
});

test('token rotation advances revision and identical renewal retains it', async () => {
  let token = 'ExpoPushToken[first_token_123]'; const f = fixture({}, { getToken: async () => token });
  await f.controller.setSession(session()); await f.controller.enable(); await f.controller.refresh();
  token = 'ExpoPushToken[second_token_123]'; await f.controller.refresh();
  assert.deepEqual(f.calls.map(call => call.revision), [1, 1, 2]);
});

test('cold start waits for navigation and auth hydration, resolves visibility once and deduplicates tap', async () => {
  const f = fixture(); f.controller.receiveResponse('response-1', payload());
  await tick(); assert.deepEqual(f.routes, []);
  await f.controller.setSession(session()); await tick(); assert.deepEqual(f.routes, []);
  f.controller.setNavigationReady(true); await tick();
  assert.deepEqual(f.routes, [conversationId]); assert.equal(f.clears(), 1);
  f.controller.receiveResponse('response-1', payload()); await tick(); assert.equal(f.routes.length, 1);
});

test('wrong recipient, arbitrary route, invisible notification and late account switch never navigate', async () => {
  const pending = deferred<{ notificationId: string; recipientId: string; conversationId: string }>();
  const f = fixture({ resolve: async () => pending.promise });
  await f.controller.setSession(session()); f.controller.setNavigationReady(true);
  f.controller.receiveResponse('wrong-account', payload(other)); f.controller.receiveResponse('arbitrary', { ...payload(), url: '/admin' }); await tick();
  assert.deepEqual(f.routes, []);
  f.controller.receiveResponse('late', payload()); await tick(); await f.controller.setSession(session(other));
  pending.resolve({ notificationId: noticeId, recipientId: actor, conversationId }); await tick();
  assert.deepEqual(f.routes, []);
  const invisible = fixture({ resolve: async () => { throw new Error('not visible'); } });
  await invisible.controller.setSession(session()); invisible.controller.setNavigationReady(true); invisible.controller.receiveResponse('invisible', payload()); await tick();
  assert.deepEqual(invisible.routes, []);
});

test('foreground presentation and summary refresh require the current authenticated recipient', async () => {
  const f = fixture(); assert.equal(f.controller.shouldPresent(payload()), false);
  await f.controller.setSession(session()); assert.equal(f.controller.shouldPresent(payload()), true); assert.equal(f.controller.shouldPresent(payload(other)), false);
  f.controller.receiveNotification(payload(other)); f.controller.receiveNotification(payload()); await tick(); assert.equal(f.summaries(), 1);
});

test('denied permission cannot falsely enable push and settings-return refresh never prompts', async () => {
  const f = fixture({}, { getPermission: async () => ({ permission: 'denied', canAskAgain: false }) });
  await f.controller.setSession(session()); await assert.rejects(f.controller.enable()); await f.controller.refresh();
  assert.equal(f.prompts(), 0); assert.equal(f.calls.length, 0); assert.equal(f.controller.getState().enabled, false);
});

test('never activated account can log out offline; ordinary login makes no revocation request', async () => {
  const f = fixture({ disable: async () => { throw new Error('offline'); } });
  await f.controller.setSession(null); await f.controller.setSession(session());
  await f.controller.beforeSignOut(actor); assert.equal((await f.store.read()).intent, null);
});

test('logout cancels pending token acquisition even when it never reached the repository', async () => {
  const pending = deferred<string>();
  const f = fixture({ disable: async () => { throw new Error('offline'); } }, { getToken: async () => pending.promise });
  await f.controller.setSession(session()); const enabling = f.controller.enable().catch(() => {}); await tick();
  await f.controller.beforeSignOut(actor); pending.resolve('ExpoPushToken[late_token_123]'); await enabling;
  assert.deepEqual(f.calls, []); assert.equal((await f.store.read()).intent, null);
});

test('after restart a failed revocation remains visibly enabled until server confirmation', async () => {
  const f = fixture({ disable: async () => { throw new Error('offline'); } });
  await f.controller.setSession(session()); await f.controller.enable(); await assert.rejects(f.controller.disable());
  // Hydrating the same persisted session must preserve the uncertain active status.
  f.controller.dispose();
  const restart = createPushController({ store: f.store, repository: { register: async input => ({ enabled: true, revision: input.revision, platform: 'android' }), disable: async () => { throw new Error('offline'); }, resolve: async () => { throw new Error('unused'); } }, adapter: { ensureChannel: async () => {}, getPermission: async () => ({ permission: 'granted', canAskAgain: true }), requestPermission: async () => { throw new Error('unexpected'); }, getToken: async () => 'ExpoPushToken[fixture_token]', clearLastResponse: async () => {}, openSettings: async () => {} }, projectId, navigate: () => {}, refreshSummary: async () => {} });
  await assert.rejects(restart.setSession(session())); assert.equal(restart.getState().enabled, true); assert.ok(restart.getState().error);
});

test('provider suspension cancels late work and can resume without losing persisted activation', async () => {
  const pending = deferred<{ notificationId: string; recipientId: string; conversationId: string }>();
  const f = fixture({ resolve: async () => pending.promise });
  await f.controller.setSession(session()); await f.controller.enable(); f.controller.setNavigationReady(true);
  f.controller.receiveResponse('unmount', payload()); await tick(); f.controller.suspend();
  pending.resolve({ notificationId: noticeId, recipientId: actor, conversationId }); await tick(); assert.deepEqual(f.routes, []);
  assert.equal(f.controller.shouldPresent(payload()), false);
  f.controller.resume(); await f.controller.refresh(); assert.equal(f.controller.getState().enabled, true);
});

test('effect replay during hydration settles ready and preserves existing activation', async () => {
  for (const activated of [false, true]) {
    const f = fixture();
    if (activated) {
      await f.controller.setSession(session()); await f.controller.enable();
      await f.controller.setSession(null, false);
    }
    const initial = f.controller.setSession(session());
    f.controller.suspend(); f.controller.resume();
    const replay = f.controller.setSession(session());
    await Promise.all([initial, replay]); await f.controller.refresh();
    assert.equal(f.controller.getState().ready, true, `activated=${activated}`);
    assert.equal(f.controller.getState().enabled, activated);
    assert.equal(f.calls.filter(call => call.kind === 'disable').length, 0);
    assert.equal(f.prompts(), 0);
  }
});

test('a failed secure persistence write never sends a registration', async () => {
  const f = fixture(); await f.controller.setSession(session());
  f.storage.setItem = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(f.controller.enable()); assert.deepEqual(f.calls, []); assert.equal(f.controller.getState().enabled, false);
});

test('JWT refresh within the same session preserves the pending registration and its revision', async () => {
  const pending = deferred<{ enabled: true; revision: number; platform: 'android' }>();
  const f = fixture({ register: async () => pending.promise });
  await f.controller.setSession(session()); const enabling = f.controller.enable(); await tick();
  await f.controller.setSession({ ...session(), accessToken: 'new-JWT' });
  pending.resolve({ enabled: true, revision: 1, platform: 'android' }); await enabling;
  assert.equal(f.controller.getState().enabled, true); assert.equal((await f.store.read()).revision, 1);
});

test('a replaced token with uncertain registration preserves the previous confirmed active status on rehydration', async () => {
  let token = 'ExpoPushToken[first_token_123]', fail = false;
  const f = fixture({ register: async input => { if (fail) throw new Error('offline'); return { enabled: true, revision: input.revision, platform: 'android' }; } }, { getToken: async () => token });
  await f.controller.setSession(session()); await f.controller.enable(); token = 'ExpoPushToken[second_token_123]'; fail = true;
  await assert.rejects(f.controller.refresh());
  await f.controller.setSession(null, false); await f.controller.setSession(session());
  assert.equal(f.controller.getState().enabled, true);
});

test('clearing a handled response identifies it so an older completion cannot erase a newer cold-start tap', async () => {
  const f = fixture(); await f.controller.setSession(session()); f.controller.setNavigationReady(true);
  f.controller.receiveResponse('one', payload()); f.controller.receiveResponse('two', payload()); await tick();
  assert.deepEqual(f.clearedResponses, ['one', 'two']);
});
