export interface Coordinates { latitude: number; longitude: number }
export type LocationPrecision = 'exact' | 'approximate';
export interface MapLocation extends Coordinates { precision: LocationPrecision }

export const APPROXIMATE_RADIUS_METERS = 800;

export function isMapLocation(value: unknown): value is MapLocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Partial<MapLocation>;
  return typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    && (point.precision === 'exact' || point.precision === 'approximate');
}

/** Keep only the position the seller has chosen to publish, including in local storage. */
export function normalizeMapLocation(value: MapLocation): MapLocation {
  if (!isMapLocation(value)) throw new Error('La ubicación en el mapa no es válida.');
  const factor = value.precision === 'approximate' ? 100 : 1_000_000;
  const round = (coordinate: number) => Math.floor(coordinate * factor + 0.5) / factor || 0;
  return { latitude: round(value.latitude), longitude: round(value.longitude), precision: value.precision };
}
