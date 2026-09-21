// @ts-nocheck -- Pure repository boundary; no native runtime or live credentials.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportModerationRepository } from '../src/messaging/reportModeration.ts';

function fixture(result = { data: [], error: null }) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, headers: {}, signal: null }; calls.push(call);
    return { setHeader(key, value) { call.headers[key] = value; return this; }, abortSignal(signal) { call.signal = signal; return this; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  } };
  return { calls, repo: createReportModerationRepository(client, { actorId: 'admin-a', accessToken: 'captured-token' }) };
}

test('report requests pin actor and authorization and propagate cancellation', async () => {
  const { repo, calls } = fixture();
  const signal = new AbortController().signal;
  assert.deepEqual(await repo.list('open', 50, signal), []);
  await repo.review('report-id', '  Revisado  ', signal);
  assert.equal(calls[0].headers.Authorization, 'Bearer captured-token');
  assert.equal(calls[1].args.p_actor_id, 'admin-a');
  assert.equal(calls[0].args.p_offset, 50);
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[1].args.p_note, 'Revisado');
});

test('reports reject invalid evidence without displaying provider errors', async () => {
  for (const result of [{ data: null, error: { message: 'secret-database-detail' } }, { data: [{ status: 'open' }], error: null }]) {
    await assert.rejects(fixture(result).repo.list('open', 0), error => !error.message.includes('secret-database-detail') && /reportes/i.test(error.message));
  }
});

test('review cannot silently truncate notes or make requests after cancellation', async () => {
  const { repo, calls } = fixture();
  await assert.rejects(repo.review('report', 'x'.repeat(1001)), /1000/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(repo.list('open', 0, aborted.signal));
  assert.equal(calls.length, 0);
});
