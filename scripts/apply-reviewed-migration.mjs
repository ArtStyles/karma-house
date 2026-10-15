// Applies one reviewed migration with its SQL suite: node scripts/apply-reviewed-migration.mjs <version>_<name> [--commit]
// The suite is supabase/tests/<name>.sql. Without --commit the suite runs on top of the migration in one transaction
// that rolls back: nothing stays. With --commit the migration, its ledger row and checksum are committed once and the
// suite runs after it. Used for 20261014000200_agency_sent_invitations and 20261015000100_agency_member_exits.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const target = process.argv[2] ?? '';
const match = /^(\d{14})_([a-z0-9_]+)$/.exec(target);
if (!match) { console.error('Uso: node scripts/apply-reviewed-migration.mjs <version>_<name> [--commit]'); process.exit(2); }
const [, version, name] = match;
const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL(`supabase/migrations/${target}.sql`, root), 'utf8');
const sha256 = createHash('sha256').update(migration).digest('hex');
const tag = '$kh_reviewed_ledger$';
if (migration.includes(tag)) throw new Error('La migración contiene la marca de cita del ledger');
const ledger = `insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${tag}${migration}${tag}],'${name}');
insert into supabase_migrations.karmahouse_migration_checksums(version,sha256) values('${version}','${sha256}');`;
const suite = readFileSync(new URL(`supabase/tests/${name}.sql`, root), 'utf8');
const commit = process.argv.includes('--commit');
const transaction = sql => `begin; set local lock_timeout='3s'; set local statement_timeout='60s'; set local idle_in_transaction_session_timeout='15s';\n${sql}`;
const db = createDatabaseClient();
// Suites invent ids with these prefixes (agency_sent_invitations 47…, agency_member_exits 48…); real activity cannot match.
const leftovers = async () => (await db.query(`select (select count(*) from auth.users where id::text like any($1::text[]))+(select count(*) from kh_private.agencies where id::text like any($1::text[])) n`,
  [['47000000-0000-4000-8000-%', '48000000-0000-4000-8000-%']])).rows[0].n;

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
