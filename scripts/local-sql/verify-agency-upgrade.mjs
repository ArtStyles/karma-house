import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';
import {inventoryProjection} from './agency-legacy.mjs';

// No project environment is read. The explicitly named fixture is read-only;
// historical writes and committed migrations run in a fresh independent clone.
const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const scratchName=`kh_agency_test_upgrade_${randomUUID().replaceAll('-','')}`;
const quote=value=>`"${value.replaceAll('"','""')}"`;
async function inventory(db,oldTables){
 const tables=oldTables??(await db.query("select table_schema schemaname,table_name tablename,array_agg(column_name::text order by ordinal_position) columns from information_schema.columns where table_schema in('public','kh_private','auth','storage') and (table_schema,table_name) in(select schemaname,tablename from pg_tables) group by 1,2 order by 1,2")).rows;
 const result=[];
 for(const {schemaname,tablename,columns}of tables){
  const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from (select ${inventoryProjection(columns)} from ${quote(schemaname)}.${quote(tablename)}) t`)).rows[0];
  result.push({schemaname,tablename,columns,...state});
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
 assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
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
 await db.query('select public.kh_send_message($1,$2,$3,$4)',[conversation.id,randomUUID(),'Mensaje histórico conservado',buyer]);
 const visits=[randomUUID(),randomUUID()];
 await db.query(`insert into public.kh_negotiations(id,conversation_id,created_by,kind,status,visit_date,visit_time,visit_at,expires_at)
 select id,$2,$3,'visit','accepted',(t at time zone 'America/Havana')::date,(t at time zone 'America/Havana')::time,t,t
 from unnest($1::uuid[]) id cross join(select date_trunc('minute',clock_timestamp()+interval '4 days') t)x`,[visits,conversation.id,buyer]);
 await db.query('insert into kh_private.notification_preferences(user_id,messages)values($1,false) on conflict(user_id)do update set messages=false',[buyer]);
 const device=randomUUID();
 await db.query(`insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,enabled,expires_at)
 values($1,decode(repeat('aa',32),'hex'),1,'register',decode('aa','hex'),$2::uuid,md5(($2::uuid)::text)::uuid,false,clock_timestamp()+interval '1 day')`,[device,buyer]);
 const historical=await inventory(db);
 const buckets=(await db.query('select to_jsonb(b) value from storage.buckets b order by id')).rows;
 await db.query('commit');
 const root=new URL('../../supabase/migrations/',import.meta.url);
 const files=(await readdir(root)).filter(f=>/^20261007\d{6}_.*\.sql$/.test(f)).sort();
 assert.ok(files.some(f=>f.startsWith('20261007001000')),'all agency migrations through notifications required');
 await db.query('begin');
 for(const file of files)await db.query(await readFile(new URL(file,root),'utf8'));
 await db.query('commit');
 const upgraded=await inventory(db,historical);
 const isHistoricalRow=row=>!(row.schemaname==='storage'&&row.tablename==='buckets');
 assert.deepEqual(upgraded.filter(row=>isHistoricalRow(row)&&historical.some(old=>old.schemaname===row.schemaname&&old.tablename===row.tablename)),historical.filter(isHistoricalRow),'exact historical rows, receipts, favorites, media, chat and personal verification must survive');
 assert.deepEqual((await db.query("select to_jsonb(b) value from storage.buckets b where id<>'agency-assets' order by id")).rows,buckets,'existing bucket settings preserved');
 assert.equal((await db.query("select public from storage.buckets where id='agency-assets'")).rows[0].public,false);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 assert.equal((await db.query('select count(*)::int n from public.kh_negotiations where termination_reason is not null')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from kh_private.agency_property_identities where property_id=$1',[saved.id])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from kh_private.property_sale_closures')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from kh_private.property_visit_slots where personal_negotiation_id=any($1::uuid[]) and existing_conflict and outcome=\'unrecorded\'',[visits])).rows[0].n,2,'preexisting overlap is imported and flagged, never erased');
 assert.deepEqual((await db.query('select messages,agencies from kh_private.notification_preferences where user_id=$1',[buyer])).rows[0],{messages:false,agencies:true});
 assert.equal((await db.query('select supports_agency_notifications from kh_private.push_devices where installation_id=$1',[device])).rows[0].supports_agency_notifications,false);
 assert.equal((await db.query('select count(*)::int n from kh_private.notifications where agency_event_id is not null or agency_target is not null')).rows[0].n,0);
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
 console.log('PASS fresh_upgrade_all_migrations: exact old-column inventory, personal receipt replay, favorite/media/chat/verification preserved; added defaults checked; module disabled; legacy guards on upgraded schema; inventoryUnchanged:true');
}finally{
 if(db){await db.query('rollback').catch(()=>{});await db.end()}
 if(created){
  assert.match(scratchName,/^kh_agency_test_upgrade_[a-f0-9]{32}$/);
  assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
  await admin.query(`drop database ${quote(scratchName)}`);
  assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
 }
 await admin.end();
 assert.deepEqual(await sourceState(),before,'source fixture inventory must remain exact');
 console.log('CLEANUP scratchDropped:true, sourceInventoryUnchanged:true');
}
