import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/trust_profile.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select count(*) from information_schema.tables where table_schema='kh_private' and table_name='verified_users')::int as tables,
    (select count(*) from pg_proc where oid in (to_regprocedure('public.kh_public_profile(uuid)'),to_regprocedure('public.kh_set_user_verified(uuid,uuid,boolean,text)')))::int as rpcs,
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='kh_avatar_public_read')::int as policies`);
  console.log(JSON.stringify(rows[0]));
  if (rows[0].tables !== 1 || rows[0].rpcs !== 2 || rows[0].policies !== 1) throw new Error('KH_NOT_APPLIED: ejecuta apply-trust-profile.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
