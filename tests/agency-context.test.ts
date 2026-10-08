import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgencyController} from '../src/agencies/controller.ts';
import {canPerformAgencyAction} from '../src/agencies/domain.ts';
import type {AgencyRepository} from '../src/agencies/repository.ts';
import type {AgencySummary,AgencyMembership} from '../src/agencies/types.ts';
const a='45000000-0000-4000-8001-000000000001',b='45000000-0000-4000-8001-000000000002';
const user='45000000-0000-4000-8000-000000000002';
const summary=(id=a):AgencySummary=>({id,tradeName:id,state:'approved',version:2,verified:true,verificationVersion:2,logoPath:null});
const member=(id=a):AgencyMembership=>({agencyId:id,userId:user,role:'admin',state:'active',version:1});
function deferred<T>(){let resolve!:(value:T)=>void, reject!:(error:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j});return {resolve,reject,promise};}
function fixture(){let agencies=[summary(),summary(b)],membership:AgencyMembership|null=member();let list=async()=>agencies;
 const repository={capabilities:async()=>({enabled:true}),listMine:()=>list(),membership:async(id:string)=>membership?{...membership,agencyId:id}:null} as unknown as AgencyRepository;
 const controller=createAgencyController(repository);controller.setSession({userId:user,accessToken:'first-token'});
 return {controller,setList:(fn:()=>Promise<AgencySummary[]>)=>{list=fn},setAgencies:(v:AgencySummary[])=>{agencies=v},setMember:(v:AgencyMembership|null)=>{membership=v}};
}
test('account_switch_discards_previous_response',async()=>{const f=fixture(),late=deferred<AgencySummary[]>();f.setList(()=>late.promise);const loading=f.controller.refreshAgencies();await Promise.resolve();f.controller.setSession({userId:'45000000-0000-4000-8000-000000000003',accessToken:'other-token'});late.resolve([summary()]);await loading;assert.deepEqual(f.controller.getSnapshot().agencies,[]);assert.equal(f.controller.getSnapshot().activeAgencyId,null);});
test('agency_switch_discards_success_and_error',async()=>{const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);const success=f.controller.captureAgencyContext(),failure=f.controller.captureAgencyContext();await f.controller.setActiveAgency(b);assert.equal(success.signal.aborted,true);assert.throws(success.checkpoint,/CONTEXT_CHANGED/);assert.throws(failure.checkpoint,/CONTEXT_CHANGED/);assert.equal(f.controller.captureAgencyContext().agencyId,b);success.release();failure.release();});
test('member_removal_clears_sensitive_cache',async()=>{const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);const old=f.controller.captureAgencyContext(),generation=old.generation;f.setMember(null);await f.controller.refreshAgencies();assert.equal(f.controller.getSnapshot().activeAgencyId,null);assert.equal(f.controller.getSnapshot().membership,null);assert.ok(f.controller.getSnapshot().generation>generation);assert.throws(old.checkpoint,/CONTEXT_CHANGED/);assert.equal(old.signal.aborted,true);});
test('admin_can_attend_deal_as_manager',()=>{for(const role of ['manager','coordinator','admin'] as const)assert.equal(canPerformAgencyAction(role,'manage_deal'),true);});
test('pending_agency_not_selectable_for_operations',async()=>{const f=fixture();f.setAgencies([{...summary(),state:'pending'}]);await f.controller.refreshAgencies();await assert.rejects(f.controller.setActiveAgency(a),/NOT_APPROVED/);assert.throws(f.controller.captureAgencyContext,/CONTEXT_REQUIRED/);});
test('verification_revocation_refreshes_badge_and_publication_hint',async()=>{const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);f.setAgencies([{...summary(),verified:false,verificationVersion:3}]);await f.controller.refreshAgencies();assert.equal(f.controller.getSnapshot().agencies[0].verified,false);assert.equal(f.controller.getSnapshot().activeAgencyId,a);});
test('role change invalidates previous writes while account requests survive an agency switch',async()=>{const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);const account=f.controller.captureAccountContext(),agency=f.controller.captureAgencyContext();f.setMember({...member(),role:'manager',version:2});await f.controller.refreshAgencies();assert.throws(agency.checkpoint,/CONTEXT_CHANGED/);assert.doesNotThrow(account.checkpoint);assert.equal(f.controller.getSnapshot().membership?.role,'manager');account.release();agency.release();});
test('overlapping refreshes keep the newest response and stale errors invisible',async()=>{const f=fixture(),late=deferred<AgencySummary[]>();f.setList(()=>late.promise);const old=f.controller.refreshAgencies();await Promise.resolve();f.setList(async()=>[summary(b)]);await f.controller.refreshAgencies();late.reject(Error('old private error'));await old;assert.deepEqual(f.controller.getSnapshot().agencies.map(x=>x.id),[b]);assert.equal(f.controller.getSnapshot().error,null);});
test('sign out aborts both account and agency requests; token refresh pins each request',async()=>{const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);const old=f.controller.captureAccountContext();f.controller.setSession({userId:user,accessToken:'refreshed-token'});assert.equal(old.accessToken,'first-token');assert.equal(f.controller.captureAccountContext().accessToken,'refreshed-token');f.controller.setSession(null);assert.equal(old.signal.aborted,true);assert.throws(old.checkpoint,/CONTEXT_CHANGED/);assert.deepEqual(f.controller.getSnapshot().agencies,[]);});
test('late transport success and error both fail after switching the selected agency',async()=>{
 const {scopedAdminRequest}=await import('../src/admin/request.ts');const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);
 const first=f.controller.captureAgencyContext(),second=f.controller.captureAgencyContext(),ok=deferred<string>(),failed=deferred<string>();
 const success=scopedAdminRequest(()=>ok.promise,first.checkpoint),error=scopedAdminRequest(()=>failed.promise,second.checkpoint);
 await f.controller.setActiveAgency(b);ok.resolve('private details from old agency');failed.reject(Error('private server error from old agency'));
 await assert.rejects(success,/CONTEXT_CHANGED/);await assert.rejects(error,/CONTEXT_CHANGED/);first.release();second.release();
});

