import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeNotification,createSupabaseNotificationRepository} from '../src/notifications/repository.ts';
import {createPushRepository} from '../src/push/repository.ts';
const user='45000000-0000-4000-8000-000000000001', agency='45000000-0000-4000-8000-000000000002';
const context={userId:user,accessToken:'captured',sessionId:agency,signal:new AbortController().signal,checkpoint(){}};
const notice={id:agency,seq:'1',recipientId:user,actorId:agency,category:'agency',agencyId:agency,dealId:null,saleRequestId:null,verificationRequestId:null,eventKind:'team_invitation',conversationId:null,messageId:null,negotiationId:null,propertyId:null,savedSearchId:null,actorName:'KarmaHouse',propertyTitle:'',title:'Actualización de agencia',body:'Tienes una actualización de agencia.',createdAt:'2026-10-08T12:00:00Z',readAt:null};
test('agency notifications decode only the exact event enum',()=>{assert.equal(decodeNotification(notice).eventKind,'team_invitation');assert.throws(()=>decodeNotification({...notice,eventKind:'agency_message'}));});
test('new clients explicitly include agencies in summaries and read-all',async()=>{const calls:any[]=[];const client:any={rpc(name:any,args:any){calls.push([name,args]);return {setHeader(){return this},abortSignal(){return Promise.resolve({data:name==='kh_read_notifications_through'?{unreadCount:0}:{unreadCount:0,readThrough:'0'},error:null})}}}};const repo=createSupabaseNotificationRepository(client);await repo.summary(context);await repo.markAllRead('0',context);assert.ok(calls.every(([,args])=>args.p_include_agencies===true));});
test('push resolution accepts account invitation destination without a staff agency',async()=>{const repo=createPushRepository('http://local.invalid','key',async()=>new Response(JSON.stringify({notificationId:agency,recipientId:user,conversationId:null,propertyId:null,agencyTarget:{route:'team',agencyId:null,dealId:null}})));assert.deepEqual((await repo.resolve(agency,context) as any).agencyTarget,{route:'team',agencyId:null,dealId:null});});

import {prepareAgencyNotificationTarget} from '../src/notifications/agencyNavigation.ts';
import {createAgencyController} from '../src/agencies/controller.ts';
function workspace(){
 const repository:any={capabilities:async()=>({enabled:true}),listMine:async()=>[{id:agency,state:'approved'}],membership:async()=>({agencyId:agency,userId:user,state:'active',role:'admin',version:1})};
 const w=createAgencyController(repository);w.setSession({userId:user,accessToken:'captured'});
 return {w,repository,adapter:{...w,getCurrentWorkspace:w.getSnapshot}};
}
test('account invitations and buyer history clear staff context without selecting a fictitious membership',async()=>{
 const {w,adapter}=workspace();await w.refreshAgencies();await w.setActiveAgency(agency);const old=w.captureAgencyContext();
 assert.equal(await preparedPath({route:'team',agencyId:null,dealId:null},adapter),'/agency-team');assert.throws(()=>old.checkpoint());assert.equal(w.getSnapshot().activeAgencyId,null);
 assert.equal(await preparedPath({route:'buyer_conversation',agencyId:null,dealId:agency},adapter),`/agency-conversation/${agency}`);
 assert.equal(await preparedPath({route:'account_notice',agencyId:null,dealId:null},adapter),'/notifications');
 w.setSession(null);await assert.rejects(prepareAgencyNotificationTarget({route:'reviews',agencyId:null,dealId:null},adapter),/SESSION/);
});
test('staff notification opens only after a fresh membership validation and aborts prior context',async()=>{
 const {w,adapter,repository}=workspace();await w.refreshAgencies();await w.setActiveAgency(agency);const old=w.captureAgencyContext();
 assert.equal(await preparedPath({route:'deal',agencyId:agency,dealId:user},adapter),`/agency-deal/${user}`);assert.throws(()=>old.checkpoint());
 repository.membership=async()=>null;await assert.rejects(prepareAgencyNotificationTarget({route:'verification',agencyId:agency,dealId:null},adapter));assert.equal(w.getSnapshot().activeAgencyId,null);
});
test('an account switch during membership validation cannot navigate using a stale response',async()=>{
 const {w,adapter,repository}=workspace();await w.refreshAgencies();
 repository.membership=async()=>{w.setSession({userId:agency,accessToken:'other'});return {agencyId:agency,userId:user,state:'active',role:'admin',version:1}};
 await assert.rejects(prepareAgencyNotificationTarget({route:'deal',agencyId:agency,dealId:user},adapter));assert.equal(w.getSnapshot().activeAgencyId,null);
});

// The legacy path branch models the old hook's unguarded router.push after await.
// A prepared dispatch must retain authorization through this exact final handoff.
function dispatchPrepared(prepared:any,routes:string[],outer?:()=>void){
 if(typeof prepared==='string')routes.push(prepared);
 else prepared.dispatch((path:string)=>routes.push(path),outer);
}
test('sign-out in the microtask after preparation prevents final agency navigation',async()=>{
 const {w,adapter}=workspace(),routes:string[]=[];
 const prepared=await prepareAgencyNotificationTarget({route:'deal',agencyId:agency,dealId:user},adapter);
 queueMicrotask(()=>w.setSession(null));await Promise.resolve();
 assert.equal(w.getSessionUserId(),null);
 assert.throws(()=>dispatchPrepared(prepared,routes),/CONTEXT_CHANGED/);assert.deepEqual(routes,[]);
});
test('a staff generation change after preparation prevents final navigation even for the same account',async()=>{
 const {w,adapter}=workspace(),routes:string[]=[];
 const prepared=await prepareAgencyNotificationTarget({route:'deal',agencyId:agency,dealId:user},adapter);
 await new Promise<void>((resolve,reject)=>queueMicrotask(()=>{w.setActiveAgency(agency).then(resolve,reject)}));
 assert.equal(w.getSnapshot().activeAgencyId,agency);
 assert.equal(w.getSessionUserId(),user);
 assert.throws(()=>dispatchPrepared(prepared,routes),/CONTEXT_CHANGED/);assert.deepEqual(routes,[]);
});
test('inbox resolution guard is checked inside the final synchronous dispatch before routing',async()=>{
 const {adapter}=workspace(),routes:string[]=[];
 const prepared=await prepareAgencyNotificationTarget({route:'team',agencyId:null,dealId:null},adapter);
 let current=true;queueMicrotask(()=>{current=false});await Promise.resolve();
 assert.throws(()=>dispatchPrepared(prepared,routes,()=>{if(!current)throw Error('KH_ACCOUNT_CHANGED')}),/ACCOUNT_CHANGED/);
 assert.deepEqual(routes,[]);
});
async function preparedPath(...args:Parameters<typeof prepareAgencyNotificationTarget>){
 let path='';const prepared=await prepareAgencyNotificationTarget(...args);prepared.dispatch(value=>{path=value});return path;
}
