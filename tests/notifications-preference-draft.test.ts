import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileNotificationPreferenceDraft } from '../src/notifications/preferenceDraft.ts';
import type { NotificationPreferences } from '../src/notifications/types.ts';

const original: NotificationPreferences = { messages: true, visits: true, offers: true, version: 0 };

test('a clean settings form follows preferences refreshed by another session', () => {
  const next = { ...original, offers: false, version: 1 };
  assert.deepEqual(reconcileNotificationPreferenceDraft(original, original, next), next);
});

test('a distinct unsaved preference keeps its choices and expected version for conflict detection', () => {
  const draft = { ...original, messages: false };
  const next = { ...original, offers: false, version: 1 };
  assert.deepEqual(reconcileNotificationPreferenceDraft(draft, original, next), draft);
});

test('a remotely confirmed matching draft adopts the new version before the next edit', () => {
  const draft = { ...original, messages: false };
  const confirmed = { ...draft, version: 1 };
  const reconciled = reconcileNotificationPreferenceDraft(draft, original, confirmed);
  assert.deepEqual(reconciled, confirmed);
  assert.equal({ ...reconciled, offers: false }.version, 1);
});
