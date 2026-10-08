# Preserved chronological agency rulings

Snapshot 2026-10-08, Task16 local preparation. The master ledger supplies chronology; exact repeated phase entries are attached to the same ruling, retaining every source occurrence. The four phase shorthand variants are attached to their full master decision/cost. Within each source, line order is preserved; no invented timestamps. All five source ledgers (including foundation, with no Ruling lines) are archived byte-for-byte privately and listed in the manifest. Historical authorizations are interpreted together with later rulings and the current root-owned production gate.

## R01 — 2026-10-07-agency-workspaces:16

Ruling: Interpret the user's instruction as authorization to implement locally in the isolated worktree included in the approved plan — deployment and activation remain separate — cost if wrong: local reversible changes only.

## R02 — 2026-10-07-agency-workspaces:17

Ruling: Reuse installed dependencies via a node_modules junction because package-lock is unchanged — avoids a network installation — cost if wrong: baseline check will expose incompatible dependencies.

## R03 — 2026-10-07-agency-workspaces:18

Ruling: Add an account-bound invitation lookup by a user-shared public profile UUID/link; never enumerate Auth emails — the plan specifies exact recipient UUIDs but omits how users select them — cost if wrong: invitation UX can be refined without changing membership authority.

## R04 — 2026-10-07-agency-workspaces:42

Ruling: Use subagent-driven-development for the remaining plan because the user did not require inline execution and the long plan benefits from isolated task contexts — tasks still follow their dependencies with shared contracts agreed before dispatch — cost if wrong: additional review cost, no change in product scope.

## R05 — 2026-10-07-agency-workspaces:43

Ruling: Task 3 UI and Task 4 context/controller may proceed concurrently after Task 2 — they edit distinct files and consume the exact provider interface recorded below — cost if wrong: compile/review catches integration mismatches.

## R06 — 2026-10-07-agency-workspaces:59

Ruling: Replace cross-volume dependency junction with exact physical installed dependencies plus the committed vendor package because actual Metro renders failed with ENOENT — package-lock untouched; original junction preserved reversibly — cost ifwrong: disk/cache only, product source unaffected.

## R07 — 2026-10-07-agency-workspaces:67

Task5 Ruling: owner-only assisted-link action may both bind an active agency-kind collaborator to an approved agency and attribute one eligible existing assisted dwelling, with separate collaborator/property versions and evidence/source/consent refs — approved plan allows proven assisted origin, not arbitrary personal conversion. Require complete nonrevoked provenance, protected custody, nonsold/nonalias property, no contradictory established origin/link; confirmed collaborator account ifpresent must be active confirmed admin of targetagency. Preserve UUID/material/creationreceipts and audit proof. Cost ifwrong: sourceauthority assigned to wrongagency, mitigated by protected owner review/evidence and explicit matching checks.

## R08 — 2026-10-07-agency-workspaces:68

Task5 Ruling: narrow transaction-scoped private write permits and validated internal save core may support enterprise custody/media without Auth impersonation — permit must target currentactor/property/transaction and cannot be forged by client-set GUC/direct table write — cost ifwrong: legacy guard/media bypass, mandatory negative SQL tests and finalreview.

## R09 — 2026-10-07-agency-workspaces:71

Ruling: Extract one private save_property_core with explicit actor/custodian and a null target for existing personal behavior, plus narrow personal and enterprise wrappers — avoids two active copies of validation while retaining existing receipt and moderation contracts — cost ifwrong: personal publishing regression, checked by real upgraded sale/rent/swap/wanted/media SQL and independent review.

## R10 — 2026-10-07-agency-workspaces:72

Ruling: Source-agency members who also hold KarmaHouse moderation roles cannot review that agency's own listings; independent authorized KarmaHouse review can clear a hold — preserves the spec's separation between verified direct submission and moderator authority — cost ifwrong: additional independent review needed for those dual-role users.

## R11 — 2026-10-07-agency-workspaces:73

Ruling: Keep the initial source reference immutable with origin; later consent references enter the save audit — stable provenance should not be overwritten by ordinary edits — cost ifwrong: correcting a provenance typo needs a future explicit administrative workflow, outside this release.

## R12 — 2026-10-07-agency-workspaces:76

Ruling: Allow the minimal account-bound personal authorization entry point and RequestsScreen link needed for personal-origin mandate/common-change decisions in Task6 — agency-only context cannot represent that accepted source authority — cost ifwrong: additional UI/API surface and personal-request regression risk, covered by focused context/SQL tests and Task14 journey.

## R13 — 2026-10-07-agency-workspaces:80

Ruling: Duplicate consolidation requires exactly matching established source agencies, or the same current personal authority with compatible assisted provenance; evidence cannot override a conflicting stable authority and shared technical custody alone is insufficient — the spec excludes origin transfer — cost ifwrong: some physical duplicates remain unresolved until a future authority-resolution workflow. Unestablished eligible assisted source may first be clarified through the separately guarded Task5 link action.

## R14 — 2026-10-07-agency-workspaces:81

Ruling: Explicit protected-owner consolidation carries a still-active duplicate-only mandate to the identical compatible canonical dwelling while preserving private reference/history/version audit; keep existing canonical active authority, and never reactivate an already withdrawn canonical mandate — this preserves authorization for the same physical home without transferring source authority — cost ifwrong: unintended access after merge, mitigated by exact source compatibility, owner review and canonical-withdrawal precedence. Preserve ongoing commercial commitments for carried authority; only superseded duplicate common-change requests terminate solely by consolidation.

Phase occurrence 2026-10-07-agency-shared-properties:23:

Task6 merge authorization ruling: duplicate-only active mandate may move to canonical with same private reference/history and incremented version; existing canonical active wins, existing canonical withdrawn is never revived. No private chat/deal merging or cancellation of current commitments merely for carried-authority consolidation; superseded common changes may terminate. Next Tasks8–11 must resolve effective canonical authority/availability while preserving subject UUIDs.

Cost: inherited verbatim from the complete master ruling immediately above; shorthand did not record a separate cost.

## R15 — 2026-10-07-agency-workspaces:82

Ruling: Reject duplicate consolidation when an active duplicate moderation hold would redirect to a canonical dwelling without an active hold; use KH_PROPERTY_MODERATION_CONFLICT until separate authorized KarmaHouse review — merge must not silently rehabilitate withdrawn content or unpublish the canonical row — cost ifwrong: extra review before some legitimate consolidations. When canonical already has a hold, preserve both restrictions/history and requires_review without publication effects.

Phase occurrence 2026-10-07-agency-shared-properties:25:

Task6 moderation ruling: active duplicate hold + unheld canonical rejects atomically with clear review-required conflict. Canonical already held can consolidate while preserving both historical holds and review policy. No implicit hold transfer/clear or canonical takedown/new alert; focused regressions requested.

Cost: inherited verbatim from the complete master ruling immediately above; shorthand did not record a separate cost.

## R16 — 2026-10-07-agency-workspaces:91

Ruling: Preserve private business property identity through personal-source deletion using a private same-UUID registry with minimal title/location/responsible UUID snapshot and withdrawal reason; re-point only private mandate/cycle/request/change/alias refs, keep corporate-origin/live-hold restrictions, and preserve ordinary personal row/media/favorite deletion — accepted personal deletion and historical business identifiers conflict with current public-property FKs; no new custodian/source or false sale — cost if wrong: extra registry/archival complexity and minimal retained business snapshot; purge registry for purely personal listings without any business/alias history and prove directAuth/RPC paths.

