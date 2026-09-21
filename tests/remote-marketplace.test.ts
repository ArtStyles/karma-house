// @ts-nocheck -- Node executes the pure domain/controller directly.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createListing, defaultFilters, filterListings, validateDraft } from '../src/domain/listings.ts';
import { mapRemoteListing, collectPages, mergeListings } from '../src/data/remoteMapping.ts';
import { decodePhotoDataUri, ownedPhotoPath, uploadDraftPhotos } from '../src/data/photoUpload.ts';
import { createRemoteMarketplaceController, remoteErrorMessage } from '../src/state/remoteMarketplaceStore.ts';
import { decodeMarketplaceSnapshot } from '../src/state/marketplaceStore.ts';

const draft = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '100', bedrooms: '2', bathrooms: '1', area: '40', type: 'Casa', description: 'Una casa de prueba con descripción completa.', amenities: [], imageKey: 'vedado', clientRequestId: 'request-1' };
const row = { id: 'property-1', owner_id: 'owner-a', client_request_id: 'request-1', title: draft.title, location: draft.location, province: draft.province, price: 100, bedrooms: 2, bathrooms: 1, area: 40, type: 'Casa', description: draft.description, amenities: [], photo_paths: ['owner-a/request-1/photo.jpg'], availability: 'active', moderation: 'pending', review_note: null, version: 1, created_at: '2026-09-17T00:00:00.000Z' };
const listing = () => mapRemoteListing(row, new Map([[row.photo_paths[0], 'https://storage.test/signed/photo'] ]));

test('remote mapping preserves storage paths, ownership and moderation without demo photos', () => {
  const mapped = listing();
  assert.equal(mapped.owner, 'remote');
  assert.equal(mapped.ownerId, 'owner-a');
  assert.equal(mapped.version, 1);
  assert.deepEqual(mapped.photos, [{ uri: 'https://storage.test/signed/photo', storagePath: row.photo_paths[0] }]);
  assert.equal(mapped.photoUri, mapped.photos[0].uri);
  assert.equal(filterListings([mapped], defaultFilters).length, 0);
  assert.equal(filterListings([{ ...mapped, moderationStatus: 'approved' }], defaultFilters).length, 1);
});

test('remote mapping rejects malformed numeric values rather than rendering false values', () => {
  assert.throws(() => mapRemoteListing({ ...row, price: 'NaN' }, new Map()), /datos|propiedad/i);
});

test('pagination continues until empty even when server caps below requested page size', async () => {
  const offsets = [];
  const records = Array.from({ length: 7 }, (_, id) => ({ id }));
  const result = await collectPages(async (from, to) => {
    offsets.push(from);
    return records.slice(from, Math.min(to + 1, from + 2));
  }, 4);
  assert.deepEqual(result, records);
  assert.deepEqual(offsets, [0, 2, 4, 6, 7]);
});

test('public and owner queries merge by ID with fresh owner version winning', () => {
  assert.deepEqual(mergeListings([{ ...listing(), version: 1 }], [{ ...listing(), version: 2 }]).map((item) => item.version), [2]);
});

test('photo drafts allow owned storage references and block remote URL imports', () => {
  assert.equal(validateDraft({ ...draft, photos: [{ uri: 'https://storage.test/signed', storagePath: 'owner-a/request-1/photo.jpg' }] }).ok, true);
  assert.equal(validateDraft({ ...draft, photos: [{ uri: 'https://external.test/photo' }] }).ok, false);
  assert.equal(validateDraft({ ...draft, photos: Array.from({ length: 7 }, () => ({ uri: 'file:///photo.jpg' })) }).ok, false);
  assert.equal(ownedPhotoPath('owner-a/request-1/photo.jpg', 'owner-a', 'request-1'), true);
  assert.equal(ownedPhotoPath('owner-b/request-1/photo.jpg', 'owner-a', 'request-1'), false);
  assert.equal(ownedPhotoPath('owner-a/request-1/../photo.jpg', 'owner-a', 'request-1'), false);
  assert.deepEqual(Array.from(new Uint8Array(decodePhotoDataUri('data:image/jpeg;base64,AQID').bytes)), [1, 2, 3]);
  assert.throws(() => decodePhotoDataUri('https://external.test/photo'), /imagen/i);
});

