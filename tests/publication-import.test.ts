import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../src/domain/listings.ts';
import { parseListingText } from '../src/domain/importListing.ts';

test('pasting an ad fills blanks without replacing entered fields, photos or retry identity', async () => {
  const { preparePublicationImport } = await import('../src/domain/publicationImport.ts');
  const original = { ...structuredClone(emptyDraft), operation: 'rent' as const, title: 'Mi título', price: '450', photoUri: 'file:///cover.jpg', photos: [{ uri: 'file:///cover.jpg', uploadId: 'existing' }], clientRequestId: 'retry', expectedVersion: 3 };
  const before = structuredClone(original);
  const imported = preparePublicationImport(original, parseListingText('Alquilo apartamento en Vedado, La Habana, 2 habitaciones por 600 USD mensuales.'));
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.draft.title, 'Mi título');
  assert.equal(imported.draft.price, '450');
  assert.equal(imported.draft.operation, 'rent');
  assert.equal(imported.draft.bedrooms, '2');
  assert.deepEqual(imported.draft.photos, before.photos);
  assert.equal(imported.draft.photoUri, before.photoUri);
  assert.equal(imported.draft.clientRequestId, 'retry');
  assert.equal(imported.draft.expectedVersion, 3);
  assert.ok(!imported.summary.detected.includes('title'));
  assert.deepEqual(original, before);
});

test('an explicit different operation leaves the existing draft intact', async () => {
  const { preparePublicationImport } = await import('../src/domain/publicationImport.ts');
  const draft = { ...structuredClone(emptyDraft), operation: 'rent' as const, title: 'Borrador de alquiler' };
  const result = preparePublicationImport(draft, parseListingText('Vendo casa en Vedado por 100000 USD con dos habitaciones.'));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /operación|alquiler/i);
  assert.equal(draft.title, 'Borrador de alquiler');
  assert.equal(draft.operation, 'rent');
});

test('a parser fallback to sale does not convert a rent draft when the text names no operation', async () => {
  const { preparePublicationImport } = await import('../src/domain/publicationImport.ts');
  const result = preparePublicationImport({ ...emptyDraft, operation: 'rent', rentPeriod: 'day' }, parseListingText('Apartamento en Vedado, La Habana, con 2 habitaciones y 1 baño.'));
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.draft.operation, 'rent'); assert.equal(result.draft.rentPeriod, 'day'); }
});

test('a fresh paste keeps conservative type defaults and operation-specific fields', async () => {
  const { preparePublicationImport } = await import('../src/domain/publicationImport.ts');
  const rent = preparePublicationImport({ ...emptyDraft, clientRequestId: 'retry' }, parseListingText('Alquilo apartamento en Vedado con 2 habitaciones por 300 USD mensuales.'));
  assert.equal(rent.ok, true);
  if (rent.ok) { assert.equal(rent.draft.type, 'Apartamento'); assert.equal(rent.draft.rentPeriod, 'month'); }
  const wanted = preparePublicationImport(emptyDraft, parseListingText('Busco vivienda en La Habana hasta 30000 USD.'));
  assert.equal(wanted.ok, true);
  if (wanted.ok) { assert.equal(wanted.draft.type, ''); assert.deepEqual(wanted.draft.wantedOperations, ['sale', 'swap']); }
});

test('explicit false, zero and existing amenities survive a paste', async () => {
  const { preparePublicationImport } = await import('../src/domain/publicationImport.ts');
  const draft = { ...emptyDraft, operation: 'sale' as const, priceNegotiable: false, floor: '0', amenities: ['Ascensor'] };
  const result = preparePublicationImport(draft, parseListingText('Vendo apartamento en tercer piso, precio negociable, terraza y garaje.'));
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.draft.priceNegotiable, false); assert.equal(result.draft.floor, '0'); assert.deepEqual(result.draft.amenities, ['Ascensor']); }
});
