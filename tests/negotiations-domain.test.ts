// @ts-nocheck -- Pure business rules run directly in Node.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as d from '../src/negotiations/domain.ts';
const id='61000000-0000-4000-8000-000000000001';
const buyer='61000000-0000-4000-8000-000000000002';
const seller='61000000-0000-4000-8000-000000000003';
const now=new Date('2026-09-20T12:00:00Z');
const offer={conversationId:id,kind:'offer',clientRequestId:id,note:' Visita antes de decidir ',amountUsd:'10000.25'};
const visit={conversationId:id,kind:'visit',clientRequestId:id,note:'',visitDate:'2026-09-21',visitTime:'10:30'};
test('money normalizes decimals and rejects exponent, zero, negative, precision and over-limit amounts',()=>{
  assert.equal(d.validateCreateNegotiation({...offer,amountUsd:'10,50'},now).amountUsd,'10.50');
  assert.equal(d.validateCreateNegotiation(offer,now).note,'Visita antes de decidir');
  assert.equal(d.validateCreateNegotiation({...offer,amountUsd:'1000000000'},now).amountUsd,'1000000000.00');
  for(const amountUsd of ['0','-1','1e2','12.345','1000000000.01','NaN','']) assert.throws(()=>d.validateCreateNegotiation({...offer,amountUsd},now));
});
test('visit dates are real, future and no more than 180 days in Havana independent of device timezone',()=>{
  assert.equal(d.havanaVisitInstant('2026-09-21','10:30'),'2026-09-21T14:30:00.000Z');
  assert.equal(d.havanaVisitInstant('2026-12-21','10:30'),'2026-12-21T15:30:00.000Z');
  assert.deepEqual(d.havanaDateTime(new Date('2026-09-21T02:00:00Z')),{date:'2026-09-20',time:'22:00'});
  assert.equal(d.validateCreateNegotiation(visit,now).visitTime,'10:30');
  for(const patch of [{visitDate:'2026-02-30'},{visitTime:'24:00'},{visitDate:'2026-09-19'},{visitDate:'2027-09-21'}]) assert.throws(()=>d.validateCreateNegotiation({...visit,...patch},now));
});
test('Havana daylight-saving gap is rejected and repeated midnight chooses standard-time occurrence',()=>{
  assert.throws(()=>d.havanaVisitInstant('2026-03-08','00:30'));
  assert.equal(d.havanaVisitInstant('2026-11-01','00:30'),'2026-11-01T05:30:00.000Z');
});
test('alternatives require a UUID and expected version and notes stay bounded',()=>{
  assert.throws(()=>d.validateCreateNegotiation({...offer,replacesId:id},now));
  assert.throws(()=>d.validateCreateNegotiation({...offer,replacesId:'bad',expectedVersion:1},now));
  assert.equal(d.validateCreateNegotiation({...offer,replacesId:id,expectedVersion:2},now).expectedVersion,2);
  assert.throws(()=>d.validateCreateNegotiation({...offer,note:'x'.repeat(501)},now));
  assert.throws(()=>d.validateCreateNegotiation({...offer,note:'a\u0000b'},now));
});
const proposal={id,conversationId:id,buyerId:buyer,sellerId:seller,createdBy:buyer,kind:'offer',status:'pending',canAct:true};
test('only recipient can accept decline or counter; creator can withdraw; accepted can be cancelled by either',()=>{
  assert.deepEqual(d.availableNegotiationActions(proposal,buyer),{accept:false,decline:false,counter:false,cancel:true});
  assert.deepEqual(d.availableNegotiationActions(proposal,seller),{accept:true,decline:true,counter:true,cancel:false});
  assert.equal(d.availableNegotiationActions({...proposal,status:'accepted'},buyer).cancel,true);
  assert.equal(d.availableNegotiationActions({...proposal,status:'accepted'},seller).cancel,true);
  assert.deepEqual(d.availableNegotiationActions(proposal,'outsider'),{accept:false,decline:false,counter:false,cancel:false});
});
test('blocked or unavailable conversations permit legitimate cancellation only; final states are immutable',()=>{
  assert.deepEqual(d.availableNegotiationActions({...proposal,canAct:false},seller),{accept:false,decline:false,counter:false,cancel:false});
  assert.equal(d.availableNegotiationActions({...proposal,canAct:false},buyer).cancel,true);
  assert.equal(d.availableNegotiationActions({...proposal,status:'accepted',canAct:false},seller).cancel,true);
  for(const status of ['declined','cancelled','superseded','expired']) assert.deepEqual(d.availableNegotiationActions({...proposal,status},buyer),{accept:false,decline:false,counter:false,cancel:false});
});
test('an existing pending proposal points to server-filtered pending requests rather than a history refresh loop',()=>{
  assert.match(d.negotiationErrorMessage(new Error('KH_NEG_PENDING_EXISTS')),/Solicitudes.*Pendientes/);
  assert.doesNotMatch(d.negotiationErrorMessage(new Error('KH_NEG_VERSION_CONFLICT')),/Solicitudes.*Pendientes/);
});
