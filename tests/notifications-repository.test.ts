// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseNotificationRepository, decodeNotification } from '../src/notifications/repository.ts';
const recipient='77000000-0000-4000-8000-000000000001', actor='77000000-0000-4000-8000-000000000002', id='77000000-0000-4000-8000-000000000003';
const row={id,seq:'9007199254740993',recipientId:recipient,actorId:actor,conversationId:id,messageId:id,negotiationId:null,category:'message',actorName:'Ana',propertyTitle:'Casa',title:'Nuevo mensaje',body:'Tienes un mensaje en tu conversación.',createdAt:'2026-09-20T10:00:00Z',readAt:null};
const page={items:[row],nextCursor:null,unreadCount:1,readThrough:row.seq};
function fixture(data=page){
  const calls=[],abort=new AbortController(); let changed=false;
  const context={userId:recipient,accessToken:'captured-token',signal:abort.signal,checkpoint(){if(changed)throw new Error('KH_ACCOUNT_CHANGED');}};
  const client={rpc(name,args){const call={name,args};calls.push(call);return{setHeader(k,v){call.header=[k,v];return this;},abortSignal(signal){call.signal=signal;return Promise.resolve({data:typeof data==='function'?data():data,error:null});}};}};
  return {repo:createSupabaseNotificationRepository(client),context,calls,abort,change(){changed=true;}};
}
test('list and summary bind captured identity, JWT and signal without sharing pagination',async()=>{
  const f=fixture(); assert.deepEqual(await f.repo.list({unreadOnly:true},f.context),page);
  assert.deepEqual(f.calls[0].args,{p_before_seq:null,p_unread_only:true,p_category:null,p_limit:30,p_actor_id:recipient});
  assert.deepEqual(f.calls[0].header,['Authorization','Bearer captured-token']); assert.equal(f.calls[0].signal,f.context.signal);
  const g=fixture({unreadCount:1,readThrough:row.seq});await g.repo.summary(g.context);assert.equal(g.calls[0].name,'kh_notification_summary');
});
test('recipient isolation and strict descending bounded cursors reject corrupt pages',async()=>{
  for(const patch of [
    {items:[{...row,recipientId:actor}]}, {items:[row,row]}, {items:[row,{...row,id:actor,seq:'9007199254740994'}]},
    {nextCursor:'12'}, {unreadCount:-1}, {readThrough:'9007199254740992'}, {items:[{...row,category:'unknown'}]},
  ]){const f=fixture({...page,...patch});await assert.rejects(f.repo.list({},f.context));}
  const f=fixture();await assert.rejects(f.repo.list({beforeSeq:row.seq},f.context));
  const g=fixture();await assert.rejects(g.repo.list({category:'visit'},g.context));
});
test('full seek page preserves a valid next cursor beyond safe integer precision',async()=>{
  const items=Array.from({length:30},(_,index)=>({...row,id:`77000000-0000-4000-8000-${String(index+100).padStart(12,'0')}`,seq:String(9007199254741100n-BigInt(index))}));
  const value={items,nextCursor:items.at(-1).seq,unreadCount:31,readThrough:items[0].seq};
  const f=fixture(value);
  assert.deepEqual(await f.repo.list({beforeSeq:'9007199254741101'},f.context),value);
});
test('decoder returns an explicit public shape, rejects self and malformed identities',()=>{
  assert.deepEqual(decodeNotification({...row,privateNote:'secret'}),row);
  for(const patch of [{actorId:recipient},{seq:9007199254740993},{negotiationId:actor},{readAt:'bad'},{category:'other'}]) assert.throws(()=>decodeNotification({...row,...patch}));
});
test('late session changes and aborted calls cannot publish data',async()=>{
  const f=fixture(()=>{f.change();return page;});await assert.rejects(f.repo.list({},f.context),/ACCOUNT_CHANGED/);
  const g=fixture();g.abort.abort();await assert.rejects(g.repo.summary(g.context),/ACCOUNT_CHANGED/);assert.equal(g.calls.length,0);
});
test('read operations preserve bigint cutoff and reject invalid server counts',async()=>{
  const f=fixture({unreadCount:0});await f.repo.markAllRead(row.seq,f.context);assert.equal(f.calls[0].args.p_through_seq,row.seq);
  await f.repo.markRead(id,f.context);assert.equal(f.calls[1].args.p_id,id);
  const g=fixture({unreadCount:1.2});await assert.rejects(g.repo.markRead(id,g.context));
  await assert.rejects(f.repo.markAllRead('01',f.context));
});
test('preferences validate versions and exact desired confirmation',async()=>{
  const desired={messages:false,visits:true,offers:true,expectedVersion:0};
  const f=fixture({messages:false,visits:true,offers:true,version:1});
  assert.equal((await f.repo.savePreferences(desired,f.context)).version,1);assert.deepEqual(f.calls[0].args.p_payload,desired);
  const g=fixture({messages:true,visits:true,offers:true,version:1});await assert.rejects(g.repo.savePreferences(desired,g.context));
  const h=fixture({messages:true,visits:true,offers:true,version:-1});await assert.rejects(h.repo.preferences(h.context));
});
