import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
import { inventory, pushStatus, version, sha256 } from './apply-android-push.mjs';

const seller='88100000-0000-4000-8000-000000000001';
const buyer='88100000-0000-4000-8000-000000000002';
const property='88100000-0000-4000-8000-000000000010';
const sellerSession='88100000-0000-4000-8000-000000000101';
const buyerSession='88100000-0000-4000-8000-000000000102';
const installation='88100000-0000-4000-8000-000000000201';
const secret='c'.repeat(64); // Synthetic fixture only; never a production installation secret.
const barrier='kh:push:test:881:transport';
const modes=['enable','disable','connectivity','exercise'].filter(mode=>process.argv.includes(`--${mode}`));
if(modes.length>1)throw new Error('Choose one verifier mode.');
const mode=modes[0]??'status';
const checks=[];
let baseline;
let cleanupNeeded=false;
let stage='connect';
function client() { const connection=createDatabaseClient(); connection.on('error',()=>{}); return connection; }
const db=client();
const capture=promise=>promise.then(value=>({value}),error=>({error}));
async function outcome(pending) { const result=await pending; if(result.error)throw result.error; return result.value; }
async function transaction(actor) {
  const connection=client();
  try {
    await connection.connect(); await connection.query('begin');
    await connection.query("set local statement_timeout='30s'");
    if(actor) {
      await connection.query('set local role authenticated');
      const session=actor===seller?sellerSession:buyerSession;
      await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [actor,JSON.stringify({sub:actor,session_id:session,role:'authenticated'})]);
    }
    return connection;
  } catch(error) { await connection.end().catch(()=>{}); throw error; }
}
async function closeTransaction(connection) {
  if(!connection)return;
  await connection.query('rollback').catch(()=>{});
  await connection.end().catch(()=>{});
}
async function rpc(actor,sql,values) {
  const connection=await transaction(actor);
  try { const result=(await connection.query(sql,values)).rows[0]?.result; await connection.query('commit'); return result; }
  finally { await closeTransaction(connection); }
}
async function pid(connection) { return (await connection.query('select pg_backend_pid() as pid')).rows[0].pid; }
async function waitBlocked(waiter,blocker) {
  for(let attempt=0;attempt<50;attempt++) {
    if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) as blocked',[waiter,blocker])).rows[0].blocked)return;
    await new Promise(done=>setTimeout(done,50));
  }
  throw new Error('Expected worker/registry lock contention was not observed.');
}
const registration=revision=>({installationId:installation,installationSecret:secret,revision,
  expoPushToken:'ExponentPushToken[kh_synthetic_concurrency]',platform:'android',projectId:'e054aea9-38b4-4211-826b-521b3cc0be9f'});
