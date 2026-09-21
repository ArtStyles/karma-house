# Visits and offers: data verification

Date: 2026-09-20. Scope: domain, repository, PostgreSQL migration and server verification. No UI files or commits were made by this implementation task.

## Delivered contract

- `src/negotiations/types.ts`, `domain.ts`, `repository.ts` implement the agreed visit/offer types, one-page reads (30 records), captured actor/JWT/abort context, defensive decoding, action eligibility and localized errors.
- Offers use USD, positive values up to 1,000,000,000 with no more than two decimal places. A pending offer expires after seven days.
- Visits use `America/Havana`, real future dates within 180 days, and minute precision. Nonexistent times during the spring clock change are rejected; a repeated time chooses the standard-time occurrence, consistent with [PostgreSQL timestamp handling](https://www.postgresql.org/docs/current/datetime-invalid-input.html). Accepted visits retain their historical outcome after their start time.
- Only participants can read or act. Administrators have no broad access. The recipient can accept, decline or counter; the author can withdraw a pending proposal. Either participant can cancel an accepted proposal.
- Cancellation remains possible while blocked or while the property is unavailable, without adding another chat message. Cancellation cannot carry a replacement note, amount or date.
- Structured records are authoritative. Ordinary message text is never parsed into offers or visits. Summaries use the existing chat function in the same transaction, keeping older APKs compatible.

## Database release

Applied migration: `supabase/migrations/20260920000300_negotiations.sql`.

SHA-256: `d1e1556e62891548f9d2c55d8acfcf4a1a93efae4d9b411bf864b31ef38082d5`.

Application followed root and independent review. A review finding moved the expiry clock check after the property row lock: a response waiting behind an edit cannot accept a proposal that expired while it waited.

New tables:

- `public.kh_negotiations`: participant RLS and a unique partial index for one pending proposal per conversation/kind.
- `kh_private.negotiation_requests`: per-actor UUID receipts and canonical payloads.
- `kh_private.negotiation_events`: immutable event snapshots written with each successful action.

Receipts are checked before current expiry, blocking or availability checks, so lost acknowledgements remain recoverable. The original receipt is returned even if later actions changed the record; a subsequent list provides current state. Changed canonical content under the same actor/UUID is rejected. Acquisition order matches messaging: actor lock, participant-pair lock, conversation row, property row.

## Evidence

1. Preflight against the old deployment returned PostgreSQL `42883` because `kh_list_negotiations` did not exist.
2. The migration and SQL suite passed inside rollback-only transactions. After final review, the same hash passed `--apply` and was recorded in the migration/checksum ledger.
3. SQL assertions cover ownership and administrator isolation, direct-write denial, captured actor mismatch, invalid amounts/dates, only-recipient responses, alternatives, version conflicts, pending uniqueness, pagination, server-clock expiry, accepted past visits, blocked/unavailable cancellations, exact receipt replay after later transitions/expiry and atomic rollback when summary insertion deliberately fails.
4. `verify-negotiations.mjs --exercise` ran actual simultaneous requests using separate database connections. It confirmed:
   - identical UUID/payload produces one proposal and one message;
   - accepting versus withdrawing has one versioned winner;
   - counterproposal versus withdrawal is atomic;
   - two participants cannot create two pending visits;
   - a response was observed waiting on the property row lock, then rejected with `KH_NEG_EXPIRED` after the proposal expired during that wait.
5. Anonymous REST access to the new RPC was denied. Applied checksum and RPC/table grants were verified.

The concurrent verifier deleted only its reserved synthetic accounts and checked cascades plus the full baseline inventory. No fixture users or negotiations remained. Preserved real data included 2 auth users, 2 profiles, 1 property, 2 administrators, 1 conversation, 3 chat messages, 2 read cursors, 2 storage buckets and 3 storage objects. Hashes also covered favorites, invitations, avatar metadata, property-save receipts, blocks, reports and all three new tables.

Logs: `docs/negotiations-sql-rollback.log`, `docs/negotiations-sql-apply.log`, `docs/negotiations-concurrency-verify.log`. They contain counts, hashes and test outcomes, without credentials.

## Commands

Use the bundled Node runtime with:

```text
scripts/apply-negotiations.mjs --test       # migration if pending + SQL assertions, always rolled back
scripts/apply-negotiations.mjs --apply      # same tests, then commit and ledger
scripts/verify-negotiations.mjs            # read-only deployed checks
scripts/verify-negotiations.mjs --exercise # reserved synthetic concurrency fixtures + exact cleanup
```

The domain/repository tests live in `tests/negotiations-domain.test.ts` and `tests/negotiations-repository.test.ts`. UI rendering, authenticated REST journeys through the browser and physical-device behavior are verified separately by the parent task; this report does not claim those results.