test('definitive access rejection invalidates the captured agency immediately, not network errors',async()=>{
 const {createScopedRpc}=await import('../src/transfers/repository.ts');
 const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);
 let error:any={message:'Failed to fetch',code:''};
 const client={rpc(){return {setHeader(){return this},async abortSignal(){return {data:null,error}}}}};
 const rpc=createScopedRpc(client as any),c=f.controller.captureAgencyContext();
 await assert.rejects(rpc('kh_save_agency_task',{},c));assert.equal(f.controller.getSnapshot().activeAgencyId,a);
 for(const message of ['KH_AGENCY_INVALID','KH_AGENCY_DISABLED']){error={message,code:'P0001'};await assert.rejects(rpc('kh_save_agency_task',{},c));assert.equal(f.controller.getSnapshot().activeAgencyId,a);}
 error={message:'KH_AGENCY_DEAL_NOT_FOUND',code:'42501'};
 await assert.rejects(rpc('kh_save_agency_task',{},c));assert.equal(f.controller.getSnapshot().activeAgencyId,null);assert.equal(c.signal.aborted,true);c.release();
});
test('late authorization denial from an old captured scope cannot clear the new agency',async()=>{
 const {createScopedRpc}=await import('../src/transfers/repository.ts');const f=fixture();await f.controller.refreshAgencies();await f.controller.setActiveAgency(a);
 const c=f.controller.captureAgencyContext(),late=deferred<any>();
 const client={rpc(){return {setHeader(){return this},abortSignal(){return late.promise}}}};
 const response=createScopedRpc(client as any)('kh_save_agency_task',{},c);
 await f.controller.setActiveAgency(b);late.resolve({data:null,error:{message:'KH_AGENCY_DEAL_NOT_FOUND',code:'42501'}});
 await assert.rejects(response,/CONTEXT_CHANGED/);assert.equal(f.controller.getSnapshot().activeAgencyId,b);c.release();
});

test('cancelled route selection cannot publish a membership after leaving its screen',async()=>{
 const late=deferred<AgencyMembership>();let focused=true;
 const repository={capabilities:async()=>({enabled:true}),listMine:async()=>[summary()],membership:()=>late.promise} as unknown as AgencyRepository;
 const controller=createAgencyController(repository);controller.setSession({userId:user,accessToken:'route-token'});await controller.refreshAgencies();
 const selection=controller.setActiveAgencyForRead(a,()=>focused);focused=false;late.resolve(member());await selection;
 assert.equal(controller.getSnapshot().activeAgencyId,null);assert.equal(controller.getSnapshot().membership,null);assert.equal(controller.getSnapshot().error,null);
});
