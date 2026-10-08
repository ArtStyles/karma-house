# Whole-branch final review — agency workspaces

Review date: 2026-10-08. Reviewer: independent Senior Code Reviewer, `/root/review_agency_whole_branch`.

## Scope and method

Workspace: `C:/Users/ACER NITRO/.codex/worktrees/agency-workspaces/karma-house`.

- Original base: `1ab359cfa216360c05d6d5a6fca30b7961a8ff69`.
- Reviewed HEAD: `17368727020d5950ce45c4379cf8143c5b992da6`.
- Complete supplied package: `.superpowers/sdd/2026-10-07-agency-closure-release/review-1ab359c..1736872.diff`, 29 commits, 214 changed files, 2,125,458 bytes.
- Package SHA256: `5e135e7f8a1466f846c8dc47a773beac7f98f670b502a852a86a6c4a13428a50`.

I read the complete package in bounded passes, including all ten migrations, final overrides and grants, client screens/providers/repositories/routes, public page API, operators, release preparation, tests and documentation. Large manifests were parsed and checked rather than treated as review prose. This is a whole-feature review against the original base, not a review limited to the Task16 preparation delta.

The binding requirements were the full `docs/superpowers/specs/2026-10-07-agency-workspaces-design.md`, the master plan's Global Constraints and Review Focus, and all four phase plans and their Review Focus. I read the full final-review preflight first, the requesting-code-review reviewer contract, all five owned progress ledgers, the exhaustive chronological `docs/agency-release-audit/rulings.md` (59 master decisions and 40 phase occurrences, including four wording variants), saved task reports and independent/fix reviews, including Tasks13–16 and the preparation review. Prior approvals and rulings were evaluated against the design rather than used as authority to dismiss product gaps.

No subagents were dispatched. No checkout, index, HEAD, deployment, signing, device or browser state was changed. The only saved checkout artifact from this review is this requested report. No production/private-primary input was read. Accepted unchanged suites were not regenerated. One narrowly scoped transactional local PostgreSQL proof was run for I1 and fully rolled back, as detailed below.

## Strengths

- The separation of agency approval, owner-granted verification, current membership, property origin and current mandate is substantial and generally enforced in SQL. Personal verification and technical corporate custody do not confer agency authority or become a public contact.
- Commercial data is privately scoped to an agency and current assignment. Alias resolution retains original chat/deal identifiers and source authority; a collaborator's verified badge cannot make it the source or sell the shared home. External leads remain private records with explicit manual responses and communication tasks, without fictitious Auth users or invented delivery.
- Closure is transactional, explicit and idempotent, with separate origin confirmer and actual executor, a unique receipt, version checks, and termination of related active commitments. The retained SQL evidence meaningfully exercises stale attribution, historical performed/expired facts, personal flows, withdrawal, suspension, consolidation and concurrent operations.
- The final locking helpers, shutdown/operator paths and push worker account for the common lock order and independent delivery semantics. SQL-level grants and private wrappers are explicitly pinned. Current authorization precedes sensitive historical target/replay access; OFF preserves authorized history without allowing ordinary new agency work.
- Client request captures, account/agency/generation checks, explicit retry receipts and definitive authorization invalidation are thoughtful. Previous actual UI failures and counterexamples were retained and corrected rather than replaced with optimistic claims.
- Release preparation carefully distinguishes local SQL, synthetic Auth/media, browser rendering, side-by-side native fixtures and actual hosted delivery. Byte manifests, an ordered atomic apply/resume operator, strict ON verification and a narrower emergency OFF path provide a useful operational foundation.

## Issues

### Critical — 0

No Critical finding established. I1 is an authorization defect, but its demonstrated reach is a current member's retained visit history within the suspended agency; I have not established cross-agency disclosure, global takeover or catastrophic data loss and do not inflate its severity.

### Important — 7

### I1. A suspended agency can still record a new visit outcome through the authenticated RPC

**Anchors:** `supabase/migrations/20261007000700_agency_proposals_scheduling.sql:167–181`, especially `:171–176`; read helper at `:66–71`. The activation manifest grants `authenticated` execution on `public.kh_record_agency_visit_outcome(uuid,uuid,jsonb)`; no later migration replaces this missing check.

**Requirement:** design §3 and acceptance criterion at design line216: a pending/rejected/suspended agency must not operate through the UI or direct server calls. Historical read access is distinct from new writes.

