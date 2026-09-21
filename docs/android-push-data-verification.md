# Android push backend verification — 2026-09-20

## Scope and current state

Implementation covers the private installation registry, versioned anonymous revocation, authenticated notification resolver, durable notification/device outbox, Expo ticket/receipt reconciliation and one scheduled SQL worker. The transport starts disabled. This does not claim device reception, an APK test or delivery exactly once.

The reviewed migration is **applied** and transport is **enabled** following explicit root authorization, successful remote regression/concurrency checks, exact fixture cleanup and real Supabase-to-Expo connectivity. No real HTTP push was sent to a device. Scheduled-job health is checked separately below.

Migration: `supabase/migrations/20260920000500_android_push.sql`.

Reviewed SHA-256: `b04acc701f31f1f5c5ee7d0427ea37b6dea667b560868b2e670e7298d64d4316`.

## Design boundaries

- Exact public RPCs: `kh_register_push_device`, `kh_disable_push_device`, `kh_resolve_push_notification`. Registration verifies the captured actor and a live `auth.sessions` row from the JWT session claim. Anonymous callers can only revoke by presenting the installation secret.
- Only SHA-256 installation-secret hashes are stored. A same-revision registration must match its original owner, session and token; renewal extends the lease to 30 days. Lower revisions fail. Disable tombstones survive both Auth-session and account deletion.
- `push_devices`, `push_outbox`, `push_http_attempts` and `push_config` are private and have RLS with no client table grants. Worker helpers are unavailable to anon/authenticated/service_role.
- Outbox identity captures recipient, Auth session, installation revision and token digest. A replacement account/token cannot receive an older generation's queued notification. The notification FK cascades private event data on deletion. The installation is a snapshot rather than an FK, avoiding reverse device-row locks when chat enqueues an event.
- No historical notification backfill. Enqueue snapshots only currently registered devices. New sends recheck session, lease, generation, notification read state, preferences and block visibility.
- Dispatch takes a fixed, bounded candidate set, all its chat-pair locks in canonical order, then recipient locks, registry lock and rows. This follows the existing chat ordering. A block/preference/read confirmation cannot pass the dispatch transaction's boundary.
- Session/lease checks use the current clock after lock waits. Receipt reconciliation checks generation separately from eligibility for a new send: reading, muting or blocking after sending does not suppress receipt processing.
- The only external URLs are Expo `/push/send` and `/push/getReceipts`. Payloads have generic category text, fixed channel, TTL 3600, stable tag/collapse ID and only notification/recipient routing identifiers. No user names, property titles, message text, amounts or notes enter push payloads.
- Durable attempts track pg_net request IDs and recover unknown/lost responses. Six bounded attempts with backoff; receipt polling starts after 15 minutes. Known permanent failures become operational failures, while `DeviceNotRegistered` revokes only the matching generation. Raw provider bodies/errors are not persisted in durable tables.
- The worker schedules one named `karmahouse-push-delivery` job every 30 seconds, with a harmless disabled configuration on install. It purges old terminal jobs and clears expired device registrations while preserving tombstones.
- pg_net's transport tables are UNLOGGED. Ambiguous acceptance before a network failure can result in an external duplicate after retry. A notification already handed to a provider cannot be recalled; authenticated tap resolution and generic text protect account changes.

## Verified evidence

