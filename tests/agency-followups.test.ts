import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyDealRepository } from '../src/agencies/deals/repository.ts';
import { createFollowupViewScope } from '../src/agencies/deals/viewScope.ts';
import {followupError} from '../src/agencies/deals/domain.ts';
import {schedulingError} from '../src/agencies/scheduling/domain.ts';
const id = (n: number) => `45000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { userId: id(1), agencyId: id(2), generation: 1, accessToken: 'pinned', signal: new AbortController().signal, checkpoint() {} };
const task = { id: id(3), dealId: id(4), title: 'Llamar mañana', kind: 'followup', assigneeId: null, dueAt: null, state: 'open', version: 1, reason: null };
function fixture(data: unknown) { const calls: any[] = []; const client = { rpc(name: string, args: any) { calls.push({name,args}); return { setHeader(k: string,v: string) { assert.equal(v,'Bearer pinned'); return this; }, async abortSignal() { return { data, error: null }; } }; } }; return { repo: createAgencyDealRepository(client as any), calls }; }
test('task_completion_keeps_history and uses pinned actor/version', async () => {
    const {repo,calls} = fixture({...task,state:'done',version:2});
    const result = await repo.finishTask({taskId:task.id,state:'done',expectedVersion:1,clientRequestId:id(5)},context);
    assert.equal(result.state,'done'); assert.equal(result.id,task.id);
    assert.equal(calls[0].name,'kh_finish_agency_task'); assert.equal(calls[0].args.p_actor_id,context.userId);
    assert.equal(calls[0].args.p_payload.expectedVersion,1);
});
test('changing_agency_discards_followup_response', async () => {
    let changed=false; const c={...context, checkpoint(){ if(changed) throw Error('KH_AGENCY_CONTEXT_CHANGED'); }};
    const client={rpc(){return {setHeader(){return this},async abortSignal(){changed=true;return {data:task,error:null}}}}};
    await assert.rejects(createAgencyDealRepository(client as any).listTasks({offset:0},c),/KH_AGENCY_CONTEXT_CHANGED/);
});
test('server pagination filters property and assignee without downloading portfolio', async () => {
    const {repo,calls}=fixture({items:[],hasMore:true});
    assert.equal((await repo.list({offset:30,propertyId:id(7),assigneeId:null},context)).hasMore,true);
    assert.deepEqual(calls[0].args.p_filters,{propertyId:id(7),assigneeId:null}); assert.equal(calls[0].args.p_offset,30);
});
test('normal task write rejects forged kind, invalid dates, invalid versions before RPC', async () => {
    const {repo,calls}=fixture(task);
    for(const extra of [{kind:'external_notification'},{dueAt:'tomorrow'},{expectedVersion:0}]) await assert.rejects(repo.saveTask({dealId:id(4),assigneeId:null,dueAt:null,title:'Llamar',clientRequestId:id(5),...extra} as any,context));
    assert.equal(calls.length,0);
});
test('task projection rejects cross-deal mutations and removes private extras', async () => {
    const {repo}=fixture({...task,receipt:'private'}); const result=await repo.saveTask({dealId:id(4),assigneeId:null,dueAt:null,title:'Llamar',clientRequestId:id(5)},context);
    assert.equal('receipt' in result,false);
    await assert.rejects(repo.finishTask({taskId:id(8),state:'done',expectedVersion:1,clientRequestId:id(5)},context));
});
test('superseded, blurred and background followup responses never enter current view', () => {
    const scope=createFollowupViewScope();scope.activate();const first=scope.capture();first();const second=scope.capture();assert.throws(first,/CONTEXT_CHANGED/);second();scope.invalidate();assert.throws(second,/CONTEXT_CHANGED/);scope.activate();assert.throws(second,/CONTEXT_CHANGED/);scope.capture()();
});
test('private deal history and visits use bounded current-deal reads; external has no chat', async()=>{
 const {repo,calls}=fixture({items:[],hasMore:false});await repo.visits(id(4),30,context);await repo.history(id(4),0,context);assert.deepEqual(calls.map(c=>[c.name,c.args.p_deal_id,c.args.p_offset]),[['kh_list_agency_deal_visits',id(4),30],['kh_list_agency_followup_events',id(4),0]]);
 assert.equal(await fixture(null).repo.conversationId(id(4),context),null);
});
test('external wrong response party and task assignment rejection have actionable Spanish messages',()=>{
 assert.match(schedulingError(Error('KH_NEG_NOT_YOUR_TURN')),/otra parte/);
 assert.match(followupError(Error('KH_AGENCY_TASK_ASSIGNEE_MISMATCH')),/responsable/);
 assert.match(followupError(Error('KH_AGENCY_PROPERTY_CLOSED')),/terminó/);
});
