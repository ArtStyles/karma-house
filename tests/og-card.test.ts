import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cut, handleOg, sealText } from '../web/api/og.ts';
import { handleAgencyProfile } from '../web/api/agency.ts';

const L = '11111111-1111-4111-8111-111111111111', A = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'https://www.karmahouse.site', env = { supabaseUrl: 'https://db.invalid', anonKey: 'public-fixture', publicOrigin: ORIGIN };
const row = { id: L, title: 'Casa en el Vedado', location: 'Vedado', province: 'La Habana', type: 'Casa', price: 85000, area: 120, bedrooms: 3, bathrooms: 2, photo_paths: ['u/a/one.jpg'], operation: 'sale', rent_period: null };
const size = (png: Uint8Array) => [new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20)];

function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.startsWith(ORIGIN)) return new Response(await readFile(`web/public${new URL(url).pathname}`));
    if (url.includes('?token=')) return new Response(await readFile('web/public/interior.jpg'));
    if (url.includes('/rest/v1/properties')) return Response.json([row]);
    if (url.includes('/object/sign/property-photos')) return Response.json([{ signedURL: '/object/sign/property-photos/u/a/one.jpg?token=1' }]);
    if (url.includes('kh_public_property_contact')) return Response.json({ propertyId: L, personalContact: false, agencies: [{ agencyId: A, tradeName: 'Habana Hogar', verified: true, isPrincipal: false, contactAvailable: true }] });
    return new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('a shared listing gets an 840×441 PNG card that the edge keeps for an hour', async () => {
  const calls: string[] = [];
  const res = await handleOg(new Request(`${ORIGIN}/api/og?kind=p&id=${L}&agencyId=${A}`), env, fakeFetch(calls));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  const png = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(size(png), [840, 441]);
  assert.ok(png.length < 600_000, `WhatsApp drops heavy previews (${png.length} bytes)`);
  assert.ok(calls.some(u => u.includes('kh_public_property_contact')), 'the agency line is read only for agency links');
});

test('an unknown or malformed id still answers with the brand card, cached briefly', async () => {
  for (const url of [`${ORIGIN}/api/og?kind=p&id=nope`, `${ORIGIN}/api/og?kind=agency&id=${L}&agencyId=bad`]) {
    const res = await handleOg(new Request(url), env, fakeFetch([]));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /s-maxage=300,/);
  }
});

test('card text never says «verificada» and cuts long names at a word', () => {
  assert.equal(sealText(true, false), 'Sello empresarial');
  assert.equal(sealText(true, true), 'Inmobiliaria principal');
  assert.equal(sealText(false, false), '');
  assert.equal(cut('Apartamento luminoso con balcón frente al mar', 30), 'Apartamento luminoso con…');
  assert.equal(cut('Casa corta', 30), 'Casa corta');
});

test('the agency page carries its own preview card', async () => {
  const profile = { agencyId: A, tradeName: 'Habana Hogar', verified: true, isPrincipal: false, businessPhone: '+5355555555', province: 'La Habana', municipality: 'Plaza de la Revolución', serviceAreas: ['Vedado'], description: 'Compra, venta y permuta de viviendas en La Habana.', logoPath: null };
  const res = await handleAgencyProfile(new Request(`${ORIGIN}/agency/${A}`), env, async () => Response.json(profile));
  const html = await res.text();
  assert.ok(html.includes(`<meta property="og:image" content="${ORIGIN}/og/agency/${A}">`));
  assert.ok(html.includes('<meta property="og:description" content="Plaza de la Revolución, La Habana · Inmobiliaria en KarmaHouse">'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
});
