import type { ListingFilters } from '../domain/listings.ts';
import { CONDITIONS } from '../domain/listingOptions.ts';
import { parseDecimal } from '../domain/numericInput.ts';

export type CatalogFilterTag = { key: string; label: string };
const numbers = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const amount = (value: string) => numbers.format(parseDecimal(value));

function range(min: string | undefined, max: string | undefined, unit: 'price' | 'area'): string {
  const from = min?.trim() ?? '';
  const to = max?.trim() ?? '';
  const value = (text: string) => unit === 'price' ? `$${amount(text)}` : amount(text);
  const suffix = unit === 'area' ? ' m²' : '';
  return from && to ? `${value(from)} – ${value(to)}${suffix}`
    : from ? `Desde ${value(from)}${suffix}` : `Hasta ${value(to)}${suffix}`;
}

/** Query, operation and province already have visible controls above these tags. */
export function catalogFilterTags(filters: ListingFilters): CatalogFilterTag[] {
  const tags: CatalogFilterTag[] = [];
  if (filters.type !== 'Todas') tags.push({ key: 'type', label: filters.type === 'Casa' ? 'Casas' : 'Apartamentos' });
  if (filters.minPrice?.trim() || filters.maxPrice.trim()) tags.push({ key: 'price', label: range(filters.minPrice, filters.maxPrice, 'price') });
  if (filters.minBedrooms > 0) tags.push({ key: 'bedrooms', label: `${filters.minBedrooms}+ hab.` });
  if ((filters.minBathrooms ?? 0) > 0) tags.push({ key: 'bathrooms', label: `${filters.minBathrooms}+ baños` });
  if (filters.minArea?.trim() || filters.maxArea?.trim()) tags.push({ key: 'area', label: range(filters.minArea, filters.maxArea, 'area') });
  if (filters.condition) tags.push({ key: 'condition', label: CONDITIONS.find(option => option.value === filters.condition)?.label ?? filters.condition });
  if (filters.negotiableOnly) tags.push({ key: 'negotiable', label: 'Negociable' });
  for (const amenity of filters.amenities ?? []) tags.push({ key: `amenity:${amenity}`, label: amenity });
  return tags;
}

/** Read the latest state so removing two amenities cannot restore an earlier choice. */
export function removeCatalogFilter(filters: ListingFilters, key: string): ListingFilters {
  switch (key) {
    case 'type': return { ...filters, type: 'Todas' };
    case 'price': return { ...filters, minPrice: '', maxPrice: '' };
    case 'bedrooms': return { ...filters, minBedrooms: 0 };
    case 'bathrooms': return { ...filters, minBathrooms: 0 };
    case 'area': return { ...filters, minArea: '', maxArea: '' };
    case 'condition': return { ...filters, condition: '' };
    case 'negotiable': return { ...filters, negotiableOnly: false };
    default: return key.startsWith('amenity:')
      ? { ...filters, amenities: filters.amenities?.filter(value => value !== key.slice('amenity:'.length)) }
      : filters;
  }
}
