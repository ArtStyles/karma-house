import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const dir=new URL('../.superpowers/sdd/2026-10-07-agency-closure-release/',import.meta.url);
const action=process.argv[2];assert.ok(['seed','remove-member','status'].includes(action));
assert.equal(process.env.KH_LOCAL_DATABASE_URL,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const {assertFixtureReceipt,assertFixtureTarget}=await import('./agency-ui-fixture.mjs');assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const receipt=assertFixtureReceipt(JSON.parse(await readFile(new URL('task-15-fixture-receipt.json',dir),'utf8')));assert.equal(receipt.state,'ready');
const live=await fetch(`${receipt.origin}/__fixture/status`,{method:'POST',headers:{'x-fixture-control':receipt.controlToken}}).then(r=>r.json());assert.equal(live.runId,receipt.runId);assert.equal(live.database,receipt.database);
const {Client}=await import('pg'),db=new Client({connectionString:new URL('/'+receipt.database,receipt.source).href});await db.connect();
const out={action,runId:receipt.runId,at:new Date().toISOString(),evidence:'SQL fixture preparation/observation only'};
try{
 if(action==='seed'){
  await db.query('begin');const actor=receipt.actors['admin-a'].id,agency=receipt.agencies.A,owner=receipt.actors.owner.id;
  async function as(user){await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);}
  const properties=Object.values(receipt.properties).slice(0,2);out.deals=[];
  for(const [i,pid]of properties.entries()){
   const p=(await db.query('select p.*,o.source_reference,o.consent_reference from public.properties p join kh_private.agency_property_origins o on o.property_id=p.id where p.id=$1',[pid])).rows[0];
   await as(actor);const submitted=(await db.query('select public.kh_agency_save_property($1,$2,$3) p',[actor,agency,{propertyId:pid,expectedVersion:p.version,sourceReference:p.source_reference,consentReference:p.consent_reference,clientRequestId:randomUUID(),publicationIntent:'submit',draft:{title:p.title,location:p.location,province:p.province,type:p.type,price:p.price,bedrooms:p.bedrooms,bathrooms:p.bathrooms,description:p.description,photoPaths:p.photo_paths}}])).rows[0].p;
   await as(owner);await db.query("select public.kh_review_property($1,'approved',null,$2)",[pid,submitted.property.version]);await as(actor);
   const deal=(await db.query('select public.kh_create_agency_deal($1,$2,$3) d',[actor,agency,{propertyId:pid,assigneeId:actor,externalContact:{name:i?'Venta histórica Task15':'Seguimiento autorizado Task15',phone:'+5350000015',consentReference:'Consentimiento fixture Task15'},clientRequestId:randomUUID()}])).rows[0].d;out.deals.push(deal);
   await db.query('select public.kh_save_agency_task($1,$2,$3)',[actor,agency,{dealId:deal.id,title:'Historial de seguimiento Task15',assigneeId:actor,dueAt:new Date(Date.now()+86400000).toISOString(),clientRequestId:randomUUID()}]);
   if(i){const version=(await db.query('select version from public.properties where id=$1',[pid])).rows[0].version;
    const request=(await db.query('select public.kh_request_agency_sale($1,$2,$3) r',[actor,agency,{winningDealId:deal.id,executingManagerId:actor,amountUsd:29000,occurredAt:new Date(Date.now()-3600000).toISOString(),expectedPropertyVersion:version,expectedAuthorityVersion:1,clientRequestId:randomUUID()}])).rows[0].r;
    out.sale=(await db.query('select public.kh_decide_agency_sale($1,$2,$3) r',[actor,agency,{requestId:request.id,action:'confirm',expectedRequestVersion:1,expectedPropertyVersion:version,expectedAuthorityVersion:1,note:'Cierre fixture Task15',clientRequestId:randomUUID()}])).rows[0].r;
   }
  }
  assert.equal((await db.query('select transport_enabled from kh_private.push_config where singleton')).rows[0].transport_enabled,false);await db.query('select kh_private.push_tick()');await db.query('commit');
 }else if(action==='remove-member'){
  const result=await db.query("update kh_private.agency_memberships set state='removed',version=version+1 where agency_id=$1 and user_id=$2 and state='active'",[receipt.agencies.A,receipt.actors['admin-a'].id]);assert.equal(result.rowCount,1);out.removed=true;
 }else if(action==='status'){out.summary=(await db.query("select jsonb_build_object('enabled',(select enabled from kh_private.agency_settings),'sales',(select count(*) from kh_private.property_sale_closures),'receipts',(select count(*) from kh_private.agency_write_receipts),'pendingReminders',(select count(*) from kh_private.agency_reminders where state='pending'),'pendingEvents',(select count(*) from kh_private.agency_events where delivery_state='pending'),'notifications',(select count(*) from kh_private.notifications where category='agency')) result")).rows[0].result;}
 else throw Error('Use seed, remove-member or status');
 await writeFile(new URL(`task-15-ui-${action}.json`,dir),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}finally{await db.query('rollback');await db.end();}
