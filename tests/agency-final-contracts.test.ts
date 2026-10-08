import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {prepareAgencyShare,validatePublicAgencyShare,agencyShareUrl} from '../src/agencies/share.ts';
import {createAgencyProfileRepository} from '../src/agencies/profile.ts';
import {createAgencyController} from '../src/agencies/controller.ts';
import {createAgencyMessagingRepository} from '../src/agencies/messaging/repository.ts';
import {readIncomingAgencyMessages} from '../src/agencies/messaging/live.ts';
import {spawnSync} from 'node:child_process';
const actor='45000000-0000-4000-8000-000000000009',agency='45000000-0000-4000-8001-000000000001',other='45000000-0000-4000-8001-000000000002',id='45000000-0000-4000-8002-000000000001';
const c={userId:actor,agencyId:agency,generation:1,accessToken:'captured',signal:new AbortController().signal,checkpoint(){}};
const client=(fetcher:typeof fetch)=>createClient('https://fixture.invalid','key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});
test('share producer pins current agency JWT and renders canonical link; public stale context returns fallback',async()=>{
 const canonical=other;let calls=0;
 const db=client(async(url,init)=>{calls++;const args=JSON.parse(String(init?.body));if(String(url).endsWith('/kh_agency_share_context')){assert.equal(new Headers(init?.headers).get('authorization'),'Bearer captured');assert.deepEqual(args,{p_actor_id:actor,p_agency_id:agency,p_property_id:id,p_manager_id:actor});return Response.json({propertyId:canonical,agencyId:agency,managerId:actor});}return Response.json(null);});
 assert.equal(agencyShareUrl(await prepareAgencyShare(db,id,c)),`https://karmahouse.vercel.app/p/${canonical}?agencyId=${agency}&managerId=${actor}`);
 assert.equal(await validatePublicAgencyShare(db,id,agency,actor),null);assert.equal(calls,2);
});
test('commercial edit cannot send private application fields and rejects cross-agency return',async()=>{
 const repo=createAgencyProfileRepository(client(async()=>Response.json({agencyId:other})));
 await assert.rejects(repo.get(c),/otra agencia/);
 await assert.rejects(repo.save({input:{responsibleFullName:'private'} as any,expectedVersion:1,clientRequestId:id},c),/inválido/);
});
for(const change of ['account','agency','removed'] as const)test(`live history delayed success and error cannot restore private scope after ${change}`,async()=>{
 for(const fail of [false,true]){
  let membership:any={agencyId:agency,userId:actor,role:'admin',state:'active',version:1};
  const controller=createAgencyController({capabilities:async()=>({enabled:true}),listMine:async()=>[agency,other].map(id=>({id,tradeName:id,state:'approved',version:1,verified:false,verificationVersion:1,logoPath:null})),membership:async(a:string)=>membership?{...membership,agencyId:a}:null} as any);
  controller.setSession({userId:actor,accessToken:'captured'});await controller.refreshAgencies();await controller.setActiveAgency(agency);const scope=controller.captureAgencyReadContext();
  let finish!:(value:any)=>void;const response=new Promise<any>(r=>finish=r);
  const repo=createAgencyMessagingRepository({rpc(){return{setHeader(){return this},abortSignal(){return response;}}}} as any);
  const result=readIncomingAgencyMessages(repo,id,[],false,scope);
  if(change==='account')controller.setSession({userId:id,accessToken:'different'});
  if(change==='agency')await controller.setActiveAgency(other);
  if(change==='removed'){membership=null;await controller.refreshAgencies();}
  finish(fail?{data:null,error:{message:'old private failure',code:'42501'}}:{data:{items:[],hasMore:false},error:null});
  await assert.rejects(result,/CONTEXT_CHANGED/);assert.equal(scope.signal.aborted,true);if(change==='agency')assert.equal(controller.getSnapshot().activeAgencyId,other);scope.release();
 }
});
test('explicit unmatched concurrency filter fails nonzero without running a case',()=>{
 const child=spawnSync(process.execPath,['scripts/local-sql/verify-agency-concurrency.mjs','definitely_no_case_for_final_typo'],{env:{...process.env,KH_LOCAL_DATABASE_URL:'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007'},encoding:'utf8',timeout:10000});
 assert.notEqual(child.status,0);assert.match(child.stderr,/No concurrency cases match/);assert.doesNotMatch(child.stdout,/BARRIER|PASS/);
});
