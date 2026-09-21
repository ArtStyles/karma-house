// @ts-nocheck -- Pure fetch boundary is tested directly by Node.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeadlineFetch } from '../src/lib/fetchTimeout.ts';

test('a stalled fetch is aborted and rejected at the deadline without retrying', async () => {
  let calls = 0;
  let requestSignal;
  const fetchWithDeadline = createDeadlineFetch(async (_input, init) => {
    calls += 1; requestSignal = init.signal;
    // Some native transport failures do not settle even after an abort.
    return new Promise(() => {});
  }, 15);
  await assert.rejects(fetchWithDeadline('https://example.invalid', { method: 'POST' }), { name: 'TimeoutError' });
  assert.equal(requestSignal.aborted, true);
  assert.equal(calls, 1);
});

test('caller abort preserves its reason and cancels the wrapped transport', async () => {
  const caller = new AbortController();
  let requestSignal;
  const fetchWithDeadline = createDeadlineFetch(async (_input, init) => {
    requestSignal = init.signal;
    return new Promise(() => {});
  }, 20000);
  const result = fetchWithDeadline('https://example.invalid', { signal: caller.signal });
  const reason = new Error('Cancelled by the caller');
  caller.abort(reason);
  await assert.rejects(result, (error) => error === reason);
  assert.equal(requestSignal.aborted, true);
  assert.equal(requestSignal.reason, reason);
});

test('an already aborted signal prevents the request from starting', async () => {
  const caller = new AbortController(); caller.abort();
  let calls = 0;
  const fetchWithDeadline = createDeadlineFetch(async () => { calls += 1; return new Response('ok'); });
  await assert.rejects(fetchWithDeadline('https://example.invalid', { signal: caller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('a Request object keeps its cancellation signal when init does not override it', async () => {
  const caller = new AbortController();
  const request = new Request('https://example.invalid', { signal: caller.signal });
  let requestSignal;
  const fetchWithDeadline = createDeadlineFetch(async (_input, init) => {
    requestSignal = init.signal;
    return new Promise(() => {});
  });
  const result = fetchWithDeadline(request);
  caller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(requestSignal.aborted, true);
});

test('explicit null signal overrides cancellation inherited from a Request', async () => {
  const caller = new AbortController(); caller.abort();
  const request = new Request('https://example.invalid', { signal: caller.signal });
  const response = new Response('ok');
  const fetchWithDeadline = createDeadlineFetch(async () => response);
  assert.equal(await fetchWithDeadline(request, { signal: null }), response);
});

test('success preserves the response and options, then removes cancellation listeners and timer', async () => {
  const caller = new AbortController();
  const response = new Response('ok');
  let requestSignal;
  let options;
  let removals = 0;
  const originalRemove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.removeEventListener = (...args) => { removals += 1; return originalRemove(...args); };
  const fetchWithDeadline = createDeadlineFetch(async (_input, init) => {
    requestSignal = init.signal; options = init;
    return response;
  }, 15);
  assert.equal(await fetchWithDeadline('https://example.invalid', { signal: caller.signal, method: 'POST', body: 'body', headers: { 'x-test': 'value' } }), response);
  assert.equal(options.method, 'POST'); assert.equal(options.body, 'body');
  assert.deepEqual(options.headers, { 'x-test': 'value' });
  assert.equal(removals, 1);
  caller.abort();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(requestSignal.aborted, false, 'neither late caller cancellation nor elapsed deadline may abort the completed request');
});

test('transport errors are preserved and clean up cancellation listeners', async () => {
  const caller = new AbortController();
  const failure = new TypeError('Failed to fetch');
  let removals = 0;
  const originalRemove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.removeEventListener = (...args) => { removals += 1; return originalRemove(...args); };
  const fetchWithDeadline = createDeadlineFetch(async () => { throw failure; });
  await assert.rejects(fetchWithDeadline('https://example.invalid', { signal: caller.signal }), (error) => error === failure);
  assert.equal(removals, 1);
});
