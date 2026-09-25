// supabase/functions/p/index.ts
// GET /functions/v1/p/<uuid> → public HTML page of an approved, active listing.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderListing, renderUnavailable, type PublicListingRow } from './render.ts';

const SITE_URL = 'https://artstyles.github.io/karma-house/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' };
const COLUMNS = 'id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,condition,floor,price_negotiable';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

function unavailable(): Response {
  return new Response(renderUnavailable(SITE_URL), { status: 404, headers: HTML });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const id = url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!UUID.test(id)) return unavailable();

  const { data, error } = await supabase.from('properties').select(COLUMNS)
    .eq('id', id).eq('moderation', 'approved').eq('availability', 'active').maybeSingle();
  if (error) {
    console.error('properties query failed', error.code, error.message);
    return new Response('Service Unavailable', { status: 503, headers: { 'Retry-After': '30' } });
  }
  if (!data) return unavailable();

  const row = data as unknown as PublicListingRow & { photo_paths: string[] | null };
  let photoUrls: string[] = [];
  if (row.photo_paths?.length) {
    const signed = await supabase.storage.from('property-photos').createSignedUrls(row.photo_paths, 3600);
    if (signed.error) console.error('photo signing failed', signed.error.message);
    else photoUrls = signed.data.filter((item) => item.signedUrl && !item.error).map((item) => item.signedUrl);
  }

  const selfUrl = `${url.origin}${url.pathname}`;
  return new Response(renderListing(row, photoUrls, SITE_URL, selfUrl), { status: 200, headers: HTML });
});
