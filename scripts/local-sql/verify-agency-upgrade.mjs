import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';

// No project environment is read. The explicitly named fixture is read-only;
// historical writes and committed migrations run in a fresh independent clone.
const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
const scratchName=`kh_agency_test_upgrade_${randomUUID().replaceAll('-','')}`;
const quote=value=>`"${value.replaceAll('"','""')}"`;
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const result=[];
 for(const {schemaname,tablename}of tables){
  const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quote(schemaname)}.${quote(tablename)} t`)).rows[0];
  result.push({schemaname,tablename,...state});
 }
 return result;
}
async function sourceState(){
 const db=new Client({connectionString:source.href});await db.connect();
 try{
  const {rows:[baseline]}=await db.query("select to_regclass('kh_private.agency_settings') agency,to_regclass('kh_private.listing_transfer_requests') transfers,to_regprocedure('public.kh_start_conversation_for_manager(uuid,uuid,uuid)') context");
  assert.equal(baseline.agency,null,'source must precede agency migrations');
  assert.ok(baseline.transfers&&baseline.context,'source must include the pre-agency baseline through 20261005000300');
  return await inventory(db);
 }finally{await db.end()}
}
const before=await sourceState();
const admin=new Client({connectionString:new URL('/postgres',source).href});await admin.connect();
let created=false,db;
try{
 assert.notEqual(scratchName,sourceName);
 assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
 await admin.query(`create database ${quote(scratchName)} template ${quote(sourceName)}`);created=true;
 db=new Client({connectionString:new URL(`/${scratchName}`,source).href});await db.connect();
 await db.query("set statement_timeout='30s'");
 await db.query('begin');
 const owner='47000000-0000-4000-8000-000000000001',seller='47000000-0000-4000-8000-000000000002',buyer='47000000-0000-4000-8000-000000000003';
 await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select id,id||'@example.invalid',now(),'{\"display_name\":\"Historical fixture\"}'::jsonb from unnest($1::uuid[])id",[[owner,seller,buyer]]);
 await db.query('insert into auth.sessions(id,user_id,not_after) select md5(id::text)::uuid,id,now()+interval \'1 day\' from auth.users where id=any($1::uuid[])',[[owner,seller,buyer]]);
 await db.query('insert into kh_private.platform_owner(singleton,user_id)values(true,$1)on conflict(singleton)do update set user_id=excluded.user_id',[owner]);
 async function as(actor){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role:'authenticated',session_id:actor===owner?'':undefined})]);}
 await as(seller);
 const path=`${seller}/historic/photo.jpg`,thumb=`${seller}/historic/thumb.jpg`;
 await db.query("insert into storage.objects(bucket_id,name)values('property-photos',$1),('property-photos',$2)",[path,thumb]);
 const payload={ownerId:seller,clientRequestId:'historic',title:'Personal historical listing',location:'Vedado',province:'La Habana',type:'Casa',description:'Historical personal fixture before corporate migrations.',price:40000,area:60,bedrooms:2,bathrooms:1,amenities:[],photoPaths:[path],coverThumbPath:thumb,moderation:'pending',operation:'sale'};
 const saved=(await db.query('select public.kh_save_property($1) value',[payload])).rows[0].value;
 await as(owner);await db.query("select public.kh_review_property($1,'approved',null,$2)",[saved.id,saved.version]);
 await db.query("select public.kh_set_user_verified($1,$2,true,'Historical personal verification')",[owner,seller]);
 await as(buyer);await db.query('insert into public.favorites(user_id,property_id)values($1,$2)',[buyer,saved.id]);
 const conversation=(await db.query('select public.kh_start_conversation_for_manager($1,$2,$3) value',[saved.id,buyer,seller])).rows[0].value;
 assert.ok(conversation,'historical chat must exist before upgrade');
 const historical=await inventory(db);
 const buckets=(await db.query('select to_jsonb(b) value from storage.buckets b order by id')).rows;
 await db.query('commit');
 const root=new URL('../../supabase/migrations/',import.meta.url);
 const files=(await readdir(root)).filter(f=>/^20261007000[1-5]00_.*\.sql$/.test(f)).sort();
 assert.equal(files.length,5,'Task7 upgrade must apply each of the five corporate migrations');
 await db.query('begin');
 for(const file of files)await db.query(await readFile(new URL(file,root),'utf8'));
 await db.query('commit');
 const upgraded=await inventory(db);
 const isHistoricalRow=row=>!(row.schemaname==='storage'&&row.tablename==='buckets');
 assert.deepEqual(upgraded.filter(row=>isHistoricalRow(row)&&historical.some(old=>old.schemaname===row.schemaname&&old.tablename===row.tablename)),historical.filter(isHistoricalRow),'exact historical rows, receipts, favorites, media, chat and personal verification must survive');
 assert.deepEqual((await db.query("select to_jsonb(b) value from storage.buckets b where id<>'agency-assets' order by id")).rows,buckets,'existing bucket settings preserved');
 assert.equal((await db.query("select public from storage.buckets where id='agency-assets'")).rows[0].public,false);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 await db.query('begin');await as(seller);
 // Lost creation response replays the original stable publication identity.
 const replay=(await db.query('select public.kh_save_property($1) value',[payload])).rows[0].value;
 assert.equal(replay.id,saved.id);assert.equal(replay.owner_id,seller);
 assert.equal((await db.query("select public.kh_public_profile($1)->>'verified' verified",[seller])).rows[0].verified,'true');
 assert.equal((await db.query("select has_function_privilege('authenticated','kh_private.agency_detach_account(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query('rollback');
 // Run the business guards against the upgraded clone, never the source baseline.
 await db.query('begin');await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql',import.meta.url),'utf8'));
 await db.query(await readFile(new URL('../../supabase/tests/agency_legacy_guards.sql',import.meta.url),'utf8'));
 await db.query('rollback');
 console.log('PASS fresh upgrade: exact historical inventory, personal receipt replay, favorite/media/chat/verification preserved; module disabled; legacy guards tested on upgraded schema');
}finally{
 if(db){await db.query('rollback').catch(()=>{});await db.end()}
 if(created)await admin.query(`drop database ${quote(scratchName)}`);
 await admin.end();
 assert.deepEqual(await sourceState(),before,'source fixture inventory must remain exact');
 console.log('CLEANUP scratchDropped:true, sourceInventoryUnchanged:true');
}
