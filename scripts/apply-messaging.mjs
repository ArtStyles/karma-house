import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';
const version='20260918000100';
const migration=readFileSync(new URL(`../supabase/migrations/${version}_messaging.sql`,import.meta.url),'utf8');
const sha256=createHash('sha256').update(migration).digest('hex');
const regression=readFileSync(new URL('../supabase/tests/messaging.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^rollback;\s*$/m,'');
const db=createDatabaseClient();
const baseTables=[['public','profiles'],['public','properties'],['public','favorites'],['public','kh_admins'],['kh_private','admin_invites'],['kh_private','property_save_requests'],['storage','objects']];
const chatTables=['kh_conversations','kh_messages','kh_conversation_reads','kh_user_blocks','kh_message_reports'];
let stage='connect';
async function inventory(){
  const result={};
  for(const [schema,table] of baseTables){
    const query=`select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from ${schema}.${table} t`;
    result[`${schema}.${table}`]=(await db.query(query)).rows[0];
  }
  result.fixtureUsers=(await db.query("select count(*)::int as count from auth.users where id::text like '33000000-0000-4000-8000-%'")).rows[0].count;
  return result;
}
async function chatInventory(){
  const result={};
  for(const table of chatTables){
    const exists=(await db.query('select to_regclass($1) is not null as found',[`public.${table}`])).rows[0].found;
    result[table]=exists ? (await db.query(`select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from public.${table} t`)).rows[0] : {count:0,digest:'d751713988987e9331980363e24189ce'};
  }
  return result;
}
try{
  await db.connect();
  const before=await inventory();
  console.log(JSON.stringify({version,sha256,inventory:before}));
  if(!process.argv.includes('--apply')&&!process.argv.includes('--test')){
    console.log('Read-only inventory complete. --apply applies the additive migration; --test runs rollback-only SQL assertions.');
  }else{
    await db.query('begin');
    await db.query("set local lock_timeout='20s'");
    await db.query("set local statement_timeout='90s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
    const baseline=await inventory();
    const oldChats=await chatInventory();
    if(baseline.fixtureUsers)throw new Error('Reserved SQL fixture users already exist; refusing to overwrite.');
    const existing=await db.query('select m.version,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c on c.version=m.version where m.version=$1',[version]);
    if(existing.rowCount&&existing.rows[0].sha256!==sha256)throw new Error('Applied messaging migration checksum mismatch.');
    if(!existing.rowCount&&process.argv.includes('--apply')){
      if(!(await db.query("select 1 from supabase_migrations.schema_migrations where version='20260917000300'")).rowCount)throw new Error('Required existing migrations are missing.');
      stage='migration';
      await db.query(migration);
    }
    stage='regression';
    await db.query('savepoint kh_chat_test');
    await db.query(regression);
    await db.query('rollback to savepoint kh_chat_test');
    if(JSON.stringify(baseline)!==JSON.stringify(await inventory()))throw new Error('Existing catalog, roles or SQL fixture inventory changed unexpectedly.');
    if(JSON.stringify(oldChats)!==JSON.stringify(await chatInventory()))throw new Error('Existing messaging data changed unexpectedly.');
    if(!existing.rowCount&&process.argv.includes('--apply')){
      stage='ledger';
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[migration],'messaging']);
      await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)',[version,sha256]);
    }
    await db.query(process.argv.includes('--apply')?'commit':'rollback');
    console.log(JSON.stringify({result:'messaging_sql_passed',mode:process.argv.includes('--apply')?existing.rowCount?'verified_existing':'applied':'rollback_test',version,sha256,inventory:await inventory(),chatInventory:await chatInventory()}));
  }
}catch(error){
  await db.query('rollback').catch(()=>{});
  console.error(JSON.stringify({result:'messaging_sql_failed',stage,code:error.code??'ERROR',message:error.message}));
  process.exitCode=1;
}finally{await db.end();}
