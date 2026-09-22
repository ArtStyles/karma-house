export interface Coordinates { latitude: number; longitude: number }
export type LocationPrecision = 'exact' | 'approximate';
export interface MapLocation extends Coordinates { precision: LocationPrecision }
/** Geographic box in the order MapLibre reports it: south-west then north-east corner. */
export interface BoundingBox { west: number; south: number; east: number; north: number }

/**
 * Normalises a viewport box for a server query: clamps to valid latitudes, widens a box
 * crossing the antimeridian to the whole world rather than sending an inverted range, and
 * rounds so a sub-metre pan does not count as a new viewport.
 */
export function viewportBounds(west: number, south: number, east: number, north: number): BoundingBox | null {
  if (![west, south, east, north].every(Number.isFinite)) return null;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const wrapped = east < west;
  return {
    west: wrapped ? -180 : round(Math.max(west, -180)),
    east: wrapped ? 180 : round(Math.min(east, 180)),
    south: round(Math.max(south, -90)),
    north: round(Math.min(north, 90)),
  };
}

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
