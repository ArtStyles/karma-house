import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createAgencyPropertyRepository} from '../src/agencies/properties/repository.ts';
import {createFavoriteListingsController} from '../src/catalog/favoritesController.ts';
const actor='45000000-0000-4000-8000-000000000009',a='45000000-0000-4000-8001-000000000001',b='45000000-0000-4000-8001-000000000002',id='45000000-0000-4000-8002-000000000001';
const context={userId:actor,agencyId:a,generation:1,accessToken:'pinned',signal:new AbortController().signal,checkpoint(){}};
const request={id,propertyId:id,agencyId:b,agencyName:'Agencia B',state:'pending',version:1,canDecide:true,canWithdraw:false};
function repo(value:unknown,observe?:(url:string,init:RequestInit)=>void){return createAgencyPropertyRepository(createClient('https://fixture.invalid','key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{observe?.(String(url),init??{});return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})}}}));}
test('origin can read incoming requesting agency without equating it to selected agency',async()=>{const page=await repo({items:[request],hasMore:false}).listMandates(0,context);assert.equal(page.items[0].agencyId,b);assert.equal(page.items[0].internalReference,undefined)});
test('personal owner decisions use account context and null agency',async()=>{let seen=false;const {agencyId:_agency,...account}=context;await repo({...request,state:'accepted',version:2},(_url,init)=>{const body=JSON.parse(String(init.body));assert.equal(body.p_agency_id,null);assert.equal(body.p_actor_id,actor);assert.equal(new Headers(init.headers).get('authorization'),'Bearer pinned');seen=true}).decidePersonalMandate({requestId:id,expectedVersion:1,decision:'accept',clientRequestId:id},account);assert.equal(seen,true)});
test('requesting agency reference stays private and malformed request replies are rejected',async()=>{await assert.rejects(repo({items:[{...request,version:0}],hasMore:false}).listMandates(0,context),/interpretar/)});
test('favorites_resolve_to_single_canonical_property',async()=>{const item={id,title:'Casa'} as never;const c=createFavoriteListingsController({byIds:async()=>[item,item]});c.setSession(actor);await c.setIds([a,b]);assert.equal(c.getState().listings.length,1)});

import {handle} from '../web/api/p.ts';
import {sharedPropertyId} from '../src/agencies/properties/domain.ts';
test('shared old UUID page renders canonical URL and deep link',async()=>{
 const canonical=b,old=a;const row={id:canonical,title:'Casa canónica',location:'Vedado',province:'La Habana',type:'Casa',description:'Vivienda comprobada con origen conservado.',price:30000,area:null,bedrooms:2,bathrooms:1,amenities:[],photo_paths:[],owner_id:actor};
 const fetcher:typeof fetch=async(url)=>{const u=String(url);if(u.includes('kh_resolve_property_alias'))return Response.json(canonical);if(u.includes('/properties?'))return Response.json(u.includes(`id=eq.${canonical}`)?[row]:[]);if(u.includes('kh_public_profile'))return Response.json({id:actor,displayName:'Ana Pérez',level:'trusted',verified:false});throw Error(u)};
 const response=await handle(new Request(`https://fixture.invalid/p/${old}`),{supabaseUrl:'https://supabase.invalid',anonKey:'key',publicOrigin:'https://fixture.invalid'},fetcher);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes(`https://fixture.invalid/p/${canonical}`));assert.ok(html.includes(`karmahouse://property/${canonical}`));
});
test('public UUID request parser accepts dwelling links and rejects malformed paths',()=>{assert.equal(sharedPropertyId(a),a);assert.equal(sharedPropertyId(`https://karmahouse.vercel.app/p/${a}`),a);assert.throws(()=>sharedPropertyId('https://fixture.invalid/admin/anything'),/UUID/)});


test('duplicate review receives server canonical version instead of asking users for concurrency tokens',async()=>{const candidate={id,title:'Casa',location:'Vedado',version:7};const result=await repo({canonical:candidate,items:[],hasMore:false}).duplicateCandidates(id,0,context);assert.equal(result.canonical.version,7)});

import * as propertyDomain from '../src/agencies/properties/domain.ts';
test('catalog canonical resolution deduplicates old and current UUIDs',async()=>{const ids=await propertyDomain.resolvePropertyAliases([a,b,id],async value=>value===id?id:id,()=>{});assert.deepEqual(ids,[id])});
test('catalog canonical resolution rejects malformed and stale server replies',async()=>{await assert.rejects(propertyDomain.resolvePropertyAliases([a],async()=>({id}),()=>{}),/enlace/);let changed=false;await assert.rejects(propertyDomain.resolvePropertyAliases([a],async()=>{changed=true;return id},()=>{if(changed)throw Error('KH_ACCOUNT_CHANGED')}),/KH_ACCOUNT_CHANGED/)});
