import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposalDraftStore } from '../src/negotiations/proposalDraft.ts';

const target={conversationId:'conversation-a',kind:'visit' as const};
test('reopening a proposal restores edited fields and its exact uncertain request',()=>{
  const store=createProposalDraftStore('2026-09-21');
  const attempt={conversationId:'conversation-a',kind:'visit' as const,clientRequestId:'same-uuid',note:'Por la tarde',visitDate:'2026-09-22',visitTime:'17:30'};
  store.update(target,{date:'2026-09-22',time:'17:30',note:'Por la tarde',attempt,error:'offline'});
  const reopened=store.get(target);
  assert.equal(reopened.date,'2026-09-22');assert.equal(reopened.note,'Por la tarde');assert.equal(reopened.attempt,attempt);
  assert.equal(store.get({...target}).attempt?.clientRequestId,'same-uuid');
});
test('different proposal targets and account stores never share a draft',()=>{
  const accountA=createProposalDraftStore('2026-09-21'),accountB=createProposalDraftStore('2026-09-21');
  accountA.update(target,{note:'Private',amount:'40000'});
  assert.equal(accountA.get({...target,conversationId:'conversation-b'}).note,'');
  assert.equal(accountA.get({...target,kind:'offer'}).note,'');
  assert.equal(accountB.get(target).note,'');
});
test('discarding a completed proposal allows a fresh attempt without erasing other drafts',()=>{
  const store=createProposalDraftStore('2026-09-21'),offer={...target,kind:'offer' as const};
  store.update(target,{note:'Visit'});store.update(offer,{amount:'45000'});store.discard(target);
  assert.equal(store.get(target).attempt,null);assert.equal(store.get(target).note,'');assert.equal(store.get(offer).amount,'45000');
});
