// @ts-nocheck -- Pure domain tests run directly with Node's TypeScript stripping.
import assert from 'node:assert/strict';
import test from 'node:test';
import { isMapLocation, normalizeMapLocation } from '../src/domain/geo.ts';
import { createListing, updateListing, validateDraft } from '../src/domain/listings.ts';
import { restoreDraft, createDraftPersistence } from '../src/domain/draftPersistence.ts';
import { createMarketplaceController, decodeMarketplaceSnapshot } from '../src/state/marketplaceStore.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';

const draft = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '100', bedrooms: '2', bathrooms: '1', area: '40', type: 'Casa', description: 'Una casa de prueba con descripción completa.', amenities: [], imageKey: 'vedado', clientRequestId: 'map-request' };
const location = { latitude: 23.13587, longitude: -82.395, precision: 'approximate' };
const normalized = { latitude: 23.14, longitude: -82.39, precision: 'approximate' };
const row = { id: 'property-map', owner_id: 'owner-a', client_request_id: draft.clientRequestId, title: draft.title, location: draft.location, province: draft.province, price: 100, bedrooms: 2, bathrooms: 1, area: 40, type: 'Casa', description: draft.description, amenities: [], photo_paths: [], availability: 'active', moderation: 'approved', review_note: null, version: 1, created_at: '2026-09-17T00:00:00.000Z' };

test('coordinates reject partial, nonfinite, out-of-range and unknown precision values', () => {
  for (const candidate of [null, {}, [], { ...location, latitude: NaN }, { ...location, longitude: Infinity }, { ...location, latitude: 91 }, { ...location, longitude: -181 }, { ...location, latitude: '23' }, { ...location, precision: 'secret' }]) {
    assert.equal(isMapLocation(candidate), false);
    assert.throws(() => normalizeMapLocation(candidate), /ubicación/i);
  }
  assert.equal(isMapLocation({ latitude: -90, longitude: 180, precision: 'exact' }), true);
  assert.equal(validateDraft({ ...draft, mapLocation: { ...location, latitude: NaN } }).ok, false);
});

test('approximate publication discards the precise point and uses deterministic negative ties', () => {
  assert.deepEqual(normalizeMapLocation(location), normalized);
  assert.deepEqual(normalizeMapLocation({ latitude: 20.025, longitude: -81.915, precision: 'approximate' }), { latitude: 20.02, longitude: -81.92, precision: 'approximate' });
  assert.deepEqual(normalizeMapLocation(normalized), normalized);
  assert.deepEqual(normalizeMapLocation({ ...location, precision: 'exact' }), { ...location, precision: 'exact' });
  assert.equal(normalizeMapLocation({ ...location, latitude: 23.12345678, precision: 'exact' }).latitude, 23.123457);
  assert.deepEqual(createListing({ ...draft, mapLocation: location }).mapLocation, normalized);
  assert.deepEqual(location, { latitude: 23.13587, longitude: -82.395, precision: 'approximate' });
});

test('editing can remove a point and older local records remain valid without one', () => {
  const listing = createListing({ ...draft, mapLocation: location });
  assert.equal(updateListing(listing, draft).mapLocation, undefined);
  const decoded = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: [listing, createListing(draft, { id: 'old' })], favoriteIds: [] }));
  assert.equal(decoded.issue, null);
  assert.deepEqual(decoded.snapshot.localListings[0].mapLocation, normalized);
  assert.equal(decoded.snapshot.localListings[1].mapLocation, undefined);
});

test('draft restore preserves public position and rejects corrupt location values', () => {
  assert.deepEqual(restoreDraft(JSON.stringify({ ...draft, mapLocation: location }), draft).mapLocation, normalized);
  assert.equal(restoreDraft(JSON.stringify({ ...draft, mapLocation: { ...location, longitude: 200 } }), draft), draft);
  assert.equal(restoreDraft(JSON.stringify(draft), draft).mapLocation, undefined);
});

test('queued draft persistence snapshots map position instead of retaining mutable references', async () => {
  let raw = null;
  const persistence = createDraftPersistence({ getItem: async () => raw, setItem: async (_key, value) => { raw = value; }, removeItem: async () => {} }, 'map-snapshot-test');
  await persistence.read();
  const submitted = { ...draft, mapLocation: { ...location } };
  const saving = persistence.write(submitted);
  submitted.mapLocation.latitude = 40;
  await saving;
  assert.deepEqual(JSON.parse(raw).mapLocation, normalized);
});

test('local catalog saves and hydrates normalized map coordinates without reference leaks', async () => {
  let raw = null;
  const options = { storage: { getItem: async () => raw, setItem: async (_key, value) => { raw = value; } }, demoListings: [], idFactory: () => 'map-local' };
  const controller = createMarketplaceController(options);
  await controller.saveListing({ ...draft, mapLocation: location });
  controller.getState().listings[0].mapLocation.latitude = 0;
  await controller.setStatus('map-local', 'paused');
  assert.deepEqual(controller.getState().listings[0].mapLocation, normalized);
  const restored = createMarketplaceController(options);
  await restored.hydrate();
  assert.deepEqual(restored.getState().listings[0].mapLocation, normalized);
});

test('remote mapping handles all-null/old records and never accepts partial or malformed locations', () => {
  assert.equal(mapRemoteListing(row, new Map()).mapLocation, undefined);
  assert.equal(mapRemoteListing({ ...row, latitude: null, longitude: null, location_precision: null }, new Map()).mapLocation, undefined);
  assert.deepEqual(mapRemoteListing({ ...row, latitude: location.latitude, longitude: location.longitude, location_precision: 'approximate' }, new Map()).mapLocation, normalized);
  for (const fields of [{ latitude: 23 }, { latitude: null, longitude: -82, location_precision: 'approximate' }, { latitude: '', longitude: -82, location_precision: 'exact' }, { latitude: 23, longitude: -200, location_precision: 'exact' }]) {
    assert.throws(() => mapRemoteListing({ ...row, ...fields }, new Map()), /ubicación/i);
  }
});

test('RPC payload explicitly removes empty location and normalizes exact or approximate publication', () => {
  assert.equal(propertyPayload(draft, 'owner-a', [], 'draft').mapLocation, null);
  assert.deepEqual(propertyPayload({ ...draft, mapLocation: location }, 'owner-a', [], 'draft').mapLocation, normalized);
});
