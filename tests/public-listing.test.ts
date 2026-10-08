import assert from 'node:assert/strict';
import test from 'node:test';
import { describeListing, escapeHtml, formatPrice, type PublicListingRow } from '../web/api/p.ts';
import { renderListing, renderUnavailable } from '../web/api/p.ts';
import { listingShareUrl, PUBLIC_PAGES_URL, PRIVACY_URL, TERMS_URL, SITE_URL as APP_SITE_URL } from '../src/lib/publicSite.ts';
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

const site = 'https://karmahouse.vercel.app/';
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
  assert.ok(html.includes(`href="${site}#descargar"`));
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

test('renderListing names the seller, their level and the verification, escaped', () => {
  const html = renderListing(row, photos, site, self, { name: 'Ana <b>López</b>', level: 'trusted', verified: true });
  assert.ok(html.includes('<p class="muted">Publicado por Ana &lt;b&gt;López&lt;/b&gt; · Confiable</p>'));
  assert.ok(html.includes('<p class="muted">Verificado por KarmaHouse</p>'));
  assert.ok(!html.includes('<b>López</b>'));
  const unverified = renderListing(row, photos, site, self, { name: 'Ana', level: 'featured', verified: false });
  assert.ok(unverified.includes('Publicado por Ana · Destacado') && !unverified.includes('Verificado por KarmaHouse'));
  const without = renderListing(row, photos, site, self);
  assert.ok(!without.includes('Publicado por') && !without.includes('Verificado por KarmaHouse'));
});

const env: Env = { supabaseUrl: 'https://example.supabase.co/', anonKey: 'anon-key', publicOrigin: 'https://karmahouse.vercel.app' };
const ownerId = '44000000-0000-4000-8000-000000000004';
const dbRow = { ...row, owner_id: ownerId, photo_paths: ['u/a/one.jpg', 'u/a/two.jpg'] };
const PROFILE_URL = 'https://example.supabase.co/rest/v1/rpc/kh_public_profile';
type Reply = { status: number; body?: unknown } | Error | Response;
function fakeFetch(rest: { status: number; body?: unknown }, sign?: Reply, profile: Reply = { status: 404 }): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const respond = (reply: Reply) => {
    if (reply instanceof Error) throw reply;
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/rest/v1/properties')) return respond(rest);
    if (url.includes('/storage/v1/object/sign/')) return respond(sign ?? { status: 500 });
    if (url.includes('/rest/v1/rpc/kh_public_profile')) return respond(profile);
    if (url.includes('/rest/v1/rpc/kh_resolve_property_alias')) return respond({status:200,body:JSON.parse(String(init?.body)).p_property_id});
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetch, calls };
}
const profile = { id: ownerId, displayName: 'Ana <b>López</b>', level: 'trusted', verified: true, responseMinutes: 30 };
const listed = { status: 200, body: [dbRow] };
const get = (path: string) => new Request(`https://karmahouse.vercel.app${path}`);

test('public journeys use the official landing while legal documents retain their existing locations', () => {
  assert.equal(APP_SITE_URL, 'https://karmahouse.vercel.app/');
  assert.equal(PUBLIC_PAGES_URL, APP_SITE_URL);
  assert.equal(PRIVACY_URL, 'https://artstyles.github.io/karma-house/privacidad.html');
  assert.equal(TERMS_URL, 'https://artstyles.github.io/karma-house/terminos.html');
});

test('valid and unavailable public pages offer the official download instead of a nonexistent catalogue', async () => {
  const available = await handle(get(`/p/${row.id}`), env, fakeFetch(listed, { status: 200, body: [] }).fetch);
  const missing = await handle(get('/p/not-a-uuid'), env, fakeFetch(listed).fetch);
  assert.equal(available.status, 200);
  assert.equal(missing.status, 404);
  for (const response of [available, missing]) {
    const html = await response.text();
    assert.ok(html.includes('href="https://karmahouse.vercel.app/#descargar"'));
    assert.ok(html.includes('Descargar KarmaHouse'));
    assert.ok(!html.includes('Ver más viviendas'));
    assert.ok(!html.includes('artstyles.github.io/karma-house/'));
  }
});

