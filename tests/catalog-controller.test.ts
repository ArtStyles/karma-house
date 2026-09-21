// @ts-nocheck -- Executed directly by Node; no DOM or native runtime needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogController } from '../src/catalog/controller.ts';
import { defaultFilters } from '../src/domain/listings.ts';

const listing = (id) => ({ id, title: id, price: 1, area: 1, createdAt: '2026-01-01T00:00:00Z' });
const stub = (overrides) => ({
  async search() { throw new Error('unexpected search'); },
  async mapView() { return { mode: 'points', items: [] }; },
  async byId() { return null; },
  async byIds() { return []; },
  ...overrides,
});
function pages(list) {
  let call = 0;
  const calls = [];
  return {
    calls,
    repository: stub({
      async search(filters, cursor, withTotal) {
        calls.push({ cursor, withTotal });
        const page = list[call];
        call += 1;
        if (page instanceof Error) throw page;
        return page;
      },
    }),
  };
}

test('loadMore appends the next page and never repeats a row already shown', async () => {
  const { repository, calls } = pages([
    { rows: [listing('a'), listing('b')], total: 3, nextCursor: 'c1', searchMode: 'none' },
    { rows: [listing('b'), listing('c')], total: 3, nextCursor: null, searchMode: 'none' },
  ]);
  const controller = createCatalogController(repository);
  await controller.setFilters({ ...defaultFilters });
  await controller.loadMore();
  assert.deepEqual(controller.getState().rows.map((row) => row.id), ['a', 'b', 'c']);
  assert.equal(controller.getState().hasMore, false);
  assert.equal(controller.getState().total, 3);
  // Only the first page asks for the exact count; later pages must not recount.
  assert.deepEqual(calls, [{ cursor: null, withTotal: true }, { cursor: 'c1', withTotal: false }]);
});

test('loadMore does nothing when there is no further page', async () => {
  const { repository, calls } = pages([{ rows: [listing('a')], total: 1, nextCursor: null, searchMode: 'none' }]);
  const controller = createCatalogController(repository);
  await controller.setFilters({ ...defaultFilters });
  await controller.loadMore();
  assert.equal(calls.length, 1);
});

test('a page that arrives after the filters changed never replaces the newer result', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const controller = createCatalogController(stub({
    async search(filters) {
      if (filters.query === 'old') { await slow; return { rows: [listing('stale')], total: 1, nextCursor: null, searchMode: 'none' }; }
      return { rows: [listing('fresh')], total: 1, nextCursor: null, searchMode: 'none' };
    },
  }));
  const first = controller.setFilters({ ...defaultFilters, query: 'old' });
  const second = controller.setFilters({ ...defaultFilters, query: 'new' });
  await second;
  release();
  await first.catch(() => {});
  assert.deepEqual(controller.getState().rows.map((row) => row.id), ['fresh']);
  assert.equal(controller.getState().total, 1);
});

test('a failed page keeps the rows already visible instead of blanking the list', async () => {
  const { repository } = pages([
    { rows: [listing('a')], total: 2, nextCursor: 'c1', searchMode: 'none' },
    new Error('No se pudo completar la conexión.'),
  ]);
  const controller = createCatalogController(repository);
  await controller.setFilters({ ...defaultFilters });
  await assert.rejects(() => controller.loadMore());
  assert.deepEqual(controller.getState().rows.map((row) => row.id), ['a']);
  assert.match(controller.getState().pageError, /conexión/);
  assert.equal(controller.getState().hasMore, true, 'the failed page stays retryable');
});

test('changing account clears the previous rows before any request can resolve', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const controller = createCatalogController(stub({
    async search(filters, cursor, withTotal, checkpoint) {
      await slow;
      checkpoint();
      return { rows: [listing('private')], total: 1, nextCursor: null, searchMode: 'none' };
    },
  }));
  const pending = controller.setFilters({ ...defaultFilters });
  controller.setSession();
  assert.deepEqual(controller.getState().rows, []);
  assert.equal(controller.getState().ready, false);
  release();
  await pending.catch(() => {});
  assert.deepEqual(controller.getState().rows, [], 'the previous account page never lands');
});

test('a rejected cursor resets to the first page rather than paging from nowhere', async () => {
  const controller = createCatalogController(stub({
    async search(filters, cursor) {
      if (cursor) throw new Error('KH_INVALID_CURSOR');
      return { rows: [listing('a')], total: 1, nextCursor: 'stale', searchMode: 'none' };
    },
  }));
  await controller.setFilters({ ...defaultFilters });
  await assert.rejects(() => controller.loadMore());
  assert.equal(controller.getState().cursor, null);
  assert.equal(controller.getState().hasMore, false);
  assert.deepEqual(controller.getState().rows.map((row) => row.id), ['a']);
});

test('subscribers are notified and can unsubscribe', async () => {
  const { repository } = pages([{ rows: [listing('a')], total: 1, nextCursor: null, searchMode: 'none' }]);
  const controller = createCatalogController(repository);
  let count = 0;
  const stop = controller.subscribe(() => { count += 1; });
  await controller.setFilters({ ...defaultFilters });
  assert.ok(count >= 2, 'loading and the settled page both publish');
  stop();
  const before = count;
  controller.setSession();
  assert.equal(count, before, 'a stopped subscriber receives nothing further');
});