**Failure:** after the protected owner suspends an agency, a current member still able to read a past unrecorded visit can invoke `kh_record_agency_visit_outcome` with a fresh request ID and record `performed`, `no_show`, or an applicable cancellation. The RPC calls `agency_scheduling_deal`, which obtains locks and checks current deal visibility/assignment, but does not call the approved-agency write guard. Unlike new proposals, it also does not call `agency_scheduling_live`. The member therefore writes a new historical fact after suspension even though the UI withholds the action.

**Direct proof:** on the strict loopback test baseline, I applied the exact ten migrations inside a single transaction, used the existing `schedule_fixture(1900)`, created and accepted a visit through the real RPCs, made the fixture slot a past unrecorded visit, suspended the origin through the real owner review RPC, then executed the outcome RPC as actual `SET LOCAL ROLE authenticated` with the member's authenticated fixture context. The response and persisted row were:

```text
BEFORE {"agency_state":"suspended","outcome":"unrecorded","closed_reason":"origin_agency_suspended"}
ACTUAL_AUTHENTICATED_RPC_RESULT {"endsAt":"2026-10-08T13:51:23.065083+00:00","outcome":"performed","version":2,"startsAt":"2026-10-08T12:51:23.065082+00:00","assigneeId":"45000000-0000-4000-8000-000000001900","propertyId":"0732c4c5-64ae-49c5-9fe1-70133bdad270","proposalId":"d8a3f835-7d7a-48b7-9553-1db8945702ee"}
AFTER {"agency_state":"suspended","outcome":"performed","closed_reason":"origin_agency_suspended"}
ROLLBACK: all data inventory unchanged; agency schema absent; no push worker invoked
```

The command exited0. Before/after inventories covered all tables in public, kh_private, auth and storage using counts and row hashes; the agency schema was absent again afterward. This was local fixture data, with no provider invocation or remote mutation.

**Fix and focused proof:** enforce current approved agency write eligibility while holding the existing common locks before a NEW outcome mutation. Keep authorized historical reads and intentional receipt semantics, and do not accidentally require an open commercial cycle for every legitimate past-outcome recording by an otherwise approved agency. Add the demonstrated suspension case, a current-permission receipt case and a valid past-result case to the SQL coverage; exercise suspension versus outcome serialization if the fix changes locking.

### I2. The operational deal list/detail cannot identify an account buyer or the home being worked

**Anchors:** `src/screens/AgencyDealsScreen.tsx:41`; `src/screens/AgencyDealScreen.tsx:52`; `supabase/migrations/20261007000600_agency_deals_messaging.sql:95`; `src/agencies/deals/types.ts:8`.

**Requirement:** design objective and §§6/9, plus Task10's operational case screen with property, responsible person, proposals and next actions. A reasonable coordinator must be able to distinguish the buyer and home before assigning, following up or initiating a sale.

**Failure:** account-backed deals all display “Interesado con cuenta.” The list shows stage and responsible person but no buyer label or property title. The detail repeats the generic label and similarly lacks a usable home identity in its principal case presentation. The DTO supplies UUIDs but no human labels. Two account buyers for the same property/stage/manager are indistinguishable; two homes for the same external contact are also ambiguous. A later sale preparation screen or a separate chat does not make the everyday case list usable, and an account-backed deal need not yet have a chat.

**Impact:** staff cannot reliably select the intended record for private actions. This is a functional CRM gap, not a request for decorative polish.

**Fix and focused proof:** return minimal, currently authorized buyer display identity and canonical property display identity through the private deal projection, and show both in list/detail. Keep external contact privacy, safe deleted-account/home fallbacks and current membership/assignment checks; do not expose other agencies' contacts. Verify at least two otherwise identical account cases and one contact with two homes, plus deletion and foreign-agency denial.

### I3. The approved agency's promised commercial profile cannot be maintained or fully presented publicly

**Anchors:** `src/screens/AgencyApplicationScreen.tsx:23`; `supabase/migrations/20261007000200_agency_registration_memberships.sql:42–46` and `:234–238`; `supabase/migrations/20261007000400_agency_mandates_aliases.sql:184–192`; `src/agencies/messaging/repository.ts:24–29`.

**Requirement:** design §3's data-treatment table makes commercial phone, province/municipality, service areas, description and optional logo public after approval, with an explicit office-address publication choice. Design §4 grants the administrator management of the business profile.

