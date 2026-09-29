import assert from 'node:assert/strict';
import test from 'node:test';
import { describeListing, escapeHtml, formatPrice, type PublicListingRow } from '../web/api/p.ts';
import { renderListing, renderUnavailable } from '../web/api/p.ts';
import { listingShareUrl, PUBLIC_PAGES_URL } from '../src/lib/publicSite.ts';
import { handle, type Env } from '../web/api/p.ts';

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
  assert.ok(html.includes(`<a class="more" id="more" href="${site}">`));
  assert.ok(html.includes("location.href=document.getElementById('more').href"));
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

test('listingShareUrl points at the public page of the listing', () => {
  assert.equal(listingShareUrl(row.id), `${PUBLIC_PAGES_URL}p/${row.id}`);
  assert.ok(PUBLIC_PAGES_URL.startsWith('https://') && PUBLIC_PAGES_URL.endsWith('/'));
});

const env: Env = { supabaseUrl: 'https://example.supabase.co/', anonKey: 'anon-key', publicOrigin: 'https://karmahouse.vercel.app' };
const dbRow = { ...row, photo_paths: ['u/a/one.jpg', 'u/a/two.jpg'] };
function fakeFetch(rest: { status: number; body?: unknown }, sign?: { status: number; body?: unknown } | Error): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const respond = (reply: { status: number; body?: unknown }) => new Response(JSON.stringify(reply.body ?? null), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/rest/v1/')) return respond(rest);
    if (sign instanceof Error) throw sign;
    return respond(sign ?? { status: 500 });
  }) as typeof fetch;
  return { fetch, calls };
}
const get = (path: string) => new Request(`https://karmahouse.vercel.app${path}`);

test('handle renders an approved listing with signed photos and the canonical page url', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: [dbRow] }, { status: 200, body: [{ signedURL: '/object/sign/property-photos/u/a/one.jpg?token=1' }, { signedURL: '/object/sign/property-photos/u/a/two.jpg?token=2' }] });
  const response = await handle(get(`/api/p?id=${row.id}`), env, fetch);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=300, stale-while-revalidate=60');
  assert.ok(html.includes('<meta property="og:image" content="https://example.supabase.co/storage/v1/object/sign/property-photos/u/a/one.jpg?token=1">'));
  assert.equal((html.match(/<img loading="lazy"/g) ?? []).length, 2);
  assert.ok(html.includes(`<link rel="canonical" href="https://karmahouse.vercel.app/p/${row.id}">`));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.startsWith(`https://example.supabase.co/rest/v1/properties?select=`));
  assert.ok(calls[0].url.includes(`id=eq.${row.id}&moderation=eq.approved&availability=eq.active`));
  assert.ok(!calls[0].url.includes('owner_id') && !calls[0].url.includes('latitude'));
  assert.equal((calls[0].init?.headers as Record<string, string>).apikey, 'anon-key');
  assert.equal(calls[1].url, 'https://example.supabase.co/storage/v1/object/sign/property-photos');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { expiresIn: 3600, paths: dbRow.photo_paths });
});
test('handle still renders when photo signing fails', async () => {
  for (const sign of [{ status: 400 }, new Error('offline')]) {
    const response = await handle(get(`/api/p?id=${row.id}`), env, fakeFetch({ status: 200, body: [dbRow] }, sign).fetch);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!html.includes('og:image') && !html.includes('<img'));
  }
});
test('handle answers 404 for unknown, hidden or malformed ids without touching Supabase', async () => {
  const missing = fakeFetch({ status: 200, body: [] });
  const hidden = await handle(get(`/api/p?id=${row.id}`), env, missing.fetch);
  assert.equal(hidden.status, 404);
  assert.ok((await hidden.text()).includes('Ya no está disponible'));
  assert.equal(missing.calls.length, 1);
  const bogus = fakeFetch({ status: 200, body: [dbRow] });
  for (const path of ['/api/p?id=not-a-uuid', '/api/p', `/api/p?id=${row.id}%27`]) assert.equal((await handle(get(path), env, bogus.fetch)).status, 404);
  assert.equal(bogus.calls.length, 0);
});
test('handle answers 503 when the REST call fails and 405 for other methods', async () => {
  const down = await handle(get(`/api/p?id=${row.id}`), env, fakeFetch({ status: 500 }).fetch);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get('retry-after'), '30');
  assert.equal(await down.text(), 'Service Unavailable: rest 500');
  const unconfigured = await handle(get(`/api/p?id=${row.id}`), { ...env, anonKey: '' }, fakeFetch({ status: 200, body: [dbRow] }).fetch);
  assert.equal(unconfigured.status, 503);
  assert.equal(await unconfigured.text(), 'Service Unavailable: missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const offline = await handle(get(`/api/p?id=${row.id}`), env, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
  assert.equal(offline.status, 503);
  const post = await handle(new Request(`https://karmahouse.vercel.app/api/p?id=${row.id}`, { method: 'POST' }), env, fakeFetch({ status: 200, body: [dbRow] }).fetch);
  assert.equal(post.status, 405);
});

