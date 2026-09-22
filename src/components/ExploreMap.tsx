import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { BoundingBox } from '../domain/geo';
import type { ListingFilters } from '../domain/listings';
import { useListing, useMapView } from '../catalog/useCatalog';
import { colors, formatMoney } from '../theme';
import { KarmaMap } from './maps/KarmaMap';
import { CUBA_BOUNDS, CUBA_CENTER, CUBA_ZOOM } from './maps/mapConfig';
import { PropertyImage } from './PropertyImage';
import { Icon } from './ui';

/** One step past a cluster keeps its members in view instead of overshooting past them. */
const CLUSTER_ZOOM_STEP = 2;
const MAX_ZOOM = 16;

export function ExploreMap({ filters, withoutLocation, onShowList }: {
  filters: ListingFilters;
  /** Loaded listings with no published point, so the hint can send them to the list. */
  withoutLocation: number;
  onShowList: () => void;
}) {
  const { width } = useWindowDimensions();
  const initialZoom = width >= 700 ? 5.6 : CUBA_ZOOM;
  const [camera, setCamera] = useState({ center: CUBA_CENTER, zoom: initialZoom });
  // Null until the map reports its first viewport; the island box covers that first frame.
  const [region, setRegion] = useState<{ bounds: BoundingBox; zoom: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const { view, ready } = useMapView(region?.bounds ?? CUBA_BOUNDS, region?.zoom ?? initialZoom, filters);
  const points = view.mode === 'points' ? view.items : [];
  const selectedPoint = points.find(point => point.id === selectedId);
  // Only the tapped pin costs a round trip; the map itself never carries photos or text.
  const { listing: selected } = useListing(selectedPoint?.id);
  const markers = view.mode === 'points'
    ? points.map(point => ({ id: point.id, coordinate: point, precision: point.precision, label: formatMoney(point.price) }))
    : view.items.map(cluster => ({ id: cluster.key, coordinate: cluster, precision: 'exact' as const, label: `${cluster.count}` }));

  function press(id: string) {
    if (view.mode === 'points') { setSelectedId(id); return; }
    const cluster = view.items.find(item => item.key === id);
    if (!cluster) return;
    // Zoom towards the cluster; the resulting viewport asks the server to split it.
    setCamera(current => ({ center: cluster, zoom: Math.min(current.zoom + CLUSTER_ZOOM_STEP, MAX_ZOOM) }));
  }

  return <View style={styles.container}>
    <View style={styles.mapFrame}>
      <KarmaMap
        style={{ height: width >= 700 ? 480 : 410 }}
        center={camera.center} zoom={camera.zoom}
        markers={markers}
        selectedMarkerId={selectedPoint?.id} onMarkerPress={press}
        onRegionChange={(bounds, zoom) => setRegion({ bounds, zoom })}
        accessibilityLabel="Mapa de viviendas en venta en Cuba"
      />
    </View>
    {selected ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver vivienda: ${selected.title}, ${formatMoney(selected.price)}`} onPress={() => router.push(`/property/${selected.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: .75 }]}>
      <PropertyImage listing={selected} style={styles.photo} />
      <View style={styles.copy}>
        <Text style={styles.price}>{formatMoney(selected.price)} <Text style={styles.currency}>USD</Text></Text>
        <Text style={styles.title} numberOfLines={2}>{selected.title}</Text>
        <Text style={styles.location} numberOfLines={2}>{selected.location}, {selected.province}</Text>
        <Text style={styles.precision}>{selected.mapLocation?.precision === 'approximate' ? 'Zona aproximada' : 'Ubicación exacta'}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.primary} />
    </Pressable> : <View style={styles.hint}>
      <Icon name="map-outline" size={20} color={colors.primary} />
      <Text style={styles.hintText}>{!ready ? 'Cargando las viviendas del mapa…' : view.mode === 'clusters' ? 'Cada globo agrupa varias viviendas. Tócalo para acercarte y separarlas.' : points.length ? 'Toca un precio para conocer la vivienda. Acerca el mapa para ver más detalle.' : 'No hay viviendas con ubicación en esta zona. Aleja el mapa o muévelo.'}</Text>
    </View>}
    {withoutLocation > 0 && <Pressable accessibilityRole="button" onPress={onShowList} style={styles.missing}>
      <Text style={styles.missingText}>{withoutLocation} {withoutLocation === 1 ? 'vivienda sin ubicación' : 'viviendas sin ubicación'} · Ver en la lista</Text>
      <Icon name="arrow-forward" size={16} color={colors.primary} />
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  mapFrame: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#E1E5EB', backgroundColor: colors.white },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E1E5EB' },
  photo: { width: 84, height: 84, borderRadius: 14 },
  copy: { flex: 1, gap: 2 },
  price: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -.4 },
  currency: { fontSize: 12, fontWeight: '500', color: colors.muted },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  location: { fontSize: 12, color: colors.muted },
  precision: { fontSize: 11, color: colors.primary, marginTop: 2 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.softBlue },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.ink },
  missing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: '#E1E5EB' },
  missingText: { fontSize: 12, color: colors.primary },
});
