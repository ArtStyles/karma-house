/** Public pages served by GitHub Pages from site/. The Google Play listing links to the same privacy and deletion pages. */
export const SITE_URL = 'https://artstyles.github.io/karma-house/';
export const PRIVACY_URL = `${SITE_URL}privacidad.html`;
export const TERMS_URL = `${SITE_URL}terminos.html`;

/** Public page of one listing, served by the `p` Edge Function; the site when Supabase is not configured (local demo). */
export function listingShareUrl(id: string): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/p/${id}` : SITE_URL;
}