## R17 — 2026-10-07-agency-workspaces:92

Ruling: Suspending a source agency pauses its unsold portfolio and terminates all related flows, but keeps collaborator authorizations subject to unavailable property; suspending a collaborator withdraws its own third-party mandates/flows without pausing other origins — do not revoke B's source-granted authorization merely because A is suspended, while B's operational suspension must not resume withdrawn commitments — cost if wrong: new explicit source acceptance required for recovered collaborator B, and source recovery still requires explicit listing resumption; never restore sold state/processes/badge automatically.

## R18 — 2026-10-07-agency-workspaces:93

Ruling: Recover an agency by granting confirmed active replacement administrator membership and auditing replacement UUID/reason/actor/versions; preserve original agency application/responsible identity (nullable on Auth deletion), without rewriting applicant fields or adding an unrelated current-responsible field — registration provenance must stay true and its unique responsible constraint must not prevent multi-agency membership/recovery — cost if wrong: a future distinct business contact/profile update flow is needed; recovery itself does not change historical applicant identity.

## R19 — 2026-10-07-agency-workspaces:94

Ruling: A suspended corporate origin rejects new mandate/common-change request inserts even when B retains its authorization; paused homes with still-approved origin retain authorized correction proposals under existing moderation holds — suspended origin cannot acquire new operational processes, while a paused listing is not by itself agency suspension — cost if wrong: proposals wait until origin recovery; ordered source/context agency locks and positive paused-approved regression required to avoid blocking legitimate corrections or introducing deadlock.

## R20 — 2026-10-07-agency-workspaces:101

Ruling: General buyer agency contact enters an unassigned queue without treating technical custodian as counterpart; assignment checks buyer/newstaff blocks, staff sends check real sender/buyer plus current assignee/buyer, buyer sends check current assignee when present, and coordinators/admins explicitly take/reassign a queued case — blocks bind real people and cannot be bypassed through agency representation or silent fallback — cost if wrong: extra explicit reassignment before an alternate staff member can communicate with a blocked-assignee case; authorized agency history remains readable and no cross-agency/person-chat access is added.

## R21 — 2026-10-07-agency-workspaces:103

Ruling: Preserve the historical notification migration checksum and stored statement exactly; accept its normalized-identical SQL as dependency evidence without overwriting the original byte hash — original stored bytes match their recorded checksum and no SQL content drift exists — cost if wrong: legacy raw-local-byte verifier remains incompatible with that historical newline representation; new agency migration hashes must use exact reviewed bytes and be recorded independently.

## R22 — 2026-10-07-agency-workspaces:104

Ruling: Task8 implements guarded external-lead RPC/repository intake with no fake Auth/chat; Task10 adds its actual private intake form in AgencyDeals/Deal workspace and Task14 exercises it — full workspace entry and manual followup/proposal UI belong together rather than a duplicate temporary Inbox form — cost if wrong: Task8 alone has no external-intake screen; the full-plan completion gate remains blocked until Task10 provides a usable entry.

Phase occurrence 2026-10-07-agency-commercial-flows:24:

Task8 scope ruling: external intake guarded RPC/repo now, actual private external-intake UI requiredTask10 AgencyDeals/Deal (andTask14 journey). No Task8-alone/full-product completion claim without that later entry.

Cost: inherited verbatim from the complete master ruling immediately above; shorthand did not record a separate cost.

## R23 — 2026-10-07-agency-workspaces:105

Ruling: Add a narrow positive canEditPersonal capability to existing authorized listing-management projection; public-only personalContact metadata gates public contact/profile, never private personal draft/paused edit — public metadata is null on nonpublic listings and raw custody equality would expose corporate legacy editing — cost if wrong: older servers lacking the capability conservatively hide private Edit until backend update; deployment already applies migrations before the compatible client. Preserve row visibility/demo behavior/current account eligibility, expose no origin proof.

Phase occurrence 2026-10-07-agency-commercial-flows:25:

Task8 management Ruling: minimal canEditPersonal boolean in existing management RPC/hook restores private personal draft/paused Edit without custody contact fallback or transient corporate edit controls; exact current owner/eligible/noncorporate server checks and module-off regressions. No older migration rewrites.

Cost: inherited verbatim from the complete master ruling immediately above; shorthand did not record a separate cost.

## R24 — 2026-10-07-agency-workspaces:109

Ruling: Use a successful caller/conversation/actual-target-scoped block receipt as historical counterpart evidence for removing that caller's own former-manager block; expose only caller's currently blocked target UUIDs in an authorized conversation — a buyer may block before a first staff message and reassignment/removal would otherwise erase the usable unblock target — cost if wrong: minimal retained blocked-counterpart UUIDs/read UI beyond current assignee; require exact receipt actor/scope/body/current own block and current conversation access, no general roster/receipt/block disclosure or restored assignment/removed-member access.

## R25 — 2026-10-07-agency-workspaces:111

Ruling: A new accepted agency visit must have an explicit current eligible assignee before confirmation; a general queued deal may receive a proposed visit but a coordinator/admin must first claim or assign it through the guarded assignment action — property and manager conflict checks require a real responsible person, and explicit assignment preserves block checks without silent rerouting — cost if wrong: one extra visible assignment step before confirming an unassigned visit; offers/history remain separate and no synthetic manager is introduced.

Phase occurrence 2026-10-07-agency-commercial-flows:30:

Ruling: A new accepted agency visit must have an explicit current eligible assignee before confirmation; a general queued deal may receive a proposed visit but a coordinator/admin must first claim or assign it through the guarded assignment action — property and manager conflict checks require a real responsible person, and explicit assignment preserves block checks without silent rerouting — cost if wrong: one extra visible assignment step before confirming an unassigned visit; offers/history remain separate and no synthetic manager is introduced.

## R26 — 2026-10-07-agency-workspaces:119

Ruling: Expose a typed bounded proposal-event history through a current-deal-authorized paginated read RPC/repository for Task10 manual-response attribution, keeping the exact AgencyProposal projection intact — latest-response-only metadata would hide the manual acceptance actor/channel/reference after a subsequent cancellation, while external leads have no conversation UI — cost if wrong: one additional private read RPC/event DTO; exclude receipt bodies, raw immutable author IDs, contact consent proofs and other-agency events, and retain nullable deleted-account attribution.

Phase occurrence 2026-10-07-agency-commercial-flows:36:

Ruling: Expose a typed bounded proposal-event history through a current-deal-authorized paginated read RPC/repository for Task10 manual-response attribution, keeping the exact AgencyProposal projection intact — latest-response-only metadata would hide the manual acceptance actor/channel/reference after a subsequent cancellation, while external leads have no conversation UI — cost if wrong: one additional private read RPC/event DTO; exclude receipt bodies, raw immutable author IDs, contact consent proofs and other-agency events, and retain nullable deleted-account attribution.

## R27 — 2026-10-07-agency-workspaces:120

Ruling: Task9 may show a temporarily disabled staff-only Solicitar cierre control beside an accepted agreement, with product copy explaining separate sale confirmation; Task11 must wire the real guarded request before rendered/full-plan/release completion — proposal acceptance and sale authority are separate sequential tasks — cost if wrong: an interim disabled action remains unusable if Task11 omits integration, so later completion is explicitly blocked until wiring; buyers gain no agency closure authority.

