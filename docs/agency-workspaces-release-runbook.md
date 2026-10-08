# Agency release 0.1.20 — reviewed preparation, execution pending

This document is the root controller's execution procedure. User authorization for production migrations, activation, commit/push and release already exists. Preparation performs **no hosted write, signing, release upload or deployment**. Execute only after independent preparation and whole-branch reviews, from the isolated `codex/agency-workspaces` checkout. Keep `main` and unrelated primary edits untouched. Failure is a stop, never permission to improvise a bypass.

## Inputs and retained evidence

- Native version: `0.1.20`, Android code `21`, package `com.karmahouse.karmahouse`. Read-only GitHub inventory on 2026-10-08 found latest public `v0.1.19`; check again immediately before publication. Never replace an existing tag/asset.
- Exact ten SQL files and SHA-256: `supabase/agency-activation-manifest.json`; operator interface: `scripts/agency-activation.mjs`. Preserve historical checksum rows and stored statements, including mixed newlines of `20260920000400`.
- Bundled Node: `$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. PostgreSQL tools: `C:/Program Files/PostgreSQL/17/bin` (17.6). Do not use the unrelated primary source/dependency tree as release input.
- `$agencyPrivateConfig` is an **absolute, private external** JSON `{databaseUrl,caFile,expectedHost,expectedDatabase}` validated by `agencyConnection`. Root alone prepares/loads it. TLS verifies the CA. Do not put its URL/password into argv, public Expo config, reports or Vercel inputs.
- Root chooses a new private absolute `$releaseReceiptDir` outside scratch, restricted to its Windows account, with exclusive creation and sufficient free space. Keep raw DB/Auth/Storage responses, tokens, signed links, dumps and object bytes there. Public reports contain only outcome/count/hash/time/commit; never raw private errors. Keep backup keys/access separate from public evidence.
- Retained local audit lives under ignored `artifacts/agency-release-preparation/`; public audit/manifest is under `docs/agency-release-audit/`. The existing physical PostgreSQL cluster and junction stay in place until root's later owned cleanup.

## Fresh backup and baseline inventory (root, before writes)

Use `agencyConnection({target:'hosted',config:agencyPrivateConfig})` and `new Client(config)` with bundled Node. Load explicit path from `process.env.KH_AGENCY_PRIVATE_CONFIG`, not a default. Never import `cloud-db.mjs` or run `apply-cloud.mjs`. Keep the DB client `backupDb` open through these steps:

```js
await backupDb.query('begin isolation level repeatable read read only');
const snapshot=(await backupDb.query('select pg_export_snapshot() snapshot')).rows[0].snapshot;
```

Privately save full results from the same snapshot for these exact queries (with `writeFile(...,{flag:'wx'})`):

```sql
select version(),current_database(),current_user;
select datcollate,datctype,datlocprovider,datlocale from pg_database where datname=current_database();
select to_jsonb(m) migration,to_jsonb(c) checksum
from supabase_migrations.schema_migrations m
left join supabase_migrations.karmahouse_migration_checksums c using(version) order by m.version;
select extname,extversion from pg_extension order by extname;
select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles order by rolname;
select schemaname,tablename from pg_tables
where schemaname in('public','kh_private','auth','storage') order by 1,2;
select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id;
select id,bucket_id,name,owner_id,metadata,created_at,updated_at from storage.objects order by bucket_id,name;
select id,email_confirmed_at,created_at,deleted_at from auth.users order by id;
select * from cron.job order by jobid;
select to_regclass('kh_private.agency_settings') agency_settings;
```

For every enumerated table, quote schema/table identifiers by doubling `"`, then save `count(*)` and ordered SHA-256 of rows (or stream the rows into a private hash file); never print contents. Record baseline protected owner ID privately and exact aggregate agency/history counts. Initial observed hosted agencies were absent; this is not proof of an empty Auth/Storage database. Save transport configuration privately without logging key values. Inventory cron command text privately because it can contain credentials.

