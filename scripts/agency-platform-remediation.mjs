// Root-runbook import only: no CLI, configuration, connector, migration or enable.
import {reviewedAgencyManifest,schemaInventory,verifyAgencies,assertMigrationLedger} from './agency-activation.mjs';
const anonymousExtras=[
 'public.kh_agency_review_detail(p_actor_id uuid, p_agency_id uuid, p_request_id uuid)',
 'public.kh_set_agency_logo(p_actor_id uuid, p_agency_id uuid, p_path text, p_expected_version integer)',
];
export async function remediateAgencyPlatform(db,profile){
 if(profile!=='hosted')throw Error('Explicit hosted remediation profile required');
 const {migrations,manifest,schema}=await reviewedAgencyManifest(profile);
 const before=structuredClone(schema);
 for(const signature of anonymousExtras){const f=before.functions.find(f=>f.signature===signature);if(!f||f.anon!==false)throw Error('Invalid anonymous remediation pin');f.anon=true;}
 await db.query('begin');
 try{
  await db.query("set local statement_timeout='30s';set local lock_timeout='15s'");
  await db.query("select pg_advisory_xact_lock(hashtextextended('karmahouse:migrations',0))");
  await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
  await db.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
  const flags=(await db.query('select enabled from kh_private.agency_settings where singleton for update')).rows;
  if(flags.length!==1||flags[0].enabled!==false)throw Error('Agency module must be OFF before platform remediation');
  assertMigrationLedger(migrations,(await db.query('select m.version,m.statements,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c using(version) where m.version=any($1) order by m.version',[migrations.map(m=>m.version)])).rows);
  if((await db.query("select public from storage.buckets where id='agency-assets'")).rows[0]?.public!==false)throw Error('Agency assets must remain private');
  if(JSON.stringify(await schemaInventory(db,manifest.names))!==JSON.stringify(before))throw Error('Platform remediation before-state differs from exact two-anon delta');
  await db.query('revoke execute on function public.kh_agency_review_detail(uuid,uuid,uuid),public.kh_set_agency_logo(uuid,uuid,text,integer) from anon');
  const status=await verifyAgencies(db,'hosted');
  if(status.enabled!==false)throw Error('Platform remediation must preserve OFF');
  await db.query('commit');return {...status,revokedAnonymousExecute:2};
 }catch(error){await db.query('rollback');throw error;}
}
