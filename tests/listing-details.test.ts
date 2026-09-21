// @ts-nocheck -- Pure domain modules run directly in Node.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../src/domain/listings.ts';
import { restoreDraft } from '../src/domain/draftPersistence.ts';
import { decodeMarketplaceSnapshot } from '../src/state/marketplaceStore.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';

const draft = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '50000', bedrooms: '2', bathrooms: '1', area: '80', type: 'Casa', description: 'Vivienda luminosa con patio para compartir.', amenities: ['Patio', 'Terraza'], imageKey: 'vedado', clientRequestId: 'details-test' };
const details = { condition: 'good', floor: '0', priceNegotiable: false };
const make = (patch = {}, id = 'home') => domain.createListing({ ...draft, ...patch }, { id, now: '2026-09-20T00:00:00.000Z' });
const row = { id: 'home', owner_id: 'seller', client_request_id: 'details-test', title: draft.title, location: draft.location, province: draft.province, price: 50000, bedrooms: 2, bathrooms: 1, area: 80, type: 'Casa', description: draft.description, amenities: draft.amenities, photo_paths: [], availability: 'active', moderation: 'approved', review_note: null, version: 1, created_at: '2026-09-20T00:00:00.000Z' };

test('details survive creation, draft recovery and local snapshot without inventing legacy values', () => {
  const current = make(details);
  assert.equal(current.condition, 'good'); assert.equal(current.floor, 0); assert.equal(current.priceNegotiable, false);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...draft, ...details }), draft), { ...draft, ...details });
  const decoded = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: [current], favoriteIds: [] }));
  assert.equal(decoded.issue, null); assert.deepEqual(decoded.snapshot.localListings[0], current);
  const legacy = make();
  for (const key of ['condition', 'floor', 'priceNegotiable']) assert.equal(Object.hasOwn(legacy, key), false);
  assert.deepEqual(restoreDraft(JSON.stringify(draft), { ...draft, ...details }), draft);
  assert.equal(decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: [legacy], favoriteIds: [] })).issue, null);
});

test('optional details validate type and boundaries but allow unspecified drafts', () => {
  assert.equal(domain.validateDraft({ ...draft, condition: '', floor: '' }).ok, true);
  for (const patch of [{ condition: 'perfect' }, { floor: '-1' }, { floor: '100' }, { floor: '1.5' }, { floor: 'NaN' }, { floor: null }, { priceNegotiable: 'false' }]) {
    assert.equal(domain.validateDraft({ ...draft, ...patch }).ok, false, JSON.stringify(patch));
    assert.deepEqual(restoreDraft(JSON.stringify({ ...draft, ...patch }), draft), draft);
  }
  assert.equal(domain.validateDraft({ ...draft, floor: '99', condition: 'needs-renovation', priceNegotiable: true }).ok, true);
});

test('local update preserves omitted details and explicitly clears condition and floor', () => {
  const original = make(details);
  const legacyUpdate = domain.updateListing(original, { ...draft, title: 'Casa editada' });
  assert.equal(legacyUpdate.condition, 'good'); assert.equal(legacyUpdate.floor, 0); assert.equal(legacyUpdate.priceNegotiable, false);
  const cleared = domain.updateListing(original, { ...draft, condition: '', floor: '', priceNegotiable: true });
  assert.equal(Object.hasOwn(cleared, 'condition'), false); assert.equal(Object.hasOwn(cleared, 'floor'), false); assert.equal(cleared.priceNegotiable, true);
});

test('remote details preserve false and zero, omit nulls and reject malformed values', () => {
  const mapped = mapRemoteListing({ ...row, condition: 'good', floor: 0, price_negotiable: false }, new Map());
  assert.equal(mapped.condition, 'good'); assert.equal(mapped.floor, 0); assert.equal(mapped.priceNegotiable, false);
  for (const input of [row, { ...row, condition: null, floor: null, price_negotiable: null }]) {
    const legacy = mapRemoteListing(input, new Map());
    for (const key of ['condition', 'floor', 'priceNegotiable']) assert.equal(Object.hasOwn(legacy, key), false);
  }
  for (const patch of [{ condition: 'bad' }, { floor: 100 }, { floor: 1.1 }, { price_negotiable: 'false' }]) assert.throws(() => mapRemoteListing({ ...row, ...patch }, new Map()));
});