Run child processes using `execFile`/`spawn` with `windowsHide:true` and an explicitly scoped environment. Parse the already validated URL into **child environment only**: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE=verify-full`, `PGSSLROOTCERT=caFile`; do not print environment. The following arrays are exact argument lists; no shell interpolation:

```js
await execFile(pgDump,['--format=custom',`--snapshot=${snapshot}`,`--file=${privateDump}`],{env:pgEnvironment,windowsHide:true});
await execFile(pgRestore,['--list',privateDump],{windowsHide:true}); // save private TOC
await execFile(pgRestore,[`--file=${privateReadableSql}`,privateDump],{windowsHide:true});
```

Require exit 0, nonzero dump/readable SQL size, TOC entries for public/kh_private/auth/storage and both migration ledgers, and SHA-256 for dump, TOC and readable SQL. `pg_restore --file` fully decodes the archive; it proves readability, **not a successful restoration**. Any pg_dump privilege failure stops release; do not quietly omit managed schemas. Preserve role names/ACLs; hosted role secrets are not a release artifact. Commit the snapshot transaction after recording inventory.

Storage bytes are outside PostgreSQL. Using existing service credentials only in memory, download each inventory object through `GET /storage/v1/object/authenticated/<bucket>/<encoded path>` to a receipt-mapped random local filename; require HTTP 200 and record SHA-256/size. Never derive a filesystem path directly from object names. Re-query object inventory and require IDs/path/updated_at/metadata unchanged, or re-backup changed objects and record the snapshot boundary. Do not label a DB dump as a Storage-byte backup. Auth rows are in the DB backup; save current Auth Admin user inventory privately, page through until empty, and compare IDs with the DB inventory. No email send is needed.

Restore plan: retain the existing environment and backup; emergency response is OFF first. A later disaster restoration requires an isolated compatible PostgreSQL/Supabase target, original owners/extensions/ACLs, a complete `pg_restore --exit-on-error` rehearsal and object re-upload through Storage APIs. Do not restore over live production or roll back migrations automatically, because post-backup Auth/Storage and real transactions must be reconciled. Record restoration as untested until actually rehearsed. For this release's unchanged prior data, the fresh complete readable backup plus exact old/new ledger/schema verification is the operational gate.

## Apply only the ten reviewed migrations, OFF

The import-only helper has no credential loading, connection, CLI or activation. It validates all ten local bytes against the manifest, serializes using the existing migration mutex, applies each file and its two ledger inserts in one transaction, requires OFF, accepts only exact ordered prefixes, and preserves every historical ledger field. No upsert or old initial migration/bootstrap occurs.

Root runs this exact body from the worktree after backup; `agencyPrivateConfig` and `receiptFile` are absolute inputs from the private root session, not literal secrets:

```js
import {Client} from 'pg';
import {writeFile} from 'node:fs/promises';
import {agencyConnection,verifyAgencies} from './scripts/agency-activation.mjs';
import {applyAgencyRelease} from './scripts/agency-release-apply.mjs';
const config=await agencyConnection({target:'hosted',config:agencyPrivateConfig});
const db=new Client(config);
try {
  await db.connect();
  await db.query("set statement_timeout='120s';set lock_timeout='15s'");
  const migrations=await applyAgencyRelease(db);
  const verified=await verifyAgencies(db);
  if(!verified.complete||verified.enabled)throw Error('Complete OFF verification required');
  await writeFile(receiptFile,JSON.stringify({at:new Date().toISOString(),migrations,verified},null,2),{flag:'wx'});
} finally { await db.end(); }
```

Then `verify-agencies.mjs --target hosted --config $agencyPrivateConfig` and `configure-agencies.mjs --target hosted --config $agencyPrivateConfig --status` must both confirm ten migrations, complete permissions and OFF. Re-read historical ledger and compare exact saved rows/statement bytes/checksums. Refresh PostgREST schema cache with `NOTIFY pgrst, 'reload schema'` if necessary; poll read-only capability/schema requests until current functions are exposed. Do not treat a transient missing RPC as permission to use a direct SQL business call. If apply fails, stop with OFF; retain committed prefix and error privately, repair the cause and re-run only after byte/ledger verification. If singleton is missing, report that OFF is not confirmed.

## Compatible Android and web client, before ON

Read exact [Expo 57 docs](https://docs.expo.dev/versions/v57.0.0/) before source/build changes. Confirm Task14/15 config receipts are cleaned and no owned proxy/fixture listens on 56434/56435. Worktree `.env.local` is currently absent. Root provides **only** real production EXPO_PUBLIC URL/publishable key and the required Firebase client file; no service key/private URL. Keep original public config receipt and hashes; do not copy unrelated primary files.

Actual installed toolchain found: primary ignored Android SDK `D:/work/karma-house/artifacts/android-sdk`, build-tools `36.0.0`, JDK `D:/work/karma-house/artifacts/android-tooling/jdk17/jdk-17.0.20.1+1`. Root may reference those tools without changing them. Prepare receipt-owned ignored signing inputs under this worktree's `credentials` only when root builds; preserve official certificate `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6`. Never display signing args/passwords. Check fresh output paths do not already exist, then:

```powershell
& $taskNode node_modules/expo/bin/cli prebuild --platform android --no-install
./scripts/build-android-preview.ps1 -Release -RefreshBundleCache -SdkPath $androidSdk -JdkPath $androidJdk
./scripts/prepare-android-distribution.ps1 -ApkPath artifacts/releases/KarmaHouse-0.1.20.apk -SdkPath $androidSdk -JdkPath $androidJdk -BuildToolsVersion 36.0.0 -PrivateConfigurationPath 'D:/work/karma-house/infra/.env.local'
```

This explicit private reference stays in the primary ignored directory; it is read only by the final verifier and never copied into Expo. Existing defaults are preserved for other callers. Independently require version/name/code, official certificate, min API24, arm64-v8a/armeabi-v7a, nondebuggable, ZIP alignment, real JS/Hermes, production public values and absence of private bytes/loopback/synthetic markers. The retained output path is `artifacts/distribution/0.1.20`; its existing-path refusal prevents accidental replacement. Remove only receipt-owned ephemeral signing copies after verification.

Run `gh release list --repo ArtStyles/karma-house --limit 5 --json tagName,isLatest,isDraft,isPrerelease,publishedAt`; require v0.1.20 absent. Root creates the new release against the final reviewed commit and uploads only APK, SHA256 and installation text; use prepared notes via a file. Download the **entire public APK anonymously**, hash it against local SHA256, verify asset state/size and installation/checksum links, then publish web. Do not use an authenticated download as evidence of anonymous access.

Exact existing Vercel project: `prj_EhIWL2JlbfKsdbksCcYCIPYT3oN1`, scope `frank-james-hernandezs-projects`, Root Directory `web`, alias `karmahouse.vercel.app`. Previous observed Ready deployment: `dpl_GHGBbgTetEwjia9JnwbFmraPHrg5` / `https://karmahouse-b4siy2lti-frank-james-hernandezs-projects.vercel.app`; recheck before deployment and retain for rollback. Existing production variables were inspected by **names only**; no env pull, JSON values or project linking is necessary.

