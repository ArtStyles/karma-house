import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDecimalInput } from '../src/domain/numericInput.ts';

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
