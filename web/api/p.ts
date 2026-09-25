// GET /p/<uuid> (rewritten by vercel.json to /api/p?id=<uuid>) → public HTML page of an
// approved, active listing. Reads with the anon key: the same rows and photos anon can
// already read through the app, nothing more.
import { renderListing, renderUnavailable, type PublicListingRow } from '../lib/render.ts';

export const SITE_URL = 'https://artstyles.github.io/karma-house/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,condition,floor,price_negotiable';
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' };

export interface Env { supabaseUrl: string; anonKey: string; publicOrigin: string }
type Row = PublicListingRow & { photo_paths: string[] | null };

function unavailable(): Response {
  return new Response(renderUnavailable(SITE_URL), { status: 404, headers: HTML });
}

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!UUID.test(id)) return unavailable();

  const base = env.supabaseUrl.replace(/\/+$/, '');
  const auth = { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
  let row: Row | undefined;
  try {
    const rows = await fetchImpl(`${base}/rest/v1/properties?select=${COLUMNS}&id=eq.${id}&moderation=eq.approved&availability=eq.active&limit=1`, { headers: auth });
    if (!rows.ok) throw new Error(`rest ${rows.status}`);
    [row] = (await rows.json()) as Row[];
  } catch (error) {
    console.error('properties query failed', error instanceof Error ? error.message : error);
    return new Response('Service Unavailable', { status: 503, headers: { 'Retry-After': '30' } });
  }
  if (!row) return unavailable();

  let photoUrls: string[] = [];
  if (row.photo_paths?.length) {
    try {
      const signed = await fetchImpl(`${base}/storage/v1/object/sign/property-photos`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600, paths: row.photo_paths }),
      });
      if (!signed.ok) throw new Error(`storage ${signed.status}`);
      const items = (await signed.json()) as { signedURL?: string | null; error?: string | null }[];
      photoUrls = items.filter((item) => item.signedURL && !item.error).map((item) => `${base}/storage/v1${item.signedURL}`);
    } catch (error) {
      // The page is still useful without photos.
      console.error('photo signing failed', error instanceof Error ? error.message : error);
    }
  }
  return new Response(renderListing(row, photoUrls, SITE_URL, `${env.publicOrigin}/p/${row.id}`), { status: 200, headers: HTML });
}

export function GET(request: Request): Promise<Response> {
  return handle(request, {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    publicOrigin: new URL(request.url).origin,
  });
}
