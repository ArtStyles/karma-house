# Agency workflow verification

Task 14 was exercised on 8 October 2026 in the isolated `codex/agency-workspaces` worktree. The browser used the actual Expo application and actual public `web/api/p.ts` handler. Business operations executed the real PostgreSQL functions, transactions, permissions and RLS in a disposable ICU `en-US` database. Authentication, email confirmation and image delivery were explicitly synthetic loopback providers. No production data or external delivery was used.

## Observed results

| Journey | Local result |
| --- | --- |
| Personal and corporate registration | Actual forms submitted; pending email blocks sign-in; explicit synthetic confirmation permits sign-in and recovers the corporate application from SQL. |
| Initial approval and verification | Owner corrections, rejection and approval exercised separately from verification. A starts approved/unverified, submits to review, requests verification without a seal, then receives the seal from the owner. New valid origin listings publish directly; existing pending listings stay pending. |
| Verification review | Independent request corrected, resubmitted and rejected while its agency remains approved. Only the owner directly verifies B. Revoking A removes its badge, preserves previously approved listings and sends its next edit to review. |
| Shared identity | A and B operate on the same canonical property UUID after A authorizes B. Public presentation initially shows the seal only for A. B verification does not bypass A's authority over common changes or a moderator's hold. |
| Team and private work | Invitation and acceptance, manager restrictions, coordinator cross-agency selection, cumulative administrator/manager work, member departure and reassignment with retained booking, unassigned tasks and portfolio-to-case navigation exercised. |
| External contact | Name, phone and consent entered; manual response party/channel/reference/history recorded through controls. Visit acceptance and accepted counteroffer do not themselves sell the property. Private lost interest stays terminal without causing a sale. |
| Sale | B requests 98,000 USD with the executing manager; A confirms after losing verification. Exactly one sale receipt persists. Two future visits cancel, ordinary tasks terminate and the actual buyer conversation becomes read-only. A pending external cancellation communication can still be completed separately. |
| Notices and preferences | Buyer with a conversation opens its real conversation UUID. Buyer without a conversation receives an account notice and opens Notifications. Agencies preference saved off and survives reload. No provider notification reception is claimed. |
| Context and failures | Account/agency changes and sign-out remove prior private context. Removing permission while a case is open now immediately clears private details and the unsaved draft on definitive SQL denial. Old links show no private case. Explicit retries after gateway failures preserve one receipt and one task. |

The principal property is `270283ad-243e-4fbd-8edf-a0cbf19c5712`; the sale receipt is `dd626d7d-673f-4312-8dd4-6ec59e030ab9`. They are disposable evidence identifiers, not production records. The owned database was dropped and its source inventory remained unchanged.

## Render and accessibility evidence

The app was inspected at **390Ã—844** and **1440Ã—900** for registration, verification/review, agency workspace, public agency presentation, contact selection, portfolio, agenda, case and sale closure. One hundred screenshots, DOM snapshots, SQL observations and process/configuration receipts are retained in the local Task 14 evidence directory. The full matrix and SHA-256 manifests are in `.superpowers/sdd/2026-10-07-agency-closure-release/`. Final self-review completed the desktop personal-registration view in a separate receipt-owned cycle and verified the final fixture protocol's distinct pages and terminal empty page; both owned databases were cleaned with source inventory preserved.

Both app and public API display the green circular check with the accessible attribution `Inmobiliaria verificada por KarmaHouse: <agency name>`. Public corporate pages preserve the technical-custody privacy boundary. Keyboard focus was exercised on verification fields and proposal-history controls. Long labels wrap in the contact selector; error, pending, empty, terminal and retry states were rendered. The existing visual design was retained. Accessibility-tree inspection is evidence of labels and semantics; it is **not a completed TalkBack/VoiceOver or screen-reader audio test**.

Observed defects corrected: native text children caused by literal JSX whitespace or empty-string guards, an enabled offer-withdraw control after a sale, sale date controls that used appointment wording/range, missing context invalidation after withdrawn permission, and the public API's plain/generic verification tick. The sale date accepts real historical dates in Havana time, rejects future/invalid times, and leaves appointment controls and their default text unchanged.

## Reproducing the local fixture

Prerequisites: the existing Node dependencies and PostgreSQL 17 tools, and the explicitly approved baseline database. This fixture does not provision Docker or remote Supabase. It never resumes a receipt implicitly; archive a completed receipt deliberately before starting a new run.

```powershell
$env:KH_LOCAL_DATABASE_URL='postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007'
node scripts/agency-ui-fixture.mjs setup
# In another terminal while setup remains running:
node scripts/agency-ui-fixture.mjs status
node scripts/agency-ui-evidence.mjs capture
node scripts/agency-ui-fixture.mjs cleanup
```

