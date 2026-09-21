import assert from 'node:assert/strict';
import test from 'node:test';

import { beginLocationSelection, locationSelectionReducer, publishedSelection } from '../src/components/maps/locationSelection.ts';

test('a new selection defaults to approximate and never invents a point', () => {
  const selection = beginLocationSelection();
  assert.equal(selection.precision, 'approximate');
  assert.equal(publishedSelection(selection), undefined);
});

test('only the normalized public point leaves an approximate picker session', () => {
  const selected = locationSelectionReducer(beginLocationSelection(), {
    type: 'point', coordinate: { latitude: 23.138425, longitude: -82.389173 },
  });
  assert.deepEqual(publishedSelection(selected), { latitude: 23.14, longitude: -82.39, precision: 'approximate' });
  const exact = locationSelectionReducer(selected, { type: 'precision', precision: 'exact' });
  assert.deepEqual(publishedSelection(exact), { latitude: 23.138425, longitude: -82.389173, precision: 'exact' });
});

test('editing then cancelling can reopen the unchanged saved location', () => {
  const saved = { latitude: 23.138425, longitude: -82.389173, precision: 'exact' } as const;
  let selection = beginLocationSelection(saved);
  selection = locationSelectionReducer(selection, { type: 'point', coordinate: { latitude: 22, longitude: -80 } });
  selection = locationSelectionReducer(selection, { type: 'precision', precision: 'approximate' });
  assert.notDeepEqual(publishedSelection(selection), saved);
  assert.deepEqual(publishedSelection(beginLocationSelection(saved)), saved);
  assert.deepEqual(saved, { latitude: 23.138425, longitude: -82.389173, precision: 'exact' });
});

test('removing a staged point clears its public preview', () => {
  const saved = { latitude: 23.14, longitude: -82.39, precision: 'approximate' } as const;
  const cleared = locationSelectionReducer(beginLocationSelection(saved), { type: 'clear' });
  assert.equal(publishedSelection(cleared), undefined);
  assert.deepEqual(publishedSelection(beginLocationSelection(saved)), saved);
});

test('invalid map events cannot replace a valid staged location', () => {
  const saved = { latitude: 23.14, longitude: -82.39, precision: 'approximate' } as const;
  const selection = beginLocationSelection(saved);
  for (const coordinate of [{ latitude: NaN, longitude: -82 }, { latitude: 95, longitude: -82 }, { latitude: 23, longitude: 190 }]) {
    const next = locationSelectionReducer(selection, { type: 'point', coordinate });
    assert.deepEqual(publishedSelection(next), saved);
  }
});
