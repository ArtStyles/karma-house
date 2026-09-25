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
export const AMENITIES: readonly string[] = [
  'Balcón', 'Patio', 'Garaje', 'Amueblado', 'Aire acondicionado', 'Ascensor',
  'Terraza', 'Piscina', 'Cisterna', 'Tanque de agua', 'Entrada independiente',
];
export function isListingCondition(value: unknown): value is ListingCondition {
  return value === 'new' || value === 'good' || value === 'needs-renovation';
}
export function isDraftFloor(value: unknown): value is string {
  return typeof value === 'string' && (value.trim() === '' ||
    Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99);
}
export type ListingOperation = 'sale' | 'swap' | 'wanted';
export type SwapBalance = 'none' | 'pay' | 'receive';
export const OPERATIONS: readonly { value: ListingOperation; label: string; badge: string; description: string }[] = [
  { value: 'sale', label: 'Vender', badge: 'Venta', description: 'Publica tu vivienda con precio.' },
  { value: 'swap', label: 'Permutar', badge: 'Permuta', description: 'Ofreces tu vivienda a cambio de otra.' },
  { value: 'wanted', label: 'Busco vivienda', badge: 'Busco', description: 'Cuenta qué buscas y deja que te escriban.' },
];
export const SWAP_BALANCES: readonly { value: SwapBalance; label: string }[] = [
  { value: 'none', label: 'Sin diferencia' },
  { value: 'pay', label: 'Yo añado dinero' },
  { value: 'receive', label: 'Pido dinero' },
];
export function isListingOperation(value: unknown): value is ListingOperation {
  return value === 'sale' || value === 'swap' || value === 'wanted';
}
export function isSwapBalance(value: unknown): value is SwapBalance {
  return value === 'none' || value === 'pay' || value === 'receive';
}
export function isProvince(value: unknown): value is string {
  return typeof value === 'string' && PROVINCES.includes(value);
}
