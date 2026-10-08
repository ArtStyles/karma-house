// Owned native fixtures only. Never loads .env, hosted configuration or credentials.
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrationArtifacts,administrationMigrationArtifacts,inventoryNames,schemaInventory,verifyAgencies,manifestFile,administrationManifestFile,digest,agencyManifestDigest,agencyProfileSchema} from '../agency-activation.mjs';
const args=process.argv.slice(2),record=args.length===1&&args[0]==='--record-manifest';
if(!record&&!(args.length===2&&args[0]==='--profile'&&['local','hosted'].includes(args[1])))throw Error('Use --record-manifest or --profile local|hosted');
const sourceUrl=process.env.KH_ADMIN_MANIFEST_TEST_DATABASE_URL;
if(sourceUrl!=='postgresql://agency_test@127.0.0.1:55491/kh_agency_test_administration_manifest_20261008')throw Error('Explicit owned administration inventory fixture required');
const source=new URL(sourceUrl);
const baselineBytes=await readFile(manifestFile),baseline=JSON.parse(baselineBytes);
const migrations=await migrationArtifacts(),extension=await administrationMigrationArtifacts(),names=inventoryNames([...migrations,...extension]);
const migrationBytes=[...migrations,...extension].map(({file,sha256})=>({file,sha256}));
const admin=new Client({connectionString:new URL('/postgres',source).href,connectionTimeoutMillis:5000});await admin.connect();
let localSchema,recorded;
async function snapshot(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage','cron','net','supabase_migrations')order by 1,2")).rows,rows=[];
 for(const {schemaname,tablename}of tables)rows.push({schemaname,tablename,...(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|'order by to_jsonb(t)::text collate "C"),''))hash from "${schemaname}"."${tablename}" t`)).rows[0]});
 return {rows,structures:await schemaInventory(db,{functions:[],tables:tables.map(t=>`${t.schemaname}.${t.tablename}`),managed:[]})};
}
async function recordLedger(db,m){
 await db.query('insert into supabase_migrations.schema_migrations(version,statements,name)values($1,$2,$3)',[m.version,[m.sql],m.file.slice(15,-4)]);
 await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256)values($1,$2)',[m.version,m.sha256]);
}
async function probe(db,sql,profile,pattern){
 await db.query('savepoint inventory_probe');
 try{await db.query(sql);await assert.rejects(verifyAgencies(db,profile),pattern,sql);}
 finally{await db.query('rollback to savepoint inventory_probe');await db.query('release savepoint inventory_probe');}
}
async function profileRun(profile){
 const name=`kh_agency_test_admin_inventory_${randomUUID().replaceAll('-','')}`;
 assert.match(name,/^kh_agency_test_admin_inventory_[a-f0-9]{32}$/);
 await admin.query(`create database "${name}" template "${source.pathname.slice(1)}"`);
 const db=new Client({connectionString:new URL(`/${name}`,source).href,connectionTimeoutMillis:5000});await db.connect();
 try{
  await db.query('begin');await db.query("set local statement_timeout='30s';set local lock_timeout='5s'");
  if(profile==='hosted'){
   // The historical hosted profile must verify BEFORE deriving any extension pin.
   await db.query('grant execute on all functions in schema public to service_role;grant execute on function kh_private.full_public_profile(uuid) to service_role');
   await db.query('alter default privileges for role agency_test in schema public revoke execute on functions from public;alter default privileges for role agency_test in schema public grant execute on functions to anon,authenticated,service_role;alter table auth.users enable row level security;alter table auth.users no force row level security');
  }
  await db.query('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);create table supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version),sha256 text not null,applied_at timestamptz default now())');
  for(const m of migrations){await db.query(m.sql);await recordLedger(db,m);}
  if(profile==='hosted')await db.query('revoke execute on function public.kh_agency_review_detail(uuid,uuid,uuid),public.kh_set_agency_logo(uuid,uuid,text,integer)from anon');
  const previous=await verifyAgencies(db,profile);assert.equal(previous.migrations,10);assert.equal(previous.functions,241);assert.equal(previous.tables,41);
  const history=(await db.query('select to_jsonb(m)m,to_jsonb(c)c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version)order by m.version')).rows;
  for(const m of extension){await db.query(m.sql);await recordLedger(db,m);}
  const actual=await schemaInventory(db,names);
  if(record&&profile==='local'){
   localSchema=actual;
   recorded={format:1,extends:{file:'agency-activation-manifest.json',sha256:agencyManifestDigest(baselineBytes)},migrations:extension.map(({file,version,sha256})=>({file,version,sha256})),names,schema:actual,profiles:{hosted:{functions:[],managed:[]}}};
   await writeFile(administrationManifestFile,JSON.stringify(recorded,null,2)+'\n');
  }
  if(record&&profile==='hosted'){
   const pins={functions:[],managed:[]};
   for(const row of actual.functions){const local=localSchema.functions.find(f=>f.signature===row.signature);assert.ok(local);assert.deepEqual({...row,service_role:local.service_role},local,'Only the explicit historical hosted EXECUTE delta is permitted');if(row.service_role!==local.service_role){assert.equal(local.service_role,false);assert.equal(row.service_role,true);pins.functions.push({signature:row.signature,service_role:true});}}
   for(const row of actual.managed){const local=localSchema.managed.find(m=>m.table===row.table&&m.kind===row.kind&&m.name===row.name);assert.ok(local);if(row.sha256!==local.sha256){assert.equal(row.table,'auth.users');assert.equal(row.kind,'trigger');pins.managed.push(row);}}
   assert.deepEqual(actual.tables,localSchema.tables,'Table structures and all effective grants remain exact between profiles');
   for(const pin of baseline.profiles.hosted.functions)assert.ok(pins.functions.some(p=>p.signature===pin.signature),'Existing hosted grant pin retained');
   for(const pin of baseline.profiles.hosted.managed)assert.deepEqual(pins.managed.find(p=>p.table===pin.table&&p.kind===pin.kind&&p.name===pin.name),pin,'Existing hosted Auth security pin retained');
   recorded.profiles.hosted=pins;assert.deepEqual(agencyProfileSchema(recorded,'hosted'),actual);await writeFile(administrationManifestFile,JSON.stringify(recorded,null,2)+'\n');
  }
  const complete=await verifyAgencies(db,profile);assert.equal(complete.migrations,12);assert.equal(complete.enabled,false);
  assert.deepEqual((await db.query('select to_jsonb(m)m,to_jsonb(c)c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version)where m.version like $1 order by m.version',['20261007%'])).rows,history,'Historical receipts are literal and unchanged');
  // Ledger state chooses the inventory, never the enabled flag or the schema alone.
  const remove=version=>`delete from supabase_migrations.karmahouse_migration_checksums where version='${version}';delete from supabase_migrations.schema_migrations where version='${version}'`;
  await probe(db,remove('20261008000200'),profile,/Incomplete agency migration ledger/);
  await probe(db,remove('20261008000100'),profile,/Incomplete agency migration ledger/);
  await probe(db,remove('20261008000100')+';'+remove('20261008000200'),profile,/inventory differs/);
  await probe(db,"insert into supabase_migrations.schema_migrations(version,statements,name)values('20261008000300',array['select 1;'],'unknown_extension')",profile,/Incomplete agency migration ledger/);
  console.log(`${profile}: partial ledger and missing extension rejected`);
  const damage=[
   "update supabase_migrations.karmahouse_migration_checksums set sha256=repeat('0',64)where version='20261008000100'",
   "update supabase_migrations.schema_migrations set statements=array['select 1;']where version='20261008000200'",
   "update supabase_migrations.karmahouse_migration_checksums set sha256=repeat('0',64)where version='20261007000500'",
   "create or replace function public.kh_admin_dashboard(p_actor_id uuid)returns jsonb language sql stable security definer set search_path=''as $$select '{}'::jsonb$$",
   'revoke execute on function public.kh_admin_query(uuid,text,text,jsonb,integer,integer,text)from authenticated',
   'grant execute on function kh_private.is_principal_agency(uuid)to anon',
   'grant execute on function public.kh_ensure_principal_agency(uuid)to service_role',
   'grant select on kh_private.principal_agency to authenticated',
   "alter table kh_private.principal_agency alter column created_at set default '2026-10-08'::timestamptz",
   'alter table kh_private.principal_agency disable row level security',
   'alter table kh_private.agencies disable trigger kh_principal_agency_guard',
   'alter table kh_private.platform_owner disable trigger kh_principal_platform_owner_transfer',
   'alter table auth.users disable trigger kh_agency_auth_signup',
   'grant select(payload)on kh_private.agency_events to authenticated',
   profile==='hosted'?'revoke execute on function public.kh_admin_history_actors(uuid)from service_role':'grant execute on function public.kh_admin_history_actors(uuid)to service_role',
  ];
  for(const sql of damage)await probe(db,sql,profile);
  console.log(`${profile}: ${damage.length} drift probes rejected`);
  await verifyAgencies(db,profile);console.log(`PASS ${profile}: exact 10 and 12 inventories (${complete.functions} functions/${complete.tables} tables)`);
 }finally{
  await db.query('rollback');await db.end();
  assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[name])).rows[0]?.owned,true);
  await admin.query(`drop database "${name}"`);
 }
}
const baselineDb=new Client({connectionString:source.href,connectionTimeoutMillis:5000});let before;
try{
 assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[source.pathname.slice(1)])).rows[0]?.owned,true);
 await baselineDb.connect();assert.equal((await baselineDb.query("select to_regclass('kh_private.agency_settings')t")).rows[0].t,null);before=await snapshot(baselineDb);await baselineDb.end();
 for(const profile of record?['local','hosted']:[args[1]])await profileRun(profile);
 assert.equal(digest(await readFile(manifestFile)),digest(baselineBytes));assert.deepEqual([...await migrationArtifacts(),...await administrationMigrationArtifacts()].map(({file,sha256})=>({file,sha256})),migrationBytes);
 const check=new Client({connectionString:source.href});await check.connect();try{assert.deepEqual(await snapshot(check),before);}finally{await check.end();}
 console.log('historical bytes and fixture inventory unchanged; owned scratch databases dropped');
}finally{await baselineDb.end().catch(()=>{});await admin.end();}
