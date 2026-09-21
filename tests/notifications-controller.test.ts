import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationsController } from '../src/notifications/controller.ts';
import type { AppNotification, NotificationPage, NotificationPreferences, NotificationRepository } from '../src/notifications/types.ts';

const actor='51000000-0000-4000-8000-000000000001',other='51000000-0000-4000-8000-000000000002';
const prefs:NotificationPreferences={messages:true,visits:true,offers:true,version:0};
const item=(seq='9007199254740993',readAt:string|null=null):AppNotification=>({id:`notice-${seq}`,seq,recipientId:actor,category:'message',conversationId:'conversation',messageId:'message',negotiationId:null,actorId:other,actorName:'Persona',propertyTitle:'Casa',title:'Nuevo mensaje',body:'Tienes actividad en una conversación.',createdAt:'2026-09-20T14:00:00Z',readAt});
const page=(items:AppNotification[],nextCursor:string|null=null,unreadCount=items.filter(value=>!value.readAt).length,readThrough=items[0]?.seq??'0'):NotificationPage=>({items,nextCursor,unreadCount,readThrough});
const repository=(partial:Partial<NotificationRepository>={}):NotificationRepository=>({summary:async()=>({unreadCount:2,readThrough:'9007199254740993'}),list:async()=>page([item()]),markRead:async()=>({unreadCount:0}),markAllRead:async()=>({unreadCount:0}),preferences:async()=>({...prefs}),savePreferences:async value=>({...value,version:value.expectedVersion+1}),...partial});
function deferred<T>(){let resolve!:(value:T)=>void;return{promise:new Promise<T>(r=>{resolve=r}),resolve};}

test('background summary does not fetch pages or mark any notification read',async()=>{
  let pages=0,marks=0;const controller=createNotificationsController(repository({list:async()=>{pages++;return page([])},markRead:async()=>{marks++;return{unreadCount:0}}}));
  controller.setSession(actor,'token');await controller.refreshSummary();
  assert.equal(controller.getState().unreadCount,2);assert.equal(pages,0);assert.equal(marks,0);assert.equal(controller.getState().list.ready,false);
});

test('switching account aborts and discards late summaries pages and preferences',async()=>{
  const delayed=deferred<NotificationPage>(),oldPrefs=deferred<NotificationPreferences>();let signal:AbortSignal|undefined;
  const controller=createNotificationsController(repository({list:async(_query,context)=>{signal=context.signal;return delayed.promise},preferences:async()=>oldPrefs.promise}));
  controller.setSession(actor,'old');const read=controller.refreshList(),load=controller.loadPreferences();
  controller.setSession(other,'new');assert.equal(signal?.aborted,true);delayed.resolve(page([item()]));oldPrefs.resolve(prefs);await Promise.all([read,load]);
  assert.equal(controller.getState().userId,other);assert.equal(controller.getState().unreadCount,0);assert.equal(controller.getState().preferences,null);assert.deepEqual(controller.getState().list.items,[]);
  await assert.rejects(controller.markRead(item().id,actor));
});

test('cursor paging preserves large sequence strings and merges overlaps without losing history',async()=>{
  const cursors:(string|undefined)[]=[];
  const controller=createNotificationsController(repository({list:async query=>{cursors.push(query.beforeSeq);return query.beforeSeq?page([item('9007199254740992'),item('9007199254740991')]):page([item(),item('9007199254740992')],'9007199254740992')}}));
  controller.setSession(actor,'token');await controller.refreshList();await controller.loadMore();
  assert.deepEqual(cursors,[undefined,'9007199254740992']);assert.deepEqual(controller.getState().list.items.map(value=>value.seq),['9007199254740993','9007199254740992','9007199254740991']);
});

