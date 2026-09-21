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
