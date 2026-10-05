// @ts-nocheck -- pure state decisions and asynchronous repository fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters } from '../src/domain/listings.ts';
import { catalogFiltersKey, catalogQueryStatus, listingPresentation, unavailableFavoriteCount } from '../src/catalog/presentation.ts';
import { createFavoriteListingsController } from '../src/catalog/favoritesController.ts';

test('requested criteria are pending even before the debounce starts a request', () => {
  const key = catalogFiltersKey(defaultFilters);
  const settled = { ready: true, loading: false, requestKey: key, resultKey: key, pageError: null };
  assert.deepEqual(catalogQueryStatus(settled, defaultFilters), { updating: false, current: true });
  assert.deepEqual(catalogQueryStatus(settled, { ...defaultFilters, maxPrice: '1' }), { updating: true, current: false });
  const next = catalogFiltersKey({ ...defaultFilters, maxPrice: '1' });
  assert.deepEqual(catalogQueryStatus({ ...settled, requestKey: next, pageError: 'network' }, { ...defaultFilters, maxPrice: '1' }), { updating: false, current: false });
});

test('equivalent filter objects have the same identity, including unordered amenities', () => {
  assert.equal(catalogFiltersKey(defaultFilters), catalogFiltersKey({ sort: 'recent', minBedrooms: 0, maxPrice: '', type: 'Todas', query: '' }));
  assert.equal(catalogFiltersKey({ ...defaultFilters, amenities: ['Piscina', 'Terraza'] }), catalogFiltersKey({ ...defaultFilters, amenities: ['Terraza', 'Piscina'] }));
  assert.notEqual(catalogFiltersKey(defaultFilters), catalogFiltersKey({ ...defaultFilters, operation: 'rent' }));
});

test('loading, failed, absent, stale and offline reads have distinct meanings', () => {
  assert.equal(listingPresentation({ ready: false, hasData: false, error: null }), 'loading');
  assert.equal(listingPresentation({ ready: true, hasData: false, error: 'network' }), 'error');
  assert.equal(listingPresentation({ ready: true, hasData: false, error: null }), 'empty');
  assert.equal(listingPresentation({ ready: true, hasData: true, error: 'network' }), 'stale');
  assert.equal(listingPresentation({ ready: true, hasData: true, error: null, offline: true }), 'offline');
  assert.equal(listingPresentation({ ready: true, hasData: true, error: null }), 'content');
});

test('a failed or pending favorite read never claims the saved adverts were removed', () => {
  assert.equal(unavailableFavoriteCount(3, 0, { ready: true, error: 'network' }), 0);
  assert.equal(unavailableFavoriteCount(3, 0, { ready: false, error: null }), 0);
  assert.equal(unavailableFavoriteCount(3, 2, { ready: true, error: null }), 1);
});

test('favorite refresh retains this account content on failure and remains retryable', async () => {
  let fail = false;
  const controller = createFavoriteListingsController({ async byIds() { if (fail) throw Error('network'); return [{ id: 'a' }]; } });
  controller.setSession('buyer');
  await controller.setIds(['a']);
  fail = true;
  await controller.retry();
  assert.deepEqual(controller.getState().listings, [{ id: 'a' }]);
  assert.match(controller.getState().error, /network/);
  fail = false;
  await controller.retry();
  assert.equal(controller.getState().error, null);
});

test('favorite account changes clear data immediately and discard late responses', async () => {
  let release;
  const controller = createFavoriteListingsController({ byIds: async (ids, checkpoint) => {
    await new Promise(resolve => { release = resolve; });
    checkpoint(); return [{ id: ids[0] }];
  } });
  controller.setSession('old');
  const pending = controller.setIds(['private']);
  controller.setSession('new');
  assert.deepEqual(controller.getState().listings, []);
  release(); await pending;
  assert.equal(controller.getState().sessionId, 'new');
  assert.deepEqual(controller.getState().listings, []);
  assert.equal(controller.getState().error, null);
});

test('a late favorite failure cannot erase the newer read', async () => {
  let reject;
  let count = 0;
  const controller = createFavoriteListingsController({ byIds: async ids => {
    if (++count === 1) await new Promise((_, fail) => { reject = fail; });
    return [{ id: ids[0] }];
  } });
  controller.setSession('buyer');
  const first = controller.setIds(['old']);
  await controller.setIds(['new']);
  reject(Error('late failure')); await first;
  assert.deepEqual(controller.getState().listings, [{ id: 'new' }]);
  assert.equal(controller.getState().error, null);
});