Phase occurrence 2026-10-07-agency-commercial-flows:37:

Ruling: Task9 may show a temporarily disabled staff-only Solicitar cierre control beside an accepted agreement, with product copy explaining separate sale confirmation; Task11 must wire the real guarded request before rendered/full-plan/release completion — proposal acceptance and sale authority are separate sequential tasks — cost if wrong: an interim disabled action remains unusable if Task11 omits integration, so later completion is explicitly blocked until wiring; buyers gain no agency closure authority.

## R28 — 2026-10-07-agency-workspaces:122

Ruling: Treat imported legacy personal visit occupancy as derived scheduling data that must follow ordinary personal listing/negotiation deletion when no agency or alias history exists; actual agency visit/proposal history uses the retained private dwelling identity — Task9 shared occupancy must preserve Task7 personal deletion and avoid archiving every purely personal visit as business history — cost if wrong: additional FK/trigger cleanup coordination and loss of derived occupancy when its original personal record is deleted, matching existing personal behavior; require a targeted actual SQL deletion regression.

Phase occurrence 2026-10-07-agency-commercial-flows:39:

Ruling: Treat imported legacy personal visit occupancy as derived scheduling data that must follow ordinary personal listing/negotiation deletion when no agency or alias history exists; actual agency visit/proposal history uses the retained private dwelling identity — Task9 shared occupancy must preserve Task7 personal deletion and avoid archiving every purely personal visit as business history — cost if wrong: additional FK/trigger cleanup coordination and loss of derived occupancy when its original personal record is deleted, matching existing personal behavior; require a targeted actual SQL deletion regression.

## R29 — 2026-10-07-agency-workspaces:123

Ruling: Split production authenticated smoke around the final authorized flag change: verify real Auth/schema/read permissions/disabled-write rejection and applicable Storage before enabling; after all local/rendered/client gates, enable once and immediately run controlled flag-dependent business checks, disabling on failure — guarded registration/member/commercial RPCs correctly reject while the module is off, so a full business smoke cannot precede activation without a hidden bypass — cost if wrong: a brief live activation precedes completion of the controlled business smoke; mitigate with default-pending real agencies, receipt-bound draft-only fixtures, immediate operational disable on any failure, preserved sales/history and exact fixture cleanup.

Phase occurrence 2026-10-07-agency-closure-release:33:

Ruling: Split production authenticated smoke around the final authorized flag change: verify real Auth/schema/read permissions/disabled-write rejection and applicable Storage before enabling; after all local/rendered/client gates, enable once and immediately run controlled flag-dependent business checks, disabling on failure — guarded registration/member/commercial RPCs correctly reject while the module is off, so a full business smoke cannot precede activation without a hidden bypass — cost if wrong: a brief live activation precedes completion of the controlled business smoke; mitigate with default-pending real agencies, receipt-bound draft-only fixtures, immediate operational disable on any failure, preserved sales/history and exact fixture cleanup.

## R30 — 2026-10-07-agency-workspaces:124

Ruling: Preserve legacy personal negotiation email-confirmation semantics while using the same physical mutex protocol; separate validation-free common lock primitives from corporate confirmed-email validation and current personal participant/active/deleting validation — calling agency_flow_locks unchanged for personal responses would add a new confirmed-email restriction and break historical cancellations — cost if wrong: a narrow shared-lock extraction/override requires rechecking the existing agency concurrency regression; do not weaken agency_account or duplicate the full locking protocol without concrete justification.

Phase occurrence 2026-10-07-agency-commercial-flows:40:

Ruling: Preserve legacy personal negotiation email-confirmation semantics while using the same physical mutex protocol; separate validation-free common lock primitives from corporate confirmed-email validation and current personal participant/active/deleting validation — calling agency_flow_locks unchanged for personal responses would add a new confirmed-email restriction and break historical cancellations — cost if wrong: a narrow shared-lock extraction/override requires rechecking the existing agency concurrency regression; do not weaken agency_account or duplicate the full locking protocol without concrete justification.

## R31 — 2026-10-07-agency-workspaces:125

Ruling: Removing a member transfers agency-owned pending proposals and future confirmed appointments to an unassigned handoff state rather than cancelling customer commitments; revoke staff access, clear departed-manager occupancy, retain property occupancy and recorded authorship, and require explicit eligible reassignment before new visit confirmation — the spec moves agency cases/tasks to a reassignment queue and membership loss does not withdraw the agency mandate or sell the home — cost if wrong: the property remains booked while the agency resolves the queue; coordinators/admins may explicitly reassign or cancel, and Task10 must refresh only future valid reminders without reviving a cancelled appointment. Source/mandate termination still cancels applicable commitments; completed history stays.

Phase occurrence 2026-10-07-agency-commercial-flows:41:

Ruling: Removing a member transfers agency-owned pending proposals and future confirmed appointments to an unassigned handoff state rather than cancelling customer commitments; revoke staff access, clear departed-manager occupancy, retain property occupancy and recorded authorship, and require explicit eligible reassignment before new visit confirmation — the spec moves agency cases/tasks to a reassignment queue and membership loss does not withdraw the agency mandate or sell the home — cost if wrong: the property remains booked while the agency resolves the queue; coordinators/admins may explicitly reassign or cancel, and Task10 must refresh only future valid reminders without reviving a cancelled appointment. Source/mandate termination still cancels applicable commitments; completed history stays.

## R32 — 2026-10-07-agency-workspaces:128

Ruling: Resolve the inherited source-personal deletion/agency-flow lock inversion in Task13 with an actual barrier regression and owner-prefix correction before final review or production, keeping Task9 fix scoped to handoff/expiry — the risk spans Task7 deletion and all later flow mutex consumers, and Task13 owns complete concurrency integration — cost if wrong: intermediate commits retain a known unproven deadlock path; no lifecycle-complete claim or deployment may pass until its deterministic RED/GREEN and preserved deletion/history behavior are recorded.

Phase occurrence 2026-10-07-agency-commercial-flows:44:

Ruling: Resolve the inherited source-personal deletion/agency-flow lock inversion in Task13 with an actual barrier regression and owner-prefix correction before final review or production, keeping Task9 fix scoped to handoff/expiry — the risk spans Task7 deletion and all later flow mutex consumers, and Task13 owns complete concurrency integration — cost if wrong: intermediate commits retain a known unproven deadlock path; no lifecycle-complete claim or deployment may pass until its deterministic RED/GREEN and preserved deletion/history behavior are recorded.

Phase occurrence 2026-10-07-agency-closure-release:34:

Ruling: Resolve the inherited source-personal deletion/agency-flow lock inversion in Task13 with an actual barrier regression and owner-prefix correction before final review or production, keeping Task9 fix scoped to handoff/expiry — the risk spans Task7 deletion and all later flow mutex consumers, and Task13 owns complete concurrency integration — cost if wrong: intermediate commits retain a known unproven deadlock path; no lifecycle-complete claim or deployment may pass until its deterministic RED/GREEN and preserved deletion/history behavior are recorded.

## R33 — 2026-10-07-agency-workspaces:132

