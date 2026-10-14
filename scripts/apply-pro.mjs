// KarmaHouse Pro (supabase/migrations/20261014000100_karmahouse_pro.sql).
// Without --commit each suite runs on top of the migration inside its own transaction, and both roll
// back: nothing stays. With --commit the migration is committed once and the suites run after it.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20261014000100_karmahouse_pro.sql', root), 'utf8');
const suites = ['pro', 'pro_bump'].map(name => readFileSync(new URL(`supabase/tests/${name}.sql`, root), 'utf8'));
const commit = process.argv.includes('--commit');
const db = createDatabaseClient();
const inventory = async () => (await db.query(
  "select (select count(*) from auth.users)::int as users, (select count(*) from public.properties)::int as properties, (select count(*) from kh_private.notifications)::int as notifications, (select count(*) from kh_private.admin_audit)::int as audit",
)).rows[0];

try {
  await db.connect();
  const before = await inventory();
  if (commit) {
    await db.query('begin'); await db.query(migration); await db.query('commit'); console.log('migración aplicada');
    for (const suite of suites) await db.query(suite);
  } else {
    // A suite's own begin only warns inside this transaction; its rollback undoes the migration too.
    for (const suite of suites) { await db.query('begin'); await db.query(migration); await db.query(suite); }
  }
  const after = await inventory();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  console.log(JSON.stringify({ commit, before, after, inventoryUnchanged: unchanged }));
  if (!unchanged) throw new Error('KH_LEFTOVER: una suite dejó filas sintéticas');
  console.log(commit ? 'suites superadas sobre el esquema aplicado' : 'suites superadas; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
