// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNotificationSequence, isNotificationSequence, notificationErrorMessage } from '../src/notifications/domain.ts';
test('sequence validation and comparison preserve bigint precision', () => {
  assert.equal(compareNotificationSequence('9007199254740993', '9007199254740992'), 1);
  assert.equal(compareNotificationSequence('9', '10'), -1);
  assert.equal(compareNotificationSequence('0', '0'), 0);
  assert(isNotificationSequence('9223372036854775807'));
  assert(isNotificationSequence('0', true));
  for (const invalid of ['0', '01', '-1', '1.0', '1e2', '9223372036854775808', 1, null]) assert.equal(isNotificationSequence(invalid), false);
});
test('notification errors distinguish stale preferences, account and transport failures', () => {
  assert.match(notificationErrorMessage({message:'KH_NOTIFICATION_PREFERENCES_CONFLICT'}), /cambiaron/);
  assert.match(notificationErrorMessage(new Error('KH_ACCOUNT_CHANGED')), /sesión/);
  assert.match(notificationErrorMessage(new Error('Failed to fetch')), /conectar/);
});
