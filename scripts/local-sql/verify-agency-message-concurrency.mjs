import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';
import {createAgencyMessagingRepository} from '../../src/agencies/messaging/repository.ts';

// Focused Task8 regressions. Source is read-only; all instrumentation and writes
// occur in a fresh owned clone. Timing only bounds failure; pg_blocking_pids is
// the ordering evidence. No hosted configuration is loaded.
const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
const scratchName=`kh_agency_test_message_race_${randomUUID().replaceAll('-','')}`;
const quote=n=>`"${n.replaceAll('"','""')}"`;
const ids={owner:'45000000-0000-4000-8000-000000000001',buyer:'45000000-0000-4000-8000-000000000002',manager:'45000000-0000-4000-8000-000000000004',seller:'45000000-0000-4000-8000-000000000006',admin:'45000000-0000-4000-8000-000000000009'};
const choice=process.argv[2]??'all';
const reviewBase=process.argv[3]==='--review-base';
assert.ok(process.argv.length<=4||(process.argv.length===5&&reviewBase),'only optional --review-base is supported');
assert.ok(['all','opposing','owner-send','owner-start','block'].includes(choice),'usage: node verify-agency-message-concurrency.mjs [all|opposing|owner-send|owner-start|block]');
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const result=[];
 for(const {schemaname,tablename}of tables){const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quote(schemaname)}.${quote(tablename)} t`)).rows[0];result.push({schemaname,tablename,...state});}
 return result;
}
async function sourceState(){const db=new Client({connectionString:source.href});await db.connect();try{assert.equal((await db.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t,null);return await inventory(db)}finally{await db.end()}}
async function as(db,actor){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1||':session')::uuid)::text,true)",[actor])}
async function waiting(observer,pid,blockers){
 const until=Date.now()+8000;
 while(Date.now()<until){const r=(await observer.query('select pg_blocking_pids($1) blockers',[pid])).rows[0].blockers;const hit=r.find(p=>blockers.includes(p));if(hit)return hit;await delay(10)}
 throw Error(`Barrier not reached for backend ${pid}; deadline is failure, not proof`);
}
const before=await sourceState(),admin=new Client({connectionString:new URL('/postgres',source).href});await admin.connect();
let created=false;const clients=[];const outcomes=[];const failures=[];
try{
 assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0);
 await admin.query(`create database ${quote(scratchName)} template ${quote(sourceName)}`);created=true;
 async function client(){const c=new Client({connectionString:new URL(`/${scratchName}`,source).href});await c.connect();clients.push(c);await c.query("set statement_timeout='12s';set deadlock_timeout='100ms'");c.pid=(await c.query('select pg_backend_pid() id')).rows[0].id;return c}
 const setup=await client(),left=await client(),right=await client();
 const migrations=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of(await readdir(migrations)).filter(f=>/^20261007000[1-7]00_.*\.sql$/.test(f)&&(!reviewBase||!f.startsWith('20261007000700'))).sort()){
  const sql=reviewBase&&file.startsWith('20261007000600')?execFileSync('git',['show',`935912a66ae479c981e4af0ee3a3f9323856e1cb:supabase/migrations/${file}`],{encoding:'utf8'}):await readFile(new URL(file,migrations),'utf8');
  await setup.query(sql);console.log(`INSTALLED ${file}`);
 }
 if(reviewBase)console.log('REPRODUCTION review base 935912a (Task8 migration in scratch only)');
 await setup.query('begin');await setup.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql',import.meta.url),'utf8'));
 const agency=(await setup.query('select pg_temp.kh_agency_signup(9) id')).rows[0].id;
 await setup.query('select pg_temp.kh_agency_approve($1)',[agency]);
 await setup.query("insert into kh_private.agency_memberships(agency_id,user_id,role)values($1,$2,'manager')",[agency,ids.manager]);
 const property=randomUUID();await as(setup,ids.seller);
 await setup.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values($1::uuid,$2::uuid,$1::text,'Concurrency property','Vedado','La Habana','Casa',30000,2,1,'Local concurrent conversations fixture.','approved',$3)",[property,ids.seller,[`${ids.seller}/${property}/photo.jpg`]]);
 await as(setup,ids.admin);const request=(await setup.query('select public.kh_request_agency_mandate($1,$2,$3) value',[ids.admin,agency,{propertyId:property,internalReference:'RACE',clientRequestId:randomUUID()}])).rows[0].value;
 await as(setup,ids.seller);await setup.query('select public.kh_decide_agency_mandate($1,null,$2)',[ids.seller,{requestId:request.id,decision:'accept',expectedVersion:1,clientRequestId:randomUUID()}]);
 const conversations={};
 for(const actor of[ids.buyer,ids.owner]){await as(setup,actor);conversations[actor]=(await setup.query('select public.kh_start_agency_conversation($1,$2,$3) value',[actor,agency,{propertyId:property,preferredManagerId:ids.manager,clientRequestId:randomUUID()}])).rows[0].value.id}
 await as(setup,ids.owner);const personal=(await setup.query('select public.kh_start_conversation($1,$2) value',[property,ids.owner])).rows[0].value.id;await setup.query('commit');
 const send=(db,actor,conversation,staff=false)=>db.query('select public.kh_send_agency_message($1,$2,$3) value',[actor,staff?agency:null,{conversationId:conversation,body:'Concurrent message',clientMessageId:randomUUID(),clientRequestId:randomUUID()}]);
 function run(work){const outcome=work.then(value=>({value}),error=>({error}));outcomes.push(outcome);return outcome}
 async function finish(db,outcome){const r=await outcome;await db.query(r.error?'rollback':'commit');return r}
 async function expectGreen(label,work){try{await work();console.log(`PASS ${label} (actual RPCs completed)`)}catch(e){failures.push(`${label}: ${e.message}`);console.error(`FAIL ${label}: ${e.message}`)}finally{await left.query('rollback');await right.query('rollback');await setup.query('select pg_advisory_unlock_all()')}}
 if(choice==='all'||choice==='opposing')await expectGreen('opposing_agency_senders',async()=>{
  // Only scratch instrumentation: pause AFTER the real require_active prefix.
  // Fixed calls already own their entire sorted participant account set here.
  await setup.query("alter function kh_private.require_active() rename to race_original_require_active;create function kh_private.require_active() returns void language plpgsql security definer set search_path='' as $$begin perform kh_private.race_original_require_active();perform pg_advisory_xact_lock(hashtextextended('race:active:'||auth.uid()::text,0));end$$;revoke all on function kh_private.require_active() from public,anon,authenticated");
  for(const actor of[ids.buyer,ids.manager])await setup.query('select pg_advisory_lock(hashtextextended($1,0))',[`race:active:${actor}`]);
  await left.query('begin');await as(left,ids.buyer);const one=run(send(left,ids.buyer,conversations[ids.buyer]));
  await waiting(setup,left.pid,[setup.pid]);
  await right.query('begin');await as(right,ids.manager);const two=run(send(right,ids.manager,conversations[ids.buyer],true));
  const blockedBy=await waiting(setup,right.pid,[setup.pid,left.pid]);
  console.log(`EVIDENCE opposing: secondSenderBlockedBy=${blockedBy===left.pid?'first_sender_account_prefix':'its_own_actor_barrier'}`);
  await setup.query('select pg_advisory_unlock_all()');
  const results=await Promise.all([finish(left,one),finish(right,two)]);
  await setup.query('drop function kh_private.require_active();alter function kh_private.race_original_require_active() rename to require_active');
  const errors=results.flatMap(r=>r.error?[`${r.error.code}: ${r.error.message}`]:[]);
  assert.deepEqual(errors,[]);assert.equal(blockedBy,left.pid,'second sender must serialize on first sorted account prefix');
  assert.equal(new Set(results.map(r=>r.value.rows[0].value.seq)).size,2,'both sequence ACKs are distinct');
 });
 for(const kind of['send','start'])if(choice==='all'||choice===`owner-${kind}`)await expectGreen(`owner_personal_${kind}_vs_agency_send`,async()=>{
  // Insert a barrier immediately AFTER the actual legacy actor-lock statement,
  // leaving every production statement and relative acquisition order intact.
  const functionName=kind==='send'?'chat_store_message':'start_conversation_for_manager';
  const definition=(await setup.query("select pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kh_private' and p.proname=$1",[functionName])).rows;
  assert.equal(definition.length,1);const original=definition[0].body;
  const actorLock=`perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||${kind==='send'?'v_actor':'a'}::text,0));`;
  assert.equal(original.split(actorLock).length,2,'exact actual personal actor prefix');
  await setup.query(original.replace(actorLock,`${actorLock}\n perform pg_advisory_xact_lock(hashtextextended('race:personal-prefix',0));`));
  await setup.query("select pg_advisory_lock(hashtextextended('race:personal-prefix',0))");
  await left.query('begin');await as(left,ids.owner);
  const personalCall=run(kind==='send'?left.query('select public.kh_send_message($1,$2,$3,$4)',[personal,randomUUID(),'Personal owner message',ids.owner]):left.query('select public.kh_start_conversation($1,$2)',[property,ids.owner]));
  await waiting(setup,left.pid,[setup.pid]);
  await right.query('begin');await as(right,ids.owner);const agencySend=run(send(right,ids.owner,conversations[ids.owner]));
  await waiting(setup,right.pid,[left.pid]);
  console.log(`EVIDENCE owner-${kind}: actual personal RPC paused after actor lock; agency blocked by personal backend`);
  await setup.query('select pg_advisory_unlock_all()');
  const results=await Promise.all([finish(left,personalCall),finish(right,agencySend)]);
  await setup.query(original);
  assert.deepEqual(results.flatMap(r=>r.error?[`${r.error.code}: ${r.error.message}`]:[]),[]);
 });
 if(choice==='all'||choice==='block')await expectGreen('agency_only_repository_block_unblock',async()=>{
  // Execute the same repository method used by the screen against actual SQL.
  // This adapter checks pinned headers; it is not a real JWT/PostgREST test.
  const calls=[];
  const repo=createAgencyMessagingRepository({rpc(name,args){
   assert.ok(['kh_set_agency_conversation_block','kh_send_agency_message'].includes(name));calls.push(name);
   return {setHeader(key,value){assert.equal(key,'Authorization');assert.equal(value,`Bearer fixture:${args.p_actor_id}`);return this},async abortSignal(signal){
    assert.equal(signal.aborted,false);await left.query('begin');await as(left,args.p_actor_id);
    try{const data=(await left.query(`select public.${name}($1,$2,$3) value`,[args.p_actor_id,args.p_agency_id,args.p_payload])).rows[0].value;await left.query('commit');return {data,error:null}}
    catch(error){await left.query('rollback');return {data:null,error}}
   }};
  }});
  const context=(actor,staffAgency)=>({userId:actor,accessToken:`fixture:${actor}`,signal:new AbortController().signal,checkpoint(){},...(staffAgency?{agencyId:staffAgency,generation:1}:{})});
  const buyer=context(ids.buyer),staff=context(ids.manager,agency),conversationId=conversations[ids.buyer];
  const block=blocked=>({conversationId,otherUserId:ids.manager,blocked,clientRequestId:randomUUID()});
  const noPersonal=async()=>assert.equal((await setup.query('select count(*)::int n from public.kh_conversations where buyer_id=any($1::uuid[]) and seller_id=any($1::uuid[])',[[ids.buyer,ids.manager]])).rows[0].n,0);
  await noPersonal();const blocked=block(true);await repo.setBlocked(blocked,buyer);await repo.setBlocked(blocked,buyer);
  await assert.rejects(repo.setBlocked({...blocked,blocked:false},buyer),/KH_AGENCY_REQUEST_CONFLICT/);
  await assert.rejects(repo.send({conversationId,body:'Blocked staff',clientMessageId:randomUUID()},staff),/KH_CHAT_BLOCKED/);
  await assert.rejects(repo.send({conversationId,body:'Blocked buyer',clientMessageId:randomUUID()},buyer),/KH_CHAT_BLOCKED/);
  await repo.setBlocked(block(false),buyer);
  await repo.send({conversationId,body:'Buyer unblocked',clientMessageId:randomUUID()},buyer);
  await repo.send({conversationId,body:'Staff unblocked',clientMessageId:randomUUID()},staff);
  const staffBlock={conversationId,otherUserId:ids.buyer,blocked:true,clientRequestId:randomUUID()};
  await assert.rejects(repo.setBlocked(staffBlock,context(ids.manager,randomUUID())),/KH_AGENCY_DEAL_NOT_FOUND/);
  await repo.setBlocked(staffBlock,staff);
  await left.query('begin');await as(left,ids.admin);await left.query('select public.kh_remove_agency_member($1,$2,$3)',[ids.admin,agency,{userId:ids.manager,expectedVersion:1,clientRequestId:randomUUID()}]);await left.query('commit');
  await assert.rejects(repo.setBlocked(staffBlock,staff),/KH_AGENCY_DEAL_NOT_FOUND/);
  await noPersonal();assert.ok(calls.includes('kh_set_agency_conversation_block'));
 });
}finally{
 // Wait bounds are failure only. Closing our own sessions releases all locks.
 for(const c of clients)await admin.query('select pg_cancel_backend($1)',[c.pid]).catch(()=>{});
 await Promise.allSettled(outcomes);
 for(const c of clients){await c.query('rollback').catch(()=>{});await c.query('select pg_advisory_unlock_all()').catch(()=>{});await c.end()}
 if(created){await admin.query(`drop database ${quote(scratchName)}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratchName])).rowCount,0)}
 await admin.end();assert.deepEqual(await sourceState(),before,'exact source baseline inventory');
 console.log('CLEANUP scratchDropped:true, sourceInventoryUnchanged:true');
}
assert.deepEqual(failures,[],'all focused concurrency cases must complete without deadlock/timeouts');
