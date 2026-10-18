import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyMessagingRepository, decodeAgencyConversation, decodeAgencyMessage } from '../src/agencies/messaging/repository.ts';
import { inboxPreview, messageSide, sendBlockedReason, teamAuthor } from '../src/agencies/messaging/presentation.ts';
import { agencyError } from '../src/agencies/domain.ts';

const id = (n: number) => `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const agencyId = id(100), conversationId = id(200), buyer = id(5), admin = id(1);
const staff = { userId: admin, accessToken: 'token', signal: new AbortController().signal, checkpoint() { }, agencyId, generation: 1 };
const client = { userId: buyer, accessToken: 'token', signal: new AbortController().signal, checkpoint() { } };
const legacy = { id: conversationId, agencyId, dealId: id(300), propertyId: id(400), buyerId: buyer, canSend: true, closedReason: null, lastSeq: 3, agencyName: 'Casas', propertyTitle: 'Casa', assigneeId: id(2), dealVersion: 1, unreadCount: 1, blockedUserIds: [] };
const team = { ...legacy, role: 'supervisor', canManage: true, canSeeDeal: true, agencyBlocked: false, buyerName: 'Ana', attendants: [{ userId: id(2), displayName: 'Luis', role: 'manager', lead: true }], lastMessage: { body: 'Hola', createdAt: '2026-10-18T10:00:00Z', fromAgency: false }, lastMessageAt: '2026-10-18T10:00:00Z' };
const message = (extra: Record<string, unknown> = {}) => ({ id: id(500), conversationId, seq: 1, clientMessageId: id(600), senderId: admin, body: 'Sí', createdAt: '2026-10-18T10:00:00Z', ...extra });
function fakeClient(reply: (name: string, args: any) => unknown) {
  const calls: { name: string; args: any }[] = [];
  const supabase = { rpc(name: string, args: any) { calls.push({ name, args }); return { setHeader() { return this; }, async abortSignal() { return { data: reply(name, args), error: null }; } }; } };
  return { calls, repo: createAgencyMessagingRepository(supabase as any) };
}

test('the team view decodes who attends and the last message', () => {
  const c = decodeAgencyConversation(team, staff);
  assert.deepEqual([c.role, c.canManage, c.canSeeDeal, c.buyerName], ['supervisor', true, true, 'Ana']);
  assert.deepEqual(c.attendants, team.attendants);
  assert.equal(c.lastMessage?.fromAgency, false);
  assert.throws(() => decodeAgencyConversation({ ...team, role: 'owner' }, staff));
  assert.throws(() => decodeAgencyConversation({ ...team, attendants: [{ ...team.attendants[0], role: 'owner' }] }, staff));
  assert.throws(() => decodeAgencyConversation({ ...team, attendants: [team.attendants[0], team.attendants[0]] }, staff));
  assert.throws(() => decodeAgencyConversation({ ...team, lastMessage: { body: 'Hola', createdAt: 'ayer', fromAgency: false } }, staff));
});
test('an older server still reads: the role follows the old rules', () => {
  assert.equal(decodeAgencyConversation(legacy, staff).role, 'supervisor');
  assert.equal(decodeAgencyConversation(legacy, { ...staff, userId: id(2) }).role, 'lead');
  const c = decodeAgencyConversation(legacy, client);
  assert.deepEqual([c.role, c.canManage, c.canSeeDeal, c.agencyBlocked, c.clientBlockedByMe, c.attendants.length, c.lastMessage], ['client', false, false, false, false, 0, null]);
  assert.equal(decodeAgencyConversation({ ...legacy, blockedUserIds: [buyer] }, staff).clientBlockedByMe, true, 'an older server still shows a block made in this thread');
});
test('messages say which side wrote them; the client never gets a team name', () => {
  assert.deepEqual(['fromAgency', 'senderName', 'senderRole'].map(k => (decodeAgencyMessage(message({ fromAgency: true, senderName: 'Ana', senderRole: 'admin' }), conversationId) as any)[k]), [true, 'Ana', 'admin']);
  const old = decodeAgencyMessage(message(), conversationId);
  assert.deepEqual([old.fromAgency, old.senderName, old.senderRole], [null, null, null]);
  assert.throws(() => decodeAgencyMessage(message({ senderRole: 'owner' }), conversationId));
  assert.throws(() => decodeAgencyMessage(message({ fromAgency: 'yes' }), conversationId));
});
test('only the team adds people, and only the client blocks the agency', async () => {
  const { calls, repo } = fakeClient(name => name === 'kh_set_agency_client_block' ? { ...legacy, agencyBlocked: true } : team);
  await repo.setAttendant({ conversationId, userId: id(3), attending: true, clientRequestId: id(700) }, staff);
  assert.deepEqual([calls[0].name, calls[0].args.p_agency_id, calls[0].args.p_payload.userId], ['kh_set_agency_conversation_attendant', agencyId, id(3)]);
  await assert.rejects(repo.setAttendant({ conversationId, userId: id(3), attending: true, clientRequestId: id(701) }, client as any));
  const blocked = await repo.setAgencyBlock({ conversationId, agencyId, blocked: true, clientRequestId: id(702) }, client);
  assert.equal(blocked.agencyBlocked, true);
  assert.deepEqual([calls[1].name, 'p_agency_id' in calls[1].args], ['kh_set_agency_client_block', false]);
  await assert.rejects(repo.setAgencyBlock({ conversationId, agencyId, blocked: false, clientRequestId: id(703) }, client), 'the echo must match the request');
  await assert.rejects(repo.setAgencyBlock({ conversationId, agencyId, blocked: true, clientRequestId: id(704) }, staff as any));
  assert.equal(calls.length, 3);
});
test('a client reports the conversation without naming a person; the team must name the client', async () => {
  const { calls, repo } = fakeClient(() => null);
  await repo.report({ conversationId, reason: 'other', details: '', clientRequestId: id(800) }, client);
  assert.equal('reportedUserId' in JSON.parse(JSON.stringify(calls[0].args.p_payload)), false);
  await assert.rejects(repo.report({ conversationId, reason: 'other', details: '', clientRequestId: id(801) }, staff));
  assert.equal(calls.length, 1);
});
test('sides: the client talks to the agency, the team sees teammates apart', () => {
  const c = { buyerId: buyer };
  assert.deepEqual(messageSide({ senderId: admin, fromAgency: true }, c, buyer, false), { own: false, teammate: false });
  assert.deepEqual(messageSide({ senderId: buyer, fromAgency: false }, c, buyer, false), { own: true, teammate: false });
  assert.deepEqual(messageSide({ senderId: id(2), fromAgency: true }, c, admin, true), { own: false, teammate: true });
  assert.deepEqual(messageSide({ senderId: buyer, fromAgency: null }, c, admin, true), { own: false, teammate: false });
  assert.deepEqual(messageSide({ senderId: id(2), fromAgency: null }, c, admin, true), { own: false, teammate: true });
});
test('authors, previews and reasons read as the design says', () => {
  const labels = { manager: 'Gestor', coordinator: 'Coordinador', admin: 'Administrador' } as const;
  assert.equal(teamAuthor({ senderName: 'Ana', senderRole: 'manager' }, labels), 'Ana · Gestor');
  assert.equal(teamAuthor({ senderName: 'Ana', senderRole: null }, labels), 'Ana · Ya no está en el equipo');
  assert.equal(teamAuthor({ senderName: null, senderRole: null }, labels), 'Persona del equipo');
  const last = (fromAgency: boolean) => ({ lastMessage: { body: 'Hola', createdAt: '2026-10-18T10:00:00Z', fromAgency } });
  assert.deepEqual([inboxPreview(last(true), true), inboxPreview(last(false), true), inboxPreview(last(true), false), inboxPreview(last(false), false)], ['Equipo: Hola', 'Hola', 'Hola', 'Tú: Hola']);
  assert.equal(inboxPreview({ lastMessage: null }, false), 'Escribe el primer mensaje.');
  const base = { canSend: false, closedReason: null, agencyBlocked: false, agencyName: 'Casas', clientBlockedByMe: false };
  assert.equal(sendBlockedReason({ ...base, canSend: true }, true), '');
  assert.match(sendBlockedReason({ ...base, agencyBlocked: true }, false), /Bloqueaste a Casas/);
  assert.match(sendBlockedReason({ ...base, agencyBlocked: true }, true), /El cliente bloqueó/);
  assert.match(sendBlockedReason({ ...base, clientBlockedByMe: true }, true), /Bloqueaste a este cliente/);
  assert.match(sendBlockedReason({ ...base, closedReason: 'sold' }, false), /cerrado/);
});
test('new refusals read as Spanish messages', () => {
  assert.match(agencyError(Error('KH_AGENCY_BLOCKED')), /bloqueada/);
  assert.match(agencyError(Error('KH_AGENCY_MANAGER_CHANGED')), /ya no puede atender/);
});
