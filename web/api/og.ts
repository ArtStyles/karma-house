// GET /og/p/<uuid>[?agencyId=<uuid>] and /og/agency/<uuid> (rewritten by vercel.json to /api/og) → the 1200×630
// card that WhatsApp, Telegram and the rest show when a listing or an agency link is shared. Reads with the anon key,
// like /p and /agency, and embeds the photo or logo so the card never points at an expiring signed URL.
// Keep this function self-contained (see agency.ts): only package imports.
import { ImageResponse } from '@vercel/og';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const W = 1200, H = 630;
// Drawn at 1200×630 and delivered smaller: a photo in a PNG weighs too much for WhatsApp's preview at full size.
const SCALE = 0.7; // 840×441, about 290 KB with a photo.
// BRAND.md day palette: cal ground, white cards, sand hairlines, one blue.
const C = { cal: '#FAF6EE', arena: '#F2EADC', line: '#E6DCCB', ink: '#1A2B3B', body: '#4D5A66', blue: '#0153A8', ocre: '#8A5C15', white: '#FFFFFF' };

export interface Env { supabaseUrl: string; anonKey: string; publicOrigin: string }
type Op = 'sale' | 'swap' | 'wanted' | 'rent';
export interface ListingCard { title: string; place: string; facts: string; op: Op; price: string; unit: string; photo?: string; agency?: { name: string; seal: string } }
export interface AgencyCard { name: string; place: string; seal: string; logo?: string; initials: string }

const SIGNS: Record<Op, string> = { sale: 'Se vende', rent: 'Se alquila', swap: 'Se permuta', wanted: 'Se busca' };

/** Same grouping as /p and the app (`85,000`). */
export function formatPrice(value: number | string): string {
  return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The seal never says «verificada» (BRAND.md). */
export const sealText = (verified: boolean, principal: boolean) => verified ? (principal ? 'Inmobiliaria principal' : 'Sello empresarial') : '';

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(w => /\p{L}/u.test(w[0] ?? '')).slice(0, 2).map(w => w[0].toLocaleUpperCase('es')).join('') || 'K';
}

type Node = { type: string; props: Record<string, unknown> };
// A lone child goes in bare: Satori counts an array as several children and then demands display: flex.
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | false | undefined)[]): Node => {
  const kept = children.filter(c => c !== false && c !== undefined);
  return { type, props: { style, children: kept.length === 1 ? kept[0] : kept } };
};
const img = (src: string, width: number, height: number, style: Record<string, unknown> = {}): Node => ({ type: 'img', props: { src, width, height, style } });