Ruling: Reject manual won with KH_AGENCY_CLOSURE_REQUIRED until Task11 confirms a global sale; explicit lost ends only that private interested case's current commitments, ordinary followups and reminders, preserves history and global availability, creates server-only external cancellation communication obligations, and never revives cancelled commitments through stage edits — a tracking stage must not bypass sale authority or leave an abandoned appointment booked, and visited does not prove a performed outcome — cost if wrong: marking lost requires an explicit visible consequence and fresh new actions rather than restoring cancelled appointments; no other agency is affected.

Phase occurrence 2026-10-07-agency-commercial-flows:48:

Ruling: Reject manual won with KH_AGENCY_CLOSURE_REQUIRED until Task11 confirms a global sale; explicit lost ends only that private interested case's current commitments, ordinary followups and reminders, preserves history and global availability, creates server-only external cancellation communication obligations, and never revives cancelled commitments through stage edits — a tracking stage must not bypass sale authority or leave an abandoned appointment booked, and visited does not prove a performed outcome — cost if wrong: marking lost requires an explicit visible consequence and fresh new actions rather than restoring cancelled appointments; no other agency is affected.

## R34 — 2026-10-07-agency-workspaces:133

Ruling: A non-null followup-task assignee must be the current eligible deal assignee; tasks never widen private deal/chat visibility. Coordinators/admins explicitly reassign the case before delegating to another manager, may retain null queue tasks, and transfer open tasks owned by the prior responsible person while preserving deliberate null assignments; managers mutate only their own assigned responsibilities — agency privacy is defined by assigned cases, so independent task delegation must not silently reveal another case — cost if wrong: separate-task delegation needs case reassignment and null queue tasks need an explicit task assignment; former-recipient reminders are cancelled and only current future reminders created.

Phase occurrence 2026-10-07-agency-commercial-flows:49:

Ruling: A non-null followup-task assignee must be the current eligible deal assignee; tasks never widen private deal/chat visibility. Coordinators/admins explicitly reassign the case before delegating to another manager, may retain null queue tasks, and transfer open tasks owned by the prior responsible person while preserving deliberate null assignments; managers mutate only their own assigned responsibilities — agency privacy is defined by assigned cases, so independent task delegation must not silently reveal another case — cost if wrong: separate-task delegation needs case reassignment and null queue tasks need an explicit task assignment; former-recipient reminders are cancelled and only current future reminders created.

## R35 — 2026-10-07-agency-workspaces:134

Ruling: Existing server-created external_notification tasks may be edited/reassigned and completed after commercial closure under current private authority, keeping immutable kind and a non-null assignee restricted to the deal's current eligible responsible person; current coordinator/admin may complete a null queue communication directly without reopening the closed case — notifying an external visitor is a surviving obligation rather than a new negotiation — cost if wrong: a closed unassigned case cannot delegate that task to an unrelated manager in this MVP; coordinator/admin handles it, and removed members retain no access.

Phase occurrence 2026-10-07-agency-commercial-flows:50:

Ruling: Existing server-created external_notification tasks may be edited/reassigned and completed after commercial closure under current private authority, keeping immutable kind and a non-null assignee restricted to the deal's current eligible responsible person; current coordinator/admin may complete a null queue communication directly without reopening the closed case — notifying an external visitor is a surviving obligation rather than a new negotiation — cost if wrong: a closed unassigned case cannot delegate that task to an unrelated manager in this MVP; coordinator/admin handles it, and removed members retain no access.

## R36 — 2026-10-07-agency-workspaces:135

Ruling: Preserve the exact proposal DTO and offer explicit external-client versus agency response controls, with required manual channel/reference and server-enforced opposite-party turn; add bounded authorized own-deal visit history and a minimal existing-conversation lookup to the expediente — staff recordedBy cannot identify a manually represented buyer's turn, and whole-agenda fetching or a fabricated chat would violate the accepted workflow — cost if wrong: two narrow private read interfaces and a visible wrong-turn error remain necessary; no new contact/Auth identity, other-agency data or task-derived read authority is exposed.

Phase occurrence 2026-10-07-agency-commercial-flows:52:

Ruling: Preserve the exact proposal DTO and offer explicit external-client versus agency response controls, with required manual channel/reference and server-enforced opposite-party turn; add bounded authorized own-deal visit history and a minimal existing-conversation lookup to the expediente — staff recordedBy cannot identify a manually represented buyer's turn, and whole-agenda fetching or a fabricated chat would violate the accepted workflow — cost if wrong: two narrow private read interfaces and a visible wrong-turn error remain necessary; no new contact/Auth identity, other-agency data or task-derived read authority is exposed.

## R37 — 2026-10-07-agency-workspaces:141

Ruling: Add only bounded current-authority sale-review metadata (necessary buyer label, curated factual evidence summary, names, versions, affected counts and capability flags), and freeze the latest actually accepted valid offer by acceptance time as the winning association. Explicit final price/executor remain confirmed facts; allow a truthful manual request with no accepted offer, reject later changed association as stale, and never copy private notes/references/chat or manufacture acceptance — required request input has winningDealId but no proposal selector, while offline sales and minimal origin review remain legitimate — cost if wrong: a later agreement requires correcting/replacing the request, and manually reported sales have no formal accepted-proposal evidence; source administrator must review explicit facts and limited summary.

Phase occurrence 2026-10-07-agency-closure-release:36:

Ruling: Add only bounded current-authority sale-review metadata (necessary buyer label, curated factual evidence summary, names, versions, affected counts and capability flags), and freeze the latest actually accepted valid offer by acceptance time as the winning association. Explicit final price/executor remain confirmed facts; allow a truthful manual request with no accepted offer, reject later changed association as stale, and never copy private notes/references/chat or manufacture acceptance — required request input has winningDealId but no proposal selector, while offline sales and minimal origin review remain legitimate — cost if wrong: a later agreement requires correcting/replacing the request, and manually reported sales have no formal accepted-proposal evidence; source administrator must review explicit facts and limited summary.

## R38 — 2026-10-07-agency-workspaces:142

Ruling: Add a narrow currently authorized own-deal closure preparation read returning canonical property/title, current property/authority versions and eligible responsible name/id, preserving original deal UUID and existing property-repository behavior; explicitly confirm named executor and never replace stale selection silently — carried aliases may have no active original mandate, so propertyRepository.get(originalUUID) cannot safely prepare canonical sale — cost if wrong: one additional private preparation RPC/method/DTO and visible reload/correction step; write authority and alias/assignment are still rechecked and no foreign deal/private notes are exposed.

Phase occurrence 2026-10-07-agency-closure-release:38:

Ruling: Add a narrow currently authorized own-deal closure preparation read returning canonical property/title, current property/authority versions and eligible responsible name/id, preserving original deal UUID and existing property-repository behavior; explicitly confirm named executor and never replace stale selection silently — carried aliases may have no active original mandate, so propertyRepository.get(originalUUID) cannot safely prepare canonical sale — cost if wrong: one additional private preparation RPC/method/DTO and visible reload/correction step; write authority and alias/assignment are still rechecked and no foreign deal/private notes are exposed.

## R39 — 2026-10-07-agency-workspaces:143

Ruling: For direct personal sold with genuine pre-existing agency business history such as only a pending mandate request, create its first commercial cycle under the common source locks only if none exists, immediately close it with truthful null agency/manager/amount and terminate pending subjects; never reopen a prior closed cycle and preserve the ordinary purely-personal no-business path — a pending agency request must terminate on real source-confirmed sale even before the first deal/cycle exists — cost if wrong: one historical cycle/closure is added for that real personal sale, while no executing agency or negotiated price is invented; existing personal eligibility/off-module rules stay intact.