```powershell
# From repository root, CLI63.1.0 via the existing cached binary and bundled Node:
& $taskNode $vercelCli deploy --dry --project prj_EhIWL2JlbfKsdbksCcYCIPYT3oN1 --scope frank-james-hernandezs-projects --non-interactive --no-color
# ROOT ONLY after final manifest check and anonymous APK verification:
& $taskNode $vercelCli deploy --prod --skip-domain --project prj_EhIWL2JlbfKsdbksCcYCIPYT3oN1 --scope frank-james-hernandezs-projects --non-interactive --no-color
```

The dry list must contain only `web/` source/assets, `web/api/p.ts`, `web/api/agency.ts`, `web/lib/public-agency-profile.ts`, `web/vercel.json`, package/lock and prerender inputs. Reject `.superpowers`, PG, artifacts, infra, credentials, mobile, `.env*`, node_modules, built dist and `web/tsconfig.json`. Preserve hashes/full file list. The allowlist was actually exercised locally; do not assume nested ignore semantics. Test the resulting production-environment URL before `vercel promote <newURL> --scope ...`; confirm landing version/download links, public `/p/<real approved ID>` identity/contact/privacy, aliases and the agency-specific circular accessible badge. Do not create a fake public property. Web rollback uses `vercel rollback <previousURL> --scope ...`; retain backend schema and turn agency module OFF if client compatibility fails. Preparation's local Vite build is not Vercel API/runtime verification.

## Real hosted smoke: receipt, JWTs and asynchronous worker pause

Prepare a private exclusive receipt before any Auth mutation: run UUID, reviewed commit, target host, time, planned fixture emails at `example.invalid`, generated passwords and actor IDs, agency IDs, property IDs, request IDs, object bucket/path, exact event/notification/job IDs, previous flags, sessions created and each expected response. Persist returned IDs immediately after every write. Never match cleanup by name/email prefix/time alone. No mail, WhatsApp, FCM/Expo send, registered push devices or real buyer contact. New agencies start pending; never mass-approve/verify real agencies.

Pre-ON: Auth Admin `createUser({email,password,email_confirm:true,user_metadata:{display_name:'Release fixture'}})` creates personal fixture actors without sending email. This is explicit test-account provisioning, **not proof of email confirmation delivery**. Sign in via normal `signInWithPassword`, validate `/auth/v1/user`, and use its actual JWT and `p_actor_id` on every RPC. Owner session may use `auth.admin.generateLink({type:'magiclink',email:privateOwnerEmail})` plus normal `verifyOtp({token_hash:hashed_token,type:'magiclink'})`; neither route sends email. Never print returned links/tokens. Validate returned user ID against the protected owner privately; only this new session is later signed out with scope `local`.

Use the repository interfaces, not invented registration RPCs: `src/agencies/registration.ts`, `repository.ts`, `assets.ts`, `properties/repository.ts` and `src/transfers/repository.ts`. RPC headers are `apikey:publishableKey`, `Authorization:Bearer <actor JWT>`, JSON, with `p_actor_id:actor.id` added to the listed parameters. Service-role is allowed for Auth provisioning and exact cleanup only; never for business RPC evidence.

With OFF: capabilities returns false; confirmed personal account reads application null/listMine empty; anon and wrong-actor requests are denied; direct table mutations remain denied; `kh_submit_agency_application`/`kh_invite_agency_member` reject `KH_AGENCY_DISABLED` before creating anything. Corporate signup metadata while OFF must also be denied; record any failed provisional Auth account by exact returned/admin inventory identity and clean it. Do not claim current/removed corporate-history checks before the first agency exists. Verify applicable personal Storage upload/sign/read/delete with an unattached actor-owned object; save its exact path first.

Before creating any event-producing fixture, use one explicit DB connection `pauseDb` and hold **only** the session worker mutex; no account, agency, property or recipient lock while HTTP runs:

```js
await pauseDb.query("set lock_timeout='15s';set statement_timeout='30s'");
await pauseDb.query("select pg_advisory_lock(hashtextextended('kh:push:worker',0))");
```

Current `push_tick` tries the same mutex before reminders, candidate preparation or provider transport. The pause delays all asynchronous push work briefly; it does not cancel previously authorized external requests. Save baseline pending/provider-job IDs and forbid fixture-device registration. A same-session operational enable avoids blocking on one's own mutex:

```js
// Imports: verifyAgencies, disableAgencies from scripts/agency-activation.mjs.
await pauseDb.query('begin');
await pauseDb.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
const gate=await verifyAgencies(pauseDb);
if(!gate.complete||gate.enabled)throw Error('Reviewed complete OFF gate required');
await pauseDb.query('update kh_private.agency_settings set enabled=true where singleton');
await pauseDb.query("insert into kh_private.agency_events(kind,payload,delivery_state) values('module_enabled',jsonb_build_object('reason',$1::text),'cancelled')",['Reviewed release; controlled unpublished smoke']);
await pauseDb.query('commit'); // session worker lock remains; HTTP RPCs now use normal business authorization
```

Record this as the single authorized enable, equivalent strict manifest and worker→module order to the CLI. Do not also call CLI enable. If any operation fails, roll back the current transaction, and on **this same pause connection** begin, acquire module mutex, call `disableAgencies(pauseDb,'Controlled release smoke failed')`, commit, verify singleton OFF separately; keep any incomplete cancellation visible. Then exact cleanup while still paused. A second CLI waiting for worker would deadlock the operational procedure. If the pause connection is lost, immediately run the normal explicit `configure --disable` connection and record that no-send assurance was interrupted; do not silently resume.

