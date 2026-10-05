import test from 'node:test';import assert from 'node:assert/strict';
import {decodeConversation} from '../src/messaging/repository.ts';
const id='43000000-0000-4000-8000-000000000001';
const row={id,propertyId:id,propertyTitle:'Fixture',propertyLocation:'Fixture',buyerId:id,sellerId:id,otherUserId:id,otherName:'Fixture',lastMessage:null,lastMessageAt:null,lastSeq:0,unreadCount:0,blockedByMe:false,blockedByOther:false,canSend:false,propertyAvailable:false,createdAt:'2026-10-05T00:00:00Z'};
test('old server conversation defaults safely; current contact must be explicitly authorized',()=>{
 assert.equal(decodeConversation(row).managementChanged,false);
 assert.equal(decodeConversation(row).currentContactAvailable,false);
 const current=decodeConversation({...row,managementChanged:true,currentManagerId:id,currentManagerName:'Nuevo gestor',currentContactAvailable:true});
 assert.equal(current.currentManagerId,id);assert.equal(current.managementChanged,true);
 assert.throws(()=>decodeConversation({...row,currentManagerId:'invented'}));
});
