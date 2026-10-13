import assert from 'node:assert/strict';
import test from 'node:test';
import { pickMode, seg, smooth, tourAt, tourTimeline } from '../web/src/scroll.ts';

test('seg clamps progress to its window', () => {
  assert.equal(seg(0.1, 0.2, 0.4), 0);
  assert.equal(seg(0.25, 0, 0.5), 0.5);
  assert.equal(seg(0.9, 0.2, 0.4), 1);
});

test('smooth is symmetric and stays in 0..1', () => {
  assert.equal(smooth(0), 0);
  assert.equal(smooth(1), 1);
  assert.equal(smooth(0.5), 0.5);
  assert.ok(Math.abs(smooth(0.2) + smooth(0.8) - 1) < 1e-12);
  assert.equal(smooth(-1), 0);
});

test('pickMode: static for reduced motion, lite for data saver or low memory', () => {
  assert.equal(pickMode({ reduce: true, saveData: true }), 'static');
  assert.equal(pickMode({ reduce: false, saveData: true }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 2 }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 4 }), 'full');
  assert.equal(pickMode({ reduce: false }), 'full');
});

test('tourTimeline starts paused, then walks one unit per photo and pauses at each stop', () => {
  const { parts, units } = tourTimeline([0, 2], 2);
  assert.deepEqual(parts.map((x) => [x.kind, x.k, x.a, x.b]), [['pause', 0, 0, 2], ['move', 0, 2, 3], ['move', 1, 3, 4], ['pause', 2, 4, 6]]);
  assert.equal(units, 6);
});

test('tourAt finds the part and the progress inside it, and holds the end', () => {
  const { parts } = tourTimeline([0, 2], 2);
  assert.deepEqual([tourAt(parts, 2.5).part.k, tourAt(parts, 2.5).u], [0, 0.5]);
  assert.equal(tourAt(parts, 3).part.k, 1);
  assert.deepEqual([tourAt(parts, 99).part.kind, tourAt(parts, 99).u], ['pause', 1]);
});