After ON, create one corporate fixture using Auth Admin createUser with confirmed email and actual metadata `{display_name,registration_intent:'agency',agency_application:input}`. This traverses the real Auth signup trigger; it does not prove public signup email delivery. `input` has exactly tradeName, responsibleFullName, businessPhone, province, municipality, serviceAreas, description, officeAddress, publishOfficeAddress and evidenceReferences, normalized by `normalizeAgencyApplication`. Use fixture-only values and `publishOfficeAddress:false`. Require `kh_agency_application` returns pending/unverified and zero active membership. Keep a separate foreign personal actor and a manager invitee.

Execute and journal, always taking **current returned versions** and fresh `clientRequestId` per changed payload:

| Step / normal JWT | Exact RPC body beyond `p_actor_id` | Expected |
|---|---|---|
| Applicant submit | `kh_submit_agency_application {p_payload:{input,clientRequestId,expectedVersion}}` | pending, still unverified |
| Applicant attempts review | `kh_review_agency {p_payload:{agencyId,decision:'approve',note,expectedVersion,clientRequestId}}` | owner-only denial, no change |
| Applicant logo Storage BEFORE approval | POST `/storage/v1/object/agency-assets/<agency>/logos/<asset UUID>.jpg`, valid JPEG, `x-upsert:false`; POST `/storage/v1/object/sign/agency-assets/<path>` `{expiresIn:300}` | upload/read signed bytes; anon/foreign signing denied; leave logo **unattached** and delete it through Storage while still pending. After approval, asset writes belong to current approved admins (including a replacement admin), not to registration provenance alone. Use the commercial-profile contract below for approved logos. |
| Protected owner approval | same review body with owner JWT | approved, admin membership, **verified:false** |
| Admin invite / invitee accept | `kh_invite_agency_member {p_agency_id,p_payload:{userId,role:'manager',clientRequestId}}`; `kh_decide_agency_invitation {p_payload:{invitationId,accept:true,expectedVersion,clientRequestId}}` | acceptance only by actual recipient |
| Admin draft (preflight below) | `kh_agency_save_property {p_agency_id,p_payload:{draft,publicationIntent:'draft',sourceReference,consentReference,clientRequestId}}` | draft, source immutable, policy requires_review, absent from anon catalogue/public page |
| Verification | `kh_request_agency_verification {p_agency_id,p_payload:{input:{message,evidenceReferences},clientRequestId}}`; owner `kh_review_agency_verification {p_payload:{agencyId,requestId,decision:'grant',note,expectedAgencyVersion,expectedVerificationVersion,expectedRequestVersion,clientRequestId}}` | request does not grant; only owner grants; draft stays draft |
| Current/foreign/removed | `kh_agency_property {p_agency_id,p_property_id}`; `kh_remove_agency_member {p_agency_id,p_payload:{userId,expectedVersion,clientRequestId}}` | current staff permitted; foreign and removed denied; old JWT cannot restore membership |
| Commercial draft guard | `kh_create_agency_deal {p_agency_id,p_payload:{propertyId,buyerId:foreignFixtureActorId,assigneeId:adminFixtureActorId,clientRequestId}}` | `KH_AGENCY_PROPERTY_CLOSED` and no deal/chat/visit/sale rows; never set approved/active to manufacture success |

Draft must use actual `propertyPayload` fields minus ownerId/moderation/clientRequestId, as the property repository does; operation sale, no photos, no map/contact, `publicationIntent:'draft'`. Use a valid receipt-labeled title/description and fixture numbers; no fabricated real address/customer. Persist the returned property ID, cycle ID and source/mandate versions. Do **not** call submit on a verified agency: direct policy could publish. Assert no public catalogue row by exact ID after every relevant step. Do not claim positive hosted deals/closures or saved corporate history that do not exist.

Concrete fixture inputs (runId/request UUIDs already persisted; these are synthetic contact values, never contacted):

```js
const input={tradeName:`Release QA ${runId}`,responsibleFullName:'Release QA fixture',businessPhone:'+15555550100',province:'La Habana',municipality:'Plaza',serviceAreas:['Plaza'],description:'Prueba controlada privada de release; no es una inmobiliaria comercial.',officeAddress:null,publishOfficeAddress:false,evidenceReferences:[`release:${runId}`]};
const draft={title:`Release QA ${runId}`,location:'Fixture privada',province:'La Habana',type:null,description:'Borrador de prueba controlada; nunca publicar ni contactar.',operation:'sale',price:20000,area:70,bedrooms:2,bathrooms:1,amenities:[],photoPaths:[],mapLocation:null};
// OFF denials use the same valid shape, with a pre-recorded random nonexistent agency UUID:
const offSubmit={p_actor_id:personal.id,p_payload:{input,clientRequestId:offSubmitId,expectedVersion:1}};
const offInvite={p_actor_id:personal.id,p_agency_id:offAgencyId,p_payload:{userId:invitee.id,role:'manager',clientRequestId:offInviteId}};
```

## Final-wave profile, duplicate and share contracts

All actor parameters below are the normal JWT subject. The original application `input`, responsible account and evidence remain immutable and private; commercial maintenance does not grant approval or verification. These APIs add no table or FK. They add `agencies.commercial_profile`, `commercial_profile_updated` events and `agency_write_receipts.operation='update_profile'`; record each exact request tuple in the existing receipt. Existing save receipts/events retain the explicit duplicate decision when one was needed.

