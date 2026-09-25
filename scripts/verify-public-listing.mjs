// scripts/verify-public-listing.mjs
// Checks the deployed public pages (web/ on Vercel): an approved listing renders as HTML with
// open graph tags, a non-public one and a bogus id return 404, and POST is rejected. Reads
// nothing private. Usage: node scripts/verify-public-listing.mjs [https://karmahouse.vercel.app]
import { createDatabaseClient } from './cloud-db.mjs';

const base = `${(process.argv[2] ?? 'https://karmahouse.vercel.app').replace(/\/+$/, '')}/p/`;

const db = createDatabaseClient();
await db.connect();
const { rows } = await db.query(`
  select id, title, moderation, availability from public.properties
  order by (moderation='approved' and availability='active') desc, created_at desc`);
await db.end();
const approved = rows.find((row) => row.moderation === 'approved' && row.availability === 'active');
const hidden = rows.find((row) => !(row.moderation === 'approved' && row.availability === 'active'));
if (!approved) throw new Error('KH_NO_PUBLIC_LISTING: no hay ningún anuncio aprobado y activo que comprobar');

const checks = [];
async function check(name, url, init, expect) {
  const response = await fetch(url, init);
  const body = await response.text();
  const result = { name, status: response.status, type: response.headers.get('content-type'), cache: response.headers.get('cache-control'), ok: expect(response, body) };
  checks.push(result);
  console.log(JSON.stringify(result));
}

await check('approved', base + approved.id, undefined, (r, b) =>
  r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('text/html')
  && b.includes('<meta property="og:title"') && b.includes('<meta property="og:image"') && b.includes(`karmahouse://property/${approved.id}`));
if (hidden) await check('hidden', base + hidden.id, undefined, (r, b) => r.status === 404 && b.includes('Ya no está disponible'));
await check('bogus', base + 'not-a-uuid', undefined, (r) => r.status === 404);
await check('post', base + approved.id, { method: 'POST' }, (r) => r.status === 405);

if (checks.some((c) => !c.ok)) { console.error('KH_PUBLIC_LISTING_FAILED'); process.exitCode = 1; }
