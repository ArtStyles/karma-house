# Independent I5 recovery re-review

**I5 — ADDRESSED.** Spec compliance and code quality pass for the narrowly scoped correction. No new Critical/Important/Minor breakage established in the four-file fix.

Reviewer: `/root/review_agency_i5_recovery`. Date: 2026-10-08.
Worktree: `C:/Users/ACER NITRO/.codex/worktrees/agency-workspaces/karma-house`.
Fix BASE: `5c60021d8331947c373f6d01980ffef075998eb4`.
Reviewed HEAD: `b54abeb01833fdcf218a8669d0537e7fc8cce766`.

## Scope and review inputs

Read the required preflight first, full I5 recovery brief and report, full prior final-fix scoped review including I5 and its actual-load counterexample, and the full 30,868-byte fix package. Retrieved bounded portions where tool output was truncated. Applied the supplied scoped re-review prompt. Reviewed the actual four changed paths and, solely to establish their semantics, the actual controller, provider, scoped RPC/checkpoints, messaging repository/decoder, proposal panel, activity/polling logic and the SQL read/markRead authorization call chain. This is not another whole-branch review.

No product/Git edits, subagents, primary/private input access, credentials, SQL/provider/native/browser execution, fixture creation or remote actions occurred. All commands used the explicit isolated workdir. No Git commands or green test/matrix reruns were issued. The only write is this report. A few exploratory searches used nonexistent scoped-RPC/core filenames or unsupported Windows glob paths; subsequent explicit-path and rg -g searches read the real files. These errors did not execute or mutate application state.

## Finding verdict and source reasoning

### I5 preservation across temporary current-scope refresh failure — ADDRESSED

The original Important defect was the common catch replacing a successfully authorized chat with null and an empty history after an ordinary markRead failure, followed by recovery loading only 30 messages. The inbox similarly erased its loaded-page target, and chat null removed the proposal child.

At `src/screens/AgencyConversationScreen.tsx:74`, the catch now checkpoints its captured authority before publishing. At `:77` it requires the current scope and current read ticket. At `:78` preservation requires an actual captured context and a non-access error. The functional update at `:79` retains the entire prior same-scope state and adds the error. Thus get/history transport failure leaves conversation, message collection and hasMore intact; markRead failure also leaves the conversation/history that the successful preceding read published at `:71`. No partial replacement with null remains on this ordinary path.

Recovery at `src/screens/AgencyConversationScreen.tsx:67` passes the surviving previous message collection and hasMore to the unchanged incoming helper. `src/agencies/messaging/live.ts:18` fills incoming gaps before merging; `src/agencies/messaging/repository.ts:22` merges by message ID and sorts by sequence. The screen's functional merge also uses the current same-scope prior state, preserving pages added while a refresh is in flight. A healthy refresh therefore does not recreate the original 60-to-30 collapse. Error/retry UI remains at screen `:145`; older paging remains at `:148`.

At `src/screens/InboxScreen.tsx:68`, the new catch likewise requires a passing captured checkpoint, current epoch and scope, and a same-scope non-access error before retaining items and hasMore. The preserved item count continues to feed the existing loaded-page target at `:67`. The saved executable recovery test verifies 60 distinct rows and the more-pages control after failure and recovery. This is a same-authorized-data recovery claim, not a fresh claim about snapshots under arbitrary concurrent offset-page changes.

### Draft, proposal ownership and manual attempt identity — ADDRESSED

The transient chat path does not clear body, report target or pending message attempt. Conversation remains non-null, and the unchanged proposal child at `src/screens/AgencyConversationScreen.tsx:152` keeps the same component position/type and scope key. A newly decoded conversation object alone does not change that key. Its capture and deal ID dependencies likewise remain stable on a same-scope refresh.

The actual proposal draft belongs to state at `src/components/agencies/AgencyProposalPanel.tsx:28`, and its stable attempt belongs to the ref at `:30`. Retaining the child boundary therefore retains these values. The focused hook/element tests execute the actual panel function, check its draft and mounted/keyed continuity, and compare the complete first and manually retried proposal/message payloads at `tests/agency-refresh-recovery.test.ts:137`. This supports unchanged request identity and content through failure and healthy recovery, rather than merely inferring it from a static loader.

The refresh callback invokes only conversation/history/markRead; it never invokes send or proposal submit. Existing explicit message retry uses pending scope/request/body at `src/screens/AgencyConversationScreen.tsx:129`. Existing proposal retry uses the retained complete attempt at `src/components/agencies/AgencyProposalPanel.tsx:74`. The focused tests assert mutation counts remain one through transient refresh and recovery, then become two only after explicit manual retry. No new automatic message/proposal mutation retry was introduced.

### Definitive access loss and obsolete results — ADDRESSED

