import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './cloud-db.mjs';
import { inventory as notificationInventory } from './apply-notifications.mjs';

export const version = '20260920000500';
export const migration = readFileSync(new URL(`../supabase/migrations/${version}_android_push.sql`,import.meta.url),'utf8');
export const sha256 = createHash('sha256').update(migration).digest('hex');
const suites = ['messaging','negotiations','notifications','android_push'].map(name => ({name,
  sql:readFileSync(new URL(`../supabase/tests/${name}.sql`,import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^rollback;\s*$/m,''),
}));
const extraTables = ['auth.sessions','kh_private.push_devices','kh_private.push_outbox','kh_private.push_http_attempts'];
export async function inventory(db) {
  const result = await notificationInventory(db);
  for (const table of extraTables) {
    const exists = (await db.query('select to_regclass($1) is not null as found',[table])).rows[0].found;
    result[table] = exists
      ? (await db.query(`select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from ${table} t`)).rows[0]
      : {count:0,digest:'d751713988987e9331980363e24189ce'};
  }
  result.pushFixtureUsers = (await db.query("select count(*)::int as count from auth.users where id::text like '88000000-0000-4000-8000-%' or id::text like '88100000-0000-4000-8000-%'")).rows[0].count;
  return result;
}
async function verifyPrerequisites(db) {
  for (const [prior,suffix] of [['20260920000300','negotiations'],['20260920000400','notifications']]) {
    const expected = createHash('sha256').update(readFileSync(new URL(`../supabase/migrations/${prior}_${suffix}.sql`,import.meta.url))).digest('hex');
    const actual = (await db.query('select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1',[prior])).rows[0]?.sha256;
    assert.equal(actual,expected,`Immutable prerequisite ${prior} changed.`);
  }
}
export async function pushStatus(db) {
  const installed = (await db.query("select to_regclass('kh_private.push_config') is not null as found")).rows[0].found;
  if (!installed) return {installed:false};
  const config = (await db.query('select transport_enabled from kh_private.push_config where singleton')).rows[0];
  const jobs = (await db.query("select jobid,jobname,schedule,active,command='select kh_private.push_tick();' as command_matches from cron.job where jobname='karmahouse-push-delivery'")).rows;
  return {installed:true,...config,jobs};
}
export async function applyAndroidPush(mode='inspect') {
  const db=createDatabaseClient(); db.on('error',()=>{});
  let stage='connect'; const checks=[];
  try {
    await db.connect();
    if (mode==='inspect') { console.log(JSON.stringify({version,sha256,status:await pushStatus(db),inventory:await inventory(db)})); return; }
    assert(['preflight','test','apply'].includes(mode),'Unknown mode.');
    await db.query('begin');
    await db.query("set local lock_timeout='20s'");
    await db.query("set local statement_timeout='120s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
    const baseline=await inventory(db);
    assert.equal(baseline.fixtureUsers,0,'Prior reserved regression actors exist.');
    assert.equal(baseline.pushFixtureUsers,0,'Reserved push actors exist.');
    await verifyPrerequisites(db);
    const existing=(await db.query('select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1',[version])).rows[0];
    if (existing) assert.equal(existing.sha256,sha256,'Applied push migration checksum differs.');
    if (!existing && mode!=='preflight') { stage='migration'; await db.query(migration); }
    for (const suite of mode==='preflight' ? suites.filter(suite=>suite.name==='android_push') : suites) {
      stage=`regression_${suite.name}`;
      await db.query('savepoint kh_push_test');
      await db.query(suite.sql);
      await db.query('rollback to savepoint kh_push_test');
      checks.push(`${suite.name} rollback passed`);
    }
    assert.deepEqual(await inventory(db),baseline,'Fixture leak or baseline data modification.');
    const status=await pushStatus(db);
    assert.equal(status.jobs.length,1,'Expected one named delivery job.');
    assert.equal(status.jobs[0].schedule,'30 seconds');
    assert.equal(status.jobs[0].active,true);
    assert.equal(status.jobs[0].command_matches,true);
    if (!existing) assert.equal(status.transport_enabled,false,'New transport must remain disabled.');
    if (!existing && mode==='apply') {
      stage='ledger';
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[migration],'android_push']);
      await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)',[version,sha256]);
    }
    await db.query(mode==='apply'?'commit':'rollback');
    console.log(JSON.stringify({result:'android_push_sql_passed',mode,version,sha256,checks,status:await pushStatus(db),inventory:await inventory(db)}));
  } catch(error) {
    await db.query('rollback').catch(()=>{});
    console.error(JSON.stringify({result:'android_push_sql_failed',stage,code:error.code??'ERROR',message:error.message}));
    process.exitCode=1;
  } finally { await db.end().catch(()=>{}); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const modes=['preflight','test','apply'].filter(mode=>process.argv.includes(`--${mode}`));
  if(modes.length>1)throw new Error('Choose one mode.');
  await applyAndroidPush(modes[0]??'inspect');
}
