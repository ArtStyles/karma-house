import test from 'node:test';import assert from 'node:assert/strict';import {createListingTransferController} from '../src/transfers/controller.ts';import {transferRow,recipient,requestId} from './helpers/transferFixtures.ts';import type {ListingTransferRepository,DecideTransferInput} from '../src/transfers/types.ts';
const storage=()=>{const map=new Map<string,string>();return {async getItem(k:string){return map.get(k)??null;},async setItem(k:string,v:string){map.set(k,v);},async removeItem(k:string){map.delete(k);}};};
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
