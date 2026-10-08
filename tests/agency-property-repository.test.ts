import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createAgencyPropertyRepository,decodeAgencyProperty} from '../src/agencies/properties/repository.ts';
import {emptyDraft} from '../src/domain/listings.ts';
import {createAgencyPropertyMedia} from '../src/agencies/properties/media.ts';
const actor='45000000-0000-4000-8000-000000000009', agency='45000000-0000-4000-8001-000000000001', id='45000000-0000-4000-8002-000000000001';
const context={userId:actor,agencyId:agency,generation:1,accessToken:'pinned',signal:new AbortController().signal,checkpoint(){}};
const row={id,owner_id:'45000000-0000-4000-8000-000000000001',client_request_id:id,title:'Casa Vedado',location:'Vedado',province:'La Habana',description:'Una casa suficientemente amplia.',price:30000,area:null,bedrooms:2,bathrooms:1,type:'Casa',amenities:[],photo_paths:[],cover_thumb_path:null,moderation:'draft',availability:'active',version:1,created_at:'2026-10-07T12:00:00Z',review_note:null,operation:'sale'};
const record={property:row,originAgencyId:agency,authorityVersion:1,cycleId:id,mandate:{agencyId:agency,state:'active',version:1,reference:'CASA-1'},canEditCommon:true,canConfirmSale:true,publicationPolicy:'requires_review',moderationHold:false};
function repo(response:unknown,observe?:(url:string,init:RequestInit)=>void){const client=createClient('https://fixture.invalid','key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{observe?.(String(url),init??{});return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}})}}});return createAgencyPropertyRepository(client);}
test('property repository pins actor and agency and keeps server policy without exposing custodian as contact',async()=>{let captured=false;const result=await repo(record,(url,init)=>{assert.match(url,/kh_agency_property$/);assert.equal(new Headers(init.headers).get('authorization'),'Bearer pinned');assert.deepEqual(JSON.parse(String(init.body)),{p_property_id:id,p_agency_id:agency,p_actor_id:actor});captured=true}).get(id,context);assert.equal(captured,true);assert.equal(result.property.ownerId,undefined);assert.equal(result.publicationPolicy,'requires_review');assert.equal(result.property.id,id)});
test('property repository rejects mismatched agency, property UUID and malformed policy',async()=>{for(const value of [{...record,mandate:{...record.mandate,agencyId:id}},{...record,property:{...row,id:agency}},{...record,publicationPolicy:'approved'},{...record,cycleId:'invalid'}])await assert.rejects(repo(value).get(id,context),/interpretar/)});
test('enterprise save sends intent and normalized material, never client approved or custodian fields',async()=>{let payload:Record<string,unknown>={};await repo(record,(_url,init)=>{payload=JSON.parse(String(init.body)).p_payload}).save({draft:{...emptyDraft,title:'Casa Vedado',location:'Vedado',province:'La Habana',description:row.description,price:'30000',bedrooms:'2',bathrooms:'1'},publicationIntent:'submit',sourceReference:'CASA-1',consentReference:'Consentimiento firmado',clientRequestId:id},context);assert.equal(payload.publicationIntent,'submit');assert.equal('moderation' in payload,false);assert.equal('ownerId' in (payload.draft as object),false);assert.equal('moderation' in (payload.draft as object),false);assert.equal((payload.draft as Record<string,unknown>).price,30000)});
test('enterprise repository discards an answer after context cancellation',async()=>{let changed=false;await assert.rejects(repo(record,()=>{changed=true}).get(id,{...context,checkpoint(){if(changed)throw Error('KH_AGENCY_CONTEXT_CHANGED')}}),/KH_AGENCY_CONTEXT_CHANGED/)});
test('private business media uses the captured JWT and refuses signing unrelated returned paths',async()=>{
 const path=`${actor}/${id}/photo.jpg`;let seen=0;
 const media=createAgencyPropertyMedia('https://fixture.invalid','key',async(_url,init)=>{assert.equal(new Headers(init?.headers).get('authorization'),'Bearer pinned');assert.equal(init?.signal,context.signal);seen++;return new Response(JSON.stringify([{path:'other.jpg',signedURL:'/object/sign/property-photos/other.jpg?token=bad'}]),{status:200})});
 await media.photos(context).upload(path,new Uint8Array([255,216,255]).buffer,'image/jpeg');
 await assert.rejects(media.sign([path],context),/fotografías/);assert.equal(seen,2);
});
test('enterprise decoder refuses coercible numeric objects and malformed review notes',()=>{for(const p of [{...row,price:[30000]},{...row,review_note:{secret:'private'}}])assert.throws(()=>decodeAgencyProperty({...record,property:p},agency),/interpretar/)});
test('changing a business cover cannot silently lose its prepared thumbnail',async()=>{
 const paths=[`${actor}/${id}/first.jpg`,`${actor}/${id}/second.jpg`];let writes=0;
 const client=createClient('https://fixture.invalid','key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url)=>{if(String(url).endsWith('kh_agency_save_property'))writes++;return new Response(JSON.stringify({...record,property:{...row,photo_paths:paths}}),{headers:{'Content-Type':'application/json'}})}}});
 const r=createAgencyPropertyRepository(client,{sign:async()=>new Map(),photos:()=>({upload:async()=>{},exists:async()=>true,getUploadId:async()=>id,readLocal:async()=>{throw Error('unreadable')}})});
 await assert.rejects(r.save({draft:{...emptyDraft,photos:[{uri:'',storagePath:paths[1],thumbUri:'file:///broken.jpg',uploadId:id}]},propertyId:id,expectedVersion:1,publicationIntent:'draft',sourceReference:'CASA-1',consentReference:'Consentimiento',clientRequestId:id},context),/miniatura/);assert.equal(writes,0);
});

test('photo existence probes accept Storage missing-object variants and preserve other failures',async()=>{
 const path=`${actor}/${id}/new.jpg`;
 for(const response of [new Response('',{status:404}),new Response(JSON.stringify({statusCode:'404',error:'not_found',message:'Object not found'}),{status:400}),new Response(JSON.stringify({message:'Object not found'}),{status:400})]){
  let calls=0;
  const media=createAgencyPropertyMedia('https://fixture.invalid','key',async(_url,init)=>{
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer pinned');assert.equal(init?.signal,context.signal);calls++;
   return init?.method==='POST'?new Response('{}',{status:200}):response;
  });
  const port=media.photos(context);
  assert.equal(await port.exists(path),false);
  await port.upload(path,new Uint8Array([255,216,255]).buffer,'image/jpeg');
  assert.equal(calls,2);
 }
 for(const [status,body] of [[401,{message:'Object not found'}],[403,{statusCode:'404'}],[400,{statusCode:'403',message:'permission denied'}],[500,{message:'Storage failed'}],[400,{error:'invalid_request'}]] as const){
  const media=createAgencyPropertyMedia('https://fixture.invalid','key',async()=>new Response(JSON.stringify(body),{status}));
  await assert.rejects(media.photos(context).exists(path),/fotografías/);
 }
 const network=createAgencyPropertyMedia('https://fixture.invalid','key',async()=>{throw Error('network unavailable')});
 await assert.rejects(network.photos(context).exists(path),/network unavailable/);
 let changed=false;const stale=createAgencyPropertyMedia('https://fixture.invalid','key',async()=>{changed=true;return new Response('{"statusCode":"404"}',{status:400})});
 await assert.rejects(stale.photos({...context,checkpoint(){if(changed)throw Error('KH_AGENCY_CONTEXT_CHANGED')}}).exists(path),/KH_AGENCY_CONTEXT_CHANGED/);
});
