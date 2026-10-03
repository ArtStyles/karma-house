// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignedUrlCache, SIGNED_URL_SECONDS } from '../src/data/signedUrlCache.ts';
import { createOfflineSnapshot, snapshotAgeText } from '../src/catalog/offlineSnapshot.ts';
import { createDataSaver } from '../src/settings/dataSaver.ts';
import * as dataSaverModule from '../src/settings/dataSaver.ts';
import { createRowSigner } from '../src/data/rowSigner.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';
import { uploadCoverThumb } from '../src/data/photoUpload.ts';
import { validateDraft } from '../src/domain/listings.ts';
import { restoreDraft } from '../src/domain/draftPersistence.ts';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    async getItem(key) { return items.has(key) ? items.get(key) : null; },
    async setItem(key, value) { items.set(key, value); },
    async removeItem(key) { items.delete(key); },
  };
}
function clock(start = 1_800_000_000_000) {
  const state = { time: start };
  return { state, now: () => state.time };
}

test('signed links last seven days', () => {
  assert.equal(SIGNED_URL_SECONDS, 7 * 24 * 3600);
});

test('a signed link is reused until one day before it expires', async () => {
  const storage = memoryStorage();
  const { state, now } = clock();
  const cache = createSignedUrlCache({ storage, now });
  await cache.hydrate();
  await cache.put([{ path: 'a/r/1.jpg', url: 'https://x/1', expiresAt: now() + 7 * DAY }]);
  assert.equal(cache.get('a/r/1.jpg'), 'https://x/1');
  assert.equal(cache.get('a/r/2.jpg'), undefined);
  state.time += 6 * DAY - 1;
  assert.equal(cache.get('a/r/1.jpg'), 'https://x/1');
  state.time += 1; // exactly 24 h left: no longer reused
  assert.equal(cache.get('a/r/1.jpg'), undefined);
  assert.deepEqual(cache.missing(['a/r/1.jpg']), ['a/r/1.jpg']);
});

test('only the missing paths are listed, once each', async () => {
  const { now } = clock();
  const cache = createSignedUrlCache({ storage: memoryStorage(), now });
  await cache.put([{ path: 'p/1', url: 'u1', expiresAt: now() + 7 * DAY }, { path: 'p/2', url: 'u2', expiresAt: now() + 7 * DAY }]);
  assert.deepEqual(cache.missing(['p/1', 'p/3', 'p/2', 'p/4', 'p/3']), ['p/3', 'p/4']);
});

test('the cache survives a restart through storage', async () => {
  const storage = memoryStorage();
  const { now } = clock();
  const first = createSignedUrlCache({ storage, now, key: 'k' });
  await first.put([{ path: 'p/1', url: 'u1', expiresAt: now() + 7 * DAY }]);
  assert.ok(storage.items.has('k'));
  const second = createSignedUrlCache({ storage, now, key: 'k' });
  assert.equal(second.get('p/1'), undefined);
  await second.hydrate();
  assert.equal(second.get('p/1'), 'u1');
  await second.clear();
  assert.equal(second.get('p/1'), undefined);
  assert.equal(storage.items.has('k'), false);
});

test('beyond the cap the oldest links are dropped and refreshed ones are kept', async () => {
  const storage = memoryStorage();
  const { now } = clock();
  const cache = createSignedUrlCache({ storage, now, maxEntries: 3 });
  const entry = (n, url = `u${n}`) => ({ path: `p/${n}`, url, expiresAt: now() + 7 * DAY });
  await cache.put([entry(1), entry(2), entry(3)]);
  await cache.put([entry(1, 'u1b')]); // refreshed: now the newest
  await cache.put([entry(4)]);
  assert.equal(cache.get('p/2'), undefined);
  assert.equal(cache.get('p/1'), 'u1b');
  assert.equal(cache.get('p/3'), 'u3');
  assert.equal(cache.get('p/4'), 'u4');
  const reloaded = createSignedUrlCache({ storage, now, maxEntries: 3 });
  await reloaded.hydrate();
  assert.deepEqual(reloaded.missing(['p/1', 'p/2', 'p/3', 'p/4']), ['p/2']);
});

