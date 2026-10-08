import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsultationRefreshGate } from '../src/lib/consultationRefresh.ts';

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
}

test('a repeated gesture starts only one request and mutations block new refreshes', async () => {
  const gate = createConsultationRefreshGate();
  gate.enter('account-a');
  const pending = deferred();
  let requests = 0;
  const run = () => gate.run(async () => { requests++; await pending.promise; });
  const first = run();
  assert.equal(gate.running(), true);
  assert.equal(await run(), false);
  assert.equal(requests, 1);
  pending.resolve();
  assert.equal(await first, true);
  assert.equal(gate.running(), false);
  assert.equal(await gate.run(async () => { requests++; }, { blocked: true }), false);
  assert.equal(requests, 1);
});

test('an obsolete completion cannot clear the current account refresh or publish its error', async () => {
  const gate = createConsultationRefreshGate();
  const old = deferred(), current = deferred(), visible: boolean[] = [], errors: unknown[] = [];
  gate.enter('account-a');
  const first = gate.run(async () => { await old.promise; throw Error('old failure'); }, { onRefreshing: value => visible.push(value), onError: error => errors.push(error) });
  gate.enter('account-b');
  const second = gate.run(() => current.promise, { onRefreshing: value => visible.push(value) });
  old.resolve();
  await first;
  assert.equal(gate.running(), true);
  assert.deepEqual(visible, [true, true]);
  assert.deepEqual(errors, []);
  current.resolve();
  await second;
  assert.deepEqual(visible, [true, true, false]);
});

test('failed requests release the lock and report an error without retrying automatically', async () => {
  const gate = createConsultationRefreshGate();
  gate.enter('account');
  const errors: unknown[] = [], visible: boolean[] = [];
  await gate.run(async () => { throw Error('offline'); }, { onError: error => errors.push(error), onRefreshing: value => visible.push(value) });
  assert.equal(gate.running(), false);
  assert.equal((errors[0] as Error).message, 'offline');
  assert.deepEqual(visible, [true, false]);
  assert.equal(await gate.run(async () => {}), true);
});

test('leaving the screen invalidates pending refresh callbacks', async () => {
  const gate = createConsultationRefreshGate();
  gate.enter('screen');
  const pending = deferred(), visible: boolean[] = [];
  const first = gate.run(() => pending.promise, { onRefreshing: value => visible.push(value) });
  gate.leave();
  pending.resolve();
  await first;
  assert.deepEqual(visible, [true]);
  assert.equal(await gate.run(async () => {}), false);
});
