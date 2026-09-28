// Presentation of a listing according to its operation: badge, price label, facts line
// and share text. Pure so the card, the detail screen, the public page and tests agree.
import type { Listing, ListingOperation, ListingSwap } from './listings.ts';
import { OPERATIONS, WANTED_OPERATIONS } from './listingOptions.ts';
export { operationsFor } from './listings.ts';

const money = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;

export function listingOperation(listing: Pick<Listing, 'operation'>): ListingOperation {
  return listing.operation ?? 'sale';
}

/** Empty for a sale: the badge only speaks when it tells something apart. */
export function operationBadge(listing: Pick<Listing, 'operation'>): string {
  const operation = listingOperation(listing);
  return operation === 'sale' ? '' : OPERATIONS.find((item) => item.value === operation)!.badge;
}

export function priceLabel(listing: Pick<Listing, 'operation'>): 'Precio' | 'Valor estimado' | 'Presupuesto máximo' | 'Alquiler' {
  const operation = listingOperation(listing);
  return operation === 'wanted' ? 'Presupuesto máximo' : operation === 'swap' ? 'Valor estimado' : operation === 'rent' ? 'Alquiler' : 'Precio';
}

/** What the price is per: « / mes» or « / noche» for a rental, nothing otherwise. */
export function priceSuffix(listing: Pick<Listing, 'operation' | 'rent'>): string {
  if (listingOperation(listing) !== 'rent' || !listing.rent) return '';
  return listing.rent.period === 'day' ? ' / noche' : ' / mes';
}

/** «comprar, permutar o alquilar»: what a wanted ad is after, buying or swapping when unknown. */
export function wantedOperationsText(listing: Pick<Listing, 'wantedOperations'>): string {
  const wanted = listing.wantedOperations ?? ['sale', 'swap'];
  const words = WANTED_OPERATIONS.filter((item) => wanted.includes(item.value)).map((item) => item.label.toLowerCase());
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} o ${words[words.length - 1]}` : words.join('');
}

export function typeLabel(listing: Pick<Listing, 'type'>): string {
  return listing.type ?? 'Casa o apartamento';
}

export function listingFacts(listing: Pick<Listing, 'operation' | 'bedrooms' | 'bathrooms' | 'area' | 'type'>): string {
  if (listingOperation(listing) === 'wanted') return `desde ${listing.bedrooms} hab · ${typeLabel(listing)}`;
  return `${listing.bedrooms} hab · ${listing.bathrooms} ${listing.bathrooms === 1 ? 'baño' : 'baños'} · ${listing.area} m²`;
}

export function swapBalanceText(swap: Pick<ListingSwap, 'balance' | 'amount'>): string {
  if (swap.balance === 'none') return 'Sin diferencia';
  if (swap.balance === 'pay') return swap.amount ? `Añade hasta ${money(swap.amount)}` : 'Añade dinero';
  return swap.amount ? `Pide ${money(swap.amount)}` : 'Pide dinero';
}

export function shareText(listing: Listing, url: string): string {
  const operation = listingOperation(listing);
  const title = operation === 'sale' ? listing.title : `${operationBadge(listing)}: ${listing.title}`;
  const price = operation === 'wanted' ? `Hasta ${money(listing.price)} USD` : operation === 'swap' ? `Valor estimado ${money(listing.price)} USD` : `${money(listing.price)} USD${priceSuffix(listing)}`;
  return `${title}\n${price} · ${listing.location}, ${listing.province}\n${listingFacts(listing)}\n\n${url}`;
}
