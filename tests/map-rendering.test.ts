// @ts-nocheck -- Executed directly by Node; no DOM or native runtime needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { approximateAreas, coordinatesFromMapPress } from '../src/components/maps/mapGeometry.ts';
import { customizeMapStyle } from '../src/components/maps/mapConfig.ts';

test('approximate areas show an 800 metre radius and exact markers have no area', () => {
  const result = approximateAreas([
    { id: 'nearby', coordinate: { latitude: 23.14, longitude: -82.38 }, precision: 'approximate', label: '$ 90000' },
    { id: 'exact', coordinate: { latitude: 23.2, longitude: -82.3 }, precision: 'exact' },
  ]);
  assert.equal(result.features.length, 1);
  const area = result.features[0];
  assert.equal(area.geometry.type, 'Polygon');
  assert.deepEqual(area.properties, { id: 'nearby' });
  const ring = area.geometry.coordinates[0];
  assert.deepEqual(ring[0], ring.at(-1));
  // Haversine independently checks the rendered boundary rather than its construction.
  for (const [longitude, latitude] of ring) {
    const r = Math.PI / 180;
    const a = Math.sin((latitude - 23.14) * r / 2) ** 2 + Math.cos(23.14 * r) * Math.cos(latitude * r) * Math.sin((longitude + 82.38) * r / 2) ** 2;
    const distance = 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    assert.ok(Math.abs(distance - 800) < 0.1, `${distance} should be 800 metres`);
  }
});

test('provider styling preserves sources, labels and attribution without mutating the source', () => {
  const source = {
    version: 8,
    sources: { base: { type: 'vector', url: 'https://example.test/tiles', attribution: '© Original data' } },
    layers: [
      { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#000000', 'fill-opacity': 0.7 } },
      { id: 'label_city', type: 'symbol', source: 'base', layout: { 'text-field': '{name}' } },
    ],
  };
  const original = structuredClone(source);
  const styled = customizeMapStyle(source);
  assert.deepEqual(source, original);
  assert.deepEqual(styled.sources, source.sources);
  assert.deepEqual(styled.layers[1], source.layers[1]);
  assert.notEqual(styled.layers[0].paint['fill-color'], '#000000');
  assert.equal(styled.layers[0].paint['fill-opacity'], 0.7);
});

test('map presses wrap longitudes and reject coordinates a provider cannot render', () => {
  const wrapped = coordinatesFromMapPress(23, 277.6);
  assert.equal(wrapped?.latitude, 23);
  assert.ok(Math.abs(wrapped.longitude + 82.4) < 1e-10);
  assert.equal(coordinatesFromMapPress(NaN, -82), undefined);
  assert.equal(coordinatesFromMapPress(23, Infinity), undefined);
  assert.equal(coordinatesFromMapPress(91, 23), undefined);
});
