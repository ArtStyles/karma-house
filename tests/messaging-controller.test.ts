// @ts-nocheck -- Controller tests run without a native runtime.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessagingController } from '../src/messaging/controller.ts';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const date = '2026-09-18T12:00:00.000Z';
const conversation = { id: c, propertyId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', propertyTitle: 'Casa', propertyLocation: 'La Habana', buyerId: a, sellerId: b, otherUserId: b, otherName: 'Vendedor', lastMessage: null, lastMessageAt: null, lastSeq: 0, unreadCount: 0, blockedByMe: false, blockedByOther: false, canSend: true, propertyAvailable: true, createdAt: date };
const pending = { clientMessageId: requestId, conversationId: c, senderId: a, body: 'Hola', createdAt: date, status: 'sending' };
const serverMessage = (seq, overrides = {}) => ({ id: `11111111-1111-4111-8111-${String(seq).padStart(12, '0')}`, conversationId: c, seq, clientMessageId: `22222222-2222-4222-8222-${String(seq).padStart(12, '0')}`, senderId: b, body: `Mensaje ${seq}`, createdAt: date, ...overrides });
const ack = { ...serverMessage(1), clientMessageId: requestId, senderId: a, body: 'Hola' };
function deferred() { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function storageMemory(overrides = {}) { const values = new Map(); return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, ...overrides }; }
function repository(overrides = {}) { return { listConversations: async () => [conversation], getConversation: async () => conversation, listMessages: async () => [], startConversation: async () => conversation, sendMessage: async () => ack, findSentMessages: async () => [], markRead: async () => {}, setBlocked: async () => {}, reportConversation: async () => {}, ...overrides }; }
async function waitFor(predicate) { for (let count = 0; count < 30 && !predicate(); count++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'asynchronous state should settle'); }
async function initialized(repo = repository(), storage = storageMemory()) { const controller = createMessagingController(repo, storage, { createId: () => requestId, now: () => date }); controller.setSession(a, 'token-a'); await controller.refresh(); return controller; }

test('send persists before transport and resolves its composer contract after a network failure', async () => {
  const storage = storageMemory(); let calls = 0;
  const controller = await initialized(repository({ sendMessage: async message => {
    calls++;
    assert.ok([...storage.values.values()].some(raw => JSON.parse(raw).pending.some(item => item.clientMessageId === message.clientMessageId)));
    throw new Error('Network request failed');
  } }), storage);
  await controller.sendMessage(c, ' Hola ');
  await waitFor(() => controller.getState().pending[0]?.status === 'failed');
  assert.equal(calls, 1);
  assert.equal(controller.getState().pending[0].body, 'Hola');
});

test('storage failure before enqueue prevents transmission and keeps the composer responsible for its text', async () => {
  let calls = 0;
  const controller = await initialized(repository({ sendMessage: async () => { calls++; return ack; } }), storageMemory({ setItem: async () => { throw new Error('disk full'); } }));
  await assert.rejects(controller.sendMessage(c, 'Hola'));
  assert.equal(calls, 0);
  assert.deepEqual(controller.getState().pending, []);
});

test('a failed outbox read never overwrites unknown saved messages; recovery restores manual retries', async () => {
  let fail = true; let writes = 0; let sends = 0;
  const storage = storageMemory({ getItem: async () => { if (fail) throw new Error('read failure'); return JSON.stringify({ version: 1, ownerId: a, pending: [pending] }); }, setItem: async () => { writes++; } });
  const controller = createMessagingController(repository({ sendMessage: async () => { sends++; return ack; } }), storage);
  controller.setSession(a, 'token-a');
  await assert.rejects(controller.refresh());
  assert.equal(controller.getState().ready, true);
  assert.ok(controller.getState().error);
  await assert.rejects(controller.sendMessage(c, 'Hola'));
  assert.equal(writes, 0);
  fail = false;
  await controller.refresh();
  assert.equal(controller.getState().pending[0].status, 'failed');
  assert.equal(sends, 0);
});

test('a lost acknowledgement is reconciled by client UUID without automatically sending again', async () => {
  let stored = false; let sends = 0;
  const controller = await initialized(repository({ sendMessage: async () => { sends++; stored = true; throw new Error('timeout'); }, findSentMessages: async ids => stored && ids.includes(requestId) ? [ack] : [], listMessages: async () => [serverMessage(100)] }));
  await controller.sendMessage(c, 'Hola');
  await waitFor(() => controller.getState().pending[0]?.status === 'failed');
  await controller.refresh();
  assert.equal(sends, 1);
  assert.deepEqual(controller.getState().pending, []);
  assert.equal(controller.getState().histories[c].messages[0].clientMessageId, requestId);
});

test('manual retries use the original UUID and do not create duplicate bubbles', async () => {
  const attempted = [];
  const controller = await initialized(repository({ sendMessage: async message => { attempted.push(message.clientMessageId); if (attempted.length === 1) throw new Error('timeout'); return ack; } }));
  await controller.sendMessage(c, 'Hola');
  await waitFor(() => controller.getState().pending[0]?.status === 'failed');
  await controller.retryMessage(requestId);
  await waitFor(() => controller.getState().pending.length === 0);
  assert.deepEqual(attempted, [requestId, requestId]);
  assert.equal(controller.getState().histories[c].messages.length, 1);
});

test('switching accounts aborts an in-flight send and never publishes its late acknowledgement', async () => {
  const gate = deferred(); let context;
  const controller = await initialized(repository({ sendMessage: async (_message, request) => { context = request; return gate.promise; } }));
  await controller.sendMessage(c, 'Hola');
  await waitFor(() => !!context);
  controller.setSession(b, 'token-b');
  assert.equal(context.signal.aborted, true);
  assert.equal(context.accessToken, 'token-a');
  gate.resolve(ack);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().userId, b);
  assert.deepEqual(controller.getState().pending, []);
  assert.deepEqual(controller.getState().histories, {});
});

