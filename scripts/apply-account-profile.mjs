import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';

const version = '20260920000100';
const name = 'account_profile';
const sql = readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
const actor = '25000000-0000-4000-8000-000000000001';
const outsider = '25000000-0000-4000-8000-000000000002';
const image = `${actor}/25000000-0000-4000-8000-000000000003.jpg`;
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--test') ? 'test' : process.argv.includes('--verify') ? 'verify' : 'preflight';
const db = createDatabaseClient();
let stage = 'connect';
export async function accountInventory(client) {
  const inventory = {};
  for (const table of ['auth.users','public.profiles','public.properties','public.favorites','public.kh_admins','kh_private.admin_invites','kh_private.property_save_requests','storage.objects','public.kh_conversations','public.kh_messages','public.kh_conversation_reads','public.kh_user_blocks','public.kh_message_reports']) {
    inventory[table] = (await client.query(`select count(*)::int as count, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from ${table} t`)).rows[0];
  }
  const present = (await client.query("select to_regclass('kh_private.account_avatars') is not null as present")).rows[0].present;
  inventory['kh_private.account_avatars'] = present ? (await client.query("select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from kh_private.account_avatars t")).rows[0] : { count: 0, digest: createHash('md5').update('[]').digest('hex') };
  return inventory;
}
async function asActor(id, role = 'authenticated') {
  await db.query('reset role');
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id || '', JSON.stringify(id ? { sub: id, role } : { role })]);
}
async function mustFail(statement, args, expected) {
  await db.query('savepoint account_expected_error');
  let caught;
  try { await db.query(statement, args); } catch (error) { caught = error; }
  await db.query('rollback to savepoint account_expected_error');
  assert(caught, `Expected rejection: ${expected}`);
  assert(String(caught.message).includes(expected), `Unexpected rejection code: ${caught.code}`);
}
async function regression() {
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$3)', [actor,'kh-account-sql-owner@example.invalid','{}',outsider,'kh-account-sql-other@example.invalid']);
  await asActor(actor);
  const get = async () => (await db.query('select public.kh_get_account_profile($1) as p',[actor])).rows[0].p;
  const update = async (displayName, avatarPath = null, replace = false) => (await db.query('select public.kh_update_account_profile($1,$2,$3,$4) as p',[actor,displayName,avatarPath,replace])).rows[0].p;
  assert.equal((await get()).avatarPath, null);
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('account-avatars',$1,$2,'{\"mimetype\":\"image/jpeg\",\"size\":128}')",[image,actor]);
  assert.equal((await update('Nombre nuevo',image,true)).avatarPath,image);
  assert.equal((await update('Nombre conservado')).avatarPath,image);
  assert.equal((await get()).displayName,'Nombre conservado');
  assert.equal((await db.query('select kh_private.avatar_delete_allowed($1) as allowed',[image])).rows[0].allowed,false);
  assert.equal((await db.query('select public.kh_is_admin() as admin')).rows[0].admin,false);
  await mustFail('update public.profiles set display_name=$1 where id=$2',['Direct update',actor],'permission denied');
  await mustFail('select * from kh_private.account_avatars',[],'permission denied');
  await mustFail('select public.kh_get_account_profile($1)',[outsider],'KH_ACCOUNT_CHANGED');
  await mustFail('select public.kh_update_account_profile($1,$2,$3,true)',[actor,'Nombre',`${outsider}/25000000-0000-4000-8000-000000000003.jpg`],'KH_PROFILE_AVATAR');
  await mustFail('select public.kh_update_account_profile($1,$2,null,false)',[actor,'a'],'KH_PROFILE_NAME');
  await mustFail('select public.kh_update_account_profile($1,$2,null,false)',[actor,'bad\nname'],'KH_PROFILE_NAME');
  await mustFail('select public.kh_update_account_profile($1,$2,$3,false)',[actor,'Nombre',image],'KH_PROFILE_AVATAR');
  await asActor(outsider);
  assert.equal((await db.query("select count(*)::int as n from storage.objects where bucket_id='account-avatars' and name=$1",[image])).rows[0].n,0);
  assert.equal((await db.query('select kh_private.avatar_delete_allowed($1) as allowed',[image])).rows[0].allowed,false);
  await mustFail('select public.kh_get_account_profile($1)',[actor],'KH_ACCOUNT_CHANGED');
  await mustFail("insert into storage.objects(bucket_id,name,owner_id) values('account-avatars',$1,$2)",[`${actor}/25000000-0000-4000-8000-000000000004.jpg`,outsider],'row-level security');
  await asActor(null,'anon');
  await mustFail('select public.kh_get_account_profile($1)',[actor],'permission denied');
  await asActor(actor);
  assert.equal((await update('Sin foto',null,true)).avatarPath,null);
  assert.equal((await db.query('select kh_private.avatar_delete_allowed($1) as allowed',[image])).rows[0].allowed,true);
  await db.query('reset role');
}
try {
  await db.connect();
  stage = 'inventory';
  const before = await accountInventory(db);
  const applied = (await db.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1',[version])).rows[0];
  if (applied) assert.equal(applied.sha256,sha256,'Applied checksum differs from the local migration');
  assert.equal((await db.query('select count(*)::int as n from auth.users where id=any($1::uuid[])',[[actor,outsider]])).rows[0].n,0,'Reserved SQL fixtures already exist');
  if (mode === 'preflight') {
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version='20260917000100'")).rowCount,'Base schema must exist');
    console.log(JSON.stringify({ result:'account_profile_preflight_passed',version,sha256,applied:!!applied,inventory:before }));
  } else if (mode === 'verify') {
    assert(applied,'Account migration is not applied');
    const permissions = (await db.query("select has_function_privilege('anon','public.kh_get_account_profile(uuid)','EXECUTE') as anon_read,has_function_privilege('authenticated','public.kh_get_account_profile(uuid)','EXECUTE') as own_read,has_function_privilege('authenticated','public.kh_update_account_profile(uuid,text,text,boolean)','EXECUTE') as own_update,has_column_privilege('authenticated','public.profiles','display_name','UPDATE') as direct_name_update,has_table_privilege('authenticated','kh_private.account_avatars','SELECT') as direct_avatar_read")).rows[0];
    assert.deepEqual(permissions,{anon_read:false,own_read:true,own_update:true,direct_name_update:false,direct_avatar_read:false});
    const bucket = (await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='account-avatars'")).rows[0];
    assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),1048576); assert.deepEqual(bucket.allowed_mime_types,['image/jpeg']);
    console.log(JSON.stringify({result:'account_profile_schema_verified',version,sha256,permissions,bucket,inventory:before}));
  } else {
    await db.query('begin');
    await db.query("set local lock_timeout='20s'");
    await db.query("set local statement_timeout='90s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    stage = 'migration';
    if (!applied) await db.query(sql);
    stage = 'regression';
    await db.query('savepoint account_regression');
    await regression();
    await db.query('rollback to savepoint account_regression');
    assert.deepEqual(await accountInventory(db),before,'Existing accounts, roles, properties, storage or chats changed');
    stage = 'ledger';
    if (mode === 'apply' && !applied) {
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[sql],name]);
      await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)',[version,sha256]);
    }
    await db.query(mode === 'apply' ? 'commit' : 'rollback');
    assert.deepEqual(await accountInventory(db),before,'Data differs after completing migration');
    console.log(JSON.stringify({result:'account_profile_sql_passed',mode,version,sha256,applied:mode==='apply',inventory:before}));
  }
} catch(error) { await db.query('rollback').catch(()=>{}); console.error(JSON.stringify({result:'account_profile_failed',stage,code:error.code || 'ASSERT',message:error.message})); process.exitCode=1; }
finally { await db.end(); }