- `kh_get_agency_profile(p_actor_id uuid,p_agency_id uuid)` returns `{agencyId,version,logoPath,input}` for a current admin (accepted OFF history). `input` contains exactly tradeName, businessPhone, province, municipality, serviceAreas, description, officeAddress and publishOfficeAddress; it excludes responsibleFullName/evidenceReferences.
- `kh_update_agency_profile(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)` takes `{input,expectedVersion,clientRequestId,logoPath?}`. Use the returned current agency version. Omit logoPath to keep it, supply a scoped existing JPEG path to attach, or null to detach. Replay rechecks current approved-admin authority. Test manager/foreign/removed denial and unchanged original application. Profile changes never grant verification. A lost-response retry uses the exact payload/request; a changed payload uses a fresh request.
- `kh_public_agency_profile(p_agency_id uuid)` is anon/authenticated, returns null while OFF or agency unapproved/suspended. Approved output contains agencyId, tradeName, businessPhone, province, municipality, serviceAreas, description, logoPath, verified and officeAddress **only when explicitly opted in**. No private address bytes are returned otherwise. Real published route is `/agency/<agency UUID>` via `web/api/agency.ts`; it can be tested using the temporary approved agency without publishing a home. The public parser and all runtime dependencies live inside `web/**`; the WEB-only deployment allowlist is unchanged. Verify HTTP content and logo bytes with anon, not only the admin editor.
- For this hosted smoke, attach an approved logo only after the exact empty draft ID/source/request are saved in the receipt; this keeps both success and OFF-failure cleanup within the reviewed one-agency/one-empty-draft contract.
- Approved logo: POST valid JPEG <=1 MiB to `/storage/v1/object/agency-assets/<agency>/logos/<asset UUID>.jpg` with current admin JWT and `x-upsert:false`; attach using update_profile, then anonymous signing uses `/storage/v1/object/sign/agency-assets/<path>` with `{expiresIn:300}`. A replacement admin can maintain logos. Original departed applicants have no maintenance authority. Concurrent attach/delete serializes at the agency lock; the DELETE trigger rechecks current authority/reference and refuses `KH_AGENCY_LOGO_REFERENCED`. Privileged Storage cleanup without a user subject also locks/rechecks the reference, but does not require a current membership. Before cleanup, detach through update_profile while the admin is still active/approved, then delete exact objects through Storage API. Record both update_profile receipt tuples and every uploaded path, including a failed/discarded upload; confirm agencies.logo_path null before deleting the agency. Never delete referenced Storage metadata by SQL.
- `kh_find_agency_property_matches(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)` requires enabled/current approved admin. Payload: `{draft:{province,location,type,bedrooms},clientRequestId,propertyId?}`. Supply the same request and current draft fields as the subsequent save; propertyId is only for editing. Returns at most20 public active sale candidates `{id,title,province,location,type,bedrooms,version}` and `review`. No match means save proceeds normally. If candidates exist, choose an existing canonical mandate request or explicitly record a different home. Do not silently attach review just to make a smoke pass: the controlled unpublished fixture should have zero matches; otherwise stop and inspect the bounded safe candidates.
- Different-home choice sends the returned `review` verbatim as `kh_agency_save_property.p_payload.duplicateDecision`, using the same clientRequestId/propertyId/current matching input. Review shape: `{decision:'different_home',input:{province,location,type,bedrooms},candidates:[{id,version}],clientRequestId,propertyId}`; province/location/type are trimmed/lowercase, bedrooms numeric, absent propertyId is null. The server recomputes it before creating a new draft or submitting, including verified direct publication. Changed candidate/version/input/request yields `KH_AGENCY_DUPLICATE_REVIEW_REQUIRED`. Similarity never merges or transfers origin. Discovery is read-only; save uses the existing save_property receipt and property_saved event.
- Existing candidate alternative: authenticated `kh_resolve_agency_mandate_property(p_actor_id,p_property_id)`, then `kh_request_agency_mandate(p_actor_id,p_agency_id,p_payload:{propertyId:resolved.propertyId,internalReference,clientRequestId})`. This is an actual business request and is **not part of the one-agency/empty-draft hosted smoke**; do not call it against real homes. The controlled teardown still requires zero mandate requests. If a separate authorized fixture ever exercises it, exact mandate-request rows and request_mandate receipts must be added to that fixture's approved cleanup before execution, not removed by broad cascade.
- Member share producer: `kh_agency_share_context(p_actor_id uuid,p_agency_id uuid,p_property_id uuid,p_manager_id uuid default null)`, current approved manager/coordinator/admin plus live canonical authorized sale. Client uses p_manager_id=current actor. Returns `{propertyId:<canonical UUID>,agencyId,managerId}` for `https://karmahouse.vercel.app/p/<canonical>?agencyId=<agency>&managerId=<manager>`. Optional null manager makes an agency-only link. No write, receipt, commission or sale attribution. Anonymous `kh_public_agency_share_context(p_property_id uuid,p_agency_id uuid,p_manager_id uuid default null)` revalidates received links; null means share the general property link. Removed/suspended destinations cannot persist as an authorized contact. A draft must be denied by the producer; do not publish the hosted draft to manufacture success.

The shared new-contact budget is20/account/24h across personal and agency conversations. Existing or replayed conversations do not consume a slot. Foreground business inbox/chat refreshes every3 seconds after a completed read, immediately on recovery, and stops with lost focus/scope/authority. Local two-browser proof is distinct from native/provider push evidence; no push-category expansion is included.

