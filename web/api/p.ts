// GET /p/<uuid> (rewritten by vercel.json to /api/p?id=<uuid>) → public HTML page of an
// approved, active listing. Reads with the anon key: the same rows and photos anon can
// already read through the app, nothing more.

export interface PublicListingRow {
  id: string;
  title: string;
  location: string;
  province: string;
  type: string | null;
  description: string;
  price: number | string;
  area: number | string | null;
  bedrooms: number;
  bathrooms: number | null;
  amenities: string[] | null;
  condition: string | null;
  floor: number | null;
  price_negotiable: boolean | null;
  operation?: 'sale' | 'swap' | 'wanted' | 'rent' | null;
  swap_wants?: string | null;
  swap_provinces?: string[] | null;
  swap_balance?: 'none' | 'pay' | 'receive' | null;
  swap_amount?: number | string | null;
  rent_period?: 'month' | 'day' | null;
  rent_min_stay?: number | null;
  wanted_operations?: ('sale' | 'swap' | 'rent')[] | null;
}

const BADGES = { swap: 'Permuta', wanted: 'Busco', rent: 'Alquiler' } as const;
const WANTED_WORDS = { sale: 'comprar', swap: 'permutar', rent: 'alquilar' } as const;

/** «comprar, permutar o alquilar», buying or swapping when the row predates the column. */
function wantedText(row: PublicListingRow): string {
  const wanted = row.wanted_operations ?? ['sale', 'swap'];
  const words = (['sale', 'swap', 'rent'] as const).filter((op) => wanted.includes(op)).map((op) => WANTED_WORDS[op]);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} o ${words[words.length - 1]}` : words.join('');
}

const perPeriod = (row: PublicListingRow) => row.rent_period === 'day' ? 'noche' : 'mes';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Same grouping as the app's formatMoney (es-CU: `85,000`), without depending on ICU data. */
export function formatPrice(value: number | string): string {
  return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function describeListing(row: PublicListingRow): string {
  const op = row.operation ?? 'sale';
  const place = `${row.location}, ${row.province}`;
  if (op === 'wanted') return `Hasta ${formatPrice(row.price)} USD · ${place} · desde ${row.bedrooms} hab · ${row.type ?? 'Casa o apartamento'}`;
  const price = op === 'swap' ? `Valor est. ${formatPrice(row.price)} USD` : op === 'rent' ? `Alquiler ${formatPrice(row.price)} USD/${perPeriod(row)}` : `${formatPrice(row.price)} USD`;
  return `${price} · ${place} · ${row.bedrooms} hab · ${row.bathrooms} baños${row.area == null ? '' : ` · ${Number(row.area)} m²`}`;
}

function balanceText(row: PublicListingRow): string {
  const amount = row.swap_amount ? formatPrice(row.swap_amount) : '';
  if (row.swap_balance === 'pay') return amount ? `Añade hasta $ ${amount}` : 'Añade dinero';
  if (row.swap_balance === 'receive') return amount ? `Pide $ ${amount}` : 'Pide dinero';
  return 'Sin diferencia';
}

const CONDITION_LABELS: Record<string, string> = { new: 'Nuevo', good: 'Buen estado', 'needs-renovation': 'A reformar' };
const LEVEL_LABELS: Record<string, string> = { new: 'Nuevo', active: 'Activo', trusted: 'Confiable', featured: 'Destacado' };
const levelLabel = (level: string) => Object.prototype.hasOwnProperty.call(LEVEL_LABELS, level) ? LEVEL_LABELS[level] : undefined;

export interface Seller { name: string; level: string; verified: boolean }
export interface PublicContact {propertyId:string;personalContact:boolean;agencies:{agencyId:string;tradeName:string;verified:boolean;contactAvailable:boolean}[]}
export function decodePublicContact(value:unknown):PublicContact {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('contact shape');const v=value as PublicContact;
 if(!UUID.test(v.propertyId)||typeof v.personalContact!=='boolean'||!Array.isArray(v.agencies)||v.agencies.length>100)throw Error('contact shape');
 return{propertyId:v.propertyId,personalContact:v.personalContact,agencies:v.agencies.map(a=>{if(!UUID.test(a.agencyId)||typeof a.tradeName!=='string'||typeof a.verified!=='boolean'||typeof a.contactAvailable!=='boolean')throw Error('contact shape');return{agencyId:a.agencyId,tradeName:a.tradeName,verified:a.verified,contactAvailable:a.contactAvailable}})};
}

function sellerLines(seller: Seller | undefined): string {
  const label = seller && levelLabel(seller.level);
  if (!seller || !label) return '';
  return `<p class="muted">Publicado por ${escapeHtml(seller.name)} · ${label}</p>
