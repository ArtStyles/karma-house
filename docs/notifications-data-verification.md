# Notifications data verification — 2026-09-20

Scope: private in-app notification events, explicit message/negotiation linkage, recipient inbox and count, explicit reads and versioned preferences. No push, worker, cron, external messages or historical backfill.

## Contract and preservation

- Client contract: `src/notifications/types.ts`. `recipientId` is checked against the captured account. JWT, actor, AbortSignal and session checkpoint are fixed per request. Sequences stay decimal strings, including values beyond JavaScript safe integers.
- RPCs: `kh_notification_summary`, `kh_list_notifications`, `kh_read_notification`, `kh_read_notifications_through`, `kh_get_notification_preferences`, `kh_save_notification_preferences`.
- Private tables: `kh_private.notifications` and `kh_private.notification_preferences`; neither authenticated users nor ordinary application administrators receive direct table access. Public RPCs derive the authenticated recipient and reject a mismatched captured actor.
- One message-insert trigger creates one notification. The nullable `kh_messages.negotiation_event_id` FK distinguishes structured events from ordinary message text. Public `kh_send_message` retains its signature; only the private persistence helper accepts a structured origin.
- The new migration replaces negotiation function definitions using their applied bodies, changing only the event UUID capture and summary-helper call. Existing receipt handling, row/actor/pair locks, time checks, rates and silent cancellation remain intact.
- Generic notification text contains no original message, negotiation note or amount. Only the existing conversation title and actor display-name snapshots are included.
- Sequence assignment is serialized by a dedicated recipient lock before `nextval`. Mark-all updates only existing visible rows up to a server-provided cutoff; no persistent implicit-read watermark exists. Preferences use the same recipient lock; desired identical fields accept lost-ACK retries despite a stale expected version.
- Inventory compares row counts and SHA-independent content digests for 20 tables, including auth, profiles, listings, favorites, administration, request receipts, storage, messaging, negotiations and new notifications. The newly added message column is normalized to JSON null before/after schema installation so existing contents remain comparable. Every other column is hashed.

## Evidence

1. Domain/repository tests were written first and initially failed with missing modules. After implementation, all 9 targeted tests pass: bigint precision, captured identity/JWT/abort, wrong-recipient rejection, page consistency (including a complete 30-item seek page above the JavaScript safe-integer boundary), explicit reads and preference confirmation.
2. TypeScript passed after the repository implementation. The final integrated suite/export are coordinated by the root task.
3. Remote preflight ran existing regressions and reached the expected missing `kh_notification_summary` error before migration. An initial connection timeout was followed by a successful retry.
4. Two remote rollback runs passed messaging, negotiations and notification suites. The final run includes text imitation, replay, a single counterproposal event, generic payload privacy, blocking/read-all/unblock, category suppression, optimistic preference conflict, notification/chat read independence, unavailable/blocked silent cancellation, pagination and atomic rollback when notification creation fails.
5. Final rollback log: `docs/notifications-sql-rollback.log`. Migration `20260920000400_notifications.sql` SHA-256: `a9307bf072be3fb06d5c2499d1722165496379d3eee7aad0daa88434ed070811`.

6. After independent review and root authorization, `--apply` repeated all three rollback suites and committed the reviewed migration. `docs/notifications-sql-apply.log` confirms the same checksum and complete baseline preservation. Existing messages kept null origins and no historical notifications were generated.
7. The first concurrent verifier was interrupted while connecting an additional actor session, before race assertions. The exact reserved `771...` fixture accounts were removed through a fresh connection, and the full inventory was compared successfully with the applied baseline. The verifier now handles idle connection errors and uses a fresh cleanup connection; SQL was not changed.
8. The second `verify-notifications.mjs --exercise` completed successfully, exit 0. `docs/notifications-concurrency-verify.log` confirms:
   - deployed checksum and closed private grants;
   - simultaneous identical message requests produce one notice;
   - two different senders targeting the same recipient serialize before sequence allocation, with uncommitted notices invisible;
   - a read-all request waiting for a later insert commits only its captured cutoff and leaves the newer notice unread;
   - conflicting preference updates have one winner; retrying its exact desired fields accepts the existing result;
   - a message waiting for the recipient lock observes preferences confirmed during that wait;
   - anonymous REST access is denied.
9. Final fixture cleanup restored every count and digest in all 20 baseline tables. Reserved fixture-user count is zero; notification and preference tables remain empty after cleanup. `docs/notifications-concurrency-baseline.json` retains the comparison baseline. The DB window was released to the root task for separate UI verification.

Backend/domain/repository and remote migration evidence are complete. Browser UI, integrated native exports and physical-device verification remain separate evidence owned by the root task; this document makes no physical-device or push-delivery claim.
