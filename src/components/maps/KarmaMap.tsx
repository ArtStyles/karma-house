import { Camera, GeoJSONSource, Layer, Map as NativeMap, Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Icon } from '../ui';
import type { KarmaMapProps } from './KarmaMap.types';
import { CUBA_CENTER, CUBA_ZOOM } from './mapConfig';
import { approximateAreas, coordinatesFromMapPress } from './mapGeometry';
import { MapAttribution, MapBrand, MapStatus } from './MapChrome';
import { useMapStyle } from './useMapStyle';

export type { KarmaMapProps, MapMarker } from './KarmaMap.types';

export function KarmaMap({ markers = [], center = CUBA_CENTER, zoom = CUBA_ZOOM, selectedMarkerId, onMarkerPress, onMapPress, interactive = true, style, accessibilityLabel = 'Mapa de viviendas de KarmaHouse' }: KarmaMapProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const { mapStyle, styleFailed } = useMapStyle(attempt);
  const areas = useMemo(() => approximateAreas(markers), [markers]);
  const cameraCenter = useMemo<[number, number]>(() => [center.longitude, center.latitude], [center.longitude, center.latitude]);
  useEffect(() => {
    if (!mapStyle) return;
    const timeout = setTimeout(() => setStatus(current => current === 'loading' ? 'error' : current), 25000);
    return () => clearTimeout(timeout);
  }, [mapStyle]);

  return <View style={[styles.wrapper, style]}>
    <View style={styles.canvas}>
      {mapStyle && <NativeMap key={attempt} style={StyleSheet.absoluteFill} mapStyle={mapStyle}
        accessibilityLabel={accessibilityLabel} accessible={false} androidView="texture"
        dragPan={interactive} touchZoom={interactive} doubleTapZoom={interactive} doubleTapHoldZoom={interactive}
        touchRotate={false} touchPitch={false} compass={false} logo={false} attribution={false}
        onPress={event => { if (interactive && onMapPress) { const [longitude, latitude] = event.nativeEvent.lngLat; const coordinate = coordinatesFromMapPress(latitude, longitude); if (coordinate) onMapPress(coordinate); } }}
        onDidFinishLoadingMap={() => setStatus('ready')} onDidFailLoadingMap={() => setStatus('error')}>
        <Camera center={cameraCenter} zoom={zoom} minZoom={3} maxZoom={18} duration={200} />
        <GeoJSONSource id="karma-approximate-areas" data={areas}>
          <Layer id="karma-approximate-fill" type="fill" paint={{ 'fill-color': colors.primary, 'fill-opacity': 0.12 }} />
          <Layer id="karma-approximate-outline" type="line" paint={{ 'line-color': colors.primary, 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 2] }} />
        </GeoJSONSource>
        {markers.map(marker => {
          const selected = marker.id === selectedMarkerId;
          const label = `${marker.label ? `Vivienda ${marker.label}` : 'Ubicación de la vivienda'}${marker.precision === 'approximate' ? ', aproximada' : ''}`;
          return <Marker key={marker.id} id={marker.id} lngLat={[marker.coordinate.longitude, marker.coordinate.latitude]} selected={selected}
            onPress={event => { event.stopPropagation(); onMarkerPress?.(marker.id); }}>
            <View accessible accessibilityRole={onMarkerPress ? 'button' : 'image'} accessibilityLabel={label} accessibilityState={{ selected }}
              onAccessibilityTap={() => onMarkerPress?.(marker.id)} style={[styles.marker, selected && styles.selectedMarker]}>
              {marker.label ? <Text numberOfLines={1} style={[styles.markerText, selected && styles.selectedText]}>{marker.precision === 'approximate' ? '≈ ' : ''}{marker.label}</Text> : <Icon name="home" size={20} color={selected ? colors.white : colors.primary} />}
            </View>
          </Marker>;
        })}
      </NativeMap>}
      <MapBrand />
      <MapStatus status={styleFailed ? 'error' : status} onRetry={() => { setStatus('loading'); setAttempt(value => value + 1); }} />
    </View>
    <MapAttribution />
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { minHeight: 180, backgroundColor: '#EAF0F4', overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  canvas: { flex: 1, overflow: 'hidden' },
  marker: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1.5, borderColor: '#DCE2E7', boxShadow: '0 2px 6px rgba(30, 50, 70, 0.18)' },
  selectedMarker: { backgroundColor: colors.primary, borderColor: colors.white },
  markerText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  selectedText: { color: colors.white },
});
