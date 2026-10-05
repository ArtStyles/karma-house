// @ts-nocheck -- Node runs domain behavior without the app.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCollaborator, validateProvenance, assistedError } from '../src/assisted/domain.ts';
test('linking requires evidence rather than a public display name or phone', () => {
  assert.throws(()=>validateCollaborator({kind:'agency',privateName:'Agencia ejemplo',privateContact:'contacto privado',contactChannel:'manual',accountId:'43000000-0000-4000-8000-000000000002',linkEvidenceReference:''}),/confirmación/);
  assert.equal(validateCollaborator({kind:'agency',privateName:' Agencia ejemplo ',privateContact:' contacto privado ',contactChannel:'manual',accountId:null}).privateName,'Agencia ejemplo');
});
test('publication requires actual authorization and a nonfuture confirmation', () => {
  const input={collaboratorId:'43000000-0000-4000-8000-000000000003',collaboratorReference:'casa-1',sourceChannel:'direct',consentText:'Autoriza texto y fotografías entregadas directamente.',consentVersion:'v1',evidenceReference:'registro privado 1',consentAt:'2026-10-05T12:00:00Z',receivedAt:'2026-10-05T12:00:00Z',lastConfirmedAt:'2026-10-05T12:00:00Z'};
  assert.equal(validateProvenance(input,Date.parse('2026-10-05T13:00:00Z')).collaboratorReference,'casa-1');
  assert.throws(()=>validateProvenance({...input,consentText:''}),/autorización/);
  assert.throws(()=>validateProvenance(input,Date.parse('2026-10-04T13:00:00Z')),/fecha/);
});
test('official-only and stale management errors explain the action without exposing contacts',()=>{
  assert.match(assistedError(new Error('KH_OFFICIAL_ACCOUNT_REQUIRED')),/principal/);
  assert.match(assistedError(new Error('KH_PROPERTY_MANAGEMENT_CHANGED')),/gestión/);
});
