import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GeoJSONSource, Map as WebMap, Marker as WebMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { colors } from '../../theme';
import type { KarmaMapProps } from './KarmaMap.types';
import { CUBA_CENTER, CUBA_ZOOM } from './mapConfig';
import { approximateAreas, coordinatesFromMapPress } from './mapGeometry';
import { viewportBounds } from '../../domain/geo';
import { MapAttribution, MapBrand, MapStatus } from './MapChrome';
import { useMapStyle } from './useMapStyle';

export type { KarmaMapProps, MapMarker } from './KarmaMap.types';

export function KarmaMap({ markers = [], center = CUBA_CENTER, zoom = CUBA_ZOOM, selectedMarkerId, onMarkerPress, onMapPress, onRegionChange, interactive = true, style, accessibilityLabel = 'Mapa de viviendas de KarmaHouse' }: KarmaMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<WebMap | null>(null);
  const markerConstructor = useRef<typeof WebMarker | null>(null);
  const buttons = useRef<WebMarker[]>([]);
  const callbacks = useRef({ onMarkerPress, onMapPress, onRegionChange });
  callbacks.current = { onMarkerPress, onMapPress, onRegionChange };
  const position = useRef({ center, zoom });
  position.current = { center, zoom };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generation, setGeneration] = useState(0);
  const { mapStyle, styleFailed } = useMapStyle(attempt);
  const areas = useMemo(() => approximateAreas(markers), [markers]);

  useEffect(() => {
    if (!mapStyle || !host.current) return;
    let cancelled = false;
    let instance: WebMap | undefined;
    let observer: ResizeObserver | undefined;
    const timeout = setTimeout(() => {
      if (__DEV__) console.warn('[KarmaHouse map] Loading timed out', { styleLoaded: instance?.isStyleLoaded(), tilesLoaded: instance?.areTilesLoaded() });
      setStatus(current => current === 'loading' ? 'error' : current);
    }, 25000);
    void import('maplibre-gl').then(library => {
      if (cancelled || !host.current) return;
      // Metro bundles the library but does not emit the module worker beside it.
      library.setWorkerUrl(new URL(`/maplibre/${library.getVersion()}/maplibre-gl-worker.mjs`, window.location.origin).href);
      markerConstructor.current = library.Marker;
      instance = new library.Map({
        // Positron uses glyph PBFs. Native and GL JS currently type font-faces differently.
        container: host.current, style: { ...mapStyle, 'font-faces': undefined }, center: [position.current.center.longitude, position.current.center.latitude],
        zoom: position.current.zoom, minZoom: 3, maxZoom: 18, interactive, attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: false,
      });
      map.current = instance;
      instance.touchZoomRotate.disableRotation();
      instance.on('click', event => {
        if (!interactive) return;
        const coordinate = coordinatesFromMapPress(event.lngLat.lat, event.lngLat.lng);
        if (coordinate) callbacks.current.onMapPress?.(coordinate);
      });
      instance.on('moveend', () => {
        if (!instance || !callbacks.current.onRegionChange) return;
        const box = instance.getBounds();
        const bounds = viewportBounds(box.getWest(), box.getSouth(), box.getEast(), box.getNorth());
        if (bounds) callbacks.current.onRegionChange(bounds, instance.getZoom());
      });
      instance.on('error', event => {
        if (__DEV__) console.warn('[KarmaHouse map]', event.error?.message ?? 'Map resource failed');
        if (!cancelled) setStatus('error');
      });
      instance.on('load', () => {
        if (cancelled || !instance) return;
        clearTimeout(timeout);
        instance.addSource('karma-approximate-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'karma-approximate-fill', type: 'fill', source: 'karma-approximate-areas', paint: { 'fill-color': colors.primary, 'fill-opacity': 0.12 } });
        instance.addLayer({ id: 'karma-approximate-outline', type: 'line', source: 'karma-approximate-areas', paint: { 'line-color': colors.primary, 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 2] } });
        setStatus('ready');
        setGeneration(value => value + 1);
      });
      observer = new ResizeObserver(() => instance?.resize());
      observer.observe(host.current);
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      observer?.disconnect();
      buttons.current.forEach(marker => marker.remove());
      buttons.current = [];
      instance?.remove();
      if (map.current === instance) map.current = null;
    };
  }, [mapStyle, interactive]);

  useEffect(() => {
    const instance = map.current;
    if (instance) {
      instance.resize();
      instance.easeTo({ center: [center.longitude, center.latitude], zoom, duration: 200 });
    }
  }, [center.latitude, center.longitude, zoom]);

  useEffect(() => {
    const instance = map.current;
    const Marker = markerConstructor.current;
    if (!instance || !Marker || !instance.getSource('karma-approximate-areas')) return;
    (instance.getSource('karma-approximate-areas') as GeoJSONSource).setData(areas);
    buttons.current.forEach(marker => marker.remove());
    buttons.current = markers.map(marker => {
      const selected = marker.id === selectedMarkerId;
      const element = document.createElement(onMarkerPress ? 'button' : 'div');
      if (element instanceof HTMLButtonElement) element.type = 'button';
      element.className = 'karma-map-marker';
      element.textContent = marker.label ? `${marker.precision === 'approximate' ? '≈ ' : ''}${marker.label}` : '⌂';
      element.setAttribute('aria-label', `${marker.label ? `Vivienda ${marker.label}` : 'Ubicación de la vivienda'}${marker.precision === 'approximate' ? ', aproximada' : ''}`);
      if (onMarkerPress) element.setAttribute('aria-pressed', String(selected));
      Object.assign(element.style, {
        boxSizing: 'border-box', minWidth: '44px', minHeight: '44px', padding: '8px 12px', borderRadius: '24px',
        border: `1.5px solid ${selected ? '#FFFFFF' : '#DCE2E7'}`, background: selected ? colors.primary : colors.white,
        color: selected ? colors.white : colors.ink, font: marker.label ? '700 13px system-ui, sans-serif' : '700 27px system-ui, sans-serif',
        boxShadow: '0 2px 6px rgba(30, 50, 70, 0.18)', cursor: onMarkerPress ? 'pointer' : 'default', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: selected ? '2' : '1',
      });
      element.addEventListener('click', event => { event.stopPropagation(); callbacks.current.onMarkerPress?.(marker.id); });
      return new Marker({ element, anchor: 'center' }).setLngLat([marker.coordinate.longitude, marker.coordinate.latitude]).addTo(instance);
    });
  }, [markers, selectedMarkerId, areas, generation, onMarkerPress]);

  return <View style={[styles.wrapper, style]}>
    <View style={styles.canvas}>
      <div ref={host} role="region" aria-label={accessibilityLabel} style={{ position: 'absolute', inset: 0 }} />
      <MapBrand />
      <MapStatus status={styleFailed ? 'error' : status} onRetry={() => { setStatus('loading'); setAttempt(value => value + 1); }} />
    </View>
    <MapAttribution />
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { minHeight: 180, backgroundColor: '#EAF0F4', overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  canvas: { flex: 1, overflow: 'hidden' },
});
