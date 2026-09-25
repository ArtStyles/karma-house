// scripts/verify-public-listing.mjs
// Checks the deployed `p` function: an approved listing renders with open graph tags, a
// non-public one and a bogus id return 404, and POST is rejected. Reads nothing private.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const base = `${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/p/`;

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
  const result = { name, status: response.status, cache: response.headers.get('cache-control'), ok: expect(response, body) };
  checks.push(result);
  console.log(JSON.stringify(result));
}

await check('approved', base + approved.id, undefined, (r, b) =>
  r.status === 200 && r.headers.get('cache-control') === 'public, max-age=300'
  && b.includes('<meta property="og:title"') && b.includes('<meta property="og:image"') && b.includes(`karmahouse://property/${approved.id}`));
if (hidden) await check('hidden', base + hidden.id, undefined, (r, b) => r.status === 404 && b.includes('Ya no está disponible'));
await check('bogus', base + 'not-a-uuid', undefined, (r) => r.status === 404);
await check('post', base + approved.id, { method: 'POST' }, (r) => r.status === 405);

if (checks.some((c) => !c.ok)) { console.error('KH_PUBLIC_LISTING_FAILED'); process.exitCode = 1; }