test('mark all uses the explicit server cutoff and keeps later notifications unread',async()=>{
  const acknowledged=deferred<{unreadCount:number}>();let cutoff='';
  const controller=createNotificationsController(repository({list:async()=>page([item('9007199254740994'),item('9007199254740993')]),markAllRead:async value=>{cutoff=value;return acknowledged.promise}}));
  controller.setSession(actor,'token');await controller.refreshList();const write=controller.markAllRead('9007199254740993',actor);
  assert(controller.getState().list.items.every(value=>value.readAt===null));assert.equal(controller.getState().unreadCount,2);
  acknowledged.resolve({unreadCount:1});await write;assert.equal(cutoff,'9007199254740993');assert.equal(controller.getState().list.items[0].readAt,null);assert.ok(controller.getState().list.items[1].readAt);assert.equal(controller.getState().unreadCount,1);
});

test('failed read marking never publishes success or clears unread items',async()=>{
  const controller=createNotificationsController(repository({markRead:async()=>{throw Error('offline')}}));
  controller.setSession(actor,'token');controller.setUnreadOnly(true);await controller.refreshList();await assert.rejects(controller.markRead(item().id,actor));
  assert.equal(controller.getState().list.items.length,1);assert.equal(controller.getState().list.items[0].readAt,null);assert.equal(controller.getState().unreadCount,1);assert.equal(controller.getState().marking,null);
});

test('a slow summary and page cannot undo a confirmed read mutation',async()=>{
  const delayed=deferred<{unreadCount:number;readThrough:string}>(),old=deferred<NotificationPage>();let reads=0;
  const controller=createNotificationsController(repository({summary:async()=>delayed.promise,list:async()=>++reads===1?page([item()]):old.promise}));
  controller.setSession(actor,'token');await controller.refreshList();const summary=controller.refreshSummary(),read=controller.refreshList();await controller.markRead(item().id,actor);
  delayed.resolve({unreadCount:9,readThrough:item().seq});old.resolve(page([item()]));await Promise.all([summary,read]);
  assert.equal(controller.getState().unreadCount,0);assert.ok(controller.getState().list.items[0].readAt);
});

test('preference writes wait for ACK and failures preserve the confirmed settings',async()=>{
  const answer=deferred<NotificationPreferences>();let fail=true;
  const controller=createNotificationsController(repository({savePreferences:async()=>{if(fail)throw Error('offline');return answer.promise}}));
  controller.setSession(actor,'token');await controller.loadPreferences();
  const desired={messages:false,visits:true,offers:true,expectedVersion:0};await assert.rejects(controller.savePreferences(desired,actor));assert.deepEqual(controller.getState().preferences,prefs);
  fail=false;const saving=controller.savePreferences(desired,actor);assert.equal(controller.getState().preferences?.messages,true);
  answer.resolve({messages:false,visits:true,offers:true,version:1});await saving;assert.equal(controller.getState().preferences?.messages,false);assert.equal(controller.getState().preferences?.version,1);
});

test('late preference loads cannot overwrite a newer saved version',async()=>{
  const old=deferred<NotificationPreferences>();let loads=0;
  const controller=createNotificationsController(repository({preferences:async()=>++loads===1?prefs:old.promise}));
  controller.setSession(actor,'token');await controller.loadPreferences();const reading=controller.loadPreferences();await controller.savePreferences({messages:false,visits:true,offers:true,expectedVersion:0},actor);
  old.resolve(prefs);await reading;assert.equal(controller.getState().preferences?.messages,false);assert.equal(controller.getState().preferences?.version,1);
});

test('automatic refresh skips slow reads and never collapses extra history pages',async()=>{
  const second=deferred<NotificationPage>();let calls=0;let signal:AbortSignal|undefined;
  const controller=createNotificationsController(repository({list:async(query,context)=>{calls++;if(query.beforeSeq){signal=context.signal;return second.promise}return page([item()],'9007199254740993')}}));
  controller.setSession(actor,'token');await controller.refreshList();const more=controller.loadMore();await controller.autoRefreshList();assert.equal(calls,2);assert.equal(signal?.aborted,false);
  second.resolve(page([item('9007199254740992')]));await more;await controller.autoRefreshList();assert.equal(calls,2);assert.equal(controller.getState().list.items.length,2);
});

