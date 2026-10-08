import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {setTimeout as pollDelay} from 'node:timers/promises';
import {Client} from 'pg';
import {fixtureDatabaseUrl} from './agency-env.mjs';

// Read only the explicitly named, loopback pre-agency fixture. All committed race
// data lives in a fresh clone, which is dropped after both test sessions close.
const source = fixtureDatabaseUrl();
const sourceName = source.pathname.slice(1);
const scratchName = `kh_agency_test_origin_race_${randomUUID().replaceAll('-', '')}`;
const quoted = name => `"${name.replaceAll('"', '""')}"`;
const owner = '45000000-0000-4000-8000-000000000001';
const buyer = '45000000-0000-4000-8000-000000000002';
const propertyId = randomUUID();
const collaboratorId = randomUUID();
const publicationRequest = randomUUID();
const photoPath = `${owner}/${publicationRequest}/photo.jpg`;
const pair = `kh:chat:pair:${owner}:${buyer}`;

async function inventory(client) {
  const tables = (await client.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;
  const result = [];
  for (const {schemaname, tablename} of tables) {
    const {rows: [state]} = await client.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) hash from ${quoted(schemaname)}.${quoted(tablename)} t`);
    result.push({schemaname, tablename, ...state});
  }
  return result;
}

async function sourceInventory() {
  const client = new Client({connectionString: source.href});
  await client.connect();
  try {
    assert.equal((await client.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t, null, 'use a pre-agency fixture baseline');
    return await inventory(client);
  } finally {
    await client.end();
  }
}

// The condition proves contact reached the pair barrier after its first origin
// check and before its property SHARE lock. The deadline is only a failure bound.
async function waitForPairBarrier(observer, waitingPid, blockingPid) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const {rows: [state]} = await observer.query(
      "select $2::int=any(pg_blocking_pids($1::int)) blocked,exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) advisory_wait",
      [waitingPid, blockingPid],
    );
    if (state.blocked && state.advisory_wait) return;
    await pollDelay(10);
  }
  throw Error('Contact did not reach the explicit pair-lock barrier');
}

const before = await sourceInventory();
const admin = new Client({connectionString: new URL('/postgres', source).href});
await admin.connect();
let created = false;
let contact;
let attribution;
let contactOutcome;
try {
  assert.equal((await admin.query('select 1 from pg_database where datname=$1', [scratchName])).rowCount, 0);
  await admin.query(`create database ${quoted(scratchName)} template ${quoted(sourceName)}`);
  created = true;
  const connectionString = new URL(`/${scratchName}`, source).href;
  attribution = new Client({connectionString});
  contact = new Client({connectionString});
  await attribution.connect();
  await contact.connect();
  await attribution.query("set statement_timeout='15s'");
  await contact.query("set statement_timeout='15s'");
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(f => /^20261007000[123]00_.*\.sql$/.test(f)).sort()) {
    await attribution.query(await readFile(new URL(file, migrations), 'utf8'));
  }
  await attribution.query('begin');
  await attribution.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql', import.meta.url), 'utf8'));
  const agencyId = (await attribution.query('select pg_temp.kh_agency_signup(19) id')).rows[0].id;
  await attribution.query('select pg_temp.kh_agency_approve($1)', [agencyId]);
  await attribution.query('select pg_temp.kh_as($1)', [owner]);
  await attribution.query('update kh_private.assisted_listing_settings set official_publisher_id=$1', [owner]);
  await attribution.query("insert into storage.objects(bucket_id,name) values('property-photos',$1)", [photoPath]);
  await attribution.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths) values($1,$2,$3,'Assisted contact race','Vedado','La Habana','Casa',30000,2,1,'Fixture for concurrent assisted attribution.','approved',$4)", [propertyId, owner, publicationRequest, [photoPath]]);
  await attribution.query("insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel) values($1,'agency','Race agency','Private fixture','email')", [collaboratorId]);
  await attribution.query("insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at) values($1,$2,'RACE-1','email',now(),'Explicit consent for this fixture property.','1',now(),'Fixture evidence',$3,now())", [propertyId, collaboratorId, owner]);
  await attribution.query('commit');

  const contactPid = (await contact.query('select pg_backend_pid() id')).rows[0].id;
  const attributionPid = (await attribution.query('select pg_backend_pid() id')).rows[0].id;
  // A session advisory lock survives the attribution COMMIT until explicitly released.
  await attribution.query('select pg_advisory_lock(hashtextextended($1,0))', [pair]);
  await contact.query('begin');
  await contact.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [buyer, JSON.stringify({sub:buyer,role:'authenticated'})]);
  contactOutcome = contact.query('select public.kh_start_conversation($1,$2)', [propertyId, buyer]).then(value => ({value}), error => ({error}));
  await waitForPairBarrier(attribution, contactPid, attributionPid);

  await attribution.query('begin');
  await attribution.query('select pg_temp.kh_as($1)', [owner]);
  await attribution.query('select public.kh_admin_link_assisted_agency($1,$2)', [owner, {
    agencyId, propertyId, collaboratorId, expectedCollaboratorVersion:1, expectedPropertyVersion:1,
    sourceReference:'RACE-1', consentReference:'Explicit fixture consent', evidenceReference:'Confirmed fixture link', clientRequestId:randomUUID(),
  }]);
  await attribution.query('commit');
  await attribution.query('select pg_advisory_unlock(hashtextextended($1,0))', [pair]);
  const result = await contactOutcome;
  assert.match(result.error?.message ?? 'CONTACT_RETURNED_PERSONAL_CONVERSATION', /KH_AGENCY_CONTEXT_REQUIRED/);
  await contact.query('rollback');
  assert.equal((await attribution.query('select count(*)::int n from public.kh_conversations where property_id=$1', [propertyId])).rows[0].n, 0);
  console.log('PASS contact_vs_assisted_attribution (explicit pg_blocking_pids barrier; no personal conversation)');
} finally {
  if (attribution) {
    await attribution.query('rollback').catch(() => {});
    await attribution.query('select pg_advisory_unlock_all()').catch(() => {});
  }
  if (contactOutcome) await contactOutcome;
  if (contact) {
    await contact.query('rollback').catch(() => {});
    await contact.end();
  }
  if (attribution) await attribution.end();
  if (created) await admin.query(`drop database ${quoted(scratchName)}`);
  await admin.end();
  assert.deepEqual(await sourceInventory(), before, 'source fixture inventory must remain exact');
  console.log('CLEANUP scratchDropped:true, sourceInventoryUnchanged:true');
}