test('the default cap is 500 entries', async () => {
  const { now } = clock();
  const cache = createSignedUrlCache({ storage: memoryStorage(), now });
  await cache.put(Array.from({ length: 501 }, (_, n) => ({ path: `p/${n}`, url: `u${n}`, expiresAt: now() + 7 * DAY })));
  assert.equal(cache.get('p/0'), undefined);
  assert.equal(cache.get('p/1'), 'u1');
  assert.equal(cache.get('p/500'), 'u500');
});

test('corrupt or foreign signed-link storage is ignored and overwritten', async () => {
  const { now } = clock();
  for (const raw of ['{', 'null', '42', '{"p":"u"}', '[{"path":"p/1","url":"u1"}]', '[{"path":1,"url":"u1","expiresAt":1}]', '[["p/1","u1",1]]']) {
    const storage = memoryStorage({ k: raw });
    const cache = createSignedUrlCache({ storage, now, key: 'k' });
    await cache.hydrate();
    assert.equal(cache.get('p/1'), undefined, raw);
    await cache.put([{ path: 'p/2', url: 'u2', expiresAt: now() + 7 * DAY }]);
    const reloaded = createSignedUrlCache({ storage, now, key: 'k' });
    await reloaded.hydrate();
    assert.equal(reloaded.get('p/2'), 'u2', raw);
  }
  const failing = { getItem: async () => { throw new Error('disk'); }, setItem: async () => { throw new Error('disk'); }, removeItem: async () => { throw new Error('disk'); } };
  const cache = createSignedUrlCache({ storage: failing, now });
  await cache.hydrate();
  await cache.put([{ path: 'p/1', url: 'u1', expiresAt: now() + 7 * DAY }]);
  assert.equal(cache.get('p/1'), 'u1');
});

test('hydrating does not undo links signed meanwhile', async () => {
  const { now } = clock();
  const storage = memoryStorage({ k: JSON.stringify([{ path: 'p/1', url: 'old', expiresAt: now() + 7 * DAY }]) });
  const cache = createSignedUrlCache({ storage, now, key: 'k' });
  await cache.put([{ path: 'p/1', url: 'new', expiresAt: now() + 7 * DAY }]);
  await cache.hydrate();
  assert.equal(cache.get('p/1'), 'new');
});

