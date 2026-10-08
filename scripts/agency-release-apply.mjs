// Deliberately import-only: no CLI, implicit target, credentials, connection or activation.
// The reviewed root runbook supplies an explicitly validated connection AFTER backup.
import {readFile} from 'node:fs/promises';
import {migrationArtifacts,manifestFile} from './agency-activation.mjs';

export async function applyAgencyRelease(db){
 const migrations=await migrationArtifacts();
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 if(JSON.stringify(migrations.map(({file,version,sha256})=>({file,version,sha256})))!==JSON.stringify(manifest.migrations))throw Error('Reviewed agency manifest differs from local bytes');
 const versions=migrations.map(m=>m.version),result=[];
 const history=async()=>JSON.stringify((await db.query('select to_jsonb(m) migration,to_jsonb(c) checksum from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c using(version) where not(m.version=any($1)) order by m.version',[versions])).rows);
 let locked=false;
 try{
  // Session mutex spans per-file commits and matches the existing migration operator.
  await db.query("select pg_advisory_lock(hashtextextended('karmahouse:migrations',0))");locked=true;
  const oldHistory=await history(); // Existing ledgers required; never bootstrap the old migration.
  for(let index=0;index<migrations.length;index++){
   const m=migrations[index];
   await db.query('begin');
   try{
    await db.query("set local lock_timeout='15s';set local statement_timeout='120s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
    await db.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
    const hasFlag=(await db.query("select to_regclass('kh_private.agency_settings') present")).rows[0].present;
    if(hasFlag){const flag=(await db.query('select enabled from kh_private.agency_settings where singleton')).rows;if(flag.length!==1||flag[0].enabled!==false)throw Error('Agency module must be OFF');}
    else if(index!==0)throw Error('Agency OFF singleton missing');
    const rows=(await db.query('select m.version,m.statements,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c using(version) where m.version=any($1) order by m.version',[versions])).rows;
    // Only a complete ordered prefix is resumable. Exact bytes and hashes, including earlier files.
    for(let i=0;i<rows.length;i++){const want=migrations[i],got=rows[i];if(got.version!==want.version||got.sha256!==want.sha256||got.statements?.length!==1||got.statements[0]!==want.sql)throw Error('Agency migration ledger differs from reviewed bytes');}
    if(rows.length<index)throw Error('Agency migration ledger prefix missing');
    const applied=rows.length===index;
    if(applied){
     if(index===0&&hasFlag)throw Error('Agency schema exists without migration ledger');
     await db.query(m.sql);
     await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[m.version,[m.sql],m.file.slice(15,-4)]);
     await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values($1,$2)',[m.version,m.sha256]);
    }
    const flag=(await db.query('select enabled from kh_private.agency_settings where singleton')).rows;
    if(flag.length!==1||flag[0].enabled!==false)throw Error('Agency module must remain OFF');
    if(await history()!==oldHistory)throw Error('Historical migration ledger changed');
    await db.query('commit');result.push({version:m.version,sha256:m.sha256,applied});
   }catch(error){await db.query('rollback');throw error;}
  }
  return result;
 }finally{if(locked)await db.query("select pg_advisory_unlock(hashtextextended('karmahouse:migrations',0))");}
}
