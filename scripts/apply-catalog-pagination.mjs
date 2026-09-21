// Applies the catalogue pagination migration and reports the schema each extension
// resolved to, so a wrong schema fails loudly instead of creating a function silently
// against the wrong unaccent dictionary.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260921000100_catalog_pagination.sql', root), 'utf8');
const db = createDatabaseClient();

try {
  await db.connect();

  const before = await db.query(
    "select extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where extname in ('unaccent','pg_trgm')",
  );
  console.log('extensiones antes:', before.rows.length ? before.rows : 'ninguna instalada');

  const rows = await db.query("select count(*)::int as n from public.properties where moderation='approved' and availability='active'");
  console.log(`anuncios públicos antes de la migración: ${rows.rows[0].n}`);
  console.warn('add column ... generated always as ... stored reescribe la tabla bajo access exclusive.');

  await db.query('begin');
  await db.query(migration);
  await db.query('commit');

  const after = await db.query(
    "select extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where extname in ('unaccent','pg_trgm') order by extname",
  );
  for (const row of after.rows) console.log(`extensión ${row.extname} instalada en el esquema ${row.nspname}`);
  if (after.rows.length !== 2) throw new Error('KH_MISSING_EXTENSION: faltan unaccent o pg_trgm tras la migración');

  const indexes = await db.query(
    "select indexname from pg_indexes where schemaname='public' and tablename='properties' and (indexname like 'properties_catalog%' or indexname='properties_map_points') order by indexname",
  );
  console.log('índices creados:', indexes.rows.map((row) => row.indexname).join(', '));
  if (indexes.rows.length !== 6) throw new Error(`KH_MISSING_INDEX: se esperaban 6 índices, hay ${indexes.rows.length}`);

  const dropped = await db.query("select 1 from pg_indexes where schemaname='public' and indexname='properties_public_catalog'");
  if (dropped.rows.length) throw new Error('KH_STALE_INDEX: properties_public_catalog sigue presente');

  const functions = await db.query(
    "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('kh_search_properties','kh_map_clusters') order by proname",
  );
  console.log('funciones creadas:', functions.rows.map((row) => row.proname).join(', '));
  if (functions.rows.length !== 2) throw new Error('KH_MISSING_FUNCTION: faltan los RPC del catálogo');

  console.log('migración aplicada');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('la migración no se aplicó:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