test('opening a shared listing keeps an explicit download fallback without timed navigation away', () => {
  const html = renderListing(row, [], site, `https://karmahouse.vercel.app/p/${row.id}`);
  assert.ok(html.includes(`href="karmahouse://property/${row.id}"`));
  assert.ok(html.includes(`<link rel="canonical" href="https://karmahouse.vercel.app/p/${row.id}">`));
  assert.ok(html.includes('después vuelve a este enlace'));
  assert.match(html, /href="https:\/\/karmahouse\.vercel\.app\/#descargar"[^>]*target="_blank"[^>]*rel="noopener"/);
  assert.ok(!html.includes('setTimeout(') && !html.includes('location.href='));
});

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
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.startsWith(`https://example.supabase.co/rest/v1/properties?select=`));
  assert.ok(calls[0].url.includes(`id=eq.${row.id}&moderation=eq.approved&availability=eq.active`));
  assert.ok(!calls[0].url.includes('latitude'));
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
test('handle names the seller from kh_public_profile without printing the owner id', async () => {
  const { fetch, calls } = fakeFetch(listed, { status: 200, body: [] }, { status: 200, body: profile });
  const response = await handle(get(`/api/p?id=${row.id}`), env, fetch);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('<p class="muted">Publicado por Ana &lt;b&gt;López&lt;/b&gt; · Confiable</p>'));
  assert.ok(html.includes('<p class="muted">Verificado por KarmaHouse</p>'));
  assert.ok(!html.includes(ownerId));
  assert.ok(calls[0].url.includes(',owner_id'));
  const rpc = calls.find((call) => call.url === PROFILE_URL);
  assert.ok(rpc);
  assert.equal(rpc.init?.method, 'POST');
  assert.deepEqual(rpc.init?.headers, { apikey: 'anon-key', Authorization: 'Bearer anon-key', 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(String(rpc.init?.body)), { p_user_id: ownerId });
});
test('handle loads the seller for a listing without photos', async () => {
  const { fetch, calls } = fakeFetch({ status: 200, body: [{ ...dbRow, photo_paths: null }] }, undefined, { status: 200, body: { ...profile, verified: false, level: 'new' } });
  const html = await (await handle(get(`/api/p?id=${row.id}`), env, fetch)).text();
  assert.ok(html.includes('Publicado por Ana &lt;b&gt;López&lt;/b&gt; · Nuevo') && !html.includes('Verificado por KarmaHouse'));
  assert.deepEqual(calls.map((call) => call.url.split('?')[0]), ['https://example.supabase.co/rest/v1/properties', PROFILE_URL]);
});
test('handle renders without the seller line when the profile is missing or malformed', async () => {
  const failures: Reply[] = [
    { status: 404 },
    { status: 500, body: profile },
    new Error('offline'),
    new Response('not json', { status: 200 }),
    { status: 200, body: null },
    { status: 200, body: [profile] },
    { status: 200, body: { ...profile, displayName: 'A' } },
    { status: 200, body: { ...profile, displayName: 'x'.repeat(81) } },
    { status: 200, body: { ...profile, displayName: 42 } },
    { status: 200, body: { ...profile, level: 'legend' } },
    { status: 200, body: { ...profile, level: 'toString' } },
    { status: 200, body: { ...profile, verified: 'yes' } },
  ];
  for (const failure of failures) {
    const response = await handle(get(`/api/p?id=${row.id}`), env, fakeFetch(listed, { status: 200, body: [] }, failure).fetch);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes('<h1>Casa en el Vedado'));
    assert.ok(!html.includes('Publicado por') && !html.includes('Verificado por KarmaHouse') && !html.includes(ownerId));
  }
});
test('handle answers 404 for unknown, hidden or malformed ids without touching Supabase', async () => {
  const missing = fakeFetch({ status: 200, body: [] });
  const hidden = await handle(get(`/api/p?id=${row.id}`), env, missing.fetch);
  assert.equal(hidden.status, 404);
  assert.ok((await hidden.text()).includes('Ya no está disponible'));
  assert.equal(missing.calls.length, 2);
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