Phase occurrence 2026-10-07-agency-closure-release:39:

Ruling: For direct personal sold with genuine pre-existing agency business history such as only a pending mandate request, create its first commercial cycle under the common source locks only if none exists, immediately close it with truthful null agency/manager/amount and terminate pending subjects; never reopen a prior closed cycle and preserve the ordinary purely-personal no-business path — a pending agency request must terminate on real source-confirmed sale even before the first deal/cycle exists — cost if wrong: one historical cycle/closure is added for that real personal sale, while no executing agency or negotiated price is invented; existing personal eligibility/off-module rules stay intact.

## R40 — 2026-10-07-agency-workspaces:150

Ruling: Treat agencies notification preference like the existing category preferences: agencies=false suppresses new category notices and their push while preserving already stored currently authorized history; old clients omitting it preserve the saved value. Keep in-app materialization independent of transport_enabled, device registration/capability and OS push permission — current message/visit/offer/alert producers already honor category preference before inserting notices, while device transport is separate — cost if wrong: users wanting separate in-app and push category choices would need an additional control; no saved notices are deleted and transport outage alone does not suppress the inbox.

Phase occurrence 2026-10-07-agency-closure-release:49:

Ruling: Treat agencies notification preference like the existing category preferences: agencies=false suppresses new category notices and their push while preserving already stored currently authorized history; old clients omitting it preserve the saved value. Keep in-app materialization independent of transport_enabled, device registration/capability and OS push permission — current message/visit/offer/alert producers already honor category preference before inserting notices, while device transport is separate — cost if wrong: users wanting separate in-app and push category choices would need an additional control; no saved notices are deleted and transport outage alone does not suppress the inbox.

## R41 — 2026-10-07-agency-workspaces:151

Ruling: A real account buyer in a staff-created agency deal without any agency conversation still receives its minimal property_sold notice, resolved to the account Notifications screen containing that notice; when an authorized real conversation exists, resolve to its actual UUID. Clear agency context for these account destinations, create no chat or new buyer-case screen and grant no staff membership — Task11 legitimately records real buyer recipients even without conversation, but current deal UI is staff-only and an empty message inbox would not show the sold notice — cost if wrong: that buyer sees the saved generic sale notice instead of a detailed buyer-case page; a richer buyer journey can be added later without inventing conversation/history or broadening permissions.

Phase occurrence 2026-10-07-agency-closure-release:50:

Ruling: A real account buyer in a staff-created agency deal without any agency conversation still receives its minimal property_sold notice, resolved to the account Notifications screen containing that notice; when an authorized real conversation exists, resolve to its actual UUID. Clear agency context for these account destinations, create no chat or new buyer-case screen and grant no staff membership — Task11 legitimately records real buyer recipients even without conversation, but current deal UI is staff-only and an empty message inbox would not show the sold notice — cost if wrong: that buyer sees the saved generic sale notice instead of a detailed buyer-case page; a richer buyer journey can be added later without inventing conversation/history or broadening permissions.

## R42 — 2026-10-07-agency-workspaces:156

Ruling: Prepare a root deployment-only .vercelignore allowlist for the required web subtree, retaining the existing project Root Directory web and excluding web tsconfig as its own current ignore requires, plus dependencies/build output/local env; verify exact dry-run inputs and build before publishing. Do not upload repository scratch, PostgreSQL, mobile sources, infra or credentials — actual Vercel dry run without root override selected2797 files/107584240 bytes including2087 .superpowers scratch files, and ignored the nested web tsconfig exclusion at root — cost if wrong: a missing required web file causes a dry/build failure before domain promotion and can be restored narrowly; no source or secrets have been uploaded by this preflight.

Phase occurrence 2026-10-07-agency-closure-release:55:

Ruling: Prepare a root deployment-only .vercelignore allowlist for the required web subtree, retaining the existing project Root Directory web and excluding web tsconfig as its own current ignore requires, plus dependencies/build output/local env; verify exact dry-run inputs and build before publishing. Do not upload repository scratch, PostgreSQL, mobile sources, infra or credentials — actual Vercel dry run without root override selected2797 files/107584240 bytes including2087 .superpowers scratch files, and ignored the nested web tsconfig exclusion at root — cost if wrong: a missing required web file causes a dry/build failure before domain promotion and can be restored narrowly; no source or secrets have been uploaded by this preflight.

## R43 — 2026-10-07-agency-workspaces:158

Ruling: Use the already-authorized commit/push to publish codex/agency-workspaces and create a reviewable pull request against the confirmed main fork point; deploy only the reviewed feature artifact through the separately authorized production procedure. Preserve the primary checkout and do not merge/push the shared main branch automatically — the user explicitly requested tested commits/push and production activation, while the primary checkout contains unrelated dirty work and no shared-main merge was requested — cost if wrong: main will await PR integration and a maintainer may need to merge it later; the complete feature remains backed up remotely and the published runtime is tied to the verified feature commit.

Phase occurrence 2026-10-07-agency-closure-release:57:

Ruling: Use the already-authorized commit/push to publish codex/agency-workspaces and create a reviewable pull request against the confirmed main fork point; deploy only the reviewed feature artifact through the separately authorized production procedure. Preserve the primary checkout and do not merge/push the shared main branch automatically — the user explicitly requested tested commits/push and production activation, while the primary checkout contains unrelated dirty work and no shared-main merge was requested — cost if wrong: main will await PR integration and a maintainer may need to merge it later; the complete feature remains backed up remotely and the published runtime is tied to the verified feature commit.

## R44 — 2026-10-07-agency-workspaces:163

Ruling: Fix withdraw_personal_property at its owning BEFORE DELETE helper by obtaining the current sorted affected-agency advisory locks only with nonblocking pg_try_advisory_xact_lock using the existing exact lock key; if any is unavailable, raise KH_AGENCY_LIFECYCLE_RETRY with SQLSTATE40001 before any termination writes. Existing correctly prepared public/Auth prefixes continue normally; stale dynamic sets and privileged direct DELETE reject atomically and can retry after contention. Do not add unrelated protected-owner locks or redesign global alias/source authority — actual authenticated public deletion prepared {A}, a newly committed pending B mandate expanded the set during the A wait, B withdrawal held B while waiting for the property, and deletion held that property while waiting for B; three observed blocking edges reproduced a real deadlock — cost if wrong: a contended deletion can return a temporary serialization/retry error requiring a fresh attempt; the failed transaction preserves source/history and no visit/chat/sale is partially terminated.

Phase occurrence 2026-10-07-agency-closure-release:62:

Ruling: Fix withdraw_personal_property at its owning BEFORE DELETE helper by obtaining the current sorted affected-agency advisory locks only with nonblocking pg_try_advisory_xact_lock using the existing exact lock key; if any is unavailable, raise KH_AGENCY_LIFECYCLE_RETRY with SQLSTATE40001 before any termination writes. Existing correctly prepared public/Auth prefixes continue normally; stale dynamic sets and privileged direct DELETE reject atomically and can retry after contention. Do not add unrelated protected-owner locks or redesign global alias/source authority — actual authenticated public deletion prepared {A}, a newly committed pending B mandate expanded the set during the A wait, B withdrawal held B while waiting for the property, and deletion held that property while waiting for B; three observed blocking edges reproduced a real deadlock — cost if wrong: a contended deletion can return a temporary serialization/retry error requiring a fresh attempt; the failed transaction preserves source/history and no visit/chat/sale is partially terminated.

