// Owned-clone platform reconstruction only. Never accepts a hosted URL/configuration.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {createAgencyLocaleClone} from './agency-locale-clone.mjs';
import {migrationArtifacts,inventoryNames,schemaInventory,verifyAgencies,digest} from '../agency-activation.mjs';
import {remediateAgencyPlatform} from '../agency-platform-remediation.mjs';
const source=new URL(process.env.KH_LOCAL_DATABASE_URL);
assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const baseline=new Client({connectionString:source.href});await baseline.connect();
async function snapshot(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage','supabase_migrations') order by 1,2")).rows,rows=[];
 for(const {schemaname,tablename} of tables)rows.push({schemaname,tablename,...(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from "${schemaname}"."${tablename}" t`)).rows[0]});
 const catalog=(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kh_private','auth','storage') and p.prokind='f' order by 1,2,3")).rows;
 const security=(await db.query("select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','kh_private','auth','storage','supabase_migrations') order by 1,2")).rows;
 const structures=await schemaInventory(db,{functions:[],tables:tables.map(t=>`${t.schemaname}.${t.tablename}`),managed:[]});
 const defaults=(await db.query("select pg_get_userbyid(defaclrole) owner,coalesce(n.nspname,'') schema,defaclobjtype,defaclacl::text acl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3")).rows;
 return {rows,catalog,security,structures,defaults};
}
async function sourceBytes(){const root=new URL('../../supabase/migrations/',import.meta.url),result=[];for(const file of (await readdir(root)).filter(x=>x.endsWith('.sql')).sort())result.push({file,sha256:digest(await readFile(new URL(file,root)))});return result;}
const before=await snapshot(baseline),bytes=await sourceBytes();let clone,db;
try{
 clone=await createAgencyLocaleClone(source);db=new Client({connectionString:clone.url.href});await db.connect();
 // Reconstruct known hosted function-creation semantics, not a copied live schema.
 await db.query('grant execute on all functions in schema public to service_role;grant execute on function kh_private.full_public_profile(uuid) to service_role');
 await db.query('alter default privileges for role agency_test in schema public revoke execute on functions from public;alter default privileges for role agency_test in schema public grant execute on functions to anon,authenticated,service_role;alter table auth.users enable row level security;alter table auth.users no force row level security');
 const migrations=await migrationArtifacts();for(const m of migrations)await db.query(m.sql);
 await db.query('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);create table supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version),sha256 text not null,applied_at timestamptz default now())');
 for(const m of migrations){await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[m.version,[m.sql],m.file.slice(15,-4)]);await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256)values($1,$2)',[m.version,m.sha256]);}
 await assert.rejects(verifyAgencies(db,'local'),/inventory differs/);console.log('RED: original local profile rejects reconstructed platform ACL/Auth RLS');
 await assert.rejects(verifyAgencies(db,'hosted'),/inventory differs/);console.log('hosted before-state rejects exactly two extra anonymous EXECUTEs');
 // Inject a failure AFTER the REVOKE; rollback must restore both unexpected grants.
 let ledgerReads=0,revoked=false;
 const fault={query:async(sql,args)=>{if(sql.startsWith('revoke execute on function public.kh_agency_review_detail'))revoked=true;if(sql.startsWith('select m.version,m.statements,c.sha256')&&++ledgerReads===2){assert.equal(revoked,true);throw Error('owned post-revoke verification fault');}return db.query(sql,args);}};
 await assert.rejects(remediateAgencyPlatform(fault,'hosted'),/owned post-revoke verification fault/);
 assert.equal((await db.query("select has_function_privilege('anon','public.kh_agency_review_detail(uuid,uuid,uuid)','execute') a,has_function_privilege('anon','public.kh_set_agency_logo(uuid,uuid,text,integer)','execute') b")).rows[0].a,true);
 assert.equal((await db.query("select has_function_privilege('anon','public.kh_set_agency_logo(uuid,uuid,text,integer)','execute') b")).rows[0].b,true);
 await db.query('update kh_private.agency_settings set enabled=true');await assert.rejects(remediateAgencyPlatform(db,'hosted'),/must be OFF/);await db.query('update kh_private.agency_settings set enabled=false');
 await db.query('grant execute on function kh_private.agency_account(uuid) to anon');await assert.rejects(remediateAgencyPlatform(db,'hosted'),/before-state differs/);await db.query('revoke execute on function kh_private.agency_account(uuid) from anon');
 const ledgerBefore=(await db.query('select to_jsonb(m) m,to_jsonb(c) c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version) order by m.version')).rows;
 const corrected=await remediateAgencyPlatform(db,'hosted');assert.equal(corrected.revokedAnonymousExecute,2);assert.equal(corrected.enabled,false);
 assert.deepEqual((await db.query('select to_jsonb(m) m,to_jsonb(c) c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version) order by m.version')).rows,ledgerBefore);
 await assert.rejects(remediateAgencyPlatform(db,'hosted'),/before-state differs/);
 console.log('atomic two-revoke remediation: ON, third-grant and already-corrected states rejected; post-revoke fault restored both grants; ledger unchanged; OFF retained');
 assert.deepEqual(await verifyAgencies(db,'hosted'),{complete:true,migrations:10,functions:241,tables:41,permissions:'reviewed',enabled:false,profile:'hosted'});
 console.log('GREEN: strict hosted profile accepts 241 functions / 41 tables after exact two-revoke correction');
 const damage=[
  'grant execute on function public.kh_agency_review_detail(uuid,uuid,uuid) to anon',
  'grant execute on function kh_private.agency_account(uuid) to authenticated',
  'grant execute on function kh_private.agency_account(uuid) to service_role',
  'revoke execute on function public.kh_agency_application(uuid) from service_role',
  'grant execute on function kh_private.kh_review_agency_before_lifecycle(uuid,jsonb) to authenticated',
  'grant execute on function kh_private.kh_create_negotiation_pre_scheduling(uuid,jsonb) to anon',
  "create or replace function kh_private.kh_respond_negotiation_pre_scheduling(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin return '{}'::jsonb;end$$",
  "alter function public.kh_list_agency_members(uuid,uuid,integer,integer) rename to broken_members",
  'alter schema kh_private rename to missing_private',
  'alter table kh_private.agency_settings alter column enabled set default true',
  'grant select on kh_private.agency_events to authenticated',
  'grant select(payload) on kh_private.agency_events to authenticated',
  "delete from supabase_migrations.karmahouse_migration_checksums where version='20261007000500'",
  'drop trigger kh_agency_auth_signup on auth.users',
  'alter table auth.users disable trigger kh_agency_auth_signup',
  'alter table auth.users disable row level security',
  'alter table auth.users force row level security',
  'drop policy kh_agency_photo_read on storage.objects',
  'alter table public.properties disable trigger kh_agency_property_guard',
 ];
 for(const sql of damage){await db.query('begin');try{await db.query(sql);await assert.rejects(verifyAgencies(db,'hosted'),undefined,sql);}finally{await db.query('rollback');}}
 console.log(`${damage.length} literal hosted drift probes rejected; definitions, grants, Auth-RLS, ledger and trigger firing remain pinned`);
 await assert.rejects(verifyAgencies(db,'other'),/profile/);
 const names=inventoryNames(migrations),actual=await schemaInventory(db,names);
 await writeFile(new URL('../../.superpowers/sdd/2026-10-07-agency-workspaces/platform-owned-hosted-inventory.json',import.meta.url),JSON.stringify(actual,null,2)+'\n');
}finally{
 if(db)await db.end();if(clone)await clone.cleanup();assert.deepEqual(await snapshot(baseline),before);assert.deepEqual(await sourceBytes(),bytes);await baseline.end();
 await writeFile(new URL('../../.superpowers/sdd/2026-10-07-agency-workspaces/platform-source-baseline.json',import.meta.url),JSON.stringify({migrationBytes:bytes,sourceInventorySha256:digest(JSON.stringify(before)),sourceRows:before.rows,unchanged:true,cloneDropped:true},null,2)+'\n');
 console.log('all migration bytes and source inventory unchanged; owned clone dropped');
}
