import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminQueryController} from '../src/admin/queryController.ts';

function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const page=(items:string[],total=items.length)=>({items,total,hasMore:false});

test('a response from an old account or filter cannot overwrite current results',async()=>{
  const old=deferred<ReturnType<typeof page>>();
  const c=createAdminQueryController<string,string>(async(input)=>input==='old'?old.promise:page(['current']));
  c.setContext('actorA:old','old');const pending=c.load();
  c.setContext('actorB:new','new');await c.load();old.resolve(page(['private old']));await pending;
  assert.deepEqual(c.getSnapshot().page?.items,['current']);
  c.setContext('logout',null);assert.equal(c.getSnapshot().page,null);
});
test('failed refresh preserves the confirmed page and its results',async()=>{
  let fails=false;const c=createAdminQueryController<string,string>(async(_input,offset)=>{if(fails)throw new Error('offline');return page([String(offset)],60);});
  c.setContext('account:list','input');await c.load(40);fails=true;await c.refresh();
  assert.equal(c.getSnapshot().offset,40);assert.deepEqual(c.getSnapshot().page?.items,['40']);assert.match(c.getSnapshot().error??'',/offline/);
});
test('refresh replaces the visible results with the first page only after success',async()=>{
  const pending=deferred<ReturnType<typeof page>>();let initial=true;
  const c=createAdminQueryController<string,string>(async(_input,offset)=>initial?page([String(offset)],60):pending.promise);
  c.setContext('list','input');await c.load(40);initial=false;const request=c.refresh();
  assert.equal(c.getSnapshot().offset,40);assert.equal(c.getSnapshot().refreshing,true);
  pending.resolve(page(['fresh'],60));await request;assert.equal(c.getSnapshot().offset,0);
});
test('a shrinking result count recovers to the last valid page',async()=>{
  const offsets:number[]=[];const c=createAdminQueryController<string,string>(async(_input,offset)=>{offsets.push(offset);return page(offset===40?[]:['last'],21);});
  c.setContext('list','input');await c.load(40);assert.deepEqual(offsets,[40,20]);assert.equal(c.getSnapshot().offset,20);assert.deepEqual(c.getSnapshot().page?.items,['last']);
});
test('duplicate gestures join the same request and cancellation ignores late responses',async()=>{
  let calls=0;const pending=deferred<ReturnType<typeof page>>();const c=createAdminQueryController<string,string>(async()=>{calls++;return pending.promise;});
  c.setContext('list','input');const first=c.refresh();const second=c.refresh();assert.equal(calls,1);
  c.cancel();pending.resolve(page(['stale']));await Promise.all([first,second]);assert.equal(c.getSnapshot().page,null);assert.equal(c.getSnapshot().loading,false);
});
test('a synchronous transport failure can be retried',async()=>{
 let calls=0;const c=createAdminQueryController<string,string>(()=>{calls++;if(calls===1)throw new Error('temporary');return Promise.resolve(page(['recovered']));});
 c.setContext('list','input');await c.load();await c.refresh();assert.equal(calls,2);assert.deepEqual(c.getSnapshot().page?.items,['recovered']);
});
