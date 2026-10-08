import test from 'node:test';import assert from 'node:assert/strict';import {createListingTransferController} from '../src/transfers/controller.ts';import {transferRow,recipient,requestId} from './helpers/transferFixtures.ts';import type {ListingTransferRepository,DecideTransferInput} from '../src/transfers/types.ts';
const storage=()=>{const map=new Map<string,string>();return {async getItem(k:string){return map.get(k)??null;},async setItem(k:string,v:string){map.set(k,v);},async removeItem(k:string){map.delete(k);}};};
import {createTransferManagementReconciler} from '../src/transfers/reconcileManagement.ts';
test('refresh after accepted write and lost GET reconciles ownership once without retrying the decision',async()=>{
 let accepted=false,getFails=false,decisions=0;const invalidated:string[][]=[];
 const terminal={...transferRow,state:'accepted' as const,effectiveState:'accepted' as const,requestVersion:2,canAccept:false};
 const repo:ListingTransferRepository={list:async()=>({items:[],hasMore:false}),offer:async()=>transferRow,get:async()=>{if(getFails)throw Error('network timeout');return accepted?terminal:transferRow;},decide:async()=>{decisions++;accepted=true;getFails=true;return {requestId,state:'accepted',requestVersion:2,reasonCode:null,propertyVersions:[]};}};
 const c=createListingTransferController(repo,storage(),()=>requestId),reconcile=createTransferManagementReconciler();c.activate({userId:recipient,accessToken:'token'});
 c.subscribe(()=>reconcile(c.getState().opened,async ids=>{invalidated.push([...ids]);}));
 await c.open(requestId);await assert.rejects(c.decide({requestId,expectedRequestVersion:1,decision:'accept'}));assert.equal(invalidated.length,0);
 getFails=false;await c.open(requestId);await c.open(requestId);
 assert.deepEqual(invalidated,[transferRow.items.map(item=>item.propertyId)]);assert.equal(decisions,1);assert.equal(c.getState().opened?.effectiveState,'accepted');
});
test('lost response and double touch reuse one persisted logical decision after restart',async()=>{
 const payloads:DecideTransferInput[]=[];let release!:()=>void;const wait=new Promise<void>(r=>release=r);let fails=true;
 const repository:ListingTransferRepository={list:async()=>({items:[transferRow],hasMore:false}),get:async()=>transferRow,offer:async()=>transferRow,decide:async p=>{payloads.push(p);await wait;if(fails)throw Error('network timeout');return {requestId,state:'accepted',requestVersion:2,reasonCode:null,propertyVersions:[{propertyId:requestId,version:2}]};}};
 const saved=storage(),controller=createListingTransferController(repository,saved,()=>requestId);controller.activate({userId:recipient,accessToken:'token'});
 const input={requestId,expectedRequestVersion:1,decision:'accept' as const};const one=controller.decide(input),two=controller.decide(input);release();await assert.rejects(one);await assert.rejects(two);assert.equal(payloads.length,1);
 fails=false;const restarted=createListingTransferController(repository,saved,()=>{throw Error('must reuse saved token');});restarted.activate({userId:recipient,accessToken:'new-token'});await restarted.decide(input);assert.equal(payloads[0].clientRequestId,payloads[1].clientRequestId);
});
test('a late refresh never exposes requests or error under a changed actor',async()=>{
 let release!:(value:unknown)=>void;const pending=new Promise(r=>release=r);const repo={list:async()=>await pending,get:async()=>transferRow} as ListingTransferRepository;
 const c=createListingTransferController(repo,storage(),()=>requestId);c.activate({userId:recipient,accessToken:'a'});const read=c.refresh();c.activate({userId:requestId,accessToken:'b'});release({items:[transferRow],hasMore:false});await read;assert.deepEqual(c.getState().items,[]);assert.equal(c.getState().error,null);
});

test('refreshing an opened transfer retains its snapshot through a transient failure',async()=>{
 let failure=false,release!:()=>void;
 const wait=new Promise<void>(done=>release=done);
 const repo={get:async()=>{if(failure){await wait;throw Error('network timeout');}return transferRow;}} as ListingTransferRepository;
 const c=createListingTransferController(repo,storage(),()=>requestId);c.activate({userId:recipient,accessToken:'token'});
 await c.open(requestId);failure=true;const refreshing=c.open(requestId);
 assert.equal(c.getState().opened?.id,requestId);
 assert.equal(c.getState().loading,true);
 release();await refreshing;
 assert.equal(c.getState().opened?.id,requestId);
 assert.equal(c.getState().loading,false);
 assert.ok(c.getState().error);
});

test('a revoked transfer clears its private snapshot while a different route never shows the old one',async()=>{
 let target=requestId,denied=false;
 const repo={get:async(id:string)=>{if(denied)throw Error('KH_TRANSFER_NOT_FOUND');return {...transferRow,id};}} as ListingTransferRepository;
 const c=createListingTransferController(repo,storage(),()=>requestId);c.activate({userId:recipient,accessToken:'token'});
 await c.open(requestId);denied=true;await c.open(requestId);assert.equal(c.getState().opened,null);
 denied=false;await c.open(requestId);target='64000000-0000-4000-8000-000000000001';const next=c.open(target);
 assert.equal(c.getState().opened,null);await next;assert.equal(c.getState().opened?.id,target);
});

test('simultaneous transfer gestures share one read, including initial focus',async()=>{
 let calls=0,release!:()=>void;const wait=new Promise<void>(done=>release=done);
 const repo={get:async()=>{calls++;await wait;return transferRow;}} as ListingTransferRepository;
 const c=createListingTransferController(repo,storage(),()=>requestId);c.activate({userId:recipient,accessToken:'token'});
 const first=c.open(requestId),second=c.open(requestId);assert.equal(calls,1);release();await Promise.all([first,second]);
 assert.equal(c.getState().opened?.id,requestId);
});