**Failure:** the only editing surface and submit/logo RPCs stop accepting updates when the agency is approved. There is no separate current-admin commercial-profile maintenance path. A normal approved agency cannot correct its public business phone, description, service area or logo; replacing the administrator after the original applicant leaves does not solve it because application provenance remains bound to the original responsible account. Separately, public projections/presentation do not expose the promised complete public profile: context SQL emits name/logo/areas/badge and contact availability, while the main contact decoder even drops logo/areas and there is no public commercial phone/municipality/description/opt-in office surface.

**Plan conflict identified:** the phase plan's deliberately narrow `kh_public_agency_context` contract is appropriate for a listing's contact choices but does not implement the larger public business profile promised by the design. This needs a separate safe profile surface/contract, not indiscriminate exposure of the registration application. Audit R18 explicitly acknowledges a future distinct contact/profile flow; preserving historical applicant identity is correct, but calling that missing required flow “future” is not an approved design waiver.

**Fix and focused proof:** provide a current-approved-admin profile update flow with immutable registration provenance and explicit public-field projection, including the office opt-in. Protect private responsible/email/representation evidence. Confirm edits by a replacement admin, denial for managers/foreign/suspended agencies, public rendering of opted-in values, and non-disclosure of private application material. A separate public profile route is sufficient; the listing need not display every field inline.

### I4. New agency conversations bypass the existing per-account contact creation limit

**Anchors:** `supabase/migrations/20261007000600_agency_deals_messaging.sql:158–168` and `:122–150`; compare the preserved personal contact limit at `supabase/migrations/20261007000300_agency_property_origins.sql:606`. Message/report limits at migration006 `:34–48` and `:211–212` do not cover conversation creation.

**Requirement:** Task8 Step4 explicitly reuses existing blocking, rate limits and reporting. Existing personal conversations limit a buyer to20 new conversations in24hours.

**Failure:** `kh_start_agency_conversation` has locks, replay and eligibility checks, but no daily conversation count before creating a new deal/conversation. `agency_make_deal` does not add one, and there is no later override. A confirmed buyer can create arbitrarily many agency conversations across properties/agencies and flood assignment queues, even after exhausting the personal channel's limit. Shared per-minute/per-hour message limits do not prevent this creation flood.

**Fix and focused proof:** enforce an account-level new-contact budget across personal and agency channels under the common account mutex, after determining this is genuinely a new conversation. Existing conversations and idempotent replay should remain accessible without consuming another slot. Cover the21st new contact, mixed channels, existing/replayed contact and concurrent starts. Do not rely on client throttling.

### I5. An open agency chat never receives incoming messages without a manual action

**Anchors:** `src/screens/AgencyConversationScreen.tsx:55–89`; `src/screens/InboxScreen.tsx:54–73`.

**Requirement:** the implemented feature is an in-app conversation channel. Under the final-review vision contract, a reasonable person holding that chat open expects an incoming reply to become visible. The existing personal messaging product also establishes continuity as the baseline.

**Failure:** the agency chat loads on navigation focus, explicit refresh and its own actions. It has no subscription, periodic incremental read, or foreground-resume refresh. The agency inbox follows the same pattern. If two people keep the conversation open, one person's reply is invisible to the other indefinitely until that person sends something, manually refreshes or leaves/re-enters. No incoming-message event path elsewhere compensates for this. Task8's report acknowledged the initial focus/manual implementation and left later richer behavior possible; Task14 did not add it.

**Impact:** the apparently live conversation silently stops at the last local load. The buyer can reasonably believe the agency did not reply. This is not a requirement to invent a new push category or prove physical push delivery; foreground reception itself is missing.

**Fix and focused proof:** add scope-bound incoming refresh using an authorized polling or subscription mechanism, with foreground recovery. Respect focus, account/agency/generation, current permission, in-flight ordering, message pagination and existing draft/idempotence behavior. Do not grant table access to bypass RPC privacy. Demonstrate two open conversations exchanging replies without a manual reload and prove delayed responses cannot restore private content after account switch, member removal or agency change.

### I6. The creation flow omits the required pre-creation duplicate search/warning and existing-home alternative

**Anchors:** `src/screens/AgencyPropertyScreen.tsx:107–137`; `supabase/migrations/20261007000300_agency_property_origins.sql:96–129`; the available duplicate-candidate RPC is `supabase/migrations/20261007000400_agency_mandates_aliases.sql:202–208`.

