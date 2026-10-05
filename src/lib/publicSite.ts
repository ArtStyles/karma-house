/** Official landing and per-listing pages served by the Vercel project in web/. */
export const SITE_URL = 'https://karmahouse.vercel.app/';
export const PUBLIC_PAGES_URL = SITE_URL;
/** Legal documents remain served by GitHub Pages from site/. */
const LEGAL_PAGES_URL = 'https://artstyles.github.io/karma-house/';
export const PRIVACY_URL = `${LEGAL_PAGES_URL}privacidad.html`;
export const TERMS_URL = `${LEGAL_PAGES_URL}terminos.html`;
export function listingShareUrl(id: string): string {
  return `${PUBLIC_PAGES_URL}p/${id}`;
}