// The mediopunto: a half-round top over a straight-sided window, as in the app's lists.
const ARCH = { width: 470, height: 534, borderRadius: '235px 235px 28px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.arena, border: `2px solid ${C.line}` };

function frame(arch: Node, ...right: (Node | false | undefined)[]): Node {
  return h('div', { width: W, height: H, display: 'flex', gap: 56, padding: 48, backgroundColor: C.cal, fontFamily: 'Geist', color: C.ink },
    arch,
    h('div', { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }, ...right));
}

/** The brand PNGs, inlined: Satori clips a remote image inside the scaled card. */
export interface Assets { logo?: string; mark?: string }
const logo = (a: Assets) => a.logo ? img(a.logo, 112, 72, { marginTop: 'auto' }) : undefined;
/** Cuts at a word and adds «…»: Satori's lineClamp spreads the words of a block apart. */
export function cut(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[\s,.;:·-]+$/, '')}…`;
}
const line = { display: 'flex' };

export function listingTree(card: ListingCard, a: Assets): Node {
  const arch = h('div', ARCH, card.photo ? img(card.photo, 466, 530, { objectFit: 'cover', borderRadius: '233px 233px 26px 26px' }) : a.mark && img(a.mark, 192, 150));
  return frame(arch,
    h('div', { display: 'flex', alignSelf: 'flex-start', padding: '6px 20px', backgroundColor: C.white, border: `2px solid ${C.line}`, borderRadius: 6, fontFamily: 'Calistoga', fontSize: 30 }, SIGNS[card.op]),
    h('div', { display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 28 },
      h('div', { fontFamily: 'Calistoga', fontSize: card.price.length > 9 ? 54 : 68, lineHeight: 1, color: C.blue }, card.price),
      h('div', { fontSize: 28, color: C.body }, card.unit)),
    h('div', { ...line, marginTop: 22, fontSize: 32, lineHeight: 1.25 }, cut(card.title, 64)),
    h('div', { ...line, marginTop: 14, fontSize: 26, color: C.body }, cut(card.place, 38)),
    h('div', { ...line, marginTop: 4, fontSize: 26, color: C.body }, cut(card.facts, 38)),
    card.agency && h('div', { display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, fontSize: 24 },
      h('div', line, cut(card.agency.name, 28)),
      !!card.agency.seal && h('div', { display: 'flex', padding: '4px 14px', borderRadius: 999, border: `2px solid ${C.line}`, backgroundColor: C.white, color: C.ocre, fontSize: 20 }, card.agency.seal)),
    logo(a));
}

export function agencyTree(card: AgencyCard, a: Assets): Node {
  const arch = h('div', ARCH, card.logo
    ? h('div', { display: 'flex', width: 300, height: 300, borderRadius: 32, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, img(card.logo, 300, 300, { objectFit: 'cover', borderRadius: 32 }))
    : h('div', { fontFamily: 'Calistoga', fontSize: 150, color: C.blue }, card.initials));
  return frame(arch,
    h('div', { fontSize: 26, color: C.body }, 'Inmobiliaria en KarmaHouse'),
    h('div', { ...line, marginTop: 16, fontFamily: 'Calistoga', fontSize: 60, lineHeight: 1.1 }, cut(card.name, 40)),
    !!card.seal && h('div', { display: 'flex', alignSelf: 'flex-start', marginTop: 24, padding: '6px 18px', borderRadius: 999, border: `2px solid ${C.line}`, backgroundColor: C.white, color: C.ocre, fontSize: 24 }, card.seal),
    !!card.place && h('div', { ...line, marginTop: 22, fontSize: 28, color: C.body }, cut(card.place, 60)),
    logo(a));
}

export function fallbackTree(a: Assets): Node {
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36, backgroundColor: C.cal, fontFamily: 'Geist', color: C.ink },
    a.logo && img(a.logo, 250, 161),
    h('div', { display: 'flex', fontFamily: 'Calistoga', fontSize: 64 }, 'Tu casa ', h('span', { color: C.blue }, 'en Cuba')),
    h('div', { fontSize: 32, color: C.body }, 'para comprar, vender, permutar o alquilar'));
}

let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400; style: 'normal' }[]> | undefined;
/** Both fonts are the site's own files in public/og (OFL). Cached for the life of the instance. */
function loadFonts(origin: string, fetcher: typeof fetch) {
  const font = (file: string) => fetcher(`${origin}/og/${file}`).then(r => { if (!r.ok) throw Error(`font ${r.status}`); return r.arrayBuffer(); });
  const geist = font('Geist-Regular.ttf'), calistoga = font('Calistoga.ttf');
  // Either face stands in for the other rather than losing the card.
  fonts ??= Promise.all([geist.catch(() => calistoga), calistoga.catch(() => geist)]).then(([g, c]) => [
    { name: 'Geist', data: g, weight: 400, style: 'normal' }, { name: 'Calistoga', data: c, weight: 400, style: 'normal' }]);
  fonts.catch(() => { fonts = undefined; });
  return fonts;
}

const UNITLESS = new Set(['flex', 'flexGrow', 'flexShrink', 'lineHeight', 'opacity']);
/** Multiplies every length in the card (Satori's transform: scale clips images, so the sizes shrink instead). */
export function scaleTree(node: Node, k: number): Node {
  const size = (v: unknown, key: string): unknown => typeof v === 'number' && !UNITLESS.has(key) ? Math.round(v * k * 10) / 10
    : typeof v === 'string' ? v.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(Number(n) * k * 10) / 10}px`) : v;
  const style = Object.fromEntries(Object.entries((node.props.style ?? {}) as Record<string, unknown>).map(([key, v]) => [key, size(v, key)]));
  const kids = node.props.children;
  const children = Array.isArray(kids) ? kids.map(c => typeof c === 'object' ? scaleTree(c as Node, k) : c) : typeof kids === 'object' && kids ? scaleTree(kids as Node, k) : kids;
  const box = node.type === 'img' ? { width: size(node.props.width, 'width'), height: size(node.props.height, 'height') } : {};
  return { type: node.type, props: { ...node.props, ...box, style, ...(kids === undefined ? {} : { children }) } };
}

