// @ts-nocheck -- Node executes these tests without app-only React types.
import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogFilterTags, removeCatalogFilter } from '../src/catalog/activeFilters.ts';
import { defaultFilters, createListing, filterListings } from '../src/domain/listings.ts';

test('the default catalogue has no preset tags; query, operation and province stay in their own controls', () => {
  assert.deepEqual(catalogFilterTags(defaultFilters), []);
  assert.deepEqual(catalogFilterTags({ ...defaultFilters, query: 'Cojímar', operation: 'rent', province: 'La Habana' }), []);
});

test('the former shortcuts are now removable applied filters and keep independent search criteria', () => {
  const filters = { ...defaultFilters, query: 'Casa', province: 'La Habana', operation: 'sale',
    type: 'Casa', maxPrice: '30000', minBedrooms: 3, sort: 'price-asc' };
  assert.deepEqual(catalogFilterTags(filters).map(tag => tag.label), ['Casas', 'Hasta $30.000', '3+ hab.']);
  const next = removeCatalogFilter(filters, 'price');
  assert.equal(next.maxPrice, '');
  assert.equal(next.minPrice, '');
  assert.equal(next.type, 'Casa');
  assert.equal(next.minBedrooms, 3);
  assert.equal(next.query, 'Casa');
  assert.equal(next.province, 'La Habana');
  assert.equal(next.operation, 'sale');
  assert.equal(next.sort, 'price-asc');
  assert.equal(filters.maxPrice, '30000');
});

test('custom ranges and extra criteria have distinct summaries and each removal changes only its criterion', () => {
  const filters = { ...defaultFilters, type: 'Apartamento', minPrice: '10000', maxPrice: '50000',
    minArea: '80', maxArea: '140', minBedrooms: 2, minBathrooms: 1,
    condition: 'good', negotiableOnly: true, amenities: ['Patio', 'Garaje'] };
  const tags = catalogFilterTags(filters);
  assert.deepEqual(tags.map(tag => tag.label), ['Apartamentos', '$10.000 – $50.000', '2+ hab.', '1+ baños',
    '80 – 140 m²', 'Buen estado', 'Negociable', 'Patio', 'Garaje']);
  assert.equal(new Set(tags.map(tag => tag.key)).size, tags.length);
  assert.deepEqual(removeCatalogFilter(filters, 'amenity:Patio').amenities, ['Garaje']);
  assert.equal(removeCatalogFilter(filters, 'area').minArea, '');
  assert.equal(removeCatalogFilter(filters, 'area').maxArea, '');
  assert.equal(removeCatalogFilter(filters, 'type').type, 'Todas');
  assert.equal(removeCatalogFilter(filters, 'bedrooms').minBedrooms, 0);
  assert.equal(removeCatalogFilter(filters, 'bathrooms').minBathrooms, 0);
  assert.equal(removeCatalogFilter(filters, 'condition').condition, '');
  assert.equal(removeCatalogFilter(filters, 'negotiable').negotiableOnly, false);
  assert.deepEqual(removeCatalogFilter(filters, 'unknown'), filters);
  assert.deepEqual(catalogFilterTags({ ...defaultFilters, minPrice: '12000', maxArea: '90' }).map(tag => tag.label),
    ['Desde $12.000', 'Hasta 90 m²']);
});

test('removing a price range broadens real results without changing the selected property type', () => {
  const draft = { title: 'Casa de prueba', location: 'Cojímar', province: 'La Habana', price: '15000',
    bedrooms: '3', bathrooms: '2', area: '140', type: 'Casa', description: 'Vivienda de prueba para filtros.',
    amenities: [], imageKey: 'vedado' };
  const rows = [
    createListing(draft, { id: 'inside', now: '2026-10-07T12:00:00Z' }),
    createListing({ ...draft, price: '40000' }, { id: 'above', now: '2026-10-07T12:00:00Z' }),
    createListing({ ...draft, type: 'Apartamento' }, { id: 'other-type', now: '2026-10-07T12:00:00Z' }),
  ];
  const filters = { ...defaultFilters, type: 'Casa', minPrice: '10000', maxPrice: '30000' };
  assert.deepEqual(filterListings(rows, filters).map(row => row.id), ['inside']);
  assert.deepEqual(filterListings(rows, removeCatalogFilter(filters, 'price')).map(row => row.id).sort(), ['above','inside']);
});
