import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './cloud-db.mjs';

export const version = '20260920000400';
export const migration = readFileSync(new URL(`../supabase/migrations/${version}_notifications.sql`, import.meta.url), 'utf8');
export const sha256 = createHash('sha256').update(migration).digest('hex');
const suites = ['messaging', 'negotiations', 'notifications'].map(name => ({
  name,
  sql: readFileSync(new URL(`../supabase/tests/${name}.sql`, import.meta.url), 'utf8')
    .replace(/^begin;\s*$/m, '').replace(/^rollback;\s*$/m, ''),
}));
const tables = [
  'auth.users', 'public.profiles', 'public.properties', 'public.favorites', 'public.kh_admins',
  'kh_private.admin_invites', 'kh_private.account_avatars', 'kh_private.property_save_requests',
  'storage.buckets', 'storage.objects', 'public.kh_conversations', 'public.kh_messages',
  'public.kh_conversation_reads', 'public.kh_user_blocks', 'public.kh_message_reports',
  'public.kh_negotiations', 'kh_private.negotiation_requests', 'kh_private.negotiation_events',
  'kh_private.notifications', 'kh_private.notification_preferences',
];
export async function inventory(db) {
  const result = {};
  for (const table of tables) {
    const exists = (await db.query('select to_regclass($1) is not null as found', [table])).rows[0].found;
    // Normalize the added nullable source column before/after migration; every other field is hashed.
    const row = table === 'public.kh_messages'
      ? "to_jsonb(t)||jsonb_build_object('negotiation_event_id',to_jsonb(t)->'negotiation_event_id')"
      : 'to_jsonb(t)';
    result[table] = exists
      ? (await db.query(`select count(*)::int as count,md5(coalesce(jsonb_agg(${row} order by (${row})::text)::text,'[]')) as digest from ${table} t`)).rows[0]
      : { count: 0, digest: 'd751713988987e9331980363e24189ce' };
  }
  result.fixtureUsers = (await db.query("select count(*)::int as count from auth.users where id::text like '77000000-0000-4000-8000-%' or id::text like '77100000-0000-4000-8000-%' or id::text like '33000000-0000-4000-8000-%' or id::text like '66000000-0000-4000-8000-%'")).rows[0].count;
  return result;
}
export async function applyNotifications(mode = 'inspect') {
  const db = createDatabaseClient();
  let stage = 'connect';
  const checks = [];
  try {
    await db.connect();
    if (mode === 'inspect') {
      console.log(JSON.stringify({ version, sha256, inventory: await inventory(db) }));
      return;
    }
    assert(['test', 'apply', 'preflight'].includes(mode), 'Unknown mode.');
    await db.query('begin');
    await db.query("set local lock_timeout='20s'");
    await db.query("set local statement_timeout='90s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    const baseline = await inventory(db);
    assert.equal(baseline.fixtureUsers, 0, 'Reserved regression fixtures already exist.');
    const existing = await db.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1', [version]);
    if (existing.rowCount) assert.equal(existing.rows[0].sha256, sha256, 'Applied migration checksum mismatch.');
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version='20260920000300'")).rowCount, 'Negotiations prerequisite missing.');
    if (!existing.rowCount && mode !== 'preflight') {
      stage = 'migration';
      await db.query(migration);
    }
    for (const suite of suites) {
      stage = `regression_${suite.name}`;
      await db.query('savepoint kh_notice_test');
      await db.query(suite.sql);
      await db.query('rollback to savepoint kh_notice_test');
      checks.push(`${suite.name} rollback passed`);
    }
    assert.deepEqual(await inventory(db), baseline, 'Existing rows changed or fixtures leaked.');
    if (!existing.rowCount && mode === 'apply') {
      stage = 'ledger';
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [migration], 'notifications']);
      await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)', [version, sha256]);
    }
    await db.query(mode === 'apply' ? 'commit' : 'rollback');
    console.log(JSON.stringify({ result: 'notifications_sql_passed', mode, version, sha256, checks, inventory: await inventory(db) }));
  } catch (error) {
    await db.query('rollback').catch(() => {});
    console.error(JSON.stringify({ result: 'notifications_sql_failed', stage, code: error.code ?? 'ERROR', message: error.message }));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modes = ['apply', 'test', 'preflight'].filter(mode => process.argv.includes(`--${mode}`));
  if (modes.length > 1) throw new Error('Choose one mode.');
  await applyNotifications(modes[0] ?? 'inspect');
}
