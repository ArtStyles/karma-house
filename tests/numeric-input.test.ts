import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecimalInput, publishedNumber } from '../src/domain/numericInput.ts';

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
  // A thousands separator is the trap: «85.000» reaches the catalogue as 85.
  assert.equal(publishedNumber('85.000'), 85);
  assert.equal(publishedNumber('85000'), 85000);
  assert.equal(publishedNumber(' 120 '), 120);
  assert.equal(publishedNumber(''), null);
  assert.equal(publishedNumber('   '), null);
  assert.equal(publishedNumber('12abc5'), null);
  assert.equal(publishedNumber('1.000,5'), null);
});
