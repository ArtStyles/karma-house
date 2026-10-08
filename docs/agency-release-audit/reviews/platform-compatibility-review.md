# Independent platform compatibility gate review

Reviewed candidate: `ab8da39496024b1d7ace1ff53a292bef1bb95992..3fab84a85633f9b841c505335d8bd8c2f7a0c7d8`.

Reviewer scope: the seven operator/manifest/test/documentation paths in `platform-review-ab8da39..3fab84a.diff`, the complete compatibility brief/report, sanitized catalog evidence, derivation/proof sources and saved execution logs. This is the R76/R77 platform gate while production remains OFF. It does not reopen the approved UI, native artifact, 43 SQL cases or 45 race cases. No hosted connection, private configuration, credentials, signing, source database modification, test rerun, Git mutation or publication was performed. The sole written deliverable is this private review. Read the exact [Expo 57 reference](https://docs.expo.dev/versions/v57.0.0/) before writing this deliverable; no Expo/product code is changed.

## Verdicts

**Specification compliance: PASS for the local platform compatibility gate.** The explicit profiles preserve the original literal pins and add the omitted helper identities; the hosted overlay is independently derivable from reviewed SQL creation/move/revoke semantics and the supplied platform defaults. The remediation is narrowly scoped, atomic, guarded by full before/post inventories and OFF. No discretionary privilege ignoring, Auth RLS weakening, ledger rewriting or product scope expansion was found.

**Code quality: PASS.** No actionable P0/P1/P2/P3 defect was found in the scoped candidate. The implementation fits the existing operator structure, uses deterministic manifest transforms, keeps connectors outside import, and tests actual catalog changes and transactional rollback rather than replacing SQL behavior with source-text assertions.

**Release contract:** this clears the independent code gate so the root may proceed with its already-authorized hosted checks. It does not itself clear hosted remediation, client publication or enable. Root must first obtain the complete 241-function hosted before-state, including the three new private helpers, with only the two specified anon extras; run the reviewed remedy on a dedicated validated hosted connection; independently verify hosted/OFF afterward; then satisfy the separately pending Auth/Storage/client/native release gates. Do not regenerate pins from the live catalog to make an unexpected difference pass.

## Scope and preservation checks

I independently compared the supplied diff package with `git diff --unified=8 BASE HEAD` over its seven paths: exact match after line-ending normalization. Current HEAD is the candidate commit. The changed paths are:

- `docs/agency-workspaces-operation.md`
- `scripts/agency-activation.mjs`
- `scripts/agency-platform-remediation.mjs`
- `scripts/local-sql/verify-agency-activation.mjs`
- `scripts/local-sql/verify-agency-platform.mjs`
- `supabase/agency-activation-manifest.json`
- `tests/agency-activation.test.ts`

Read-only Node comparisons against the BASE manifest established that every original 238 function entry is byte-equivalent as a JSON value at its exact signature, the 41 table entries and seven managed entries are unchanged, and the ten migration manifest entries are unchanged. There are precisely three added function entries and no altered original entry. The full migration-directory Git diff is empty. All 35 current migration-file SHA256 values match the saved source baseline. There are no application/package/UI/public-artifact edits in this candidate. Therefore the previously reviewed b54/ab8 client source is unaffected by this operator gate.

The three additions are `kh_private.kh_create_negotiation_pre_scheduling(uuid,jsonb)`, `kh_private.kh_respond_negotiation_pre_scheduling(uuid,jsonb)` and `kh_private.kh_review_agency_before_lifecycle(uuid,jsonb)`. Local hashes are respectively `3e094447fcaf9dadc57bf096384e4cd275a2902dd9ef00531d057567e93b0172`, `7551352521449e3cfb8fb83ee6fa34af7fa32b12a68c7204aeb4b3f42d159a57` and `b5cc1cdcb0ac7dbac1062036d348d93fa3cd34fecc1f0dfc930d5b60ba766a8f`; local anon/authenticated/service_role are all false. Their hosted service_role expectations are explicitly true, with anon/authenticated still false. Anchors: manifest lines 150-152, 1032-1052 and 6715-6724.

## Independent derivation

The catalog evidence contains explicit public-schema function defaults for both postgres and supabase_admin granting EXECUTE to anon/authenticated/service_role. This explains an ACL distinction from the fixture's default PUBLIC grant: a later REVOKE from PUBLIC alone does not remove explicit anon/service grants. CREATE OR REPLACE retains existing ACL; RENAME and SET SCHEMA retain function identity and existing ACL. The hosted overlay enumerates individual exact signatures, and none of the reviewed agency function-revocation statements revokes service_role. A search of all ten SQL files confirmed that service_role appears as table grants, not a blanket removal from these function identities.

I rebuilt the overlay signature set independently from the manifest's unchanged local function pins, the 102 public functions, and the eight SQL-justified private public-origin identities. It exactly equals the committed 109 overrides: 101 currently false public service flags plus eight private inherited grants. One public function already has service=true locally. The inherited private paths are substantiated by:

- `20261003000100_owner_administration.sql:231-233`: public profile moved/renamed to full_public_profile; client roles revoked while service is retained.
- `20261007000300_agency_property_origins.sql:558-580`: personal save/submit/status identities moved then renamed; PUBLIC/anon/authenticated revoked.
- `20261007000400_agency_mandates_aliases.sql:268-270`: public assisted-link identity moved/renamed; same client-role revocation.
- `20261007000500_agency_lifecycle_guards.sql:223-225`: review identity renamed then moved, followed by client-role revocation.
- `20260920000300_negotiations.sql:106,174,226-227` and `20261007000700_agency_proposals_scheduling.sql:266-269,305-308`: original public negotiation identities, then rename/move and client-role revocation.

The inventory parser now covers the actual adjacent public rename-then-move form at `scripts/agency-activation.mjs:84-88`; it removes each ghost renamed public name and inserts its final private name. It checks that the two names agree. This is justified for the ten pinned migration files; it is deliberately not a general SQL parser. `reviewedAgencyManifest` also compares computed inventory names to the committed manifest before querying the database (`:113-118`).

I independently recomputed both Auth hashes from the reviewed trigger definitions, firing state `O`, and the explicit RLS/FORCE state. `20261007000200_agency_registration_memberships.sql:37` defines the signup AFTER INSERT trigger; `20261007000500_agency_lifecycle_guards.sql:196` defines the BEFORE DELETE trigger. JSON hashing with `{rls:false,force_rls:false}` reproduces both unchanged local hashes; changing only rls to true reproduces hosted `b75366c0e664319adba9fb0aaf6fab0be9e4c7e1bdf5529080eec81361092556` and `e13672639e3dda278f7b675368dc2e97c709f5778d596ced0164f6ca74b3f7d0`. Thus these are derived security expectations, not opaque acceptance of changed trigger definitions. FORCE remains false; altered firing/definition/RLS hashes cannot match.

As corroboration only, I compared the supplied hosted 238-function diagnostic with the independently derived hosted subset after changing exactly the two observed anon=true fields to false. All functions/tables/managed values agree exactly. The saved owned hosted inventory also exactly equals the derived full 241-function profile. The original hosted evidence does not contain the three new helper pins, so it cannot establish those helpers' remote definitions or grants.

## Runtime strictness and remediation

`agencyConnection` rejects unknown targets before configuration access (`scripts/agency-activation.mjs:24`), and `reviewedAgencyManifest` rejects unknown profiles before queries (`:114`). The existing CLI parser requires explicit local/hosted targets. `runAgencyCommand` passes the validated target to verification for normal operations and its emergency-disable savepoint path (`:169-173`). The local fixture default remains local; there is no environment-driven permissive selection. `agencyProfileSchema` clones the base and changes only exact reviewed service flags and exact Auth trigger hashes (`:95-111`). `schemaInventory` continues to compare effective anon/authenticated/service permissions, definitions, table metadata/RLS/grants/column grants, and managed attachment definition/firing/security. Full equality at `:125` rejects extra or missing expectations instead of ignoring service ACLs.

The two anonymous deltas have a concrete SQL cause: migration2's main revocation loop precedes their creation; kh_set_agency_logo is created at lines 234-242 and revoked only from PUBLIC at 243; kh_agency_review_detail is created at 246-252 and revoked only from PUBLIC at 253. Both manifests correctly retain anon=false. The fix does not rewrite those immutable migration statements or treat service privileges as optional.

`scripts/agency-platform-remediation.mjs:7-28` is an exported routine with no CLI, connector, configuration read or import-time mutation. It requires the literal hosted profile before queries, resolves the reviewed artifact and creates a before-state by changing exactly the two named anonymous flags. Its transaction takes the same migration lock as release apply, then worker, then module (`:15-17`), locks the singleton row and requires exactly OFF (`:18-19`), verifies the ten ledger rows against immutable SQL/hash (`:20`), checks the private bucket (`:21`), and compares the full exact before-state (`:22`). No other grant/definition/security drift is allowed. It executes a single exact two-function REVOKE FROM anon (`:23`), verifies the full hosted profile again (`:24`) and OFF (`:25`) before commit. Errors inside the transaction roll back both revokes (`:27`). There is no enable, ledger or business-row write in the routine.

The runbook at `docs/agency-workspaces-operation.md:65-75` makes the root-only use, backup, validated hosted target/config, dedicated connection without a prior transaction, lock ordering, exact before-state, already-corrected rejection, and independent verify/status OFF explicit. The routine receives a database abstraction; connection identity and transaction idleness are caller preconditions, not automatic remote attestation. This is consistent with the approved root-runbook-only design and must remain true during execution.

## Saved execution evidence assessed

No completed equivalent test was rerun. I read the saved raw logs and the sources of their drivers rather than relying only on the report's counts:

- `platform-red.log`: original verifier throws the actual schema/function/grant mismatch after the fixture reconstructs platform defaults/Auth RLS and the two anonymous grants have been corrected. The failure is neither import failure nor missing prerequisite; cleanup/source equality succeeds.
- `platform-parser-red.log` and `prove-platform-parser-red.mjs`: removing only the parser fix causes the final-private-identity regression to fail at its concrete inventory assertion; the driver restores the original source in finally. This is a behavioral regression test.
- `platform-green.log`: saved earlier direct clone run proves full hosted comparison, atomic revoke behavior, rollback, OFF and ledger preservation, plus 18 drift probes. The report correctly distinguishes this earlier 18-probe log from the final 19-probe source.
- `platform-operator-tests-final.log`: eight tests pass, zero fail, zero skip, including both SQL hooks. The hosted hook runs the final `verify-agency-platform.mjs`, checks child exit=0, acceptance of 241 functions, remediation evidence and source/cleanup marker. Its child success stdout is asserted but not copied into the parent log; consequently I do not describe that log as a separate verbatim 19-probe transcript. The final source at `verify-agency-platform.mjs:47-69` contains all 19 real SQL alterations, sequential rollback and `assert.rejects` for each; the passing final hook establishes completion of that program.
- The final clone source (`:33-43`) injects a second-ledger-read failure only after REVOKE, verifies both anon grants restored, rejects ON and a third grant, then succeeds once, compares entire ledger rows/timestamps and rejects already-corrected state. This is meaningful atomicity coverage. Definitions and permissions are independently compared after correction (`:45`), rather than accepting a returned count alone.
- The 19 final drifts cover excess anon/authenticated/service grants, a missing expected service grant, all three new helpers' privilege/definition protection, missing RPC/schema, default-on metadata, table and column grants, checksum, missing/disabled Auth trigger, Auth RLS false/FORCE true, Storage policy and property-guard firing.
- `platform-migration-apply.log` and `verify-agency-release-apply.mjs`: actual migration2 checksum failure rolls back schema and ledger, preserves migration1/OFF, resumes nine migrations, replays zero, preserves old mixed SQL bytes/hash/timestamp, and rejects drift/ON. These checks demonstrate that compatibility work has not loosened the existing apply contract.
- `platform-npm-check.log`: typecheck succeeds; 617 tests / 615 pass / zero fail / two skip. The two skipped names are precisely the SQL hooks that subsequently passed with configured source in final 8/8. The full check preceded final remediation prechecks; final focused hooks cover the final source. This is not a full-suite zero-skip claim and is acceptable under the preflight's explicit equivalent-proof contract.

## Preservation, cleanup and remaining concerns

`verify-agency-platform.mjs:11-20,73-76` compares the source's table row digests, definitions/ACLs, relation ACL/RLS, structure/grants and defaults, and all source migration bytes before/after. It only mutates an owned clone after asserting the strict source URL. Its finally block closes the clone connection before owned clone cleanup. The unchanged `agency-locale-clone.mjs` uses unique owned names, ownership checks and verified drop, and validates its temporary-directory boundary before removal. `platform-source-baseline.json` and `platform-final-evidence.log` confirm unchanged source inventory SHA256 `dac17df3d3e7406b02e640122795cf2fb6dd77a362e1725950dfe85d4ee7036a`, 35 unchanged source files and zero remaining owned clone databases at the saved final query. My current read-only byte comparisons also match that saved baseline. I did not query live databases during review or claim present remote/source state from those saved logs.

No code revision is requested. The following are operational conditions, not scoped code findings:

1. The three newly pinned helper identities still require real hosted full before-state verification. Any mismatch must stop before the two-revoke mutation; the old 238-function diagnostic cannot establish their values.
2. The dedicated validated hosted connection must have no existing transaction or externally held worker session. The exported routine intentionally does not acquire or attest that connection itself.
3. This gate leaves production OFF. It supplies no new real-device, hosted Auth/Storage, client publication or activation result. Those root release checks remain separate.
4. R78's retained ACL-protected native scratch copy and policy-blocked recursive deletion are outside this seven-path candidate. This review neither bypasses that rejection nor treats it as a proven product failure; root must retain its truthful cleanup boundary in release evidence.

Final review contract: **DONE / spec PASS / quality PASS / no actionable findings / no test reruns / hosted 241-helper before-state and subsequent release gates pending root**.
