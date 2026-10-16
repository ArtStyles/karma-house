import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isNewListing, type Listing } from '../domain/listings';
import { cartelLabel, listingFacts, priceLabel, priceSuffix } from '../domain/operations';
import { useAuth } from '../auth/AuthProvider';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { useMarketplace } from '../state/MarketplaceProvider';
import { useFavoriteHeart } from '../state/useFavoriteHeart';
import { createThemedStyles, formatMoney, rounded, typography } from '../theme';
import { ArchImage } from './ArchImage';
import { Cartel } from './Cartel';
import { PropertyImage } from './PropertyImage';
import { Icon, IconButton } from './ui';
import { MotionPressable } from './MotionPressable';

/**
 * A home in the arch: the photo carries the card and the cal-paper sign names the operation.
 * `width` sizes the arch in a grid; `horizontal` is the row used in Favoritos and for a single result.
 */
export function PropertyCard({ listing, horizontal = false, offline = false, width = 172 }: { listing: Listing; horizontal?: boolean; offline?: boolean; width?: number }) {
  const { colors, styles } = useStyles();
  const { mode } = useMarketplace();
  const { user, ready } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const heart=useFavoriteHeart(listing.id),favorite=heart.favorite;
  // The sign says the operation; this only tells a demo, a local draft or a new listing apart.
  const status = listing.owner === 'demo' ? 'Demo' : listing.owner !== 'remote' ? 'Anuncio local' : isNewListing(listing.createdAt) ? 'Nueva' : '';
  const sign = cartelLabel(listing);
  const place = `${listing.location}, ${listing.province}`;
  const facts = listingFacts(listing);
  const photoWidth = horizontal ? 92 : width, photoHeight = horizontal ? 112 : Math.round(width * 1.16);
  async function toggle() {
    if (offline) { setError('Necesitas conexión para guardar favoritos.'); return; }
    if (saving || !ready) return;
    setError('');
    try {
      if (mode === 'cloud' && !user) {
        setSaving(true);
        await pendingIntentStore.write({ kind: 'favorite', propertyId: listing.id });
        router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } });
      } else await heart.toggle();
    } catch { setError('No se pudo guardar el favorito. Inténtalo de nuevo.'); } finally { setSaving(false); }
  }
  const photo = <ArchImage width={photoWidth} height={photoHeight} bottom={horizontal ? 16 : 20}>
    {listing.operation === 'wanted' && !(listing.photos?.length)
      ? <View style={styles.wanted}><Icon name="search-outline" size={horizontal ? 26 : 34} color={colors.primary} />{!horizontal && <Text style={styles.wantedText}>Busco vivienda</Text>}</View>
      : <PropertyImage listing={listing} variant="thumb" style={styles.fill} />}
  </ArchImage>;
  const price = <Text style={styles.price}>{listing.operation === 'wanted' ? 'Hasta ' : ''}{formatMoney(listing.price)}<Text style={styles.currency}> {listing.operation === 'swap' ? 'USD · valor est.' : `USD${priceSuffix(listing)}`}</Text></Text>;
  const copy = <>
    {status ? <Text style={[styles.status, status === 'Nueva' && { color: colors.amber }]}>{status}</Text> : null}
    <Text numberOfLines={2} style={horizontal ? styles.rowTitle : styles.title}>{listing.title}</Text>
    <Text numberOfLines={1} style={styles.meta}>{place}</Text>
    <Text numberOfLines={1} style={styles.meta}>{facts}</Text>
    {price}
    {listing.priceNegotiable && <Text style={styles.negotiable}>Negociable</Text>}
  </>;
  const label = `Ver ${listing.title}, ${sign}, ${priceLabel(listing)} ${formatMoney(listing.price)} USD${priceSuffix(listing)}, ${place}`;
  const feedback = <>
    {heart.error?<Text accessibilityRole="alert" style={styles.error}>{heart.error}</Text>:null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </>;
  if (horizontal) return <View style={styles.row}>
    <MotionPressable pressedScale={.995} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => [styles.rowPress, pressed && { opacity: .85 }]}>
      {photo}
      <View style={styles.rowBody}><View pointerEvents="none" style={styles.rowSign}><Cartel label={sign} /></View>{copy}</View>
    </MotionPressable>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} style={styles.rowHeart} />
    {feedback}
  </View>;
  return <View style={{ width }}>
    <MotionPressable pressedScale={.995} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/property/${listing.id}`)} style={({ pressed }) => pressed && { opacity: .85 }}>
      {photo}
      <View style={styles.body}>{copy}</View>
    </MotionPressable>
    <View pointerEvents="none" style={[styles.sign, { top: Math.round(photoHeight * .58) }]}><Cartel label={sign} /></View>
    <IconButton name={favorite ? 'heart' : 'heart-outline'} label={`${favorite ? 'Quitar de' : 'Guardar en'} favoritos: ${listing.title}`} onPress={toggle} active={favorite} color={colors.onDark} style={[styles.heart, { top: photoHeight - 52 }]} />
    {feedback}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  wanted: { flex: 1, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', gap: 8 }, wantedText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  sign: { position: 'absolute', left: -6 },
  heart: { position: 'absolute', right: 8, width: 44, minHeight: 44, backgroundColor: colors.photoOverlay },
  body: { paddingTop: 10, paddingHorizontal: 2, gap: 2 },
  status: { ...typography.caption, fontWeight: '600', color: colors.muted },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.ink },
  rowTitle: { ...typography.cardTitle, color: colors.ink },
  meta: { fontSize: 13, lineHeight: 18, color: colors.muted },
  price: { marginTop: 4, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
  currency: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  negotiable: { ...typography.caption, fontWeight: '600', color: colors.primary },
  row: { backgroundColor: colors.surface, borderRadius: rounded.cardLg, padding: 10 },
  rowPress: { flexDirection: 'row', gap: 14 },
  rowBody: { flex: 1, minWidth: 0, paddingTop: 4, paddingRight: 40, gap: 2 },
  rowSign: { marginBottom: 6 },
  rowHeart: { position: 'absolute', top: 6, right: 6, backgroundColor: 'transparent' },
  error: { paddingTop: 8, color: colors.danger, fontSize: 13 },
}));
