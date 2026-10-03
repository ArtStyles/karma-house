# Owner administration implementation plan

Goal: deliver the requested owner account, server permissions, private identity
and in-app administration. Execution: inline in the current authorized task.
Spec: ../specs/2026-09-30-owner-administration-design.md

Architecture: private owner/suspension/audit tables, server-side guards and narrow
administration RPCs; React Native routes consume actor-pinned requests.
Stack: existing Expo/React Native/TypeScript/Supabase. No dependencies added.

## Constraints and rulings

- Preserve current uncommitted data-saver and sort-menu work on the existing
  codex branch; do not reset, move it or create an incomplete checkout.
- Explicit user request authorizes implementation and owner enrollment. The
  suspension behavior was separately confirmed. No further routine approval.
- Owner enrollment is an operational parameter, not an email embedded in clients.
- Full suspension means writes/publications/messages blocked, public ads hidden;
  account access remains available to explain the restriction and allow deletion.
- No changing real users or ads for test fixtures. SQL suites roll back.

## Tasks

- [x] Server: add `supabase/tests/owner_administration.sql`; demonstrate missing
  owner capability. Implement `20261003000100_owner_administration.sql` with
  private roles, suspension, audit, auto-publication and protected profile API.
  Add `scripts/apply-owner-administration.mjs` with rollback default and explicit
  commit, operational email argument and verification. Run SQL suite.
- [x] Client: add `src/admin` request/validation hook, owner state in AuthProvider,
  administration hub/users/listings/history routes, public identity-only profile
  rendering, publication copy and suspension messaging. Add behavioral tests for
  profile decoding and administration permissions/session handling.
- [x] Verify: full `npm run check`, SQL regressions, mobile/desktop public UI; independent
  review of privilege/privacy boundaries and fix findings.
- [x] Deliver: transactional remote migration+owner enrollment and verification,
  versioned signed APK validation and USB installation, evidence documentation.

Validation limitation: authenticated administration visual QA was blocked by
automatic review of the fixture preview launch. Public real-backend UI was checked;
privileged mutations were verified in rollback SQL tests, not against real users.
Evidence: ../../owner-administration-verification.md.

## Review focus

Old sessions must not bypass suspension. New users cannot grant themselves roles.
Admin changes cannot affect the owner. Network responses cannot cross accounts.
No public profile endpoint/table projection may reveal owner email or timestamps.
Drafts and repeated publication requests must preserve their original semantics.
