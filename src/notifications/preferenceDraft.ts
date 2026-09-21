import type { NotificationPreferences } from './types.ts';

export function sameNotificationChoices(left: NotificationPreferences, right: NotificationPreferences) {
  return left.messages === right.messages && left.visits === right.visits && left.offers === right.offers;
}

/** Keep intentional edits, but adopt the server version when those choices are confirmed. */
export function reconcileNotificationPreferenceDraft(draft: NotificationPreferences, previous: NotificationPreferences, next: NotificationPreferences) {
  return sameNotificationChoices(draft, previous) || sameNotificationChoices(draft, next) ? next : draft;
}