## R45 — 2026-10-07-agency-workspaces:165

Ruling: Run complete legacy-upgrade serial regression on a separately owned disposable baseline reconstructed from the strict local source with PostgreSQL pg_dump/restore and ICU en-US locale, retaining actual schema/data/grants/owners and exact source inventory; use a small shared bootstrap only where needed and fail if this declared test locale cannot be provided. Do not alter production kh_catalog_where/kh_unaccent or install a test collation behavior adapter — actual source local database C/C/libc leaves uppercase accented A unchanged, while a root read-only hosted query confirms ICU en-US, en_US.UTF-8 and lower(U&'\\00c1')=lowercase accented a, so the historical catalogue test failure is a known emulator mismatch — cost if wrong: the local all-schema runner needs pg_dump/restore and ICU-capable PostgreSQL, and bootstrap failures stop verification; no production SQL behavior or source data is changed to make a test pass.

Phase occurrence 2026-10-07-agency-closure-release:64:

Ruling: Run complete legacy-upgrade serial regression on a separately owned disposable baseline reconstructed from the strict local source with PostgreSQL pg_dump/restore and ICU en-US locale, retaining actual schema/data/grants/owners and exact source inventory; use a small shared bootstrap only where needed and fail if this declared test locale cannot be provided. Do not alter production kh_catalog_where/kh_unaccent or install a test collation behavior adapter — actual source local database C/C/libc leaves uppercase accented A unchanged, while a root read-only hosted query confirms ICU en-US, en_US.UTF-8 and lower(U&'\\00c1')=lowercase accented a, so the historical catalogue test failure is a known emulator mismatch — cost if wrong: the local all-schema runner needs pg_dump/restore and ICU-capable PostgreSQL, and bootstrap failures stop verification; no production SQL behavior or source data is changed to make a test pass.

## R46 — 2026-10-07-agency-workspaces:166

Ruling: Update only the three stale historical denied-edit expected-error strings in listing_details.sql and property_map.sql to KH_PROPERTY_MANAGEMENT_CHANGED, retaining denied-edit/privacy/version assertions and unchanged product SQL. Keep the untouched-pre-agency reproduction as baseline evidence — root verified migration20261005000100_assisted_listing_records.sql:377 already established this exact ownership/edit rejection, and the unchanged pre-agency fixture reproduces the older test expectation failure before agency migrations — cost if wrong: these tests now target the established latest pre-agency guard rather than an older standalone migration prefix; a genuinely changed edit/visibility state still fails and no broader error acceptance is introduced.

Phase occurrence 2026-10-07-agency-closure-release:65:

Ruling: Update only the three stale historical denied-edit expected-error strings in listing_details.sql and property_map.sql to KH_PROPERTY_MANAGEMENT_CHANGED, retaining denied-edit/privacy/version assertions and unchanged product SQL. Keep the untouched-pre-agency reproduction as baseline evidence — root verified migration20261005000100_assisted_listing_records.sql:377 already established this exact ownership/edit rejection, and the unchanged pre-agency fixture reproduces the older test expectation failure before agency migrations — cost if wrong: these tests now target the established latest pre-agency guard rather than an older standalone migration prefix; a genuinely changed edit/visibility state still fails and no broader error acceptance is introduced.

## R47 — 2026-10-07-agency-workspaces:167

Ruling: Adapt historical regression fixtures/assertions narrowly to the current approved contracts: compare notification preferences after removing only the added agencies field and assert its full-schema default separately; seed pagination messages as actual prior-day history while preserving the live rate guard; resolve exactly one current notification RPC signature and still deny anon; require the explicit current KH_OWNER_PROTECTED rejection plus retained Auth owner row (older standalone prefix keeps its exact FK expectation). Preserve all category/legacy-call/pagination/read/state/privacy assertions and product guards — Task12 intentionally adds an optional argument/default and Task7 intentionally protects the owner before Auth FK deletion, while pagination history is independent of live send throughput — cost if wrong: these historical tests exercise the latest compatibility contract rather than obsolete literal shapes/live-burst fixture assumptions; separate live rate-limit and owner-state checks remain required, and no generic error or extra-field acceptance is added.

Phase occurrence 2026-10-07-agency-closure-release:66:

Ruling: Adapt historical regression fixtures/assertions narrowly to the current approved contracts: compare notification preferences after removing only the added agencies field and assert its full-schema default separately; seed pagination messages as actual prior-day history while preserving the live rate guard; resolve exactly one current notification RPC signature and still deny anon; require the explicit current KH_OWNER_PROTECTED rejection plus retained Auth owner row (older standalone prefix keeps its exact FK expectation). Preserve all category/legacy-call/pagination/read/state/privacy assertions and product guards — Task12 intentionally adds an optional argument/default and Task7 intentionally protects the owner before Auth FK deletion, while pagination history is independent of live send throughput — cost if wrong: these historical tests exercise the latest compatibility contract rather than obsolete literal shapes/live-burst fixture assumptions; separate live rate-limit and owner-state checks remain required, and no generic error or extra-field acceptance is added.

## R48 — 2026-10-07-agency-workspaces:172

Ruling: Let the Task14 implementer create one owned background tab within its existing selected IAB provider when its session inventory has no tabs; reuse that provider/tab throughout and close only its owned tab after evidence. Root's earlier browser2/Tab1 remains in the root session and is not accessible from this subagent's codexSessionId — actual child inventory reports IAB id2 with empty tabs, so forcing root's tab handle would prevent permitted local UI verification without improving isolation — cost if wrong: one additional temporary browser tab and independent fixture login session; no different browser/account destination or production operation is introduced.

Phase occurrence 2026-10-07-agency-closure-release:71:

Ruling: Let the Task14 implementer create one owned background tab within its existing selected IAB provider when its session inventory has no tabs; reuse that provider/tab throughout and close only its owned tab after evidence. Root's earlier browser2/Tab1 remains in the root session and is not accessible from this subagent's codexSessionId — actual child inventory reports IAB id2 with empty tabs, so forcing root's tab handle would prevent permitted local UI verification without improving isolation — cost if wrong: one additional temporary browser tab and independent fixture login session; no different browser/account destination or production operation is introduced.

## R49 — 2026-10-07-agency-workspaces:173

Ruling: Recover the Task14 IAB session with one replacement owned tab in the same existing provider after its failed localhost load produced a policy-blocked data:error tab; omit unsupported subagent visibility and record the orphan for documented cleanup. Do not bypass URL policy or change browser — actual documented close/goto/reload were rejected on the generated error page and the replacement now renders the connected Auth form — cost if wrong: an extra temporary orphan browser tab may remain until the app permits cleanup; no Auth injection, production destination or product evidence is inferred from browser recovery.

Phase occurrence 2026-10-07-agency-closure-release:72:

Ruling: Recover the Task14 IAB session with one replacement owned tab in the same existing provider after its failed localhost load produced a policy-blocked data:error tab; omit unsupported subagent visibility and record the orphan for documented cleanup. Do not bypass URL policy or change browser — actual documented close/goto/reload were rejected on the generated error page and the replacement now renders the connected Auth form — cost if wrong: an extra temporary orphan browser tab may remain until the app permits cleanup; no Auth injection, production destination or product evidence is inferred from browser recovery.

