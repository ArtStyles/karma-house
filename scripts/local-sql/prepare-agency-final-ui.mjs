// Receipt-bound synthetic setup only. Never a production or browser-action proof.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {assertFixtureReceipt,assertFixtureTarget} from '../agency-ui-fixture.mjs';
const root=new URL('../../.superpowers/sdd/2026-10-07-agency-closure-release/',import.meta.url);
const r=assertFixtureReceipt(JSON.parse(await readFile(new URL('task-final-fixture-receipt.json',root),'utf8')));
assert.equal(r.state,'ready');const source=assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const status=await fetch(r.origin+'/__fixture/status',{method:'POST',headers:{'x-fixture-control':r.controlToken}}).then(x=>x.json());assert.equal(status.runId,r.runId);
const db=new Client({connectionString:new URL('/'+r.database,source).href});await db.connect();
const a=r.agencies.A,admin=r.actors['admin-a'].id,owner=r.actors.owner.id,proof={runId:r.runId,kind:'synthetic-setup-real-SQL',deals:[]};
async function rpc(actor,name,args){await db.query('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated','session_id',md5($1::text||':session')::uuid)::text,true)",[actor]);await db.query('set local role authenticated');const value=(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;await db.query('commit');return value;}catch(e){await db.query('rollback');throw e;}}
try{
 for(const title of ['Casa principal compartida','Casa para revisión inicial']){
  const id=r.properties[title],p=(await db.query('select * from public.properties where id=$1',[id])).rows[0];
  const payload={propertyId:id,expectedVersion:p.version,clientRequestId:randomUUID(),publicationIntent:'submit',sourceReference:(await db.query('select source_reference from kh_private.agency_property_origins where property_id=$1',[id])).rows[0].source_reference,consentReference:'Autorización sintética registrada',draft:{title:p.title,location:p.location,province:p.province,type:p.type,price:Number(p.price),bedrooms:p.bedrooms,bathrooms:p.bathrooms,description:p.description,photoPaths:p.photo_paths}};
  const match=await rpc(admin,'kh_find_agency_property_matches',[admin,a,payload]);if(match.items.length)payload.duplicateDecision=match.review;
  const saved=await rpc(admin,'kh_agency_save_property',[admin,a,payload]);await rpc(owner,'kh_review_property',[id,'approved',null,saved.property.version]);
  const d=await rpc(admin,'kh_create_agency_deal',[admin,a,{propertyId:id,assigneeId:admin,externalContact:{name:'Contacto externo común',phone:null,consentReference:'Autorización sintética'},clientRequestId:randomUUID()}]);proof.deals.push(d);
 }
 for(const name of ['buyer-one','buyer-two'])proof.deals.push(await rpc(admin,'kh_create_agency_deal',[admin,a,{propertyId:r.properties['Casa principal compartida'],assigneeId:admin,buyerId:r.actors[name].id,clientRequestId:randomUUID()}]));
 const buyer=r.actors['buyer-one'].id;proof.conversation=await rpc(buyer,'kh_start_agency_conversation',[buyer,a,{propertyId:r.properties['Casa principal compartida'],preferredManagerId:admin,clientRequestId:randomUUID()}]);
 proof.profile=(await db.query('select id,commercial_profile from kh_private.agencies where id=$1',[a])).rows[0];
 proof.application=(await db.query('select input from kh_private.agency_applications where agency_id=$1',[a])).rows[0];
 await writeFile(new URL('final-evidence/ui-setup.json',root),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await db.end();}