Preservation is not based only on a matching string scope. It also requires captured/current authority. The classifier at `src/agencies/messaging/live.ts:5` rejects SQL 42501, HTTP 401/403, JWT/role PGRST301/302/303 and the exact account/session/email/context/membership/role/deal-not-found/not-approved errors. Exact denial messages cover P0001 errors without treating every unrelated business P0001 as permission loss.

This matches the actual call chain: messaging get/history/list/markRead call `createScopedRpc`; `src/transfers/repository.ts:6` checkpoints before examining an RPC error and invokes the captured authorization callback before throwing it. `src/admin/request.ts:2` also checkpoints transport success and failure. `src/agencies/controller.ts:20` rejects obsolete account authority; `:31` rejects obsolete agency authority. Its authorization callback at `:32` invalidates only a still-current exact 42501 denial, after checking the captured account/generation/agency, so an old denial cannot invalidate a newly selected agency.

Current staff 42501 denial therefore invalidates generation/active agency first. The old screen catch cannot pass its checkpoint and does not publish; the changed scope hides the old projection and removes the keyed proposal child. For buyer contexts, or definitive HTTP/JWT/P0001 errors that do not invoke that staff invalidator, the classifier directly clears the current chat/inbox at screen `:81` and inbox `:74`. Chat additionally clears body/report/pending at `:82`. This remains true when get/history succeeded and only markRead then definitively denied access.

The SQL sources confirm actual denial meanings: agency account/session/email/suspension/deletion checks, deal visibility 42501 denial, and missing-conversation P0001 denial. get/history/list use those account/deal guards; markRead rechecks access after its locks and invokes get again before recording read state. The current classifier covers their definitive access failures. Historical read availability under module OFF/closed flow is unchanged and is not misclassified as a new read denial.

Account/agency changes reject late successes and errors both in the scoped transport and in the current screen/epoch/ticket checks. New cleanup at `src/screens/AgencyConversationScreen.tsx:100` advances epoch and read ticket, clears private view and draft/attempt state; inbox cleanup at `src/screens/InboxScreen.tsx:79` advances epoch and clears rows. Existing activity gating still stops polling when blurred. Cleanup does not trigger proposal/message retry.

## Evidence inspected and proof boundaries

Inspected exact commands in `i5-recovery-evidence/commands.md`, functional `red.log`, `green-expanded.log`, `typecheck.log`, covering output and the full-check prelude, relevant covering test records, summary and failure-marker search. The supplied logs show:

- Valid functional RED: 13 tests, 8 pass / 5 fail. The actual source counterexample fails at 0 versus 60 messages/items and missing proposal child.
- Expanded focused GREEN: 23 pass / 0 fail / 0 skip.
- Final covering run: 43 pass / 0 fail / 0 skip, naming the actual get/history/markRead/list recovery, drafts/attempts, buyer/staff denial, markRead denial after successful reads, blur and obsolete account/agency cases.
- Final typecheck log has the tsc --noEmit prelude without an error.
- Single final full-check log has typecheck + 613 pass / 0 fail / 0 cancelled / 0 skip. Relevant polling/incoming merge cases are present.
- The supplied baseline-preservation JSON records equal before/after hashes. I did not query or re-snapshot the database to recreate that receipt.

These are inspected saved execution records, not newly executed reviewer tests. The 613 total is corroboration of the reported run and does not substitute for the source reasoning above. Reading the code did not leave a concrete unresolved defect requiring a new executable proof, so none was run.

The new harness parses/transpiles the actual TSX function bodies and uses actual controller, scoped RPC, repository/decoders, merge and proposal validation/attempt logic. Hooks, element construction, scheduling and transport are simulated. In particular `tests/agency-refresh-recovery.test.ts:68` makes useEffect a no-op and `:94` sets messaging activity false: these new tests directly invoke the actual refresh callback through its UI control, rather than exercising React timer/effect integration. The unchanged timer calls that same callback; existing saved helper tests separately cover serialization/disposal and incoming gaps. The harness's conditional/keyed child model supports state and identity reasoning, but is not independently rendered React, native navigation/mount or physical-device proof. Mock proposal transport does not reprove server receipts or exactly-once behavior.

## New breakage in the fix diff

**None established.** No new Critical, Important or Minor findings in the classifier, guarded preservation catches, cleanup changes or regression harness. No relaxed server authorization, cross-scope restoration or new automatic proposal/message retry was found.

## Out-of-scope observations

**None requiring a new review loop.** Existing release, hosted Auth/REST/Storage, provider/device, APK, remote integration and rendered/native evidence boundaries remain outside this four-file review.

## Verdict

**Fix round: all scoped findings addressed; no new Critical/Important breakage.**

**Spec compliance: PASS for I5. Code quality: PASS for the four-file correction.** The Important I5 product blocker can be closed. This verdict satisfies only the narrow independent recovery gate; it does not execute, authorize or replace root's separate production/publication gates.

