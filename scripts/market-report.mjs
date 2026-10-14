// Monthly market report, read-only. Usage: node scripts/market-report.mjs [--month AAAA-MM] [--with-searches]
// Saved searches are read only with --with-searches: the privacy policy has to cover that use first
// (spec §9). Without it the page says the demand is not included.
// Writes artifacts/market-reports/<month>/<province>.html (artifacts/ is outside Git). Open each page
// in the browser and save it as PDF. Never uses chats, offers or visits.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
import { buildProvinceReport, renderReportHtml, slug } from './market-report-lib.mjs';

const flag = process.argv.indexOf('--month');
const month = flag < 0 ? new Date().toISOString().slice(0, 7) : process.argv[flag + 1];
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('Usa --month AAAA-MM');
const withSearches = process.argv.includes('--with-searches');
const db = createDatabaseClient();
await db.connect();
try {
  await db.query('begin transaction read only');
  const { rows: listings } = await db.query(`
    select p.province, p.location, p.type, p.operation, p.rent_period, p.price::float8 as price, p.area::float8 as area,
           p.availability, p.created_at, p.owner_id,
           (select min(h.recorded_at) from kh_private.property_price_history h where h.property_id = p.id and h.availability = 'sold') as sold_at
      from public.properties p
     where p.moderation = 'approved'
       and not exists (select 1 from kh_private.suspended_properties s where s.property_id = p.id)
       and not exists (select 1 from kh_private.property_aliases a where a.property_id = p.id)`);
  const searches = !withSearches ? null : (await db.query(`
    select s.user_id, s.filters->>'province' as province,
           array(select jsonb_array_elements_text(coalesce(s.filters->'operations', '[]'::jsonb))) as operations
      from kh_private.saved_searches s
     where s.enabled and s.filters->>'province' is not null`)).rows;
  await db.query('rollback');
  const cutoff = new Date().toISOString();
  const dir = new URL(`../artifacts/market-reports/${month}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const province of [...new Set(listings.map(row => row.province))].sort()) {
    const report = buildProvinceReport({ province, month, cutoff, listings: listings.filter(row => row.province === province), searches: searches && searches.filter(s => s.province === province) });
    writeFileSync(new URL(`${slug(province)}.html`, dir), renderReportHtml(report));
    console.log(`informe: artifacts/market-reports/${month}/${slug(province)}.html (${report.listingCount} anuncios activos)`);
  }
} finally {
  await db.end();
}
