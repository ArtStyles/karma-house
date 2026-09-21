import assert from 'node:assert/strict';
import test from 'node:test';
import { createNegotiationsController } from '../src/negotiations/controller.ts';
import type { Negotiation, NegotiationRepository } from '../src/negotiations/types.ts';

const actor='31000000-0000-4000-8000-000000000001',other='31000000-0000-4000-8000-000000000002',conversation='31000000-0000-4000-8000-000000000003';
const make=(id='request', status:Negotiation['status']='pending'):Negotiation=>({id,conversationId:conversation,propertyId:'property',propertyTitle:'Casa',propertyLocation:'Vedado',buyerId:actor,sellerId:other,createdBy:actor,kind:'offer',status,version:1,amountUsd:50000,visitDate:null,visitTime:null,visitAt:null,note:'',createdAt:'2026-09-20T12:00:00Z',updatedAt:'2026-09-20T12:00:00Z',parentId:null,expiresAt:'2026-09-27T12:00:00Z',canAct:true});
const input={conversationId:conversation,kind:'offer' as const,clientRequestId:'31000000-0000-4000-8000-000000000004',amountUsd:'50000',note:''};
function deferred<T>(){let resolve!:(value:T)=>void;return{promise:new Promise<T>(r=>{resolve=r}),resolve};}
const repository=(overrides:Partial<NegotiationRepository>={}):NegotiationRepository=>({list:async()=>[],create:async()=>make(),respond:async()=>make('request','accepted'),...overrides});

test('account changes abort and discard late negotiation reads and reject stale actions',async()=>{
  const read=deferred<Negotiation[]>();let context:any,creates=0;
  const controller=createNegotiationsController(repository({list:async(_query,c)=>{context=c;return read.promise},create:async()=>{creates++;return make()}}));
  controller.setSession(actor,'old-token');const pending=controller.refresh();
  controller.setSession(other,'new-token');assert.equal(context.signal.aborted,true);
  read.resolve([make()]);await pending;
  assert.equal(controller.getState().userId,other);assert.deepEqual(controller.getState().items,[]);
  await assert.rejects(controller.create(input,actor));assert.equal(creates,0);
});

test('a read started before a mutation cannot overwrite its accepted result',async()=>{
  const oldRead=deferred<Negotiation[]>();let reads=0;
  const controller=createNegotiationsController(repository({list:async()=>++reads===1?oldRead.promise:[make('new')],create:async()=>make('new')}));
  controller.setSession(actor,'token');const old=controller.refresh();
  const accepted=await controller.create(input,actor);assert.equal(accepted.id,'new');
  oldRead.resolve([make('old')]);await old;
  assert.deepEqual(controller.getState().items.map(item=>item.id),['new']);
});

test('paging is requested at the server and deduplicates overlapping records',async()=>{
  const offsets:number[]=[];
  const controller=createNegotiationsController(repository({list:async(query)=>{offsets.push(query.offset);assert.equal(query.pendingOnly,true);return query.offset===0?Array.from({length:30},(_,i)=>make(String(i))):[make('29'),make('30')];}}),{pendingOnly:true});
  controller.setSession(actor,'token');await controller.refresh();assert.equal(controller.getState().hasMore,true);
  await controller.loadMore();assert.deepEqual(offsets,[0,30]);assert.equal(controller.getState().items.length,31);assert.equal(controller.getState().hasMore,false);
});

test('failed mutation is not success and manual retry keeps the caller request identifier',async()=>{
  const ids:string[]=[];let first=true;
  const controller=createNegotiationsController(repository({create:async(value,c)=>{assert.equal(c.accessToken,'captured');ids.push(value.clientRequestId);if(first){first=false;throw Error('offline')}return make();},list:async()=>[make()]}));
  controller.setSession(actor,'captured');await assert.rejects(controller.create(input,actor));
  assert.deepEqual(controller.getState().items,[]);assert.equal(controller.getState().mutating,false);
  await controller.create(input,actor);assert.deepEqual(ids,[input.clientRequestId,input.clientRequestId]);assert.equal(controller.getState().items.length,1);
});

