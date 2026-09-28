import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/search_alerts.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    to_regclass('kh_private.saved_searches') is not null as searches_table,
    (select count(*) from information_schema.columns where table_schema='kh_private' and (table_name, column_name) in (('notifications','property_id'),('notifications','saved_search_id'),('notification_preferences','alerts')))::int as columns,
    (to_regprocedure('public.kh_save_search(uuid,jsonb)') is not null and to_regprocedure('public.kh_list_saved_searches(uuid)') is not null
      and to_regprocedure('public.kh_delete_saved_search(uuid,uuid)') is not null and to_regprocedure('kh_private.alert_on_approval(public.properties)') is not null) as functions,
    (select max(pronargs) from pg_proc where oid='public.kh_list_notifications'::regproc)::int as list_args`);
  console.log(JSON.stringify(rows[0]));
  if (!rows[0].searches_table || rows[0].columns !== 3 || !rows[0].functions || rows[0].list_args !== 6) throw new Error('KH_NOT_APPLIED: ejecuta apply-search-alerts.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
