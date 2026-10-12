import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CUBA_PROVINCES, CUBA_VIEWBOX } from '../web/src/cuba-map.ts';
import { PROVINCES } from '../web/src/content.ts';

test('map has one outline per province, in PROVINCES order', () => {
  assert.deepEqual(CUBA_PROVINCES.map((p) => p.name), [...PROVINCES]);
  for (const { name, d } of CUBA_PROVINCES) assert.match(d, /^(M[\d. L]+Z)+$/, name);
  assert.equal(CUBA_VIEWBOX, '0 0 1000 343');
});

test('map stays within 25 KB and credits OpenStreetMap', () => {
  const source = readFileSync(new URL('../web/src/cuba-map.ts', import.meta.url), 'utf8');
  assert.ok(Buffer.byteLength(source) <= 25_000);
  assert.match(source, /OpenStreetMap contributors, ODbL/);
});
