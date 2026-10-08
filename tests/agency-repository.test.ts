import test from 'node:test';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
import {createAgencyRepository} from '../src/agencies/repository.ts';
const actor='45000000-0000-4000-8000-000000000002',agency='45000000-0000-4000-8001-000000000001';
const context={userId:actor,accessToken:'captured-token',signal:new AbortController().signal,checkpoint(){},agencyId:agency,generation:1};
const summary={id:agency,tradeName:'Casas Habana',state:'approved',version:2,logoPath:null,verified:false,verificationVersion:1};
function repository(response:unknown,observe?:(url:string,init:RequestInit)=>void){
 const client=createClient('https://fixture.invalid','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{observe?.(String(url),init??{});return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});}}});
 return createAgencyRepository(client);
}
test('agency repository pins membership lookup to the captured actor and JWT',async()=>{
 let observed=false;const repo=repository({agencyId:agency,userId:actor,role:'manager',state:'active',version:1},(url,init)=>{
  assert.match(url,/kh_agency_membership$/);assert.equal(new Headers(init.headers).get('Authorization'),'Bearer captured-token');
  assert.deepEqual(JSON.parse(String(init.body)),{p_agency_id:agency,p_actor_id:actor});observed=true;
 });const member=await repo.membership(agency,context);assert.equal(member?.role,'manager');assert.equal(observed,true);
});
test('repository rejects membership or verification data belonging to another agency',async()=>{
 await assert.rejects(repository({agencyId:'45000000-0000-4000-8001-000000000002',userId:actor,role:'manager',state:'active',version:1}).membership(agency,context),/interpretar/);
 await assert.rejects(repository([{...summary,verified:'true'}]).listMine(context),/interpretar/);
});
test('cancelled contexts discard stale successful responses',async()=>{
 let changed=false;const repo=repository([summary],()=>{changed=true});
 await assert.rejects(repo.listMine({...context,checkpoint(){if(changed)throw Error('KH_ACCOUNT_CHANGED')}}),/KH_ACCOUNT_CHANGED/);
});

