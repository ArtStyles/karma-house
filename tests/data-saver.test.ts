// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignedUrlCache, SIGNED_URL_SECONDS } from '../src/data/signedUrlCache.ts';
import { createOfflineSnapshot, snapshotAgeText } from '../src/catalog/offlineSnapshot.ts';
import { createDataSaver } from '../src/settings/dataSaver.ts';

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
