import test from 'node:test';import assert from 'node:assert/strict';import {createListingTransferRepository} from '../src/transfers/repository.ts';import {transferRow,recipient,requestId} from './helpers/transferFixtures.ts';
test('transport pins JWT and actor, rejects another recipient and late errors',async()=>{
 const calls:unknown[]=[];let active=true,fail=false;const client={rpc(name:string,args:unknown){calls.push([name,args]);return {setHeader(name:string,value:string){calls.push([name,value]);return this;},abortSignal(){return Promise.resolve().then(()=>{if(fail){active=false;throw Error('old failure');}return {data:transferRow,error:null};});}};}};
 const repository=createListingTransferRepository(client as never);const context={userId:recipient,accessToken:'captured',signal:new AbortController().signal,checkpoint(){if(!active)throw Error('KH_ACCOUNT_CHANGED');}};
 assert.equal((await repository.get(requestId,context)).id,requestId);assert.deepEqual(calls[1],['Authorization','Bearer captured']);
 await assert.rejects(repository.get(requestId,{...context,userId:requestId}),/interpretar/);
 fail=true;await assert.rejects(repository.get(requestId,context),/KH_ACCOUNT_CHANGED/);
});
