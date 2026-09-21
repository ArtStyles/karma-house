// Explicit browser-QA fixture. No signup, invitation, recovery or email API is used.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const fixturePath = new URL('artifacts/account-listing-ui-fixture.json', root);
const marker = 'karmahouse-account-listing-ui-v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const runPrefix = 'kh-account-listing-ui-';
const roles = ['owner', 'intruder'];
const buckets = ['property-photos', 'account-avatars'];
const inventoryTables = [
  'public.profiles', 'public.properties', 'public.favorites', 'public.kh_admins',
  'kh_private.admin_invites', 'kh_private.property_save_requests', 'kh_private.account_avatars',
  'storage.objects', 'public.kh_conversations', 'public.kh_messages',
  'public.kh_conversation_reads', 'public.kh_user_blocks', 'public.kh_message_reports',
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
    const temporaryPath = new URL('artifacts/account-listing-ui-fixture.json.tmp', root);
    writeFileSync(temporaryPath, JSON.stringify(fixture), { mode: 0o600 });
    renameSync(temporaryPath, fixturePath);
  }
}

function validate(fixture) {
  requireFixture(fixture?.marker === marker && fixture.schemaVersion === 1, 'Invalid fixture marker.');
  requireFixture(typeof fixture.runId === 'string' && fixture.runId.startsWith(runPrefix)
    && uuidPattern.test(fixture.runId.slice(runPrefix.length)), 'Invalid fixture run UUID.');
  requireFixture(Array.isArray(fixture.users) && fixture.users.length === 2, 'Expected two fixture users.');
  requireFixture(new Set(fixture.users.map(user => user.role)).size === 2, 'Duplicate fixture role.');
  for (const user of fixture.users) {
    requireFixture(roles.includes(user.role)
      && user.email === `${fixture.runId}-${user.role}@example.invalid`
      && (user.id === null || uuidPattern.test(user.id)), 'Invalid fixture user identity.');
  }
  const ids = fixture.users.map(user => user.id).filter(Boolean);
  requireFixture(new Set(ids).size === ids.length, 'Duplicate fixture user UUID.');
  requireFixture(fixture.propertyId === null || uuidPattern.test(fixture.propertyId), 'Invalid fixture property UUID.');
  requireFixture(fixture.baseline && inventoryTables.every(table => Number.isInteger(fixture.baseline[table]?.count)
    && /^[0-9a-f]{32}$/.test(fixture.baseline[table]?.digest)), 'Missing preservation inventory.');
}

