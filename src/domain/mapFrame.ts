import { isMapLocation, type BoundingBox, type Coordinates, type MapLocation } from './geo.ts';
import { PROVINCES } from './listingOptions.ts';

export interface ExploreFrame { center: Coordinates; zoom: number; bounds: BoundingBox }
/** Uses only already loaded public points; it never reads the catalog or infers locations. */
export function initialExploreFrame(province: string | undefined, context: readonly MapLocation[], width: number): ExploreFrame {
  const fallback = { center: { latitude: 21.7, longitude: -79.5 }, zoom: width >= 700 ? 5.6 : 4.6, bounds: { west: -85.2, south: 19.6, east: -73.9, north: 23.4 } };
  if (!province || !PROVINCES.includes(province)) return fallback;
  const points = context.filter(isMapLocation).filter(point => point.latitude >= 19.6 && point.latitude <= 23.4 && point.longitude >= -85.2 && point.longitude <= -73.9);
  if (!points.length) return fallback;
  const west = Math.min(...points.map(point => point.longitude));
  const east = Math.max(...points.map(point => point.longitude));
  const south = Math.min(...points.map(point => point.latitude));
  const north = Math.max(...points.map(point => point.latitude));
  const center = { latitude: (south + north) / 2, longitude: (west + east) / 2 };
  const longitudeSpan = Math.max(.08, (east - west) * 1.4);
  const latitudeSpan = Math.max(.08, (north - south) * 1.4);
  const usableWidth = Math.max(240, Math.min(width - 44, 1000));
  const zoom = Math.max(4.6, Math.min(11, Math.log2(Math.min(usableWidth / 512 * 360 / longitudeSpan, 350 / 512 * 360 / latitudeSpan))));
  return { center, zoom, bounds: {
    west: center.longitude - longitudeSpan / 2, east: center.longitude + longitudeSpan / 2,
    south: center.latitude - latitudeSpan / 2, north: center.latitude + latitudeSpan / 2,
  } };
}
