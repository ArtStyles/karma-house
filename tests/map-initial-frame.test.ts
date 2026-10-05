import assert from 'node:assert/strict';
import test from 'node:test';
import { initialExploreFrame } from '../src/domain/mapFrame.ts';

test('the first province frame uses already loaded public points without mutating them', () => {
  const points = [{ latitude: 23.1, longitude: -82.4, precision: 'approximate' as const }, { latitude: 23.2, longitude: -82.3, precision: 'exact' as const }];
  const before = structuredClone(points);
  const frame = initialExploreFrame('La Habana', points, 390);
  assert.ok(Math.abs(frame.center.latitude - 23.15) < .0001);
  assert.ok(frame.bounds.west < -82.4 && frame.bounds.east > -82.3);
  assert.ok(frame.bounds.south < 23.1 && frame.bounds.north > 23.2);
  assert.ok(frame.zoom > 5 && frame.zoom <= 11);
  assert.deepEqual(points, before);
});

test('absent or invalid context keeps Cuba visible and never invents a location', () => {
  const empty = initialExploreFrame('La Habana', [], 390);
  assert.deepEqual(initialExploreFrame('unknown', [{latitude:23,longitude:-82,precision:'exact'}], 390), empty);
  assert.deepEqual(initialExploreFrame('La Habana', [{latitude:NaN,longitude:-82,precision:'exact'}], 390), empty);
  assert.deepEqual(initialExploreFrame('', [{latitude:23,longitude:-82,precision:'exact'}], 390), empty);
  assert.ok(empty.bounds.west < -84 && empty.bounds.east > -75);
});

test('overlapping points yield a nonzero box at a bounded zoom', () => {
  const point = { latitude: 23.1, longitude: -82.4, precision: 'approximate' as const };
  const frame = initialExploreFrame('La Habana', [point, point], 1280);
  assert.deepEqual(frame.center, { latitude:23.1, longitude:-82.4 });
  assert.ok(frame.bounds.west < frame.bounds.east && frame.bounds.south < frame.bounds.north);
  assert.ok(frame.zoom <= 11);
});