test('confirmed mutation remains successful if its follow-up refresh fails',async()=>{
  const controller=createNegotiationsController(repository({list:async()=>{throw Error('network');}}),{pendingOnly:true});
  controller.setSession(actor,'token');const item=await controller.create(input,actor);
  assert.equal(item.id,'request');assert.equal(controller.getState().items[0].id,'request');assert.ok(controller.getState().error);
});

test('switching identity while mutating cannot expose the result or clear a new session',async()=>{
  const result=deferred<Negotiation>();const controller=createNegotiationsController(repository({create:async()=>result.promise}));
  controller.setSession(actor,'token');const operation=controller.create(input,actor);
  controller.setSession(other,'other-token');result.resolve(make());await assert.rejects(operation);
  assert.deepEqual(controller.getState().items,[]);assert.equal(controller.getState().userId,other);assert.equal(controller.getState().mutating,false);
});

test('read failures recover and disposed controllers can remount in StrictMode',async()=>{
  let first=true;const controller=createNegotiationsController(repository({list:async()=>{if(first){first=false;throw Error('offline')}return [make()]}}));
  controller.setSession(actor,'token');await controller.refresh();assert.equal(controller.getState().ready,true);assert.ok(controller.getState().error);
  await controller.refresh();assert.equal(controller.getState().error,null);
  controller.dispose();controller.setSession(actor,'new-token');await controller.refresh();assert.equal(controller.getState().items.length,1);
});

test('automatic refresh preserves loaded history pages while manual refresh starts over',async()=>{
  const offsets:number[]=[];
  const controller=createNegotiationsController(repository({list:async({offset})=>{offsets.push(offset);return Array.from({length:30},(_,i)=>make(String(offset+i)));}}));
  controller.setSession(actor,'token');await controller.refresh();await controller.loadMore();await controller.autoRefresh();
  assert.equal(controller.getState().items.length,60);assert.deepEqual(offsets,[0,30]);
  await controller.refresh();assert.equal(controller.getState().items.length,30);assert.deepEqual(offsets,[0,30,0]);
});

test('leaving and returning to the same actor still invalidates its old request',async()=>{
  const result=deferred<Negotiation>();const controller=createNegotiationsController(repository({create:async()=>result.promise}));
  controller.setSession(actor,'old');const pending=controller.create(input,actor);
  controller.setSession(other,'other');controller.setSession(actor,'new');
  result.resolve(make());await assert.rejects(pending);assert.deepEqual(controller.getState().items,[]);
});

test('confirmed mutation resolves without waiting for the follow-up read',async()=>{
  const read=deferred<Negotiation[]>();const controller=createNegotiationsController(repository({list:async()=>read.promise}));
  controller.setSession(actor,'token');await controller.create(input,actor);
  assert.equal(controller.getState().items[0].id,'request');assert.equal(controller.getState().mutating,false);
  read.resolve([make()]);
});

test('automatic refresh never aborts a slow first page or pagination request',async()=>{
  const first=deferred<Negotiation[]>(),second=deferred<Negotiation[]>();let calls=0;const signals:AbortSignal[]=[];
  const controller=createNegotiationsController(repository({list:async(_query,context)=>{signals.push(context.signal);return ++calls===1?first.promise:second.promise}}));
  controller.setSession(actor,'token');const initial=controller.refresh();await controller.autoRefresh();assert.equal(calls,1);assert.equal(signals[0].aborted,false);
  first.resolve(Array.from({length:30},(_,i)=>make(String(i))));await initial;
  const more=controller.loadMore();await controller.autoRefresh();assert.equal(calls,2);assert.equal(signals[1].aborted,false);
  second.resolve([make('30')]);await more;assert.equal(controller.getState().items.length,31);
});

test('counterproposal ACK preserves its superseded original if history refresh fails',async()=>{
  let reads=0;const counter={...make('alternative'),parentId:'original'};
  const controller=createNegotiationsController(repository({list:async()=>{if(reads++)throw Error('offline');return[make('original')]},create:async()=>counter}));
  controller.setSession(actor,'token');await controller.refresh();await controller.create({...input,replacesId:'original',expectedVersion:1},actor);
  assert.equal(controller.getState().items.find(item=>item.id==='original')?.status,'superseded');
  assert.equal(controller.getState().items.find(item=>item.id==='original')?.version,2);assert.equal(controller.getState().items[0].id,'alternative');
});