const listing = (n) => ({
  id: `88000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: `Casa ${n}`, location: 'Vedado', province: 'La Habana', price: 30000,
  bedrooms: 2, description: '', amenities: [], imageKey: 'vedado', owner: 'remote', status: 'available', createdAt: '2026-09-28T00:00:00Z',
  photoUri: 'https://x/signed',
});

test('the snapshot keeps at most 24 rows and restores them with their date', async () => {
  const storage = memoryStorage();
  const { state, now } = clock();
  const snapshot = createOfflineSnapshot({ storage, now });
  assert.equal(await snapshot.load(), null);
  const rows = Array.from({ length: 30 }, (_, n) => listing(n + 1));
  await snapshot.save(rows);
  const savedAt = now();
  state.time += 3 * HOUR;
  const loaded = await snapshot.load();
  assert.equal(loaded.savedAt, savedAt);
  assert.deepEqual(loaded.rows, rows.slice(0, 24));
});

test('a snapshot older than seven days is discarded', async () => {
  const { state, now } = clock();
  const snapshot = createOfflineSnapshot({ storage: memoryStorage(), now });
  await snapshot.save([listing(1)]);
  state.time += 7 * DAY;
  assert.ok(await snapshot.load());
  state.time += 1;
  assert.equal(await snapshot.load(), null);
});

test('a corrupt snapshot or one with an invalid row is discarded', async () => {
  const { now } = clock();
  const valid = listing(1);
  const bad = [
    '{', 'null', '[]', JSON.stringify({ rows: [valid] }), JSON.stringify({ savedAt: 'x', rows: [valid] }), JSON.stringify({ savedAt: now(), rows: {} }),
    ...[{ id: 'x' }, { title: '' }, { title: 3 }, { price: 0 }, { price: -1 }, { price: '30000' }, { location: null }, { province: undefined }]
      .map(change => JSON.stringify({ savedAt: now(), rows: [valid, { ...valid, ...change }] })),
    JSON.stringify({ savedAt: now(), rows: [valid, null] }),
    JSON.stringify({ savedAt: now(), rows: Array.from({ length: 25 }, (_, n) => listing(n + 1)) }),
  ];
  for (const raw of bad) {
    const snapshot = createOfflineSnapshot({ storage: memoryStorage({ k: raw }), now, key: 'k' });
    assert.equal(await snapshot.load(), null, raw);
  }
  const ok = createOfflineSnapshot({ storage: memoryStorage({ k: JSON.stringify({ savedAt: now(), rows: [valid] }) }), now, key: 'k' });
  assert.deepEqual((await ok.load()).rows, [valid]);
  const failing = createOfflineSnapshot({ storage: { getItem: async () => { throw new Error('disk'); } }, now });
  assert.equal(await failing.load(), null);
});

test('the snapshot age reads naturally', () => {
  const t = 1_800_000_000_000;
  assert.equal(snapshotAgeText(t, t), 'hace unos minutos');
  assert.equal(snapshotAgeText(t, t + HOUR - 1), 'hace unos minutos');
  assert.equal(snapshotAgeText(t, t + HOUR), 'hace 1 hora');
  assert.equal(snapshotAgeText(t, t + 3 * HOUR + 59 * 60_000), 'hace 3 horas');
  assert.equal(snapshotAgeText(t, t + DAY - 1), 'hace 23 horas');
  assert.equal(snapshotAgeText(t, t + DAY), 'hace 1 día');
  assert.equal(snapshotAgeText(t, t + 2 * DAY + 5 * HOUR), 'hace 2 días');
});

test('the data saver is off by default and remembers the choice', async () => {
  const storage = memoryStorage();
  const saver = createDataSaver({ storage, key: 'k' });
  assert.equal(await saver.read(), false);
  await saver.write(true);
  assert.equal(storage.items.get('k'), '1');
  assert.equal(await createDataSaver({ storage, key: 'k' }).read(), true);
  await saver.write(false);
  assert.equal(await saver.read(), false);
  for (const raw of ['true', '0', '', '{"on":true}', ' 1']) assert.equal(await createDataSaver({ storage: memoryStorage({ k: raw }), key: 'k' }).read(), false, raw);
  assert.equal(await createDataSaver({ storage: { getItem: async () => { throw new Error('disk'); } } }).read(), false);
});

// Cover thumbnails and reusable photo links.
const OWNER = 'owner-a';
const propertyRow = (id, photoPaths, thumb) => ({
  id, owner_id: OWNER, client_request_id: `req-${id}`, title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: 100, bedrooms: 2, bathrooms: 1, area: 40,
  type: 'Casa', description: 'Una casa de prueba con descripción completa.', amenities: [], photo_paths: photoPaths, availability: 'active', moderation: 'approved',
  review_note: null, version: 1, created_at: '2026-09-17T00:00:00.000Z', ...(thumb === undefined ? {} : { cover_thumb_path: thumb }),
});
const draft = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '100', bedrooms: '2', bathrooms: '1', area: '40', type: 'Casa', description: 'Una casa de prueba con descripción completa.', amenities: [], imageKey: 'vedado' };
function fakeBucket() {
  const calls = [];
  return {
    calls,
    async createSignedUrls(paths, expiresIn) {
      calls.push({ paths, expiresIn });
      return { data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}?n=${calls.length}`, error: null })), error: null };
    },
  };
}

test('a row maps its cover thumbnail and rejects a malformed one', () => {
  const urls = new Map([['o/r/a_t.jpg', 'https://t'], ['o/r/a.jpg', 'https://a']]);
  assert.deepEqual(mapRemoteListing(propertyRow('p1', ['o/r/a.jpg'], 'o/r/a_t.jpg'), urls).coverThumb, { uri: 'https://t', storagePath: 'o/r/a_t.jpg' });
  assert.equal(mapRemoteListing(propertyRow('p1', ['o/r/a.jpg'], null), urls).coverThumb, undefined);
  assert.equal(mapRemoteListing(propertyRow('p1', ['o/r/a.jpg']), urls).coverThumb, undefined, 'rows read before the column existed');
  assert.throws(() => mapRemoteListing(propertyRow('p1', ['o/r/a.jpg'], 42), urls), /no válidos/);
});

test('the payload sends the cover thumbnail only when there is one', () => {
  const clientDraft = { ...draft, clientRequestId: 'r' };
  assert.equal(propertyPayload(clientDraft, OWNER, ['o/r/a.jpg'], 'pending', undefined, 'o/r/a_t.jpg').coverThumbPath, 'o/r/a_t.jpg');
  assert.equal('coverThumbPath' in propertyPayload(clientDraft, OWNER, ['o/r/a.jpg'], 'pending'), false, 'left out, the server keeps or clears it');
});

