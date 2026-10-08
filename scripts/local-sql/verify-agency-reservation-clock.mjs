import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';

// One Task9 display-clock regression. Only a fresh, owned loopback clone is
// written. Actual pg_blocking_pids + server time prove the expiry crossing.
const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
const scratchName=`kh_agency_test_resclock_${randomUUID().replaceAll('-','')}`;
const quote=name=>`"${name.replaceAll('"','""')}"`;
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const result=[];
 for(const {schemaname,tablename} of tables){const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quote(schemaname)}.${quote(tablename)} t`)).rows[0];result.push({schemaname,tablename,...state});}
 return result;
}
async function sourceState(){const db=new Client({connectionString:source.href});await db.connect();try{assert.equal((await db.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t,null);return await inventory(db)}finally{await db.end()}}
async function as(db,actor){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1||':session')::uuid)::text,true)",[actor]);}
const before=await sourceState(),admin=new Client({connectionString:new URL('/postgres',source).href});
await admin.connect();let created=false;const clients=[],pending=[];
try{
 assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
 await admin.query(`create database ${quote(scratchName)} template ${quote(sourceName)}`);created=true;
 assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
 async function client(){const db=new Client({connectionString:new URL(`/${scratchName}`,source).href});await db.connect();clients.push(db);await db.query("set statement_timeout='10s'");db.pid=(await db.query('select pg_backend_pid() pid')).rows[0].pid;return db;}
 const setup=await client(),holder=await client(),replay=await client();
 const migrations=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(migrations)).filter(f=>/^20261007000[1-7]00_.*\.sql$/.test(f)).sort())await setup.query(await readFile(new URL(file,migrations),'utf8'));
 await setup.query('begin');
 for(const file of ['agency_fixture.sql','agency_scheduling_fixture.sql'])await setup.query(await readFile(new URL(`../../supabase/tests/helpers/${file}`,import.meta.url),'utf8'));
 const f=(await setup.query('select pg_temp.schedule_fixture(9) f')).rows[0].f;
 const expiresAt=(await setup.query("select clock_timestamp()+interval '2 seconds' expiry")).rows[0].expiry.toISOString();
 const payload={propertyId:f.property,expiresAt,clientRequestId:randomUUID()};
 const original=(await setup.query('select public.kh_set_agency_reservation($1,$2,$3) value',[f.actor,f.agency,payload])).rows[0].value;
 assert.equal(original.active,true);await setup.query('commit');
 await holder.query('begin');await holder.query("select pg_advisory_xact_lock(hashtextextended('kh:account:'||$1::text,0))",[f.actor]);
 await replay.query('begin');await as(replay,f.actor);
 const response=replay.query('select public.kh_set_agency_reservation($1,$2,$3) value',[f.actor,f.agency,payload]).then(value=>({value}),error=>({error}));pending.push(response);
 let observed=false;const deadline=Date.now()+6000;
 while(Date.now()<deadline){
  const evidence=(await setup.query('select $2=any(pg_blocking_pids($1)) blocked,query_start<$3::timestamptz started_before_expiry from pg_stat_activity where pid=$1',[replay.pid,holder.pid,expiresAt])).rows[0];
  if(evidence?.blocked){assert.equal(evidence.started_before_expiry,true);observed=true;break;}await delay(10);
 }
 assert.equal(observed,true,'real receipt RPC must block before expiration');
 let expired=false;
 while(Date.now()<deadline){expired=(await setup.query('select clock_timestamp()>=$1::timestamptz expired',[expiresAt])).rows[0].expired;if(expired)break;await delay(20);}
 assert.equal(expired,true,'server clock crosses expiry while RPC remains blocked');
 assert.ok((await setup.query('select pg_blocking_pids($1) ids',[replay.pid])).rows[0].ids.includes(holder.pid));
 console.log('EVIDENCE reservation replay started before expiry, blocked on actual account mutex, released after server expiry');
 await holder.query('commit');const result=await response;if(result.error)throw result.error;
 await replay.query('commit');
 assert.equal(result.value.rows[0].value.id,original.id,'receipt identity retained');
 assert.equal(result.value.rows[0].value.active,false,'expired reservation replay must use post-lock wall clock');
 await setup.query('begin');await as(setup,f.actor);
 assert.equal((await setup.query('select public.kh_get_agency_reservation($1,$2,$3) value',[f.actor,f.agency,f.property])).rows[0].value,null);
 assert.equal((await setup.query('select count(*)::int n from kh_private.property_reservations where property_id=$1',[f.property])).rows[0].n,1,'replay does not create a new reservation');
 await setup.query('commit');console.log('PASS reservation_receipt_expiry_after_lock_wait (actual create/replay/get RPCs)');
}finally{
 await Promise.allSettled(clients.map(db=>db.query('rollback')));await Promise.allSettled(pending);await Promise.allSettled(clients.map(db=>db.end()));
 if(created){
  assert.match(scratchName,/^kh_agency_test_resclock_[a-f0-9]{32}$/);
  assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
  await admin.query(`drop database ${quote(scratchName)}`);
  assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
 }
 await admin.end();assert.deepEqual(await sourceState(),before,'exact source baseline inventory');
 console.log('CLEANUP scratchDropped:true, sourceInventoryUnchanged:true');
}