test('the public page labels swaps and wanted ads', () => {
  const swapRow = { ...row, operation: 'swap' as const, swap_wants: 'Apartamento en Playa con dos habitaciones.', swap_provinces: ['La Habana'], swap_balance: 'pay' as const, swap_amount: '5000' };
  const swapHtml = renderListing(swapRow, photos, site, self);
  assert.ok(swapHtml.includes('<title>Permuta: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(swapHtml.includes('<meta property="og:description" content="Valor est. 85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²">'));
  assert.ok(swapHtml.includes('<h2>A cambio busca</h2>') && swapHtml.includes('Apartamento en Playa con dos habitaciones.') && swapHtml.includes('Añade hasta $ 5,000') && swapHtml.includes('<dd>La Habana</dd>'));
  const wantedRow = { ...row, operation: 'wanted' as const, type: null, area: null, bathrooms: null, description: 'Busco con balcón, planta baja o ascensor.' };
  const wantedHtml = renderListing(wantedRow, [], site, self);
  assert.ok(wantedHtml.includes('<title>Busco: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(wantedHtml.includes('<meta property="og:description" content="Hasta 85,000 USD · Vedado, La Habana · desde 3 hab · Casa o apartamento">'));
  assert.ok(!wantedHtml.includes('Superficie') && !wantedHtml.includes('Baños') && !wantedHtml.includes('og:image'));
  assert.ok(wantedHtml.includes('Tengo algo que encaja'));
  assert.ok(wantedHtml.includes('<dt>Habitaciones mínimas</dt><dd>3</dd>'));
});

test('the public page labels rentals and what a wanted ad is after', () => {
  const rentRow = { ...row, operation: 'rent' as const, rent_period: 'month' as const, rent_min_stay: 3 };
  const rentHtml = renderListing(rentRow, photos, site, self);
  assert.ok(rentHtml.includes('<title>Alquiler: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(rentHtml.includes('<meta property="og:title" content="Alquiler: Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;">'));
  assert.ok(rentHtml.includes('<meta property="og:description" content="Alquiler 85,000 USD/mes · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²">'));
  assert.ok(rentHtml.includes('<p class="eyebrow">Alquiler</p>'));
  assert.ok(rentHtml.includes('$ 85,000 <small>USD / mes'));
  assert.ok(rentHtml.includes('<dt>Estancia mínima</dt><dd>3 meses</dd>'));
  const nightly = renderListing({ ...rentRow, rent_period: 'day', rent_min_stay: null }, [], site, self);
  assert.ok(nightly.includes('$ 85,000 <small>USD / noche') && nightly.includes('USD/noche ·'));
  assert.ok(!nightly.includes('Estancia mínima'));
  assert.equal(describeListing({ ...rentRow, rent_min_stay: 1, rent_period: 'day' }), 'Alquiler 85,000 USD/noche · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²');
  const wantedRow = { ...row, operation: 'wanted' as const, type: null, area: null, bathrooms: null, wanted_operations: ['rent' as const] };
  assert.ok(renderListing(wantedRow, [], site, self).includes('Busca: alquilar'));
  assert.ok(renderListing({ ...wantedRow, wanted_operations: ['sale', 'swap', 'rent'] }, [], site, self).includes('Busca: comprar, permutar o alquilar'));
  assert.ok(renderListing({ ...wantedRow, wanted_operations: undefined }, [], site, self).includes('Busca: comprar o permutar'));
  assert.ok(!rentHtml.includes('Busca:'));
});

test('the public page leaves out a missing surface', () => {
  const bare = { ...row, area: null };
  assert.equal(describeListing(bare), '85,000 USD · Vedado, La Habana · 3 hab · 2 baños');
  assert.equal(describeListing({ ...bare, operation: 'rent', rent_period: 'month' }), 'Alquiler 85,000 USD/mes · Vedado, La Habana · 3 hab · 2 baños');
  const html = renderListing(bare, photos, site, self);
  assert.ok(!html.includes('Superficie') && !html.includes('m²') && !html.includes('undefined') && !html.includes('NaN'));
  assert.ok(html.includes('<dt>Baños</dt><dd>2</dd>'));
  assert.ok(renderListing(row, photos, site, self).includes('<dt>Superficie</dt><dd>120.5 m²</dd>'));
});
