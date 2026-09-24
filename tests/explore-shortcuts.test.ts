import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters, isNewListing, shortcutActive, toggleShortcut, type ListingFilters } from '../src/domain/listings.ts';

const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-09-24T12:00:00Z');

test('a listing reads as new for a week after it was created, and never with a bad date', () => {
  assert.equal(isNewListing(new Date(now - 6 * day).toISOString(), now), true);
  assert.equal(isNewListing(new Date(now - 8 * day).toISOString(), now), false);
  assert.equal(isNewListing(new Date(now + day).toISOString(), now), false);
  assert.equal(isNewListing('not a date', now), false);
});

test('each shortcut toggles its own filter and a second tap undoes it', () => {
  const apply = (filters: ListingFilters, next: Partial<ListingFilters>) => ({ ...filters, ...next });
  const houses = apply(defaultFilters, toggleShortcut(defaultFilters, 'Casa'));
  assert.equal(houses.type, 'Casa');
  assert.equal(shortcutActive(houses, 'Casa'), true);
  assert.equal(shortcutActive(houses, 'Apartamento'), false);
  assert.equal(apply(houses, toggleShortcut(houses, 'Casa')).type, 'Todas');
  // Types are exclusive: choosing apartments replaces houses.
  assert.equal(apply(houses, toggleShortcut(houses, 'Apartamento')).type, 'Apartamento');

  const cheap = apply({ ...defaultFilters, minPrice: '5000' }, toggleShortcut(defaultFilters, 'price'));
  assert.equal(cheap.maxPrice, '30000');
  assert.equal(cheap.minPrice, '');
  assert.equal(shortcutActive(cheap, 'price'), true);
  assert.equal(apply(cheap, toggleShortcut(cheap, 'price')).maxPrice, '');

  const rooms = apply(defaultFilters, toggleShortcut(defaultFilters, 'bedrooms'));
  assert.equal(rooms.minBedrooms, 3);
  assert.equal(apply(rooms, toggleShortcut(rooms, 'bedrooms')).minBedrooms, 0);
});

test('only the exact preset lights a shortcut; other ranges stay as filter tags', () => {
  assert.equal(shortcutActive({ ...defaultFilters, maxPrice: '40000' }, 'price'), false);
  assert.equal(shortcutActive({ ...defaultFilters, maxPrice: '30000', minPrice: '10000' }, 'price'), false);
  assert.equal(shortcutActive({ ...defaultFilters, minBedrooms: 2 }, 'bedrooms'), false);
});