test('the cover thumbnail is uploaded once next to the cover, and skipped when unusable', async () => {
  const uploaded = new Map();
  const port = {
    readLocal: async () => { throw new Error('not local'); },
    exists: async (path) => uploaded.has(path),
    upload: async (path, bytes, type) => { assert.ok(bytes instanceof ArrayBuffer); uploaded.set(path, type); },
  };
  const cover = { uri: 'data:image/jpeg;base64,AQID', uploadId: 'a', thumbUri: 'data:image/jpeg;base64,BAUG' };
  assert.equal(await uploadCoverThumb(cover, [`${OWNER}/r/a.jpg`, `${OWNER}/r/b.jpg`], port, () => {}), `${OWNER}/r/a_t.jpg`);
  assert.equal(await uploadCoverThumb(cover, [`${OWNER}/r/a.jpg`], port, () => {}), `${OWNER}/r/a_t.jpg`, 'a retry reuses the upload');
  assert.deepEqual([...uploaded], [[`${OWNER}/r/a_t.jpg`, 'image/jpeg']]);
  assert.equal(await uploadCoverThumb({ ...cover, thumbUri: undefined }, [`${OWNER}/r/a.jpg`], port, () => {}), undefined);
  assert.equal(await uploadCoverThumb(undefined, [], port, () => {}), undefined);
  assert.equal(await uploadCoverThumb({ ...cover, thumbUri: 'file:///gone_t.jpg' }, [`${OWNER}/r/a.jpg`], port, () => {}), undefined, 'a lost file never blocks publishing');
  assert.equal(await uploadCoverThumb({ ...cover, thumbUri: 'data:image/png;base64,AQID' }, [`${OWNER}/r/a.jpg`], port, () => {}), undefined);
  assert.equal(await uploadCoverThumb(cover, [`${OWNER}/r/a.jpg`, `${OWNER}/r/a_t.jpg`], port, () => {}), undefined, 'never one of the photos');
  assert.equal(await uploadCoverThumb(cover, [`${OWNER}/r/${'x'.repeat(100)}.jpg`], port, () => {}), undefined, 'the name stays within 100 characters');
  await assert.rejects(uploadCoverThumb(cover, [`${OWNER}/r/c.jpg`], port, () => { throw new Error('Sesión cambiada'); }), /Sesión/);
  assert.equal(uploaded.has(`${OWNER}/r/c_t.jpg`), false);
});

test('a draft keeps a local cover thumbnail and rejects a remote one', () => {
  assert.ok(validateDraft({ ...draft, photos: [{ uri: 'file:///a.jpg', thumbUri: 'file:///a_t.jpg' }] }).ok);
  assert.equal(validateDraft({ ...draft, photos: [{ uri: 'file:///a.jpg', thumbUri: 'https://evil.test/x.jpg' }] }).ok, false);
  const saved = { ...draft, photos: [{ uri: 'file:///a.jpg', uploadId: 'a', thumbUri: 'file:///a_t.jpg' }] };
  assert.deepEqual(restoreDraft(JSON.stringify(saved), draft), saved);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...saved, photos: [{ uri: 'file:///a.jpg', thumbUri: 7 }] }), draft), draft);
});

test('the row signer asks the server once per path and reuses the links afterwards', async () => {
  const { now } = clock();
  const bucket = fakeBucket();
  const sign = createRowSigner(bucket, createSignedUrlCache({ storage: memoryStorage(), now }), now);
  const rows = [propertyRow('p1', ['o/r/a.jpg', 'o/r/b.jpg']), propertyRow('p2', ['o/r/c.jpg'])];
  const first = await sign(rows, () => {}, 'all');
  assert.deepEqual(bucket.calls, [{ paths: ['o/r/a.jpg', 'o/r/b.jpg', 'o/r/c.jpg'], expiresIn: SIGNED_URL_SECONDS }]);
  const second = await sign(rows, () => {}, 'all');
  assert.equal(bucket.calls.length, 1, 'the same paths make no second request');
  assert.deepEqual(second.map((l) => l.photos.map((p) => p.uri)), first.map((l) => l.photos.map((p) => p.uri)));
  await sign([propertyRow('p3', ['o/r/a.jpg', 'o/r/d.jpg'])], () => {}, 'all');
  assert.deepEqual(bucket.calls[1].paths, ['o/r/d.jpg'], 'only the missing path is signed');
});

