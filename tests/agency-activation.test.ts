import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=(args:string[])=>spawnSync(process.execPath,['scripts/configure-agencies.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH}});
test('default_command_does_not_enable',()=>{const r=run([]);assert.notEqual(r.status,0);assert.match(r.stderr,/Explicit --target and exactly one action/);assert.doesNotMatch(r.stdout,/enabled.*true/)});
test('requires_explicit_target_and_action',()=>{for(const args of [['--enable'],['--target','local'],['--target','other','--status'],['--target','local','--status','--enable'],['--target','local','--enable'],['--target','local','--disable','--reason',' ']]){const r=run(args);assert.notEqual(r.status,0);assert.match(r.stderr,/Invalid agency command/);assert.doesNotMatch(r.stderr,/password|ENOTFOUND|ECONNREFUSED|pg\//)}});
test('activation_requires_all_migrations',async()=>{const {assertMigrationLedger}=await import('../scripts/agency-activation.mjs');const migrations=Array.from({length:10},(_,i)=>({version:`20261007${String(i+1).padStart(4,'0')}00`,sha256:'a'.repeat(64),sql:'select 1;'}));assert.throws(()=>assertMigrationLedger(migrations,migrations.slice(1)),/ledger/);assert.throws(()=>assertMigrationLedger(migrations,migrations.map((m,i)=>({...m,sha256:i?'b'.repeat(64):m.sha256,statements:[m.sql]}))),/ledger/);assert.doesNotThrow(()=>assertMigrationLedger(migrations,migrations.map(m=>({...m,statements:[m.sql]}))));});
test('administration extension ledger requires both reviewed migrations and retains literal historical SQL',async()=>{
 const {assertMigrationLedger}=await import('../scripts/agency-activation.mjs');
 const baseline=Array.from({length:10},(_,i)=>({version:`20261007${String(i+1).padStart(4,'0')}00`,sha256:'a'.repeat(64),sql:'select 1;'}));
 const extension=[{version:'20261008000100',sha256:'b'.repeat(64),sql:'select 2;\n'},{version:'20261008000200',sha256:'c'.repeat(64),sql:'select 3;\n'}];
 const migrations=[...baseline,...extension],rows=migrations.map(m=>({...m,statements:[m.sql]}));
 assert.doesNotThrow(()=>assertMigrationLedger(migrations,rows));
 assert.throws(()=>assertMigrationLedger(migrations,rows.slice(0,11)),/ledger/);
 assert.throws(()=>assertMigrationLedger(migrations,rows.map((r,i)=>i===11?{...r,statements:['select 3;\r\n']}:r)),/ledger/);
 assert.throws(()=>assertMigrationLedger(migrations,rows.map((r,i)=>i===10?{...r,sha256:'d'.repeat(64)}:r)),/ledger/);
 assert.throws(()=>assertMigrationLedger(migrations,[...rows.slice(0,11),rows[0]]),/ledger/);
});
test('historical JSON manifest binding tolerates only standard checkout CRLF while keeping SQL byte hashes exact',async()=>{
 const {agencyManifestDigest,digest}=await import('../scripts/agency-activation.mjs');
 const lf=Buffer.from('{"format":1,"schema":{"owner":"protected"}}\n');
 const crlf=Buffer.from('{"format":1,"schema":{"owner":"protected"}}\r\n');
 assert.equal(agencyManifestDigest(lf),digest(lf));assert.equal(agencyManifestDigest(crlf),digest(lf));
 assert.notEqual(agencyManifestDigest(Buffer.from('{"format":1,"schema":{"owner":"changed"}}\n')),digest(lf));
 assert.notEqual(agencyManifestDigest(Buffer.from('{"format":1,"schema":{"owner":"protected"}}\r')),digest(lf));
 assert.notEqual(agencyManifestDigest(Buffer.from(' {"format":1,"schema":{"owner":"protected"}}\n')),digest(lf));
 assert.notEqual(digest(lf),digest(crlf));
});
test('unknown_targets_and_profiles_reject_before_configuration_or_queries',async()=>{const {agencyConnection,verifyAgencies}=await import('../scripts/agency-activation.mjs');await assert.rejects(agencyConnection({target:'other',config:'Z:/missing-private-config.json'}),/Invalid agency target/);await assert.rejects(verifyAgencies({query:()=>{throw Error('unexpected database query')}},'other'),/Invalid agency manifest profile/);});
test('rename_then_move_inventory_uses_final_private_identity_without_ghost_public_names',async()=>{const {inventoryNames,migrationArtifacts}=await import('../scripts/agency-activation.mjs');const names=inventoryNames(await migrationArtifacts());for(const name of ['kh_review_agency_before_lifecycle','kh_create_negotiation_pre_scheduling','kh_respond_negotiation_pre_scheduling']){assert.ok(names.functions.includes(`kh_private.${name}`));assert.ok(!names.functions.includes(`public.${name}`));}});
test('platform_remediation_requires_explicit_hosted_profile_before_queries',async()=>{const {remediateAgencyPlatform}=await import('../scripts/agency-platform-remediation.mjs');for(const profile of [undefined,'local','other'])await assert.rejects(remediateAgencyPlatform({query:()=>{throw Error('unexpected database query')}},profile),/Explicit hosted remediation profile/);});
test('administration native proof requires its owned fixture before connection without exposing rejected URLs',()=>{
 for(const value of [undefined,'postgresql://agency_test@127.0.0.1:55491/other','postgresql://private:secret-proof@remote.invalid/business']){
  const env={...process.env};delete env.KH_ADMIN_MANIFEST_TEST_DATABASE_URL;if(value)env.KH_ADMIN_MANIFEST_TEST_DATABASE_URL=value;
  const r=spawnSync(process.execPath,['scripts/local-sql/verify-agency-administration.mjs','--profile','local'],{encoding:'utf8',env,timeout:10000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Explicit owned administration inventory fixture required/);assert.doesNotMatch(r.stdout+r.stderr,/secret-proof|remote.invalid|ENOTFOUND|ECONNREFUSED/);
 }
});
test('hosted_platform_profile_and_atomic_remediation',{skip:!process.env.KH_LOCAL_DATABASE_URL},()=>{const r=spawnSync(process.execPath,['scripts/local-sql/verify-agency-platform.mjs'],{encoding:'utf8',env:process.env,timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/strict hosted profile accepts 241 functions/);assert.match(r.stdout,/atomic two-revoke remediation/);assert.match(r.stdout,/all migration bytes and source inventory unchanged; owned clone dropped/);});
test('disable_preserves_sales_and_history',{skip:!process.env.KH_LOCAL_DATABASE_URL},()=>{const r=spawnSync(process.execPath,['scripts/local-sql/verify-agency-activation.mjs'],{encoding:'utf8',env:process.env,timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/preserved all sales\/history\/receipts\/legacy/);assert.match(r.stdout,/owned clone dropped; source unchanged/)});
for(const profile of ['local','hosted'])test(`administration extension ${profile} rejects literal ledger, function, table and grant drift`,{skip:!process.env.KH_ADMIN_MANIFEST_TEST_DATABASE_URL},()=>{
 const r=spawnSync(process.execPath,['scripts/local-sql/verify-agency-administration.mjs','--profile',profile],{encoding:'utf8',env:process.env,timeout:60000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,new RegExp(`PASS ${profile}: exact 10 and 12 inventories`));assert.match(r.stdout,/partial ledger and missing extension rejected/);assert.match(r.stdout,/drift probes rejected/);assert.match(r.stdout,/historical bytes and fixture inventory unchanged/);
});
