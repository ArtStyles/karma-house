import assert from 'node:assert/strict';
import test from 'node:test';
import { describeListing, escapeHtml, formatPrice, type PublicListingRow } from '../supabase/functions/p/render.ts';
import { renderListing, renderUnavailable } from '../supabase/functions/p/render.ts';

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

const site = 'https://artstyles.github.io/karma-house/';
const self = `https://example.supabase.co/functions/v1/p/${row.id}`;
const photos = ['https://example.supabase.co/storage/v1/object/sign/a.jpg?token=x&y=1', 'https://example.supabase.co/storage/v1/object/sign/b.jpg?token=z'];

test('renderListing escapes user text and carries the open graph tags', () => {
  const html = renderListing(row, photos, site, self);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('<title>Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(html.includes('<meta property="og:title" content="Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;">'));
  assert.ok(html.includes('<meta property="og:description" content="85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²">'));
  assert.ok(html.includes(`<meta property="og:url" content="${self}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${self}">`));
  assert.ok(html.includes('<meta property="og:image" content="https://example.supabase.co/storage/v1/object/sign/a.jpg?token=x&amp;y=1">'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(html.includes('<meta property="og:site_name" content="KarmaHouse">'));
});
test('renderListing shows every photo, the details and the description with line breaks', () => {
  const html = renderListing(row, photos, site, self);
  assert.equal((html.match(/<img loading="lazy"/g) ?? []).length, 2);
  assert.ok(html.includes('src="https://example.supabase.co/storage/v1/object/sign/b.jpg?token=z"'));
  assert.ok(html.includes('85,000'));
  assert.ok(html.includes('Negociable'));
  assert.ok(html.includes('Buen estado'));
  assert.ok(html.includes('Planta 2'));
  assert.ok(html.includes('Primera línea.<br>Segunda &quot;línea&quot; &amp; más.'));
  assert.ok(html.includes('<li>Balcón</li><li>Patio</li>'));
  assert.ok(html.includes(`href="karmahouse://property/${row.id}"`));
  assert.ok(html.includes(`href="${site}"`));
});
test('renderListing without photos or optional fields still renders', () => {
  const html = renderListing({ ...row, amenities: null, condition: null, floor: null, price_negotiable: null, description: '' }, [], site, self);
  assert.ok(!html.includes('og:image'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('Negociable'));
  assert.ok(!html.includes('Planta'));
  assert.ok(!html.includes('<ul'));
  assert.ok(html.includes('85,000'));
});
test('renderUnavailable points back to the site', () => {
  const html = renderUnavailable(site);
  assert.ok(html.includes('Ya no está disponible'));
  assert.ok(html.includes(`href="${site}"`));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
});
