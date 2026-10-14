// KarmaHouse Pro (supabase/migrations/20261014000100_karmahouse_pro.sql).
// Without --commit each suite runs on top of the migration inside its own transaction, and both roll
// back: nothing stays. With --commit the migration is committed once and the suites run after it.
// The migration holds an exclusive lock on public.properties, so every transaction starts with short
// timeouts, and in a dry run the migration and its suite travel as ONE query: no idle gap under the lock.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const version = '20261014000100';
const migration = readFileSync(new URL(`supabase/migrations/${version}_karmahouse_pro.sql`, root), 'utf8');
const sha256 = createHash('sha256').update(migration).digest('hex');
// --commit records the ledger and checksum in the same transaction, like the other apply scripts.
const tag = '$kh_pro_ledger$';
if (migration.includes(tag)) throw new Error('La migración contiene la marca de cita del ledger');
const ledger = `insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${tag}${migration}${tag}],'karmahouse_pro');
insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values('${version}','${sha256}');`;
const suites = ['pro', 'pro_bump'].map(name => readFileSync(new URL(`supabase/tests/${name}.sql`, root), 'utf8'));
const commit = process.argv.includes('--commit');
const guards = "set local lock_timeout='3s'; set local statement_timeout='60s'; set local idle_in_transaction_session_timeout='15s';";
// A suite's own begin only warns inside this transaction; its trailing rollback ends it (and undoes the migration in a dry run).
const transaction = sql => `begin; ${guards}\n${sql}`;
// Every id the suites invent starts with one of these (pro.sql: 43…, pro_bump.sql: 44…); the 46… ids belong to the local race script only.
const syntheticIds = ['43000000-0000-4000-8000-%', '44000000-0000-4000-8000-%'];
const db = createDatabaseClient();
const count = async sql => (await db.query(sql, [syntheticIds])).rows[0].n;
// Counts only the suites' synthetic rows, so real activity in production during the run cannot look like a leftover.
const leftovers = async () => {
  const found = async table => (await db.query('select to_regclass($1) is not null as found', [table])).rows[0].found;
  return {
    users: await count('select count(*)::int n from auth.users where id::text like any($1::text[])'),
    agencies: await count('select count(*)::int n from kh_private.agencies where id::text like any($1::text[])'),
    properties: await count('select count(*)::int n from public.properties where owner_id::text like any($1::text[])'),
    // These two tables exist only after the migration is committed.
    proCodes: await found('kh_private.pro_codes') ? await count('select count(*)::int n from kh_private.pro_codes where created_by::text like any($1::text[]) or bound_user_id::text like any($1::text[]) or bound_agency_id::text like any($1::text[]) or redeemed_by::text like any($1::text[])') : 0,
    proStatus: await found('kh_private.pro_status') ? await count('select count(*)::int n from kh_private.pro_status where user_id::text like any($1::text[]) or agency_id::text like any($1::text[])') : 0,
  };
};
const total = rows => Object.values(rows).reduce((sum, n) => sum + n, 0);

try {
  await db.connect();
  const before = await leftovers();
  if (total(before)) throw new Error(`KH_LEFTOVER: ya hay filas sintéticas antes de empezar ${JSON.stringify(before)}`);
  if (commit) {
    if ((await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [version])).rowCount) throw new Error(`La migración ${version} ya está aplicada`);
    await db.query(`${transaction(migration)}\n${ledger}\ncommit;`); console.log(`migración aplicada (sha256 ${sha256})`);
    for (const suite of suites) await db.query(transaction(suite));
  } else {
    for (const suite of suites) await db.query(transaction(`${migration}\n${suite}`));
  }
  const after = await leftovers();
  const clean = total(after) === 0;
  console.log(JSON.stringify({ commit, before, after, noLeftovers: clean }));
  if (!clean) throw new Error('KH_LEFTOVER: una suite dejó filas sintéticas');
  console.log(commit ? 'suites superadas sobre el esquema aplicado' : 'suites superadas; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