## R50 — 2026-10-07-agency-workspaces:174

Ruling: Split Task16 into reviewed local release preparation and root-owned authorized remote execution: prepare narrowly scoped version/download constants, signing-verifier private-path forwarding, deployment allowlist and audit preservation first, independently review that preparation, then perform the most-capable whole-branch gate before publishing or applying production migrations. Record effective remote evidence afterward without routine new product edits — Task16 release preparation is conditional authorized code and must be included in the pre-production review, while remote success cannot exist before that gate — cost if wrong: an additional preparation review and release bookkeeping commit; every shipped implementation remains reviewed and production stays untouched until the gates pass.

Phase occurrence 2026-10-07-agency-closure-release:73:

Ruling: Split Task16 into reviewed local release preparation and root-owned authorized remote execution: prepare narrowly scoped version/download constants, signing-verifier private-path forwarding, deployment allowlist and audit preservation first, independently review that preparation, then perform the most-capable whole-branch gate before publishing or applying production migrations. Record effective remote evidence afterward without routine new product edits — Task16 release preparation is conditional authorized code and must be included in the pre-production review, while remote success cannot exist before that gate — cost if wrong: an additional preparation review and release bookkeeping commit; every shipped implementation remains reviewed and production stays untouched until the gates pass.

## R51 — 2026-10-07-agency-workspaces:178

Ruling: Permit an additional receipt-owned loopback proxy for Task14 one-shot network failure before RPC forwarding or after the actual SQL-backed response commits, bound to the existing fixture runId and original origin, with exact PID/public-config restoration before principal cleanup. Reuse normal UI authentication and the current browser tab after readiness — real lost-response behavior is required and cannot be inferred from mocked client helpers or hidden Auth injection — cost if wrong: one extra temporary local process/config restart and cleanup receipt; no production connection or provider is introduced, and unique persisted receipt/no-write invariants remain required.

Phase occurrence 2026-10-07-agency-closure-release:77:

Ruling: Permit an additional receipt-owned loopback proxy for Task14 one-shot network failure before RPC forwarding or after the actual SQL-backed response commits, bound to the existing fixture runId and original origin, with exact PID/public-config restoration before principal cleanup. Reuse normal UI authentication and the current browser tab after readiness — real lost-response behavior is required and cannot be inferred from mocked client helpers or hidden Auth injection — cost if wrong: one extra temporary local process/config restart and cleanup receipt; no production connection or provider is introduced, and unique persisted receipt/no-write invariants remain required.

## R52 — 2026-10-07-agency-workspaces:180

Ruling: Fix the actual open-screen withdrawn-access bug centrally with an optional scoped authorization-rejection callback in MessagingRequestContext/createScopedRpc and current CapturedAgencyContext invalidation, limited to explicitly recognized definitive access errors after checkpoint while the exact account/agency/generation capture remains current. Clear selected scope/generation and draft/private presentation, no automatic mutation retry; retain personal callers without callback and contexts on transport, validation, disabled-module or stale-generation errors — actual removed B member Save returned KH_AGENCY_DEAL_NOT_FOUND/42501 with zero write but retained private details and retry, whereas normal back/refresh already cleared and old link denied — cost if wrong: a genuine inaccessible or reassigned private case may deselect an otherwise valid agency and require fresh authorized selection; no other current context, saved history or network receipt may be discarded.

Phase occurrence 2026-10-07-agency-closure-release:79:

Ruling: Fix the actual open-screen withdrawn-access bug centrally with an optional scoped authorization-rejection callback in MessagingRequestContext/createScopedRpc and current CapturedAgencyContext invalidation, limited to explicitly recognized definitive access errors after checkpoint while the exact account/agency/generation capture remains current. Clear selected scope/generation and draft/private presentation, no automatic mutation retry; retain personal callers without callback and contexts on transport, validation, disabled-module or stale-generation errors — actual removed B member Save returned KH_AGENCY_DEAL_NOT_FOUND/42501 with zero write but retained private details and retry, whereas normal back/refresh already cleared and old link denied — cost if wrong: a genuine inaccessible or reassigned private case may deselect an otherwise valid agency and require fresh authorized selection; no other current context, saved history or network receipt may be discarded.

## R53 — 2026-10-07-agency-workspaces:182

Ruling: Carry the remaining native Android workflow check from Task14 into Task16 local release preparation as an explicit pre-activation gate, using the final client and assessing permitted purpose-built Android/ADB tooling for a separate receipt-owned fixture package. Do not substitute browser screenshots, connected-device availability, installation or launch for native commercial behavior, and preserve the current production app/session/data — a Pixel is present but native CUA controls are disabled; testing the final corrected client avoids a stale duplicate native build — cost if wrong: Task14 completes its browser/SQL scope with a named native gate still pending, and release preparation may require extra build/tool work or an honestly documented concrete capability limitation before activation; no native success is claimed prematurely.

Phase occurrence 2026-10-07-agency-closure-release:81:

Ruling: Carry the remaining native Android workflow check from Task14 into Task16 local release preparation as an explicit pre-activation gate, using the final client and assessing permitted purpose-built Android/ADB tooling for a separate receipt-owned fixture package. Do not substitute browser screenshots, connected-device availability, installation or launch for native commercial behavior, and preserve the current production app/session/data — a Pixel is present but native CUA controls are disabled; testing the final corrected client avoids a stale duplicate native build — cost if wrong: Task14 completes its browser/SQL scope with a named native gate still pending, and release preparation may require extra build/tool work or an honestly documented concrete capability limitation before activation; no native success is claimed prematurely.

## R54 — 2026-10-07-agency-workspaces:184

Ruling: Allow one fresh explicitly owned final Task14 fixture cycle with new database/runId/receipt and same-provider owned tab to capture the missing personal-registration desktop view and validate final protocolVersion2 setup/status/cleanup. Archive the original cleaned receipt, do not implicitly resume it or repeat completed business flows, preserve both inventories/config/process receipts — implementer self-review found the prior desktop frame was pending login rather than personal registration, so claiming the full responsive matrix would be inaccurate — cost if wrong: one additional temporary clone/tab/config restart and cleanup cycle; no production action and no substitution for earlier persisted commercial evidence.

Phase occurrence 2026-10-07-agency-closure-release:83:

Ruling: Allow one fresh explicitly owned final Task14 fixture cycle with new database/runId/receipt and same-provider owned tab to capture the missing personal-registration desktop view and validate final protocolVersion2 setup/status/cleanup. Archive the original cleaned receipt, do not implicitly resume it or repeat completed business flows, preserve both inventories/config/process receipts — implementer self-review found the prior desktop frame was pending login rather than personal registration, so claiming the full responsive matrix would be inaccurate — cost if wrong: one additional temporary clone/tab/config restart and cleanup cycle; no production action and no substitution for earlier persisted commercial evidence.

## R55 — 2026-10-07-agency-workspaces:189

