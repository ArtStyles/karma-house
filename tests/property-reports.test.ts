import test from 'node:test';
import assert from 'node:assert/strict';
import { createPropertyReportRepository } from '../src/data/propertyReports.ts';

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const calls: { name: string; args: Record<string, unknown>; token?: string }[] = [];
  const client = { rpc(name: string, args: Record<string, unknown>) {
    const call: (typeof calls)[number] = { name, args }; calls.push(call);
    const query = { setHeader(_: string, value: string) { call.token = value; return query; }, abortSignal() { return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve); } };
    return query;
  } };
  return { client: client as never, calls };
}
const credentials = { actorId: '68000000-0000-4000-8000-000000000002', accessToken: 'token-b' };

test('a listing report pins the reporting account and trims the comment', async () => {
  const { client, calls } = fakeClient({ data: '6b000000-0000-4000-8000-000000000001' });
  await createPropertyReportRepository(client, credentials).report('p1', 'fraud', '  pide adelanto  ', 'c1');
  assert.deepEqual(calls[0], { name: 'kh_report_property', token: 'Bearer token-b', args: { p_property_id: 'p1', p_client_report_id: 'c1', p_reason: 'fraud', p_details: 'pide adelanto', p_actor_id: credentials.actorId } });
});

test('server codes become Spanish guidance instead of raw codes', async () => {
  const { client } = fakeClient({ error: { message: 'KH_REPORT_LIMIT' } });
  await assert.rejects(createPropertyReportRepository(client, credentials).report('p1', 'other', '', 'c1'), /muchos reportes hoy/);
  const unknown = fakeClient({ error: { message: 'fetch failed' } });
  await assert.rejects(createPropertyReportRepository(unknown.client, credentials).report('p1', 'other', '', 'c1'), /Comprueba tu conexión/);
});

test('the moderation queue rejects a row it cannot fully read', async () => {
  const row = { id: 'r1', propertyId: 'p1', propertyTitle: 'Casa', reporterId: 'u2', ownerId: 'u1', reason: 'fraud', details: '', status: 'open', unpublished: false, reviewNote: null, createdAt: '2026-09-23T10:00:00Z', propertyLive: true };
  assert.equal((await createPropertyReportRepository(fakeClient({ data: [row] }).client, credentials).list('open')).length, 1);
  await assert.rejects(createPropertyReportRepository(fakeClient({ data: [{ ...row, reason: 'spam' }] }).client, credentials).list('open'));
});