test('RPC payload distinguishes omission from explicit clearing and preserves false', () => {
  const legacy = propertyPayload(draft, 'seller', [], 'draft');
  for (const key of ['condition', 'floor', 'priceNegotiable']) assert.equal(Object.hasOwn(legacy, key), false);
  const complete = propertyPayload({ ...draft, ...details }, 'seller', [], 'draft');
  assert.equal(complete.condition, 'good'); assert.equal(complete.floor, 0); assert.equal(complete.priceNegotiable, false);
  const cleared = propertyPayload({ ...draft, condition: '', floor: '' }, 'seller', [], 'draft');
  assert.equal(cleared.condition, null); assert.equal(cleared.floor, null);
});

test('explicit null clears negotiability in local edits, persisted drafts and remote payloads', () => {
  for (const previous of [false, true]) {
    const clearing = { ...draft, priceNegotiable: null };
    assert.equal(domain.validateDraft(clearing).ok, true);
    assert.deepEqual(restoreDraft(JSON.stringify(clearing), draft), clearing);
    const updated = domain.updateListing(make({ priceNegotiable: previous }), clearing);
    assert.equal(Object.hasOwn(updated, 'priceNegotiable'), false);
    assert.equal(propertyPayload(clearing, 'seller', [], 'draft').priceNegotiable, null);
  }
  assert.equal(Object.hasOwn(make({ priceNegotiable: null }), 'priceNegotiable'), false);
});

const catalogue = [make({ condition: 'good', priceNegotiable: true, bathrooms: '2', area: '100' }, 'match'), make({ condition: 'new', price: '90000', area: '140', amenities: ['Patio'], province: 'Matanzas' }, 'other'), make({}, 'legacy')];
test('detailed filters combine actual data with AND amenities and exclude unknown condition/negotiability', () => {
  const filtered = domain.filterListings(catalogue, { ...domain.defaultFilters, province: 'la habana', minPrice: '40000', maxPrice: '60000', minArea: '90', maxArea: '110', minBathrooms: 2, condition: 'good', amenities: ['patio', 'terraza'], negotiableOnly: true });
  assert.deepEqual(filtered.map(item => item.id), ['match']);
  assert.deepEqual(domain.filterListings(catalogue, { ...domain.defaultFilters, condition: 'good' }).map(item => item.id), ['match']);
  assert.deepEqual(domain.filterListings(catalogue, { ...domain.defaultFilters, negotiableOnly: true }).map(item => item.id), ['match']);
  assert.deepEqual(domain.filterListings(catalogue, { ...domain.defaultFilters, amenities: ['Patio', 'Piscina'] }), []);
});
test('all sort orders operate on a copy and preserve default legacy filters', () => {
  assert.deepEqual(domain.filterListings(catalogue, { ...domain.defaultFilters, sort: 'price-desc' }).map(item => item.id), ['other', 'match', 'legacy']);
  assert.deepEqual(domain.filterListings(catalogue, { ...domain.defaultFilters, sort: 'area-desc' }).map(item => item.id), ['other', 'match', 'legacy']);
  assert.deepEqual(catalogue.map(item => item.id), ['match', 'other', 'legacy']);
  assert.equal(domain.filterListings(catalogue, domain.defaultFilters).length, 3);
});
test('range validation catches malformed and reversed ranges without flagging absent ranges', () => {
  assert.equal(domain.filterRangeError(domain.defaultFilters), null);
  assert.equal(domain.filterRangeError({ ...domain.defaultFilters, minPrice: '0', maxPrice: '0', minArea: '12.5', maxArea: '12.5' }), null);
  for (const patch of [{ minPrice: '90000', maxPrice: '50000' }, { minArea: '90', maxArea: '80' }, { minPrice: '-1' }, { minArea: 'abc' }, { maxArea: 'Infinity' }]) assert.equal(typeof domain.filterRangeError({ ...domain.defaultFilters, ...patch }), 'string');
});
test('active criteria count excludes ordering and whitespace and counts ranges once', () => {
  assert.equal(domain.activeFilterCount({ ...domain.defaultFilters, query: '  ', sort: 'area-desc' }), 0);
  assert.equal(domain.activeFilterCount({ ...domain.defaultFilters, query: 'Vedado', type: 'Casa', province: 'La Habana', minPrice: '1', maxPrice: '2', minArea: '3', maxArea: '4', minBedrooms: 2, minBathrooms: 1, condition: 'new', amenities: ['Patio', 'Patio', 'Terraza'], negotiableOnly: true }), 11);
});
