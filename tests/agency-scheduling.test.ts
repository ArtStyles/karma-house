import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgencyProposal, decodeAgencyProposal, decodeAgencyProposalEvent, decodeAgencyVisit, visitOutcomeLabel, havanaAgendaRange } from '../src/agencies/scheduling/domain.ts';
import { createAgencySchedulingRepository } from '../src/agencies/scheduling/repository.ts';
import { havanaVisitInstant } from '../src/negotiations/domain.ts';
const id='45000000-0000-4000-8000-000000000002';
const proposal={id,dealId:id,kind:'offer',status:'accepted',version:2,createdBy:id,amountUsd:12500.25,visitAt:null,durationMinutes:null,note:'Acuerdo',parentId:null,expiresAt:'2026-10-20T12:00:00Z',closedReason:null};
test('offers_preserve_history_and_do_not_sell',()=>{
 assert.equal(decodeAgencyProposal(proposal,id).status,'accepted');
 assert.throws(()=>decodeAgencyProposal({...proposal,status:'sold'},id));
 assert.throws(()=>decodeAgencyProposal({...proposal,amountUsd:1.005},id));
 assert.throws(()=>decodeAgencyProposal({...proposal,dealId:'45000000-0000-4000-8000-000000000003'},id));
});
test('new_visit_defaults_to_sixty_minutes_and_validates_Havana',()=>{
 const value=validateAgencyProposal({dealId:id,kind:'visit',note:'',clientRequestId:id,visitDate:'2026-10-15',visitTime:'10:00'},new Date('2026-10-10T00:00:00Z'));
 assert.equal(value.durationMinutes,60);
 assert.equal(havanaVisitInstant('2026-10-15','10:00'),'2026-10-15T14:00:00.000Z');
 assert.equal(havanaVisitInstant('2026-11-01','00:30'),'2026-11-01T05:30:00.000Z');
 assert.throws(()=>havanaVisitInstant('2027-03-14','00:30'));
 assert.throws(()=>validateAgencyProposal({...value,durationMinutes:45},new Date('2026-10-10T00:00:00Z')));
});
test('past_visit_requires_recorded_outcome',()=>{
 const v=decodeAgencyVisit({proposalId:id,propertyId:id,assigneeId:id,startsAt:'2020-01-01T12:00:00Z',endsAt:'2020-01-01T13:00:00Z',outcome:'unrecorded',version:1});
 assert.equal(v.outcome,'unrecorded');assert.equal(visitOutcomeLabel(v.outcome),'Resultado sin registrar');
 assert.throws(()=>decodeAgencyVisit({...v,endsAt:v.startsAt}));
});
test('agenda_week_follows_Havana_calendar_across_DST',()=>{
 assert.deepEqual(havanaAgendaRange('2026-10-29'),{from:'2026-10-29T04:00:00.000Z',to:'2026-11-05T05:00:00.000Z'});
 assert.deepEqual(havanaAgendaRange('2027-03-14'),{from:'2027-03-14T05:00:00.000Z',to:'2027-03-21T04:00:00.000Z'});
 assert.throws(()=>havanaAgendaRange('2026-02-30'));
});
test('manual_event_decodes_registrador_and_reference_without_inventing_digital_buyer',()=>{
 const value={id,proposalId:id,actorId:null,party:'buyer',action:'accepted',responseSource:'manual',externalResponse:{channel:'phone',reference:'Confirmó por llamada'},createdAt:'2026-10-20T12:00:00Z'};
 assert.equal(decodeAgencyProposalEvent(value,id).actorId,null);
 assert.throws(()=>decodeAgencyProposalEvent({...value,responseSource:'digital'},id));
 assert.throws(()=>decodeAgencyProposalEvent({...value,party:'team'},id));
});
test('repository_pins_actor_agency_token_and_rejects_late_context',async()=>{
 const agencyId='45000000-0000-4000-8000-000000000003';let args:Record<string,unknown>={},token='',changed=false;
 const c={userId:id,agencyId,generation:1,accessToken:'pinned-token',signal:new AbortController().signal,checkpoint(){}};
 const client={rpc(_name:string,input:Record<string,unknown>){args=input;return {setHeader(_name:string,value:string){token=value;return this;},async abortSignal(){changed=true;return {data:{items:[proposal],hasMore:false},error:null};}};}};
 const repository=createAgencySchedulingRepository(client as any);
 assert.equal((await repository.list(id,0,c)).items.length,1);assert.equal(args.p_actor_id,id);assert.equal(args.p_agency_id,agencyId);assert.equal(args.p_limit,30);assert.equal(token,'Bearer pinned-token');
 await assert.rejects(repository.list(id,0,{...c,checkpoint(){if(changed)throw Error('context changed');}}),/context changed/);
 const buyer={userId:id,accessToken:'buyer-token',signal:c.signal,checkpoint(){}};
 await repository.list(id,0,buyer);assert.equal(args.p_agency_id,null);
});
test('occupancy_decoder_rejects_private_fields',async()=>{
 const client={rpc(){return {setHeader(){return this;},async abortSignal(){return {data:[{startsAt:'2026-10-20T12:00:00Z',endsAt:'2026-10-20T13:00:00Z',buyerId:id}],error:null};}};}};
 await assert.rejects(createAgencySchedulingRepository(client as any).occupancy(id,'2026-10-20T00:00:00Z','2026-10-21T00:00:00Z',{userId:id,agencyId:id,generation:1,accessToken:'x',signal:new AbortController().signal,checkpoint(){}}));
});
