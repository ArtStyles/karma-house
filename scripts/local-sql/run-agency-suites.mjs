import {Client} from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixtureDatabaseUrl} from './agency-env.mjs';
const manifest={foundation:[1,'foundation'],registration:[2,'foundation'],verification:[2,'foundation'],memberships:[2,'foundation'],assets:[2,'foundation'],'property-origins':[3,'properties'],'property-media':[3,'properties'],mandates:[4,'properties'],duplicates:[4,'properties'],lifecycle:[5,'properties'],'legacy-guards':[5,'properties'],'deals-messaging':[6,'flows'],proposals:[7,'flows'],scheduling:[7,'flows'],followups:[8,'flows'],closures:[9,'closure'],notifications:[10,'closure'],reminders:[10,'closure']};
const names={lifecycle:'account_lifecycle',closures:'sale_closures'};
const parsed=fixtureDatabaseUrl();
const args=process.argv.slice(2);let selected=[];
if(args[0]==='--suite'&&args.length===2&&manifest[args[1]])selected=[args[1]];
else if(args[0]==='--phase'&&args.length===2&&['foundation','properties','flows','closure'].includes(args[1]))selected=Object.keys(manifest).filter(n=>manifest[n][1]===args[1]);
else if(args.length===1&&args[0]==='--all')selected=Object.keys(manifest);
else throw Error('Use --suite <known-id>, --phase foundation|properties|flows|closure or --all');
const db=new Client({connectionString:parsed.href});
async function inventory(){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const rows=[];for(const {schemaname,tablename}of tables){const quoted=`"${schemaname.replaceAll('"','""')}"."${tablename.replaceAll('"','""')}"`;const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quoted} t`)).rows[0];rows.push({schemaname,tablename,...state});}return rows;
}
await db.connect();
try{
 if((await db.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t)throw Error('Serial suites require the pre-agency baseline; use a fresh fixture database');
 const before=await inventory();const root=new URL('../../supabase/migrations/',import.meta.url);
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
   if(['proposals','scheduling','followups'].includes(suite))await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_scheduling_fixture.sql',import.meta.url),'utf8'));
   await db.query(await readFile(new URL(`../../supabase/tests/agency_${names[suite]??suite.replaceAll('-','_')}.sql`,import.meta.url),'utf8'));
   await db.query('rollback');assert.deepEqual(await inventory(),before);console.log(`PASS ${suite} (rollback, inventoryUnchanged:true)`);
  }catch(error){await db.query('rollback');throw error;}
 }
 if(args[0]==='--all'){
  const tests=new URL('../../supabase/tests/',import.meta.url);
  for(const file of (await readdir(tests)).filter(f=>f.endsWith('.sql')&&!f.startsWith('agency_')).sort()){
   let sql=await readFile(new URL(file,tests),'utf8');
   if(!/^begin;\s*$/mi.test(sql))sql=`begin;\n${sql}\nrollback;`;
   if(sql.includes('Fixture helper is prepended')){
    const helper=await readFile(new URL('../../supabase/tests/helpers/assisted_fixture.sql',import.meta.url),'utf8');
    sql=sql.replace(/begin;/i,()=>`begin;\n${helper}`);
   }
   await db.query(sql);await db.query('rollback');assert.deepEqual(await inventory(),before);console.log(`PASS historical ${file}`);
  }
 }
}catch(error){await db.query('rollback').catch(()=>{});console.error(error.message,error.where??'',error.detail??'');process.exitCode=1;}
finally{await db.end()}
