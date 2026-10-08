# Scoped final-fix re-review — agency workspaces

Reviewer: `/root/review_agency_final_fix`. Date: 2026-10-08.

**Round verdict: CHANGES REQUIRED.** I1–I4, I6–I7 and M1 are addressed. I5 implements incoming reception but does not satisfy the required preservation of loaded pagination and drafts/attempt state across ordinary same-scope refresh failures. **Open product findings: 0 Critical / 1 Important / 0 new Minor.** Original M2/M3 remain explicitly triaged diagnostics. This is one unresolved I5 issue, not two findings counted for its chat and inbox manifestations.

## Scope and method

- Worktree: `C:/Users/ACER NITRO/.codex/worktrees/agency-workspaces/karma-house`.
- Fix base: `17368727020d5950ce45c4379cf8143c5b992da6`.
- Reviewed HEAD: `5c60021d8331947c373f6d01980ffef075998eb4`; branch was clean at initial and final read-only checks.
- Complete package: `review-1736872..5c60021.diff`, 314,971 bytes, 3,174 lines, 50 files, SHA256 `48360cb1e2c68a49c867f6d1629fdb0c2bf9ea0a9a7bed16a067136eeb0d9876`.

Read the preflight first, then the entire brief including verbatim Global Constraints, whole-branch review and final-fix report. Read the complete fix package in bounded passes (retrieved truncated portions separately), relevant actual source/interfaces and binding design sections 3–8. This is I1–I7/M1 plus regression review of the fix, not another original-base whole-feature review.

