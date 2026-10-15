// Sent agency invitations (supabase/migrations/20261014000200_agency_sent_invitations.sql).
// Without --commit the suite runs on top of the migration in one transaction that rolls back: nothing stays.
// With --commit the migration, its ledger row and checksum are committed once and the suite runs after it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const version = '20261014000200', name = 'agency_sent_invitations';
const migration = readFileSync(new URL(`supabase/migrations/${version}_${name}.sql`, root), 'utf8');
const sha256 = createHash('sha256').update(migration).digest('hex');
const tag = '$kh_sent_ledger$';
if (migration.includes(tag)) throw new Error('La migración contiene la marca de cita del ledger');
const ledger = `insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${tag}${migration}${tag}],'${name}');
insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values('${version}','${sha256}');`;
const suite = readFileSync(new URL(`supabase/tests/${name}.sql`, root), 'utf8');
const commit = process.argv.includes('--commit');
const transaction = sql => `begin; set local lock_timeout='3s'; set local statement_timeout='60s'; set local idle_in_transaction_session_timeout='15s';\n${sql}`;
const db = createDatabaseClient();
// The suite invents ids starting with 47000000-…; real activity cannot look like a leftover.
const leftovers = async () => (await db.query("select (select count(*) from auth.users where id::text like '47000000-0000-4000-8000-%')+(select count(*) from kh_private.agencies where id::text like '47000000-0000-4000-8000-%') n")).rows[0].n;

try {
  await db.connect();
  if (Number(await leftovers())) throw new Error('KH_LEFTOVER: ya hay filas sintéticas antes de empezar');
  if (commit) {
    if ((await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [version])).rowCount) throw new Error(`La migración ${version} ya está aplicada`);
    await db.query(`${transaction(migration)}\n${ledger}\ncommit;`); console.log(`migración aplicada (sha256 ${sha256})`);
    await db.query(transaction(suite));
  } else {
    // A suite's own begin only warns inside this transaction; its trailing rollback also undoes the migration.
    await db.query(transaction(`${migration}\n${suite}`));
  }
  if (Number(await leftovers())) throw new Error('KH_LEFTOVER: la suite dejó filas sintéticas');
  console.log(commit ? 'suite superada sobre el esquema aplicado' : 'suite superada; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
