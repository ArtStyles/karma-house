import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAgencyPushTarget } from '../src/push/domain.ts';
import { createPushRepository } from '../src/push/repository.ts';
import { prepareAgencyNotificationTarget } from '../src/notifications/agencyNavigation.ts';
import { createAgencyController } from '../src/agencies/controller.ts';

const user = '63000000-0000-4000-8000-000000000001', agency = '63000000-0000-4000-8000-000000000002', chat = '63000000-0000-4000-8000-000000000003';
const context = { userId: user, accessToken: 'captured', sessionId: agency, signal: new AbortController().signal, checkpoint() { } };
const device = { installationId: chat, installationSecret: 'a'.repeat(64), revision: 3, fcmToken: `fcm-${'a'.repeat(70)}`, platform: 'android' as const, projectId: 'e054aea9-38b4-4211-826b-521b3cc0be9f', supportsAgencyNotifications: true, supportsAgencyChat: true };

test('chat push targets: staff routes carry the agency, the team chat has no conversation', () => {
  assert.deepEqual(decodeAgencyPushTarget({ route: 'agency_conversation', agencyId: agency, dealId: chat }), { route: 'agency_conversation', agencyId: agency, dealId: chat });
  assert.deepEqual(decodeAgencyPushTarget({ route: 'team_chat', agencyId: agency, dealId: null }), { route: 'team_chat', agencyId: agency, dealId: null });
  assert.equal(decodeAgencyPushTarget({ route: 'agency_conversation', agencyId: null, dealId: chat }), null);
  assert.equal(decodeAgencyPushTarget({ route: 'team_chat', agencyId: agency, dealId: chat }), null);
  assert.equal(decodeAgencyPushTarget({ route: 'team_chat', agencyId: null, dealId: null }), null);
});
test('a chat tap opens the staff conversation or the team chat inside that agency', async () => {
  const repository: any = { capabilities: async () => ({ enabled: true }), listMine: async () => [{ id: agency, state: 'approved' }], membership: async () => ({ agencyId: agency, userId: user, state: 'active', role: 'manager', version: 1 }) };
  const w = createAgencyController(repository); w.setSession({ userId: user, accessToken: 'captured' });
  const adapter = { ...w, getCurrentWorkspace: w.getSnapshot };
  const path = async (target: Parameters<typeof prepareAgencyNotificationTarget>[0]) => { let value = ''; (await prepareAgencyNotificationTarget(target, adapter)).dispatch(next => { value = next; }); return value; };
  assert.equal(await path({ route: 'agency_conversation', agencyId: agency, dealId: chat }), `/agency-conversation/${chat}?agencyId=${agency}`);
  assert.equal(w.getSnapshot().activeAgencyId, agency);
  assert.equal(await path({ route: 'team_chat', agencyId: agency, dealId: null }), '/agency-team-chat');
});
test('an older server refuses the chat flag: the phone registers without it and says so', async () => {
  const bodies: any[] = [];
  const repo = createPushRepository('http://local.invalid', 'key', async (_url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body.p_payload);
    return body.p_payload.supportsAgencyChat ? new Response(JSON.stringify({ code: 'P0001', message: 'KH_PUSH_INVALID' }), { status: 400 }) : new Response(JSON.stringify({ enabled: true, revision: 3, platform: 'android' }));
  });
  assert.deepEqual(await repo.register(device, context), { enabled: true, revision: 3, platform: 'android', agencyChat: false });
  assert.deepEqual([bodies.length, 'supportsAgencyChat' in bodies[1], bodies[1].supportsAgencyNotifications], [2, false, true]);
});
test('a new server keeps the flag; other failures are not retried', async () => {
  let calls = 0;
  const accepted = createPushRepository('http://local.invalid', 'key', async () => { calls++; return new Response(JSON.stringify({ enabled: true, revision: 3, platform: 'android' })); });
  assert.equal((await accepted.register(device, context)).agencyChat, true);
  const failing = createPushRepository('http://local.invalid', 'key', async () => { calls++; return new Response(JSON.stringify({ message: 'KH_PUSH_SESSION_REQUIRED' }), { status: 400 }); });
  await assert.rejects(failing.register(device, context));
  assert.equal(calls, 2);
});
