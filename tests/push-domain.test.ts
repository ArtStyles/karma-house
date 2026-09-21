import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePushPayload, sessionFromAccessToken } from '../src/push/domain.ts';

const userId = '51000000-0000-4000-8000-000000000001';
const sessionId = '51000000-0000-4000-8000-000000000002';
const payload = { kind: 'karmahouse.notification', notificationId: sessionId, recipientId: userId };

test('push payload accepts only the exact internal notification contract', () => {
  assert.deepEqual(parsePushPayload(payload), payload);
  for (const value of [null, [], {}, { ...payload, url: 'https://evil.test' }, { ...payload, conversationId: sessionId }, { ...payload, kind: 'url' }, { ...payload, notificationId: '../admin' }, { ...payload, recipientId: 123 }]) {
    assert.equal(parsePushPayload(value), null);
  }
});

test('session identity comes from matching JWT subject and session_id', () => {
  const token = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
  const accessToken = token({ sub: userId, session_id: sessionId });
  assert.deepEqual(sessionFromAccessToken(userId, accessToken), { userId, sessionId, accessToken });
  assert.equal(sessionFromAccessToken(sessionId, accessToken), null);
  assert.equal(sessionFromAccessToken(userId, token({ sub: userId })), null);
  assert.equal(sessionFromAccessToken(userId, 'broken'), null);
});
