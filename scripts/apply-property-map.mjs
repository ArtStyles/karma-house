import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';

const migrations = [
  ['20260917000200', 'property_map'],
  ['20260917000300', 'map_rounding_parity'],
].map(([version, name]) => {
  const sql = readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
  return { version, name, sql, sha256: createHash('sha256').update(sql).digest('hex') };
});
const manifest = migrations.map(({version,sha256}) => ({version,sha256}));
const tests = ['property_map.sql'];
const client = createDatabaseClient();
let stage = 'connect';
const inventory = async () => (await client.query(`select
  (select count(*)::int from public.properties) as properties,
  (select count(*)::int from public.profiles) as profiles,
  (select count(*)::int from public.favorites) as favorites,
  (select count(*)::int from storage.objects where bucket_id='property-photos') as photos,
  (select md5(coalesce(jsonb_agg(to_jsonb(p)-'latitude'-'longitude'-'location_precision' order by p.id)::text,'[]')) from public.properties p) as property_data_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',p.id,'latitude',to_jsonb(p)->'latitude','longitude',to_jsonb(p)->'longitude','precision',to_jsonb(p)->'location_precision') order by p.id)::text,'[]')) from public.properties p) as map_data_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',r.property_id,'initial',r.initial_payload-'mapLocation','last',r.last_payload-'mapLocation','expected',r.last_expected_version,'result',r.last_result_version) order by r.property_id)::text,'[]')) from kh_private.property_save_requests r) as receipt_data_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',r.property_id,'initial',coalesce(r.initial_payload->'mapLocation','null'::jsonb),'last',coalesce(r.last_payload->'mapLocation','null'::jsonb)) order by r.property_id)::text,'[]')) from kh_private.property_save_requests r) as receipt_map_digest,
  (select count(*)::int from auth.users where id in ('22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003')) as map_fixture_users
`)).rows[0];

try {
  await client.connect();
  const before = await inventory();
  console.log(JSON.stringify({ migrations: manifest, inventory: before }));
  if (!process.argv.includes('--apply') && !process.argv.includes('--test')) {
    console.log('Read-only inventory complete. --apply applies the additive migration; --test runs rollback-only assertions.');
  } else {
    await client.query('begin');
    await client.query("set local lock_timeout='20s'");
    await client.query("set local statement_timeout='60s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    // Lock only for the short migration/test transaction, so the before/after preservation check is meaningful.
    await client.query('lock table public.properties,kh_private.property_save_requests in share row exclusive mode');
    const baseline = await inventory();
    if (baseline.map_fixture_users !== 0) throw new Error('Reserved regression IDs are already in use; refusing to overwrite fixtures.');
    const base = await client.query("select 1 from supabase_migrations.schema_migrations where version='20260917000100'");
    if (!base.rowCount) throw new Error('Required cloud marketplace migration is missing.');
    const pending = [];
    for (const migration of migrations) {
      const existing = await client.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1',[migration.version]);
      if (existing.rowCount && existing.rows[0].sha256 !== migration.sha256) throw new Error(`Applied migration ${migration.version} checksum mismatch.`);
      if (!existing.rowCount) {
        pending.push(migration);
        if (process.argv.includes('--apply')) {
          stage = `migration_${migration.version}`;
          await client.query(migration.sql);
        }
      }
    }
    stage = 'regression';
    // The legacy regression assumes an empty catalog; run it where applicable as extra coverage.
    if (baseline.properties === 0 && baseline.photos === 0) tests.unshift('cloud_marketplace.sql');
    for (const file of tests) {
      await client.query('savepoint kh_map_regression');
      const sql = readFileSync(new URL(`../supabase/tests/${file}`, import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^rollback;\s*$/m,'');
      await client.query(sql);
      await client.query('rollback to savepoint kh_map_regression');
    }
    const afterTests = await inventory();
    if (JSON.stringify(baseline)!==JSON.stringify(afterTests)) throw new Error('Existing catalog or fixtures changed unexpectedly; rolling back.');
    if (process.argv.includes('--apply')) {
      stage = 'ledger';
      for (const migration of pending) {
        await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[migration.version,[migration.sql],migration.name]);
        await client.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)',[migration.version,migration.sha256]);
      }
    }
    await client.query(process.argv.includes('--apply') ? 'commit' : 'rollback');
    stage = 'verification';
    console.log(JSON.stringify({ result: 'property_map_sql_passed', mode: process.argv.includes('--apply') ? pending.length ? 'applied' : 'verified_existing' : 'rollback_test', migrations: manifest, suites: tests, inventory: await inventory() }));
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(JSON.stringify({ result: 'failed', stage, code: error.code ?? 'ERROR', message: error.message }));
  process.exitCode = 1;
} finally { await client.end(); }
