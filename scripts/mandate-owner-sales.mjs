// One-off: puts every live sale of the owner account under a mandate of the principal agency («Cartera autorizada»),
// so its gestores can share them and take their interested buyers. Reversible with kh_withdraw_agency_mandate.
// It calls the same reviewed RPCs the app uses, acting as the owner inside one transaction:
// kh_request_agency_mandate (as admin of the principal agency) and kh_decide_agency_mandate (as the personal owner).
// Without --commit everything rolls back. Rentals and swaps cannot be mandated: the agency module covers sales only.
import { randomUUID } from 'node:crypto';
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
  const listings = (await db.query(`select id from public.properties p where owner_id=$1 and operation='sale' and availability='active' and moderation='approved'
    and not exists(select 1 from kh_private.agency_mandates m where m.property_id=p.id and m.agency_id=$2 and m.state='active') order by created_at,id`, [owner, agency])).rows;
  for (const { id } of listings) {
    const request = (await one('select public.kh_request_agency_mandate($1,$2,$3) r', [owner, agency, { propertyId: id, internalReference: `Anuncio propio ${id.slice(0, 8)}`, clientRequestId: randomUUID() }])).r;
    const decided = (await one('select public.kh_decide_agency_mandate($1,null,$2) r', [owner, { requestId: request.id, decision: 'accept', expectedVersion: request.version, clientRequestId: randomUUID() }])).r;
    if (decided.state !== 'accepted') throw new Error(`Mandato no aceptado para ${id}`);
  }
  const after = await one(`select count(*) filter (where exists(select 1 from kh_private.agency_mandates m where m.property_id=p.id and m.agency_id=$2 and m.state='active'))::int mandated,
    count(*)::int live_sales from public.properties p where owner_id=$1 and operation='sale' and availability='active' and moderation='approved'`, [owner, agency]);
  const portfolio = await one("select jsonb_array_length(public.kh_agency_properties($1,$2,0,50)->'items') first_page", [owner, agency]);
  console.log(JSON.stringify({ commit, mandatedNow: listings.length, ...after, portfolioFirstPage: portfolio.first_page }));
  if (after.mandated !== after.live_sales) throw new Error('Quedan ventas sin mandato');
  await db.query(commit ? 'commit' : 'rollback');
  console.log(commit ? 'mandatos guardados' : 'ensayo correcto; nada se guardó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
