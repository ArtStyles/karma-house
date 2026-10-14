// Pure pieces of the monthly market report: grouping, thresholds and the HTML page.
// Asking prices only: KarmaHouse never sees the closing price.
export const MIN_LISTINGS = 10;
export const MIN_PEOPLE = 5;
const OPERATIONS = { sale: 'Venta', rent: 'Alquiler', swap: 'Permuta' };
const LEGACY_OPERATIONS = ['sale', 'swap'];
const PERIODS = { month: 'al mes', day: 'por día' };
const DAY = 86_400_000;

export const normalizeZone = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const slug = text => normalizeZone(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const groupLabel = row => `${OPERATIONS[row.operation]}${row.operation === 'rent' ? ` ${PERIODS[row.rent_period] ?? ''}` : ''} · ${row.type}`;

// Swaps count as volume, not as price; wanted ads are demand.
function priceGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.availability !== 'active' || !['sale', 'rent'].includes(row.operation) || !row.type) continue;
    const label = groupLabel(row);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([label, items]) => {
    const prices = items.map(row => row.price), sized = items.filter(row => row.area > 0), enough = items.length >= MIN_LISTINGS;
    return {
      label, count: items.length,
      median: enough ? median(prices) : null, min: enough ? Math.min(...prices) : null, max: enough ? Math.max(...prices) : null,
      perM2: sized.length >= MIN_LISTINGS ? Math.round(median(sized.map(row => row.price / row.area))) : null,
    };
  });
}
// The spelling most listings use; a tie goes to the one that sorts first.
function zoneLabel(rows) {
  const counts = new Map();
  for (const row of rows) { const label = String(row.location).trim(); counts.set(label, (counts.get(label) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

// `searches: null` means saved searches were not read (privacy policy not updated yet): the page says so.
export function buildProvinceReport({ province, month, cutoff, listings, searches }) {
  const zones = new Map();
  for (const row of listings) { const key = normalizeZone(row.location); zones.set(key, [...(zones.get(key) ?? []), row]); }
  const inMonth = date => !!date && new Date(date).toISOString().slice(0, 7) === month;
  const sold = listings.filter(row => inMonth(row.sold_at));
  // A search with no operations is a legacy one: the catalogue shows it sale and swap, never rent.
  const people = operation => new Set(searches.filter(s => (s.operations.length ? s.operations : LEGACY_OPERATIONS).includes(operation)).map(s => s.user_id)).size;
  const wanted = new Set(listings.filter(row => row.operation === 'wanted' && row.availability === 'active').map(row => row.owner_id)).size;
  return {
    province, month, cutoff,
    listingCount: listings.filter(row => row.availability === 'active').length,
    prices: priceGroups(listings),
    zones: [...zones.values()].map(rows => ({ label: zoneLabel(rows), groups: priceGroups(rows).filter(group => group.median !== null) }))
      .filter(zone => zone.groups.length).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    movement: {
      newListings: listings.filter(row => inMonth(row.created_at)).length,
      sold: sold.length,
      medianDaysToSale: sold.length >= MIN_LISTINGS ? median(sold.map(row => (new Date(row.sold_at) - new Date(row.created_at)) / DAY)) : null,
    },
    demand: searches === null ? null : Object.entries(OPERATIONS).map(([operation, label]) => ({ label, people: people(operation) }))
      .filter(entry => entry.people > 0).map(entry => ({ ...entry, people: entry.people >= MIN_PEOPLE ? entry.people : null })),
    wantedPeople: wanted >= MIN_PEOPLE ? wanted : null,
  };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = value => `${new Intl.NumberFormat('es').format(Math.round(value))} USD`;
const FEW = '<p class="few">Aún hay pocos datos en esta zona.</p>';
function table(groups) {
  if (!groups.some(g => g.median !== null)) return FEW;
  const rows = groups.map(g => `<tr><td>${escape(g.label)}</td><td>${g.count}</td><td>${g.median === null ? 'Aún hay pocos datos' : usd(g.median)}</td>`
    + `<td>${g.min === null ? '—' : `${usd(g.min)} – ${usd(g.max)}`}</td><td>${g.perM2 === null ? '—' : usd(g.perM2)}</td></tr>`).join('');
  return `<table><thead><tr><th>Grupo</th><th>Anuncios</th><th>Mediana</th><th>Rango</th><th>USD/m²</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Paths are relative to artifacts/market-reports/<month>/<province>.html, three levels below the repo root.
export function renderReportHtml(report) {
  const date = new Date(report.cutoff).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const days = report.movement.medianDaysToSale;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mercado ${escape(report.province)} ${escape(report.month)}</title><style>
@font-face{font-family:Calistoga;src:url(../../../web/node_modules/@fontsource/calistoga/files/calistoga-latin-400-normal.woff2) format('woff2')}
:root{--cal:#faf6ee;--ink:#1a2b3b;--body:#4d5a66;--blue:#0153a8;--line:#e6dccb;--paper:#fff}
body{margin:0;background:var(--cal);color:var(--body);font:16px/1.55 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 16px}
h1,h2,h3{font-family:Calistoga,serif;font-weight:400;color:var(--ink)}h1 em{color:var(--blue);font-style:normal}
section{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px;margin:20px 0;overflow-x:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
.note{font-size:14px}.few{font-style:italic}img{height:32px}
@media print{body{background:#fff}section{break-inside:avoid}}
</style></head><body><main>
<img src="../../../assets/karmahouse-logo.png" alt="KarmaHouse">
<h1>Mercado de vivienda en <em>${escape(report.province)}</em></h1>
<p class="note">Precio pedido, no precio de venta. ${report.listingCount} anuncios activos publicados en KarmaHouse, con corte al ${escape(date)}. Cada cifra necesita al menos ${MIN_LISTINGS} anuncios comparables.</p>
<section><h2>Precios por tipo</h2>${table(report.prices)}</section>
<section><h2>Por zona</h2>${report.zones.length ? report.zones.map(z => `<h3>${escape(z.label)}</h3>${table(z.groups)}`).join('') : FEW}</section>
<section><h2>Movimiento de ${escape(report.month)}</h2><p>Anuncios nuevos: ${report.movement.newListings}. Pasaron a vendido: ${report.movement.sold}.</p>
<p>Días hasta la venta (mediana): ${days === null ? 'aún hay pocos datos' : Math.round(days)}.</p></section>
<section><h2>Qué se busca</h2>${report.demand === null ? '<p>Demanda por búsquedas guardadas: no incluida en este informe.</p>'
  : `${report.demand.length ? `<ul>${report.demand.map(d => `<li>${escape(d.label)}: ${d.people === null ? 'aún hay pocos datos' : `${d.people} personas con búsquedas guardadas`}</li>`).join('')}</ul>` : FEW}
<p class="note">Las búsquedas se cuentan sumadas, sin identificar a nadie, y solo desde ${MIN_PEOPLE} personas.</p>`}
<p>Anuncios «busco» activos: ${report.wantedPeople === null ? 'aún hay pocos datos' : `${report.wantedPeople} personas`}.</p></section>
</main></body></html>`;
}