let assets: Promise<Assets> | undefined;
function loadAssets(origin: string, fetcher: typeof fetch): Promise<Assets> {
  assets ??= Promise.all([inline(`${origin}/karmahouse-logo.png`, fetcher), inline(`${origin}/karmahouse-mark.png`, fetcher)])
    .then(([logo, mark]) => { if (!logo || !mark) assets = undefined; return { logo, mark }; });
  return assets;
}

/** Fetches an image and inlines it, only if it is a JPEG or PNG of reasonable size. */
async function inline(url: string, fetcher: typeof fetch): Promise<string | undefined> {
  try {
    const r = await fetcher(url);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 4_000_000) return undefined;
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : '';
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return mime ? `data:${mime};base64,${btoa(binary)}` : undefined;
  } catch { return undefined; }
}

type Row = { id: string; title: string; location: string; province: string; type: string | null; price: number | string; area: number | string | null; bedrooms: number; bathrooms: number | null; photo_paths: string[] | null; operation: Op | null; rent_period: 'month' | 'day' | null };
const COLUMNS = 'id,title,location,province,type,price,area,bedrooms,bathrooms,photo_paths,operation,rent_period';

export function listingCard(row: Row, photo?: string, agency?: ListingCard['agency']): ListingCard {
  const op = row.operation ?? 'sale', amount = formatPrice(row.price);
  const facts = op === 'wanted' ? `Desde ${row.bedrooms} hab · ${row.type ?? 'Casa o apartamento'}`
    : [`${row.bedrooms} hab`, row.bathrooms == null ? '' : `${row.bathrooms} ${row.bathrooms === 1 ? 'baño' : 'baños'}`, row.area == null ? '' : `${Number(row.area)} m²`].filter(Boolean).join(' · ');
  return {
    op, title: row.title, place: `${row.location}, ${row.province}`, facts, photo, agency,
    price: op === 'wanted' ? `Hasta ${amount}` : amount,
    unit: op === 'rent' ? `USD / ${row.rent_period === 'day' ? 'noche' : 'mes'}` : op === 'swap' ? 'USD · valor estimado' : 'USD',
  };
}

