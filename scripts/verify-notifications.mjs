import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
import { inventory, version, sha256 } from './apply-notifications.mjs';

function databaseClient() {
  const client = createDatabaseClient();
  // pg emits idle socket failures separately from query rejection; keep cleanup reachable.
  client.on('error', () => {});
  return client;
}
const db = databaseClient();
const buyer = '77100000-0000-4000-8000-000000000001';
const seller = '77100000-0000-4000-8000-000000000002';
const other = '77100000-0000-4000-8000-000000000003';
const propertyId = '77100000-0000-4000-8000-000000000004';
let stage = 'connect';
let cleanupNeeded = false;
let baseline;
const checks = [];
async function actorSession(actor) {
  const client = databaseClient();
  try {
    await client.connect();
    await client.query('begin');
    await client.query("set local statement_timeout='20s'");
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [actor, JSON.stringify({sub:actor,role:'authenticated'})]);
    return client;
  } catch (error) { await client.end().catch(() => {}); throw error; }
}
async function actorQuery(actor, sql, parameters) {
  const client = await actorSession(actor);
  try {
    const result = (await client.query(sql, parameters)).rows[0]?.result;
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { await client.end(); }
}
const sendSql = 'select public.kh_send_message($1,$2,$3,$4) as result';
const summary = () => actorQuery(seller, 'select public.kh_notification_summary($1) as result', [seller]);
const capture = promise => promise.then(value => ({value}), error => ({error}));
async function outcome(pending) {
  const result = await pending;
  if (result.error) throw result.error;
  return result.value;
}
async function observeLock(client) {
  const pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
  return async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await db.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1", [pid])).rows[0]?.waiting) return;
      await new Promise(done => setTimeout(done, 50));
    }
    throw new Error('Expected query did not wait for recipient serialization.');
  };
}
try {
  await db.connect();
  const applied = (await db.query('select sha256 from supabase_migrations.karmahouse_migration_checksums where version=$1', [version])).rows[0];
  assert.equal(applied?.sha256, sha256, 'Deployed notifications checksum differs.');
  const acl = (await db.query("select has_function_privilege('anon','public.kh_notification_summary(uuid)','EXECUTE') as anon_summary,has_function_privilege('authenticated','public.kh_notification_summary(uuid)','EXECUTE') as member_summary,has_table_privilege('authenticated','kh_private.notifications','SELECT') as direct_select,has_function_privilege('authenticated','kh_private.chat_store_message(uuid,uuid,text,uuid,uuid)','EXECUTE') as private_source")).rows[0];
  assert.deepEqual(acl, {anon_summary:false,member_summary:true,direct_select:false,private_source:false});
  checks.push('deployed checksum and private grants');
  baseline = await inventory(db);
  writeFileSync(new URL('../docs/notifications-concurrency-baseline.json',import.meta.url),JSON.stringify(baseline));
  if (process.argv.includes('--exercise')) {
    assert.equal(baseline.fixtureUsers, 0, 'Reserved fixtures already exist.');
    cleanupNeeded = true;
    stage = 'fixtures';
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'kh-notice-race-buyer@example.invalid','{}'),($2,'kh-notice-race-seller@example.invalid','{}'),($3,'kh-notice-race-other@example.invalid','{}')", [buyer,seller,other]);
    await db.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values($1,$2,'notice-concurrency','Casa de avisos concurrentes','Vedado','La Habana','Casa','Anuncio ficticio para probar concurrencia de avisos.',10000,80,2,1,$3,'approved')", [propertyId,seller,['synthetic/notification.jpg']]);
    const conversation = await actorQuery(buyer, 'select public.kh_start_conversation($1,$2) as result', [propertyId,buyer]);
    const otherConversation = await actorQuery(other, 'select public.kh_start_conversation($1,$2) as result', [propertyId,other]);
    stage = 'same_message_request';
    const request = randomUUID();
    const repeated = await Promise.all([
      actorQuery(buyer,sendSql,[conversation.id,request,'Prueba de reintento',buyer]),
      actorQuery(buyer,sendSql,[conversation.id,request,'Prueba de reintento',buyer]),
    ]);
    assert.deepEqual(repeated[0], repeated[1]);
    assert.equal((await summary()).unreadCount, 1);
    checks.push('simultaneous identical message requests emit one notification');

    stage = 'serialized_recipient_and_read_cutoff';
    const before = await summary();
    await actorQuery(seller, 'select public.kh_read_notifications_through($1,$2) as result', [seller,before.readThrough]);
    const first = await actorSession(buyer);
    const second = await actorSession(other);
    const reader = await actorSession(seller);
    try {
      const awaitSecondLock = await observeLock(second);
      const awaitReaderLock = await observeLock(reader);
      await first.query(sendSql, [conversation.id,randomUUID(),'Primero sin confirmar',buyer]);
      const secondSend = capture(second.query(sendSql, [otherConversation.id,randomUUID(),'Segundo sin confirmar',other]));
      // Await explicitly so evidence really observes lock contention before committing.
      await awaitSecondLock();
      assert.equal((await summary()).readThrough, before.readThrough, 'Uncommitted sequence must be invisible.');
      await first.query('commit');
      await outcome(secondSend);
      const cutoff = await summary();
      assert.equal(cutoff.unreadCount, 1, 'Only the first committed notice is visible.');
      const marking = capture(reader.query('select public.kh_read_notifications_through($1,$2) as result', [seller,cutoff.readThrough]));
      await awaitReaderLock();
      await second.query('commit');
      const marked = (await outcome(marking)).rows[0].result;
      await reader.query('commit');
      assert.equal(marked.unreadCount, 1, 'Commit after captured cutoff remains unread.');
      const after = await summary();
      assert(BigInt(after.readThrough)>BigInt(cutoff.readThrough));
      checks.push('different senders serialize before sequence allocation; uncommitted rows invisible');
      checks.push('mark-all waiting on recipient lock preserves newer committed notice');
    } finally {
      for (const client of [first,second,reader]) {
        await client.query('rollback').catch(() => {});
        await client.end();
      }
    }

    stage = 'preference_concurrency';
    const settings = [
      {messages:false,visits:true,offers:true,expectedVersion:0},
      {messages:true,visits:false,offers:true,expectedVersion:0},
    ];
    const results = await Promise.allSettled(settings.map(input => actorQuery(seller,
      'select public.kh_save_notification_preferences($1,$2::jsonb) as result',[seller,JSON.stringify(input)])));
    assert.equal(results.filter(result => result.status==='fulfilled').length, 1);
    const rejected = results.find(result => result.status==='rejected');
    assert.match(rejected.reason.message,/KH_NOTIFICATION_PREFERENCES_CONFLICT/);
    const winningIndex = results.findIndex(result => result.status==='fulfilled');
    assert.deepEqual(await actorQuery(seller,'select public.kh_save_notification_preferences($1,$2::jsonb) as result',
      [seller,JSON.stringify(settings[winningIndex])]), results[winningIndex].value);
    checks.push('concurrent preference changes have one winner; lost ACK retry remains idempotent');

    stage = 'preferences_confirmed_during_send_wait';
    await actorQuery(seller,'select public.kh_save_notification_preferences($1,$2::jsonb) as result',
      [seller,JSON.stringify({messages:true,visits:true,offers:true,expectedVersion:1})]);
    const preferenceWriter = await actorSession(seller);
    const waitingSender = await actorSession(buyer);
    try {
      const awaitSenderLock = await observeLock(waitingSender);
      const beforePreference = await summary();
      await preferenceWriter.query('select public.kh_save_notification_preferences($1,$2::jsonb) as result',
        [seller,JSON.stringify({messages:false,visits:true,offers:true,expectedVersion:2})]);
      const waitingSend = capture(waitingSender.query(sendSql,[conversation.id,randomUUID(),'Mensaje después de preferencia',buyer]));
      await awaitSenderLock();
      await preferenceWriter.query('commit');
      await outcome(waitingSend);
      await waitingSender.query('commit');
      assert.deepEqual(await summary(),beforePreference,'Preference confirmed during wait must suppress the future notice.');
      checks.push('message waiting on recipient lock uses newly confirmed preferences');
    } finally {
      for (const client of [preferenceWriter,waitingSender]) {
        await client.query('rollback').catch(() => {});
        await client.end();
      }
    }
  }
  stage = 'anonymous_rest';
  const env = Object.fromEntries(readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/)
    .filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
  const response = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/kh_notification_summary`, {
    method:'POST',headers:{apikey:env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({p_actor_id:seller}),signal:AbortSignal.timeout(20000),
  });
  assert([401,403].includes(response.status),'Anonymous REST notifications must be denied.');
  checks.push('anonymous REST denied');
} catch (error) {
  console.error(JSON.stringify({result:'notifications_verification_failed',stage,code:error.code??'ERROR',message:error.message}));
  process.exitCode = 1;
} finally {
  try {
    const cleanup = databaseClient();
    try {
      await cleanup.connect();
      if (cleanupNeeded) await cleanup.query('delete from auth.users where id=any($1::uuid[])',[[buyer,seller,other]]);
      if (baseline) {
        const after = await inventory(cleanup);
        assert.deepEqual(after,baseline,'Fixture cleanup or baseline conservation failed.');
        console.log(JSON.stringify({result:process.exitCode?'notifications_failed_cleaned':'notifications_verified',version,sha256,checks,inventory:after}));
      }
    } finally { await cleanup.end().catch(() => {}); }
  } catch (error) {
    console.error(JSON.stringify({result:'notifications_cleanup_failed',message:error.message}));
    process.exitCode=1;
  }
  await db.end();
}
