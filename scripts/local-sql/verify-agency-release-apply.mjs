// Focused real-SQL release-procedure test; no hosted target/configuration.
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {createAgencyLocaleClone} from './agency-locale-clone.mjs';
import {applyAgencyRelease} from '../agency-release-apply.mjs';
import {verifyAgencies,digest} from '../agency-activation.mjs';
const source=new URL(process.env.KH_LOCAL_DATABASE_URL);
assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const baseline=new Client({connectionString:source.href});await baseline.connect();
async function inventory(db){const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage','supabase_migrations') order by 1,2")).rows;const result=[];for(const {schemaname,tablename}of tables)result.push({schemaname,tablename,...(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from "${schemaname}"."${tablename}" t`)).rows[0]});return result;}
const before=await inventory(baseline);let clone,db;
try{
 clone=await createAgencyLocaleClone(source);db=new Client({connectionString:clone.url.href});await db.connect();
 await db.query('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);create table supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version),sha256 text not null,applied_at timestamptz default now())');
 const legacy='-- old mixed bytes\r\nselect 1;\n';
 await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',['20260920000400',[legacy],'historical']);
 await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256)values($1,$2)',['20260920000400',digest(legacy)]);
 const old=(await db.query('select to_jsonb(m) m,to_jsonb(c) c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version)')).rows;
 // Fail the second checksum insert after actual SQL/schema/ledger work: transaction must roll back all of it.
 const fault={query:async(sql,args)=>{if(sql.startsWith('insert into supabase_migrations.karmahouse_migration_checksums')&&args[0]==='20261007000200')throw Error('owned checksum fault');return db.query(sql,args)}};
 await assert.rejects(applyAgencyRelease(fault),/owned checksum fault/);
 assert.deepEqual((await db.query("select version from supabase_migrations.schema_migrations where version like '20261007%' order by 1")).rows,[{version:'20261007000100'}]);
 assert.equal((await db.query("select to_regclass('kh_private.agency_invitations') v")).rows[0].v,null);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 console.log('checksum failure rolls back migration 2 schema+ledger, leaves only migration 1 OFF');
 const result=await applyAgencyRelease(db);assert.equal(result.length,10);assert.equal(result.filter(x=>x.applied).length,9);
 assert.equal((await verifyAgencies(db)).complete,true);assert.equal((await verifyAgencies(db)).enabled,false);
 assert.equal((await applyAgencyRelease(db)).filter(x=>x.applied).length,0);
 const after=(await db.query("select to_jsonb(m) m,to_jsonb(c) c from supabase_migrations.schema_migrations m join supabase_migrations.karmahouse_migration_checksums c using(version) where version='20260920000400'")).rows;assert.deepEqual(after,old);
 await db.query("update supabase_migrations.karmahouse_migration_checksums set sha256='drift' where version='20261007000300'");
 await assert.rejects(applyAgencyRelease(db),/ledger/);
 await db.query('update kh_private.agency_settings set enabled=true');await assert.rejects(applyAgencyRelease(db),/OFF/);
 console.log('resume/idempotence/full manifest/default OFF/old exact bytes+hash+timestamp preserved; drift and ON rejected');
}finally{if(db)await db.end();if(clone)await clone.cleanup();assert.deepEqual(await inventory(baseline),before);await baseline.end();console.log('owned clone dropped; source unchanged');}
