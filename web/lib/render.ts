// Pure HTML for the public listing page. No Deno API here so `node --test` can exercise it.

export interface PublicListingRow {
  id: string;
  title: string;
  location: string;
  province: string;
  type: string;
  description: string;
  price: number | string;
  area: number | string;
  bedrooms: number;
  bathrooms: number;
  amenities: string[] | null;
  condition: string | null;
  floor: number | null;
  price_negotiable: boolean | null;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Same grouping as the app's formatMoney (es-CU: `85,000`), without depending on ICU data. */
export function formatPrice(value: number | string): string {
  return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function describeListing(row: PublicListingRow): string {
  return `${formatPrice(row.price)} USD · ${row.location}, ${row.province} · ${row.bedrooms} hab · ${row.bathrooms} baños · ${Number(row.area)} m²`;
}

const CONDITION_LABELS: Record<string, string> = { new: 'Nuevo', good: 'Buen estado', 'needs-renovation': 'A reformar' };

const STYLE = `
:root{--ink:#1C1C1E;--muted:#5E6B7A;--primary:#0153A8;--paper:#F5F5F7;--card:#FFFFFF;--border:#E3E8F0}
@media(prefers-color-scheme:dark){:root{--ink:#F2F4F7;--muted:#A5B0BD;--primary:#7DB4F0;--paper:#111418;--card:#1B2027;--border:#2C333D}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 120px}
header{display:flex;align-items:center;gap:10px;margin-bottom:16px}header a{color:var(--ink);text-decoration:none;font-size:20px}header b{font-weight:700}
.gallery{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:20px}
.gallery img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start;border-radius:20px;background:var(--border)}
h1{font-size:28px;line-height:1.2;margin:16px 0 4px;letter-spacing:-0.02em}
.price{font-size:26px;font-weight:700;margin:0}.price small{font-size:14px;font-weight:400;color:var(--muted)}
.muted{color:var(--muted);font-size:14px}
section.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:16px 20px;margin:16px 0}
h2{font-size:18px;margin:0 0 8px}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
ul{margin:0;padding-left:20px}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:12px;justify-content:center}
.bar a{flex:1;max-width:360px;text-align:center;padding:14px;border-radius:14px;font-weight:600;text-decoration:none}
.open{background:var(--primary);color:#fff}.more{border:1px solid var(--border);color:var(--ink)}
`;

function page(title: string, head: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${head}
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function header(siteUrl: string): string {
  return `<header><a href="${escapeHtml(siteUrl)}"><b>Karma</b>House</a></header>`;
}

export function renderListing(row: PublicListingRow, photoUrls: string[], siteUrl: string, selfUrl: string): string {
  const title = escapeHtml(row.title);
  const description = escapeHtml(describeListing(row));
  const site = escapeHtml(siteUrl);
  const self = escapeHtml(selfUrl);
  const deepLink = `karmahouse://property/${escapeHtml(row.id)}`;
  const head = [
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${self}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="KarmaHouse">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${self}">`,
    ...(photoUrls.length ? [`<meta property="og:image" content="${escapeHtml(photoUrls[0])}">`, `<meta name="twitter:card" content="summary_large_image">`] : []),
  ].join('\n');
  const gallery = photoUrls.length
    ? `<div class="gallery">${photoUrls.map((url) => `<img loading="lazy" alt="" src="${escapeHtml(url)}">`).join('')}</div>`
    : '';
  const details: [string, string][] = [
    ['Tipo', row.type],
    ...(row.condition && CONDITION_LABELS[row.condition] ? [['Estado', CONDITION_LABELS[row.condition]] as [string, string]] : []),
    ...(row.floor !== null && row.floor !== undefined ? [['Planta', `Planta ${row.floor}`] as [string, string]] : []),
    ['Zona', `${row.location}, ${row.province}`],
    ['Habitaciones', String(row.bedrooms)],
    ['Baños', String(row.bathrooms)],
    ['Superficie', `${Number(row.area)} m²`],
  ];
  const amenities = row.amenities?.length
    ? `<section class="card"><h2>Características</h2><ul>${row.amenities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
    : '';
  const about = row.description.trim()
    ? `<section class="card"><h2>Descripción</h2><p>${escapeHtml(row.description.trim()).replace(/\r?\n/g, '<br>')}</p></section>`
    : '';
  const body = `${header(siteUrl)}
${gallery}
<h1>${title}</h1>
<p class="price">$ ${formatPrice(row.price)} <small>USD${row.price_negotiable ? ' · Negociable' : ''}</small></p>
<p class="muted">${escapeHtml(row.location)}, ${escapeHtml(row.province)}</p>
<section class="card"><dl>${details.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl></section>
${about}
${amenities}
<p class="muted">Para contactar con quien publica, guardar la vivienda o verla en el mapa, ábrela en KarmaHouse.</p>
<nav class="bar"><a class="open" id="open" href="${deepLink}">Abrir en KarmaHouse</a><a class="more" id="more" href="${site}">Ver más viviendas</a></nav>
<script>
document.getElementById('open').addEventListener('click',function(){setTimeout(function(){if(document.visibilityState==='visible')location.href=document.getElementById('more').href},1500)});
</script>`;
  return page(title, head, body);
}

export function renderUnavailable(siteUrl: string): string {
  const site = escapeHtml(siteUrl);
  return page('Vivienda no disponible', '<meta name="robots" content="noindex">', `${header(siteUrl)}
<h1>Ya no está disponible</h1>
<p class="muted">Esta vivienda se vendió, está en pausa o el enlace no es válido.</p>
<nav class="bar"><a class="more" href="${site}">Ver más viviendas</a></nav>`);
}