The receipt identifies the run, separate database, fixture actors/UUIDs, process, source inventory, public-only configuration and previous configuration. Accounts use the `example.invalid` domain and the fixture-only password printed by setup. Drive sign-in and every tested business action through actual controls; do not inject browser sessions. Prepared photo objects and provider confirmation are fixture operations and must remain labeled separately from UI publication or real Storage/email evidence.

Optional companion tools:

- `agency-public-ui-preview.mjs` renders the real public handler against the same live receipt at port 8098.
- `agency-ui-fault-proxy.mjs setup` temporarily redirects public local config to port 56435. `before kh_save_agency_task` returns a one-shot **503 before forwarding**; `after kh_save_agency_task` returns **504 after the upstream response commits**. `cleanup` restores the original fixture origin before principal cleanup.
- `agency-ui-evidence.mjs verify` checks the completed journey's persisted sale, cancellations, tasks, privacy, real conversation and notice destinations. Other named actions are explicit recorded fixture preparation, not UI actions.

Stop only receipt-owned processes. Restore configuration before dropping the principal fixture; restart Expo and reload after restoration. The final run confirmed `.env.local` absent, demo Auth rendered again, owned database absent, source table counts/hashes unchanged and no listeners on fixture ports. The normal Expo preview remains at 8097 with its updated process receipt.

## Verification and remaining release gates

`npm run check`: TypeScript and **567/567 tests passed**. `npm run export`: **web, Android and iOS** bundles generated successfully after fixture config removal. Exported JS/Hermes files contain none of the fixture URL/key markers. These are local unconfigured export bundles, **not an APK, production-configured release, deployment or device test**.

A connected, ready **Pixel 7 Pro** was confirmed read-only with the existing `com.karmahouse.karmahouse` **0.1.19 / code 20** installation. Native CUA control is disabled in this environment; production app/data were preserved, and no native business journey or isolated synthetic APK was substituted for that missing capability.

Task 16 must still verify real Supabase Auth/email return/session expiry, real Storage upload/signing, compatible production-configured Android release/build/install with data preservation, real native agency workflows, TalkBack/VoiceOver behavior, and actual provider/device notification reception and taps (foreground/background/closed app). A provider HTTP response, exported Hermes bundle, installed APK or launched activity does not close these gates. No cloud activation, deployment, push or release was performed by Task 14.


## Final whole-branch corrections (8 October 2026)

The final wave fixes I1–I7: current approved visit-outcome authority, identifiable private buyer/home cases, separate current-admin commercial maintenance and the public `/agency/<uuid>` page, a shared20-contact/24h budget, scoped foreground conversation/inbox refresh, pre-creation/submission public matches with an explicit recorded different-home choice, and member-scoped canonical Share links. Original application provenance stays immutable. The final exact signatures, receipt operations and OFF logo teardown are in `agency-workspaces-release-runbook.md`.

Final verification: TypeScript plus590 tests with0 failures/0 skips;12 focused real SQL cases;18 agency and25 historical SQL suites;45 unfiltered concurrency cases with46 observed barriers; regenerated manifest of238 functions,41 tables and7 managed attachments; ordered rollback/resume and activation drift/OFF checks. All25 historical SQL files remain byte-identical to the original base, and both prior evidence archives retain every recorded hash. Failed iterations remain alongside the final outputs; the final clean unfiltered concurrency output is `final-evidence/concurrency-last-fixture-green.log` (the earlier `concurrency-clean.log` has one subsequently corrected fixture failure).

A fresh receipt-owned browser fixture showed two simultaneously open conversations receiving both replies without refresh, preserving the buyer draft, then clearing history after member removal; identifiable account/external cases; commercial edit with office opt-out and discoverable public profile at desktop/mobile sizes; real admin/coordinator/manager Share output and removed-link fallback; duplicate warning, explicit different-home submission and an existing canonical mandate request. Business persistence was checked in SQL. Fixture run `1be596f7-c634-4c1f-897f-7ac1cc45afec` is cleaned: exact DB dropped, baseline unchanged, configuration restored and owned listeners absent. Browser tabs2–5 closed and viewport reset; the browser policy refused closing tab1's `data:` connection-error document before any app/session loaded. This environmental residue is recorded explicitly, without a workaround.

Expo web/Android/iOS bundles and the Vite client/SSR/prerender build passed. A separate isolated WEB-only runtime test copies the API dependency closure with no root `src`, then exercises the actual public GET; the deployment allowlist stays WEB-only. Export warnings retain the missing private `google-services.json` config and Metro child color conflict even though the parent selected only NO_COLOR. No private configuration was imported; these are unconfigured bundles, not an official signed APK. Existing Gradle/toolchain warnings remain for a future upgrade; no cosmetic native rebuild was run.

Full final report, commands, RED/GREEN outputs, rendered images, baseline inventories and cleanup receipts are under `.superpowers/sdd/2026-10-07-agency-closure-release/final-fix-report.md` and `final-evidence/`. Hosted Auth/Storage/backup/activation, deployment, provider delivery and the official update remain root-owned release gates.
