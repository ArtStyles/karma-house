import { searchPayload } from '../catalog/query.ts';
import { activeFilterCount, defaultFilters, type ListingFilters, type ListingOperation } from '../domain/listings.ts';
import { CONDITIONS, isListingCondition, isListingOperation, OPERATIONS } from '../domain/listingOptions.ts';
import { isUuid } from '../messaging/domain.ts';
import type { SavedSearch, SavedSearchFilters } from './types.ts';

export class SavedSearchError extends Error {}

const money = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;
const FILTER_KEYS = ['query', 'type', 'province', 'condition', 'min_price', 'max_price', 'min_area', 'max_area',
  'min_bedrooms', 'min_bathrooms', 'negotiable_only', 'amenities', 'operations'];

/** Same translation as the catalogue request, so an alert never matches differently from Explorar. */
export function toSavedFilters(filters: ListingFilters): SavedSearchFilters {
  const { sort: _sort, cursor: _cursor, with_total: _withTotal, limit: _limit, type, ...rest } = searchPayload(filters, null, false);
  return { ...rest, type: type === 'Casa' || type === 'Apartamento' ? type : null };
}

export function fromSavedFilters(saved: SavedSearchFilters): ListingFilters {
  const text = (value: number | null) => value === null ? '' : String(value);
  return {
    ...defaultFilters,
    query: saved.query, type: saved.type ?? 'Todas', province: saved.province ?? '',
    condition: isListingCondition(saved.condition) ? saved.condition : '',
    minPrice: text(saved.min_price), maxPrice: text(saved.max_price), minArea: text(saved.min_area), maxArea: text(saved.max_area),
    minBedrooms: saved.min_bedrooms, minBathrooms: saved.min_bathrooms ?? 0, negotiableOnly: saved.negotiable_only === true,
    amenities: [...saved.amenities],
    // Explorar only offers «sale + swap» or a single operation.
    operation: saved.operations.length === 1 ? saved.operations[0] : 'offers',
  };
}

export function searchName(filters: ListingFilters): string {
  if (activeFilterCount(filters) === 0) return 'Todas las viviendas';
  const saved = toSavedFilters(filters);
  const operation = filters.operation ?? 'offers';
  const parts = [operation === 'wanted' ? 'Busco' : operation === 'swap' ? 'Permutas'
    : saved.type === 'Casa' ? 'Casas' : saved.type === 'Apartamento' ? 'Apartamentos' : 'Viviendas'];
  if (filters.query.trim()) parts.push(`«${filters.query.trim()}»`);
  if (saved.min_bedrooms > 0) parts.push(`de ${saved.min_bedrooms}+ hab`);
  parts.push(saved.province ? `en ${saved.province}` : 'en toda Cuba');
  if (saved.max_price !== null) parts.push(`hasta ${money(saved.max_price)}`);
  return parts.join(' ');
}

function range(low: number | null, high: number | null, format: (value: number) => string): string | null {
  if (low !== null && high !== null) return `${format(low)} – ${format(high)}`;
  if (low !== null) return `desde ${format(low)}`;
  return high === null ? null : `hasta ${format(high)}`;
}

export function describeSearch(saved: SavedSearchFilters): string {
  const operations = OPERATIONS.filter(item => saved.operations.includes(item.value))
    .map((item, index) => index ? item.badge.toLowerCase() : item.badge).join(' y ');
  return [
    operations,
    saved.query ? `«${saved.query}»` : null,
    saved.province ?? 'Toda Cuba',
    range(saved.min_price, saved.max_price, money),
    saved.min_bedrooms > 0 ? `${saved.min_bedrooms}+ hab` : null,
    saved.min_bathrooms ? `${saved.min_bathrooms}+ baños` : null,
    range(saved.min_area, saved.max_area, value => `${value} m²`),
    CONDITIONS.find(item => item.value === saved.condition)?.label ?? null,
    saved.negotiable_only ? 'Negociable' : null,
    ...saved.amenities,
  ].filter(Boolean).join(' · ');
}

const invalid = () => new SavedSearchError('No se pudieron interpretar tus alertas. Actualiza la lista.');
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const amount = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown, min: number) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= 20;
const nullableText = (value: unknown) => value === null || typeof value === 'string' && value.length > 0 && value.length <= 80;

function decodeFilters(value: unknown): SavedSearchFilters {
  const item = record(value);
  const keys = Object.keys(item);
  if (keys.length !== FILTER_KEYS.length || !FILTER_KEYS.every(key => keys.includes(key))
    || typeof item.query !== 'string' || [...item.query].length > 80
    || !(item.type === null || item.type === 'Casa' || item.type === 'Apartamento')
    || !nullableText(item.province) || !(item.condition === null || isListingCondition(item.condition))
    || ![item.min_price, item.max_price, item.min_area, item.max_area].every(amount)
    || !count(item.min_bedrooms, 0) || !(item.min_bathrooms === null || count(item.min_bathrooms, 1))
    || !(item.negotiable_only === null || item.negotiable_only === true)
    || !Array.isArray(item.amenities) || item.amenities.length > 20 || item.amenities.some(entry => typeof entry !== 'string' || entry.length > 60)
    || !Array.isArray(item.operations) || item.operations.length === 0 || !item.operations.every(isListingOperation)
    || new Set(item.operations).size !== item.operations.length) throw invalid();
  return {
    query: item.query, type: item.type, province: item.province as string | null, condition: item.condition as string | null,
    min_price: item.min_price as number | null, max_price: item.max_price as number | null,
    min_area: item.min_area as number | null, max_area: item.max_area as number | null,
    min_bedrooms: item.min_bedrooms as number, min_bathrooms: item.min_bathrooms as number | null,
    negotiable_only: item.negotiable_only, amenities: [...item.amenities as string[]], operations: [...item.operations as ListingOperation[]],
  };
}

export function decodeSavedSearch(value: unknown): SavedSearch {
  const item = record(value);
  const name = typeof item.name === 'string' ? [...item.name].length : 0;
  if (!isUuid(item.id) || name < 1 || name > 60 || typeof item.enabled !== 'boolean'
    || !Number.isSafeInteger(item.version) || (item.version as number) < 1
    || !timestamp(item.createdAt) || !timestamp(item.updatedAt)) throw invalid();
  return { id: item.id, name: item.name as string, filters: decodeFilters(item.filters), enabled: item.enabled,
    version: item.version as number, createdAt: item.createdAt, updatedAt: item.updatedAt };
}

export function savedSearchErrorMessage(error: unknown): string {
  if (error instanceof SavedSearchError) return error.message;
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/ACCOUNT_CHANGED|SESSION_CHANGED/.test(message)) return 'La sesión cambió. Abre tus alertas con la cuenta actual.';
  if (/AUTH_REQUIRED|JWT|token.*expired|PGRST301/i.test(message)) return 'Inicia sesión de nuevo para consultar tus alertas.';
  if (/network|fetch|timeout|abort/i.test(message)) return 'No se pudo conectar. Vuelve a intentar cuando tengas conexión.';
  return 'No se pudieron actualizar tus alertas. Inténtalo de nuevo.';
}
