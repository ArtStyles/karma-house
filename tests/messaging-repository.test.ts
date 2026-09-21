// @ts-nocheck -- Run against the real Supabase query builder with an injected transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseMessagingRepository } from '../src/messaging/repository.ts';

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const row = { id: conversationId, propertyId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', propertyTitle: 'Casa', propertyLocation: 'La Habana', buyerId: actor, sellerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', otherUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', otherName: 'Vendedor', lastMessage: null, lastMessageAt: null, lastSeq: 0, unreadCount: 0, blockedByMe: false, blockedByOther: false, canSend: true, propertyAvailable: true, createdAt: '2026-09-18T12:00:00.000Z' };

test('repository pins the captured JWT and actor while fetching all inbox pages', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const client = createClient('https://example.supabase.co', 'test-publishable', {
    accessToken: async () => 'different-current-account-token',
    global: { fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), header: new Headers(init.headers).get('Authorization'), signal: init.signal });
      const rows = calls.length === 1 ? Array.from({ length: 50 }, (_, index) => ({ ...row, id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}` })) : [];
      return Response.json(rows);
    } },
  });
  const result = await createSupabaseMessagingRepository(client).listConversations({ userId: actor, accessToken: 'captured-original-token', signal, checkpoint() {} });
  assert.equal(result.length, 50);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].header, 'Bearer captured-original-token');
  assert.equal(calls[1].body.p_actor_id, actor);
  assert.equal(calls[1].body.p_offset, 50);
  assert.equal(calls[0].signal, signal);
});

test('a changed session prevents the repository from starting any transport', async () => {
  let requests = 0;
  const client = createClient('https://example.supabase.co', 'test-publishable', { accessToken: async () => 'token', global: { fetch: async () => { requests++; return Response.json([]); } } });
  const repository = createSupabaseMessagingRepository(client);
  await assert.rejects(repository.listConversations({ userId: actor, accessToken: 'token', signal: new AbortController().signal, checkpoint() { throw new Error('KH_ACCOUNT_CHANGED'); } }));
  assert.equal(requests, 0);
});

test('server text preserves Unicode, line breaks and PostgreSQL UUID forms without poisoning history', async () => {
  const message = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', conversationId, senderId: actor, clientMessageId: '00000000-0000-0000-0000-000000000000', seq: 1, body: `\n${'🏠'.repeat(1500)}\n`, createdAt: '2026-09-18T12:00:00.000Z' };
  const client = createClient('https://example.supabase.co', 'test-publishable', { accessToken: async () => 'token', global: { fetch: async () => Response.json([message]) } });
  const result = await createSupabaseMessagingRepository(client).listMessages(conversationId, null, { userId: actor, accessToken: 'token', signal: new AbortController().signal, checkpoint() {} });
  assert.deepEqual(result, [message]);
});
