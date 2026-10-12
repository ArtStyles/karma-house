import assert from 'node:assert/strict';
import test from 'node:test';
import { cardSizes, easeOut, pickMode, seg, stepAt } from '../web/src/scroll.ts';

test('seg clamps progress to its window', () => {
  assert.equal(seg(0.1, 0.2, 0.4), 0);
  assert.equal(seg(0.25, 0, 0.5), 0.5);
  assert.equal(seg(0.9, 0.2, 0.4), 1);
});

test('easeOut starts at 0, ends at 1 and never overshoots', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(easeOut(t) >= 0 && easeOut(t) <= 1);
});

test('stepAt splits progress into equal steps and stays in range', () => {
  assert.deepEqual([0, 0.24, 0.25, 0.5, 0.99, 1, 1.4].map((s) => stepAt(s, 4)), [0, 0, 1, 2, 3, 3, 3]);
});

test('pickMode: static for reduced motion, lite for data saver or low memory', () => {
  assert.equal(pickMode({ reduce: true, saveData: true }), 'static');
  assert.equal(pickMode({ reduce: false, saveData: true }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 2 }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 4 }), 'full');
  assert.equal(pickMode({ reduce: false }), 'full');
});

test('cardSizes fits the arch in the visual area and keeps the phone at 9:19.5', () => {
  for (const [w, h] of [[560, 640], [343, 380], [300, 900]]) {
    const s = cardSizes(w, h);
    assert.ok(s.archH <= h - 28 + 1e-6, `arch height for ${w}x${h}`);
    assert.ok(s.archW <= w, `arch width for ${w}x${h}`);
    assert.equal(Math.round((s.phoneW / s.phoneH) * 1000), Math.round((9 / 19.5) * 1000));
  }
});
