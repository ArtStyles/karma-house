import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryHint, noticeText, proposalStatus, proposalSubject, proposalTitle, proposalValue } from '../src/negotiations/presentation.ts';

const me = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const offer = { kind: 'offer' as const, createdBy: other, amountUsd: 80000, visitAt: null, parentId: null };
// 10:30 in Havana (UTC-4 in September) is 14:30 UTC, whatever the device timezone is.
const visit = { kind: 'visit' as const, createdBy: me, amountUsd: null, visitAt: '2026-09-27T14:30:00Z', parentId: null };
const counter = { ...offer, createdBy: me, amountUsd: 85000, parentId: '33333333-3333-4333-8333-333333333333' };

test('titles say whose proposal it is and whether it answers another', () => {
  assert.equal(proposalTitle(offer, me), 'Oferta de compra');
  assert.equal(proposalTitle(counter, me), 'Tu contraoferta');
  assert.equal(proposalTitle(counter, other), 'Contraoferta');
  assert.equal(proposalTitle(visit, me), 'Tu propuesta de visita');
  assert.equal(proposalTitle({ ...visit, createdBy: other, parentId: counter.parentId }, me), 'Nueva fecha de visita');
});

test('values read like the rest of the app, with visits in Cuba time', () => {
  assert.deepEqual(proposalValue(offer), { primary: '$ 80,000 USD', secondary: null });
  assert.deepEqual(proposalValue({ ...offer, amountUsd: 80000.5 }), { primary: '$ 80,000.5 USD', secondary: null });
  assert.deepEqual(proposalValue(visit), { primary: 'Domingo 27 de septiembre', secondary: '10:30 · hora de Cuba' });
  assert.equal(proposalSubject(visit), 'visita del dom 27 sept a las 10:30');
  assert.equal(proposalSubject(counter), 'contraoferta de $ 85,000 USD');
});

test('status labels and tones follow the live row, and a stale pending row reads as expired', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const pending = { kind: 'offer' as const, status: 'pending' as const, expiresAt: '2026-09-30T11:00:00Z' };
  assert.deepEqual(proposalStatus(pending, now), { label: 'Pendiente', tone: 'pending' });
  assert.deepEqual(proposalStatus({ ...pending, expiresAt: '2026-09-24T11:00:00Z' }, now), { label: 'Caducada', tone: 'neutral' });
  assert.deepEqual(proposalStatus({ ...pending, status: 'accepted' }, now), { label: 'Aceptada', tone: 'success' });
  assert.deepEqual(proposalStatus({ ...pending, status: 'declined' }, now), { label: 'Rechazada', tone: 'danger' });
  assert.equal(proposalStatus({ ...pending, status: 'superseded' }, now).label, 'Reemplazada por una contraoferta');
  assert.equal(proposalStatus({ ...pending, kind: 'visit', status: 'superseded' }, now).label, 'Reemplazada por otra fecha');
  assert.equal(expiryHint(pending, now), 'Caduca en 6 días');
  assert.equal(expiryHint({ ...pending, expiresAt: '2026-09-24T20:00:00Z' }, now), 'Caduca en menos de un día');
  assert.equal(expiryHint({ ...pending, kind: 'visit' }, now), null);
  assert.equal(expiryHint({ ...pending, status: 'accepted' }, now), null);
});

test('notices are written from the reader’s side', () => {
  assert.equal(noticeText({ ...counter, action: 'accepted' }, other, me, 'Enrique'), 'Enrique aceptó tu contraoferta de $ 85,000 USD');
  assert.equal(noticeText({ ...offer, action: 'accepted' }, me, me, 'Enrique'), 'Aceptaste la oferta de $ 80,000 USD');
  assert.equal(noticeText({ ...offer, action: 'declined' }, me, me, 'Enrique'), 'Rechazaste la oferta de $ 80,000 USD');
  assert.equal(noticeText({ ...visit, action: 'cancelled' }, me, me, 'Enrique'), 'Cancelaste tu visita del dom 27 sept a las 10:30');
  assert.equal(noticeText({ ...offer, action: 'cancelled' }, other, me, 'Enrique'), 'Enrique canceló su oferta de $ 80,000 USD');
  assert.equal(noticeText({ ...visit, action: 'cancelled' }, other, me, 'Enrique'), 'Enrique canceló tu visita del dom 27 sept a las 10:30');
});