function fakeRepository(overrides = {}) {
  return { load: async () => ({ listings: [], ownListings: [], favoriteIds: [] }), save: async () => listing(), setFavorite: async () => {}, setStatus: async () => {}, submit: async () => {}, loadModerationQueue: async () => [], review: async () => {}, ...overrides };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test('logout clears private state immediately and ignores an old refresh completing late', async () => {
  const pending = deferred();
  const controller = createRemoteMarketplaceController(fakeRepository({ load: async (id) => id ? pending.promise : { listings: [], ownListings: [], favoriteIds: [] } }));
  controller.setSession('owner-a', true);
  const oldRefresh = controller.refresh();
  controller.setSession(null, false);
  assert.deepEqual(controller.getState().ownListings, []);
  assert.deepEqual(controller.getState().moderationQueue, []);
  pending.resolve({ listings: [listing()], ownListings: [listing()], favoriteIds: ['property-1'] });
  await oldRefresh;
  assert.deepEqual(controller.getState().listings, []);
  assert.deepEqual(controller.getState().favoriteIds, []);
});

test('a queued mutation cannot run under the next account and old completion cannot publish', async () => {
  const gate = deferred(); let saves = 0;
  const controller = createRemoteMarketplaceController(fakeRepository({ save: async () => { saves += 1; await gate.promise; return listing(); } }));
  controller.setSession('owner-a', false);
  const first = controller.saveListing(draft);
  const second = controller.saveListing({ ...draft, clientRequestId: 'request-2' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.setSession('owner-b', false);
  gate.resolve();
  await assert.rejects(first, /sesión/i);
  await assert.rejects(second, /sesión/i);
  assert.equal(saves, 1);
  assert.deepEqual(controller.getState().ownListings, []);
});

test('cloud errors remain visible and never replace the catalog with demos', async () => {
  const controller = createRemoteMarketplaceController(fakeRepository({ load: async () => { throw new Error('Servidor no disponible'); } }));
  await assert.rejects(controller.refresh(), /Servidor/);
  assert.equal(controller.getState().ready, true);
  assert.match(controller.getState().storageError, /Servidor/);
  assert.deepEqual(controller.getState().listings, []);
  await assert.rejects(controller.saveListing(draft), /sesión/i);
  await assert.rejects(controller.toggleFavorite('property-1'), /sesión/i);
});

test('a refresh started before a favorite mutation cannot undo the confirmed favorite', async () => {
  const oldRead = deferred();
  const controller = createRemoteMarketplaceController(fakeRepository({ load: async () => oldRead.promise }));
  controller.setSession('owner-a', false);
  const refresh = controller.refresh();
  await controller.toggleFavorite('property-1');
  oldRead.resolve({ listings: [], ownListings: [], favoriteIds: [] });
  await refresh;
  assert.deepEqual(controller.getState().favoriteIds, ['property-1']);
});

test('photo retries reuse successful immutable uploads after the next upload fails', async () => {
  const uploaded = new Set(); const attempts = []; let fail = true;
  const photos = [1, 2].map((id) => ({ uri: 'data:image/jpeg;base64,AQID', uploadId: `photo-${id}` }));
  const port = {
    getUploadId: async (photo) => photo.uploadId,
    readLocal: async () => { throw new Error('Unexpected local read'); },
    exists: async (path) => uploaded.has(path),
    upload: async (path, bytes) => {
      attempts.push(path);
      assert.ok(bytes instanceof ArrayBuffer);
      if (path.endsWith('photo-2.jpg') && fail) { fail = false; throw new Error('Upload interrupted'); }
      uploaded.add(path);
    },
  };
  await assert.rejects(uploadDraftPhotos(photos, 'owner-a', 'request-1', port, () => {}), /interrupted/);
  const paths = await uploadDraftPhotos(photos, 'owner-a', 'request-1', port, () => {});
  assert.deepEqual(paths, ['owner-a/request-1/photo-1.jpg', 'owner-a/request-1/photo-2.jpg']);
  assert.equal(attempts.filter((path) => path.endsWith('photo-1.jpg')).length, 1);
});

test('photo upload rejects cross-owner references and account change before reading or uploading', async () => {
  let uploads = 0; let invalidated = false;
  const port = {
    getUploadId: async () => { invalidated = true; return 'photo-1'; },
    readLocal: async () => { throw new Error('Unexpected read'); },
    exists: async () => false,
    upload: async () => { uploads += 1; },
  };
  await assert.rejects(uploadDraftPhotos([{ uri: 'https://signed.test/image', storagePath: 'owner-b/request-1/a.jpg' }], 'owner-a', 'request-1', port, () => {}), /otra/);
  await assert.rejects(uploadDraftPhotos([{ uri: 'data:image/jpeg;base64,AQID' }], 'owner-a', 'request-1', port, () => { if (invalidated) throw new Error('Sesión cambiada'); }), /Sesión/);
  assert.equal(uploads, 0);
});

test('failed save never publishes an apparent successful listing', async () => {
  const controller = createRemoteMarketplaceController(fakeRepository({ save: async () => { throw new Error('Fotografía no guardada'); } }));
  controller.setSession('owner-a', false);
  await assert.rejects(controller.saveListing(draft), /Fotografía/);
  assert.deepEqual(controller.getState().ownListings, []);
  assert.match(controller.getState().storageError, /Fotografía/);
});

test('local demo snapshot remains compatible with multi-photo drafts after restarting', () => {
  const local = createListing({ ...draft, photos: [{ uri: 'file:///first.jpg', uploadId: 'first' }, { uri: 'file:///second.jpg', uploadId: 'second' }] });
  const restored = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: [local], favoriteIds: [] }));
  assert.deepEqual(restored.snapshot.localListings[0].photos, local.photos);
  assert.equal(restored.snapshot.localListings[0].clientRequestId, draft.clientRequestId);
});

test('network failures use Spanish guidance in both global state and rejected form submission', async () => {
  for (const message of ['Failed to fetch', 'Network request failed', 'fetch failed', 'Load failed']) {
    assert.match(remoteErrorMessage(new TypeError(message)), /conexión|conectar/);
    const controller = createRemoteMarketplaceController(fakeRepository({ save: async () => { throw new TypeError(message); } }));
    controller.setSession('owner-a', false);
    await assert.rejects(controller.saveListing(draft), (error) => {
      assert.match(error.message, /conexión|conectar/);
      assert.doesNotMatch(error.message, /Failed to fetch|Network request failed|Load failed|fetch failed/);
      assert.equal(error.message, controller.getState().storageError);
      return true;
    });
  }
});
