// @ts-nocheck -- Executed directly by Node; no DOM or native runtime needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCursor, encodeCursor, searchPayload } from '../src/catalog/query.ts';
import { defaultFilters, normalizeSearch } from '../src/domain/listings.ts';

test('a cursor survives a round trip and keeps the sort and search mode', () => {
  const cursor = { sort: 'price-asc', mode: 'fts', id: '6f1c0c7e-0000-4000-8000-000000000001', key: '85000.00' };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test('a timestamp key round trips, so the recent order keeps its cursor intact', () => {
  const cursor = { sort: 'recent', mode: 'none', id: 'a', key: '2026-09-17T10:00:00.123456+00:00' };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test('a corrupt or tampered cursor is rejected rather than paging from an arbitrary row', () => {
  const bad = ['', 'a|b', 'nope|fts|a|1', 'recent|nope|a|1', 'recent|fts||1', 'recent|fts|a|', 'recent|fts|a|1|extra', 42, null, undefined];
  for (const value of bad) {
    assert.throws(() => decodeCursor(value), /KH_INVALID_CURSOR/, `should reject ${String(value)}`);
  }
});

test('a separator inside a cursor field is refused instead of producing an ambiguous cursor', () => {
  assert.throws(() => encodeCursor({ sort: 'recent', mode: 'none', id: 'a|b', key: '1' }), /KH_INVALID_CURSOR/);
});

test('blank filters send no predicates so the server scans the public catalogue index', () => {
  const payload = searchPayload({ ...defaultFilters }, null, true);
  assert.equal(payload.query, '');
  assert.equal(payload.sort, 'recent');
  assert.equal(payload.cursor, null);
  assert.equal(payload.with_total, true);
  assert.equal(payload.limit, 24);
  for (const key of ['type', 'province', 'condition', 'min_price', 'max_price', 'min_area', 'max_area', 'min_bathrooms', 'negotiable_only']) {
    assert.equal(payload[key], null, `${key} should be absent`);
  }
  assert.equal(payload.min_bedrooms, 0);
  assert.deepEqual(payload.amenities, []);
});

test('numeric filters reach the server as numbers and blank or invalid text is dropped', () => {
  const payload = searchPayload({ ...defaultFilters, minPrice: '20000', maxPrice: '  ', minArea: 'abc', maxArea: '180.5', minBathrooms: 2 }, null, false);
  assert.equal(payload.min_price, 20000);
  assert.equal(payload.max_price, null);
  assert.equal(payload.min_area, null);
  assert.equal(payload.max_area, 180.5);
  assert.equal(payload.min_bathrooms, 2);
});

test('the search text is normalised by the same function the local demo filter uses', () => {
  const raw = '  HabÁna Ñ  ';
  assert.equal(searchPayload({ ...defaultFilters, query: raw }, null, false).query, normalizeSearch(raw));
  assert.equal(searchPayload({ ...defaultFilters, query: raw }, null, false).query, 'habana n');
});

test('amenities are normalised so they match the unaccented server column', () => {
  assert.deepEqual(searchPayload({ ...defaultFilters, amenities: ['Terraza', 'Garaje Próximo', ''] }, null, false).amenities, ['terraza', 'garaje proximo']);
});

test('type Todas is not a predicate', () => {
  assert.equal(searchPayload({ ...defaultFilters, type: 'Todas' }, null, false).type, null);
  assert.equal(searchPayload({ ...defaultFilters, type: 'Casa' }, null, false).type, 'Casa');
});

test('a tampered cursor is rejected while building the payload, before any request', () => {
  assert.throws(() => searchPayload({ ...defaultFilters }, 'recent|fts|a', false), /KH_INVALID_CURSOR/);
});
