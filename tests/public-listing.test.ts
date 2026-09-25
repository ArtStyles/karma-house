import assert from 'node:assert/strict';
import test from 'node:test';
import { describeListing, escapeHtml, formatPrice, type PublicListingRow } from '../supabase/functions/p/render.ts';

export const row: PublicListingRow = {
  id: '33000000-0000-4000-8000-000000000003',
  title: 'Casa en el Vedado <script>alert(1)</script>',
  location: 'Vedado', province: 'La Habana', type: 'Casa',
  description: 'Primera línea.\nSegunda "línea" & más.',
  price: '85000', area: '120.5', bedrooms: 3, bathrooms: 2,
  amenities: ['Balcón', 'Patio'], condition: 'good', floor: 2, price_negotiable: true,
};

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(escapeHtml(`<a href="x">Tom's & Jerry</a>`), '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Jerry&lt;/a&gt;');
});
test('formatPrice matches the app separator and drops cents', () => {
  assert.equal(formatPrice('85000'), '85,000');
  assert.equal(formatPrice(5500.49), '5,500');
  assert.equal(formatPrice(999), '999');
  assert.equal(formatPrice(1234567), '1,234,567');
});
test('describeListing is the og:description line', () => {
  assert.equal(describeListing(row), '85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²');
});