${seller.verified ? `<p class="muted">Verificado por KarmaHouse</p>
` : ''}`;
}

const STYLE = `
:root{--ink:#1C1C1E;--muted:#5E6B7A;--primary:#0153A8;--paper:#F5F5F7;--card:#FFFFFF;--border:#E3E8F0}
@media(prefers-color-scheme:dark){:root{--ink:#F2F4F7;--muted:#A5B0BD;--primary:#7DB4F0;--paper:#111418;--card:#1B2027;--border:#2C333D}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 120px}
header{display:flex;align-items:center;gap:10px;margin-bottom:16px}header a{color:var(--ink);text-decoration:none;font-size:20px}header b{font-weight:700}
.gallery{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:20px}
.gallery img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start;border-radius:20px;background:var(--border)}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin:16px 0 0}
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

export function renderListing(row: PublicListingRow, photoUrls: string[], siteUrl: string, selfUrl: string, seller?: Seller,contact?:PublicContact,destination?:{agencyId:string;managerId?:string}): string {
  const op = row.operation ?? 'sale';
  const title = escapeHtml(op === 'sale' ? row.title : `${BADGES[op]}: ${row.title}`);
  const place = `${row.location}, ${row.province}`;
  const description = escapeHtml(describeListing(row));
  const download = escapeHtml(new URL('#descargar', siteUrl).href);
  const self = escapeHtml(selfUrl);
  const destinationQuery=destination&&UUID.test(destination.agencyId)&&(!destination.managerId||UUID.test(destination.managerId))?`?agencyId=${destination.agencyId}${destination.managerId?`&managerId=${destination.managerId}`:''}`:'';
  const deepLink = escapeHtml(`karmahouse://property/${row.id}${destinationQuery}`);
  const agencies=contact?.agencies.map(a=>`<section class="card"><h2>${escapeHtml(a.tradeName)}${a.verified?' <span style="color:#16813c" aria-label="Inmobiliaria verificada">✓ Inmobiliaria verificada</span>':''}</h2><p class="muted">Conversación privada con esta inmobiliaria.</p>${a.contactAvailable?`<a href="${escapeHtml(`karmahouse://property/${row.id}?agencyId=${a.agencyId}${destination?.agencyId===a.agencyId&&destination.managerId&&UUID.test(destination.managerId)?`&managerId=${destination.managerId}`:''}`)}">Elegir ${escapeHtml(a.tradeName)}</a>`:'<p>Contacto no disponible</p>'}</section>`).join('')??'';
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
  const details: [string, string][] = op === 'wanted' ? [
    ['Tipo', row.type ?? 'Casa o apartamento'],
    ['Zona', place],
    ['Habitaciones mínimas', String(row.bedrooms)],
  ] : [
    ['Tipo', row.type ?? ''],
    ...(row.condition && CONDITION_LABELS[row.condition] ? [['Estado', CONDITION_LABELS[row.condition]] as [string, string]] : []),
    ...(row.floor !== null && row.floor !== undefined ? [['Planta', `Planta ${row.floor}`] as [string, string]] : []),
    ['Zona', place],
    ['Habitaciones', String(row.bedrooms)],
    ['Baños', String(row.bathrooms)],
    ...(row.area == null ? [] : [['Superficie', `${Number(row.area)} m²`] as [string, string]]),
    ...(op === 'rent' && row.rent_min_stay ? [['Estancia mínima', `${row.rent_min_stay} ${row.rent_period === 'day' ? (row.rent_min_stay === 1 ? 'noche' : 'noches') : (row.rent_min_stay === 1 ? 'mes' : 'meses')}`] as [string, string]] : []),
  ];
  const amenities = op !== 'wanted' && row.amenities?.length
    ? `<section class="card"><h2>Características</h2><ul>${row.amenities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
    : '';
  const about = row.description.trim()
    ? `<section class="card"><h2>Descripción</h2><p>${escapeHtml(row.description.trim()).replace(/\r?\n/g, '<br>')}</p></section>`
    : '';
  const swap = op === 'swap'
    ? `<section class="card"><h2>A cambio busca</h2><p>${escapeHtml((row.swap_wants ?? '').trim()).replace(/\r?\n/g, '<br>')}</p><dl><dt>Diferencia</dt><dd>${escapeHtml(balanceText(row))}</dd>${row.swap_provinces?.length ? `<dt>Provincias</dt><dd>${escapeHtml(row.swap_provinces.join(', '))}</dd>` : ''}</dl></section>`
    : '';
  const price = op === 'wanted'
    ? `Hasta $ ${formatPrice(row.price)}`
    : `$ ${formatPrice(row.price)} <small>USD${op === 'swap' ? ' · valor estimado' : op === 'rent' ? ` / ${perPeriod(row)}` : ''}${row.price_negotiable ? ' · Negociable' : ''}</small>`;
  const body = `${header(siteUrl)}
${gallery}
${op === 'sale' ? '' : `<p class="eyebrow">${BADGES[op]}</p>
`}<h1>${escapeHtml(row.title)}</h1>
<p class="price">${price}</p>
<p class="muted">${escapeHtml(row.location)}, ${escapeHtml(row.province)}</p>
${sellerLines(contact&&!contact.personalContact?undefined:seller)}${agencies}${op === 'wanted' ? `<p>Busca: ${wantedText(row)}</p>
` : ''}<section class="card"><dl>${details.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl></section>
${about}
${swap}
${amenities}
<p class="muted">${op === 'wanted' ? 'Para responder a esta búsqueda, ábrela en KarmaHouse.' : 'Para contactar con quien publica, guardar la vivienda o verla en el mapa, ábrela en KarmaHouse.'}</p>
<p class="muted">¿No tienes la app? Descárgala y después vuelve a este enlace para abrir el anuncio.</p>
<nav class="bar" aria-label="Abrir o descargar KarmaHouse"><a class="open" id="open" href="${deepLink}">${op === 'wanted' ? 'Tengo algo que encaja' : 'Abrir en KarmaHouse'}</a><a class="more" id="more" href="${download}" target="_blank" rel="noopener" aria-label="Descargar KarmaHouse (se abre en otra pestaña)">Descargar KarmaHouse</a></nav>`;
  return page(title, head, body);
}

export function renderUnavailable(siteUrl: string): string {
  const download = escapeHtml(new URL('#descargar', siteUrl).href);
  return page('Vivienda no disponible', '<meta name="robots" content="noindex">', `${header(siteUrl)}
<h1>Ya no está disponible</h1>
<p class="muted">Esta vivienda se vendió, está en pausa o el enlace no es válido.</p>
<nav class="bar" aria-label="Descargar KarmaHouse"><a class="more" href="${download}" target="_blank" rel="noopener" aria-label="Descargar KarmaHouse (se abre en otra pestaña)">Descargar KarmaHouse</a></nav>`);
}

export const SITE_URL = 'https://karmahouse.vercel.app/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,condition,floor,price_negotiable,operation,swap_wants,swap_provinces,swap_balance,swap_amount,rent_period,rent_min_stay,wanted_operations,owner_id';
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' };

export interface Env { supabaseUrl: string; anonKey: string; publicOrigin: string }
// owner_id is only read to ask for the seller's public profile; it is never printed.
type Row = PublicListingRow & { photo_paths: string[] | null; owner_id: string };

function unavailable(): Response {
  return new Response(renderUnavailable(SITE_URL), { status: 404, headers: HTML });
}

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!UUID.test(id)) return unavailable();
  const agencyId=url.searchParams.get('agencyId'),managerId=url.searchParams.get('managerId');
  if((agencyId&&!UUID.test(agencyId))||(managerId&&(!agencyId||!UUID.test(managerId))))return unavailable();

  // The reason is public-safe (a status code or a missing variable name) and saves a trip to the logs.
  const unavailable503 = (reason: string) => new Response(`Service Unavailable: ${reason}`, { status: 503, headers: { 'Retry-After': '30' } });
  if (!env.supabaseUrl || !env.anonKey) return unavailable503('missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const base = env.supabaseUrl.replace(/\/+$/, '');
  const auth = { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
  let row: Row | undefined;
  try {
    const rows = await fetchImpl(`${base}/rest/v1/properties?select=${COLUMNS}&id=eq.${id}&moderation=eq.approved&availability=eq.active&limit=1`, { headers: auth });
    if (!rows.ok) throw new Error(`rest ${rows.status}`);
    [row] = (await rows.json()) as Row[];
    if (!row) {
      const alias = await fetchImpl(`${base}/rest/v1/rpc/kh_resolve_property_alias`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_property_id: id }),
      });
      if (!alias.ok) throw new Error(`alias ${alias.status}`);
      const canonical: unknown = await alias.json();
      if (typeof canonical !== 'string' || !UUID.test(canonical)) throw new Error('alias shape');
      if (canonical !== id) {
        const resolved = await fetchImpl(`${base}/rest/v1/properties?select=${COLUMNS}&id=eq.${canonical}&moderation=eq.approved&availability=eq.active&limit=1`, { headers: auth });
        if (!resolved.ok) throw new Error(`rest ${resolved.status}`);
        [row] = (await resolved.json()) as Row[];
        if (row && row.id !== canonical) throw new Error('alias property mismatch');
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('properties query failed', reason);
    return unavailable503(reason);
  }
  if (!row) return unavailable();

  const listing = row;
  const post = (path: string, body: unknown) => fetchImpl(`${base}${path}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  const signPhotos = async (): Promise<string[]> => {
    if (!listing.photo_paths?.length) return [];
    try {
      const signed = await post('/storage/v1/object/sign/property-photos', { expiresIn: 3600, paths: listing.photo_paths });
      if (!signed.ok) throw new Error(`storage ${signed.status}`);
      const items = (await signed.json()) as { signedURL?: string | null; error?: string | null }[];
      return items.filter((item) => item.signedURL && !item.error).map((item) => `${base}/storage/v1${item.signedURL}`);
    } catch (error) {
      // The page is still useful without photos.
      console.error('photo signing failed', error instanceof Error ? error.message : error);
      return [];
    }
  };

  const loadSeller = async (): Promise<Seller | undefined> => {
    try {
      const response = await post('/rest/v1/rpc/kh_public_profile', { p_user_id: listing.owner_id });
      if (!response.ok) throw new Error(`profile ${response.status}`);
      const profile = (await response.json()) as { id?: unknown; displayName?: unknown; level?: unknown; verified?: unknown } | null;
      if (!profile || typeof profile !== 'object' || Array.isArray(profile) || profile.id !== listing.owner_id) throw new Error('profile shape');
      const { displayName: name, level, verified } = profile;
      if (typeof name !== 'string' || name.length < 2 || name.length > 80) throw new Error('profile name');
      if (typeof level !== 'string' || !levelLabel(level) || typeof verified !== 'boolean') throw new Error('profile level');
      return { name, level, verified };
    } catch (error) {
      // The page is still useful without the seller line.
      console.error('seller profile failed', error instanceof Error ? error.message : error);
      return undefined;
    }
  };

  let contact:PublicContact|undefined;
  try{const response=await post('/rest/v1/rpc/kh_public_property_contact',{p_property_id:listing.id});if(response.ok){contact=decodePublicContact(await response.json());if(contact.propertyId!==listing.id)contact=undefined}}catch{/* Missing contact metadata never authorizes a custody fallback. */}
  const [photoUrls, seller] = await Promise.all([signPhotos(), contact?.personalContact?loadSeller():Promise.resolve(undefined)]);
  return new Response(renderListing(listing, photoUrls, SITE_URL, `${env.publicOrigin}/p/${listing.id}`, seller,contact,agencyId?{agencyId,...(managerId?{managerId}:{})}:undefined), { status: 200, headers: HTML });
}

export function GET(request: Request): Promise<Response> {
  return handle(request, {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    publicOrigin: new URL(request.url).origin,
  });
}
