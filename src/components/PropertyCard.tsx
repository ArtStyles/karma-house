import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isNewListing, type Listing } from '../domain/listings';
import { listingFacts, operationBadge, priceLabel, priceSuffix } from '../domain/operations';
import { useAuth } from '../auth/AuthProvider';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, formatMoney } from '../theme';
import { PropertyImage } from './PropertyImage';
import { Icon, IconButton } from './ui';

/** Photo first: the image carries the card, and the text sits on the screen's own background. */
export function PropertyCard({ listing, horizontal = false, offline = false }: { listing: Listing; horizontal?: boolean; offline?: boolean }) {
  const { colors, styles } = useStyles();
  const { favoriteIds, canonicalFavoriteId, toggleFavorite, mode } = useMarketplace();
  const { user, ready } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const favorite = favoriteIds.includes(canonicalFavoriteId(listing.id));
  // The badge only speaks when it tells something apart; a swap or wanted ad says so before «Nueva».
  const operation = operationBadge(listing);
  const badge = operation || (listing.owner === 'demo' ? 'Demo' : listing.owner !== 'remote' ? 'Anuncio local' : isNewListing(listing.createdAt) ? 'Nueva' : '');
  const photos = listing.photos?.length ?? 0;
  const place = `${listing.location}, ${listing.province}`;
  const facts = listingFacts(listing);
  async function toggle() {
    if (offline) { setError('Necesitas conexión para guardar favoritos.'); return; }
    if (saving || !ready) return;
    setSaving(true); setError('');
    try {
      if (mode === 'cloud' && !user) {
        await pendingIntentStore.write({ kind: 'favorite', propertyId: listing.id });
        router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } });
      } else await toggleFavorite(listing.id);
    } catch { setError('No se pudo guardar el favorito. Inténtalo de nuevo.'); } finally { setSaving(false); }
  }
  return <View style={horizontal && styles.horizontalCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}, ${priceLabel(listing)} ${formatMoney(listing.price)} USD${priceSuffix(listing)}, ${place}`} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => [horizontal && styles.horizontal, pressed && { opacity: .85 }]}>
      <View style={horizontal && styles.wideImage}>
        {listing.operation === 'wanted' && !(listing.photos?.length)
          ? <View style={[horizontal ? styles.horizontalImage : styles.image, styles.wantedImage]}><Icon name="search-outline" size={37} color={colors.primary} /><Text style={styles.wantedText}>Busco vivienda</Text></View>
          : <PropertyImage listing={listing} variant="thumb" style={horizontal ? styles.horizontalImage : styles.image} />}
        {badge ? <Text style={[styles.badge, badge === 'Nueva' && styles.newBadge, !!operation && badge === operation && styles.operationBadge]}>{badge}</Text> : null}
        {photos > 1 && <View style={styles.photoCount}><Icon name="images-outline" size={13} color={colors.onPrimary} /><Text style={styles.photoCountText}>{photos}</Text></View>}
      </View>
      <View style={horizontal ? styles.horizontalBody : styles.body}>
        <View style={styles.priceRow}>
          {listing.operation === 'wanted'
            ? <Text style={styles.price}>Hasta {formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>
            : <Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>{listing.operation === 'swap' ? 'USD · valor est.' : `USD${priceSuffix(listing)}`}</Text></Text>}
          {listing.priceNegotiable && <Text style={styles.negotiable}>Negociable</Text>}
        </View>
        <Text numberOfLines={2} style={styles.title}>{listing.title}</Text>
        <Text numberOfLines={1} style={styles.meta}>{place}</Text>
        <Text numberOfLines={1} style={styles.meta}>{facts}</Text>
        {horizontal && <View style={styles.detailsLink}><Text style={styles.detailsText}>{listing.operation === 'wanted' ? 'Ver esta búsqueda' : 'Conoce esta vivienda'}</Text><Icon name="arrow-forward" size={17} color={colors.primary} /></View>}
      </View>
    </Pressable>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} style={styles.heart} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  image: { height: 200, borderRadius: 16 },
  badge: { position: 'absolute', top: 12, left: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.navigationGlass, paddingVertical: 5, paddingHorizontal: 10, fontSize: 12, fontWeight: '600', color: colors.ink },
  newBadge: { color: colors.green }, operationBadge: { color: colors.primary },
  wantedImage: { backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', gap: 8 }, wantedText: { color: colors.primary, fontWeight: '600' },
  photoCount: { position: 'absolute', bottom: 10, right: 10, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.photoOverlay, flexDirection: 'row', gap: 5, alignItems: 'center' }, photoCountText: { color: colors.onPrimary, fontSize: 12, fontWeight: '600' },
  heart: { position: 'absolute', top: 8, right: 8, width: 44, minHeight: 44, backgroundColor: colors.navigationGlass },
  body: { paddingTop: 10, paddingHorizontal: 2, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  price: { fontSize: 22, letterSpacing: -.5, fontWeight: '700', color: colors.ink }, currency: { fontSize: 13, color: colors.muted, fontWeight: '500', letterSpacing: 0 },
  negotiable: { marginLeft: 'auto', fontSize: 12, fontWeight: '600', color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  title: { marginTop: 2, fontSize: 16, lineHeight: 22, letterSpacing: -.2, fontWeight: '500', color: colors.ink },
  meta: { fontSize: 14, lineHeight: 20, color: colors.muted },
  horizontalCard: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  horizontal: { flexDirection: 'row' }, wideImage: { width: '50%' }, horizontalImage: { height: '100%', minHeight: 295 },
  horizontalBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32, gap: 4 },
  detailsLink: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 20 }, detailsText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  error: { paddingTop: 8, color: colors.danger, fontSize: 13 },
}));
