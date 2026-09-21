import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDatabaseClient} from './cloud-db.mjs';
import {inventory,version,sha256} from './apply-negotiations.mjs';
const db=createDatabaseClient();
const buyer='66100000-0000-4000-8000-000000000001',seller='66100000-0000-4000-8000-000000000002';
const propertyId='66100000-0000-4000-8000-000000000003';
let stage='connect';let cleanupNeeded=false;let baseline;const checks=[];
async function actorSession(actor){
  const client=createDatabaseClient();await client.connect();await client.query('begin');
  await client.query("set local statement_timeout='20s'");await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role:'authenticated'})]);
  return client;
}
async function rpc(actor,name,payload){
  const client=await actorSession(actor);
  try{const result=(await client.query(`select public.${name}($1::uuid,$2::jsonb) as result`,[actor,JSON.stringify(payload)])).rows[0].result;await client.query('commit');return result;}
  catch(error){await client.query('rollback').catch(()=>{});throw error;}
  finally{await client.end();}
}
const create=(actor,payload)=>rpc(actor,'kh_create_negotiation',payload);
const respond=(actor,item,action)=>rpc(actor,'kh_respond_negotiation',{id:item.id,action,expectedVersion:item.version,clientRequestId:randomUUID()});
function oneWinner(results,expectedError){
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1,'Exactly one concurrent action must succeed.');
  const failure=results.find(item=>item.status==='rejected');assert.match(failure.reason.message,expectedError);
  return results.find(item=>item.status==='fulfilled').value;
}
try{
  await db.connect();
  const applied=(await db.query('select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1',[version])).rows[0];
  assert.equal(applied?.sha256,sha256,'Deployed negotiations checksum differs.');
  const acl=(await db.query("select has_function_privilege('anon','public.kh_create_negotiation(uuid,jsonb)','EXECUTE') as anon_create,has_function_privilege('authenticated','public.kh_create_negotiation(uuid,jsonb)','EXECUTE') as member_create,has_table_privilege('authenticated','public.kh_negotiations','UPDATE') as direct_update")).rows[0];
  assert.deepEqual(acl,{anon_create:false,member_create:true,direct_update:false});checks.push('deployed checksum and grants');
  baseline=await inventory(db);
  if(process.argv.includes('--exercise')){
    assert.equal(baseline.fixtureUsers,0,'Reserved SQL actors already exist.');
    cleanupNeeded=true;stage='fixtures';
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'kh-neg-concurrent-buyer@example.invalid','{}'),($2,'kh-neg-concurrent-seller@example.invalid','{}')",[buyer,seller]);
    await db.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values($1,$2,'neg-concurrency','Casa de prueba concurrente','Vedado','La Habana','Casa','Anuncio ficticio de verificación concurrente.',10000,80,2,1,$3,'approved')",[propertyId,seller,[`${seller}/neg-concurrency/photo.jpg`]]);
    const client=await actorSession(buyer);let conversationId;
    try{conversationId=(await client.query('select public.kh_start_conversation($1,$2) as result',[propertyId,buyer])).rows[0].result.id;await client.query('commit');}finally{await client.end();}
    const offer=(request=randomUUID())=>({conversationId,kind:'offer',clientRequestId:request,note:'',amountUsd:'9000.25'});
    stage='same_request_concurrency';
    const payload=offer();const repeated=await Promise.all([create(buyer,payload),create(buyer,payload)]);
    assert.deepEqual(repeated[0],repeated[1]);assert.equal((await db.query('select last_seq from public.kh_conversations where id=$1',[conversationId])).rows[0].last_seq,1);checks.push('simultaneous identical requests create one proposal and one message');
    stage='accept_withdraw_race';
    let winner=oneWinner(await Promise.allSettled([respond(seller,repeated[0],'accept'),respond(buyer,repeated[0],'cancel')]),/KH_NEG_VERSION_CONFLICT/);
    assert.equal(winner.version,2);if(winner.status==='accepted')await respond(buyer,winner,'cancel');checks.push('accept versus withdraw has one versioned winner');
    stage='counter_withdraw_race';
    const initial=await create(buyer,offer());
    winner=oneWinner(await Promise.allSettled([create(seller,{...offer(),replacesId:initial.id,expectedVersion:1,amountUsd:'9500'}),respond(buyer,initial,'cancel')]),/KH_NEG_VERSION_CONFLICT/);
    if(winner.status==='pending')await respond(seller,winner,'cancel');checks.push('counterproposal versus withdraw is atomic');
    stage='one_pending_visits';
    const future=(await db.query("select to_char((clock_timestamp() at time zone 'America/Havana')+interval '2 days','YYYY-MM-DD') as date")).rows[0].date;
    const visit=()=>({conversationId,kind:'visit',clientRequestId:randomUUID(),note:'',visitDate:future,visitTime:'10:00'});
    winner=oneWinner(await Promise.allSettled([create(buyer,visit()),create(seller,visit())]),/KH_NEG_PENDING_EXISTS/);
    await respond(winner.createdBy,winner,'cancel');checks.push('two participants cannot create simultaneous pending visits');
    stage='expiry_after_property_lock';
    const expiring=await create(buyer,offer());
    const blocker=createDatabaseClient();await blocker.connect();
    const responder=await actorSession(seller);
    let answer;
    try{
      await blocker.query('begin');await blocker.query('select id from public.properties where id=$1 for update',[propertyId]);
      await db.query("update public.kh_negotiations set expires_at=clock_timestamp()+interval '4 seconds' where id=$1",[expiring.id]);
      const pid=(await responder.query('select pg_backend_pid() as pid')).rows[0].pid;
      const response=responder.query('select public.kh_respond_negotiation($1,$2::jsonb) as result',[seller,JSON.stringify({id:expiring.id,action:'accept',expectedVersion:1,clientRequestId:randomUUID()})]).then(value=>({ok:true,value}),error=>({ok:false,error}));
      for(let attempt=0;attempt<15;attempt++){
        const waiting=(await db.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;
        if(waiting){checks.push('response observed waiting for property row lock');break;}
        if(attempt===14)throw new Error('Response did not wait on property lock.');
        await new Promise(done=>setTimeout(done,50));
      }
      await db.query("select pg_sleep(greatest(0,extract(epoch from (expires_at-clock_timestamp()))+0.1)) from public.kh_negotiations where id=$1",[expiring.id]);
      await blocker.query('commit');answer=await response;
      assert.equal(answer.ok,false,'Response must not accept using the pre-wait clock.');assert.match(answer.error.message,/KH_NEG_EXPIRED/);
      checks.push('expiry is rechecked after property lock wait');
    }finally{await blocker.query('rollback').catch(()=>{});await responder.query('rollback').catch(()=>{});await blocker.end();await responder.end();}
  }
  stage='rest';
  const env=Object.fromEntries(readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
  const response=await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/kh_list_negotiations`,{method:'POST',headers:{apikey:env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_actor_id:buyer}),signal:AbortSignal.timeout(20000)});
  assert([401,403].includes(response.status),'Anonymous REST negotiation RPC must be denied.');checks.push('anonymous REST denied');
}catch(error){console.error(JSON.stringify({result:'negotiations_verification_failed',stage,code:error.code??'ERROR',message:error.message}));process.exitCode=1;}
finally{
  try{
    if(cleanupNeeded)await db.query('delete from auth.users where id=any($1::uuid[])',[ [buyer,seller] ]);
    if(baseline){const after=await inventory(db);assert.deepEqual(after,baseline,'Fixture cleanup or baseline conservation failed.');console.log(JSON.stringify({result:process.exitCode?'negotiations_failed_cleaned':'negotiations_verified',version,sha256,checks,inventory:after}));}
  }catch(error){console.error(JSON.stringify({result:'negotiations_cleanup_failed',message:error.message}));process.exitCode=1;}
  await db.end();
}
