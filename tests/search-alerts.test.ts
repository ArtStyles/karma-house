// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultFilters } from '../src/domain/listings.ts';
import { toSavedFilters, fromSavedFilters, searchName, describeSearch, decodeSavedSearch } from '../src/searches/domain.ts';
import { createSupabaseSavedSearchRepository } from '../src/searches/repository.ts';

test('filters round-trip through the saved shape', () => {
  const filters = { ...defaultFilters, type: 'Casa', province: 'La Habana', maxPrice: '30000', minBedrooms: 3, amenities: ['Balcón'], operation: 'swap', query: 'vedado' };
  const saved = toSavedFilters(filters);
  assert.deepEqual(saved, { query: 'vedado', type: 'Casa', province: 'La Habana', condition: null, min_price: null, max_price: 30000, min_area: null, max_area: null, min_bedrooms: 3, min_bathrooms: null, negotiable_only: null, amenities: ['balcon'], operations: ['swap'] });
  const back = fromSavedFilters(saved);
  assert.equal(back.type, 'Casa'); assert.equal(back.province, 'La Habana'); assert.equal(back.maxPrice, '30000'); assert.equal(back.minBedrooms, 3); assert.equal(back.operation, 'swap'); assert.equal(back.query, 'vedado'); assert.deepEqual(back.amenities, ['balcon']);
  assert.equal(fromSavedFilters(toSavedFilters(defaultFilters)).operation, 'offers');
});
test('a search gets a readable name and summary', () => {
  assert.equal(searchName(defaultFilters), 'Todas las viviendas');
  assert.equal(searchName({ ...defaultFilters, type: 'Casa', province: 'La Habana', maxPrice: '30000' }), 'Casas en La Habana hasta $ 30,000');
  assert.equal(searchName({ ...defaultFilters, type: 'Apartamento', minBedrooms: 3, province: 'Matanzas' }), 'Apartamentos de 3+ hab en Matanzas');
  assert.equal(searchName({ ...defaultFilters, operation: 'swap' }), 'Permutas en toda Cuba');
  assert.equal(searchName({ ...defaultFilters, operation: 'wanted', province: 'La Habana' }), 'Busco en La Habana');
  assert.equal(searchName({ ...defaultFilters, operation: 'rent', province: 'La Habana' }), 'Alquileres en La Habana');
  assert.equal(describeSearch(toSavedFilters({ ...defaultFilters, operation: 'rent' })), 'Alquiler · Toda Cuba');
  assert.equal(searchName({ ...defaultFilters, query: 'vedado' }), 'Viviendas «vedado» en toda Cuba');
  assert.equal(describeSearch(toSavedFilters({ ...defaultFilters, minPrice: '10000', maxPrice: '30000', minBathrooms: 2, condition: 'good', negotiableOnly: true })), 'Venta y permuta · Toda Cuba · $ 10,000 – $ 30,000 · 2+ baños · Buen estado · Negociable');
});
test('saved searches decode strictly and the repository binds identity', async () => {
  const saved = { id: '88000000-0000-4000-8000-000000000001', name: 'Casas', filters: toSavedFilters(defaultFilters), enabled: true, version: 1, createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z' };
  assert.deepEqual(decodeSavedSearch(saved), saved);
  for (const bad of [{ ...saved, id: 'x' }, { ...saved, name: '' }, { ...saved, version: 0 }, { ...saved, filters: { ...saved.filters, operations: ['buy'] } }, { ...saved, enabled: 'yes' }]) assert.throws(() => decodeSavedSearch(bad));
  const calls = []; const abort = new AbortController();
  const context = { userId: '88000000-0000-4000-8000-000000000002', accessToken: 'tok', signal: abort.signal, checkpoint() {} };
  const client = { rpc(name, args) { const call = { name, args }; calls.push(call); return { setHeader(k, v) { call.header = [k, v]; return this; }, abortSignal() { return Promise.resolve({ data: name === 'kh_list_saved_searches' ? [saved] : name === 'kh_save_search' ? saved : null, error: null }); } }; } };
  const repo = createSupabaseSavedSearchRepository(client);
  assert.deepEqual(await repo.list(context), [saved]);
  assert.deepEqual(calls[0].args, { p_actor_id: context.userId }); assert.deepEqual(calls[0].header, ['Authorization', 'Bearer tok']);
  await repo.save({ name: 'Casas', filters: saved.filters, enabled: true }, context);
  assert.deepEqual(calls[1].args, { p_actor_id: context.userId, p_payload: { name: 'Casas', filters: saved.filters, enabled: true } });
  await repo.remove(saved.id, context); assert.deepEqual(calls[2].args, { p_actor_id: context.userId, p_id: saved.id });
});