## Exact cleanup and OFF on failure

**Failure with an attached fixture logo:** disable immediately using the same paused-worker connection; do not delay OFF to make update_profile available. OFF correctly rejects that writer and ordinary user Storage writes. Before Auth cleanup, use this explicitly privileged teardown (never business proof) for each exact receipt-owned attached path. The receipt must prove the agency was created by this run, its application responsible_id is the fixture publisher, all memberships are receipt-owned actors, it owns only the exact empty draft described below, no deals/sales/visits/foreign mandates/requests/common changes exist, and the logo path was uploaded by this run. Apply the same empty-business preconditions as the full teardown. If any identity, count or predicate differs, rollback and retain OFF; never widen the cleanup.

```js
// receiptAgencyId / receiptLogoPath / fixturePublisherId / fixtureActorIds
// receiptDraftId / receiptSourceReference / receiptSaveRequest
// are copied from the exclusive receipt, not inferred from a prefix.
await pauseDb.query('begin');
try {
  await pauseDb.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
  await pauseDb.query('select kh_private.agency_lock($1)',[receiptAgencyId]);
  assert.equal((await pauseDb.query('select enabled from kh_private.agency_settings where singleton')).rows[0].enabled,false);
  const a=(await pauseDb.query('select id,logo_path,version from kh_private.agencies where id=$1 for update',[receiptAgencyId])).rows[0];
  assert.equal(a?.logo_path,receiptLogoPath);
  assert.equal((await pauseDb.query('select responsible_id from kh_private.agency_applications where agency_id=$1',[receiptAgencyId])).rows[0]?.responsible_id,fixturePublisherId);
  assert.equal((await pauseDb.query('select count(*)::int n from kh_private.agency_memberships where agency_id=$1 and not(user_id=any($2::uuid[]))',[receiptAgencyId,fixtureActorIds])).rows[0].n,0);
  assert.equal((await pauseDb.query('select count(*)::int n from kh_private.agencies where logo_path=$1 and id<>$2',[receiptLogoPath,receiptAgencyId])).rows[0].n,0);
  assert.equal((await pauseDb.query('select kh_private.agency_logo_scope($1) id',[receiptLogoPath])).rows[0].id,receiptAgencyId);
  const owned=(await pauseDb.query(`select p.id from public.properties p
    join kh_private.agency_property_origins o on o.property_id=p.id
    where p.id=$1 and o.origin_agency_id=$2 and o.publisher_id=$3 and o.source_reference=$4
    and p.client_request_id=$5 and p.moderation='draft' and p.availability<>'sold'
    and cardinality(p.photo_paths)=0 and p.cover_thumb_path is null for update of p`,[receiptDraftId,receiptAgencyId,fixturePublisherId,receiptSourceReference,receiptSaveRequest])).rows;
  assert.equal(owned.length,1,'exact owned unpublished empty draft');
  const forbidden=(await pauseDb.query(`select
    exists(select 1 from kh_private.agency_mandates where property_id=$1 and agency_id<>$2)
    or exists(select 1 from kh_private.agency_property_origins where origin_agency_id=$2 and property_id<>$1)
    or exists(select 1 from kh_private.agency_deals where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_sale_requests where property_id=$1 or origin_agency_id=$2 or executing_agency_id=$2)
    or exists(select 1 from kh_private.property_sale_closures where property_id=$1 or origin_agency_id=$2 or executing_agency_id=$2)
    or exists(select 1 from kh_private.property_visit_slots where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.property_reservations where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_mandate_requests where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_property_changes where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.property_aliases where property_id=$1 or canonical_id=$1)
    or exists(select 1 from kh_private.agency_property_moderation_holds where property_id=$1)
    or exists(select 1 from kh_private.assisted_agency_links where agency_id=$2)
    blocked`,[receiptDraftId,receiptAgencyId])).rows[0].blocked;
  assert.equal(forbidden,false,'no live/foreign/business/media dependency');
  const detached=await pauseDb.query('update kh_private.agencies set logo_path=null,version=version+1,updated_at=now() where id=$1 and logo_path=$2 and version=$3 returning id,version',[receiptAgencyId,receiptLogoPath,a.version]);
  assert.equal(detached.rowCount,1);
  // Journal previous/new version, exact path and privileged OFF-detach reason.
  await pauseDb.query('commit');
} catch(error) { await pauseDb.query('rollback'); throw error; }
// Now remove ONLY receiptLogoPath through Storage using explicitly labeled
// service cleanup (no user subject), verify info/sign/read absent, then Auth cleanup.
// Keep the worker paused and module OFF throughout this failure path.
```

The Storage DELETE trigger also rejects referenced logos for privileged cleanup and serializes at the agency lock. It allows unreferenced service cleanup without requiring a member JWT or switching ON. No trigger disabling, broad SQL deletion or application-provenance change is involved. Normal success can detach via update_profile before Storage remove; both paths record exact affected counts. The local regression `I3 failure OFF rejects referenced logo and permits exact privileged detach cleanup` proves the trigger/SQL ordering; root still verifies actual hosted Storage bytes and transport.

While worker remains paused, first delete all receipt-owned unattached Storage objects via Storage `remove([exactPath])` with the owning authorized JWT (or explicitly labeled service cleanup). Verify info/sign/read absent, including public URL where applicable. Never SQL-delete `storage.objects` metadata. Sign out only newly created sessions; delete fixture Auth users by exact recorded IDs through Auth Admin (never protected owner). Auth deletion may create agency suspension/audit events; therefore final SQL cleanup follows Auth cleanup. Capture those exact event IDs by receipt-owned agency/subject/actor IDs. Keep root owner approval request IDs in the receipt.