**Requirement:** design §5 explicitly requires searching for matches before creating, warnings, and the ability to request authorization on an existing home. Task6 Step4 repeats showing matches while reviewing a creation. The catalog's shared-home principle is central, and verified direct publication must retain duplicate checks (design line84).

**Failure:** a new agency property goes straight from ListingForm/source/consent to `repository.save` and a new property/source record. It neither searches candidates nor warns nor offers the existing-home mandate choice during creation. The only duplicate-candidate RPC requires an existing property UUID and protected KarmaHouse-owner authority, in a separate post-creation review screen. Manual pre-search by the user is not the promised integrated safeguard; verified agencies can publish directly before such a review.

**Impact:** A and B can innocently create public copies instead of sharing one home. Since conflicting established origins intentionally cannot be merged into a new authority, after-the-fact consolidation is not an adequate replacement for prevention.

**Fix and focused proof:** introduce bounded, privacy-safe match discovery before creating/submitting a new business home, present candidates and the existing mandate-request alternative, and allow an explicit reviewed “different home” decision rather than automatic merging. Do not expose private addresses, owner contacts or origin evidence to other agencies. Cover an existing public match, no match, cross-agency private-field exclusion, verified direct submission and explicit selection of the existing canonical UUID.

### I7. There is no user-facing way to share the manager/agency link whose incoming behavior was implemented

**Anchors:** `src/screens/DetailScreen.tsx:154–157`; `src/lib/publicSite.ts:8–10`; agency portfolio/property screens have no scoped share producer.

**Requirement:** design §4 grants managers/coordinators/admins sharing of listings. Design §5 says a manager's shared link retains the same home UUID and directs contact to that agency and manager while authorized; commercial plan Review Focus1 covers stale versions of such links.

**Failure:** incoming agency/manager parameters are handled, but the app's actual Share action always calls `listingShareUrl(listing.id)`, which emits only `/p/<id>`. No agency screen generates a currently authorized agency/manager link. A manager using the ordinary Share flow therefore sends an unscoped generic link, and sharing a received scoped page loses that contact context. The feature can be demonstrated with hand-constructed URLs but cannot be used normally by the promised actor.

**Fix and focused proof:** offer an explicit agency-scoped sharing action for an eligible member/current mandate, generating the canonical home link plus agency and optional authorized manager context. Preserve the personal/general share action and the server's stale-link revalidation/explicit choice behavior. Do not infer sale attribution from sharing. Verify manager, coordinator and admin generation, canonical alias handling and retired/suspended link fallback.

### Minor — 3, all explicitly triaged

**M1 — Optional empty concurrency filter succeeds without exercising cases.** `scripts/local-sql/verify-agency-concurrency.mjs:279–281` filters by substring, loops an empty array and exits0 when a typo matches nothing. The accepted REQUIRED unfiltered run actually executed39 cases with all passing, so this does not invalidate that evidence. Recommended follow-up: when a filter was supplied and selected zero cases, print the selection failure and exit nonzero. This is an operator-feedback minor, not a reason to repeat39 accepted cases.

**M2 — Conflicting color environment warning noise in Task14 exports.** `.superpowers/sdd/2026-10-07-agency-closure-release/task-14-export-final.log:8–27` repeatedly reports `NO_COLOR` ignored because `FORCE_COLOR` is set. The exports succeeded; no product failure follows from the warning. Later necessary verification selected a single color mode. Preserve the old output and use one consistent setting for future necessary commands; do not cosmetically regenerate successful exports.

**M3 — Native upstream/deprecation warnings include Gradle10 incompatibility.** `artifacts/agency-release-preparation/native-archive/native-build.log:747` reports deprecated Gradle features incompatible with Gradle10; `:753` records BUILD SUCCESSFUL on the current toolchain. Upstream dependency/deprecation warning noise remains. Track remediation before a Gradle/toolchain upgrade, retaining diagnostics. It does not make the successfully built current fixture fail and is not evidence of the still-pending official production APK build. No suppression or cosmetic rebuild is requested.

Previously raised minor issues in earlier task reviews were traced to their corrections or explicit dispositions; they are not silently carried as extra current findings. In particular the earlier parser/logging/native-text, expiry and test-isolation fixes do not resolve the seven new whole-feature issues above.

## Rulings and named risk assessment

