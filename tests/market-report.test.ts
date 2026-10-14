import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvinceReport, median, normalizeZone, renderReportHtml, slug } from '../scripts/market-report-lib.mjs';

const base = { province: 'La Habana', month: '2026-10', cutoff: '2026-10-14T00:00:00Z' };
const listing = (n: number, extra: Record<string, unknown> = {}) => ({
  province: 'La Habana', location: n % 2 ? 'Vedado' : 'vedado ', type: 'Casa', operation: 'sale', rent_period: null,
  price: 40000 + n * 1000, area: n < 5 ? null : 100, availability: 'active', created_at: new Date('2026-09-01T00:00:00Z'),
  owner_id: `owner-${n}`, sold_at: null, ...extra,
});

test('zones ignore case, accents and spaces', () => {
  assert.equal(normalizeZone('  Playa   Miramar '), 'playa miramar');
  assert.equal(normalizeZone('Habána Vieja'), 'habana vieja');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(slug('Isla de la Juventud'), 'isla-de-la-juventud');
});

test('a group shows a price only with ten comparable listings', () => {
  const nine = buildProvinceReport({ ...base, listings: Array.from({ length: 9 }, (_, n) => listing(n)), searches: [] });
  assert.equal(nine.prices[0].median, null);
  assert.equal(nine.zones.length, 0);
  const ten = buildProvinceReport({ ...base, listings: Array.from({ length: 10 }, (_, n) => listing(n)), searches: [] });
  assert.equal(ten.prices[0].count, 10);
  assert.equal(ten.prices[0].median, 44500);
  assert.equal(ten.prices[0].perM2, null, 'only five listings give their surface');
  assert.equal(ten.zones[0].label, 'Vedado');
});

test('movement and demand respect their thresholds', () => {
  const sold = Array.from({ length: 10 }, (_, n) => listing(n, { availability: 'sold', sold_at: new Date(`2026-10-${String(n + 1).padStart(2, '0')}T00:00:00Z`) }));
  const searches = [...Array.from({ length: 5 }, (_, n) => ({ user_id: `u${n}`, operations: ['sale'] })), { user_id: 'u0', operations: ['sale'] }, { user_id: 'r1', operations: ['rent'] }];
  const report = buildProvinceReport({ ...base, listings: [...sold, listing(20, { created_at: new Date('2026-10-05T00:00:00Z') })], searches });
  assert.equal(report.movement.newListings, 1);
  assert.equal(report.movement.sold, 10);
  assert.equal(report.movement.medianDaysToSale, 34.5);
  assert.deepEqual(report.demand.map(d => [d.label, d.people]), [['Venta', 5], ['Alquiler', null]]);
});

test('the page says what the numbers are and escapes text', () => {
  const html = renderReportHtml(buildProvinceReport({ ...base, province: 'La <Habana>', listings: [], searches: [] }));
  assert.match(html, /Precio pedido, no precio de venta/);
  assert.match(html, /Aún hay pocos datos/);
  assert.ok(html.includes('La &lt;Habana&gt;') && !html.includes('<Habana>'));
});
