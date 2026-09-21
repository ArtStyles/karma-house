// Isolated browser-QA accounts. Admin creation confirms them without sending email.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const readEnv = path => Object.fromEntries(readFileSync(new URL(path, root), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const privateConfig = readEnv('infra/.env.local');
const publicConfig = readEnv('.env.local');
const fixturePath = new URL('artifacts/messaging-ui-fixture.json', root);
const db = createDatabaseClient();
async function request(path, { method = 'GET', body, token, admin = false, binary = false } = {}) {
  const key = admin ? privateConfig.SUPABASE_SECRET_KEY : publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(privateConfig.SUPABASE_URL + path, {
    method, headers: { apikey: key, ...(token || admin ? { Authorization: `Bearer ${token ?? key}` } : {}), 'Content-Type': binary ? 'image/png' : 'application/json', 'User-Agent': 'KarmaHouse-MessagingQA/1.0' },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const raw = await response.text(); let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) throw new Error(`Fixture request failed (${response.status}, ${data?.code ?? data?.error_code ?? 'API'}).`);
  return data;
}
const save = fixture => writeFileSync(fixturePath, JSON.stringify(fixture));
const rpc = (user, name, body) => request(`/rest/v1/rpc/${name}`, { method: 'POST', token: user.token, body });
async function login(user) {
  const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password: user.password } });
  return { ...user, token: session.access_token };
}
try {
  await db.connect();
  if (process.argv.includes('--create')) {
    if (existsSync(fixturePath)) throw new Error('Clean up the previous messaging fixture first.');
    const fixture = { runId: `kh-chat-ui-${randomUUID()}`, users: [], paths: [], propertyId: null };
    mkdirSync(new URL('artifacts/', root), { recursive: true }); save(fixture);
    for (const role of ['seller', 'buyer', 'reviewer']) {
      const email = `${fixture.runId}-${role}@example.invalid`;
      const password = `Kh!${randomBytes(20).toString('base64url')}`;
      const created = await request('/auth/v1/admin/users', { method: 'POST', admin: true, body: { email, password, email_confirm: true, user_metadata: { display_name: role === 'seller' ? 'Laura · Prueba' : role === 'buyer' ? 'Daniel · Prueba' : 'Revisión · Prueba' } } });
      fixture.users.push({ id: created.id, role, email, password }); save(fixture);
      if (role === 'reviewer') await db.query('insert into public.kh_admins(user_id) values($1)', [created.id]);
    }
    const seller = await login(fixture.users.find(user => user.role === 'seller'));
    const reviewer = await login(fixture.users.find(user => user.role === 'reviewer'));
    const path = `${seller.id}/${fixture.runId}/photo.png`;
    fixture.paths.push(path); save(fixture);
    await request(`/storage/v1/object/property-photos/${path}`, { method: 'POST', token: seller.token, body: readFileSync(new URL('assets/images/vedado-demo.png', root)), binary: true });
    const property = await rpc(seller, 'kh_save_property', { p_payload: { ownerId: seller.id, clientRequestId: fixture.runId, title: 'Vivienda temporal · Prueba de chat', location: 'Vedado', province: 'La Habana', type: 'Casa', price: '65000', area: '120', bedrooms: '3', bathrooms: '2', description: 'Anuncio ficticio temporal para verificar el chat de KarmaHouse. Se eliminará al terminar las pruebas.', amenities: ['Patio'], photoPaths: [path], moderation: 'pending', mapLocation: { latitude: 23.13587, longitude: -82.395, precision: 'approximate' } } });
    fixture.propertyId = property.id; save(fixture);
    await rpc(reviewer, 'kh_review_property', { p_id: property.id, p_decision: 'approved', p_note: null, p_expected_version: property.version });
    console.log('Temporary messaging accounts and listing ready. Credentials are in the ignored fixture file.');
  } else {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!fixture.runId.startsWith('kh-chat-ui-') || !fixture.users.every(user => user.email.startsWith(fixture.runId) && user.email.endsWith('@example.invalid'))) throw new Error('Invalid fixture ownership.');
    if (process.argv.includes('--reply')) {
      const seller = await login(fixture.users.find(user => user.role === 'seller'));
      const conversations = await rpc(seller, 'kh_list_conversations', { p_actor_id: seller.id });
      const chat = conversations.find(item => item.propertyId === fixture.propertyId);
      if (!chat) throw new Error('Start and send a browser message first.');
      await rpc(seller, 'kh_send_message', { p_actor_id: seller.id, p_conversation_id: chat.id, p_client_message_id: randomUUID(), p_body: 'Hola, gracias por tu interés. La vivienda sigue disponible y podemos conversar por aquí.' });
      console.log('Reply saved for the synthetic buyer.');
    } else if (process.argv.includes('--status')) {
      const buyer = await login(fixture.users.find(user => user.role === 'buyer'));
      const conversations = await rpc(buyer, 'kh_list_conversations', { p_actor_id: buyer.id });
      console.log(JSON.stringify(conversations.map(chat => ({ id: chat.id, unread: chat.unreadCount, lastSeq: chat.lastSeq, blockedByMe: chat.blockedByMe, canSend: chat.canSend }))));
    } else if (process.argv.includes('--cleanup')) {
      const ids = fixture.users.map(user => user.id);
      await db.query('delete from public.kh_message_reports where reporter_id = any($1::uuid[]) or reported_user_id = any($1::uuid[])', [ids]);
      if (fixture.paths.length) await request('/storage/v1/object/property-photos', { method: 'DELETE', admin: true, body: { prefixes: fixture.paths } });
      for (const user of fixture.users) await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', admin: true });
      const remaining = (await db.query('select count(*)::int count from auth.users where email like $1', [fixture.runId + '%'])).rows[0].count;
      if (remaining) throw new Error('Messaging fixture cleanup incomplete.');
      unlinkSync(fixturePath);
      console.log('All temporary messaging accounts, reports, conversations, listing and photos removed.');
    } else throw new Error('Use --create, --reply, --status or --cleanup.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.end(); }
