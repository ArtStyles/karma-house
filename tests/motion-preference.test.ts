import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotionPreference } from '../src/settings/motionPreference.ts';

test('motion is reduced until the preference is known, and a late initial read cannot override a system change', async () => {
  let resolve!: (value: boolean) => void;
  let changed!: (value: boolean) => void;
  const store = createMotionPreference({ read: () => new Promise<boolean>(r => { resolve = r; }), listen: listener => { changed = listener; return () => {}; } });
  assert.equal(store.getState(), true);
  const stop = store.start();
  changed(true);
  resolve(false);
  await Promise.resolve();
  assert.equal(store.getState(), true);
  changed(false);
  assert.equal(store.getState(), false);
  stop();
  changed(true);
  assert.equal(store.getState(), false);
});

test('a failed preference read keeps animations reduced', async () => {
  const store = createMotionPreference({ read: async () => { throw Error('unavailable'); }, listen: () => () => {} });
  const stop = store.start();
  await Promise.resolve();
  assert.equal(store.getState(), true);
  stop();
});
