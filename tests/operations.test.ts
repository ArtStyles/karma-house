// tests/operations.test.ts
// @ts-nocheck -- Pure domain modules run directly in Node.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateDraft, createListing, updateListing, filterListings, activeFilterCount, shortcutActive, toggleShortcut, defaultFilters } from '../src/domain/listings.ts';
import { isListingOperation, isSwapBalance, isRentPeriod, OPERATIONS, SWAP_BALANCES, RENT_PERIODS, WANTED_OPERATIONS } from '../src/domain/listingOptions.ts';
import { listingOperation, operationBadge, priceLabel, priceSuffix, listingFacts, swapBalanceText, shareText, operationsFor, wantedOperationsText, minStayText } from '../src/domain/operations.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';
import { mapRemoteListing } from '../src/data/remoteMapping.ts';
import { restoreDraft } from '../src/domain/draftPersistence.ts';
import { decodeMarketplaceSnapshot } from '../src/state/marketplaceStore.ts';
import { searchPayload } from '../src/catalog/query.ts';

const sale = { title: 'Casa de prueba', location: 'Vedado', province: 'La Habana', price: '50000', bedrooms: '2', bathrooms: '1', area: '80', type: 'Casa', description: 'Vivienda luminosa con patio para compartir.', amenities: ['Patio'], imageKey: 'vedado', clientRequestId: 'ops-test' };
const swap = { ...sale, operation: 'swap', swapWants: 'Apartamento en Playa o Vedado, dos habitaciones, sin diferencia.', swapProvinces: ['La Habana'], swapBalance: 'pay', swapAmount: '5000' };
const wanted = { title: 'Busco apartamento en Playa', location: 'Playa o Vedado', province: 'La Habana', price: '40000', bedrooms: '2', bathrooms: '', area: '', type: '', description: 'Busco apartamento con balcón, planta baja o con ascensor.', amenities: [], imageKey: 'vedado', clientRequestId: 'ops-wanted', operation: 'wanted' };
const at = { now: '2026-09-26T00:00:00.000Z' };

