import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Listing } from '../domain/listings';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney } from '../theme';
import { PropertyImage } from './PropertyImage';
import { Icon, IconButton } from './ui';

export function PropertyCard({ listing, horizontal = false }: { listing: Listing; horizontal?: boolean }) {
  const { favoriteIds, toggleFavorite, mode } = useMarketplace();
  const { user, ready } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const favorite = favoriteIds.includes(listing.id);
  async function toggle() {
    if (saving || !ready) return;
    if (mode === 'cloud' && !user) { router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } }); return; }
    setSaving(true); setError('');
    try { await toggleFavorite(listing.id); } catch { setError('No se pudo guardar el favorito. Inténtalo de nuevo.'); } finally { setSaving(false); }
  }
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}, ${formatMoney(listing.price)}`} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => [horizontal && styles.horizontal, pressed && { opacity: .85 }]}>
      <View style={horizontal ? styles.wideImage : undefined}>
        <PropertyImage listing={listing} style={[styles.image, horizontal && styles.horizontalImage]} />
        <View style={styles.badge}><View style={styles.dot} /><Text style={styles.badgeText}>{listing.owner === 'remote' ? 'En venta' : listing.owner === 'demo' ? 'En venta · Demo' : 'Anuncio local'}</Text></View>
        {!!listing.photos?.length && <View style={styles.photoCount}><Icon name="images-outline" size={13} color={colors.white} /><Text style={styles.photoCountText}>{listing.photos.length}</Text></View>}
      </View>
      <View style={[styles.body, horizontal && styles.horizontalBody]}>
        <View style={styles.priceRow}><Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text><Text style={styles.type}>{listing.type}</Text></View>
        <Text style={styles.title}>{listing.title}</Text>
        <View style={styles.location}><Icon name="location-outline" size={15} color={colors.muted} /><Text style={styles.locationText}>{listing.location}, {listing.province}</Text></View>
        <View style={styles.features}><Feature name="bed-outline" text={`${listing.bedrooms} hab.`} /><Feature name="water-outline" text={`${listing.bathrooms} ${listing.bathrooms === 1 ? 'baño' : 'baños'}`} /><Feature name="expand-outline" text={`${listing.area} m²`} /></View>
        {horizontal && <View style={styles.detailsLink}><Text style={styles.detailsText}>Conoce esta vivienda</Text><Icon name="arrow-forward" size={17} color={colors.primary} /></View>}
      </View>
    </Pressable>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} style={styles.heart} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
function Feature({ name, text }: { name: 'bed-outline' | 'water-outline' | 'expand-outline'; text: string }) { return <View style={styles.feature}><Icon name={name} size={17} color={colors.muted} /><Text style={styles.featureText}>{text}</Text></View>; }
const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E9EE', boxShadow: '0 5px 18px rgba(26,49,75,0.045)' }, image: { height: 218 },
  horizontal: { flexDirection: 'row' }, wideImage: { width: '50%' }, horizontalImage: { height: '100%', minHeight: 295 }, horizontalBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 },
  photoCount: { position: 'absolute', bottom: 12, right: 12, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#173047BA', flexDirection: 'row', gap: 5, alignItems: 'center' }, photoCountText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  badge: { position: 'absolute', top: 15, left: 15, borderRadius: 15, backgroundColor: '#FFFFFFF2', paddingVertical: 7, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }, badgeText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  heart: { position: 'absolute', top: 12, right: 12, width: 44, minHeight: 44, backgroundColor: '#FFFFFFF2' }, body: { padding: 18 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, price: { fontSize: 26, letterSpacing: -.8, fontWeight: '700', color: colors.ink }, currency: { fontSize: 12, color: colors.muted, fontWeight: '500', letterSpacing: 0 },
  type: { fontSize: 11, color: '#426482', backgroundColor: '#EFF4F9', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }, title: { marginTop: 8, fontSize: 17, lineHeight: 23, letterSpacing: -.25, fontWeight: '600', color: colors.ink },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }, locationText: { fontSize: 14, lineHeight: 20, color: colors.muted, flex: 1 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EEF0F3' }, feature: { flexDirection: 'row', alignItems: 'center', gap: 5 }, featureText: { fontSize: 12, color: colors.muted }, error: { padding: 12, color: colors.danger, fontSize: 13 },
  detailsLink: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 24 }, detailsText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
