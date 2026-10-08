# Tasks 3 and 4 — fix round 1

Review base: `e39c059`. Implementation commit: `a1b44cecbc8b219620ddc60cda4684d1644bdd04` (`fix: preserve agency review identity and refresh team authority`).

## Findings resolved

1. Owner verification queues preserve each listed request ID, including rejected historical requests after resubmission. Optional `p_request_id` on the bounded owner-only detail RPC is restricted to the requested agency; the typed helper rejects a missing/mismatched ID. Queue cards use request ID as key. Choosing and confirming a queued decision rereads that exact ID and version; closed historical requests have no grant/rejection controls. Direct grant/revoke under approved agencies use latest detail instead.
2. Owner queue requests carry a local view/focus epoch. Filter, section, page changes and blur invalidate old success, error and finally updates. Re-tapping the same filter does not strand loading. Account checkpoints remain in force.
3. Team loads refresh server authority before capturing read contexts. The approved stable provider `getCurrentWorkspace(): AgencyWorkspaceState` reads the existing controller snapshot after the await, so current agency/generation/member role govern the fetch and its record key. Generation changes do not create a focus/dependency refresh loop. Lost permission or failed reads clear private records and administrator controls; reduced roles adopt the new scope while keeping the valid selected agency.
4. Team action and read captures are inside try with nullable context cleanup, gated for suspended/missing sessions. The same concrete unsafe captures in application, owner reviews, verification, AuthScreen continuation and AuthCallbackScreen were moved inside their existing error boundary and given session/suspension guards.
5. Verification records, draft/error/loading visibility and focused requests are keyed by actor + agency + controller generation. Same-role membership version changes invalidate the previous private response and draft, while normal authority refresh preserves a still-valid selected agency.
6. Added the requested invitation-role mismatch regression. It passed against the existing repository validation, so no unnecessary repository production change was made.

## Files

`src/agencies/AgencyProvider.tsx`, `review.ts`, new `screenRequests.ts`; the affected application, reviews, team, verification, callback and Auth screens; migration `20261007000200_agency_registration_memberships.sql`; SQL assets fixture; `agency-registration-flow.test.ts`, `agency-repository.test.ts`, new `agency-screen-requests.test.ts`.

## Tests and evidence

- Focused initial run observed six failures for missing historical request-ID selection and the new request-scope/team authority behaviors. The invitation-role mismatch case was already green. After implementation the focused run was 25/25 green; added a real controller same-admin membership version renewal case afterward.
- Deliberately reversed owner view responses leave the current data/loading state unchanged by the older response; blur invalidates the current ticket too.
- Team fixture uses the real agency controller: foreground membership removal clears members/active membership; reduced role refresh adopts manager authority and retains the selected agency; an unavailable session rejects safely.
- Local PostgreSQL exercises rejected-request then fresh resubmission: explicit old ID stays rejected, unspecified detail defaults to latest. The first SQL run caught a fixture ordering ambiguity because both inserts use `now()` inside one test transaction; the fixture now assigns the historical record an earlier timestamp explicitly. No production timestamp behavior was changed.
- Final `node scripts/local-sql/run-agency-suites.mjs --phase foundation`: all five suites PASS with rollback and `inventoryUnchanged:true` (foundation, registration, verification, memberships, assets).
- Final `npm run check`: TypeScript PASS; **475/475 tests PASS**, no failures/skips.
- The first full check after root's physical dependency copy had `router-query-security.test.ts` fail for missing installed `decode-uri-component`, with 473/474 pass. Root restored the same committed local vendor package into its installed slot, without lock or dependency changes. The repeated full check above was justified by this environment failure and passed.
- `git diff --check` clean; only the fourteen fix paths explicitly staged. No other tracked edits included.

## Boundaries

No agents, external messaging, production backend writes, deployment or activation by this implementer. These fixes do not claim rendered mobile/desktop, actual email callbacks or authenticated Storage HTTP evidence; integrated rendered and persisted journeys remain assigned to Task 14. Root performed the dependency copy and manages remote/preflight work independently.
