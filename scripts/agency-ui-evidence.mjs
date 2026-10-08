import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {Client} from 'pg';
import {assertFixtureReceipt,assertFixtureTarget} from './agency-ui-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.superpowers/sdd/2026-10-07-agency-closure-release');
assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const r=assertFixtureReceipt(JSON.parse(await readFile(resolve(dir,'task-14-fixture-receipt.json'),'utf8')));
assert.equal(r.state,'ready');
const live=await fetch(`${r.origin}/__fixture/status`,{method:'POST',headers:{'x-fixture-control':r.controlToken}}).then(x=>x.json());
assert.equal(live.runId,r.runId);assert.equal(live.database,r.database);
const url=new URL(r.source);url.pathname='/'+r.database;
const db=new Client({connectionString:url.href});await db.connect();
const action=process.argv[2],out={runId:r.runId,database:r.database,action,at:new Date().toISOString(),evidence:'Explicit fixture preparation/SQL observation, not rendered UI or a provider'};
try{
 if(action==='seed-no-chat'){
  const actor=r.actors['admin-a'].id,buyer=r.actors['buyer-two'].id,key=randomUUID();
  await db.query('begin');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);
  await db.query('set local role authenticated');
  out.payload={buyerId:buyer,propertyId:r.properties['Casa principal compartida'],clientRequestId:key};
  out.result=(await db.query('select public.kh_create_agency_deal($1,$2,$3::jsonb) result',[actor,r.agencies.A,JSON.stringify(out.payload)])).rows[0].result;
  await db.query('commit');
  assert.equal((await db.query('select count(*)::int n from kh_private.agency_conversations where deal_id=$1',[out.result.id])).rows[0].n,0);
 }else if(action==='reinvite-coordinator-b'){
  const actor=r.actors['admin-b'].id;
  await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);await db.query('set local role authenticated');
  out.payload={userId:r.actors['coordinator-a'].id,role:'coordinator',clientRequestId:randomUUID()};
  out.result=(await db.query('select public.kh_invite_agency_member($1,$2,$3::jsonb) result',[actor,r.agencies.B,JSON.stringify(out.payload)])).rows[0].result;await db.query('commit');
 }else if(action==='remove-coordinator-b'){
  const actor=r.actors['admin-b'].id,userId=r.actors['coordinator-a'].id;
  const member=(await db.query('select version from kh_private.agency_memberships where agency_id=$1 and user_id=$2',[r.agencies.B,userId])).rows[0];
  out.payload={userId,expectedVersion:member.version,clientRequestId:randomUUID()};
  await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);await db.query('set local role authenticated');
  out.result=(await db.query('select public.kh_remove_agency_member($1,$2,$3::jsonb) result',[actor,r.agencies.B,JSON.stringify(out.payload)])).rows[0].result;await db.query('commit');
 }else if(action==='seed-public'){
  const actor=r.actors['admin-b'].id,key=randomUUID(),path=`${actor}/${key}/photo.jpg`;
  await db.query('begin');
  await db.query("insert into storage.objects(bucket_id,name)values('property-photos',$1)",[path]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);
  await db.query('set local role authenticated');
  out.payload={clientRequestId:key,sourceReference:'Escenario independiente público B',consentReference:'Autorización sintética B pública',publicationIntent:'submit',draft:{title:'Vivienda sintética para presentación pública',location:'Vedado',province:'La Habana',type:'Casa',price:40000,bedrooms:2,bathrooms:1,description:'Vivienda exclusivamente sintética para verificar presentación pública y privacidad de agencias.',photoPaths:[path]}};
  out.result=(await db.query('select public.kh_agency_save_property($1,$2,$3::jsonb) result',[actor,r.agencies.B,JSON.stringify(out.payload)])).rows[0].result;
  await db.query('commit');
 }else if(action==='deliver-in-app'){
  assert.equal((await db.query('select coalesce(bool_or(transport_enabled),false) enabled from kh_private.push_config')).rows[0].enabled,false);
  out.ticks=[];for(let n=0;n<10;n++){out.ticks.push((await db.query('select kh_private.push_tick() result')).rows[0].result);if((await db.query("select count(*)::int n from kh_private.agency_events where delivery_state='pending'")).rows[0].n===0)break;}
  out.providerTransport=false;
 }else if(action==='verify'){
  out.checks=[];const pass=name=>out.checks.push(name),main=r.properties['Casa principal compartida'];
  const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const closures=await rows('select * from kh_private.property_sale_closures where property_id=$1',[main]);
  assert.equal(closures.length,1);const sale=closures[0];
  assert.equal(sale.origin_agency_id,r.agencies.A);assert.equal(sale.executing_agency_id,r.agencies.B);assert.equal(sale.confirmed_by,r.actors['admin-a'].id);assert.equal(sale.executing_manager_id,r.actors['admin-b'].id);assert.equal(Number(sale.amount_usd),98000);out.sale=sale;pass('Unique sale: source A confirms, B/admin-B executes, amount 98000');
  assert.equal((await rows('select availability from public.properties where id=$1',[main]))[0].availability,'sold');
  const visits=await rows('select * from kh_private.property_visit_slots where property_id=$1',[main]);assert.equal(visits.length,2);assert.ok(visits.every(v=>v.outcome==='cancelled'&&v.closed_reason==='property_sold'));pass('Both future visits cancelled with property_sold');
  const deals=await rows('select * from kh_private.agency_deals where property_id=$1',[main]);assert.ok(deals.every(d=>d.closed_reason!==null));assert.equal(deals.filter(d=>d.closed_reason==='deal_lost').length,1);pass('Private lost interest stays lost; remaining sale interests terminal');
  const tasks=await rows('select t.* from kh_private.agency_tasks t join kh_private.agency_deals d on d.id=t.deal_id where d.property_id=$1',[main]);assert.ok(tasks.every(t=>['done','cancelled'].includes(t.state)));assert.ok(tasks.some(t=>t.kind!=='followup'&&t.state==='done'));pass('Ordinary tasks cancelled and external communication explicitly completed');
  for(const title of ['Tarea 503 antes sin escritura','Tarea 504 después de commit']){const found=await rows('select id,version from kh_private.agency_tasks where title=$1',[title]);assert.equal(found.length,1);assert.equal(found[0].version,1);}pass('Gateway retries each retained exactly one task at version 1');
  assert.equal((await rows("select count(*)::int n from kh_private.agency_tasks where title like 'BORRADOR%'")).at(0).n,0);pass('Neither revoked-context draft was written');
  assert.equal((await rows('select agencies from kh_private.notification_preferences where user_id=$1',[r.actors['buyer-two'].id]))[0].agencies,false);pass('Agencies notification preference persisted off');
  async function as(actor,sql,args=[]){await db.query('begin');try{const session=(await rows('select id from auth.sessions where user_id=$1 order by created_at desc limit 1',[actor]))[0]?.id;await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',$2::text)::text,true)",[actor,session??'']);await db.query('set local role authenticated');return (await db.query(sql,args)).rows;}finally{await db.query('rollback');}}
  const dealA=deals.find(d=>d.buyer_id===r.actors['buyer-one'].id),dealB=deals.find(d=>d.agency_id===r.agencies.B&&d.closed_reason==='property_sold');assert.ok(dealA&&dealB);
  for(const [actor,agency,deal] of [[r.actors['admin-a'].id,r.agencies.A,dealB.id],[r.actors['admin-b'].id,r.agencies.B,dealA.id],[r.actors['coordinator-a'].id,r.agencies.B,dealB.id]])await assert.rejects(()=>as(actor,'select public.kh_get_agency_deal($1,$2,$3)',[actor,agency,deal]),e=>e.code==='42501'&&e.message==='KH_AGENCY_DEAL_NOT_FOUND');pass('A cannot read B; B cannot read A; removed B coordinator denied by real SQL');
  const conversation=(await rows('select id from kh_private.agency_conversations where deal_id=$1',[dealA.id]))[0];
  const buyer=r.actors['buyer-one'].id,chat=(await as(buyer,'select public.kh_get_agency_conversation($1,null,$2) value',[buyer,conversation.id]))[0].value;assert.equal(chat.canSend,false);assert.equal(chat.closedReason,'property_sold');pass('Buyer actual conversation is read-only after sale');
  out.buyerNotices={};
  for(const name of ['buyer-one','buyer-two']){const actor=r.actors[name].id,result=(await as(actor,"select public.kh_list_notifications(p_actor_id=>$1,p_before_seq=>null,p_unread_only=>false,p_category=>'agency',p_limit=>30,p_include_alerts=>true,p_include_agencies=>true) value",[actor]))[0].value;out.buyerNotices[name]=result.items;const notice=result.items.find(n=>n.eventKind==='property_sold');assert.ok(notice);assert.doesNotMatch(JSON.stringify(notice),/98000|5350000015|Referencia privada|Responsable Privado/);const target=(await as(actor,'select public.kh_resolve_push_notification($1,$2) value',[actor,notice.id]))[0].value.agencyTarget;out.buyerNotices[name+'Target']=target;assert.equal(target.route,name==='buyer-one'?'buyer_conversation':'account_notice');if(name==='buyer-one')assert.equal(target.dealId,conversation.id);else assert.equal(target.dealId??null,null);}
  pass('Buyer projections use real conversation/account notice and omit private closure/contact content');
 }else if(action==='capture'){
  const tables=['agency_deals','agency_conversations','agency_messages','agency_proposals','agency_proposal_events','property_visit_slots','agency_tasks','property_sale_closures','agency_sale_requests','agency_write_receipts','commercial_termination_events','notifications','agency_memberships','agency_verifications','agency_verification_requests','agency_mandates','agency_property_origins','agency_property_moderation_holds','notification_preferences'];
  out.tables={};
  for(const table of tables){if((await db.query('select to_regclass($1) t',[`kh_private.${table}`])).rows[0].t)out.tables[table]=(await db.query(`select to_jsonb(t) row from kh_private.${table} t`)).rows.map(x=>x.row);}
  out.properties=(await db.query('select id,title,moderation,availability,version,price from public.properties')).rows;
 }else throw Error('Use seed-no-chat | seed-public | deliver-in-app | capture | verify | reinvite-coordinator-b | remove-coordinator-b');
 await writeFile(resolve(dir,`task-14-${action}-${Date.now()}.json`),JSON.stringify(out,null,2),{flag:'wx'});
 console.log(JSON.stringify(out));
}finally{await db.end()}