test('operation and balance guards accept only the known values', () => {
  assert.deepEqual(OPERATIONS.map((o) => o.value), ['sale', 'swap', 'wanted', 'rent']);
  assert.deepEqual(SWAP_BALANCES.map((o) => o.value), ['none', 'pay', 'receive']);
  assert.ok(isListingOperation('swap') && !isListingOperation('buy') && !isListingOperation(undefined));
  assert.ok(isSwapBalance('none') && !isSwapBalance(''));
});
test('a sale validates as before and ignores stray swap fields', () => {
  assert.ok(validateDraft(sale).ok);
  assert.ok(validateDraft({ ...sale, swapWants: 'x' }).ok);
  const listing = createListing(sale, { id: 's', ...at });
  assert.equal(listing.operation, undefined); assert.equal(listing.swap, undefined);
  assert.equal(listingOperation(listing), 'sale');
});
test('a swap needs what it wants and a balance, and keeps the amount only with a balance', () => {
  assert.ok(validateDraft(swap).ok);
  assert.equal(validateDraft({ ...swap, swapWants: 'corto' }).errors.swapWants, 'Lo que buscas a cambio debe tener entre 20 y 500 caracteres.');
  assert.equal(validateDraft({ ...swap, swapBalance: '' }).errors.swapBalance, 'Indica si hay diferencia de dinero.');
  assert.ok(validateDraft({ ...swap, swapProvinces: ['Narnia'] }).errors.swapProvinces);
  assert.ok(validateDraft({ ...swap, swapAmount: '-3' }).errors.swapAmount);
  assert.ok(validateDraft({ ...swap, swapBalance: 'none', swapAmount: '5000' }).ok);
  const listing = createListing(swap, { id: 'w', ...at });
  assert.deepEqual(listing.swap, { wants: swap.swapWants, provinces: ['La Habana'], balance: 'pay', amount: 5000 });
  assert.equal(createListing({ ...swap, swapBalance: 'none', swapAmount: '5000' }, { id: 'n', ...at }).swap.amount, undefined);
  assert.equal(listing.operation, 'swap');
});
test('a wanted ad needs no photos, area, bathrooms, type or map', () => {
  assert.ok(validateDraft(wanted).ok);
  assert.ok(validateDraft({ ...wanted, type: 'Apartamento' }).ok);
  assert.ok(validateDraft({ ...wanted, mapLocation: { latitude: 23.1, longitude: -82.4, precision: 'exact' } }).errors.mapLocation);
  assert.equal(validateDraft({ ...wanted, price: '0' }).errors.price, 'El presupuesto máximo no es válido.');
  assert.ok(validateDraft({ ...wanted, bedrooms: '' }).errors.bedrooms);
  assert.ok(!validateDraft({ ...sale, type: '' }).ok, 'a sale still needs a type');
  const listing = createListing(wanted, { id: 'b', ...at });
  assert.equal(listing.operation, 'wanted');
  assert.equal(listing.area, undefined); assert.equal(listing.bathrooms, undefined); assert.equal(listing.type, undefined);
  assert.equal(listing.bedrooms, 2); assert.equal(listing.price, 40000);
  const edited = updateListing(createListing(sale, { id: 'e', ...at }), wanted);
  assert.equal(edited.area, undefined); assert.equal(edited.bathrooms, undefined); assert.equal(edited.type, undefined); assert.equal(edited.operation, 'wanted');
});
test('the catalogue hides wanted ads unless asked and the shortcuts toggle the operation', () => {
  const rows = [createListing(sale, { id: 's', ...at }), createListing(swap, { id: 'w', ...at }), createListing(wanted, { id: 'b', ...at })];
  assert.deepEqual(filterListings(rows, defaultFilters).map((r) => r.id).sort(), ['s', 'w']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'wanted' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'swap' }).map((r) => r.id), ['w']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'wanted', minArea: '10' }).map((r) => r.id), [], 'an area filter never matches a wanted ad');
  assert.deepEqual(operationsFor('offers'), ['sale', 'swap']); assert.deepEqual(operationsFor(undefined), ['sale', 'swap']); assert.deepEqual(operationsFor('wanted'), ['wanted']);
  assert.equal(activeFilterCount(defaultFilters), 0);
  assert.equal(activeFilterCount({ ...defaultFilters, operation: 'swap' }), 1);
  assert.deepEqual(toggleShortcut(defaultFilters, 'swap'), { operation: 'swap' });
  assert.ok(shortcutActive({ ...defaultFilters, operation: 'swap' }, 'swap'));
  assert.deepEqual(toggleShortcut({ ...defaultFilters, operation: 'wanted' }, 'wanted'), { operation: 'offers' });
});
test('presentation texts follow the operation', () => {
  const s = createListing(sale, { id: 's', ...at }); const w = createListing(swap, { id: 'w', ...at }); const b = createListing(wanted, { id: 'b', ...at });
  assert.equal(operationBadge(s), ''); assert.equal(operationBadge(w), 'Permuta'); assert.equal(operationBadge(b), 'Busco');
  assert.equal(priceLabel(s), 'Precio'); assert.equal(priceLabel(w), 'Valor estimado'); assert.equal(priceLabel(b), 'Presupuesto máximo');
  assert.equal(listingFacts(s), '2 hab · 1 baño · 80 m²');
  assert.equal(listingFacts(b), 'desde 2 hab · Casa o apartamento');
  assert.equal(listingFacts(createListing({ ...wanted, type: 'Apartamento' }, { id: 'b2', ...at })), 'desde 2 hab · Apartamento');
  assert.equal(swapBalanceText(w.swap), 'Añade hasta $ 5,000');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'receive' }), 'Pide $ 5,000');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'receive', amount: undefined }), 'Pide dinero');
  assert.equal(swapBalanceText({ ...w.swap, balance: 'none' }), 'Sin diferencia');
  assert.equal(shareText(b, 'https://x/p/b'), 'Busco: Busco apartamento en Playa\nHasta $ 40,000 USD · Playa o Vedado, La Habana\ndesde 2 hab · Casa o apartamento\n\nhttps://x/p/b');
  assert.equal(shareText(w, 'https://x/p/w'), 'Permuta: Casa de prueba\nValor estimado $ 50,000 USD · Vedado, La Habana\n2 hab · 1 baño · 80 m²\n\nhttps://x/p/w');
  assert.equal(shareText(s, 'https://x/p/s'), 'Casa de prueba\n$ 50,000 USD · Vedado, La Habana\n2 hab · 1 baño · 80 m²\n\nhttps://x/p/s');
});

