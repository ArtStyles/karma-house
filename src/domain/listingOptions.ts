export type ListingCondition = 'new' | 'good' | 'needs-renovation';

// 15 provinces and the special municipality, listed by Cuba's official tourism portal:
// https://www.cuba.travel/sobre-cuba/sociedad-de-cuba
export const PROVINCES: readonly string[] = [
  'Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Villa Clara',
  'Cienfuegos', 'Sancti Spíritus', 'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín',
  'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud',
];
export const CONDITIONS: readonly { value: ListingCondition; label: string }[] = [
  { value: 'new', label: 'Nuevo' },
  { value: 'good', label: 'Buen estado' },
  { value: 'needs-renovation', label: 'A reformar' },
];
/** What Cuban ads advertise, grouped for the form and the filters. The server does not whitelist values. */
export const AMENITY_GROUPS: readonly { title: string; items: readonly string[] }[] = [
  { title: 'Servicios', items: ['Gas de la calle', 'Agua todos los días', 'Teléfono fijo', 'Respaldo eléctrico', 'Cisterna', 'Tanque de agua'] },
  { title: 'Espacios', items: ['Portal', 'Patio', 'Terraza', 'Balcón', 'Azotea o placa libre', 'Garaje', 'Parqueo', 'Piscina'] },
  { title: 'Equipamiento', items: ['Amueblado', 'Aire acondicionado', 'Ascensor', 'Entrada independiente'] },
];
export const AMENITIES: readonly string[] = AMENITY_GROUPS.flatMap((group) => group.items);
export function isListingCondition(value: unknown): value is ListingCondition {
  return value === 'new' || value === 'good' || value === 'needs-renovation';
}
export function isDraftFloor(value: unknown): value is string {
  return typeof value === 'string' && (value.trim() === '' ||
    Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99);
}
export type ListingOperation = 'sale' | 'swap' | 'wanted' | 'rent';
export type RentPeriod = 'month' | 'day';
export type SwapBalance = 'none' | 'pay' | 'receive';
export const OPERATIONS: readonly { value: ListingOperation; label: string; badge: string; description: string }[] = [
  { value: 'sale', label: 'Vender', badge: 'Venta', description: 'Publica tu vivienda con precio.' },
  { value: 'swap', label: 'Permutar', badge: 'Permuta', description: 'Ofreces tu vivienda a cambio de otra.' },
  { value: 'wanted', label: 'Busco vivienda', badge: 'Busco', description: 'Cuenta qué buscas y deja que te escriban.' },
  { value: 'rent', label: 'Alquilar', badge: 'Alquiler', description: 'Ofreces tu vivienda por meses o por noches.' },
];
export const RENT_PERIODS: readonly { value: RentPeriod; label: string }[] = [
  { value: 'month', label: 'Por mes' },
  { value: 'day', label: 'Por noche' },
];
/** What a wanted ad can be after. */
export const WANTED_OPERATIONS: readonly { value: ListingOperation; label: string }[] = [
  { value: 'sale', label: 'Comprar' },
  { value: 'swap', label: 'Permutar' },
  { value: 'rent', label: 'Alquilar' },
];
export const SWAP_BALANCES: readonly { value: SwapBalance; label: string }[] = [
  { value: 'none', label: 'Sin diferencia' },
  { value: 'pay', label: 'Yo añado dinero' },
  { value: 'receive', label: 'Pido dinero' },
];
export function isListingOperation(value: unknown): value is ListingOperation {
  return value === 'sale' || value === 'swap' || value === 'wanted' || value === 'rent';
}
export function isRentPeriod(value: unknown): value is RentPeriod {
  return value === 'month' || value === 'day';
}
/** A non-empty list of distinct operations a wanted ad can be after. */
export function isWantedOperations(value: unknown): value is ListingOperation[] {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length
    && value.every((item) => WANTED_OPERATIONS.some((option) => option.value === item));
}
export function isRentMinStay(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 365;
}
export function isSwapBalance(value: unknown): value is SwapBalance {
  return value === 'none' || value === 'pay' || value === 'receive';
}
export function isProvince(value: unknown): value is string {
  return typeof value === 'string' && PROVINCES.includes(value);
}
