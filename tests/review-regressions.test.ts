// @ts-nocheck -- lifecycle, repository and map event fixtures, without native services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogController } from '../src/catalog/controller.ts';
import { catalogQueryStatus, catalogRetryAction } from '../src/catalog/presentation.ts';
import { defaultFilters } from '../src/domain/listings.ts';
import { createPendingIntentStore } from '../src/auth/pendingIntent.ts';
import { shouldClearAuthIntent, createAuthFocusScope } from '../src/auth/intentLifecycle.ts';
import { prepareCoverPhoto } from '../src/domain/photoCover.ts';
import { uploadCoverThumb } from '../src/data/photoUpload.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';
import { observeMapViewport } from '../src/components/maps/viewportReporter.ts';

test('retry starts the requested first page after a failed filter change, despite old pagination', async () => {
  let fail = false;
  const calls = [];
  const controller = createCatalogController({ async search(filters, cursor, total) {
    calls.push({ maxPrice: filters.maxPrice, cursor, total });
    if (fail) throw Error('unavailable');
    return { rows: [], total: 60, nextCursor: 'old-next', searchMode: 'none' };
  }});
  await controller.setFilters(defaultFilters);
  const next = { ...defaultFilters, maxPrice: '500' };
  fail = true;
  await assert.rejects(controller.setFilters(next));
  const state = { ...controller.getState(), ...catalogQueryStatus(controller.getState(), next) };
  assert.equal(state.hasMore, true);
  fail = false;
  if (catalogRetryAction(state) === 'page') await controller.loadMore();
  else await controller.setFilters(next);
  assert.deepEqual(calls.at(-1), { maxPrice: '500', cursor: null, total: true });
  assert.equal(calls.length, 3);
  assert.equal(catalogRetryAction({ current: true, hasMore: true }), 'page');
});

test('warm signup callback retains context until authenticated destination consumes it; Back cancels', async () => {
  const items = new Map();
  const store = createPendingIntentStore({ storage: {
    async getItem(k) { return items.get(k) ?? null; }, async setItem(k, v) { items.set(k, v); }, async removeItem(k) { items.delete(k); }
  }, now: Date.now });
  const intent = { kind: 'search', filters: { operation: 'offers' }, sort: 'price-desc' };
  // Use the validated empty search contract rather than credentials or arbitrary URLs.
  const { toSavedFilters } = await import('../src/searches/domain.ts');
  intent.filters = toSavedFilters({ ...defaultFilters, maxPrice: '1' });
  await store.write(intent);
  if (shouldClearAuthIntent('/auth', '/auth/callback', false)) await store.clear();
  assert.deepEqual(await store.read(), intent);
  if (shouldClearAuthIntent('/auth/callback', '/', true)) await store.clear();
  assert.deepEqual(await store.take('/'), intent);
  await store.write(intent);
  if (shouldClearAuthIntent('/auth', '/', false)) await store.clear();
  assert.equal(await store.read(), null);
  assert.equal(shouldClearAuthIntent('/auth', '/auth', false), false);
});

test('a delayed authentication completion cannot navigate after leaving or refocusing', async () => {
  const focus = createAuthFocusScope();
  focus.enter();
  const first = focus.checkpoint();
  focus.leave();
  let navigations = 0;
  await Promise.resolve();
  if (first()) navigations++;
  focus.enter();
  assert.equal(first(), false);
  assert.equal(focus.checkpoint()(), true);
  assert.equal(navigations, 0);
});