There is intentionally no public corporate erase RPC. The release fixture's empty-business draft and agency may be removed by **explicit privileged teardown**, distinct from business evidence. No SQL permission bypass is used to make a smoke assertion pass. This teardown requires the precondition below and runs in one transaction with triggers enabled; if any assertion or FK fails, rollback, keep OFF on failure, preserve the receipt and investigate. Never widen to real data or disable triggers/cascade.

1. Begin, acquire module mutex on `pauseDb`, then sorted fixture agency locks. Lock exact draft property and agency rows. Compare property/agency IDs, sourceReference/client request IDs and creator IDs against the receipt. Require **only fixture agencies own these origins**, moderation=draft, availability not sold, no attached photos/thumbs/holds, no aliases/assisted links, and no foreign mandates. Require zero rows for these properties/agencies in agency_deals, sale requests/closures, visit slots, reservations, mandate requests and common-change requests. Unknown concurrent use aborts teardown.
2. Resolve fixture events by exact agency IDs or exact recorded actor/subject IDs, save event IDs first. Resolve notifications through `agency_event_id`, then push jobs through `notification_id`, then push attempt rows through their actual FK. With worker paused, assert no fixture attempt/provider job existed; the happy path deletes **zero** jobs/notifications. If any exists, OFF and investigate provider state; do not erase it as if no send happened. Old module_enabled/module_disabled operational events are preserved.
3. In exact order, parameterized by arrays copied from the receipt: delete fixture `agency_write_receipts` by `(actor_id,scope_id,operation,request_id)`; delete fixture `agency_invitations`, `agency_verification_requests`, `agency_verifications`; delete `agency_memberships` (lifecycle can append events); delete fixture `agency_mandates`, `commercial_cycles`, `agency_property_origins`; delete exact draft `public.properties` (normal triggers now remove its empty identity); assert no remaining `agency_property_identities` for that ID. No property/media from other origins is touched.
The draft also creates one historical `property_publication_keys` retry key whose property FK uses ON DELETE SET NULL. Before deleting the draft, require the sole key to match exactly the receipt publisher UUID, save request and draft UUID, and save its row. After the exact draft deletion, remove only that exact publisher/request key with property_id IS NULL; require one affected row. Never remove keys by prefix or actor alone. No real publication or historical key is touched.

4. Delete fixture `agency_applications`; re-inventory/record newly appended fixture events and delete only these fixture `agency_events`; delete fixture `agencies`. Record affected-row counts and compare planned counts; mismatch rolls back. FK failures stop rather than enabling broad cascade. Commit only after all assertions. The private receipt preserves test trace despite cleanup.
5. Recheck Auth IDs absent through Auth Admin, object IDs absent through Storage API, fixture SQL IDs absent, no fixture events/jobs/notifications, same historical ledger hashes and protected-owner identity. Unrelated live counters may change; compare exact owned identity sets and log real concurrency rather than claiming whole-production byte equality. Run complete manifest verifier/status.
6. Release worker with `select pg_advisory_unlock(hashtextextended('kh:push:worker',0))` only after clean result or confirmed OFF. End pause connection in a controlled finally block. Successful final state ON is recorded only after all controlled checks and cleanup. Failure records OFF separately from cancellation completeness. A cleanup failure remains an open incident, never a passing gate.

Concrete SQL teardown for this **one-agency, one-empty-draft** receipt (do not use for fixtures that created real business subjects). Before execution, root records every selected row/expected count privately; `a`, `p`, `publisher`, `sourceReference`, `saveRequest`, `receiptKeys` come only from the exclusive receipt. All queries use parameters, never concatenated UUID lists:

```js
import assert from 'node:assert/strict';
await pauseDb.query('begin');
try {
  await pauseDb.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
  await pauseDb.query('select kh_private.agency_lock($1)',[a]);
  assert.equal((await pauseDb.query('select id from kh_private.agencies where id=$1 for update',[a])).rowCount,1);
  const owned=(await pauseDb.query(`select p.id from public.properties p
    join kh_private.agency_property_origins o on o.property_id=p.id
    where p.id=$1 and o.origin_agency_id=$2 and o.publisher_id=$3 and o.source_reference=$4
    and p.client_request_id=$5 and p.moderation='draft' and p.availability<>'sold'
    and cardinality(p.photo_paths)=0 and p.cover_thumb_path is null for update of p`,[p,a,publisher,sourceReference,saveRequest])).rows;
  assert.equal(owned.length,1,'exact owned unpublished empty draft');
  const forbidden=(await pauseDb.query(`select
    exists(select 1 from kh_private.agency_mandates where property_id=$1 and agency_id<>$2)
    or exists(select 1 from kh_private.agency_property_origins where origin_agency_id=$2 and property_id<>$1)
    or exists(select 1 from kh_private.agency_deals where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_sale_requests where property_id=$1 or origin_agency_id=$2 or executing_agency_id=$2)
    or exists(select 1 from kh_private.property_sale_closures where property_id=$1 or origin_agency_id=$2 or executing_agency_id=$2)
    or exists(select 1 from kh_private.property_visit_slots where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.property_reservations where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_mandate_requests where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.agency_property_changes where property_id=$1 or agency_id=$2)
    or exists(select 1 from kh_private.property_aliases where property_id=$1 or canonical_id=$1)
    or exists(select 1 from kh_private.agency_property_moderation_holds where property_id=$1)
    or exists(select 1 from kh_private.assisted_agency_links where agency_id=$2)
    or exists(select 1 from kh_private.agencies where id=$2 and logo_path is not null) blocked`,[p,a])).rows[0].blocked;
  assert.equal(forbidden,false,'no live/foreign/business/media dependency');
  assert.equal((await pauseDb.query(`select n.id from kh_private.notifications n
    join kh_private.agency_events e on e.id=n.agency_event_id where e.agency_id=$1`,[a])).rowCount,0,'paused worker created no fixture notifications');
  for(const key of receiptKeys){
    assert.equal(key.scope_id,a);
    assert.equal((await pauseDb.query('delete from kh_private.agency_write_receipts where actor_id=$1 and scope_id=$2 and operation=$3 and request_id=$4',[key.actor_id,key.scope_id,key.operation,key.request_id])).rowCount,1);
  }
  // Require exact planned counts for these tables from the recorded receipt inventory.
  const removals=[
    ['agency_invitations','agency_id',a],['agency_verification_requests','agency_id',a],
    ['agency_verifications','agency_id',a],['agency_memberships','agency_id',a],
    ['agency_mandates','property_id',p],['commercial_cycles','property_id',p],
    ['agency_property_origins','property_id',p],
  ];
  for(const [table,column,id]of removals){
    // table/column are the literal allowlist above, never receipt/user strings.
    assert.equal((await pauseDb.query(`delete from kh_private.${table} where ${column}=$1`,[id])).rowCount,plannedCounts[table]);
  }
  const publicationKeys=(await pauseDb.query('select property_id,origin_actor_id,client_request_id from kh_private.property_publication_keys where property_id=$1 or (origin_actor_id=$2 and client_request_id=$3)',[p,publisher,saveRequest])).rows;
  assert.deepEqual(publicationKeys,[{property_id:p,origin_actor_id:publisher,client_request_id:saveRequest}]);
  assert.equal((await pauseDb.query('delete from public.properties where id=$1 and moderation=\'draft\'',[p])).rowCount,1);
  assert.equal((await pauseDb.query('select 1 from kh_private.agency_property_identities where property_id=$1',[p])).rowCount,0);
  assert.equal((await pauseDb.query('delete from kh_private.property_publication_keys where origin_actor_id=$1 and client_request_id=$2 and property_id is null',[publisher,saveRequest])).rowCount,1);
  assert.equal((await pauseDb.query('delete from kh_private.agency_applications where agency_id=$1',[a])).rowCount,1);
  // Lifecycle triggers may add events. Save exact IDs privately before deleting these owned rows.
  const eventRows=(await pauseDb.query('select * from kh_private.agency_events where agency_id=$1 order by id',[a])).rows;
  await persistCleanupEvents(eventRows); // exclusive private receipt writer, no console output
  assert.equal((await pauseDb.query('delete from kh_private.agency_events where agency_id=$1 and id=any($2::uuid[])',[a,eventRows.map(e=>e.id)])).rowCount,eventRows.length);
  assert.equal((await pauseDb.query('select 1 from kh_private.agency_write_receipts where scope_id=$1',[a])).rowCount,0);
  assert.equal((await pauseDb.query('delete from kh_private.agencies where id=$1',[a])).rowCount,1);
  await pauseDb.query('commit');
} catch(error) { await pauseDb.query('rollback'); throw error; }
```

Partial smoke failure: the receipt may have no property or agency yet. Execute only the corresponding receipt-owned existing segments with zero expectations for later objects; never fabricate identifiers or skip a real dependency assertion to complete cleanup. If the failed operation returned no ID, recover it only by that fixture's exact Auth UUID or unique clientRequestId and compare its payload to the saved request. Root confirms OFF on the same pause connection before this investigation. This SQL is a reviewed procedure; it has not been run against production during preparation.

## Native and evidence boundary

Earlier zero-device inventories are historical. A ready Pixel returned on 2026-10-08 and local preparation exercised a fresh side-by-side `com.karmahouse.agencyfixture20261008` package through ADB/UI Automator. Native controls created a private external contact, assigned its case, recorded and accepted an offer and future visit, saved a follow-up, requested and confirmed one synthetic sale. Real local SQL verified the exact executor/amount, visit/task cancellation and preserved sale/history after OFF; fresh native relaunch showed the disabled workspace and authorized closure history. Local publication was a separately recorded authenticated-RPC prerequisite, not a native publication claim. Auth/email/media were synthetic and provider transport prohibited. See [native evidence and cleanup](agency-release-audit/README.md).

The isolated ARM64 fixture used a template debug certificate and loopback-only public configuration. Its lint failure was fixed only in the disposable network-security XML (`includeSubdomains="false"`); lint and build then passed without suppression. It is not the official signed, dual-ABI production-configured release. Fixture package, owned tunnel/device XML and database were removed; source inventory and absent fixture env were restored. Official 0.1.19/code20 package/version/install timestamps stayed unchanged. No official app storage/session was read or mutated. Broad native role-invalidation/chat/accessibility/audio and foreground/background/closed-app push reception/tap coverage remain separate gates; the rendered browser and SQL evidence is not relabeled native. Any further physical fixture must use a fresh receipt, package identity and owned cleanup. Disabled Windows/native CUA must not be bypassed.

Final handoff must name commit, PR, real release URL/hash, actual Vercel deployment/alias, migration receipts, final flag and cleanup evidence, plus all remaining physical/provider boundaries. Root pushes only the feature branch/PR and retains the worktree for feedback. No release success is claimed by this preparation document.