Ruling: Keep --enable/status/verify strict against the complete reviewed schema/byte/ledger manifest, but permit explicit --disable to acquire worker→module locks and commit OFF even when manifest verification or an individual known-queue cancellation fails, using savepoints and sanitized separate disabled/completeness/cancellation results. Missing flag/singleton is never reported as a successful shutdown — self-review found strict manifest verification before disable would block operational rollback precisely after schema drift — cost if wrong: operators may need to repair an incompletely cancelled queue after OFF and a previously authorized external transport cannot be recalled; no sales/history are reversed, no missing verification is reported as passing and activation remains strict.

Phase occurrence 2026-10-07-agency-closure-release:89:

Ruling: Keep --enable/status/verify strict against the complete reviewed schema/byte/ledger manifest, but permit explicit --disable to acquire worker→module locks and commit OFF even when manifest verification or an individual known-queue cancellation fails, using savepoints and sanitized separate disabled/completeness/cancellation results. Missing flag/singleton is never reported as a successful shutdown — self-review found strict manifest verification before disable would block operational rollback precisely after schema drift — cost if wrong: operators may need to repair an incompletely cancelled queue after OFF and a previously authorized external transport cannot be recalled; no sales/history are reversed, no missing verification is reported as passing and activation remains strict.

## R56 — 2026-10-07-agency-workspaces:190

Ruling: For managed baseline auth.users/storage.objects, pin the agency-specific triggers/policies introduced or altered by the ten migrations rather than requiring the disposable local Supabase emulator to match every unrelated hosted baseline column/constraint/trigger. Keep exact full inventory for agency-owned/touched business schema, narrow effective permissions, and controlled real Auth/Storage checks before activation — Task15 found OFF portfolio media authorization still depended on enabled, and adding full managed-table hashes would confuse emulator differences with agency drift — cost if wrong: unrelated managed-baseline drift needs its separate production permission/smoke preflight; missing or changed agency trigger/policy still rejects activation and current-member media never grants an inactive mandate new private property access.

Phase occurrence 2026-10-07-agency-closure-release:90:

Ruling: For managed baseline auth.users/storage.objects, pin the agency-specific triggers/policies introduced or altered by the ten migrations rather than requiring the disposable local Supabase emulator to match every unrelated hosted baseline column/constraint/trigger. Keep exact full inventory for agency-owned/touched business schema, narrow effective permissions, and controlled real Auth/Storage checks before activation — Task15 found OFF portfolio media authorization still depended on enabled, and adding full managed-table hashes would confuse emulator differences with agency drift — cost if wrong: unrelated managed-baseline drift needs its separate production permission/smoke preflight; missing or changed agency trigger/policy still rejects activation and current-member media never grants an inactive mandate new private property access.

## R57 — 2026-10-07-agency-workspaces:191

Ruling: The owner-only proven assisted-link action still establishes a new immutable agency origin and must reject when OFF, preserving its existing Task5 enabled requirement. Linearize it with disable by obtaining the module shared lock at the outermost public entry before account/agency/property prefixes; never acquire that lock below an already-held agency lock. Existing review/recovery/withdrawal/consolidation maintenance remains separately available — no prior assisted-link ruling grants an OFF exception, and calling new authority attribution maintenance would permit it to commit after shutdown — cost if wrong: an operator must enable before attributing an eligible assisted source and an in-flight attribution may delay disable; provenance, custody, alias, moderation and receipt checks remain mandatory.

Phase occurrence 2026-10-07-agency-closure-release:91:

Ruling: The owner-only proven assisted-link action still establishes a new immutable agency origin and must reject when OFF, preserving its existing Task5 enabled requirement. Linearize it with disable by obtaining the module shared lock at the outermost public entry before account/agency/property prefixes; never acquire that lock below an already-held agency lock. Existing review/recovery/withdrawal/consolidation maintenance remains separately available — no prior assisted-link ruling grants an OFF exception, and calling new authority attribution maintenance would permit it to commit after shutdown — cost if wrong: an operator must enable before attributing an eligible assisted source and an in-flight attribution may delay disable; provenance, custody, alias, moderation and receipt checks remain mandatory.

## R58 — 2026-10-07-agency-workspaces:194

Ruling: Keep production authenticated smoke receipt-bound and unpublished: prove real Auth/REST/Storage, approval/team/verification separation and draft policy through permitted endpoints, plus current/foreign/removed permission denials and guarded commercial rejection where an unpublished draft cannot operate. Do not publish a fictional active home, sell a real listing or insert a hidden authorization bypass just to reproduce every positive visit/chat/sale step on live data; the complete positive business journeys remain proven in owned real-SQL/browser fixtures and are reported separately — initial hosted agencies/history are absent and the protected draft/publication guards make an all-positive live fixture incompatible with the established no-fake-public-listing boundary — cost if wrong: a hosted-only positive downstream integration issue could remain unseen; exact reviewed schema/grants, broad local SQL/concurrency/rendered evidence, compatible client and immediate operational disable mitigate it, and no complete live-sale/provider/device claim is made.

Phase occurrence 2026-10-07-agency-closure-release:94:

Ruling: Keep production authenticated smoke receipt-bound and unpublished: prove real Auth/REST/Storage, approval/team/verification separation and draft policy through permitted endpoints, plus current/foreign/removed permission denials and guarded commercial rejection where an unpublished draft cannot operate. Do not publish a fictional active home, sell a real listing or insert a hidden authorization bypass just to reproduce every positive visit/chat/sale step on live data; the complete positive business journeys remain proven in owned real-SQL/browser fixtures and are reported separately — initial hosted agencies/history are absent and the protected draft/publication guards make an all-positive live fixture incompatible with the established no-fake-public-listing boundary — cost if wrong: a hosted-only positive downstream integration issue could remain unseen; exact reviewed schema/grants, broad local SQL/concurrency/rendered evidence, compatible client and immediate operational disable mitigate it, and no complete live-sale/provider/device claim is made.

## R59 — 2026-10-07-agency-workspaces:198

Ruling: Use a short root-owned same-session kh:push:worker advisory pause around the controlled production Auth/REST/Storage fixture, with strict manifest-verified enable and emergency disable acquiring the module lock on that same connection. Hold no account/agency/property/recipient locks during HTTP; remove only receipt-owned fixture events and subjects before releasing the worker. If the connection is lost, immediately disable through the ordinary explicit operator and report no-send assurance interrupted — the reviewed push_tick returns busy before reminders/subjects/provider under this exact mutex, while a second configure connection would wait on the paused worker — cost if wrong: unrelated asynchronous push processing is delayed briefly and a lost connection can permit fixture processing until shutdown; preserve pre-existing jobs, never erase provider evidence, require no fixture devices/attempts and exact cleanup, and do not claim real provider or physical delivery.

Phase occurrence 2026-10-07-agency-closure-release:98:

Ruling: Use a short root-owned same-session kh:push:worker advisory pause around the controlled production Auth/REST/Storage fixture, with strict manifest-verified enable and emergency disable acquiring the module lock on that same connection. Hold no account/agency/property/recipient locks during HTTP; remove only receipt-owned fixture events and subjects before releasing the worker. If the connection is lost, immediately disable through the ordinary explicit operator and report no-send assurance interrupted — the reviewed push_tick returns busy before reminders/subjects/provider under this exact mutex, while a second configure connection would wait on the paused worker — cost if wrong: unrelated asynchronous push processing is delayed briefly and a lost connection can permit fixture processing until shutdown; preserve pre-existing jobs, never erase provider evidence, require no fixture devices/attempts and exact cleanup, and do not claim real provider or physical delivery.
