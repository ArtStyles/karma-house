import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import type { Coordinates } from '../../domain/geo';

export const CUBA_CENTER: Coordinates = { latitude: 21.7, longitude: -79.5 };
export const CUBA_ZOOM = 4.6;
/** Whole-island box used until KarmaMap reports its own viewport to the clustering RPC. */
export const CUBA_BOUNDS = { west: -85.2, south: 19.6, east: -73.9, north: 23.4 };
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const MAP_ATTRIBUTION = [
  { label: 'OpenFreeMap', url: 'https://openfreemap.org/' },
  { label: '© OpenMapTiles', url: 'https://openmaptiles.org/' },
  { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
] as const;

export function customizeMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    name: 'KarmaHouse · OpenFreeMap Positron',
    layers: style.layers.map(layer => {
      if (layer.id === 'background' && layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': '#F5F5F1' } };
      if (layer.type === 'fill') {
        const fillColors: Record<string, string> = {
          water: '#CFE5F5', park: '#E2ECDF', landcover_wood: '#E2ECDF',
          landuse_residential: '#EEEFEB', building: '#E1E3E3',
        };
        if (fillColors[layer.id]) return { ...layer, paint: { ...layer.paint, 'fill-color': fillColors[layer.id] } };
      }
      if (layer.id === 'waterway' && layer.type === 'line') return { ...layer, paint: { ...layer.paint, 'line-color': '#BEDCEE' } };
      return layer;
    }),
  };
}

let stylePromise: Promise<StyleSpecification> | undefined;

export function loadMapStyle(reload = false): Promise<StyleSpecification> {
  if (reload) stylePromise = undefined;
  if (!stylePromise) {
    stylePromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(MAP_STYLE_URL, { signal: controller.signal });
        if (!response.ok) throw new Error('Map style unavailable');
        const json = await response.json() as StyleSpecification;
        if (json.version !== 8 || !Array.isArray(json.layers) || !json.sources) throw new Error('Invalid map style');
        return customizeMapStyle(json);
      } finally {
        clearTimeout(timeout);
      }
    })().catch(error => { stylePromise = undefined; throw error; });
  }
  return stylePromise;
}
