import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/optional_area.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select pg_get_constraintdef(oid) not like '%area%' from pg_constraint where conrelid='public.properties'::regclass and conname='properties_offer_fields') as offer_fields,
    (select prosrc like '%optional_area%' from pg_proc where oid='kh_private.kh_catalog_where(jsonb)'::regprocedure) as catalog,
    (select prosrc like '%optional_area%' from pg_proc where oid='kh_private.property_matches(jsonb,uuid)'::regprocedure) as alerts,
    (select count(*) from public.properties where operation<>'wanted' and area is null)::int as offers_without_area`);
  console.log(JSON.stringify(rows[0]));
  if (!rows[0].offer_fields || !rows[0].catalog || !rows[0].alerts) throw new Error('KH_NOT_APPLIED: ejecuta apply-optional-area.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
