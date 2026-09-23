import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecimalInput, publishedNumber } from '../src/domain/numericInput.ts';
import { validateDraft } from '../src/domain/listings.ts';
import { propertyPayload } from '../src/data/propertyPayload.ts';

test('Spanish decimal input preserves its numeric value instead of joining the digits', () => {
  assert.equal(Number(normalizeDecimalInput('12,5')), 12.5);
  assert.equal(Number(normalizeDecimalInput('0,75')), .75);
  assert.equal(normalizeDecimalInput('120.5'), '120.5');
  assert.equal(normalizeDecimalInput(''), '');
});

test('ambiguous or invalid numeric input remains invalid for range validation', () => {
  assert.equal(normalizeDecimalInput('-10'), '-10');
  assert.ok(Number.isNaN(Number(normalizeDecimalInput('1.000,5'))));
  assert.ok(Number.isNaN(Number(normalizeDecimalInput('12abc5'))));
  assert.ok(Number.isNaN(Number(normalizeDecimalInput('1,2,5'))));
});

test('the published number is what the review step must show, not the typed string', () => {
  // «85.000» is how Cubans write eighty-five thousand; it used to reach the catalogue as 85.
  assert.equal(publishedNumber('85.000'), 85000);
  assert.equal(publishedNumber('1.250.000'), 1250000);
  assert.equal(publishedNumber('12.5'), 12.5);
  assert.equal(publishedNumber('85.50'), 85.5);
  assert.equal(publishedNumber('0.500'), 0.5);
  assert.equal(publishedNumber('1250.000'), 1250);
  assert.equal(publishedNumber('85000'), 85000);
  assert.equal(publishedNumber(' 120 '), 120);
  assert.equal(publishedNumber(''), null);
  assert.equal(publishedNumber('   '), null);
  assert.equal(publishedNumber('12abc5'), null);
  assert.equal(publishedNumber('1.000,5'), null);
});

test('validation and the saved payload read thousands the same way the hint does', () => {
  const draft = { title: 'Casa', location: 'Vedado', province: 'La Habana', price: '85.000', area: '1.200', bedrooms: '2', bathrooms: '1', type: 'Casa', description: 'x'.repeat(20), amenities: [], imageKey: 'vedado' } as never;
  assert.equal(validateDraft(draft).errors.area, undefined);
  const payload = propertyPayload(draft, 'owner', ['p.jpg'], 'pending');
  assert.equal(payload.price, 85000);
  assert.equal(payload.area, 1200);
  // Integers keep their own rule: «1.000» bedrooms is a thousand, not one.
  assert.ok(validateDraft({ ...(draft as object), bedrooms: '1.000' } as never).errors.bedrooms);
});