test('a link close to expiring is signed again and the links survive a restart', async () => {
  const { state, now } = clock();
  const storage = memoryStorage();
  const bucket = fakeBucket();
  const rows = [propertyRow('p1', ['o/r/a.jpg'])];
  await createRowSigner(bucket, createSignedUrlCache({ storage, now }), now)(rows, () => {}, 'all');
  const restarted = createRowSigner(bucket, createSignedUrlCache({ storage, now }), now);
  await restarted(rows, () => {}, 'all');
  assert.equal(bucket.calls.length, 1, 'a restart hydrates the stored links');
  state.time += 6 * DAY;
  const [renewed] = await restarted(rows, () => {}, 'all');
  assert.equal(bucket.calls.length, 2);
  assert.equal(renewed.photos[0].uri, 'https://signed/o/r/a.jpg?n=2');
});

test('catalogue rows sign the cover thumbnail when they have one, else the cover', async () => {
  const { now } = clock();
  const bucket = fakeBucket();
  const sign = createRowSigner(bucket, createSignedUrlCache({ storage: memoryStorage(), now }), now);
  const [withThumb, legacy] = await sign([propertyRow('p1', ['o/r/a.jpg', 'o/r/b.jpg'], 'o/r/a_t.jpg'), propertyRow('p2', ['o/r/c.jpg', 'o/r/d.jpg'], null)], () => {}, 'cover');
  assert.deepEqual(bucket.calls[0].paths, ['o/r/a_t.jpg', 'o/r/c.jpg']);
  assert.equal(withThumb.coverThumb.uri, 'https://signed/o/r/a_t.jpg?n=1');
  assert.equal(withThumb.photoUri, undefined, 'a card never downloads the full cover');
  assert.equal(legacy.coverThumb, undefined);
  assert.equal(legacy.photoUri, 'https://signed/o/r/c.jpg?n=1');
});

test('a signing failure or a missing path is an error and nothing is cached', async () => {
  const { now } = clock();
  const cache = createSignedUrlCache({ storage: memoryStorage(), now });
  const broken = { createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: '', error: 'Object not found' })), error: null }) };
  await assert.rejects(createRowSigner(broken, cache, now)([propertyRow('p1', ['o/r/a.jpg'])], () => {}, 'all'), /fotos/);
  assert.deepEqual(cache.missing(['o/r/a.jpg']), ['o/r/a.jpg']);
  const partial = { createSignedUrls: async () => ({ data: [], error: null }) };
  await assert.rejects(createRowSigner(partial, cache, now)([propertyRow('p1', ['o/r/a.jpg'])], () => {}, 'all'), /Faltan/);
});

test('media waits for the saved preference before a cold start can download', async () => {
  assert.equal(typeof dataSaverModule.createDataSaverStore, 'function');
  let release;
  const storage = memoryStorage();
  storage.getItem = () => new Promise(resolve => { release = resolve; });
  const store = dataSaverModule.createDataSaverStore({ storage });
  assert.deepEqual(store.getState(), { enabled: false, ready: false });
  const hydration = store.hydrate();
  release('1');
  await hydration;
  assert.deepEqual(store.getState(), { enabled: true, ready: true });
});

test('a choice during hydration wins and rapid choices persist in order', async () => {
  assert.equal(typeof dataSaverModule.createDataSaverStore, 'function');
  let releaseRead, releaseWrite;
  const storage = memoryStorage();
  storage.getItem = () => new Promise(resolve => { releaseRead = resolve; });
  const write = storage.setItem;
  let writes = 0;
  storage.setItem = async (key, value) => {
    if (++writes === 1) await new Promise(resolve => { releaseWrite = resolve; });
    await write(key, value);
  };
  const store = dataSaverModule.createDataSaverStore({ storage });
  const hydration = store.hydrate();
  const first = store.setEnabled(true);
  const second = store.setEnabled(false);
  releaseRead('1');
  await hydration;
  assert.deepEqual(store.getState(), { enabled: false, ready: true });
  releaseWrite();
  await Promise.all([first, second]);
  assert.equal(await createDataSaver({ storage: { ...storage, getItem: async key => storage.items.get(key) } }).read(), false);
});