test('an account switch during persistence cannot transmit under the new account', async () => {
  const gate = deferred(); let writing = false; let sends = 0;
  const controller = await initialized(repository({ sendMessage: async () => { sends++; return ack; } }), storageMemory({ setItem: async () => { writing = true; await gate.promise; } }));
  const sending = controller.sendMessage(c, 'Hola');
  await waitFor(() => writing);
  controller.setSession(b, 'token-b');
  gate.resolve();
  await assert.rejects(sending);
  assert.equal(sends, 0);
  assert.deepEqual(controller.getState().pending, []);
});

test('older pages use the oldest exclusive sequence and survive subsequent newest-page refreshes', async () => {
  const cursors = []; let end = 100;
  const controller = await initialized(repository({ listMessages: async (_id, before) => { cursors.push(before); return Array.from({ length: 50 }, (_, index) => serverMessage((before === null ? end - 49 : before - 50) + index)); } }));
  await controller.openConversation(c);
  await controller.loadOlder(c);
  end = 101;
  await controller.openConversation(c);
  assert.deepEqual(cursors, [null, 51, null]);
  assert.equal(controller.getState().histories[c].messages.length, 101);
  assert.equal(controller.getState().histories[c].hasMore, false);
});

test('read acknowledgement stays at the visible snapshot when another message arrives concurrently', async () => {
  const gate = deferred(); const read = []; let latest = 1;
  const controller = await initialized(repository({ getConversation: async () => ({ ...conversation, lastSeq: latest, unreadCount: latest > 1 ? 1 : 0 }), listMessages: async () => Array.from({ length: latest }, (_, index) => serverMessage(index + 1)), markRead: async (_id, seq) => { read.push(seq); await gate.promise; } }));
  await controller.openConversation(c);
  const marking = controller.markRead(c, 1);
  latest = 2;
  gate.resolve();
  await marking;
  assert.deepEqual(read, [1]);
  assert.equal(controller.getState().conversations[0].unreadCount, 1);
});

test('refresh retries failed local acknowledgement cleanup without retransmitting the confirmed message', async () => {
  let failCleanup = true; let sends = 0;
  const storage = storageMemory();
  const write = storage.setItem;
  storage.setItem = async (key, raw) => { if (failCleanup && JSON.parse(raw).pending.length === 0) throw new Error('disk unavailable'); await write(key, raw); };
  const controller = await initialized(repository({ sendMessage: async () => { sends++; return ack; } }), storage);
  await controller.sendMessage(c, 'Hola');
  await waitFor(() => controller.getState().pending.length === 0 && !!controller.getState().error);
  assert.equal(JSON.parse([...storage.values.values()][0]).pending.length, 1);
  failCleanup = false;
  await controller.refresh();
  assert.equal(JSON.parse([...storage.values.values()][0]).pending.length, 0);
  assert.equal(controller.getState().error, null);
  assert.equal(sends, 1);
});

