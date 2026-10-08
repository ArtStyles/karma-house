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

test('invitation response must match the recipient selected by the administrator',async()=>{
 const other='45000000-0000-4000-8000-000000000003';
 const response={id:'45000000-0000-4000-8002-000000000001',agencyId:agency,recipientId:other,role:'manager',state:'pending',version:1,expiresAt:'2026-10-15T12:00:00Z'};
 await assert.rejects(repository(response).inviteMember({userId:actor,role:'manager',clientRequestId:'45000000-0000-4000-8002-000000000002'},context),/interpretar/);
});
test('PostgREST error objects preserve the actionable agency rule without exposing raw detail',async()=>{
 const {agencyError}=await import('../src/agencies/domain.ts');assert.match(agencyError({message:'KH_AGENCY_LAST_ADMIN',details:'private user data'}),/al menos un administrador/);
});

test('invitation response must match the role selected by administrator',async()=>{const response={id:'45000000-0000-4000-8002-000000000001',agencyId:agency,recipientId:actor,role:'admin',state:'pending',version:1,expiresAt:'2026-10-15T12:00:00Z'};await assert.rejects(repository(response).inviteMember({userId:actor,role:'manager',clientRequestId:'45000000-0000-4000-8002-000000000002'},context),/interpretar/);});
