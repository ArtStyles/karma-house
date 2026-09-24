// Chat messages expose the proposal they summarize (supabase/migrations/20260924000100_chat_negotiation_cards.sql).
// The migration is a `create or replace`, so it is safe to run twice. Without --commit the migration and its
// suite share one transaction that rolls back; with --commit the migration stays and the suite runs after it.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260924000100_chat_negotiation_cards.sql', root), 'utf8');
const suite = readFileSync(new URL('supabase/tests/chat_negotiation_cards.sql', root), 'utf8');
const commit = process.argv.includes('--commit');
const skipMigration = process.argv.includes('--suite-only');
const db = createDatabaseClient();
const inventory = async () => (await db.query(
  "select (select count(*) from auth.users)::int as users, (select count(*) from public.kh_messages)::int as messages, (select count(*) from public.kh_negotiations)::int as negotiations",
)).rows[0];

try {
  await db.connect();
  const before = await inventory();
  if (skipMigration) await db.query(suite);
  else if (commit) { await db.query('begin'); await db.query(migration); await db.query('commit'); console.log('migración aplicada'); await db.query(suite); }
  // The suite's own begin only warns inside this transaction; its rollback undoes the migration too.
  else { await db.query('begin'); await db.query(migration); await db.query(suite); }
  const after = await inventory();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  console.log(JSON.stringify({ commit, before, after, inventoryUnchanged: unchanged }));
  if (!unchanged) throw new Error('KH_LEFTOVER: la suite dejó filas sintéticas');
  console.log(commit ? 'suite superada sobre el esquema aplicado' : 'suite superada; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