async function request(path, { method = 'GET', body, token, admin = false, binary = false } = {}) {
  const key = admin ? privateConfig.SUPABASE_SECRET_KEY : publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(origin + path, {
    method, signal: AbortSignal.timeout(30000),
    headers: {
      apikey: key, ...(token || admin ? { Authorization: `Bearer ${token ?? key}` } : {}),
      'Content-Type': binary ? 'image/png' : 'application/json',
      'User-Agent': 'KarmaHouse-AccountListing-QA/1.0',
      ...(binary ? { 'x-upsert': 'false' } : {}),
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = null; }
  requireFixture(response.ok, `Fixture API request failed (HTTP ${response.status}).`);
  return data;
}

async function inventory() {
  const result = {};
  for (const table of inventoryTables) {
    result[table] = (await db.query(`select count(*)::int count,
      md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from ${table} t`)).rows[0];
  }
  return result;
}

// Resolve all identities before any destructive action. Exact planned emails also
// recover accounts if creation succeeded but its response/local save was interrupted.
async function resolveUsers(fixture) {
  const resolved = [];
  for (const user of fixture.users) {
    const rows = (await db.query(`select id,email,raw_user_meta_data from auth.users
      where email=$1 or id=$2::uuid`, [user.email, user.id])).rows;
    requireFixture(rows.length <= 1, 'Fixture UUID and email refer to different accounts.');
    const actual = rows[0];
    if (actual) {
      requireFixture(actual.email === user.email && (!user.id || actual.id === user.id)
        && actual.raw_user_meta_data?.qa_fixture === marker
        && actual.raw_user_meta_data?.qa_run_id === fixture.runId
        && actual.raw_user_meta_data?.qa_role === user.role, 'Auth fixture ownership could not be verified.');
      resolved.push({ ...user, id: actual.id, exists: true });
    } else {
      resolved.push({ ...user, exists: false });
    }
  }
  return resolved;
}

async function storageObjects(ids) {
  return (await db.query(`select bucket_id,name from storage.objects
    where bucket_id=any($1::text[]) and split_part(name,'/',1)=any($2::text[]) order by bucket_id,name`, [buckets, ids])).rows;
}

async function assertPropertyOwnership(fixture, ids) {
  if (!fixture.propertyId) return;
  const property = (await db.query('select owner_id,client_request_id from public.properties where id=$1', [fixture.propertyId])).rows[0];
  requireFixture(!property || (ids.includes(property.owner_id) && property.client_request_id === fixture.runId),
    'Fixture property does not belong to this run.');
}

try {
  const flags = process.argv.slice(2);
  requireFixture(flags.length === 1 && ['--create', '--status', '--cleanup'].includes(flags[0]),
    'Use exactly one of --create, --status or --cleanup.');
  stage = 'connect';
  await db.connect();
  if (flags[0] === '--create') {
    requireFixture(!existsSync(fixturePath), 'Clean up the previous account/listing fixture first.');
    stage = 'prerequisites';
    const columns = (await db.query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='properties' and column_name=any($1::text[])`,
    [['condition', 'floor', 'price_negotiable']])).rows;
    requireFixture(columns.length === 3, 'Apply the listing-details migration before creating this fixture.');
    const avatarBucket = (await db.query("select public from storage.buckets where id='account-avatars'")).rows[0];
    requireFixture(avatarBucket && avatarBucket.public === false, 'Apply the private account-avatar migration first.');
    const runId = `${runPrefix}${randomUUID()}`;
    const fixture = {
      marker, schemaVersion: 1, runId, createdAt: new Date().toISOString(), propertyId: null,
      baseline: await inventory(),
      users: roles.map(role => ({ id: null, role, email: `${runId}-${role}@example.invalid`, password: `Kh!${randomBytes(24).toString('base64url')}` })),
    };
    save(fixture, true);
    stage = 'create_users';
    for (const user of fixture.users) {
      const created = await request('/auth/v1/admin/users', { method: 'POST', admin: true, body: {
        email: user.email, password: user.password, email_confirm: true,
        user_metadata: { display_name: user.role === 'owner' ? 'Laura · Prueba de perfil' : 'Daniel · Prueba aislada',
          qa_fixture: marker, qa_run_id: runId, qa_role: user.role },
      } });
      requireFixture(uuidPattern.test(created?.id), 'Auth did not return a valid fixture UUID.');
      user.id = created.id; save(fixture);
    }
    const identities = await resolveUsers(fixture);
    requireFixture(identities.every(user => user.exists), 'A fixture account is missing.');
    const admins = (await db.query('select count(*)::int count from public.kh_admins where user_id=any($1::uuid[])',
      [identities.map(user => user.id)])).rows[0].count;
    requireFixture(admins === 0, 'Fixture accounts must not have administrator roles.');
    const owner = fixture.users.find(user => user.role === 'owner');
    const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: owner.email, password: owner.password } });
    requireFixture(session?.user?.id === owner.id && session.access_token, 'Fixture login returned a different account.');
    stage = 'create_property';
    const photoPath = `${owner.id}/${runId}/photo.png`;
    await request(`/storage/v1/object/property-photos/${photoPath}`, { method: 'POST', token: session.access_token,
      body: readFileSync(new URL('assets/images/vedado-demo.png', root)), binary: true });
    const property = await request('/rest/v1/rpc/kh_save_property', { method: 'POST', token: session.access_token, body: { p_payload: {
      ownerId: owner.id, clientRequestId: runId, title: 'Vivienda temporal · Perfil y filtros',
      location: 'Vedado', province: 'La Habana', type: 'Apartamento', price: 10000, area: 80, bedrooms: 2, bathrooms: 1,
      condition: 'good', floor: 2, priceNegotiable: true, amenities: ['Patio'], photoPaths: [photoPath], moderation: 'pending',
      description: 'Anuncio ficticio temporal para comprobar perfil, publicación y filtros de KarmaHouse. Se eliminará al finalizar la prueba.',
      mapLocation: { latitude: 23.13587, longitude: -82.395, precision: 'approximate' },
    } } });
    requireFixture(uuidPattern.test(property?.id), 'Property creation did not return a valid UUID.');
    fixture.propertyId = property.id; save(fixture);
    // Administrative SQL is restricted to the exact listing created by this run.
    const approved = (await db.query(`update public.properties set moderation='approved',availability='active',
      review_note=null,version=version+1,updated_at=now() where id=$1 and owner_id=$2 and client_request_id=$3
      and moderation='pending' returning id,price,condition,floor,price_negotiable`, [property.id, owner.id, runId])).rows[0];
    requireFixture(approved && Number(approved.price) === 10000 && approved.condition === 'good'
      && approved.floor === 2 && approved.price_negotiable === true, 'Fixture listing details were not persisted correctly.');
    console.log(JSON.stringify({ result: 'account_listing_fixture_ready', runId, propertyId: property.id,
      users: fixture.users.map(({ id, role, email }) => ({ id, role, email })),
      credentialsFile: 'artifacts/account-listing-ui-fixture.json' }));
  } else {
    stage = 'validate_fixture';
    requireFixture(existsSync(fixturePath), 'No account/listing fixture is recorded locally.');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    validate(fixture);
    if (flags[0] === '--status') await db.query('begin read only');
    const users = await resolveUsers(fixture);
    const ids = users.map(user => user.id).filter(Boolean);
    await assertPropertyOwnership(fixture, ids);
    if (flags[0] === '--status') {
      const profiles = (await db.query(`select p.id,p.display_name,a.avatar_path from public.profiles p
        left join kh_private.account_avatars a on a.owner_id=p.id where p.id=any($1::uuid[])`, [ids])).rows;
      const properties = (await db.query(`select id,owner_id,title,province,type,price,area,bedrooms,bathrooms,
        condition,floor,price_negotiable,amenities,moderation,availability,version from public.properties
        where owner_id=any($1::uuid[]) order by id`, [ids])).rows;
      const objects = await storageObjects(ids);
      await db.query('rollback');
      console.log(JSON.stringify({ result: 'account_listing_fixture_status', runId: fixture.runId,
        users: users.map(({ id, role, email, exists }) => ({ id, role, email, exists })), profiles, properties,
        storage: buckets.map(bucket => ({ bucket, count: objects.filter(object => object.bucket_id === bucket).length })) }));
    } else {
      stage = 'cleanup_validate';
      const objects = await storageObjects(ids);
      const existingIds = users.filter(user => user.exists).map(user => user.id);
      requireFixture(objects.every(object => existingIds.includes(object.name.split('/')[0])),
        'Storage ownership cannot be revalidated because a fixture Auth account is missing.');
      // Refuse deleting conversations or reports involving a real account.
      const crossAccountData = (await db.query(`select
        (select count(*)::int from public.kh_conversations where
          (buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[])) and
          not(buyer_id=any($1::uuid[]) and seller_id=any($1::uuid[]))) +
        (select count(*)::int from public.kh_message_reports where
          (reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[])) and
          not(reporter_id=any($1::uuid[]) and reported_user_id=any($1::uuid[]))) as count`, [ids])).rows[0].count;
      requireFixture(crossAccountData === 0, 'Fixture has interactions with an unrelated account; cleanup stopped.');
      // Persist identities recovered from an interrupted create before deleting anything.
      fixture.users = users.map(({ exists, ...user }) => user); save(fixture);
      stage = 'cleanup_storage';
      for (const bucket of buckets) {
        const prefixes = objects.filter(object => object.bucket_id === bucket).map(object => object.name);
        if (prefixes.length) await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', admin: true, body: { prefixes } });
      }
      stage = 'cleanup_accounts';
      await db.query('delete from public.kh_message_reports where reporter_id=any($1::uuid[]) and reported_user_id=any($1::uuid[])', [ids]);
      for (const user of users.filter(user => user.exists)) await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', admin: true });
      stage = 'cleanup_verify';
      const remaining = (await db.query(`select
        (select count(*)::int from auth.users where id=any($1::uuid[]) or email=any($2::text[])) users,
        (select count(*)::int from public.profiles where id=any($1::uuid[])) profiles,
        (select count(*)::int from public.properties where owner_id=any($1::uuid[])) properties,
        (select count(*)::int from public.favorites where user_id=any($1::uuid[])) favorites,
        (select count(*)::int from public.kh_admins where user_id=any($1::uuid[])) admins,
        (select count(*)::int from kh_private.account_avatars where owner_id=any($1::uuid[])) avatars,
        (select count(*)::int from public.kh_conversations where buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[])) conversations,
        (select count(*)::int from public.kh_messages where sender_id=any($1::uuid[])) messages,
        (select count(*)::int from public.kh_message_reports where reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[])) reports,
        (select count(*)::int from public.kh_user_blocks where blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])) blocks,
        (select count(*)::int from storage.objects where bucket_id=any($3::text[]) and split_part(name,'/',1)=any($4::text[])) objects`,
      [ids, users.map(user => user.email), buckets, ids])).rows[0];
      requireFixture(Object.values(remaining).every(count => count === 0), 'Fixture cleanup has remaining records.');
      const after = await inventory();
      const changedTables = inventoryTables.filter(table => JSON.stringify(after[table]) !== JSON.stringify(fixture.baseline[table]));
      requireFixture(changedTables.length === 0, `Existing data inventory differs in: ${changedTables.join(', ')}. Fixture file retained for review.`);
      unlinkSync(fixturePath);
      console.log(JSON.stringify({ result: 'account_listing_fixture_cleanup_verified', remaining, inventoryUnchanged: true }));
    }
  }
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(JSON.stringify({ result: 'account_listing_fixture_failed', stage,
    message: error instanceof FixtureError ? error.message : 'Operation failed; fixture state is retained for inspection.',
    code: error.code ?? 'ERROR' }));
  process.exitCode = 1;
} finally { await db.end(); }
