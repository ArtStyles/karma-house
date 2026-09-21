import { useEffect, useState } from 'react';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { loadMapStyle } from './mapConfig';

export function useMapStyle(attempt: number) {
  const [style, setStyle] = useState<StyleSpecification>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setStyle(undefined);
    setFailed(false);
    void loadMapStyle(attempt > 0).then(value => { if (!cancelled) setStyle(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  return { mapStyle: style, styleFailed: failed };
}
