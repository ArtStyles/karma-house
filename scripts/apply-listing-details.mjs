import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from './cloud-db.mjs';

const version = '20260920000200';
const name = 'listing_details';
const sql = readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
const suite = readFileSync(new URL('../supabase/tests/listing_details.sql', import.meta.url), 'utf8').replace(/^begin;\s*$/m, '').replace(/^rollback;\s*$/m, '');
const inventorySql = `select
  (select count(*)::int from public.properties) as properties,
  (select count(*)::int from public.profiles) as profiles,
  (select count(*)::int from public.favorites) as favorites,
  (select count(*)::int from auth.users) as users,
  (select count(*)::int from public.kh_admins) as admins,
  (select count(*)::int from storage.objects where bucket_id='property-photos') as photos,
  (select md5(coalesce(jsonb_agg(to_jsonb(p)-'condition'-'floor'-'price_negotiable' order by p.id)::text,'[]')) from public.properties p) as property_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',p.id,'condition',to_jsonb(p)->'condition','floor',to_jsonb(p)->'floor','negotiable',to_jsonb(p)->'price_negotiable') order by p.id)::text,'[]')) from public.properties p) as details_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',r.property_id,'initial',r.initial_payload-'condition'-'floor'-'priceNegotiable','last',r.last_payload-'condition'-'floor'-'priceNegotiable','expected',r.last_expected_version,'result',r.last_result_version) order by r.property_id)::text,'[]')) from kh_private.property_save_requests r) as receipt_digest,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',r.property_id,'initialCondition',r.initial_payload->'condition','initialFloor',r.initial_payload->'floor','initialNegotiable',r.initial_payload->'priceNegotiable','lastCondition',r.last_payload->'condition','lastFloor',r.last_payload->'floor','lastNegotiable',r.last_payload->'priceNegotiable') order by r.property_id)::text,'[]')) from kh_private.property_save_requests r) as receipt_details_digest,
  (select count(*)::int from auth.users where id in ('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000003','24000000-0000-4000-8000-000000000004')) as fixture_users`;

const legacyActor = '24000000-0000-4000-8000-000000000004';
const legacyPayload = { clientRequestId: 'details-pre-migration', title: 'Casa de cliente anterior', location: 'Vedado', province: 'La Habana', price: 10000, bedrooms: 2, bathrooms: 1, area: 80, type: 'Casa', description: 'Anuncio ficticio creado antes de la migración de detalles.', amenities: [], photoPaths: [], moderation: 'draft' };
async function asLegacyActor(client) {
  await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [legacyActor, JSON.stringify({ sub: legacyActor, role: 'authenticated' })]);
}
async function rpcSave(client, payload) {
  return (await client.query('select public.kh_save_property($1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
}

/** --test installs pending SQL only in a transaction that is always rolled back. */
export async function runListingDetails(mode = 'inspect') {
  const client = createDatabaseClient();
  let stage = 'connect';
  try {
    await client.connect();
    const inventory = async () => (await client.query(inventorySql)).rows[0];
    if (mode === 'inspect' || mode === 'verify') {
      const applied = await client.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1', [version]);
      const columns = (await client.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='properties' and column_name in ('condition','floor','price_negotiable') order by column_name")).rows;
      if (mode === 'verify') {
        assert.equal(applied.rows[0]?.sha256, sha256, 'Applied migration checksum does not match.');
        assert.deepEqual(columns.map(({column_name,data_type,is_nullable,column_default}) => [column_name,data_type,is_nullable,column_default]), [['condition','text','YES',null],['floor','integer','YES',null],['price_negotiable','boolean','YES',null]]);
        const permissions = (await client.query("select has_function_privilege('anon','public.kh_save_property(jsonb)','EXECUTE') as anon_save, has_function_privilege('authenticated','public.kh_save_property(jsonb)','EXECUTE') as member_save, has_table_privilege('authenticated','public.properties','UPDATE') as direct_update")).rows[0];
        assert.deepEqual(permissions, { anon_save: false, member_save: true, direct_update: false });
      }
      console.log(JSON.stringify({ result: mode === 'verify' ? 'listing_details_verified' : 'listing_details_inventory', version, sha256, applied: !!applied.rowCount, columns, inventory: await inventory() }));
      return;
    }
    if (!['test', 'apply', 'preflight'].includes(mode)) throw new Error('Unknown listing-details mode.');
    await client.query('begin');
    await client.query("set local lock_timeout='20s'");
    await client.query("set local statement_timeout='90s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    await client.query('lock table public.properties,kh_private.property_save_requests in share row exclusive mode');
    const baseline = await inventory();
    assert.equal(baseline.fixture_users, 0, 'Reserved regression actors already exist.');
    const base = await client.query("select 1 from supabase_migrations.schema_migrations where version='20260917000300'");
    assert(base.rowCount, 'Required map migration is missing.');
    const applied = await client.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1', [version]);
    if (applied.rowCount) assert.equal(applied.rows[0].sha256, sha256, 'Applied migration checksum does not match.');
    if (!applied.rowCount && mode !== 'preflight') {
      // Simulate lost create/update acknowledgements across the actual schema upgrade.
      // This synthetic actor is removed before commit, and every failure rolls everything back.
      stage = 'legacy_receipts_before_migration';
      await client.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [legacyActor, 'kh-details-pre-migration@example.invalid', '{}']);
      await asLegacyActor(client);
      const created = await rpcSave(client, legacyPayload);
      const editedPayload = { ...legacyPayload, id: created.id, expectedVersion: 1, title: 'Casa de cliente anterior editada' };
      const edited = await rpcSave(client, editedPayload);
      assert.equal(edited.version, 2);
      await client.query('reset role');
      stage = 'migration';
      await client.query(sql);
      stage = 'legacy_receipts_after_migration';
      await asLegacyActor(client);
      const retriedCreate = await rpcSave(client, legacyPayload);
      const retriedEdit = await rpcSave(client, editedPayload);
      assert.equal(retriedCreate.id, created.id);
      assert.equal(retriedCreate.version, 2);
      assert.equal(retriedEdit.id, created.id);
      assert.equal(retriedEdit.version, 2);
      assert.equal(retriedEdit.condition, null);
      assert.equal(retriedEdit.floor, null);
      assert.equal(retriedEdit.price_negotiable, null);
      await client.query('reset role');
      await client.query('delete from auth.users where id=$1', [legacyActor]);
    }
    stage = 'regression';
    await client.query('savepoint kh_details_regression');
    await client.query(suite);
    await client.query('rollback to savepoint kh_details_regression');
    assert.deepEqual(await inventory(), baseline, 'Catalog data or fixture inventory changed unexpectedly.');
    if (mode === 'apply' && !applied.rowCount) {
      stage = 'ledger';
      await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [sql], name]);
      await client.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)', [version, sha256]);
    }
    await client.query(mode === 'apply' ? 'commit' : 'rollback');
    console.log(JSON.stringify({ result: 'listing_details_sql_passed', mode, version, sha256, applied: mode === 'apply', inventory: await inventory() }));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error(JSON.stringify({ result: 'failed', stage, code: error.code ?? 'ERROR', message: error.message }));
    process.exitCode = 1;
  } finally { await client.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modes = ['apply', 'test', 'preflight'].filter(mode => process.argv.includes(`--${mode}`));
  if (modes.length > 1) throw new Error('Choose only one of --apply, --test or --preflight.');
  await runListingDetails(modes[0] ?? 'inspect');
}
