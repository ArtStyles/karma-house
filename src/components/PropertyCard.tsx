import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isNewListing, type Listing } from '../domain/listings';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney } from '../theme';
import { PropertyImage } from './PropertyImage';
import { Icon, IconButton } from './ui';

/** Photo first: the image carries the card, and the text sits on the screen's own background. */
export function PropertyCard({ listing, horizontal = false }: { listing: Listing; horizontal?: boolean }) {
  const { favoriteIds, toggleFavorite, mode } = useMarketplace();
  const { user, ready } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const favorite = favoriteIds.includes(listing.id);
  // Every catalogue listing is for sale, so the badge only speaks when it tells something apart.
  const badge = listing.owner === 'demo' ? 'Demo' : listing.owner !== 'remote' ? 'Anuncio local' : isNewListing(listing.createdAt) ? 'Nueva' : '';
  const photos = listing.photos?.length ?? 0;
  const place = `${listing.location}, ${listing.province}`;
  const facts = `${listing.bedrooms} hab · ${listing.bathrooms} ${listing.bathrooms === 1 ? 'baño' : 'baños'} · ${listing.area} m²`;
  async function toggle() {
    if (saving || !ready) return;
    if (mode === 'cloud' && !user) { router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } }); return; }
    setSaving(true); setError('');
    try { await toggleFavorite(listing.id); } catch { setError('No se pudo guardar el favorito. Inténtalo de nuevo.'); } finally { setSaving(false); }
  }
  return <View style={horizontal && styles.horizontalCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}, ${formatMoney(listing.price)} USD, ${place}`} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => [horizontal && styles.horizontal, pressed && { opacity: .85 }]}>
      <View style={horizontal && styles.wideImage}>
        <PropertyImage listing={listing} style={horizontal ? styles.horizontalImage : styles.image} />
        {badge ? <Text style={[styles.badge, badge === 'Nueva' && styles.newBadge]}>{badge}</Text> : null}
        {photos > 1 && <View style={styles.photoCount}><Icon name="images-outline" size={13} color={colors.white} /><Text style={styles.photoCountText}>{photos}</Text></View>}
      </View>
      <View style={horizontal ? styles.horizontalBody : styles.body}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>
          {listing.priceNegotiable && <Text style={styles.negotiable}>Negociable</Text>}
        </View>
        <Text numberOfLines={1} style={styles.title}>{listing.title}</Text>
        <Text numberOfLines={1} style={styles.meta}>{place}</Text>
        <Text numberOfLines={1} style={styles.meta}>{facts}</Text>
        {horizontal && <View style={styles.detailsLink}><Text style={styles.detailsText}>Conoce esta vivienda</Text><Icon name="arrow-forward" size={17} color={colors.primary} /></View>}
      </View>
    </Pressable>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} style={styles.heart} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  image: { height: 200, borderRadius: 16 },
  badge: { position: 'absolute', top: 12, left: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFFF2', paddingVertical: 5, paddingHorizontal: 10, fontSize: 12, fontWeight: '600', color: colors.ink },
  newBadge: { color: colors.green },
  photoCount: { position: 'absolute', bottom: 10, right: 10, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#000000A6', flexDirection: 'row', gap: 5, alignItems: 'center' }, photoCountText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  heart: { position: 'absolute', top: 8, right: 8, width: 44, minHeight: 44, backgroundColor: '#FFFFFFF2' },
  body: { paddingTop: 10, paddingHorizontal: 2, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  price: { fontSize: 22, letterSpacing: -.5, fontWeight: '700', color: colors.ink }, currency: { fontSize: 13, color: colors.muted, fontWeight: '500', letterSpacing: 0 },
  negotiable: { marginLeft: 'auto', fontSize: 12, fontWeight: '600', color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  title: { marginTop: 2, fontSize: 16, lineHeight: 22, letterSpacing: -.2, fontWeight: '500', color: colors.ink },
  meta: { fontSize: 14, lineHeight: 20, color: colors.muted },
  horizontalCard: { backgroundColor: colors.white, borderRadius: 24, overflow: 'hidden' },
  horizontal: { flexDirection: 'row' }, wideImage: { width: '50%' }, horizontalImage: { height: '100%', minHeight: 295 },
  horizontalBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32, gap: 4 },
  detailsLink: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 20 }, detailsText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  error: { paddingTop: 8, color: colors.danger, fontSize: 13 },
});