const register=input=>rpc(seller,'select public.kh_register_push_device($1,$2::jsonb) as result',[seller,JSON.stringify(input)]);
async function newNotice(conversation) {
  await db.query("update kh_private.push_outbox set state='cancelled',active_attempt_id=null where recipient_id=$1 and state not in('provider_accepted','cancelled','failed')",[seller]);
  await rpc(buyer,'select public.kh_send_message($1,$2,$3,$4) as result',[conversation,randomUUID(),'Mensaje sintético de verificación',buyer]);
  return (await db.query('select id from kh_private.notifications where conversation_id=$1 order by seq desc limit 1',[conversation])).rows[0].id;
}
async function mockTransport(connection,withBarrier) {
  await connection.query('create temporary table push_verifier_calls(kind text)');
  const wait=withBarrier?`perform pg_advisory_xact_lock(hashtextextended('${barrier}',0));`:'';
  await connection.query(`create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint
    language plpgsql security definer set search_path='' as $$ begin
      ${wait}
      insert into pg_temp.push_verifier_calls(kind) values(p_kind);
      return -881000001;
    end $$`);
  await connection.query('update kh_private.push_config set transport_enabled=true where singleton');
}
async function dispatchRace(name,sql,parameters) {
  let holder,worker,changer;
  try {
    holder=await transaction(); worker=await transaction(); changer=await transaction(seller);
    const holderPid=await pid(holder),workerPid=await pid(worker),changerPid=await pid(changer);
    await holder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[barrier]);
    await mockTransport(worker,true);
    const delivery=capture(worker.query('select kh_private.push_tick() as result'));
    await waitBlocked(workerPid,holderPid); // Worker passed eligibility and reached the mocked HTTP boundary.
    const mutation=capture(changer.query(sql,parameters));
    await waitBlocked(changerPid,workerPid); // Confirmation must not pass the dispatch boundary.
    await holder.query('rollback');
    const sent=(await outcome(delivery)).rows[0].result;
    assert.equal(sent.dispatched,1);
    assert.equal((await worker.query('select count(*)::int as count from push_verifier_calls')).rows[0].count,1);
    await worker.query('rollback'); // Restores HTTP implementation/config and discards the fake send.
    await outcome(mutation); await changer.query('commit');
    checks.push(`${name} waits until the dispatch transaction finishes`);
  } finally {
    await closeTransaction(holder); await closeTransaction(worker); await closeTransaction(changer);
  }
}
async function cleanupFixtures() {
  const connection=client();
  try {
    await connection.connect();
    await connection.query('delete from auth.users where id=any($1::uuid[])',[[seller,buyer]]);
    // Tombstones intentionally survive Auth deletion; remove only this verifier's reserved installation.
    await connection.query('delete from kh_private.push_devices where installation_id=$1',[installation]);
    const after=await inventory(connection);
    assert.deepEqual(after,baseline,'Push fixture cleanup or original-data preservation failed.');
    const status=await pushStatus(connection);
    assert.equal(status.transport_enabled,false,'Mock transport config escaped rollback.');
    console.log(JSON.stringify({result:process.exitCode?'android_push_failed_cleaned':'android_push_verified',version,sha256,checks,status,inventory:after}));
  } finally { await connection.end().catch(()=>{}); }
}
try {
  await db.connect();
  const applied=(await db.query('select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1',[version])).rows[0];
  assert.equal(applied?.sha256,sha256,'Deployed Android push checksum differs.');
  const status=await pushStatus(db);
  assert.equal(status.jobs.length,1); assert.equal(status.jobs[0].schedule,'30 seconds');
  assert.equal(status.jobs[0].command_matches,true); assert.equal(status.jobs[0].active,true);
  const acl=(await db.query("select has_function_privilege('anon','public.kh_register_push_device(uuid,jsonb)','EXECUTE') as anon_register,has_function_privilege('anon','public.kh_disable_push_device(uuid,text,integer)','EXECUTE') as anon_disable,has_function_privilege('authenticated','kh_private.push_tick()','EXECUTE') as member_worker,has_table_privilege('authenticated','kh_private.push_devices','SELECT') as device_select")).rows[0];
  assert.deepEqual(acl,{anon_register:false,anon_disable:true,member_worker:false,device_select:false});
  checks.push('deployed hash, one 30-second job and restricted grants');
  if(mode==='enable'||mode==='disable') {
    stage='transport_toggle';
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
    await db.query('update kh_private.push_config set transport_enabled=$1 where singleton',[mode==='enable']);
    await db.query('commit');
    const configuredAt=(await db.query('select clock_timestamp() as configured_at')).rows[0].configured_at;
    console.log(JSON.stringify({result:'android_push_transport_configured',version,sha256,configuredAt,status:await pushStatus(db)}));
  } else if(mode==='connectivity') {
    stage='empty_receipt_connectivity';
    // Autocommit is intentional: pg_net starts HTTP only after the queue insert commits.
    const requestId=(await db.query("select kh_private.push_http_post('receipt',$1::jsonb) as id",
      [JSON.stringify({ids:[]})])).rows[0].id;
    try {
      const deadline=Date.now()+30000;
      let response;
      while(Date.now()<deadline) {
        response=(await db.query('select status_code,content,timed_out,error_msg is not null as has_error from net._http_response where id=$1',[requestId])).rows[0];
        if(response)break;
        await new Promise(done=>setTimeout(done,500));
      }
      assert(response,'Supabase pg_net did not return the empty receipt response within 30 seconds.');
      assert.equal(response.timed_out,false,'Supabase pg_net receipt connectivity timed out.');
      assert.equal(response.has_error,false,'Supabase pg_net receipt connectivity failed.');
      assert.equal(response.status_code,200,'Expo empty receipt request did not succeed from Supabase.');
      let body;
      try { body=JSON.parse(response.content); } catch { throw new Error('Expo empty receipt response was not JSON.'); }
      assert.deepEqual(body.data,{});
      console.log(JSON.stringify({result:'expo_connectivity_verified',transport:'Supabase pg_net',httpStatus:response.status_code,recipientCount:0,pushesSent:0}));
    } finally {
      await db.query('delete from net._http_response where id=$1',[requestId]);
    }
  } else if(mode==='exercise') {
    stage='fixtures';
    assert.equal(status.transport_enabled,false,'Run synthetic concurrency before enabling real transport.');
    baseline=await inventory(db);
    assert.equal(baseline.pushFixtureUsers,0);
    assert.equal((await db.query('select count(*)::int as count from kh_private.push_devices where installation_id=$1',[installation])).rows[0].count,0);
    assert.equal((await db.query("select count(*)::int as count from kh_private.push_outbox where state not in('provider_accepted','cancelled','failed')")).rows[0].count,0,'Exercise requires no unrelated pending deliveries.');
    writeFileSync(new URL('../docs/android-push-concurrency-baseline.json',import.meta.url),JSON.stringify({sha256,inventory:baseline}));
    cleanupNeeded=true;
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'kh-push-race-seller@example.invalid','{}'),($2,'kh-push-race-buyer@example.invalid','{}')",[seller,buyer]);
    await db.query("insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values($1,$2,now(),now(),now()+interval '1 day'),($3,$4,now(),now(),now()+interval '1 day')",[sellerSession,seller,buyerSession,buyer]);
    await db.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values($1,$2,'push-concurrency','Casa sintética','Vedado','La Habana','Casa','Vivienda ficticia para probar despacho.',10000,80,2,1,$3,'approved')",[property,seller,['synthetic/push-concurrency.jpg']]);
    const conversation=(await rpc(buyer,'select public.kh_start_conversation($1,$2) as result',[property,buyer])).id;
    stage='registration_idempotency';
    const repeated=await Promise.all([register(registration(1)),register(registration(1))]);
    assert.deepEqual(repeated[0],repeated[1]);
    await Promise.allSettled([
      register(registration(1)),
      rpc(seller,'select public.kh_disable_push_device($1,$2,$3) as result',[installation,secret,2]),
    ]);
    assert.deepEqual((await db.query('select enabled,revision from kh_private.push_devices where installation_id=$1',[installation])).rows[0],{enabled:false,revision:2});
    await assert.rejects(register(registration(1)),/KH_PUSH_STALE/);
    await register(registration(3));
    checks.push('same-revision duplicate registration and delayed register versus disable preserve tombstone');

    stage='dispatch_block_race';
    await newNotice(conversation);
    await dispatchRace('block','select public.kh_set_user_block($1,true,$2)',[buyer,seller]);
    await rpc(seller,'select public.kh_set_user_block($1,false,$2)',[buyer,seller]);
    stage='dispatch_preference_race';
    await newNotice(conversation);
    await dispatchRace('preference change','select public.kh_save_notification_preferences($1,$2::jsonb)',
      [seller,JSON.stringify({messages:false,visits:true,offers:true,expectedVersion:0})]);
    await rpc(seller,'select public.kh_save_notification_preferences($1,$2::jsonb)',
      [seller,JSON.stringify({messages:true,visits:true,offers:true,expectedVersion:1})]);
    stage='dispatch_read_race';
    const notice=await newNotice(conversation);
    await dispatchRace('mark read','select public.kh_read_notification($1,$2)',[seller,notice]);

    stage='session_expiry_after_registry_wait';
    let holder,registrar;
    try {
      holder=await transaction(); registrar=await transaction(seller);
      const holderPid=await pid(holder),registrarPid=await pid(registrar);
      await holder.query("select pg_advisory_xact_lock(hashtextextended('kh:push:registry',0))");
      await db.query("update auth.sessions set not_after=clock_timestamp()+interval '4 seconds' where id=$1",[sellerSession]);
      const attempt=capture(registrar.query('select public.kh_register_push_device($1,$2::jsonb)',[seller,JSON.stringify(registration(3))]));
      await waitBlocked(registrarPid,holderPid);
      await db.query("select pg_sleep(greatest(0,extract(epoch from(not_after-clock_timestamp()))+0.1)) from auth.sessions where id=$1",[sellerSession]);
      await holder.query('rollback');
      const answer=await attempt;
      assert(answer.error); assert.match(answer.error.message,/KH_PUSH_SESSION_REQUIRED/);
      checks.push('registration rechecks session expiry after registry lock wait');
    } finally {
      await closeTransaction(holder); await closeTransaction(registrar);
      await db.query("update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=$1",[sellerSession]);
    }

    stage='lease_expiry_after_worker_wait';
    await newNotice(conversation);
    let leaseHolder,leaseWorker;
    try {
      leaseHolder=await transaction(); leaseWorker=await transaction();
      const holderPid=await pid(leaseHolder),workerPid=await pid(leaseWorker);
      await leaseHolder.query("select pg_advisory_xact_lock(hashtextextended('kh:push:registry',0))");
      await mockTransport(leaseWorker,false);
      const delivery=capture(leaseWorker.query('select kh_private.push_tick() as result'));
      await waitBlocked(workerPid,holderPid);
      await db.query("update kh_private.push_devices set expires_at=clock_timestamp()-interval '1 second' where installation_id=$1",[installation]);
      await leaseHolder.query('rollback');
      assert.equal((await outcome(delivery)).rows[0].result.dispatched,0);
      assert.equal((await leaseWorker.query('select count(*)::int as count from push_verifier_calls')).rows[0].count,0);
      checks.push('worker rechecks device lease after registry wait and emits no HTTP');
    } finally { await closeTransaction(leaseHolder); await closeTransaction(leaseWorker); }

    stage='worker_exclusion';
    const keeper=await transaction();
    try {
      await keeper.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
      assert.deepEqual((await db.query('select kh_private.push_tick() as result')).rows[0].result,{busy:true});
      checks.push('overlapping worker returns busy without dispatch');
    } finally { await closeTransaction(keeper); }
  } else {
    const health=(await db.query("select status,start_time,end_time from cron.job_run_details where jobid=$1 order by runid desc limit 3",[status.jobs[0].jobid])).rows;
    console.log(JSON.stringify({result:'android_push_status',version,sha256,status,health,checks}));
  }
} catch(error) {
  await db.query('rollback').catch(()=>{});
  console.error(JSON.stringify({result:'android_push_verification_failed',stage,code:error.code??'ERROR',message:error.message}));
  process.exitCode=1;
} finally {
  if(cleanupNeeded) {
    try { await cleanupFixtures(); }
    catch(error) { console.error(JSON.stringify({result:'android_push_cleanup_failed',code:error.code??'ERROR',message:error.message})); process.exitCode=1; }
  }
  await db.end().catch(()=>{});
}
