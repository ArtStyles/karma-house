import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {deleteAccount} from '../src/auth/deleteAccount.ts';
import {createAgencyRepository} from '../src/agencies/repository.ts';
const actor='45000000-0000-4000-8000-000000000001',agency='45000000-0000-4000-8001-000000000001';
test('business media omitted from the receipt is never inferred from uploader prefix',async()=>{
 const retained=`${actor}/business/photo.jpg`,orphan=`${actor}/orphan/photo.jpg`,remaining=new Set([retained,orphan]);
 const calls:string[]=[];
 const client={rpc(name:string){calls.push(name);return {setHeader:()=>Promise.resolve({data:name==='kh_begin_account_deletion'?{'property-photos':[orphan],'account-avatars':[]}:null,error:null})}},storage:{from(bucket:string){assert.equal(bucket,'property-photos');return {async remove(names:string[]){for(const n of names)remaining.delete(n);return {error:null}}}}}};
 await deleteAccount(client as never,{id:actor,accessToken:'pinned'},()=>{});
 assert.deepEqual([...remaining],[retained]);assert.deepEqual(calls,['kh_begin_account_deletion','kh_delete_account']);
});
test('recovery sends explicit replacement and evidence reason under pinned owner context',async()=>{
 let body:unknown;
 const summary={id:agency,tradeName:'Casas',state:'approved',version:4,logoPath:null,verified:false,verificationVersion:3};
 const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{assert.match(String(url),/kh_admin_recover_agency$/);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer pinned');body=JSON.parse(String(init?.body));return new Response(JSON.stringify(summary),{headers:{'Content-Type':'application/json'}})}}});
 const input={agencyId:agency,newAdminId:'45000000-0000-4000-8000-000000000002',expectedVersion:3,reason:'Identidad del responsable comprobada',clientRequestId:'45000000-0000-4000-8002-000000000001'};
 const context={userId:actor,accessToken:'pinned',signal:new AbortController().signal,checkpoint(){}};
 const result=await createAgencyRepository(client).recoverAgency(input,context);
 assert.equal(result.verified,false);assert.deepEqual(body,{p_payload:input,p_actor_id:actor});
});