1. Exact Expo57 docs were read before implementation. Read-only preflight confirmed PostgreSQL17.6, pg_cron1.6.4/pg_net0.20.4 available and preloaded, Vault0.3.1 installed, no existing cron jobs, and the expected Auth-session schema.
2. Both extensions were successfully created inside a rollback transaction, then reverted. No job or extension was left installed by preflight.
3. SQL tests were written first. The initial remote run failed as intended with `PUSH ASSERTION: registration RPC must exist`.
4. Regression tests exposed receipt-rate retries incorrectly polling the same failed receipt, and receipt reconciliation incorrectly suppressed by read/preferences/block changes. Both were corrected. Review additionally identified and resolved lock-order and elapsed-clock races before any apply.
5. Final `apply-android-push.mjs --test` passed four suites: `messaging`, `negotiations`, `notifications` and `android_push`. Log: `docs/android-push-sql-rollback.log`. After rollback, `installed:false`, all data digests/counts including `auth.sessions` unchanged, and zero reserved fixture users.
6. SQL cases cover live/wrong/revoked sessions; secret/revision/owner protection; token conflict; same-generation lease renewal; anonymous revocation and tombstone replay; no backfill; private resolver without read side effect; generic payloads; reading/category/block/disable suppression; receipt reconciliation after reading/muting/blocking; six-attempt cap; malformed and missing HTTP responses; current/old generation dead-device responses; and elapsed Auth expiry.
7. Independent reviewer re-read the final SQL and closed all three actionable findings, with no new P1/P2 static findings.
8. `apply-android-push.mjs --apply` applied the exact reviewed SHA and reran all four suites successfully. Existing migration003/004 checksums, all table digests/counts and zero-fixture conditions were preserved. One active 30-second job was installed with transport disabled. Log: `docs/android-push-sql-apply.log`.
9. `verify-android-push.mjs --exercise` passed eight checks against the deployed database. Controlled barriers proved block, preference and mark-read confirmations wait behind the dispatch transaction; registration rechecks Auth expiry after a registry wait; worker rechecks device-lease expiry after a wait and emits no HTTP; concurrent registration/revocation preserves the tombstone; and overlapping workers return busy. Mock HTTP/function/config changes were rolled back. All exact reserved accounts, sessions, notification data and the deliberately retained installation tombstone were deleted. The complete inventory equals its original baseline. Logs: `docs/android-push-concurrency-verify.log`, `docs/android-push-concurrency-baseline.json`.
10. `verify-android-push.mjs --connectivity` invoked the real private transport helper from PostgreSQL with `getReceipts` and `ids:[]`. After its autocommit, pg_net returned HTTP200 with `data:{}`. Only that response row was deleted. This verifies outbound HTTPS from Supabase, not merely this computer; zero recipients and zero push sends. Log: `docs/android-push-connectivity.log`.
11. `verify-android-push.mjs --enable` enabled transport at `2026-09-21T02:57:35.386Z`, after all checks and cleanup. At activation there were zero registered installations, outbox jobs and HTTP attempts. Log: `docs/android-push-activation.log`.
12. Two actual scheduled runs after activation succeeded: `2026-09-21T02:58:04.859Z` and `2026-09-21T02:58:34.873Z`. Final inventory equals the pre-concurrency baseline; reserved fixtures, devices, outbox, durable HTTP attempts, pg_net queue and pg_net responses are all zero. No simulated delivery escaped rollback and no real push was sent. Log: `docs/android-push-active-health.log`.

## Operational runner and outstanding evidence

`scripts/apply-android-push.mjs` validates frozen migration003/004 checksums, migration005 checksum/idempotency, baseline tables and one expected job. `--test` rolls everything back; `--apply` is a separate explicit operation.

`scripts/verify-android-push.mjs` passed `node --check` and supports:

- No flag: deployed checksum, ACL, one-job configuration and recent job-status metadata; never logs job commands or tokens.
- `--connectivity`: an Expo receipt request through the deployed PostgreSQL helper and pg_net, with an empty ID list, zero destinations and zero sends. Polls the exact response for at most 30 seconds and deletes only its own response.
- `--exercise`: requires transport disabled and no unrelated pending jobs; creates exact reserved `881...` fixture records. The worker's mocked transport and enabled setting exist only in a rolled-back worker transaction. Separate connections test block/preference/read acknowledgments at the actual dispatch boundary, session/lease expiry after waits, duplicate/stale registry requests and competing-worker exclusion. Cleanup also removes the deliberately retained fixture tombstone and compares the complete inventory.
- `--enable` / `--disable`: explicit transport toggles after checksum/job verification, returning the server timestamp for subsequent scheduled-health verification.

Pending: physical Android reception. The root task owns integrated client/UI tests, exports and APK verification. Provider acceptance must never be presented as evidence of display on a physical Android device.
