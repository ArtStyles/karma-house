/** Public pages served by GitHub Pages from site/. The Google Play listing links to the same privacy and deletion pages. */
export const SITE_URL = 'https://artstyles.github.io/karma-house/';
export const PRIVACY_URL = `${SITE_URL}privacidad.html`;
export const TERMS_URL = `${SITE_URL}terminos.html`;
/** Per-listing pages served by the Vercel project in web/ (rich previews on WhatsApp, Telegram and Facebook). */
export const PUBLIC_PAGES_URL = 'https://karmahouse.vercel.app/';
export function listingShareUrl(id: string): string {
  return `${PUBLIC_PAGES_URL}p/${id}`;
}
