// @ts-nocheck -- injected local storage and clock; no Auth or native runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingIntentStore, pendingIntentDestination } from '../src/auth/pendingIntent.ts';
import { defaultFilters } from '../src/domain/listings.ts';
import { fromSavedFilters, toSavedFilters } from '../src/searches/domain.ts';

const id = '20000000-0000-4000-8000-000000000001';
function setup() {
  let time = 1000000;
  const items = new Map();
  const storage = { async getItem(k) { return items.get(k) ?? null; }, async setItem(k,v) { items.set(k,v); }, async removeItem(k) { items.delete(k); } };
  return { items, storage, now: () => time, advance: value => { time += value; }, store: createPendingIntentStore({ storage, now: () => time, key: 'intent' }) };
}

test('search intent preserves validated criteria and all four sort options, without executing a save', async () => {
  const { store } = setup();
  const filters = { ...defaultFilters, operation: 'rent', province: 'La Habana', maxPrice: '500', minBedrooms: 2, amenities: ['Terraza'] };
  for (const sort of ['recent','price-asc','price-desc','area-desc']) {
    const intent = { kind: 'search', filters: toSavedFilters(filters), sort };
    await store.write(intent);
    assert.deepEqual(await store.read(), intent);
    const restored = { ...fromSavedFilters((await store.read()).filters), sort: (await store.read()).sort };
    assert.deepEqual(toSavedFilters(restored), toSavedFilters(filters));
    assert.equal(restored.sort, sort);
    assert.equal(pendingIntentDestination(intent), '/');
  }
});

test('property intentions lead only to the same internal property and are not consumed by read', async () => {
  const { store } = setup();
  for (const kind of ['contact','favorite']) {
    await store.write({ kind, propertyId: id });
    assert.deepEqual(await store.read(), { kind, propertyId: id });
    assert.equal(pendingIntentDestination(await store.read()), `/property/${id}`);
    assert.deepEqual(await store.read(), { kind, propertyId: id });
  }
});

test('intents expire at thirty minutes and future clock values are discarded', async () => {
  const fixture = setup();
  await fixture.store.write({ kind: 'favorite', propertyId: id });
  fixture.advance(30 * 60000 - 1);
  assert.ok(await fixture.store.read());
  fixture.advance(1);
  assert.equal(await fixture.store.read(), null);
  assert.equal(fixture.items.size, 0);
  await fixture.store.write({ kind: 'contact', propertyId: id });
  fixture.advance(-1);
  assert.equal(await fixture.store.read(), null);
});

test('corrupt or extra fields and invalid IDs, criteria, and sort are discarded', async () => {
  const { store, items, now } = setup();
  const invalid = [
    '{', 'null', JSON.stringify({ createdAt: now(), intent: { kind: 'message', propertyId: id } }),
    JSON.stringify({ createdAt: now(), intent: { kind: 'contact', propertyId: '//other.example' } }),
    JSON.stringify({ createdAt: now(), intent: { kind: 'contact', propertyId: id, password: 'never-store' } }),
    JSON.stringify({ createdAt: now(), intent: { kind: 'search', filters: toSavedFilters(defaultFilters), sort: 'unexpected' } }),
    JSON.stringify({ createdAt: now(), intent: { kind: 'search', filters: { ...toSavedFilters(defaultFilters), max_price: -1 }, sort: 'recent' } }),
  ];
  for (const raw of invalid) { items.set('intent', raw); assert.equal(await store.read(), null, raw); assert.equal(items.size, 0); }
  await assert.rejects(() => store.write({ kind: 'contact', propertyId: 'bad' }));
});

test('clear removes context and queued writes cannot reappear after cancellation', async () => {
  const { store, items } = setup();
  const writing = store.write({ kind: 'contact', propertyId: id });
  const clearing = store.clear();
  await Promise.all([writing, clearing]);
  assert.equal(await store.read(), null);
  assert.equal(items.size, 0);
});

test('an unreadable store does not prevent ordinary access', async () => {
  const store = createPendingIntentStore({ storage: { async getItem() { throw Error('disk'); }, async removeItem() {} }, now: Date.now });
  assert.equal(await store.read(), null);
});
