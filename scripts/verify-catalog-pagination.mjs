// Runs the catalogue pagination SQL suite against the applied schema. The suite rolls back,
// so it leaves no rows behind; the inventory check below proves it.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const suite = readFileSync(new URL('supabase/tests/catalog_pagination.sql', root), 'utf8');
const db = createDatabaseClient();

const inventory = async () => {
  const { rows } = await db.query(
    "select (select count(*) from public.properties)::int as properties, (select count(*) from auth.users)::int as users",
  );
  return rows[0];
};

try {
  await db.connect();

  const missing = await db.query(
    "select unnest(array['kh_search_properties','kh_map_clusters']) as name except select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  );
  if (missing.rows.length) throw new Error(`KH_NOT_APPLIED: falta ${missing.rows.map((row) => row.name).join(', ')}. Ejecuta apply-catalog-pagination.mjs primero.`);

  const before = await inventory();
  await db.query(suite);
  const after = await inventory();

  const unchanged = before.properties === after.properties && before.users === after.users;
  console.log(JSON.stringify({ before, after, inventoryUnchanged: unchanged }, null, 2));
  if (!unchanged) throw new Error('KH_LEFTOVER: la suite dejó filas sintéticas en el proyecto');

  const plans = await db.query(
    "explain (format json) select p.id from public.properties p where p.moderation='approved' and p.availability='active' order by p.created_at desc, p.id desc limit 24",
  );
  const plan = JSON.stringify(plans.rows[0]['QUERY PLAN']);
  const indexed = /properties_catalog_recent/.test(plan);
  // Below a few hundred rows a sequential scan is genuinely cheaper, so this is a report of
  // what the planner chose, not a pass or fail condition.
  console.log(indexed
    ? `plan del orden por recientes: usa properties_catalog_recent (${after.properties} anuncios)`
    : `plan del orden por recientes: escaneo secuencial, esperado con ${after.properties} anuncios; el índice se usa al crecer el catálogo`);

  console.log('suite del catálogo superada');
} catch (error) {
  console.error('la verificación falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