- I agree with preserving historical applicant identity, immutable stable property origin, private agency deal histories, and refusal to merge contradictory established authorities. Those choices match the design. R18's “future profile” cost is the unresolved I3 requirement, not a reason to lower its severity.
- Explicit member handoff preserves commitments and revoked-member access is removed; mandate/source termination and a real sale have different historical effects. The latest helper definitions and their callers were followed, including validation-free lock-only helpers used by personal lifecycle paths. A broad substitution of an agency write guard into every common helper would break intentional personal/OFF behavior; I1 requires a targeted fix.
- Zero technical-custody public contact, current-authority sale receipt replay, sale/withdrawal/disable/consolidation/lifecycle races and no provider call inside sale are supported by concrete source and accepted actual SQL outputs. I found no additional actionable defect in these reviewed paths beyond I1 and I4. This is a bounded code/evidence judgment, not a formal proof of every possible interleaving.
- Client account/session/agency/generation guards and the later definitive-access-error invalidation were reviewed independently of their reports. Their accepted scenario evidence is relevant. It does not supply the absent foreground incoming-chat path in I5 or identify ambiguous cases in I2.
- Rulings permitting synthetic UI Auth/media and declared local503/504 are appropriately constrained. The first transparently retried socket drop is not a no-write failure proof. Actual visible503-before-forward and504-after-commit with a unique receipt are separate retained observations.
- The Task16 split between local preparation and later root production execution is legitimate. Same-session worker pause, module locks, no account/agency/property/recipient locks held during HTTP, receipt-owned fixture cleanup before releasing the worker, and ordinary emergency disable after connection loss are sound reviewed procedures. A lost pause connection interrupts the no-send assurance; the runbook correctly requires reporting that fact rather than erasing provider evidence.
- Migration bytes, function/grant definitions, tables and managed trigger/policy attachments are pinned rather than merely counted. Trigger-firing status and historical migration integrity are part of the operator checks. The preparatory deployment/version allowlist protects unrelated primary changes. Actual hosted baseline matching, backup/restore and publication remain operational gates below.

## Evidence accepted and independently inspected

| Evidence | What it establishes | Boundary |
|---|---|---|
| `artifacts/agency-release-preparation/full-check.log` | `npm run check` invokes typecheck and tests; final output576 passed,0 failed,0 skipped | Saved accepted output, not rerun by this reviewer. The separate `full-check-no-local-env.log` is575 passed/1 intentional skip and must not be substituted for the576/0-skip run. |
| Task13 `task-13-concurrency-final.log` and `task-13-all-final.log` in the closure SDD evidence | Actual39 race cases with40 barriers,39 cleanup checks and7 actual-role probes;18 agency and25 historical SQL suites | Loopback PostgreSQL/synthetic Auth/transport, not a hosted Supabase or provider run. Full outputs read, not merely report counts. |
| Task14 report, original outputs, request/response and persisted verification evidence | Actual browser business flows,100 saved screens across the retained work, cross-agency private shared UUID operation,98k closure, lost case isolation, cancellations, null assignments, removed access, declared503/504, preferences and buyer destinations | Browser fixtures use synthetic protocol/Auth/media with real local SQL. This reviewer read the saved evidence and reviewed selected rendered artifacts; this is not a claim of independently replaying or visually inspecting every screenshot. |
| Task16 native `capture.json`, `verify-and-disable.json`, `fixture-cleanup.log`, build log, and the rendered `closure-confirmed.png` / `off-closure-final.png` | Native external contact/self assignment; accepted29k offer distinct from sale; accepted future visit; followup; one source sale receipt; future visit/task cancelled; external communication remains open; OFF history retains the same receipt; fixture DB dropped/config restored/source unchanged | Receipt-owned side-by-side Pixel fixture with synthetic Auth/media and real SQL. The initial closed-property rejection and separate normal-RPC publication prerequisite remain recorded. Original official0.1.19 was preserved. No provider delivery or official release-update claim. |
| `artifacts/agency-release-preparation/apply-green.log` | Deliberate atomic failure rolls back, ordered resume applies remaining migrations, idempotent re-run applies0, historical hash preserved, drift rejected on ON, cleanup | Local operator exercise, not production migration success or a production backup restore. |
| `docs/agency-release-audit/evidence-manifest.json` | Independently checked523 archived files,17,119,381 bytes; all referenced file hashes/sizes matched | Archive integrity, not correctness of every behavior in every artifact. |
| `docs/agency-release-audit/native-evidence-manifest.json` | Independently checked113 native archive files,75,559,530 bytes; all hashes/sizes matched | Includes retained artifacts; not an independent official signing/publication attestation. |
| `supabase/agency-activation-manifest.json` | Ten migration byte/hash matches;228 functions,41 tables,6 managed attachments parsed; relevant authenticated/private execution grants inspected | Definition pins are not a replacement for checking the actual target schema before ON. |
| Focused I1 proof above | Actual authenticated fresh visit-result write succeeds after agency suspension, with exact full rollback | Only new executable reviewer proof; no worker/provider call, no broad accepted-suite rerun. |

