import { viewportBounds } from '../../domain/geo.ts';
import type { BoundingBox } from '../../domain/geo.ts';

interface ViewportMap {
  on(event: 'load' | 'moveend' | 'resize', listener: () => void): unknown;
  off(event: 'load' | 'moveend' | 'resize', listener: () => void): unknown;
  getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number };
  getZoom(): number;
}

/** The camera's visible extent is authoritative, including its first frame and later resizing. */
export function observeMapViewport(map: ViewportMap, report: (bounds: BoundingBox, zoom: number) => void): () => void {
  const publish = () => {
    const box = map.getBounds();
    const bounds = viewportBounds(box.getWest(), box.getSouth(), box.getEast(), box.getNorth());
    if (bounds) report(bounds, map.getZoom());
  };
  const events = ['load', 'moveend', 'resize'] as const;
  for (const event of events) map.on(event, publish);
  return () => { for (const event of events) map.off(event, publish); };
}
