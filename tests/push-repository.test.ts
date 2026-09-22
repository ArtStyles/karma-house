import assert from 'node:assert/strict';
import test from 'node:test';
import { createPushRepository } from '../src/push/repository.ts';
import { createInstallationStore } from '../src/push/installationStore.ts';
import { registerBeforeSignOut, runBeforeSignOut } from '../src/push/signOutHooks.ts';
const userId = '51000000-0000-4000-8000-000000000001', installationId = '51000000-0000-4000-8000-000000000002', sessionId = '51000000-0000-4000-8000-000000000003';
const projectId = 'e054aea9-38b4-4211-826b-521b3cc0be9f';
const input = { installationId, installationSecret: 'a'.repeat(64), revision: 1, platform: 'android' as const, projectId, fcmToken: 'fcm-fixture-token-222222222222222222222222222222222222222222222222222222222222' };
function fixture(result: unknown) {
  const calls: { url: string; init: RequestInit }[] = []; let changed = false;
  const abort = new AbortController();
  const context = { userId, sessionId, accessToken: 'captured-JWT', signal: abort.signal, checkpoint() { if (changed) throw new Error('CHANGED'); } };
  const repository = createPushRepository('https://example.supabase.co', 'public-key', async (url, init) => {
    calls.push({ url: String(url), init: init! });
    const body = typeof result === 'function' ? result() : result;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { repository, context, calls, change() { changed = true; }, abort };
}
test('registration binds the original actor, JWT and abort signal and validates the exact acknowledgement', async () => {
  const f = fixture({ enabled: true, revision: 1, platform: 'android' }); await f.repository.register(input, f.context);
  assert.equal(f.calls[0].url, 'https://example.supabase.co/rest/v1/rpc/kh_register_push_device');
  assert.deepEqual(JSON.parse(f.calls[0].init.body as string), { p_actor_id: userId, p_payload: input });
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer captured-JWT');
  assert.equal(f.calls[0].init.signal, f.context.signal);
  for (const result of [{ enabled: false, revision: 1, platform: 'android' }, { enabled: true, revision: 2, platform: 'android' }, { enabled: true, revision: 1, platform: 'ios' }, null]) {
    await assert.rejects(fixture(result).repository.register(input, f.context));
  }
});
test('revocation is possession-only with no account JWT and validates the persisted revision', async () => {
  const f = fixture({ enabled: false, revision: 1 }); await f.repository.disable(input);
  assert.deepEqual(JSON.parse(f.calls[0].init.body as string), { p_installation_id: installationId, p_installation_secret: input.installationSecret, p_revision: 1 });
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, undefined);
  await assert.rejects(fixture({ enabled: false, revision: 0 }).repository.disable(input));
});
test('resolver verifies recipient and requested notification; malformed input never reaches transport', async () => {
  const result = { notificationId: installationId, recipientId: userId, conversationId: sessionId };
  const f = fixture(result); assert.deepEqual(await f.repository.resolve(installationId, f.context), result);
  for (const patch of [{ recipientId: sessionId }, { notificationId: sessionId }, { conversationId: '../admin' }]) await assert.rejects(fixture({ ...result, ...patch }).repository.resolve(installationId, f.context));
  await assert.rejects(f.repository.resolve('https://evil.test', f.context)); assert.equal(f.calls.length, 1);
});
test('session checks run before and after transport and raw server errors never expose tokens', async () => {
  const f = fixture(() => { f.change(); return { enabled: true, revision: 1, platform: 'android' }; });
  await assert.rejects(f.repository.register(input, f.context), /CHANGED/);
  const g = fixture({}); g.abort.abort(); await assert.rejects(g.repository.register(input, g.context)); assert.equal(g.calls.length, 0);
  const repository = createPushRepository('https://example.supabase.co', 'public-key', async () => new Response(JSON.stringify({ message: 'private-token' }), { status: 500 }));
  await assert.rejects(repository.register(input, fixture({}).context), error => error instanceof Error && !error.message.includes('private-token'));
});
test('storage serializes revisions, preserves identity on restart and refuses corrupt persisted identity', async () => {
  let value: string | null = null;
  const storage = { getItem: async () => value, setItem: async (_key: string, next: string) => { value = next; } };
  const createIdentity = () => ({ installationId, installationSecret: 'a'.repeat(64) });
  const store = createInstallationStore(storage, createIdentity);
  const intent = { enabled: false, userId, sessionId, fcmToken: null, confirmed: false, wasEnabled: false };
  await Promise.all(Array.from({ length: 10 }, () => store.change(current => ({ ...current, revision: current.revision + 1, intent }))));
  const restarted = createInstallationStore(storage, () => { throw new Error('do not rotate'); }); assert.equal((await restarted.read()).revision, 10);
  value = '{broken'; await assert.rejects(restarted.read()); assert.equal(value, '{broken');
});
test('sign-out barrier runs before logout and a failed revocation leaves logout unexecuted', async () => {
  const events: string[] = []; let fail = true;
  const remove = registerBeforeSignOut(async actor => { assert.equal(actor, userId); events.push('revoke'); if (fail) throw new Error('retry'); });
  const signOut = async () => { await runBeforeSignOut(userId); events.push('logout'); };
  try {
    await assert.rejects(signOut(), /retry/); assert.deepEqual(events, ['revoke']);
    fail = false; await signOut(); assert.deepEqual(events, ['revoke', 'revoke', 'logout']);
  } finally { remove(); }
});
