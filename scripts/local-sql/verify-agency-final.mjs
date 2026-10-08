import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';
import {createAgencyLocaleClone} from './agency-locale-clone.mjs';
const source=fixtureDatabaseUrl(), baseline=new Client({connectionString:source.href});
const out=new URL('../../.superpowers/sdd/2026-10-07-agency-closure-release/final-evidence/',import.meta.url);
await mkdir(out,{recursive:true});
async function inventory(db){const result=[];for(const t of (await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows){result.push({...t,...(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from "${t.schemaname}"."${t.tablename}" t`)).rows[0]});}return result;}
await baseline.connect();const before=await inventory(baseline);let clone,db;
try{
 assert.equal((await baseline.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t,null);
 await writeFile(new URL('baseline-before.json',out),JSON.stringify(before,null,2));
 clone=await createAgencyLocaleClone(source);console.log('OWNED CLONE',clone.url.pathname);db=new Client({connectionString:clone.url.href});await db.connect();
 assert.deepEqual(await inventory(db),before);
 const root=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(root)).filter(f=>/^20261007\d{6}_.*\.sql$/.test(f)).sort())await db.query(await readFile(new URL(file,root),'utf8'));
 const cases=(await readFile(new URL('../../supabase/tests/agency_final.sql',import.meta.url),'utf8')).split('-- CASE ').filter(s=>s.trim());
 for(const entry of cases){const cut=entry.indexOf('\n'),name=entry.slice(0,cut).trim();if(process.argv[2]&&!name.includes(process.argv[2]))continue;await db.query('begin');try{
  for(const helper of ['agency_fixture.sql','agency_scheduling_fixture.sql'])await db.query(await readFile(new URL(`../../supabase/tests/helpers/${helper}`,import.meta.url),'utf8'));
  await db.query(entry.slice(cut));console.log('PASS',name);
 }catch(e){console.error('FAIL',name,e.message,e.where??'');process.exitCode=1;}finally{await db.query('rollback');}}
}finally{
 if(db)await db.end();if(clone)await clone.cleanup();const after=await inventory(baseline);assert.deepEqual(after,before);await writeFile(new URL('baseline-after.json',out),JSON.stringify(after,null,2));await baseline.end();console.log('CLEANUP ownedScratchDropped:true inventoryUnchanged:true');
}