test('changing filters aborts old list results without marking anything read',async()=>{
  const delayed=deferred<NotificationPage>();let calls=0,marks=0;
  const controller=createNotificationsController(repository({list:async query=>{calls++;return query.unreadOnly?page([]):delayed.promise},markAllRead:async()=>{marks++;return{unreadCount:0}}}));
  controller.setSession(actor,'token');const old=controller.refreshList();controller.setUnreadOnly(true);await controller.refreshList();delayed.resolve(page([item()]));await old;
  assert.equal(calls,2);assert.equal(marks,0);assert.equal(controller.getState().list.unreadOnly,true);assert.deepEqual(controller.getState().list.items,[]);
});

test('A to B to A cannot publish an old mutation and StrictMode remount works',async()=>{
  const ack=deferred<{unreadCount:number}>();const controller=createNotificationsController(repository({markRead:async()=>ack.promise}));
  controller.setSession(actor,'old');await controller.refreshList();const write=controller.markRead(item().id,actor);
  controller.setSession(other,'other');controller.setSession(actor,'new');ack.resolve({unreadCount:0});await assert.rejects(write);assert.deepEqual(controller.getState().list.items,[]);
  controller.dispose();controller.setSession(actor,'latest');await controller.refreshSummary();assert.equal(controller.getState().unreadCount,2);
});

test('a retained callback from the first A session cannot act after A to B to A',()=>{
  const controller=createNotificationsController(repository());
  controller.setSession(actor,'first');const captured=controller.getSessionKey();
  controller.setSession(other,'second');controller.setSession(actor,'third');
  assert.throws(()=>controller.assertSession(actor,captured),/KH_ACCOUNT_CHANGED/);
  assert.doesNotThrow(()=>controller.assertSession(actor,controller.getSessionKey()));
});

test('blocking invalidation clears every cached page and refreshes only the summary',async()=>{
  const delayed=deferred<NotificationPage>();let pages=0,summaries=0;let signal:AbortSignal|undefined;
  const controller=createNotificationsController(repository({summary:async()=>{summaries++;return{unreadCount:0,readThrough:'0'}},list:async(_query,context)=>{pages++;if(pages===1)return page([item()]);signal=context.signal;return delayed.promise}}));
  controller.setSession(actor,'token');await controller.refreshList();await controller.loadPreferences();const reading=controller.refreshList();
  await controller.invalidateAfterBlockChange(actor);
  assert.equal(signal?.aborted,true);assert.deepEqual(controller.getState().list.items,[]);assert.equal(controller.getState().list.ready,false);
  assert.equal(controller.getState().unreadCount,0);assert.equal(summaries,1);assert.equal(pages,2);assert.deepEqual(controller.getState().preferences,prefs);
  delayed.resolve(page([item()]));await reading;assert.deepEqual(controller.getState().list.items,[]);
});

test('leaving the center aborts a page without letting it update the hidden cache',async()=>{
  const delayed=deferred<NotificationPage>();let signal:AbortSignal|undefined;
  const controller=createNotificationsController(repository({list:async(_query,context)=>{signal=context.signal;return delayed.promise}}));
  controller.setSession(actor,'token');const loading=controller.refreshList();controller.pauseList(actor);
  assert.equal(signal?.aborted,true);delayed.resolve(page([item()]));await loading;
  assert.deepEqual(controller.getState().list.items,[]);assert.equal(controller.getState().list.loading,false);
});

test('a successful explicit refresh clears the old read error after resolving uncertain state',async()=>{
  let first=true;
  const controller=createNotificationsController(repository({list:async()=>{if(first){first=false;return page([item()])}return page([item(item().seq,'2026-09-20T14:01:00Z')])},markRead:async()=>{throw Error('network')}}));
  controller.setSession(actor,'token');await controller.refreshList();await assert.rejects(controller.markRead(item().id,actor));
  assert.ok(controller.getState().mutationError);await controller.refreshList();
  assert.equal(controller.getState().mutationError,null);assert.ok(controller.getState().list.items[0].readAt);
});
