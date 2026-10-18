import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyTeamChatRepository, decodeAgencyTeamChat, decodeAgencyTeamMessage } from '../src/agencies/messaging/teamChat.ts';
import { readIncomingAgencyMessages } from '../src/agencies/messaging/live.ts';
import { agencyError } from '../src/agencies/domain.ts';

const id = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const agencyId = id(100);
const context = { userId: id(1), accessToken: 'token', signal: new AbortController().signal, checkpoint() { }, agencyId, generation: 1 };
const message = (seq: number, extra: Record<string, unknown> = {}) => ({ id: id(200 + seq), agencyId, seq, clientMessageId: id(300 + seq), senderId: id(2), senderName: 'Ana', senderRole: 'manager', body: `Mensaje ${seq}`, createdAt: '2026-10-17T12:00:00Z', ...extra });
const summary = { agencyId, agencyName: 'Casas', lastSeq: 2, unreadCount: 1, canSend: true, memberCount: 3, lastMessage: { body: 'Hola', senderName: 'Ana', createdAt: '2026-10-17T12:00:00Z' } };
function fakeClient(reply: (name: string, args: any) => unknown) {
  const calls: { name: string; args: any }[] = [];
  const client = { rpc(name: string, args: any) { calls.push({ name, args }); return { setHeader(key: string, value: string) { assert.equal(key, 'Authorization'); assert.equal(value, 'Bearer token'); return this; }, async abortSignal() { return { data: reply(name, args), error: null }; } }; } };
  return { calls, repo: createAgencyTeamChatRepository(client as any) };
}

test('team chat summary decodes only its own agency', () => {
  assert.deepEqual(decodeAgencyTeamChat(summary, agencyId).lastMessage, summary.lastMessage);
  assert.equal(decodeAgencyTeamChat({ ...summary, lastMessage: null }, agencyId).lastMessage, null);
  assert.throws(() => decodeAgencyTeamChat({ ...summary, agencyId: id(101) }, agencyId));
  assert.throws(() => decodeAgencyTeamChat({ ...summary, canSend: 'yes' }, agencyId));
  assert.throws(() => decodeAgencyTeamChat({ ...summary, lastMessage: { ...summary.lastMessage, createdAt: 'ayer' } }, agencyId));
});
test('team messages keep former members and deleted accounts, never an unknown role', () => {
  assert.equal(decodeAgencyTeamMessage(message(1, { senderRole: null }), agencyId).senderRole, null);
  assert.equal(decodeAgencyTeamMessage(message(1, { senderId: null, senderName: 'Cuenta eliminada' }), agencyId).senderId, null);
  assert.throws(() => decodeAgencyTeamMessage(message(1, { senderRole: 'owner' }), agencyId));
  assert.throws(() => decodeAgencyTeamMessage(message(1, { agencyId: id(101) }), agencyId));
  assert.throws(() => decodeAgencyTeamMessage(message(0), agencyId));
});
test('repository pins the actor and the agency and orders history', async () => {
  const { calls, repo } = fakeClient(name => name === 'kh_get_agency_team_chat' ? summary : { items: [message(2), message(1)], hasMore: true });
  assert.equal((await repo.get(context)).unreadCount, 1);
  const page = await repo.history(agencyId, 3, context);
  assert.deepEqual(page.items.map(m => m.seq), [1, 2]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(calls.map(c => c.name), ['kh_get_agency_team_chat', 'kh_list_agency_team_messages']);
  assert.ok(calls.every(c => c.args.p_actor_id === id(1) && c.args.p_agency_id === agencyId));
  assert.deepEqual([calls[1].args.p_before_seq, calls[1].args.p_limit], [3, 30]);
  await assert.rejects(repo.history(id(101), null, context));
});
test('history refuses repeated sequence numbers', async () => {
  const { repo } = fakeClient(() => ({ items: [message(1), message(1)], hasMore: false }));
  await assert.rejects(repo.history(agencyId, null, context));
});
test('send trims, checks the echo and refuses empty text without calling the server', async () => {
  const { calls, repo } = fakeClient((_, args) => ({ ...message(3), senderId: id(1), clientMessageId: args.p_payload.clientMessageId, body: args.p_payload.body }));
  const sent = await repo.send({ clientMessageId: id(400), body: '  Hola  ' }, context);
  assert.equal(sent.body, 'Hola');
  assert.deepEqual(calls[0].args.p_payload, { clientMessageId: id(400), body: 'Hola' });
  await assert.rejects(repo.send({ clientMessageId: id(401), body: '   ' }, context));
  assert.equal(calls.length, 1);
  const other = fakeClient(() => ({ ...message(3), senderId: id(1), clientMessageId: id(402), body: 'Otro' }));
  await assert.rejects(other.repo.send({ clientMessageId: id(402), body: 'Hola' }, context));
});
test('markRead sends the cursor and an account change stops the call', async () => {
  const { calls, repo } = fakeClient(() => null);
  await repo.markRead(7, context);
  assert.deepEqual(calls[0].args, { p_agency_id: agencyId, p_payload: { lastSeq: 7 }, p_actor_id: id(1) });
  await assert.rejects(repo.markRead(8, { ...context, checkpoint() { throw Error('KH_ACCOUNT_CHANGED'); } }));
  assert.equal(calls.length, 1);
});
test('the incoming reader fills a gap in the team chat too', async () => {
  const pages: Record<string, { items: any[]; hasMore: boolean }> = { null: { items: [message(4), message(5)].map(m => decodeAgencyTeamMessage(m, agencyId)), hasMore: true }, 4: { items: [message(2), message(3)].map(m => decodeAgencyTeamMessage(m, agencyId)), hasMore: true } };
  const repo = { async history(_id: string, before: number | null) { return pages[String(before)]; } };
  const previous = [decodeAgencyTeamMessage(message(1), agencyId)];
  const result = await readIncomingAgencyMessages(repo, agencyId, previous, false, context);
  assert.deepEqual(result.items.map(m => m.seq), [1, 2, 3, 4, 5]);
});
test('chat limits read as Spanish messages', () => {
  assert.match(agencyError(Error('KH_CHAT_RATE_LIMIT')), /muchos mensajes/);
  assert.match(agencyError(Error('KH_CHAT_INVALID_MESSAGE')), /mensaje/);
});
