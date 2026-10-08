import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';

// Task12's four clock barriers only. Each case owns a disposable local clone;
// every provider request is replaced inside that clone before any worker runs.
const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const quote=name=>`"${name.replaceAll('"','""')}"`;
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const rows=[];
 for(const {schemaname,tablename}of tables){
  const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quote(schemaname)}.${quote(tablename)} t`)).rows[0];
  rows.push({schemaname,tablename,...state});
 }
 return rows;
}
async function sourceState(){
 const db=new Client({connectionString:source.href});await db.connect();
 try{assert.equal((await db.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t,null);return await inventory(db)}finally{await db.end()}
}
const before=await sourceState();
async function runCase(kind,phase){
 const name=`${kind}_${phase}`,scratchName=`kh_agency_test_noticeclock_${randomUUID().replaceAll('-','')}`;
 const admin=new Client({connectionString:new URL('/postgres',source).href});await admin.connect();
 let created=false;const clients=[],pending=[];
 try{
  assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
  await admin.query(`create database ${quote(scratchName)} template ${quote(sourceName)}`);created=true;
  assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
  async function client(){
   const db=new Client({connectionString:new URL(`/${scratchName}`,source).href});await db.connect();clients.push(db);
   await db.query("set statement_timeout='12s'");db.pid=(await db.query('select pg_backend_pid() pid')).rows[0].pid;return db;
  }
  const setup=await client(),holder=await client(),worker=await client();
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>/^20261007\d{6}_.*\.sql$/.test(f)&&f.slice(0,14)<='20261007001000').sort())await setup.query(await readFile(new URL(file,migrations),'utf8'));
  await setup.query(`create table kh_private.agency_clock_transport(id bigint generated always as identity,kind text,payload jsonb);
   create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$declare id bigint;begin insert into kh_private.agency_clock_transport(kind,payload)values(p_kind,p_payload)returning agency_clock_transport.id into id;return id;end$$;`);
  await setup.query('begin');
  for(const file of ['agency_fixture.sql','agency_scheduling_fixture.sql'])await setup.query(await readFile(new URL(`../../supabase/tests/helpers/${file}`,import.meta.url),'utf8'));
  const f=(await setup.query('select pg_temp.schedule_fixture(97) f')).rows[0].f;
  await setup.query('select kh_private.push_tick()'); // Drain initial review/assignment events with transport disabled.
  let subject,event,recipient;
  if(kind==='visit'){
   const proposal=(await setup.query("select pg_temp.visit_proposal($1,$2,$3,date_trunc('minute',clock_timestamp()+interval '3 days')) p",[f.actor,f.agency,f.deal])).rows[0].p;
   await setup.query('select pg_temp.accept_visit($1,$2,$3)',[f.actor,f.agency,proposal]);
   subject=proposal.id;recipient=f.actor;
  }else{
   recipient='45000000-0000-4000-8000-000000000002';
   const invitation=(await setup.query('select public.kh_invite_agency_member($1,$2,$3) i',[f.actor,f.agency,{userId:recipient,role:'manager',clientRequestId:randomUUID()}])).rows[0].i;
   subject=invitation.id;
   event=(await setup.query("select id from kh_private.agency_events where kind='team_invitation' and subject_id=$1",[subject])).rows[0].id;
  }
  const device=randomUUID();
  await setup.query(`insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,expo_push_token,token_hash,enabled,expires_at,supports_agency_notifications)
   values($1,decode(repeat('aa',32),'hex'),1,'register',decode('aa','hex'),$2::uuid,md5(($2::uuid)::text||':session')::uuid,$3,decode('aa','hex'),true,clock_timestamp()+interval '1 day',true)`,[device,recipient,`ExpoPushToken[${device.replaceAll('-','')}]`]);
  const expiresAt=(await setup.query("select clock_timestamp()+interval '2 seconds' expiry")).rows[0].expiry.toISOString();
  if(kind==='visit'){
   await setup.query("update kh_private.property_visit_slots set starts_at=$2,ends_at=$2::timestamptz+interval '1 hour' where proposal_id=$1",[subject,expiresAt]);
   event=(await setup.query("insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id)values($1,$2,'visit_2h',$3::timestamptz-interval '2 hours',$4)returning id",[subject,f.deal,expiresAt,recipient])).rows[0].id;
  }else await setup.query('update kh_private.agency_invitations set expires_at=$2 where id=$1',[subject,expiresAt]);
  if(phase==='dispatch'){
   await setup.query('select kh_private.push_tick()');
   assert.equal((await setup.query('select count(*)::int n from kh_private.push_outbox o join kh_private.notifications n on n.id=o.notification_id where n.agency_event_id=$1',[event])).rows[0].n,1,'a real eligible notice is queued before expiry');
  }
  await setup.query('update kh_private.push_config set transport_enabled=true');await setup.query('commit');
  await holder.query('begin');
  if(phase==='materialization')await holder.query("select pg_advisory_xact_lock(hashtextextended('kh:account:'||$1::text,0))",[recipient]);
  else await holder.query('select kh_private.push_registry_lock()');
  await worker.query('begin');
  const response=worker.query('select kh_private.push_tick() value').then(value=>({value}),error=>({error}));pending.push(response);
  let evidence;const deadline=Date.now()+8000;
  while(Date.now()<deadline){
   const row=(await setup.query('select $2=any(pg_blocking_pids($1)) blocked,query_start,query_start<$3::timestamptz started_before_expiry from pg_stat_activity where pid=$1',[worker.pid,holder.pid,expiresAt])).rows[0];
   if(row?.blocked){assert.equal(row.started_before_expiry,true);evidence=row;break}await delay(10);
  }
  assert.ok(evidence,`${name}: actual worker must be observed blocked before expiry`);
  let expired=false,serverTime;
  while(Date.now()<deadline){
   const row=(await setup.query('select clock_timestamp() server_time,clock_timestamp()>=$1::timestamptz expired',[expiresAt])).rows[0];
   if(row.expired){expired=true;serverTime=row.server_time;break}await delay(20);
  }
  assert.ok(expired,'server clock must cross expiry before releasing the blocker');
  assert.ok((await setup.query('select pg_blocking_pids($1) ids',[worker.pid])).rows[0].ids.includes(holder.pid));
  console.log(`EVIDENCE ${name}: ${JSON.stringify({queryStart:evidence.query_start,expiresAt,serverTime,blockedBy:holder.pid,workerPid:worker.pid})}`);
  await holder.query('commit');const result=await response;if(result.error)throw result.error;await worker.query('commit');
  const sent=(await setup.query('select count(*)::int n from kh_private.agency_clock_transport')).rows[0].n;
  const notices=(await setup.query('select count(*)::int n from kh_private.notifications where agency_event_id=$1',[event])).rows[0].n;
  const failures=[];
  if(sent!==0)failures.push(`expired transport sent ${sent}`);
  if(phase==='materialization'){
   if(notices!==0)failures.push(`expired event materialized ${notices}`);
   if(result.value.rows[0].value.retry!==true)failures.push('changed postwait candidate set did not remain pending for retry');
  }
  await setup.query('select kh_private.push_tick()');
  if(phase==='materialization'){
   const state=(await setup.query('select delivery_state from kh_private.agency_events where id=$1',[event])).rows[0]?.delivery_state;
   if(state!=='cancelled')failures.push(`next-tick ineligible event state ${state}`);
  }else{
   const state=(await setup.query('select o.state from kh_private.push_outbox o join kh_private.notifications n on n.id=o.notification_id where n.agency_event_id=$1',[event])).rows[0].state;
   if(state!=='cancelled')failures.push(`pre-send expired outbox state ${state}`);
   assert.equal(notices,1,'authorized saved history remains, independently from expired transport');
  }
  assert.deepEqual(failures,[],name);
  console.log(`PASS ${name} expiry across actual worker lock wait`);
 }finally{
  await Promise.allSettled(clients.map(db=>db.query('rollback')));await Promise.allSettled(pending);await Promise.allSettled(clients.map(db=>db.end()));
  if(created){
   assert.match(scratchName,/^kh_agency_test_noticeclock_[a-f0-9]{32}$/);
   assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratchName])).rows[0].owned,true);
   await admin.query(`drop database ${quote(scratchName)}`);
   assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
  }
  await admin.end();assert.deepEqual(await sourceState(),before,'exact source baseline inventory');
  console.log(`CLEANUP ${name}: ownedScratchDropped:true, sourceInventoryUnchanged:true`);
 }
}
let failed=false;
for(const kind of ['visit','invitation'])for(const phase of ['materialization','dispatch']){
 try{await runCase(kind,phase)}catch(error){failed=true;console.error(`FAIL ${kind}_${phase}: ${error.message}`)}
}
if(failed)process.exitCode=1;
