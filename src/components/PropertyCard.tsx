import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Listing } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney } from '../theme';
import { PropertyImage } from './PropertyImage';
import { Icon, IconButton } from './ui';

export function PropertyCard({ listing }: { listing: Listing }) {
  const { favoriteIds, toggleFavorite } = useMarketplace();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const favorite = favoriteIds.includes(listing.id);
  async function toggle() {
    if (saving) return;
    setSaving(true); setError('');
    try { await toggleFavorite(listing.id); } catch { setError('No se pudo guardar el favorito. Inténtalo de nuevo.'); } finally { setSaving(false); }
  }
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}, ${formatMoney(listing.price)}`} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => pressed && { opacity: .85 }}>
      <PropertyImage listing={listing} style={styles.image} />
      <View style={styles.badge}><View style={styles.dot} /><Text style={styles.badgeText}>{listing.owner === 'demo' ? 'En venta · Demo' : 'Anuncio local'}</Text></View>
      <View style={styles.body}>
        <View style={styles.priceRow}><Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text><Text style={styles.type}>{listing.type}</Text></View>
        <Text style={styles.title}>{listing.title}</Text>
        <View style={styles.location}><Icon name="location-outline" size={15} color={colors.muted} /><Text style={styles.locationText}>{listing.location}, {listing.province}</Text></View>
        <View style={styles.features}><Feature name="bed-outline" text={`${listing.bedrooms} hab.`} /><Feature name="water-outline" text={`${listing.bathrooms} ${listing.bathrooms === 1 ? 'baño' : 'baños'}`} /><Feature name="expand-outline" text={`${listing.area} m²`} /></View>
      </View>
    </Pressable>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} style={styles.heart} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
function Feature({ name, text }: { name: 'bed-outline' | 'water-outline' | 'expand-outline'; text: string }) { return <View style={styles.feature}><Icon name={name} size={17} color={colors.muted} /><Text style={styles.featureText}>{text}</Text></View>; }
const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 24, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.025)' }, image: { height: 238 },
  badge: { position: 'absolute', top: 15, left: 15, borderRadius: 15, backgroundColor: '#FFFFFFF2', paddingVertical: 7, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }, badgeText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  heart: { position: 'absolute', top: 12, right: 12, width: 44, minHeight: 44, backgroundColor: '#FFFFFFF2' }, body: { padding: 18 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, price: { fontSize: 26, letterSpacing: -.8, fontWeight: '700', color: colors.ink }, currency: { fontSize: 12, color: colors.muted, fontWeight: '500', letterSpacing: 0 },
  type: { fontSize: 12, color: colors.muted }, title: { marginTop: 8, fontSize: 17, lineHeight: 23, letterSpacing: -.25, fontWeight: '600', color: colors.ink },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }, locationText: { fontSize: 14, lineHeight: 20, color: colors.muted, flex: 1 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 15 }, feature: { flexDirection: 'row', alignItems: 'center', gap: 5 }, featureText: { fontSize: 13, color: colors.muted }, error: { padding: 12, color: colors.danger, fontSize: 13 },
});
