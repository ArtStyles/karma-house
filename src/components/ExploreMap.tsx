import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Listing } from '../domain/listings';
import { colors, formatMoney } from '../theme';
import { KarmaMap } from './maps/KarmaMap';
import { CUBA_CENTER, CUBA_ZOOM } from './maps/mapConfig';
import { PropertyImage } from './PropertyImage';
import { Icon } from './ui';

export function ExploreMap({ listings, onShowList }: { listings: readonly Listing[]; onShowList: () => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const { width } = useWindowDimensions();
  const located = listings.filter(listing => listing.mapLocation);
  const selected = located.find(listing => listing.id === selectedId);
  const withoutLocation = listings.length - located.length;
  return <View style={styles.container}>
    <View style={styles.mapFrame}>
      <KarmaMap
        style={{ height: width >= 700 ? 480 : 410 }}
        center={CUBA_CENTER} zoom={width >= 700 ? 5.6 : CUBA_ZOOM}
        markers={located.map(listing => ({ id: listing.id, coordinate: listing.mapLocation!, precision: listing.mapLocation!.precision, label: formatMoney(listing.price) }))}
        selectedMarkerId={selected?.id} onMarkerPress={setSelectedId}
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
      <Text style={styles.hintText}>{located.length ? 'Toca un precio para conocer la vivienda. Acerca el mapa para ver más detalle.' : listings.length ? 'Estas viviendas aún no tienen un punto en el mapa.' : 'Aquí verás las viviendas cuando tengan una ubicación publicada.'}</Text>
    </View>}
    {withoutLocation > 0 && <Pressable accessibilityRole="button" onPress={onShowList} style={styles.missing}>
      <Text style={styles.missingText}>{withoutLocation} {withoutLocation === 1 ? 'vivienda sin ubicación' : 'viviendas sin ubicación'} · Ver en la lista</Text>
      <Icon name="arrow-forward" size={16} color={colors.primary} />
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12 }, mapFrame: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.softBlue },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 86, height: 106, borderRadius: 14 }, copy: { flex: 1, gap: 4 },
  price: { color: colors.ink, fontSize: 21, fontWeight: '700', letterSpacing: -.5 }, currency: { color: colors.muted, fontSize: 11, fontWeight: '500' },
  title: { color: colors.ink, fontSize: 15, fontWeight: '600', lineHeight: 20 }, location: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  precision: { color: colors.primary, fontSize: 11, fontWeight: '500' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingVertical: 6 }, hintText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  missing: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: colors.white, padding: 14, borderRadius: 16 }, missingText: { flex: 1, color: colors.primary, fontSize: 13, lineHeight: 19 },
});
