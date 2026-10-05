import test from 'node:test';import assert from 'node:assert/strict';
import {validateOffer,decodeTransferRequest,transferError} from '../src/transfers/domain.ts';
const id='43000000-0000-4000-8000-000000000001';
test('offer requires one to twenty unique versioned properties and linked recipient',()=>{
 const input={clientRequestId:id,collaboratorId:id,expectedCollaboratorVersion:1,recipientId:id,items:[{propertyId:id,expectedVersion:1,expectedProvenanceVersion:1}]};
 assert.deepEqual(validateOffer(input),input);
 assert.throws(()=>validateOffer({...input,items:[]}));assert.throws(()=>validateOffer({...input,items:[...input.items,...input.items]}));
 assert.throws(()=>validateOffer({...input,items:[{...input.items[0],expectedVersion:0}]}));
 assert.throws(()=>decodeTransferRequest({id,items:[],recipient:{id,displayName:'Private'}}));
 assert.match(transferError(Error('KH_CHAT_MANAGER_CHANGED')),/responsable/);
});
