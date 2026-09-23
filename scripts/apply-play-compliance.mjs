// Listing reports and account deletion (supabase/migrations/20260923000100_play_compliance.sql).
// Without --commit the migration and its suite run in one transaction that rolls back, so the
// project is left exactly as it was. With --commit the migration stays and the suite runs after it.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260923000100_play_compliance.sql', root), 'utf8');
const suite = readFileSync(new URL('supabase/tests/play_compliance.sql', root), 'utf8');
const commit = process.argv.includes('--commit');
const db = createDatabaseClient();
const inventory = async () => (await db.query(
  "select (select count(*) from auth.users)::int as users, (select count(*) from public.properties)::int as properties, (select count(*) from storage.objects)::int as files",
)).rows[0];
const applied = async () => (await db.query(
  "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('kh_report_property','kh_delete_account')",
)).rows[0].n === 2;

try {
  await db.connect();
  const before = await inventory();
  if (commit) {
    if (await applied()) console.log('la migración ya estaba aplicada');
    else {
      await db.query('begin');
      await db.query(migration);
      await db.query('commit');
      console.log('migración aplicada');
    }
    await db.query(suite);
  } else {
    if (await applied()) throw new Error('KH_ALREADY_APPLIED: usa --commit para ejecutar solo la suite');
    // The suite's own begin only warns inside this transaction; its rollback undoes the migration too.
    await db.query('begin');
    await db.query(migration);
    await db.query(suite);
  }
  const after = await inventory();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  console.log(JSON.stringify({ commit, before, after, inventoryUnchanged: unchanged }));
  if (!unchanged) throw new Error('KH_LEFTOVER: la suite dejó filas sintéticas');
  if (!commit && await applied()) throw new Error('KH_NOT_ROLLED_BACK: la prueba dejó la migración aplicada');
  console.log(commit ? 'suite superada sobre el esquema aplicado' : 'suite superada; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
