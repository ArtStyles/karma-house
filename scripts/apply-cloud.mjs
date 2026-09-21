import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabaseClient, adminEmail } from './cloud-db.mjs';

const version = '20260917000100';
const migration = readFileSync(new URL(`../supabase/migrations/${version}_cloud_marketplace.sql`, import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(migration).digest('hex');
const regression = readFileSync(new URL('../supabase/tests/cloud_marketplace.sql', import.meta.url), 'utf8');
const assertionsOnly = regression.replace(/^begin;\s*$/m, '').replace(/^rollback;\s*$/m, '');
const client = createDatabaseClient();
let stage = 'connect';

async function configureAdmin() {
  if (!adminEmail) throw new Error('KARMAHOUSE_ADMIN_EMAIL must be configured privately.');
  const verified = await client.query('select id from auth.users where lower(email)=lower(btrim($1)) and email_confirmed_at is not null', [adminEmail]);
  if (verified.rowCount > 1) throw new Error('Administrative email matches more than one verified account.');
  if (verified.rowCount === 1) {
    await client.query('insert into public.kh_admins(user_id) values($1) on conflict(user_id) do nothing', [verified.rows[0].id]);
    await client.query('delete from kh_private.admin_invites where email=lower(btrim($1))', [adminEmail]);
    return 'verified_account_assigned';
  }
  await client.query('insert into kh_private.admin_invites(email) values(lower(btrim($1))) on conflict(email) do nothing', [adminEmail]);
  return 'private_invitation_pending_confirmation';
}

try {
  await client.connect();
  const tables = (await client.query("select table_name from information_schema.tables where table_schema='public' order by table_name")).rows.map(row => row.table_name);
  const storagePolicies = (await client.query("select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname")).rows;
  const buckets = (await client.query('select id,public from storage.buckets order by id')).rows;
  console.log(JSON.stringify({ inventory: { publicTables: tables, storagePolicies, buckets }, version, sha256 }));
  if (!process.argv.includes('--apply')) {
    console.log('Read-only inventory complete. Use --apply to apply the reviewed migration and run regression assertions.');
  } else {
    stage = 'begin';
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    await client.query('create schema if not exists supabase_migrations');
    await client.query('create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)');
    await client.query('create table if not exists supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version), sha256 text not null, applied_at timestamptz not null default now())');
    const existing = await client.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1', [version]);
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== sha256) throw new Error('Applied migration checksum mismatch; refusing to rewrite the ledger.');
      stage = 'regression_existing_schema';
    } else {
      if (tables.length || buckets.length || storagePolicies.length) throw new Error('Initial migration requires the reviewed empty public schema, bucket list, and Storage policy list.');
      stage = 'migration';
      await client.query(migration);
      stage = 'regression_new_schema';
    }
    await client.query('savepoint kh_regression');
    await client.query(assertionsOnly);
    await client.query('rollback to savepoint kh_regression');
    stage = 'ledger';
    if (!existing.rowCount) {
      await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [migration], 'cloud_marketplace']);
      await client.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)', [version,sha256]);
    }
    stage = 'admin_bootstrap';
    const adminState = await configureAdmin();
    await client.query('commit');
    stage = 'verification';
    const verification = (await client.query(`select
      (select count(*)::int from public.properties) as properties,
      (select count(*)::int from storage.objects where bucket_id='property-photos') as photos,
      (select count(*)::int from auth.users where id in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003')) as sql_test_users,
      (select count(*)::int from public.kh_admins) as admin_count,
      (select count(*)::int from kh_private.admin_invites) as pending_admin_invites,
      (select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1) as sha256`, [version])).rows[0];
    console.log(JSON.stringify({ result: 'migration_and_sql_regression_passed', mode: existing.rowCount ? 'verified_existing' : 'applied', version, adminState, verification }));
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(JSON.stringify({ result: 'failed', stage, code: error.code ?? 'ERROR', message: String(error.message).replaceAll(adminEmail ?? '\0','[private-admin-email]') }));
  process.exitCode = 1;
} finally {
  await client.end();
}
