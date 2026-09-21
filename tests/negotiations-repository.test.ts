// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSupabaseNegotiationRepository,decodeNegotiation} from '../src/negotiations/repository.ts';
const buyer='62000000-0000-4000-8000-000000000001',seller='62000000-0000-4000-8000-000000000002',id='62000000-0000-4000-8000-000000000003';
const row={id,conversationId:id,propertyId:id,propertyTitle:'Casa',propertyLocation:'Vedado',buyerId:buyer,sellerId:seller,createdBy:buyer,kind:'offer',status:'pending',version:1,amountUsd:10000.25,visitDate:null,visitTime:null,visitAt:null,note:'',createdAt:'2026-09-20T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z',parentId:null,expiresAt:'2026-09-27T10:00:00Z',canAct:true};
function fixture(data=[row]){
  const calls=[];const abort=new AbortController();let changed=false;
  const context={userId:buyer,accessToken:'captured-token',signal:abort.signal,checkpoint(){if(changed)throw new Error('KH_ACCOUNT_CHANGED');}};
  const client={rpc(name,args){const call={name,args};calls.push(call);return{setHeader(k,v){call.header=[k,v];return this;},abortSignal(signal){call.signal=signal;return Promise.resolve({data:typeof data==='function'?data():data,error:null});}};}};
  return{repo:createSupabaseNegotiationRepository(client),context,calls,abort,change(){changed=true;}};
}
test('list fetches exactly one explicit page and binds captured JWT actor and abort signal',async()=>{
  const f=fixture();const rows=await f.repo.list({conversationId:id,pendingOnly:true,offset:30},f.context);
  assert.equal(rows.length,1);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].args,{p_conversation_id:id,p_pending_only:true,p_offset:30,p_limit:30,p_actor_id:buyer});
  assert.deepEqual(f.calls[0].header,['Authorization','Bearer captured-token']);assert.equal(f.calls[0].signal,f.context.signal);
});
test('late account changes abort publication and pre-aborted calls never reach RPC',async()=>{
  const f=fixture(()=>{f.change();return[row];});await assert.rejects(f.repo.list({offset:0},f.context),/ACCOUNT_CHANGED/);
  const g=fixture();g.abort.abort();await assert.rejects(g.repo.list({offset:0},g.context),/ACCOUNT_CHANGED/);assert.equal(g.calls.length,0);
});
test('repository rejects cross-participant and cross-conversation results plus invalid pages',async()=>{
  const f=fixture([{...row,buyerId:id}]);await assert.rejects(f.repo.list({offset:0},f.context));
  const g=fixture([{...row,conversationId:seller}]);await assert.rejects(g.repo.list({conversationId:id,offset:0},g.context));
  await assert.rejects(g.repo.list({offset:-1},g.context));
  const h=fixture([{...row,status:'accepted'}]);await assert.rejects(h.repo.list({offset:0,pendingOnly:true},h.context));
});
test('decoder refuses impossible mixed values and malformed structured facts',()=>{
  assert.equal(decodeNegotiation(row).amountUsd,10000.25);
  for(const patch of [{amountUsd:0},{amountUsd:12.345},{kind:'unknown'},{version:0},{createdBy:id},{status:'approved'},{visitDate:'2026-10-01'},{canAct:'true'}])assert.throws(()=>decodeNegotiation({...row,...patch}));
});
test('mutation UUID and expected version travel unchanged and response identity is checked',async()=>{
  const f=fixture({...row,status:'accepted',version:2});const input={id,action:'accept',expectedVersion:1,clientRequestId:seller};
  assert.equal((await f.repo.respond(input,f.context)).status,'accepted');assert.deepEqual(f.calls[0].args.p_payload,input);
  const g=fixture({...row,id:seller});await assert.rejects(g.repo.respond(input,g.context));
});