test('stored and inherited covers prepare thumbnails, upload under current owner, and reload as a thumbnail', async () => {
  const inherited = { uri: 'https://signed.example/inherited.jpg', storagePath: 'previous/request/b.jpg' };
  const cover = await prepareCoverPhoto(inherited, async (uri, token) => {
    assert.equal(uri, inherited.uri); assert.equal(token, 'cover-choice');
    return 'data:image/jpeg;base64,AQID';
  }, () => 'cover-choice');
  assert.equal(cover.storagePath, inherited.storagePath);
  assert.deepEqual(inherited, { uri: 'https://signed.example/inherited.jpg', storagePath: 'previous/request/b.jpg' });
  const uploaded = new Map();
  const port = { async exists(p) { return uploaded.has(p); }, async upload(p, bytes, type) { uploaded.set(p, type); }, async readLocal() { throw Error('not local'); } };
  const scope = { ownerId: '20000000-0000-4000-8000-000000000001', requestId: 'current-request' };
  const path = await uploadCoverThumb(cover, [cover.storagePath], port, () => {}, scope);
  assert.equal(path, `${scope.ownerId}/${scope.requestId}/cover-choice_t.jpg`);
  assert.equal(await uploadCoverThumb(cover, [cover.storagePath], port, () => {}, scope), path);
  assert.equal(uploaded.size, 1);
  const row = { id: 'property', owner_id: scope.ownerId, client_request_id: scope.requestId, version: 1, review_note: null, title: 'Cover', location: 'Centro', province: 'La Habana', price: 1, bedrooms: 1, bathrooms: 1, area: 1, type: 'Casa', description: '', amenities: [], availability: 'active', moderation: 'approved', created_at: '2026-10-05T00:00:00Z', photo_paths: [cover.storagePath], cover_thumb_path: path };
  const draft = { title: 'Cover', location: 'Centro', province: 'La Habana', price: '1', bedrooms: '1', bathrooms: '1', area: '1', type: 'Casa', description: '', amenities: [], clientRequestId: scope.requestId };
  const payload = propertyPayload(draft, scope.ownerId, [cover.storagePath], 'draft', { id: 'property', version: 1 }, path);
  assert.equal(payload.coverThumbPath, path);
  const reloaded = { ...row, photo_paths: payload.photoPaths, cover_thumb_path: payload.coverThumbPath };
  const listing = mapRemoteListing(reloaded, new Map([[path, 'https://thumb.example/b.jpg']]), 'cover');
  assert.equal(listing.coverThumb.uri, 'https://thumb.example/b.jpg');
  assert.equal(listing.photoUri, undefined, 'the card reload needs only the thumbnail URL');
});

test('reselecting a stored cover uses a fresh current-owner thumbnail path rather than an orphaned immutable file', async () => {
  const scope = { ownerId: '20000000-0000-4000-8000-000000000001', requestId: 'r' };
  const original = { uri: 'https://signed.example/a.jpg', storagePath: `${scope.ownerId}/r/a.jpg`, uploadId: 'a' };
  const cover = await prepareCoverPhoto(original, async () => 'data:image/jpeg;base64,AQID', () => 'fresh-choice');
  const uploaded = [];
  const path = await uploadCoverThumb(cover, [cover.storagePath], {
    async exists(p) { return p.endsWith('/a_t.jpg'); },
    async upload(p) { uploaded.push(p); }, async readLocal() { throw Error('not local'); }
  }, () => {}, scope);
  assert.equal(path, `${scope.ownerId}/r/fresh-choice_t.jpg`);
  assert.deepEqual(uploaded, [path]);
});

test('failed cover preparation keeps the original photo and does not permit a silent full-image fallback', async () => {
  const photo = { uri: 'https://signed.example/b.jpg', storagePath: 'previous/request/b.jpg' };
  await assert.rejects(prepareCoverPhoto(photo, async () => undefined, () => 'cover-choice'), /miniatura/);
  assert.equal(photo.thumbUri, undefined);
});

test('web map reports actual visible bounds on initial load and resize before any gesture', () => {
  const handlers = new Map();
  let extent = [-82.459, 23.081, -82.341, 23.199];
  const instance = {
    on(event, callback) { handlers.set(event, callback); }, off(event) { handlers.delete(event); },
    getBounds() { return { getWest: () => extent[0], getSouth: () => extent[1], getEast: () => extent[2], getNorth: () => extent[3] }; }, getZoom: () => 11,
  };
  const reported = [];
  const stop = observeMapViewport(instance, (bounds, zoom) => reported.push({ bounds, zoom }));
  assert.equal(reported.length, 0);
  handlers.get('load')();
  assert.equal(reported[0].bounds.west, -82.459);
  assert.equal(reported[0].bounds.east, -82.341);
  extent = [-82.5, 23.06, -82.3, 23.22];
  handlers.get('resize')();
  assert.equal(reported[1].bounds.east, -82.3);
  stop(); assert.equal(handlers.size, 0);
});
