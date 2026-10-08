# Task 3 implementation report

Implementation commit: `4a74708b79aec1f36de04b189e3a43eb4f974a68` (`feat: add agency registration and owner review screens`).

## Scope and files

- AuthProvider optional fourth signup parameter preserves three-parameter personal callers; normalized agency application is copied by the existing server signup trigger, with only `display_name` used for the public personal name.
- AuthScreen personal/agency selector is shown only when the server public registration boolean permits it. Agency form has field errors, private responsible name and evidence labels, office privacy, confirmation explanation and no pending workspace actions.
- AuthCallbackScreen recovers the application from the server with captured account context after confirming email, including on another device. Recovery/password-reset and personal pending destinations remain compatible. Web credentials are removed before the agency lookup; late focused-screen navigation is guarded.
- `src/agencies/registration.ts`, `assets.ts`, `review.ts` supply pure routing/presentation permissions, pinned private JPEG upload/signing and bounded owner review detail.
- `AgencyRegistrationFields`, `AgencyVerifiedBadge`; application, owner reviews and verification screens; `/agency-application`, `/agency-reviews`, `/agency-verification` routes; owner-only Administration entry.
- `20261007000200_agency_registration_memberships.sql`, `agency_assets.sql` and `agency-registration-flow.test.ts`.
- The controller/provider, workspace/team screens, ProfileScreen, root layout and shared agency repository/types were left to the root implementer.

## Approved small plan corrections

1. Added `kh_agency_registration_available()` callable by anon/authenticated, returning only the module-enabled JSON boolean. Existing confirmed-session capabilities cannot serve signup.
2. Added AuthCallbackScreen to Task 3 ownership so an email callback on another device actually queries the existing server application instead of bypassing registration routing.
3. Added bounded owner-only `kh_agency_review_detail(actor,agency)` plus typed scoped helper: verification queue responses contain request IDs but lack concrete agency name/current versions for review confirmation. This avoids unbounded agency lookup and permits direct grant/revoke without own membership.
4. At root request, existing member/invitation projectors now include public `displayName`/`agencyName` for the authorized team/recipient views, with no email or responsible identity leakage. Root owns matching shared decoders/types.

## Verification and RED/GREEN evidence

- Read exact Expo SDK 57 documentation (`https://docs.expo.dev/versions/v57.0.0/`) before writing code; reused installed Expo picker/manipulator preprocessing.
- Initial eight required behavioral tests: observed 0/8 before registration helpers existed, then 8/8 after implementation. Cases cover compatible personal metadata/routes, second-device server recovery, pending/corrections/rejected/suspended routing, private identity, owner-only review, pending badge, admin-only requests and independent personal verification.
- Logo upload tests: observed 8 passing/2 failing before assets helper, then 10/10; captured JWT, exact agency path, JPEG signature/1 MiB and account-change rejection.
- Owner detail test: observed 10 passing/1 failing before helper, then 11/11; additional stale-response assertion exercises existing scoped transport behavior.
- Private preview test: observed missing `sign` failure, then final 13/13, with same-origin/exact-path/session signing and traversal rejection.
- Assets SQL initially failed for missing public signup capability, then passed after private bucket/policies/RPC. Owner detail test initially failed for absent function, then passed with ordinary moderator rejected. Label assertions initially failed for missing projected names, then passed after SQL projectors were updated.
- `node scripts/local-sql/run-agency-suites.mjs --phase foundation`: all five suites PASS (foundation, registration, verification, memberships, assets), transaction rollback and `inventoryUnchanged:true` for each.
- `npm run check`: typecheck PASS, full TypeScript suite **467/467 PASS**, zero failures/skips.
- `git diff --check`: clean before commit. Owned paths explicitly staged; root uncommitted Task 4 files preserved.
- Self-review corrected a nullable display guard, UTF-8 read encoding, delayed AuthScreen focus navigation, early web callback credential cleanup and the actual profile table name (`public.profiles`).

## Behavior and limitations

Initial approval and verification remain separate. Review confirmation names the concrete agency, decision, scope and visible reason; rereads server queues after review. Direct grant/revoke are supported. Admin-only verification reads pending/needs-changes/rejected/verified states, corrects references and explains individual review vs direct publication. Badge returns null when not currently verified and uses `Icon` checkmark-circle, theme green and accessible agency label. Personal badge code is untouched.

Pending logos are private to applicant/owner; public storage read/signing authorization admits only the approved agency's currently referenced logo. Unreferenced assets and suspended agency logos remain private. Pending upload requires confirmed session and identified application. Evidence stays in scoped private RPC data and is never downloaded/interpreted automatically.

No rendered mobile/desktop, reader, native picker, real email callback or authenticated Storage HTTP service evidence is claimed here. These integrated rendered/persisted journeys remain for Task 14. SQL fixture checks establish real local DB/RLS behavior, while private signing/upload transport checks use synthetic fetch responses. If upload succeeds but attachment conflicts, the unused asset remains private; lifecycle/cleanup is outside this UI task. No production backend, deployment, push or activation was performed by this agent; root owns final full-plan activation/preflight.
