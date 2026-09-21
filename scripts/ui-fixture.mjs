// Temporary, isolated browser-QA accounts. This script never sends email.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
const root = new URL('../', import.meta.url);
const env = Object.fromEntries(readFileSync(new URL('infra/.env.local', root), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const fixturePath = new URL('artifacts/ui-fixture.json', root);
const db = createDatabaseClient();
async function request(path, method, body) {
  const response = await fetch(env.SUPABASE_URL + path, { method, headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'KarmaHouse-QA/1.0' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`QA API ${response.status}: ${data.code ?? data.error_code ?? ''}`);
  return data;
}
try {
  await db.connect();
  if (process.argv.includes('--create')) {
    if (existsSync(fixturePath)) throw new Error('Clean up previous UI fixture first.');
    const runId = `kh-ui-${randomUUID()}`;
    const fixture = { runId, users: [] };
    mkdirSync(new URL('artifacts/', root), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(fixture));
    for (const role of ['seller', 'reviewer']) {
      const email = `${runId}-${role}@example.invalid`;
      const password = `Kh!${randomBytes(18).toString('base64url')}`;
      const user = await request('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true, user_metadata: { display_name: `Prueba temporal ${role}` } });
      fixture.users.push({ id: user.id, role, email, password });
      writeFileSync(fixturePath, JSON.stringify(fixture));
      if (role === 'reviewer') await db.query('insert into public.kh_admins(user_id) values($1)', [user.id]);
    }
    console.log(JSON.stringify(fixture));
  } else if (process.argv.includes('--cleanup')) {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    for (const user of fixture.users) {
      const photos = (await db.query("select name from storage.objects where bucket_id='property-photos' and split_part(name,'/',1)=$1", [user.id])).rows;
      if (photos.length) await request('/storage/v1/object/property-photos', 'DELETE', { prefixes: photos.map(photo => photo.name) });
      await request(`/auth/v1/admin/users/${user.id}`, 'DELETE');
    }
    const leftovers = (await db.query('select id from auth.users where email like $1', [fixture.runId + '%'])).rows.length;
    if (leftovers) throw new Error('QA cleanup incomplete');
    unlinkSync(fixturePath);
    console.log('Temporary UI users, listings and photos removed.');
  } else throw new Error('Use --create or --cleanup.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.end(); }