const row = { id: 'home', owner_id: 'seller', client_request_id: 'ops-test', title: 'Casa', location: 'Vedado', province: 'La Habana', price: 50000, bedrooms: 2, bathrooms: 1, area: 80, type: 'Casa', description: 'Vivienda luminosa con patio para compartir.', amenities: [], photo_paths: [], availability: 'active', moderation: 'approved', review_note: null, version: 1, created_at: '2026-09-26T00:00:00.000Z' };

test('the payload carries the operation and the swap fields', () => {
  const p = propertyPayload(swap, 'seller', [], 'pending');
  assert.equal(p.operation, 'swap'); assert.equal(p.swapWants, swap.swapWants); assert.deepEqual(p.swapProvinces, ['La Habana']); assert.equal(p.swapBalance, 'pay'); assert.equal(p.swapAmount, 5000);
  const w = propertyPayload(wanted, 'seller', [], 'pending');
  assert.equal(w.operation, 'wanted'); assert.equal(w.type, null); assert.equal(w.area, null); assert.equal(w.bathrooms, null); assert.equal(w.mapLocation, null);
  const s = propertyPayload(sale, 'seller', [], 'pending');
  assert.equal(s.operation, 'sale'); assert.equal('swapWants' in s, false);
});
test('remote rows map the operation, allow nulls only for wanted ads and default to sale', () => {
  assert.equal(mapRemoteListing(row, new Map()).operation, undefined);
  const s = mapRemoteListing({ ...row, operation: 'swap', swap_wants: 'Apartamento en Playa con dos habitaciones.', swap_provinces: ['La Habana'], swap_balance: 'receive', swap_amount: '2000' }, new Map());
  assert.equal(s.operation, 'swap'); assert.deepEqual(s.swap, { wants: 'Apartamento en Playa con dos habitaciones.', provinces: ['La Habana'], balance: 'receive', amount: 2000 });
  const b = mapRemoteListing({ ...row, operation: 'wanted', type: null, area: null, bathrooms: null }, new Map());
  assert.equal(b.operation, 'wanted'); assert.equal(b.type, undefined); assert.equal(b.area, undefined); assert.equal(b.bathrooms, undefined);
  assert.throws(() => mapRemoteListing({ ...row, area: null }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, operation: 'rent' }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, operation: 'swap' }, new Map()), /no válidos/, 'a swap without its fields is invalid');
});
test('drafts and the local snapshot keep the new fields', () => {
  assert.deepEqual(restoreDraft(JSON.stringify(swap), sale), swap);
  assert.deepEqual(restoreDraft(JSON.stringify(wanted), sale), wanted);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...sale, operation: 'buy' }), sale), sale);
  const listings = [createListing(swap, { id: 'w', ...at }), createListing(wanted, { id: 'b', ...at })];
  const decoded = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: listings, favoriteIds: [] }));
  assert.equal(decoded.issue, null); assert.deepEqual(decoded.snapshot.localListings, listings);
});
test('the search payload sends the operations the filter stands for', () => {
  assert.deepEqual(searchPayload(defaultFilters, null, true).operations, ['sale', 'swap']);
  assert.deepEqual(searchPayload({ ...defaultFilters, operation: 'wanted' }, null, true).operations, ['wanted']);
});

test('every explicit property select carries the operation columns', () => {
  // supabaseMarketplace.ts pulls React Native in, so read the column list from the source text.
  const source = readFileSync(new URL('../src/data/supabaseMarketplace.ts', import.meta.url), 'utf8');
  const columns = /PROPERTY_COLUMNS = '([^']+)'/.exec(source)![1].split(',');
  for (const column of ['operation', 'swap_wants', 'swap_provinces', 'swap_balance', 'swap_amount']) assert.ok(columns.includes(column), column);
});

const rent = { ...sale, operation: 'rent', rentPeriod: 'month', rentMinStay: '3', clientRequestId: 'ops-rent' };