No source/Git changes, subagents, database writes, hosted operations, private/signing/primary inputs, provider sends or native/browser operations were performed. I did not rerun the green broad suites. One narrowly focused, in-memory executable proof evaluated the actual chat load callback with mocked transport to resolve a specific untested failure mode. The only saved review file is this report. The exact versioned [Expo v57 reference](https://docs.expo.dev/versions/v57.0.0/) was read before writing that proof. All shell calls used the explicit isolated workdir. One historical-diff read had a mistyped revision; it was corrected and the successful output showed only the ten new migration files.

## Per-finding verdicts

### I1 — ADDRESSED

`supabase/migrations/20261007000700_agency_proposals_scheduling.sql:174` adds the approved/current manager-or-higher guard before receipt lookup and mutation. The scheduling helper at `:66` already acquires the common participant/account/agency/property locks and rechecks deal visibility/assignment. The new check does not change historical readers or require an open cycle.

`supabase/tests/agency_final.sql:1` and `final-evidence/final-sql-clean.log` establish fresh suspended denial, approved historical recording despite a closed deal, current replay and removed-member denial. The targeted guard also governs a suspended replay by source inspection; the saved focused case does not separately execute that exact replay variant, so I do not expand its empirical claim. No new lock ordering was introduced by I1. The retained RED reproduces the missing approval error.

### I2 — ADDRESSED

The private projection at `supabase/migrations/20261007000600_agency_deals_messaging.sql:95` adds buyer name, canonical property UUID and a title with retained/deleted fallbacks. It remains behind the actual deal-access/list visibility boundaries (`:118`, `:123`); no private application/email projection was added. The strict decoder consumes it at `src/agencies/deals/domain.ts:63`, and actual list/detail display both identities at `src/screens/AgencyDealsScreen.tsx:41` and `src/screens/AgencyDealScreen.tsx:52`.

The three I2 blocks in `supabase/tests/agency_final.sql` and saved 12-case SQL output cover distinct account identities, external contact across two homes, wrong assignment/foreign agency/removed denial, actual account deletion and actual personal-home deletion under OFF. The external-home SQL block distinguishes canonical IDs; distinct displayed home titles are additionally supported by the actual UI setup/identity evidence, not by pretending that fixture's identically titled homes had distinct titles.

### I3 — ADDRESSED

`supabase/migrations/20261007000200_agency_registration_memberships.sql:256` separates commercial data from the original application. Current admin history read is at `:261`; approved/current writer with normal locks, version, receipt and logo validation at `:270`; public allowlisted profile with SQL-level office opt-out at `:265`. The current replacement-admin path preserves original applicant/evidence, approval and verification. Asset rules at `:287`/`:292` and delete guard at `:303` cover current admin maintenance and referenced-logo protection, including no-subject service cleanup.

`src/screens/AgencyProfileScreen.tsx:18` supplies the actual editor and captured scope. `web/api/agency.ts:1`, `web/lib/public-agency-profile.ts:7` and `web/vercel.json:10` supply the web-local public route. `src/screens/DetailScreen.tsx:193` and `web/api/p.ts:139` make it discoverable. The response escapes text, uses anon RPC, has no-store headers, and signs only a same-origin exact logo path. The deployed dependency closure is contained in `web/**`; the isolated GET staging test in `tests/agency-public-profile.test.ts:11` copies only the three web files, asserts absence of root src, and succeeds. The final 590 output includes all four public-profile tests; the earlier standalone packaging output contains three and is not substituted for four.

Actual SQL profile/privacy/authority/OFF cleanup cases pass; final concurrency output contains both attach-first and delete-first blocked races with persisted reference/object consistency. The attachment query does not acquire the object-row lock, so its agency lock does not introduce the identified row/advisory inversion. The trigger rechecks after the wait. Public mobile screenshot independently inspected shows the new name/phone/services with no office address, matching private persisted opt-out and unchanged original application.

Runbook `docs/agency-workspaces-release-runbook.md:170` has exact new contracts and receipt operations. Failure cleanup at `:188` disables first, retains worker pause, checks exact receipt agency/applicant/membership/empty draft/source/request/logo plus zero business/foreign dependencies under module/agency/row locks, detaches exact version/path, then requires service Storage removal. It does not delete referenced Storage metadata or disable triggers. The SQL teardown proof is correctly distinct from authorization and actual hosted Storage transport. No release gate is satisfied merely by this local evidence.

### I4 — ADDRESSED

`supabase/migrations/20261007000300_agency_property_origins.sql:609` counts both new personal and account-backed agency conversations in 24 hours. Personal creation invokes it at `:640` after existing-contact lookup; agency creation at `supabase/migrations/20261007000600_agency_deals_messaging.sql:170` after confirming a genuinely new conversation. Existing/replay paths do not consume a slot. Both paths hold the common chat-actor mutex; the agency path's actual final common-lock helper is in migration007 at `:3`.

The valid RED is `red-sql-I4-valid.log`; the earlier null-client-request fixture error is not functional RED. Final focused SQL and four actual races (`scripts/local-sql/verify-agency-concurrency.mjs:281`) establish mixed channels, twentieth-slot serialization in both orders, twenty-first denial and existing/replay access. Saved race output records each actual barrier and cleanup. No client throttle or fabricated external-chat substitute is used.

### I5 — NOT ADDRESSED — Important

Healthy incoming reception is implemented: `src/agencies/messaging/live.ts:5` polls immediately/after completion; `:11` fills incoming gaps and merges uniquely. Chat `src/screens/AgencyConversationScreen.tsx:97` and inbox `src/screens/InboxScreen.tsx:72` tie it to activity and scope. Existing controller/RPC checkpoints and definitive permission invalidation still prevent stale private responses from restoring an obsolete account/agency. The saved browser/SQL and helper tests substantiate healthy reception/draft preservation and scope loss.

**Remaining defect: an ordinary periodic refresh failure destroys already loaded history and can discard proposal input/attempt state.** The chat callback places `get`, history and `markRead` in one try. Even if reads succeed, a network/5xx failure of `markRead` reaches `src/screens/AgencyConversationScreen.tsx:74–78` and publishes `conversation:null, messages:[], hasMore:false` for the still-current authorized scope. On the next poll `latestState` contains no history, so only the newest 30 messages return. The inbox does the same at `src/screens/InboxScreen.tsx:68`; its page target is now zero and next recovery collapses to its first page.

This is materially new exposure from connecting that destructive loader to the automatic timer: a user can lose their working position without touching Refresh. In chat, `conversation:null` also removes `AgencyProposalPanel` at `src/screens/AgencyConversationScreen.tsx:143`. That component owns its offer/visit draft in state (`src/components/agencies/AgencyProposalPanel.tsx:28`) and its stable pending request in `attempt` (`:30`). Their loss follows from the actual conditional unmount. The executable proof below establishes the null transition and pagination loss; it is not claimed as a separately rendered React unmount or duplicate-server-mutation proof. The top-level message draft/receipt is not itself erased by this catch, and I do not claim it is.

**Focused proof, exit 0, no source mutation:** using bundled Node24 with `--experimental-strip-types --input-type=module`, parsed the current TSX with TypeScript, selected the actual `load` useCallback, transpiled/evaluated it in memory, and supplied its actual incoming/merge helpers. Mocked transport kept the same valid context, returned a successful conversation/latest history read, then failed only `markRead` once. Starting with 60 messages, output was:

```json
{
  "loadedBefore": 60,
  "transitions": [
    {"conversation": true, "messages": 60, "hasMore": true, "error": ""},
    {"conversation": false, "messages": 0, "hasMore": false, "error": "temporary network failure"},
    {"conversation": true, "messages": 30, "hasMore": true, "error": ""}
  ],
  "loadedAfterRecovery": 30,
  "sourceChanged": false
}
```

The healthy paging helper test and delayed obsolete-scope tests do not cover this same-scope failure or the actual screen catch. Preserve the last authorized history/page count and draft/attempt ownership on transient same-context errors, expose the error/retry state, and retain immediate clearing for actual scope/permission loss. A read-marking transport failure should not erase a successfully read conversation. Add a focused actual-controller/screen transition test for this counterexample; do not replace it with another broad green count.

### I6 — ADDRESSED

Bounded public-only candidate generation at `supabase/migrations/20261007000300_agency_property_origins.sql:97` and guarded RPC at `:106` return at most 20 candidates with public fields. New creation/submission recomputes and compares exact current input/candidate IDs+versions/request/property binding at `:132–134`, under intake serialization; receipt/events retain the decision. Verified direct submission traverses the same guard. This is an explicit heuristic with false positives and false negatives, not an exhaustive match or automatic merge.

The real pre-save warning appears at `src/screens/AgencyPropertyScreen.tsx:125`/`:175`; `:151` requests the selected existing property through repository canonical resolution at `src/agencies/properties/repository.ts:114–117`. The SQL blocks show public match/no match/private exclusion, request-binding denial, explicit different-home/direct publication and an actual canonical mandate request. Exact recomparison covers changed matching input/candidate version by code; the focused SQL file does not separately mutate every such dimension, so the report's broad wording is not treated as distinct executable cases. Persisted UI event/canonical mandate UUID and the independently inspected resulting pending-request screenshot match. No foreign private address/owner/consent/evidence was added to candidates.

### I7 — ADDRESSED

`supabase/migrations/20261007000600_agency_deals_messaging.sql:313` revalidates public canonical contact context; `:318` adds the current approved member producer with ordered locks and role hierarchy. `src/agencies/share.ts:8–10` produces canonical UUID/agency/current actor parameters, and `src/components/agencies/AgencyShareButton.tsx:15` invokes actual Share plus visible URL from portfolio. `src/screens/DetailScreen.tsx:155–158` preserves a valid incoming scope or falls back to the generic link when the server returns no eligible destination. Personal/general sharing remains.

Two focused SQL blocks exercise manager/coordinator/admin, alias canonicalization, removed-manager and suspended-agency fallback; client contracts verify captured JWT/parameters/canonical URL. The saved actual user-control screenshots and report support the role share actions without sending a message to a third party. I did not independently rerun a share sheet or claim hosted/native behavior. There is no write, commission or sale attribution in these APIs.

### M1 — ADDRESSED

`scripts/local-sql/verify-agency-concurrency.mjs:312–315` throws for explicitly unmatched argv filters before baseline inventory/cloning. The child-process test at `tests/agency-final-contracts.test.ts:38` asserts nonzero plus the explicit diagnostic and no PASS/BARRIER output. That test is in the final 590 output. No broad race rerun was used by this reviewer to reprove it.

## New breakage and out-of-scope observations

- **Important: same-scope automatic refresh erases pagination and unmounts proposal drafts/attempts**, as detailed under I5 at `src/screens/AgencyConversationScreen.tsx:78` and `src/screens/InboxScreen.tsx:68`. Counted once as I5 remaining, not an additional open issue.
- Other established new breakage: **None**.
- Out-of-scope unchanged observations requiring an extension of this wave: **None**.
- M2: original and final Metro color conflict diagnostics remain visible. Final export output still contains NO_COLOR/FORCE_COLOR warnings; parent-only selection does not remove the child warning. No cosmetic rerun/suppression is requested.
- M3: historical current-toolchain build/Gradle10 deprecation disposition remains intact. A future upgrade must revisit it; it is neither a current build failure nor official-final-APK evidence.

## Evidence reconciliation and integrity

Full focused SQL, final unfiltered concurrency, 43-suite, activation, apply/resume, focused client, web-only, export/build and cleanup outputs were inspected. For the 590 check I inspected its actual command/typecheck prelude, covering new tests, zero-failure/skip summary and searched failure markers; I did not reread every unrelated passing test or rerun it.

- `final-evidence/npm-check-final.log`: typecheck and 590 passed / 0 failed / 0 skipped. These tests did not cover the I5 counterexample.
- `final-sql-clean.log`: all 12 cases and exact clone cleanup.
- `sql-all-clean.log`: 18 agency plus 25 historical suites with rollback/inventory preservation and clone cleanup.
- `concurrency-clean.log`: retained 44 PASS / 1 FAIL, specifically fixture resubmission binding. Not green.
- `concurrency-last-fixture-green.log`: later complete unfiltered 45 PASS / 46 observed BARRIER / 7 security probes / 0 FAIL, with per-case cleanup. The runner reads argv, so the implementer's mistaken environment filter did not restrict that final run. The report discloses this extra full repetition.
- `manifest-activation-final.log`: actual-clone definition/grant/attachment drift rejection, disabled-trigger checks, OFF history and 33 direct mutation gates, disable-order barriers and cleanup.
- `release-apply-clean.log`: intentional migration2 checksum failure rollback; ordered resume/idempotence/default OFF and old-ledger preservation. No hosted claim follows.
- `export-final.log` and `web-build-final.log`: three platform bundles and client/SSR/prerender completed. Missing private google-services configuration/color diagnostics are retained. Web GET packaging is separately proven; Vite output alone is not API deployment evidence.

Independently hashed all 80 files in `final-evidence-manifest.json`: no size/hash mismatch. All ten actual SQL migration hashes match the activation manifest; its parsed inventory is 238 functions, 41 tables, seven managed attachments. All 25 historical current-file hashes match the preservation inventory; original-base Git comparison names only the ten new migrations. Baseline-before/after JSON are byte-identical with SHA256 `6167e2a8b1f1f7585dca05d05407b369a8edc3a82852caf121f8c06229c2ea83`. The archived 523-file/113-file preservation claims remain supported by the saved preservation report and prior review; this reviewer did not rehash those entire unchanged archives. `git diff --check` and final tracked status were clean.

The UI persisted proof confirms commercial profile/application separation, message seq1/seq2, exact canonical mandate request, explicit different-home event and removed staff membership. Independently viewed the public mobile profile, pending canonical mandate result and live composer/draft screenshots; those latter screenshots are scrolled to the composer, so they alone are not a fresh visual observation of message arrival. Actual reception is supported by the saved fixture interaction report and persistence, and scoped helper tests, not by an invented independent replay.

## Cannot-verify / release boundaries

1. No actual production backup/restore, hosted schema/grant/trigger comparison, ordered apply/OFF receipt or final ON result was performed here. Root retains these gates.
2. Real hosted Auth/JWT/email/REST/Storage business and exact teardown behavior remain unperformed. Synthetic Auth/media plus real local SQL do not establish them. Privileged OFF detach is teardown only.
3. Official production-configured signed dual-ABI 0.1.20 APK, public GitHub release bytes/hashes, Vercel runtime/alias and official in-place physical update remain root work. Historical side-by-side debug/native evidence is not evidence for this final source.
4. Real provider/device delivery, background/closed reception, taps, native role/picker behavior and complete screen-reader/keyboard/large-font/performance coverage remain unverified.
5. Fixture process/database/config cleanup is supported by `ui-cleanup.log` and `ui-resource-cleanup.json`: owned clone dropped, baseline unchanged, config restored, owned listeners absent. I did not recreate the fixture or independently query removed runtime state.
6. The one remaining browser tab is explicitly a Browser Use URL-policy limitation. I parsed the saved data document: it contains `ERR_CONNECTION_REFUSED` and failed URL `http://127.0.0.1:56435/`; saved evidence says authentication happened only in tabs2/4. This does not establish retained private app content in tab1 and does not invalidate database/config/process cleanup. It remains a UI cleanup residue, with no bypass attempted. It is not an automatic approval rejection.
7. Root-owned final Git integration/push/audit and primary-work preservation receipts are still future operations. This review only observed the isolated branch at the stated HEAD and clean tracked status.

## Final assessment

**Spec compliance: Changes required for I5's explicit preservation contract.** Six Important findings and M1 are resolved; incoming polling itself works, but transient poll failures still destroy the user's current working history and can unmount unsaved proposal/attempt state.

**Code quality: Changes required, narrowly scoped to I5.** No new cross-agency disclosure, current-write bypass, common-budget race, logo-reference race or web-only runtime defect was established in the reviewed fix. Accepted green evidence remains valid for what it tested, and must not be relabeled as covering the demonstrated missing failure mode.

**Ready for the held production/publication gate: No.** One Important remains. The reviewer has not authorized, dispatched or assumed another implementation wave. Root must resolve the open scoped finding and preserve the separately listed future release gates.


## Focused proof reproduction source

Run from the stated isolated workdir by piping the following JavaScript to the bundled Node binary with `--experimental-strip-types --input-type=module`. It reads and evaluates the actual callback; it writes no source, accesses no database and makes no network request.

```js
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readIncomingAgencyMessages} from './src/agencies/messaging/live.ts';
import {mergeAgencyMessages} from './src/agencies/messaging/repository.ts';
const path='src/screens/AgencyConversationScreen.tsx';
const sf=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function visit(n){
  if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='load'&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText(sf)==='useCallback')callback=n.initializer.arguments[0].getText(sf);
  ts.forEachChild(n,visit);
}
visit(sf);assert.ok(callback);
const message=seq=>({id:String(seq),conversationId:'chat',seq,clientMessageId:String(seq),senderId:'buyer',body:String(seq),createdAt:'2026-10-08T00:00:00Z'});
let state={scope:'unchanged',conversation:{lastSeq:60},messages:Array.from({length:60},(_,i)=>message(i+1)),hasMore:true,error:''};
let fail=true;const transitions=[];
const context={
  repo:{get:async()=>({lastSeq:60}),history:async()=>({items:Array.from({length:30},(_,i)=>message(i+31)),hasMore:true}),markRead:async()=>{if(fail)throw Error('temporary network failure');}},
  auth:{user:{id:'buyer'}},readTicket:{current:0},capture:()=>({checkpoint(){},release(){}}),
  id:'chat',scope:'unchanged',current:{current:'unchanged'},latestState:{current:state},
  readIncomingAgencyMessages,mergeAgencyMessages,agencyError:e=>e.message,
  setState:update=>{state=typeof update==='function'?update(state):update;transitions.push({conversation:!!state.conversation,messages:state.messages.length,hasMore:state.hasMore,error:state.error});}
};
const js=ts.transpileModule('globalThis.actualLoad = '+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
vm.runInNewContext(js,context);
await context.actualLoad();assert.equal(state.messages.length,0);assert.equal(state.conversation,null);
fail=false;context.latestState.current=state;await context.actualLoad();assert.equal(state.messages.length,30);
console.log(JSON.stringify({kind:'focused actual-screen callback proof; mocked transport, unchanged authorized scope',loadedBefore:60,transitions,loadedAfterRecovery:state.messages.length,sourceChanged:false},null,2));
```
