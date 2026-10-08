import {Client} from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixtureDatabaseUrl} from './agency-env.mjs';
import {historicalBody} from './agency-legacy.mjs';
import {createAgencyLocaleClone} from './agency-locale-clone.mjs';
const manifest={foundation:[1,'foundation'],registration:[2,'foundation'],verification:[2,'foundation'],memberships:[2,'foundation'],assets:[2,'foundation'],'property-origins':[3,'properties'],'property-media':[3,'properties'],mandates:[4,'properties'],duplicates:[4,'properties'],lifecycle:[5,'properties'],'legacy-guards':[5,'properties'],'deals-messaging':[6,'flows'],proposals:[7,'flows'],scheduling:[7,'flows'],followups:[8,'flows'],closures:[9,'closure'],notifications:[10,'closure'],reminders:[10,'closure']};
const names={lifecycle:'account_lifecycle',closures:'sale_closures'};
const parsed=fixtureDatabaseUrl();
const args=process.argv.slice(2);let selected=[];
if(args[0]==='--suite'&&args.length===2&&manifest[args[1]])selected=[args[1]];
else if(args[0]==='--phase'&&args.length===2&&['foundation','properties','flows','closure'].includes(args[1]))selected=Object.keys(manifest).filter(n=>manifest[n][1]===args[1]);
else if(args.length===1&&args[0]==='--all')selected=Object.keys(manifest);
else if(args.length===2&&args[0]==='--historical'&&/^[a-z_]+\.sql$/.test(args[1])&&!args[1].startsWith('agency_'))selected=[];
else throw Error('Use --suite <known-id>, --phase foundation|properties|flows|closure or --all');
const sourceDb=new Client({connectionString:parsed.href});let db=sourceDb,clone,sourceBefore;
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by schemaname collate \"C\",tablename collate \"C\"")).rows;
 const rows=[];for(const {schemaname,tablename}of tables){const quoted=`"${schemaname.replaceAll('"','""')}"."${tablename.replaceAll('"','""')}"`;const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from ${quoted} t`)).rows[0];rows.push({schemaname,tablename,...state});}return rows;
}
async function permissions(db){
 const rows=(await db.query(`select 'schema:'||nspname object,pg_get_userbyid(nspowner) owner,coalesce(nspacl,acldefault('n',nspowner))::text[] acl from pg_namespace where nspname in('public','kh_private','auth','storage','net','cron','extensions')
 union all select 'relation:'||n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::char else 'r'::char end::"char",c.relowner))::text[] from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','kh_private','auth','storage','net','cron','extensions')
 union all select 'function:'||p.oid::regprocedure::text,pg_get_userbyid(p.proowner),coalesce(p.proacl,acldefault('f',p.proowner))::text[] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kh_private','auth','storage','net','cron','extensions')`)).rows;
 return rows.map(row=>({...row,acl:row.acl?.sort()??null})).sort((a,b)=>a.object<b.object?-1:a.object>b.object?1:0);
}
await db.connect();
try{
 if((await db.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t)throw Error('Serial suites require the pre-agency baseline; use a fresh fixture database');
 sourceBefore=await inventory(sourceDb);
 {
  clone=await createAgencyLocaleClone(parsed);db=new Client({connectionString:clone.url.href});await db.connect();
  assert.equal((await db.query("select lower(U&'\\00c1') value")).rows[0].value,'á','ICU accented lowercase prerequisite');
  assert.deepEqual(await inventory(db),sourceBefore,'dump/restore preserves exact baseline data');
  assert.deepEqual(await permissions(db),await permissions(sourceDb),'dump/restore preserves actual owners and ACLs');
  console.log('BASELINE owned ICU en-US clone; real schema, owners and ACLs restored');
 }
 const before=await inventory(db);const root=new URL('../../supabase/migrations/',import.meta.url);
 const files=(await readdir(root)).filter(f=>/^20261007\d{6}_.*\.sql$/.test(f)).sort();
 for(const suite of selected){
  const through=`20261007${String(manifest[suite][0]*100).padStart(6,'0')}`;
  await db.query('begin');
  try{
   let fixtureLoaded=false;
   for(const file of files.filter(f=>f.slice(0,14)<=through)){
    if(suite==='scheduling'&&file.startsWith('20261007000700')){
     await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql',import.meta.url),'utf8'));fixtureLoaded=true;
     await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_scheduling_legacy_fixture.sql',import.meta.url),'utf8'));
    }
    await db.query(await readFile(new URL(file,root),'utf8'));
   }
   const last=files.find(f=>f.startsWith(through));if(!last)throw Error(`Missing migration ${through}`);
   if(!fixtureLoaded)await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql',import.meta.url),'utf8'));
   if(['proposals','scheduling','followups','closures','notifications','reminders'].includes(suite))await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_scheduling_fixture.sql',import.meta.url),'utf8'));
   await db.query(await readFile(new URL(`../../supabase/tests/agency_${names[suite]??suite.replaceAll('-','_')}.sql`,import.meta.url),'utf8'));
   await db.query('rollback');assert.deepEqual(await inventory(db),before);console.log(`PASS ${suite} (rollback, inventoryUnchanged:true)`);
  }catch(error){await db.query('rollback');throw error;}
 }
 if(args[0]==='--all'||args[0]==='--historical'){
  const tests=new URL('../../supabase/tests/',import.meta.url);
  const historical=(await readdir(tests)).filter(f=>f.endsWith('.sql')&&!f.startsWith('agency_')&&(args[0]!=='--historical'||f===args[1])).sort();
  assert.ok(historical.length,'unknown historical suite');
  for(const file of historical){
   let sql=historicalBody(await readFile(new URL(file,tests),'utf8'));
   await db.query('begin');
   assert.ok(files.some(f=>f.startsWith('20261007001000')),'complete agency schema required');
   for(const migration of files)await db.query(await readFile(new URL(migration,root),'utf8'));
   // The preserved Windows baseline has no pgcrypto binary. Same exact SHA256
   // fixture shim as agency_notifications.sql, transaction-local and rolled back.
   await db.query(`do $fixture$begin if to_regprocedure('extensions.digest(text,text)') is null then execute $definition$create function extensions.digest(value text,algorithm text) returns bytea language sql immutable as 'select sha256(convert_to(value,''UTF8''))'$definition$;end if;end$fixture$;`);
   await db.query('alter table net._http_response add column if not exists content_type text');
   assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
   if(sql.includes('Fixture helper is prepended')){
    const helper=await readFile(new URL('../../supabase/tests/helpers/assisted_fixture.sql',import.meta.url),'utf8');
    sql=`${helper}\n${sql}`;
   }
   await db.query(sql);await db.query('rollback');assert.deepEqual(await inventory(db),before);console.log(`PASS historical upgraded ${file} (inventoryUnchanged:true)`);
  }
 }
}catch(error){await db.query('rollback').catch(()=>{});console.error(error.message,error.where??'',error.detail??'');process.exitCode=1;}
finally{
 if(db!==sourceDb)await db.end();
 try{if(clone)await clone.cleanup();if(sourceBefore)assert.deepEqual(await inventory(sourceDb),sourceBefore);console.log('CLEANUP ownedScratchDropped:true, inventoryUnchanged:true')}
 finally{await sourceDb.end()}
}