## Pending verification — not silently treated as completed or waived

1. Actual production backup completion, restoration viability, hosted migration ledger/schema/grants/policies/trigger firing and ordered apply receipts. Local rollback/resume does not prove the deployed target's current state or backup recoverability.
2. Controlled hosted Auth/JWT/email/REST/Storage behavior with reviewed worker pause and receipt-scoped cleanup, then strict OFF→ON verification. Synthetic local Auth/media cannot prove these. Root retains this Task16 obligation after the code gate is repaired.
3. Official production-configured signed0.1.20 dual-ABI APK, release/download/public hash checks, deployed web alias/version provenance, and an official in-place update preserving the user's current app data. The side-by-side native package does not fulfill them.
4. Actual notification provider acceptance, device reception in foreground/background/closed states and taps under real accounts/current permission. Local transport mocks and disabled transport prove business/delivery separation, not delivery. Broader native role/cross-agency chat/accessibility/audio behavior remains unverified.
5. Exhaustive screen-reader/keyboard/large-font/theme coverage and production-volume latency/load were not established by the bounded rendered/native sample or local SQL suites. No accessibility or production performance success is inferred from compilation, screenshot counts or typecheck.
6. The final root-owned Git integration/push, release/archive receipts and confirmation that unrelated primary dirty work remains preserved must be recorded after the authorized operations actually happen.

These are explicit evidence boundaries and remaining release steps, not seven additional speculative defects and not an approval to skip required gates.

## Recommendations for the single allowed fix wave

Address I1–I7 together in the controller's one combined final fix dispatch. Add meaningful focused proofs for the described failures and retain accepted unchanged evidence. Changes to SQL require regenerated exact activation pins and affected local compatibility checks; changes to notification/client scope must retain the current authorization and receipt behavior. Refresh only release artifacts/provenance that the fixes actually invalidate, and perform the one scoped re-review against this report. Do not reinterpret a broader green test count as resolving a finding without its observable behavior being addressed. The three minors can remain explicitly deferred with the dispositions above.

## Declined to judge

Each line below is a behavior considered and deliberately set aside, with the reason; the controller must rule on each rather than silently discard it.

- Automated commission calculation/payment or financial settlement: the design records actual confirmed execution and keeps conditions private; it does not authorize a payment product or infer commissions from referral links.
- Legal adjudication of property title or business representation: owner review/verification is an application permission and presentation decision, not proof of legal ownership; evaluating legal sufficiency is outside this code gate.
- Automatic WhatsApp/SMS/email outreach to external contacts: the explicit design creates manual communication tasks and must not claim automatic external delivery; adding an outreach integration is outside scope.
- Automatic similarity-based merging or transfer of conflicting established origin authority: explicitly excluded from the first delivery. I6 still requires prevention/search; this exclusion does not waive that requirement.
- A complete enterprise rental/swap transaction/settlement workflow: the current enterprise closure scope is the approved sale workflow. Existing personal operation compatibility was reviewed; a new enterprise rental lifecycle is a separate product decision.
- Future Gradle10 migration and generic upstream dependency modernization: not part of the current pinned release; current warning disposition remains M3, and an upgrade must revisit it.
- Full platform redesign, CRM analytics and aesthetic restyling: not required to correct the concrete usability failures here. I2/I5/I6/I7 were judged as current essential behavior rather than dismissed as future polish.

## Assessment

**Spec verdict: Changes required.** I2, I3, I5, I6 and I7 leave core promised or ordinarily expected agency behavior unavailable; I1 violates the explicit suspended-agency boundary and I4 omits a required inherited abuse control.

**Code quality verdict: Changes required.** The architecture and existing evidence are strong, but an authenticated authorization gap, contact-limit bypass and incomplete operational surfaces remain. Prior task/preparation approvals do not resolve them.

**Ready to merge? No.** Counts: **0 Critical / 7 Important / 3 Minor**. Repair the Important findings and obtain the single scoped re-review before the held production writes/publication/activation. Even a repaired code gate must not be represented as completion of the explicitly pending hosted and release receipts above.
