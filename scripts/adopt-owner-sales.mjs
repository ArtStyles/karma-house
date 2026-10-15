// One-off, irreversible: makes the principal agency the sole origin of every live sale of the owner account,
// through kh_private.adopt_owner_listing (20261015000300_owner_listings_to_agency), acting as the owner inside one
// transaction. Without --commit everything rolls back. Running it again only adopts sales that still lack an origin.
// Rentals and swaps stay personal: the agency module covers sales only.
import { createDatabaseClient } from './cloud-db.mjs';

const commit = process.argv.includes('--commit');
const db = createDatabaseClient();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
try {
  await db.connect();
  await db.query("begin; set local lock_timeout='3s'; set local statement_timeout='120s'");
  const { owner, agency } = await one("select o.user_id owner,p.agency_id agency from kh_private.platform_owner o cross join kh_private.principal_agency p where o.singleton and p.singleton");
  if (!owner || !agency) throw new Error('Falta la cuenta propietaria o su inmobiliaria principal');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::uuid,'role','authenticated')::text,true)", [owner]);
  const listings = (await db.query(`select id,version from public.properties p where owner_id=$1 and operation='sale' and availability<>'sold' and moderation='approved'
    and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id) order by created_at,id`, [owner])).rows;
  for (const { id, version } of listings) await db.query('select kh_private.adopt_owner_listing($1,$2,$3,$4)', [owner, agency, id, version]);
  const after = await one(`select count(*)::int sales,
    count(*) filter (where exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id and o.origin_agency_id=$2))::int adopted
    from public.properties p where owner_id=$1 and operation='sale' and availability<>'sold' and moderation='approved'`, [owner, agency]);
  const portfolio = await one("select jsonb_array_length(public.kh_agency_properties($1,$2,0,50)->'items') first_page", [owner, agency]);
  console.log(JSON.stringify({ commit, adoptedNow: listings.length, ...after, portfolioFirstPage: portfolio.first_page }));
  if (after.adopted !== after.sales) throw new Error('Quedan ventas sin origen de inmobiliaria');
  await db.query(commit ? 'commit' : 'rollback');
  console.log(commit ? 'origen guardado' : 'ensayo correcto; nada se guardó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
