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
