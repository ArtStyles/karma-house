// Explicit browser-QA fixture. Only run --cleanup after signing out of its UI accounts.
// Admin Auth creation confirms synthetic accounts without sending any email.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const fixturePath = new URL('artifacts/negotiations-ui-fixture.json', root);
const temporaryPath = new URL('artifacts/negotiations-ui-fixture.json.tmp', root);
const marker = 'karmahouse-negotiations-ui-v1';
const runPrefix = 'kh-negotiations-ui-';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tablePattern = /^(?:(?:public|kh_private)\.[a-z_][a-z0-9_]*|auth\.users|storage\.(?:objects|buckets))$/;
const roles = ['seller', 'buyer', 'outsider'];
const displayNames = { seller: 'Laura · Prueba de visitas', buyer: 'Daniel · Prueba de ofertas', outsider: 'Cuenta ajena · Prueba aislada' };
const buckets = ['property-photos', 'account-avatars'];
const requiredTables = [
  'public.profiles', 'public.properties', 'public.favorites', 'public.kh_admins',
  'kh_private.admin_invites', 'kh_private.property_save_requests', 'kh_private.account_avatars',
  'public.kh_conversations', 'public.kh_messages', 'public.kh_conversation_reads',
  'public.kh_user_blocks', 'public.kh_message_reports', 'public.kh_negotiations',
  'kh_private.negotiation_requests', 'kh_private.negotiation_events',
  'auth.users', 'storage.objects', 'storage.buckets',
];
class FixtureError extends Error {}
const requireFixture = (condition, message) => { if (!condition) throw new FixtureError(message); };
const readEnv = path => Object.fromEntries(readFileSync(new URL(path, root), 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const privateConfig = readEnv('infra/.env.local');
const publicConfig = readEnv('.env.local');
const origin = privateConfig.SUPABASE_URL.replace(/\/$/, '');
const db = createDatabaseClient();
let stage = 'arguments';

function save(fixture, initial = false) {
  if (initial) {
    mkdirSync(new URL('artifacts/', root), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(fixture), { flag: 'wx', mode: 0o600 });
  } else {
    writeFileSync(temporaryPath, JSON.stringify(fixture), { mode: 0o600 });
    renameSync(temporaryPath, fixturePath);
  }
}

function validate(fixture) {
  requireFixture(fixture?.marker === marker && fixture.schemaVersion === 1, 'Invalid fixture marker.');
  requireFixture(typeof fixture.runId === 'string' && fixture.runId.startsWith(runPrefix)
    && uuidPattern.test(fixture.runId.slice(runPrefix.length)), 'Invalid fixture run UUID.');
  requireFixture(Array.isArray(fixture.users) && fixture.users.length === roles.length
    && new Set(fixture.users.map(user => user.role)).size === roles.length, 'Expected three distinct fixture roles.');
  for (const user of fixture.users) {
    requireFixture(roles.includes(user.role) && user.email === `${fixture.runId}-${user.role}@example.invalid`
      && (user.id === null || uuidPattern.test(user.id)), 'Invalid fixture user identity.');
  }
  const ids = fixture.users.map(user => user.id).filter(Boolean);
  requireFixture(new Set(ids).size === ids.length, 'Duplicate fixture user UUID.');
  for (const field of ['propertyId', 'conversationId']) {
    requireFixture(fixture[field] === null || uuidPattern.test(fixture[field]), `Invalid fixture ${field}.`);
  }
  requireFixture(Array.isArray(fixture.inventoryTables) && fixture.inventoryTables.every(table => tablePattern.test(table))
    && new Set(fixture.inventoryTables).size === fixture.inventoryTables.length
    && requiredTables.every(table => fixture.inventoryTables.includes(table)), 'Invalid preservation table list.');
  requireFixture(fixture.baseline && fixture.inventoryTables.every(table => Number.isInteger(fixture.baseline[table]?.count)
    && fixture.baseline[table].count >= 0 && /^[0-9a-f]{32}$/.test(fixture.baseline[table]?.digest)), 'Missing preservation inventory.');
}

async function request(path, { method = 'GET', body, token, admin = false, binary = false } = {}) {
  const key = admin ? privateConfig.SUPABASE_SECRET_KEY : publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(origin + path, {
    method, signal: AbortSignal.timeout(30000),
    headers: {
      apikey: key, ...(token || admin ? { Authorization: `Bearer ${token ?? key}` } : {}),
      'Content-Type': binary ? 'image/png' : 'application/json',
      'User-Agent': 'KarmaHouse-Negotiations-QA/1.0', ...(binary ? { 'x-upsert': 'false' } : {}),
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = null; }
  requireFixture(response.ok, `Fixture API request failed (HTTP ${response.status}).`);
  return data;
}

async function discoverInventoryTables() {
  const rows = (await db.query(`select schemaname||'.'||tablename as name from pg_catalog.pg_tables
    where schemaname in ('public','kh_private') order by schemaname,tablename`)).rows;
  const tables = [...new Set([...rows.map(row => row.name), 'auth.users', 'storage.objects', 'storage.buckets'])].sort();
  requireFixture(tables.every(table => tablePattern.test(table)), 'Unexpected table identifier in preservation scope.');
  requireFixture(requiredTables.every(table => tables.includes(table)), 'Apply the account, listing and negotiations migrations first.');
  return tables;
}

async function inventory(tables) {
  const result = {};
  for (const table of tables) {
    requireFixture(tablePattern.test(table), 'Invalid inventory table identifier.');
    const identifier = table.split('.').map(part => `"${part}"`).join('.');
    result[table] = (await db.query(`select count(*)::int count,
      md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from ${identifier} t`)).rows[0];
  }
  return result;
}

// Resolve every identity before destructive calls. Planned exact emails recover
// an account whose creation committed before its response or local save was lost.
async function resolveUsers(fixture) {
  const resolved = [];
  for (const user of fixture.users) {
    const rows = (await db.query('select id,email,raw_user_meta_data from auth.users where email=$1 or id=$2::uuid',
      [user.email, user.id])).rows;
    requireFixture(rows.length <= 1, 'Fixture UUID and email refer to different accounts.');
    const actual = rows[0];
    if (actual) {
      requireFixture(actual.email === user.email && (!user.id || actual.id === user.id)
        && actual.raw_user_meta_data?.qa_fixture === marker
        && actual.raw_user_meta_data?.qa_run_id === fixture.runId
        && actual.raw_user_meta_data?.qa_role === user.role, 'Auth fixture ownership could not be verified.');
      resolved.push({ ...user, id: actual.id, exists: true });
    } else resolved.push({ ...user, exists: false });
  }
  return resolved;
}

async function login(user) {
  const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password: user.password } });
  requireFixture(session?.user?.id === user.id && typeof session.access_token === 'string', 'Fixture login returned a different account.');
  return session.access_token;
}

async function storageObjects(ids) {
  const objects = (await db.query(`select bucket_id,name from storage.objects
    where split_part(name,'/',1)=any($1::text[]) order by bucket_id,name`, [ids])).rows;
  requireFixture(objects.every(object => buckets.includes(object.bucket_id)), 'Fixture objects exist in an unexpected bucket.');
  return objects;
}

async function validateRelations(fixture, users) {
  const ids = users.map(user => user.id).filter(Boolean);
  const sellerId = users.find(user => user.role === 'seller').id;
  const buyerId = users.find(user => user.role === 'buyer').id;
  const properties = (await db.query(`select id,owner_id,client_request_id from public.properties
    where owner_id=any($1::uuid[]) or id=$2::uuid or client_request_id=$3`, [ids, fixture.propertyId, fixture.runId])).rows;
  requireFixture(properties.length <= 1 && properties.every(property => property.owner_id === sellerId
    && property.client_request_id === fixture.runId && (!fixture.propertyId || property.id === fixture.propertyId)),
  'Fixture property ownership or run identity differs.');
  const propertyId = fixture.propertyId ?? properties[0]?.id ?? null;
  const conversations = (await db.query(`select id,property_id,buyer_id,seller_id from public.kh_conversations
    where buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[]) or property_id=$2::uuid or id=$3::uuid`,
  [ids, propertyId, fixture.conversationId])).rows;
  requireFixture(conversations.length <= 1 && conversations.every(chat => chat.property_id === propertyId
    && chat.buyer_id === buyerId && chat.seller_id === sellerId && (!fixture.conversationId || chat.id === fixture.conversationId)),
  'Fixture conversation has unexpected participants, property or identity.');
  const conversationId = fixture.conversationId ?? conversations[0]?.id ?? null;
  const conversationIds = conversationId ? [conversationId] : [];
  const propertyIds = propertyId ? [propertyId] : [];
  const unrelated = (await db.query(`select
    (select count(*)::int from public.favorites where property_id=any($2::uuid[]) and not(user_id=any($1::uuid[]))) +
    (select count(*)::int from public.kh_messages where
      (sender_id=any($1::uuid[]) or conversation_id=any($3::uuid[])) and
      not(sender_id=any($1::uuid[]) and conversation_id=any($3::uuid[]))) +
    (select count(*)::int from public.kh_conversation_reads where
      (user_id=any($1::uuid[]) or conversation_id=any($3::uuid[])) and
      not(user_id=any($1::uuid[]) and conversation_id=any($3::uuid[]))) +
    (select count(*)::int from public.kh_user_blocks where
      (blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])) and
      not(blocker_id=any($1::uuid[]) and blocked_id=any($1::uuid[]))) +
    (select count(*)::int from public.kh_message_reports where
      (reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[]) or conversation_id=any($3::uuid[])) and
      not(reporter_id=any($1::uuid[]) and reported_user_id=any($1::uuid[]) and conversation_id=any($3::uuid[]))) +
    (select count(*)::int from public.kh_negotiations where
      (created_by=any($1::uuid[]) or conversation_id=any($3::uuid[])) and
      not(created_by=any($1::uuid[]) and conversation_id=any($3::uuid[]))) +
    (select count(*)::int from kh_private.negotiation_requests where
      (actor_id=any($1::uuid[]) or conversation_id=any($3::uuid[])) and
      not(actor_id=any($1::uuid[]) and conversation_id=any($3::uuid[]))) +
    (select count(*)::int from kh_private.negotiation_events e join public.kh_negotiations n on n.id=e.negotiation_id where
      (e.actor_id=any($1::uuid[]) or n.conversation_id=any($3::uuid[])) and
      not(e.actor_id=any($1::uuid[]) and n.conversation_id=any($3::uuid[]))) +
    (select count(*)::int from public.kh_admins where user_id=any($1::uuid[])) as count`,
  [ids, propertyIds, conversationIds])).rows[0].count;
  requireFixture(unrelated === 0, 'Unexpected role or interaction with unrelated data; no cleanup is permitted.');
  return { ids, propertyId, conversationId, propertyIds, conversationIds };
}

try {
  const flags = process.argv.slice(2);
  requireFixture(flags.length === 1 && ['--create', '--status', '--cleanup'].includes(flags[0]),
    'Use exactly one of --create, --status or --cleanup. Sign out of fixture UI accounts before cleanup.');
  stage = 'connect';
  await db.connect();
  if (flags[0] === '--create') {
    requireFixture(!existsSync(fixturePath), 'Clean up the previous negotiations fixture first.');
    stage = 'prerequisites';
    await db.query('begin isolation level repeatable read read only');
    const inventoryTables = await discoverInventoryTables();
    const baseline = await inventory(inventoryTables);
    await db.query('rollback');
    const runId = `${runPrefix}${randomUUID()}`;
    const fixture = { marker, schemaVersion: 1, runId, createdAt: new Date().toISOString(), propertyId: null,
      conversationId: null, inventoryTables, baseline,
      users: roles.map(role => ({ id: null, role, email: `${runId}-${role}@example.invalid`, password: `Kh!${randomBytes(24).toString('base64url')}` })),
    };
    validate(fixture);
    save(fixture, true);
    stage = 'create_users';
    for (const user of fixture.users) {
      const created = await request('/auth/v1/admin/users', { method: 'POST', admin: true, body: {
        email: user.email, password: user.password, email_confirm: true,
        user_metadata: { display_name: displayNames[user.role], qa_fixture: marker, qa_run_id: runId, qa_role: user.role },
      } });
      requireFixture(uuidPattern.test(created?.id), 'Auth did not return a valid fixture UUID.');
      user.id = created.id; save(fixture);
    }
    const users = await resolveUsers(fixture);
    requireFixture(users.every(user => user.exists), 'A fixture account is missing.');
    await validateRelations(fixture, users);
    const seller = users.find(user => user.role === 'seller');
    const buyer = users.find(user => user.role === 'buyer');
    const sellerToken = await login(seller);
    stage = 'create_property';
    const photoPath = `${seller.id}/${runId}/photo.png`;
    await request(`/storage/v1/object/property-photos/${photoPath}`, { method: 'POST', token: sellerToken,
      body: readFileSync(new URL('assets/images/vedado-demo.png', root)), binary: true });
    const property = await request('/rest/v1/rpc/kh_save_property', { method: 'POST', token: sellerToken, body: { p_payload: {
      ownerId: seller.id, clientRequestId: runId, title: 'Vivienda temporal · Visitas y ofertas',
      location: 'Vedado', province: 'La Habana', type: 'Apartamento', price: 65000, area: 120, bedrooms: 3, bathrooms: 2,
      condition: 'good', floor: 2, priceNegotiable: true, amenities: ['Patio'], photoPaths: [photoPath], moderation: 'pending',
      description: 'Anuncio ficticio temporal para comprobar visitas y ofertas entre cuentas sintéticas. Se eliminará al finalizar la prueba.',
      mapLocation: { latitude: 23.13587, longitude: -82.395, precision: 'approximate' },
    } } });
    requireFixture(uuidPattern.test(property?.id), 'Property creation did not return a valid UUID.');
    fixture.propertyId = property.id; save(fixture);
    // Approve only the newly created fixture listing; none of its accounts gains a role.
    const approved = (await db.query(`update public.properties set moderation='approved',availability='active',
      review_note=null,version=version+1,updated_at=now() where id=$1 and owner_id=$2 and client_request_id=$3
      and moderation='pending' returning id`, [property.id, seller.id, runId])).rows[0];
    requireFixture(approved?.id === property.id, 'Fixture listing approval did not match this run.');
    stage = 'create_conversation';
    const buyerToken = await login(buyer);
    const chat = await request('/rest/v1/rpc/kh_start_conversation', { method: 'POST', token: buyerToken,
      body: { p_actor_id: buyer.id, p_property_id: property.id } });
    requireFixture(uuidPattern.test(chat?.id) && chat.buyerId === buyer.id && chat.sellerId === seller.id
      && chat.propertyId === property.id, 'Conversation creation returned unexpected participants.');
    fixture.conversationId = chat.id; save(fixture);
    await validateRelations(fixture, await resolveUsers(fixture));
    const messages = (await db.query('select count(*)::int count from public.kh_messages where conversation_id=$1', [chat.id])).rows[0].count;
    requireFixture(messages === 0, 'The initial fixture conversation must be empty.');
    console.log(JSON.stringify({ result: 'negotiations_fixture_ready', runId, propertyId: property.id, conversationId: chat.id,
      users: fixture.users.map(({ id, role }) => ({ id, role })),
      credentialsFile: 'artifacts/negotiations-ui-fixture.json', cleanupPrerequisite: 'Sign out of the fixture UI accounts first.' }));
  } else {
    stage = 'validate_fixture';
    requireFixture(existsSync(fixturePath), 'No negotiations fixture is recorded locally.');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    validate(fixture);
    await db.query('begin isolation level repeatable read read only');
    const tables = await discoverInventoryTables();
    requireFixture(JSON.stringify(tables) === JSON.stringify(fixture.inventoryTables), 'Inventory schema changed during QA; inspect before cleanup.');
    const users = await resolveUsers(fixture);
    const scope = await validateRelations(fixture, users);
    const objects = await storageObjects(scope.ids);
    if (flags[0] === '--status') {
      const properties = (await db.query(`select id,owner_id,title,moderation,availability,version from public.properties
        where id=any($1::uuid[])`, [scope.propertyIds])).rows;
      const conversations = (await db.query(`select id,property_id,buyer_id,seller_id,last_seq from public.kh_conversations
        where id=any($1::uuid[])`, [scope.conversationIds])).rows;
      const negotiations = (await db.query(`select id,conversation_id,created_by,kind,status,version,amount_usd,
        visit_date::text,visit_time::text,visit_at,parent_id,expires_at,created_at,updated_at,
        case when status='pending' and expires_at<=now() then 'expired' else status end as effective_status
        from public.kh_negotiations where conversation_id=any($1::uuid[]) order by created_at,id`, [scope.conversationIds])).rows;
      const counts = (await db.query(`select
        (select count(*)::int from public.kh_messages where conversation_id=any($1::uuid[])) messages,
        (select count(*)::int from kh_private.negotiation_requests where conversation_id=any($1::uuid[])) receipts,
        (select count(*)::int from kh_private.negotiation_events e join public.kh_negotiations n on n.id=e.negotiation_id
          where n.conversation_id=any($1::uuid[])) events`, [scope.conversationIds])).rows[0];
      await db.query('rollback');
      console.log(JSON.stringify({ result: 'negotiations_fixture_status', runId: fixture.runId,
        users: users.map(({ id, role, exists }) => ({ id, role, exists })), properties, conversations, negotiations, counts,
        storage: buckets.map(bucket => ({ bucket, count: objects.filter(object => object.bucket_id === bucket).length })) }));
    } else {
      stage = 'cleanup_validate';
      const existingIds = users.filter(user => user.exists).map(user => user.id);
      requireFixture(objects.every(object => existingIds.includes(object.name.split('/')[0])),
        'Storage ownership cannot be revalidated because a fixture Auth account is missing.');
      const foreignPhotoReferences = (await db.query(`select count(*)::int count from public.properties
        where not(owner_id=any($1::uuid[])) and photo_paths && $2::text[]`,
      [scope.ids, objects.filter(object => object.bucket_id === 'property-photos').map(object => object.name)])).rows[0].count;
      requireFixture(foreignPhotoReferences === 0, 'An unrelated listing references fixture storage; cleanup stopped.');
      await db.query('rollback');
      // Save recovered IDs before any deletion so an interrupted cleanup remains identifiable.
      fixture.users = users.map(({ exists, ...user }) => user);
      fixture.propertyId = scope.propertyId; fixture.conversationId = scope.conversationId; save(fixture);
      stage = 'cleanup_storage';
      for (const bucket of buckets) {
        const names = objects.filter(object => object.bucket_id === bucket).map(object => object.name);
        for (let start = 0; start < names.length; start += 100) {
          await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', admin: true, body: { prefixes: names.slice(start, start + 100) } });
        }
      }
      stage = 'cleanup_accounts';
      await db.query(`delete from public.kh_message_reports where reporter_id=any($1::uuid[])
        and reported_user_id=any($1::uuid[]) and conversation_id=any($2::uuid[])`, [scope.ids, scope.conversationIds]);
      for (const user of users.filter(user => user.exists)) {
        // Revalidate each still-existing account immediately before its exact-ID deletion.
        const currentUsers = await resolveUsers(fixture);
        requireFixture(currentUsers.some(current => current.role === user.role && current.id === user.id && current.exists),
          'Fixture account changed during cleanup.');
        await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', admin: true });
      }
      stage = 'cleanup_verify';
      await db.query('begin isolation level repeatable read read only');
      const remaining = (await db.query(`select
        (select count(*)::int from auth.users where id=any($1::uuid[]) or email=any($2::text[])) users,
        (select count(*)::int from public.profiles where id=any($1::uuid[])) profiles,
        (select count(*)::int from public.properties where owner_id=any($1::uuid[]) or id=any($3::uuid[])) properties,
        (select count(*)::int from public.favorites where user_id=any($1::uuid[]) or property_id=any($3::uuid[])) favorites,
        (select count(*)::int from public.kh_admins where user_id=any($1::uuid[])) admins,
        (select count(*)::int from kh_private.account_avatars where owner_id=any($1::uuid[])) avatars,
        (select count(*)::int from public.kh_conversations where buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[]) or id=any($4::uuid[])) conversations,
        (select count(*)::int from public.kh_messages where sender_id=any($1::uuid[]) or conversation_id=any($4::uuid[])) messages,
        (select count(*)::int from public.kh_conversation_reads where user_id=any($1::uuid[]) or conversation_id=any($4::uuid[])) reads,
        (select count(*)::int from public.kh_user_blocks where blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])) blocks,
        (select count(*)::int from public.kh_message_reports where reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[]) or conversation_id=any($4::uuid[])) reports,
        (select count(*)::int from public.kh_negotiations where created_by=any($1::uuid[]) or conversation_id=any($4::uuid[])) negotiations,
        (select count(*)::int from kh_private.negotiation_requests where actor_id=any($1::uuid[]) or conversation_id=any($4::uuid[])) receipts,
        (select count(*)::int from kh_private.negotiation_events where actor_id=any($1::uuid[])) events,
        (select count(*)::int from storage.objects where split_part(name,'/',1)=any($5::text[])) objects`,
      [scope.ids, users.map(user => user.email), scope.propertyIds, scope.conversationIds, scope.ids])).rows[0];
      requireFixture(Object.values(remaining).every(count => count === 0), 'Fixture cleanup has remaining records.');
      const after = await inventory(fixture.inventoryTables);
      await db.query('rollback');
      const changedTables = fixture.inventoryTables.filter(table => JSON.stringify(after[table]) !== JSON.stringify(fixture.baseline[table]));
      requireFixture(changedTables.length === 0, `Existing data inventory differs in: ${changedTables.join(', ')}. Fixture file retained for review.`);
      unlinkSync(fixturePath);
      console.log(JSON.stringify({ result: 'negotiations_fixture_cleanup_verified', remaining, inventoryUnchanged: true }));
    }
  }
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(JSON.stringify({ result: 'negotiations_fixture_failed', stage,
    message: error instanceof FixtureError ? error.message : 'Operation failed; fixture state is retained for inspection.',
    code: typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'ERROR' }));
  process.exitCode = 1;
} finally { await db.end(); }