test('concurrent composer submissions persist both messages before serialized transport', async () => {
  let next = 0;
  const gate = deferred(); const sent = [];
  const storage = storageMemory();
  const controller = createMessagingController(repository({ sendMessage: async message => { sent.push(message); await gate.promise; return { ...ack, id: message.clientMessageId, clientMessageId: message.clientMessageId, body: message.body, seq: sent.length }; } }), storage, { createId: () => `33333333-3333-4333-8333-${String(++next).padStart(12, '0')}` });
  controller.setSession(a, 'token-a'); await controller.refresh();
  await Promise.all([controller.sendMessage(c, 'Primero'), controller.sendMessage(c, 'Segundo')]);
  assert.equal(JSON.parse([...storage.values.values()][0]).pending.length, 2);
  gate.resolve();
  await waitFor(() => controller.getState().pending.length === 0);
  assert.deepEqual(sent.map(item => item.body), ['Primero', 'Segundo']);
});

test('a queued message from the old account is never sent after switching accounts', async () => {
  let next = 0; const gate = deferred(); const tokens = [];
  const controller = createMessagingController(repository({ sendMessage: async (message, context) => { tokens.push(context.accessToken); await gate.promise; return { ...ack, clientMessageId: message.clientMessageId, body: message.body }; } }), storageMemory(), { createId: () => `33333333-3333-4333-8333-${String(++next).padStart(12, '0')}` });
  controller.setSession(a, 'token-a'); await controller.refresh();
  await controller.sendMessage(c, 'Uno'); await controller.sendMessage(c, 'Dos');
  await waitFor(() => tokens.length === 1);
  controller.setSession(b, 'token-b'); gate.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tokens, ['token-a']);
  assert.deepEqual(controller.getState().histories, {});
});

test('a new acknowledgement beyond a history gap keeps that missing range reachable by pagination', async () => {
  let newest = 10;
  const controller = await initialized(repository({ sendMessage: async () => ({ ...ack, seq: 101 }), listMessages: async (_id, before) => {
    const end = before === null ? newest : before - 1;
    const start = Math.max(1, end - 49);
    return Array.from({ length: end - start + 1 }, (_, index) => serverMessage(start + index, start + index === 101 ? { clientMessageId: requestId, senderId: a, body: 'Hola' } : {}));
  } }));
  await controller.openConversation(c);
  await controller.sendMessage(c, 'Hola');
  await waitFor(() => controller.getState().pending.length === 0);
  newest = 101;
  await controller.openConversation(c);
  assert.equal(controller.getState().histories[c].messages[0].seq, 52);
  assert.equal(controller.getState().histories[c].hasMore, true);
  await controller.loadOlder(c);
  await controller.loadOlder(c);
  assert.equal(controller.getState().histories[c].messages.length, 101);
  assert.equal(controller.getState().histories[c].hasMore, false);
});

test('an old outbox receipt does not create an inaccessible hole before the loaded recent page', async () => {
  let receipts = false;
  const controller = await initialized(repository({ findSentMessages: async () => receipts ? [ack] : [], listMessages: async () => Array.from({ length: 50 }, (_, index) => serverMessage(index + 52)) }), storageMemory({ getItem: async () => JSON.stringify({ version: 1, ownerId: a, pending: [pending] }) }));
  await controller.openConversation(c);
  receipts = true;
  await controller.refresh();
  assert.deepEqual(controller.getState().pending, []);
  assert.equal(controller.getState().histories[c].messages[0].seq, 52);
  assert.equal(controller.getState().histories[c].hasMore, true);
});

test('late read metadata cannot undo a block confirmed while that metadata was in flight', async () => {
  let hold = false; let reading = false; const gate = deferred();
  const controller = await initialized(repository({ getConversation: async () => { if (hold) { reading = true; return gate.promise; } return conversation; }, listMessages: async () => [serverMessage(1)] }));
  await controller.openConversation(c);
  hold = true;
  const marking = controller.markRead(c, 1);
  await waitFor(() => reading);
  await controller.setBlocked(c, true);
  gate.resolve(conversation);
  await marking;
  assert.equal(controller.getState().conversations[0].blockedByMe, true);
  assert.equal(controller.getState().conversations[0].canSend, false);
});

test('the bounded outbox refuses a 51st message before storage or network mutation', async () => {
  let writes = 0; let sends = 0;
  const saved = Array.from({ length: 50 }, (_, index) => ({ ...pending, clientMessageId: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}` }));
  const controller = await initialized(repository({ sendMessage: async () => { sends++; return ack; } }), storageMemory({ getItem: async () => JSON.stringify({ version: 1, ownerId: a, pending: saved }), setItem: async () => { writes++; } }));
  await assert.rejects(controller.sendMessage(c, 'Hola'), /50 mensajes/);
  assert.equal(controller.getState().pending.length, 50);
  assert.equal(writes, 0); assert.equal(sends, 0);
});
