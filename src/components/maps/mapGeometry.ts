import type { FeatureCollection, Polygon } from 'geojson';
import type { MapMarker } from './KarmaMap.types';
import { APPROXIMATE_RADIUS_METERS } from '../../domain/geo.ts';
import type { Coordinates } from '../../domain/geo';

export function coordinatesFromMapPress(latitude: number, longitude: number): Coordinates | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) return undefined;
  return { latitude, longitude: ((longitude + 180) % 360 + 360) % 360 - 180 };
}

export function approximateAreas(markers: readonly MapMarker[]): FeatureCollection<Polygon> {
  const radians = Math.PI / 180;
  const distance = APPROXIMATE_RADIUS_METERS / 6371008.8;
  return {
    type: 'FeatureCollection',
    features: markers.filter(marker => marker.precision === 'approximate').map(marker => {
      const latitude = marker.coordinate.latitude * radians;
      const longitude = marker.coordinate.longitude * radians;
      const ring = Array.from({ length: 64 }, (_, index) => {
        const bearing = index * Math.PI * 2 / 64;
        const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
        const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude));
        return [((nextLongitude / radians + 540) % 360) - 180, nextLatitude / radians];
      });
      ring.push([...ring[0]]);
      return { type: 'Feature', properties: { id: marker.id }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }),
  };
}
