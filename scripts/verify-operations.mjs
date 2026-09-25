import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const suite = readFileSync(new URL('../supabase/tests/operations.sql', import.meta.url), 'utf8');
const db = createDatabaseClient();
try {
  await db.connect();
  const { rows } = await db.query(`select
    (select count(*) from information_schema.columns where table_schema='public' and table_name='properties' and column_name in ('operation','swap_wants','swap_provinces','swap_balance','swap_amount'))::int as columns,
    (select count(*) from pg_constraint where conrelid='public.properties'::regclass and conname in ('properties_operation_valid','properties_swap_fields','properties_offer_fields','properties_wanted_fields','properties_photos_required'))::int as constraints,
    (select count(*) from public.properties where operation<>'sale')::int as non_sale`);
  console.log(JSON.stringify(rows[0]));
  if (rows[0].columns !== 5 || rows[0].constraints !== 5) throw new Error('KH_NOT_APPLIED: ejecuta apply-operations.mjs --commit');
  await db.query(suite);
  console.log('suite superada sobre el esquema aplicado');
} catch (error) { await db.query('rollback').catch(() => {}); console.error('falló:', error.message); process.exitCode = 1; }
finally { await db.end(); }
