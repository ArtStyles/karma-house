import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilterDismissalGate, filterSheetPosition, shouldDismissFilterSheet } from '../src/components/filterSheetMotion.ts';

test('short drags return, deliberate travel and downward momentum dismiss', () => {
  assert.equal(shouldDismissFilterSheet(70, 0, 600), false);
  assert.equal(shouldDismissFilterSheet(200, 0, 600), true);
  assert.equal(shouldDismissFilterSheet(40, 1100, 600), true);
  assert.equal(shouldDismissFilterSheet(2, 1100, 600), false);
});

test('an upward reversal returns even after passing the distance threshold', () => {
  assert.equal(shouldDismissFilterSheet(230, -450, 600), false);
  assert.equal(shouldDismissFilterSheet(90, -100, 600), false);
});

test('geometry resists the upper edge and rejects invalid measurements', () => {
  assert.ok(filterSheetPosition(-30, 600) > -30);
  assert.ok(filterSheetPosition(-30, 600) < 0);
  assert.equal(filterSheetPosition(75, 600), 75);
  assert.ok(filterSheetPosition(2000, 600) <= 632);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(filterSheetPosition(invalid, 600), 0);
    assert.equal(shouldDismissFilterSheet(200, invalid, 600), false);
    assert.equal(shouldDismissFilterSheet(200, 0, invalid), false);
  }
  assert.equal(shouldDismissFilterSheet(200, 0, 0), false);
});

test('grabbing a closing panel invalidates its old completion', () => {
  let closed = 0;
  const gate = createFilterDismissalGate(() => closed++);
  assert.equal(gate.begin(1), true);
  assert.equal(gate.interrupt(), true);
  assert.equal(gate.finish(1), false);
  assert.equal(closed, 0);
  assert.equal(gate.begin(2), true);
  assert.equal(gate.finish(1), false);
  assert.equal(gate.finish(2), true);
  assert.equal(gate.finish(2), false);
  assert.equal(closed, 1);
});

test('applying commits exactly once and cannot be reversed after confirmation', () => {
  let applied = 0, closed = 0;
  const gate = createFilterDismissalGate(() => closed++);
  assert.equal(gate.begin(1, () => applied++), true);
  assert.equal(gate.begin(2, () => applied++), false);
  assert.equal(gate.interrupt(), false);
  assert.equal(applied, 1);
  assert.equal(gate.finish(1), true);
  assert.equal(closed, 1);
  assert.equal(gate.begin(3, () => applied++), false);
});

test('a cancelled unmount discards pending callbacks', () => {
  let closed = 0;
  const gate = createFilterDismissalGate(() => closed++);
  gate.begin(1);
  gate.deactivate();
  assert.equal(gate.finish(1), false);
  assert.equal(gate.begin(2), false);
  assert.equal(closed, 0);
});