async function readListing(id: string, agencyId: string | null, base: string, auth: Record<string, string>, fetcher: typeof fetch): Promise<ListingCard | undefined> {
  const select = async (pid: string) => {
    const r = await fetcher(`${base}/rest/v1/properties?select=${COLUMNS}&id=eq.${pid}&moderation=eq.approved&availability=eq.active&limit=1`, { headers: auth });
    if (!r.ok) throw Error(`rest ${r.status}`);
    const [row] = (await r.json()) as Row[];
    return row && row.id === pid ? row : undefined;
  };
  const post = (path: string, body: unknown) => fetcher(`${base}${path}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let row = await select(id);
  if (!row) {
    const alias = await post('/rest/v1/rpc/kh_resolve_property_alias', { p_property_id: id });
    const canonical: unknown = alias.ok ? await alias.json() : null;
    if (typeof canonical === 'string' && UUID.test(canonical) && canonical !== id) row = await select(canonical);
  }
  if (!row) return undefined;
  const listing = row;
  const photo = async () => {
    const path = listing.photo_paths?.[0];
    if (!path) return undefined;
    const r = await post('/storage/v1/object/sign/property-photos', { expiresIn: 60, paths: [path] });
    const [item] = r.ok ? (await r.json()) as { signedURL?: string | null }[] : [];
    return item?.signedURL ? inline(`${base}/storage/v1${item.signedURL}`, fetcher) : undefined;
  };
  const agency = async () => {
    if (!agencyId) return undefined;
    const r = await post('/rest/v1/rpc/kh_public_property_contact', { p_property_id: listing.id });
    const contact = r.ok ? await r.json() as { agencies?: { agencyId?: unknown; tradeName?: unknown; verified?: unknown; isPrincipal?: unknown }[] } : null;
    const a = contact?.agencies?.find(x => x.agencyId === agencyId);
    return a && typeof a.tradeName === 'string' ? { name: a.tradeName, seal: sealText(a.verified === true, a.isPrincipal === true) } : undefined;
  };
  const [p, a] = await Promise.all([photo().catch(() => undefined), agency().catch(() => undefined)]);
  return listingCard(listing, p, a);
}

async function readAgency(id: string, base: string, auth: Record<string, string>, fetcher: typeof fetch): Promise<AgencyCard | undefined> {
  const headers = { ...auth, 'Content-Type': 'application/json' };
  const r = await fetcher(`${base}/rest/v1/rpc/kh_public_agency_profile`, { method: 'POST', headers, body: JSON.stringify({ p_agency_id: id }) });
  if (!r.ok) throw Error(`agency ${r.status}`);
  const p = await r.json() as { agencyId?: unknown; tradeName?: unknown; verified?: unknown; isPrincipal?: unknown; municipality?: unknown; province?: unknown; logoPath?: unknown } | null;
  if (!p || p.agencyId !== id || typeof p.tradeName !== 'string') return undefined;
  let logo: string | undefined;
  if (typeof p.logoPath === 'string' && new RegExp(`^${id}/logos/[0-9a-f-]{36}\\.jpg$`, 'i').test(p.logoPath)) {
    try {
      const s = await fetcher(`${base}/storage/v1/object/sign/agency-assets/${p.logoPath}`, { method: 'POST', headers, body: JSON.stringify({ expiresIn: 60 }) });
      const v = s.ok ? await s.json() as { signedURL?: unknown } : {};
      if (typeof v.signedURL === 'string') logo = await inline(v.signedURL.startsWith('/object/') ? `${base}/storage/v1${v.signedURL}` : new URL(v.signedURL, base).href, fetcher);
    } catch { /* Initials stand in for the logo. */ }
  }
  const place = [p.municipality, p.province].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(', ');
  return { name: p.tradeName.trim(), place, seal: sealText(p.verified === true, p.isPrincipal === true), logo, initials: initials(p.tradeName) };
}

export async function handleOg(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind'), id = url.searchParams.get('id') ?? '', agencyId = url.searchParams.get('agencyId');
  const origin = env.publicOrigin.replace(/\/+$/, '');
  const assets = await loadAssets(origin, fetcher);
  let tree = fallbackTree(assets), maxAge = 300;
  if ((kind === 'p' || kind === 'agency') && UUID.test(id) && (!agencyId || UUID.test(agencyId)) && env.supabaseUrl && env.anonKey) {
    const base = env.supabaseUrl.replace(/\/+$/, ''), auth = { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
    try {
      if (kind === 'p') { const card = await readListing(id, agencyId, base, auth, fetcher); if (card) { tree = listingTree(card, assets); maxAge = 3600; } }
      else { const card = await readAgency(id, base, auth, fetcher); if (card) { tree = agencyTree(card, assets); maxAge = 3600; } }
    } catch (error) {
      // A shared link still shows the brand card; the reason goes to the logs.
      console.error('og card failed', error instanceof Error ? error.message : error);
    }
  }
  // ImageResponse marks every image immutable for a year; a listing sells and a logo changes, so the edge keeps it an hour.
  const image = new ImageResponse(scaleTree(tree, SCALE) as never, { width: Math.round(W * SCALE), height: Math.round(H * SCALE), fonts: await loadFonts(origin, fetcher) });
  return new Response(image.body, { status: 200, headers: {
    'Content-Type': 'image/png', 'Cache-Control': `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=86400`, 'X-Content-Type-Options': 'nosniff' } });
}

export function GET(request: Request): Promise<Response> {
  return handleOg(request, { supabaseUrl: process.env.SUPABASE_URL ?? '', anonKey: process.env.SUPABASE_ANON_KEY ?? '', publicOrigin: new URL(request.url).origin });
}
