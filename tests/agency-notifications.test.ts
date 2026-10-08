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
 assert.equal(await prepareAgencyNotificationTarget({route:'team',agencyId:null,dealId:null},adapter),'/agency-team');assert.throws(()=>old.checkpoint());assert.equal(w.getSnapshot().activeAgencyId,null);
 assert.equal(await prepareAgencyNotificationTarget({route:'buyer_conversation',agencyId:null,dealId:agency},adapter),`/agency-conversation/${agency}`);
 assert.equal(await prepareAgencyNotificationTarget({route:'account_notice',agencyId:null,dealId:null},adapter),'/notifications');
 w.setSession(null);await assert.rejects(prepareAgencyNotificationTarget({route:'reviews',agencyId:null,dealId:null},adapter),/SESSION/);
});
test('staff notification opens only after a fresh membership validation and aborts prior context',async()=>{
 const {w,adapter,repository}=workspace();await w.refreshAgencies();await w.setActiveAgency(agency);const old=w.captureAgencyContext();
 assert.equal(await prepareAgencyNotificationTarget({route:'deal',agencyId:agency,dealId:user},adapter),`/agency-deal/${user}`);assert.throws(()=>old.checkpoint());
 repository.membership=async()=>null;await assert.rejects(prepareAgencyNotificationTarget({route:'verification',agencyId:agency,dealId:null},adapter));assert.equal(w.getSnapshot().activeAgencyId,null);
});
test('an account switch during membership validation cannot navigate using a stale response',async()=>{
 const {w,adapter,repository}=workspace();await w.refreshAgencies();
 repository.membership=async()=>{w.setSession({userId:agency,accessToken:'other'});return {agencyId:agency,userId:user,state:'active',role:'admin',version:1}};
 await assert.rejects(prepareAgencyNotificationTarget({route:'deal',agencyId:agency,dealId:user},adapter));assert.equal(w.getSnapshot().activeAgencyId,null);
});