test('a rental validates like a sale plus a period and an optional minimum stay', () => {
  assert.deepEqual(RENT_PERIODS.map((o) => o.value), ['month', 'day']);
  assert.deepEqual(WANTED_OPERATIONS, [{ value: 'sale', label: 'Comprar' }, { value: 'swap', label: 'Permutar' }, { value: 'rent', label: 'Alquilar' }]);
  assert.ok(isRentPeriod('day') && !isRentPeriod('week'));
  assert.ok(validateDraft(rent).ok);
  assert.ok(validateDraft({ ...rent, rentMinStay: '' }).ok);
  assert.ok(validateDraft({ ...rent, rentPeriod: undefined }).errors.rentPeriod);
  assert.ok(validateDraft({ ...rent, rentPeriod: '' }).errors.rentPeriod);
  assert.ok(validateDraft({ ...rent, rentMinStay: '400' }).errors.rentMinStay);
  assert.ok(validateDraft({ ...rent, rentMinStay: '2.5' }).errors.rentMinStay);
  assert.ok(validateDraft({ ...rent, bathrooms: '' }).errors.bathrooms, 'a rental needs what a sale needs');
  assert.deepEqual(createListing(rent, { id: 'r', ...at }).rent, { period: 'month', minStay: 3 });
  assert.deepEqual(createListing({ ...rent, rentPeriod: 'day', rentMinStay: '' }, { id: 'r', ...at }).rent, { period: 'day' });
  assert.equal(createListing({ ...sale, rentPeriod: 'month' }, { id: 's', ...at }).rent, undefined, 'a sale ignores stray rent fields');
});
test('a wanted ad says which operations it is after, buying or swapping by default', () => {
  assert.ok(validateDraft({ ...wanted, wantedOperations: ['rent'] }).ok);
  assert.ok(validateDraft({ ...wanted, wantedOperations: ['buy'] }).errors.wantedOperations);
  assert.ok(validateDraft({ ...wanted, wantedOperations: [] }).errors.wantedOperations);
  assert.ok(validateDraft({ ...wanted, wantedOperations: ['rent', 'rent'] }).errors.wantedOperations);
  assert.deepEqual(createListing(wanted, { id: 'b', ...at }).wantedOperations, ['sale', 'swap']);
  assert.deepEqual(createListing({ ...wanted, wantedOperations: ['rent'] }, { id: 'b', ...at }).wantedOperations, ['rent']);
  assert.equal(createListing(sale, { id: 's', ...at }).wantedOperations, undefined);
  const edited = updateListing(createListing({ ...wanted, wantedOperations: ['rent'] }, { id: 'b', ...at }), wanted);
  assert.deepEqual(edited.wantedOperations, ['rent'], 'an edit without the field keeps what the ad was after');
  assert.equal(updateListing(createListing(rent, { id: 'r', ...at }), { ...sale, operation: 'sale' }).rent, undefined, 'a sale edit drops the rent');
});
test('the catalogue hides rentals unless asked and the rent shortcut toggles them', () => {
  const rows = [createListing(sale, { id: 's', ...at }), createListing(rent, { id: 'r', ...at }), createListing(wanted, { id: 'b', ...at })];
  assert.deepEqual(filterListings(rows, defaultFilters).map((r) => r.id), ['s']);
  assert.deepEqual(filterListings(rows, { ...defaultFilters, operation: 'rent' }).map((r) => r.id), ['r']);
  assert.deepEqual(operationsFor('rent'), ['rent']);
  assert.deepEqual(toggleShortcut(defaultFilters, 'rent'), { operation: 'rent' });
  assert.ok(shortcutActive({ ...defaultFilters, operation: 'rent' }, 'rent'));
  assert.deepEqual(toggleShortcut({ ...defaultFilters, operation: 'rent' }, 'rent'), { operation: 'offers' });
  assert.deepEqual(searchPayload({ ...defaultFilters, operation: 'rent' }, null, true).operations, ['rent']);
});
test('rental and wanted texts', () => {
  const r = createListing(rent, { id: 'r', ...at });
  assert.equal(operationBadge(r), 'Alquiler'); assert.equal(priceLabel(r), 'Alquiler');
  assert.equal(priceSuffix(r), ' / mes');
  assert.equal(priceSuffix(createListing({ ...rent, rentPeriod: 'day' }, { id: 'd', ...at })), ' / noche');
  assert.equal(priceSuffix(createListing(sale, { id: 's', ...at })), '');
  assert.equal(listingFacts(r), '2 hab · 1 baño · 80 m²');
  assert.equal(shareText(r, 'https://x/p/r'), 'Alquiler: Casa de prueba\n$ 50,000 USD / mes · Vedado, La Habana\n2 hab · 1 baño · 80 m²\n\nhttps://x/p/r');
  assert.equal(wantedOperationsText({ wantedOperations: ['sale', 'swap', 'rent'] }), 'comprar, permutar o alquilar');
  assert.equal(wantedOperationsText({ wantedOperations: ['rent'] }), 'alquilar');
  assert.equal(wantedOperationsText({ wantedOperations: ['sale', 'swap'] }), 'comprar o permutar');
  assert.equal(wantedOperationsText({}), 'comprar o permutar');
  assert.equal(minStayText('month', 3), '3 meses');
  assert.equal(minStayText('day', 1), '1 noche');
});
test('payloads, rows, drafts and the snapshot carry the rental and wanted fields', () => {
  const p = propertyPayload(rent, 'seller', [], 'pending');
  assert.equal(p.operation, 'rent'); assert.equal(p.rentPeriod, 'month'); assert.equal(p.rentMinStay, 3);
  assert.equal(propertyPayload({ ...rent, rentMinStay: '' }, 'seller', [], 'pending').rentMinStay, null);
  assert.equal('rentPeriod' in propertyPayload(sale, 'seller', [], 'pending'), false);
  assert.deepEqual(propertyPayload({ ...wanted, wantedOperations: ['rent'] }, 'seller', [], 'pending').wantedOperations, ['rent']);
  assert.equal('wantedOperations' in propertyPayload(wanted, 'seller', [], 'pending'), false, 'the server keeps or defaults a missing list');
  assert.equal('wantedOperations' in propertyPayload({ ...sale, wantedOperations: ['rent'] }, 'seller', [], 'pending'), false);

  const r = mapRemoteListing({ ...row, operation: 'rent', rent_period: 'day', rent_min_stay: null }, new Map());
  assert.equal(r.operation, 'rent'); assert.deepEqual(r.rent, { period: 'day' });
  assert.deepEqual(mapRemoteListing({ ...row, operation: 'rent', rent_period: 'month', rent_min_stay: 6 }, new Map()).rent, { period: 'month', minStay: 6 });
  assert.throws(() => mapRemoteListing({ ...row, operation: 'rent', rent_period: 'week' }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, operation: 'rent', rent_period: 'month', rent_min_stay: 400 }, new Map()), /no válidos/);
  assert.throws(() => mapRemoteListing({ ...row, rent_period: 'month' }, new Map()), /no válidos/, 'only a rental has a period');
  const b = { ...row, operation: 'wanted', type: null, area: null, bathrooms: null };
  assert.deepEqual(mapRemoteListing({ ...b, wanted_operations: ['rent'] }, new Map()).wantedOperations, ['rent']);
  assert.deepEqual(mapRemoteListing(b, new Map()).wantedOperations, ['sale', 'swap']);
  assert.throws(() => mapRemoteListing({ ...b, wanted_operations: ['buy'] }, new Map()), /no válidos/);
  assert.equal(mapRemoteListing({ ...row, wanted_operations: ['sale', 'swap'] }, new Map()).wantedOperations, undefined);

  const wantedRent = { ...wanted, wantedOperations: ['sale', 'rent'] };
  assert.deepEqual(restoreDraft(JSON.stringify(rent), sale), rent);
  assert.deepEqual(restoreDraft(JSON.stringify(wantedRent), sale), wantedRent);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...wanted, wantedOperations: ['buy'] }), sale), sale);
  assert.deepEqual(restoreDraft(JSON.stringify({ ...rent, rentPeriod: 'week' }), sale), sale);

  const listings = [createListing(rent, { id: 'r', ...at }), createListing(wantedRent, { id: 'b', ...at })];
  const decoded = decodeMarketplaceSnapshot(JSON.stringify({ version: 1, localListings: listings, favoriteIds: [] }));
  assert.equal(decoded.issue, null); assert.deepEqual(decoded.snapshot.localListings, listings);

  const source = readFileSync(new URL('../src/data/supabaseMarketplace.ts', import.meta.url), 'utf8');
  const columns = /PROPERTY_COLUMNS = '([^']+)'/.exec(source)![1].split(',');
  for (const column of ['rent_period', 'rent_min_stay', 'wanted_operations']) assert.ok(columns.includes(column), column);
});
