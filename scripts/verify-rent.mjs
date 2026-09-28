import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/rent.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select count(*) from information_schema.columns where table_schema='public' and table_name='properties' and column_name in ('rent_period','rent_min_stay','wanted_operations'))::int as columns,
    (select count(*) from pg_constraint where conrelid='public.properties'::regclass and conname in ('properties_rent_fields','properties_wanted_operations'))::int as constraints,
    (select count(*) from public.properties where operation='rent')::int as rentals`);
  console.log(JSON.stringify(rows[0]));
  if (rows[0].columns !== 3 || rows[0].constraints !== 2) throw new Error('KH_NOT_APPLIED: ejecuta apply-rent.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
