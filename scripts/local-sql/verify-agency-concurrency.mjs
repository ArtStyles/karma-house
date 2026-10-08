import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';

const source=fixtureDatabaseUrl(),sourceName=source.pathname.slice(1);
assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const quote=v=>`"${v.replaceAll('"','""')}"`,uid=n=>`45000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),buyer=uid(2),manager=uid(8),coordinator=uid(6);
const sql=async(db,q,p=[]) => (await db.query(q,p)).rows[0];
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
 const result=[];
 for(const {schemaname,tablename}of tables)result.push({schemaname,tablename,...await sql(db,`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quote(schemaname)}.${quote(tablename)} t`)});
 return result;
}
async function sourceState(){const db=new Client({connectionString:source.href});await db.connect();try{assert.equal((await sql(db,"select to_regclass('kh_private.agency_settings') t")).t,null);return await inventory(db)}finally{await db.end()}}
const before=await sourceState();
async function as(db,actor){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);}
const operation=(actor,query,params=[],role='authenticated')=>({actor,query,params,role});
async function invoke(db,op){await as(db,op.actor);await db.query(`set local role ${op.role}`);return (await db.query(op.query,op.params)).rows[0]?.value;}
function success(result){if(result.error)throw result.error;return result.value;}
function rejection(result,pattern){assert.ok(result.error,'expected endpoint rejection');assert.doesNotMatch(result.error.message,/timeout|deadlock/i);assert.match(result.error.message,pattern);}
async function runCase(name,body){
 const scratch=`kh_agency_test_race_${randomUUID().replaceAll('-','')}`,admin=new Client({connectionString:new URL('/postgres',source).href});
 await admin.connect();const clients=[],pending=[];let created=false;
 try{
  assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratch])).rowCount,0);
  await admin.query(`create database ${quote(scratch)} template ${quote(sourceName)}`);created=true;
  assert.equal((await sql(admin,'select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratch])).owned,true);
  async function client(){const db=new Client({connectionString:new URL(`/${scratch}`,source).href});await db.connect();clients.push(db);await db.query("set lock_timeout='7s';set statement_timeout='11s'");return db;}
  const db=await client(),left=await client(),right=await client();
  const root=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(root)).filter(f=>/^20261007\d{6}_.*\.sql$/.test(f)).sort())await db.query(await readFile(new URL(file,root),'utf8'));
  assert.equal((await sql(db,'select enabled from kh_private.agency_settings')).enabled,false);
  // Absolutely no provider endpoint: transport is stubbed before the first tick.
  await db.query(`create table kh_private.race_transport(id bigint generated always as identity,kind text,payload jsonb);
   create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$declare id bigint;begin insert into kh_private.race_transport(kind,payload)values(p_kind,p_payload)returning race_transport.id into id;return id;end$$;`);
  await db.query('begin');
  for(const file of ['helpers/agency_fixture.sql','helpers/agency_scheduling_fixture.sql','agency_concurrency.sql'])await db.query(await readFile(new URL(`../../supabase/tests/${file}`,import.meta.url),'utf8'));
  const f=(await sql(db,'select pg_temp.schedule_fixture(97) f')).f;await db.query('commit');
  async function setup(query,params=[],actor){await db.query('begin');try{if(actor)await as(db,actor);const r=await sql(db,query,params);await db.query('commit');return r}catch(e){await db.query('rollback');throw e}}
  async function blocked(waiter,holder){
   const end=Date.now()+5000;while(Date.now()<end){const r=await sql(db,'select pg_blocking_pids($1) pids',[waiter.processID]);if(r.pids.includes(holder.processID)){console.log(`BARRIER ${name}: waiter=${waiter.processID} blocker=${holder.processID}`);return}await delay(10)}
   throw Error(`${name}: expected actual pg_blocking_pids barrier`);
  }
  async function race(first,second){
   await left.query('begin');const one=await invoke(left,first);
   await right.query('begin');const result=invoke(right,second).then(value=>({value}),error=>({error}));pending.push(result);
   await blocked(right,left);await left.query('commit');const two=await result;await right.query(two.error?'rollback':'commit');return [{value:one},two];
  }
  await body({db,left,right,setup,blocked,race,f,pending});
  await db.query('update kh_private.agency_settings set enabled=false');
  assert.equal((await sql(db,'select enabled from kh_private.agency_settings')).enabled,false);
  console.log(`PASS ${name}`);
 }finally{
  await Promise.allSettled(clients.map(db=>db.query('rollback')));await Promise.allSettled(pending);await Promise.allSettled(clients.map(db=>db.end()));
  if(created){assert.match(scratch,/^kh_agency_test_race_[a-f0-9]{32}$/);assert.equal((await sql(admin,'select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[scratch])).owned,true);await admin.query(`drop database ${quote(scratch)}`);assert.equal((await admin.query('select 1 from pg_database where datname=$1',[scratch])).rowCount,0)}
  await admin.end();assert.deepEqual(await sourceState(),before);console.log(`CLEANUP ${name}: ownedScratchDropped:true, inventoryUnchanged:true`);
 }
}
async function sale(ctx,f=ctx.f){const r=(await ctx.setup('select pg_temp.race_sale_request($1) r',[f])).r;const decision=(await sql(ctx.db,'select pg_temp.race_decision($1) d',[r])).d;return operation(f.source??f.actor,f.source?'select public.kh_decide_personal_sale($1,$2) value':'select public.kh_decide_agency_sale($1,$2,$3) value',f.source?[f.source,decision]:[f.actor,f.agency,decision]);}
async function sold(ctx,f=ctx.f){assert.equal((await sql(ctx.db,'select availability from public.properties where id=$1',[f.property])).availability,'sold');assert.equal((await sql(ctx.db,'select count(*)::int n from kh_private.property_sale_closures where property_id=$1',[f.property])).n,1);assert.equal((await sql(ctx.db,"select count(*)::int n from kh_private.agency_deals where property_id=$1 and closed_reason is null",[f.property])).n,0);assert.equal((await sql(ctx.db,"select count(*)::int n from kh_private.property_visit_slots where property_id=$1 and starts_at>clock_timestamp() and outcome='unrecorded'",[f.property])).n,0);}
async function visit(ctx,f=ctx.f){return (await ctx.setup("select pg_temp.visit_proposal($1,$2,$3,date_trunc('minute',clock_timestamp()+interval '3 days')) p",[f.actor,f.agency,f.deal])).p;}
const accept=(f,p)=>operation(f.actor,'select public.kh_respond_agency_proposal($1,$2,$3) value',[f.actor,f.agency,{proposalId:p.id,expectedVersion:p.version,action:'accept',externalResponse:{channel:'phone',reference:'Confirmación privada'},clientRequestId:randomUUID()}]);
const cases=[];const add=(name,fn)=>cases.push([name,fn]);
add('sale_vs_sale',async c=>{const a=await sale(c),b=await sale(c);const [x,y]=await c.race(a,b);success(x);rejection(y,/^KH_AGENCY_SALE_STALE$/);await sold(c)});
add('closure_response_lost_replay',async c=>{const a=await sale(c);const [x,y]=await c.race(a,a);assert.deepEqual(success(y),success(x));await sold(c)});
for(const first of ['sale','write'])add(`sale_vs_visit_accept_${first}_first`,async c=>{const p=await visit(c),s=await sale(c),v=accept(c.f,p);const [x,y]=await c.race(first==='sale'?s:v,first==='sale'?v:s);success(x);if(first==='sale')rejection(y,/KH_NEG_VERSION_CONFLICT/);else{
 // Acceptance increments the winning deal version; the prepared sale must fail atomically.
 rejection(y,/KH_AGENCY_SALE_STALE/);assert.equal((await sql(c.db,'select availability from public.properties where id=$1',[c.f.property])).availability,'active');
 const refreshed=await sale(c);await c.left.query('begin');await invoke(c.left,refreshed);await c.left.query('commit');
 }await sold(c);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.agency_proposals where id=$1',[p.id])).n,1)});
for(const first of ['sale','write'])add(`sale_vs_message_${first}_first`,async c=>{
 const conv=await c.setup('select public.kh_start_agency_conversation($1,$2,$3) value',[buyer,c.f.agency,{propertyId:c.f.property,clientRequestId:randomUUID()}],buyer);
 const s=await sale(c),m=operation(buyer,'select public.kh_send_agency_message($1,null,$2) value',[buyer,{conversationId:conv.value.id,body:'Mensaje histórico de carrera',clientMessageId:randomUUID(),clientRequestId:randomUUID()}]);
 const [x,y]=await c.race(first==='sale'?s:m,first==='sale'?m:s);success(x);if(first==='sale')rejection(y,/KH_AGENCY_CONVERSATION_CLOSED/);else success(y);await sold(c);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.agency_messages where conversation_id=$1',[conv.value.id])).n,first==='sale'?0:1);
});

for(const first of ['sale','write'])add(`sale_vs_personal_negotiation_cancel_${first}_first`,async c=>{
 const f=(await c.setup('select pg_temp.race_personal($1,$2) f',[c.f,uid(5)])).f;
 const conv=(await c.setup('select public.kh_start_conversation_for_manager($1,$2,$3) value',[f.property,buyer,f.source],buyer)).value;
 const p=(await c.setup("select public.kh_create_negotiation($1,jsonb_build_object('conversationId',$2::uuid,'kind','visit','visitDate',to_char(clock_timestamp()+interval '4 days','YYYY-MM-DD'),'visitTime','12:00','note','Acuerdo histórico','clientRequestId',gen_random_uuid())) value",[buyer,conv.id],buyer)).value;
 await c.setup('select public.kh_respond_negotiation($1,$2) value',[f.source,{id:p.id,action:'accept',expectedVersion:1,clientRequestId:randomUUID()}],f.source);
 const s=await sale(c,f),cancel=operation(f.source,'select public.kh_respond_negotiation($1,$2) value',[f.source,{id:p.id,action:'cancel',expectedVersion:2,clientRequestId:randomUUID()}]);
 const [x,y]=await c.race(first==='sale'?s:cancel,first==='sale'?cancel:s);success(x);if(first==='sale')rejection(y,/KH_NEG_VERSION_CONFLICT/);else success(y);await sold(c,f);
 assert.equal((await sql(c.db,'select status from public.kh_negotiations where id=$1',[p.id])).status,'cancelled');assert.equal((await sql(c.db,'select count(*)::int n from public.kh_conversations where id=$1',[conv.id])).n,1);
});
async function assignManager(c){
 await c.setup("insert into kh_private.agency_memberships(agency_id,user_id,role)values($1,$2,'manager'),($1,$3,'coordinator')",[c.f.agency,manager,coordinator]);
 await c.setup('select public.kh_assign_agency_deal($1,$2,$3) value',[c.f.actor,c.f.agency,{dealId:c.f.deal,userId:manager,expectedVersion:1,clientRequestId:randomUUID()}],c.f.actor);
}
const remove=f=>operation(f.actor,'select public.kh_remove_agency_member($1,$2,$3) value',[f.actor,f.agency,{userId:manager,expectedVersion:1,clientRequestId:randomUUID()}]);
for(const first of ['sale','write'])add(`sale_vs_member_removal_${first}_first`,async c=>{
 await assignManager(c);const s=await sale(c),r=remove(c.f);const [x,y]=await c.race(first==='sale'?s:r,first==='sale'?r:s);success(x);
 if(first==='sale'){success(y);await sold(c)}else{rejection(y,/KH_AGENCY_SALE_STALE/);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.property_sale_closures')).n,0)}
 assert.equal((await sql(c.db,'select state from kh_private.agency_memberships where agency_id=$1 and user_id=$2',[c.f.agency,manager])).state,'removed');
});
for(const first of ['sale','write'])add(`sale_vs_mandate_withdrawal_${first}_first`,async c=>{
 const b=(await c.setup('select pg_temp.race_collaborator($1) b',[c.f])).b;
 const r=(await c.setup('select pg_temp.race_sale_request($1) r',[b])).r,d=(await sql(c.db,'select pg_temp.race_decision($1) d',[r])).d;
 const s=operation(c.f.actor,'select public.kh_decide_agency_sale($1,$2,$3) value',[c.f.actor,c.f.agency,d]);
 const w=operation(b.actor,'select public.kh_withdraw_agency_mandate($1,$2,$3) value',[b.actor,b.agency,{propertyId:b.property,requestingAgencyId:b.agency,expectedVersion:1,clientRequestId:randomUUID()}]);
 const [x,y]=await c.race(first==='sale'?s:w,first==='sale'?w:s);success(x);if(first==='sale'){success(y);await sold(c)}else{rejection(y,/KH_AGENCY_SALE_STALE/);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.property_sale_closures')).n,0)}
});
for(const kind of ['visit_vs_visit_other_agency','same_manager_other_property'])add(kind,async c=>{
 let b;
 if(kind==='visit_vs_visit_other_agency')b=(await c.setup('select pg_temp.race_collaborator($1) b',[c.f])).b;
 else{
  b=(await c.setup('select pg_temp.schedule_fixture(98) b')).b;
  await c.setup("insert into kh_private.agency_memberships(agency_id,user_id,role)values($1,$3,'manager'),($2,$3,'manager')",[c.f.agency,b.agency,manager]);
  for(const f of [c.f,b])await c.setup('select public.kh_assign_agency_deal($1,$2,$3) value',[f.actor,f.agency,{dealId:f.deal,userId:manager,expectedVersion:1,clientRequestId:randomUUID()}],f.actor);
 }
 const p=await visit(c),q=await visit(c,b),[x,y]=await c.race(accept(c.f,p),accept(b,q));success(x);rejection(y,/^KH_AGENCY_VISIT_CONFLICT$/);
 assert.equal((await sql(c.db,"select count(*)::int n from kh_private.property_visit_slots where outcome='unrecorded'")).n,1);
});

async function verification(c,decision){const versions=await sql(c.db,'select version,verification_version from kh_private.agencies where id=$1',[c.f.agency]);return operation(owner,'select public.kh_review_agency_verification($1,$2) value',[owner,{agencyId:c.f.agency,decision,note:'Identidad revisada en carrera',expectedAgencyVersion:versions.version,expectedVerificationVersion:versions.verification_version,clientRequestId:randomUUID()}]);}
async function submit(c){
 const request=randomUUID(),path=`${c.f.actor}/${request}/photo.jpg`;await c.setup("insert into storage.objects(bucket_id,name)values('property-photos',$1)",[path]);
 return operation(c.f.actor,'select public.kh_agency_save_property($1,$2,$3) value',[c.f.actor,c.f.agency,{clientRequestId:request,publicationIntent:'submit',sourceReference:request,consentReference:'Consentimiento comprobado',draft:{title:'Casa nueva de carrera',location:'Vedado',province:'La Habana',type:'Casa',price:30000,bedrooms:2,bathrooms:1,description:'Casa para verificar publicación concurrente.',photoPaths:[path]}}]);
}
async function commitOp(c,op){await c.left.query('begin');try{const r=await invoke(c.left,op);await c.left.query('commit');return r}catch(e){await c.left.query('rollback');throw e}}
for(const decision of ['grant','revoke'])for(const first of ['verification','submit'])add(`verification_${decision}_vs_submit_${first}_first`,async c=>{
 if(decision==='revoke')await commitOp(c,await verification(c,'grant'));
 const v=await verification(c,decision),s=await submit(c),[x,y]=await c.race(first==='verification'?v:s,first==='verification'?s:v);success(x);success(y);
 const p=(first==='submit'?x:y).value.property;assert.equal(p.moderation,(decision==='grant')===(first==='verification')?'approved':'pending');
 assert.equal((await sql(c.db,'select moderation from public.properties where id=$1',[p.id])).moderation,p.moderation,'later grant/revoke never rewrites the prior submission');
});
for(const first of ['verification','approval'])add(`verification_revoke_vs_common_change_approval_${first}_first`,async c=>{
 const b=(await c.setup('select pg_temp.race_collaborator($1) b',[c.f])).b;await commitOp(c,await verification(c,'grant'));
 const p=(await c.setup('select public.kh_propose_agency_property_change($1,$2,$3) value',[b.actor,b.agency,{propertyId:c.f.property,kind:'price',proposedPayload:{price:31000},expectedPropertyVersion:2,clientRequestId:randomUUID()}],b.actor)).value;
 const approve=operation(c.f.actor,'select public.kh_decide_agency_property_change($1,$2,$3) value',[c.f.actor,c.f.agency,{requestId:p.id,expectedVersion:1,decision:'accept',clientRequestId:randomUUID()}]),v=await verification(c,'revoke');
 const [x,y]=await c.race(first==='verification'?v:approve,first==='verification'?approve:v);success(x);success(y);
 const property=await sql(c.db,'select price,moderation from public.properties where id=$1',[c.f.property]);assert.equal(Number(property.price),31000);assert.equal(property.moderation,first==='verification'?'pending':'approved');
});
add('verified_publish_response_lost_then_revoke_replay',async c=>{
 await commitOp(c,await verification(c,'grant'));await c.setup("insert into kh_private.saved_searches(user_id,name,filters)values($1,'Aviso','{\"operations\":[\"sale\"]}')",[buyer]);
 const s=await submit(c),first=await commitOp(c,s);assert.equal(first.property.moderation,'approved');
 const [x,y]=await c.race(await verification(c,'revoke'),s);success(x);const replay=success(y);assert.equal(replay.property.id,first.property.id);assert.equal(replay.property.version,first.property.version);assert.equal(replay.property.moderation,'approved');
 assert.equal((await sql(c.db,"select count(*)::int n from kh_private.notifications where property_id=$1 and category='alert'",[first.property.id])).n,1);
 const next=structuredClone(s);next.params[2]={...next.params[2],propertyId:first.property.id,expectedVersion:first.property.version,clientRequestId:randomUUID()};assert.equal((await commitOp(c,next)).property.moderation,'pending');
});

for(const entry of ['public','auth'])for(const first of ['delete','schedule'])add(`source_personal_delete_vs_external_agency_scheduling_${entry}_${first}_first`,async c=>{
 const f=(await c.setup('select pg_temp.race_personal($1,$2) f',[c.f,uid(5)])).f,p=await visit(c,f);
 const deletion=entry==='public'?operation(f.source,'select public.kh_begin_account_deletion($1) value',[f.source]):operation(null,'delete from auth.users where id=$1 returning id value',[f.source],'agency_test');
 const [x,y]=await c.race(first==='delete'?deletion:accept(f,p),first==='delete'?accept(f,p):deletion);success(x);
 if(first==='delete')rejection(y,/^KH_NEG_VERSION_CONFLICT$/);else success(y);
 assert.equal((await sql(c.db,'select count(*)::int n from public.properties where id=$1',[f.property])).n,0);
 assert.equal((await sql(c.db,"select count(*)::int n from kh_private.property_visit_slots where property_id=$1 and outcome='unrecorded'",[f.property])).n,0);
 assert.equal((await sql(c.db,'select count(*)::int n from kh_private.agency_deals where id=$1',[f.deal])).n,1,'commercial history survives source removal');
});
add('privileged_direct_delete_lock_order_probe',async c=>{
 const f=(await c.setup('select pg_temp.race_personal($1,$2) f',[c.f,uid(5)])).f,p=await visit(c,f);
 assert.equal((await sql(c.db,"select has_table_privilege('authenticated','public.properties','DELETE') allowed")).allowed,false);
 await c.left.query('begin');await c.left.query('select id from public.properties where id=$1 for update',[f.property]);
 await c.right.query('begin');const waiting=invoke(c.right,accept(f,p)).then(value=>({value}),error=>({error}));c.pending.push(waiting);await c.blocked(c.right,c.left);
 const deleting=c.left.query('delete from public.properties where id=$1',[f.property]).then(value=>({value}),error=>({error}));c.pending.push(deleting);
 const outcome=await deleting;rejection(outcome,/^KH_AGENCY_LIFECYCLE_RETRY$/);assert.equal(outcome.error.code,'40001');await c.left.query('rollback');
 const other=await waiting;success(other);await c.right.query('commit');
 assert.equal((await sql(c.db,'select count(*)::int n from public.properties where id=$1',[f.property])).n,1);
 assert.equal((await sql(c.db,'select withdrawn_at from kh_private.agency_property_identities where property_id=$1',[f.property])).withdrawn_at,null);
 await c.setup('delete from public.properties where id=$1',[f.property]);
 assert.equal((await sql(c.db,'select count(*)::int n from public.properties where id=$1',[f.property])).n,0);
 assert.equal((await sql(c.db,'select count(*)::int n from kh_private.agency_deals where id=$1',[f.deal])).n,1);
});

for(const end of ['sale','member_removal'])for(const first of ['termination','worker'])for(const phase of ['materialization','dispatch'])add(`worker_reminder_vs_${end}_${phase}_${first}_first`,async c=>{
 await assignManager(c);const p=await visit(c);await commitOp(c,accept(c.f,p));const terminate=end==='sale'?await sale(c):remove(c.f);
 await c.setup('select kh_private.push_tick() value'); // Drain unrelated events with transport disabled.
 const device=randomUUID();await c.setup(`insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,expo_push_token,token_hash,enabled,expires_at,supports_agency_notifications)
 values($1,decode(repeat('aa',32),'hex'),1,'register',decode('aa','hex'),$2::uuid,md5(($2::uuid)::text||':session')::uuid,$3,decode('aa','hex'),true,clock_timestamp()+interval '1 day',true)`,[device,manager,`ExpoPushToken[${device.replaceAll('-','')}]`]);
 await c.setup("update kh_private.property_visit_slots set starts_at=clock_timestamp()+interval '1 hour',ends_at=clock_timestamp()+interval '2 hours' where proposal_id=$1",[p.id]);
 const event=(await c.setup("insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id) select $1,$2,'visit_2h',starts_at-interval '2 hours',$3 from kh_private.property_visit_slots where proposal_id=$1 returning id",[p.id,c.f.deal,manager])).id;
 if(phase==='dispatch')await c.setup('select kh_private.push_tick() value');
 await c.setup('update kh_private.push_config set transport_enabled=true');
 const tick=operation(null,'select kh_private.push_tick() value',[],'agency_test');
 const [x,y]=await c.race(first==='termination'?terminate:tick,first==='termination'?tick:terminate);success(x);success(y);
 await c.setup('select kh_private.push_tick() value');await c.setup('select kh_private.push_tick() value');
 const notices=(await c.db.query('select id from kh_private.notifications where agency_event_id=$1 and recipient_id=$2',[event,manager])).rows;
 const sent=(await sql(c.db,"select count(*)::int n from kh_private.race_transport t join kh_private.notifications n on n.id=(t.payload#>>'{data,notificationId}')::uuid where n.agency_event_id=$1 and n.recipient_id=$2",[event,manager])).n;
 assert.equal(sent,first==='worker'?1:0,'only a transport enqueue committed BEFORE termination may exist');
 assert.ok(notices.length<=1);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.push_outbox o join kh_private.notifications n on n.id=o.notification_id where n.agency_event_id=$1 and n.recipient_id=$2',[event,manager])).n,notices.length);
 if(end==='sale')await sold(c);else{
  assert.equal((await sql(c.db,'select state from kh_private.agency_memberships where agency_id=$1 and user_id=$2',[c.f.agency,manager])).state,'removed');
  if(notices[0]){await c.left.query('begin');const r=await invoke(c.left,operation(manager,'select public.kh_resolve_push_notification($1,$2) value',[manager,notices[0].id])).then(value=>({value}),error=>({error}));rejection(r,/KH_PUSH_NOT_FOUND/);await c.left.query('rollback');}
 }
 assert.equal((await sql(c.db,"select count(*)::int n from kh_private.agency_reminders where id=$1 and state='pending'",[event])).n,0);
 console.log(`EVIDENCE transport enqueue count=${sent}; committed enqueue cannot be recalled; local stub only`);
});

add('source_public_delete_dynamic_pending_agency',async c=>{
 const f=(await c.setup('select pg_temp.race_personal($1,$2) f',[c.f,uid(5)])).f;
 const b=(await c.setup('select pg_temp.kh_agency_signup(98) id')).id;await c.setup('select pg_temp.kh_agency_approve($1)',[b]);
 // Test-only barrier executes AFTER PostgreSQL has locked the source row, before its real delete triggers.
 // It adds no agency/account locks and makes the ordinarily tiny scheduling window deterministic.
 await c.db.query(`create function kh_private.race_delete_barrier() returns trigger language plpgsql set search_path='' as $$begin perform pg_advisory_xact_lock(130013,13);return old;end$$;
 create trigger aa_race_delete_barrier before delete on public.properties for each row execute function kh_private.race_delete_barrier()`);
 await c.db.query('select pg_advisory_lock(130013,13)');
 await c.db.query('begin');await c.db.query('select kh_private.agency_lock($1)',[f.agency]);
 await c.right.query('begin');const deleting=invoke(c.right,operation(f.source,'select public.kh_begin_account_deletion($1) value',[f.source])).then(value=>({value}),error=>({error}));c.pending.push(deleting);await c.blocked(c.right,c.db);
 // The original prepared set contains A. A new B request can commit without the personal source's account lock.
 await c.left.query('begin');const request=await invoke(c.left,operation(uid(98),'select public.kh_request_agency_mandate($1,$2,$3) value',[uid(98),b,{propertyId:f.property,internalReference:'DYNAMIC-B',clientRequestId:randomUUID()}]));await c.left.query('commit');
 await c.db.query('commit');await c.blocked(c.right,c.db); // now waiting at the row barrier
 await c.left.query('begin');const withdrawing=invoke(c.left,operation(uid(98),'select public.kh_withdraw_agency_mandate($1,$2,$3) value',[uid(98),b,{propertyId:f.property,requestId:request.id,requestingAgencyId:b,expectedVersion:1,clientRequestId:randomUUID()}])).then(value=>({value}),error=>({error}));c.pending.push(withdrawing);
 await c.blocked(c.left,c.right);await c.db.query('select pg_advisory_unlock(130013,13)');
 const result=await deleting;rejection(result,/^KH_AGENCY_LIFECYCLE_RETRY$/);assert.equal(result.error.code,'40001');await c.right.query('rollback');
 const other=await withdrawing;await c.left.query(other.error?'rollback':'commit');success(other);
 assert.equal((await sql(c.db,'select count(*)::int n from kh_private.account_deletions where user_id=$1',[f.source])).n,0);
 assert.equal((await sql(c.db,'select count(*)::int n from public.properties where id=$1',[f.property])).n,1);
 assert.equal((await sql(c.db,'select withdrawn_at from kh_private.agency_property_identities where property_id=$1',[f.property])).withdrawn_at,null);
 assert.equal((await sql(c.db,'select closed_reason from kh_private.agency_deals where id=$1',[f.deal])).closed_reason,null);
 assert.equal((await sql(c.db,"select count(*)::int n from kh_private.agency_events where kind='personal_source_deleted' and subject_id=$1",[f.property])).n,0);
 await commitOp(c,operation(f.source,'select public.kh_begin_account_deletion($1) value',[f.source]));
 assert.equal((await sql(c.db,'select count(*)::int n from public.properties where id=$1',[f.property])).n,0);
 assert.equal((await sql(c.db,'select count(*)::int n from kh_private.agency_deals where id=$1',[f.deal])).n,1);
});

for(const first of ['sale','merge'])add(`sale_vs_alias_merge_${first}_first`,async c=>{
 const p=(await commitOp(c,await submit(c))).property;
 await c.setup("select public.kh_review_property($1,'approved',null,$2)",[p.id,p.version],owner);
 const merge=operation(owner,'select public.kh_admin_merge_property_duplicates($1,$2) value',[owner,{canonicalId:p.id,duplicateIds:[c.f.property],expectedVersions:{[p.id]:2,[c.f.property]:2},originEvidence:'Origen empresarial coincidente',reason:'Consolidación comprobada en carrera',clientRequestId:randomUUID()}]);
 const s=await sale(c),[x,y]=await c.race(first==='merge'?merge:s,first==='merge'?s:merge);success(x);
 if(first==='sale'){rejection(y,/KH_PROPERTY_ALIAS_INVALID/);await sold(c)}else{
  rejection(y,/KH_AGENCY_SALE_STALE/);assert.equal((await sql(c.db,'select count(*)::int n from kh_private.property_sale_closures')).n,0);
  assert.equal((await sql(c.db,'select property_id from kh_private.agency_deals where id=$1',[c.f.deal])).property_id,c.f.property);
  await commitOp(c,await sale(c));await sold(c,{...c.f,property:p.id});
  assert.equal((await sql(c.db,"select count(*)::int n from public.properties where id=any($1::uuid[]) and availability='sold'",[[p.id,c.f.property]])).n,2);
 }
});
add('sale_current_participant_set_changes',async c=>{
 const s=await sale(c),chat=operation(buyer,'select public.kh_start_agency_conversation($1,$2,$3) value',[buyer,c.f.agency,{propertyId:c.f.property,clientRequestId:randomUUID()}]);
 const [x,y]=await c.race(chat,s);success(x);rejection(y,/KH_AGENCY_SALE_STALE/);
 assert.equal((await sql(c.db,'select count(*)::int n from kh_private.property_sale_closures')).n,0);
 await commitOp(c,await sale(c));await sold(c);
});

add('direct_sql_security_roles',async c=>{
 await assignManager(c);const b=(await c.setup('select pg_temp.race_collaborator($1) b',[c.f])).b;
 async function attempt(actor,query,params=[],role='authenticated'){
  await c.left.query('begin');const r=await invoke(c.left,operation(actor,query,params,role)).then(value=>({value}),error=>({error}));await c.left.query('rollback');return r;
 }
 for(const [label,actor,role]of [['anon',null,'anon'],['buyer',buyer,'authenticated'],['manager',manager,'authenticated'],['coordinator',coordinator,'authenticated'],['foreign_admin',b.actor,'authenticated'],['moderator',uid(3),'authenticated'],['protected_owner',owner,'authenticated']]){
  rejection(await attempt(actor,'select * from kh_private.agency_verifications',[],role),/permission denied/);
  rejection(await attempt(actor,'select kh_private.agency_detach_account($1)',[c.f.actor],role),/permission denied/);
  rejection(await attempt(actor,'delete from public.properties where id=$1',[c.f.property],role),/permission denied/);
  const grant=await verification(c,'grant');grant.params[0]=actor;
  const r=await attempt(actor,grant.query,grant.params,role);
  if(actor===owner)success(r);else rejection(r,/permission denied|KH_ADMIN_REQUIRED|KH_OWNER_REQUIRED|KH_ACCOUNT_CHANGED/);
  const deal=await attempt(actor,'select public.kh_get_agency_deal($1,$2,$3) value',[actor,c.f.agency,c.f.deal],role);
  if([manager,coordinator].includes(actor))assert.equal(success(deal).id,c.f.deal);else rejection(deal,/permission denied|KH_AGENCY_DEAL_NOT_FOUND|KH_AGENCY_MEMBERSHIP_REQUIRED|KH_ACCOUNT_CHANGED/);
  console.log(`SECURITY ${label}: actual SQL private reads/helpers/direct DELETE denied, verification authority and private deal visibility checked`);
 }
 const pub=success(await attempt(null,'select public.kh_public_agency_context(array[$1::uuid]) value',[c.f.property],'anon'));
 assert.ok(pub.length>0);for(const item of pub){assert.equal(typeof item.verified,'boolean');assert.deepEqual(Object.keys(item).filter(k=>/reason|evidence|phone|buyer|verificationVersion|sourceReference|responsible/i.test(k)),[])}
 const privateTables=(await c.db.query("select c.oid::regclass::text name,c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kh_private' and c.relkind='r' and (c.relname like 'agency_%' or c.relname in('property_sale_closures','commercial_termination_events','property_aliases','property_visit_slots'))")).rows;
 for(const row of privateTables){assert.equal(row.rls,true,row.name);assert.equal(row.anon,false,row.name);assert.equal(row.authenticated,false,row.name)}
 const unsafe=(await c.db.query("select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and p.proname like '%agency%' and n.nspname in('public','kh_private') and not(coalesce(p.proconfig,'{}') @> array['search_path=\"\"'])")).rows;assert.deepEqual(unsafe,[]);
 const exposed=(await c.db.query("select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kh_private' and (p.proname like '%agency%' or p.proname in('withdraw_personal_property','sale_group_lock','close_commercial_cycle')) and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))")).rows;assert.deepEqual(exposed.map(r=>r.name).sort(),['kh_private.agency_asset_read(text)','kh_private.agency_asset_unreferenced(text)','kh_private.agency_asset_write(text)','kh_private.agency_media_read(text)'],'only the four explicitly granted boolean storage RLS predicates may be exposed');
 // A personal verification never grants this otherwise unverified agency direct publication.
 await c.setup('select pg_temp.race_personal($1,$2)',[c.f,c.f.actor]);
 await c.setup("select public.kh_set_user_verified($1,$2,true,'Verificación personal solamente')",[owner,c.f.actor],owner);
 assert.equal((await commitOp(c,await submit(c))).property.moderation,'pending');
 await commitOp(c,await verification(c,'grant'));
 let publicState=success(await attempt(null,'select public.kh_public_agency_context(array[$1::uuid]) value',[c.f.property],'anon'));
 assert.equal(publicState.find(a=>a.agencyId===c.f.agency).verified,true);
 await commitOp(c,await verification(c,'revoke'));
 publicState=success(await attempt(null,'select public.kh_public_agency_context(array[$1::uuid]) value',[c.f.property],'anon'));
 assert.equal(publicState.find(a=>a.agencyId===c.f.agency).verified,false);
 rejection(await attempt(owner,'select public.kh_begin_account_deletion($1) value',[owner]),/KH_OWNER_PROTECTED/);
 rejection(await attempt(null,'delete from auth.users where id=$1',[owner],'agency_test'),/KH_OWNER_PROTECTED/);
 await c.setup('update kh_private.agency_settings set enabled=false');
 rejection(await attempt(c.f.actor,'select public.kh_create_agency_deal($1,$2,$3) value',[c.f.actor,c.f.agency,{propertyId:c.f.property,assigneeId:c.f.actor,externalContact:{name:'Disabled',consentReference:'Disabled'},clientRequestId:randomUUID()}]),/KH_AGENCY_DISABLED/);
});

const selected=process.argv.slice(2);let failed=false;
for(const [name,body] of cases.filter(([name])=>!selected.length||selected.some(filter=>name.includes(filter)))){try{await runCase(name,body)}catch(error){failed=true;console.error(`FAIL ${name}: ${error.message}\n${error.where??''}`)}}
if(failed)process.exitCode=1;
