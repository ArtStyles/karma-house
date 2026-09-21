// @ts-nocheck -- Pure domain tests use Node's TypeScript stripping.
import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgedPending, decodeOutbox, mergeMessages, normalizeMessageBody } from '../src/messaging/domain.ts';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clientMessageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const pending = { conversationId, clientMessageId, senderId: owner, body: 'Hola', createdAt: '2026-09-18T14:00:00.000Z', status: 'sending' };
const message = { ...pending, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', seq: 1 };

test('outbox hydration restores unsent messages for manual retry and rejects another account', () => {
  const raw = JSON.stringify({ version: 1, ownerId: owner, pending: [pending] });
  const result = decodeOutbox(raw, owner);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'failed');
  assert.equal(result[0].clientMessageId, clientMessageId);
  assert.throws(() => decodeOutbox(raw, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
  assert.throws(() => decodeOutbox('{', owner));
});

test('message validation retains the text while bounding empty or oversized sends', () => {
  assert.equal(normalizeMessageBody('  Hola\n¿Está disponible?  '), 'Hola\n¿Está disponible?');
  assert.throws(() => normalizeMessageBody(' \n '));
  assert.throws(() => normalizeMessageBody('a'.repeat(2001)));
});

test('server acknowledgements replace matching retry identity but never discard changed payloads', () => {
  assert.equal(acknowledgedPending(pending, message), true);
  assert.equal(acknowledgedPending(pending, { ...message, body: 'Otro texto' }), false);
  assert.equal(acknowledgedPending(pending, { ...message, senderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }), false);
  const later = { ...message, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', clientMessageId: '99999999-9999-4999-8999-999999999999', seq: 2 };
  assert.deepEqual(mergeMessages([later, message], [message]).map(item => item.seq), [1, 2]);
});
