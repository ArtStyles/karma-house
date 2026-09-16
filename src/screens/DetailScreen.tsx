import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationMaterial } from '../components/NavigationMaterial';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Icon, IconButton, Notice, type IconName } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney, typefaces } from '../theme';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { listings, favoriteIds, toggleFavorite } = useMarketplace();
  const listing = listings.find(item => item.id === id);
  const [contact, setContact] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!listing) return <SafeAreaView style={styles.safe}><EmptyState title="Esta vivienda no está disponible" description="Vuelve al catálogo para explorar otras viviendas." action={<Button label="Volver a explorar" onPress={() => router.replace('/')} />} /></SafeAreaView>;
  const favorite = favoriteIds.includes(listing.id);
  async function toggle() {
    if (busy || !listing) return;
    setBusy(true); setError('');
    try { await toggleFavorite(listing.id); }
    catch { setError('No pudimos guardar tu favorito. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.photoFrame}>
        <PropertyImage listing={listing} style={[styles.photo, width >= 700 && styles.widePhoto]} />
        <View style={styles.navigation}>
          <IconButton name="chevron-back" label="Volver al catálogo" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.floatingButton} />
          <View style={styles.navigationTitle}><Text style={styles.navText}>{listing.type}</Text></View>
          <IconButton name={favorite ? 'heart' : 'heart-outline'} label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} onPress={toggle} active={favorite} style={styles.floatingButton} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.summary}>
          <View style={styles.badges}>
            <View style={[styles.statusBadge, listing.status !== 'active' && styles.inactiveBadge]}>
              <View style={[styles.statusDot, listing.status !== 'active' && styles.inactiveDot]} />
              <Text style={[styles.statusText, listing.status !== 'active' && styles.inactiveText]}>{listing.status === 'active' ? 'En venta' : listing.status === 'sold' ? 'Vendida' : 'En pausa'}</Text>
            </View>
            <Text style={styles.demo}>{listing.owner === 'local' ? 'Anuncio local' : 'Vivienda de muestra'}</Text>
          </View>
          <Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>
          <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
          <View style={styles.location}><Icon name="location-outline" color={colors.muted} size={17} /><Text style={styles.locationText}>{listing.location}, {listing.province}, Cuba</Text></View>
        </View>
        <View style={styles.features}>
          <Feature icon="bed-outline" value={`${listing.bedrooms}`} label={listing.bedrooms === 1 ? 'Habitación' : 'Habitaciones'} />
          <Feature icon="water-outline" value={`${listing.bathrooms}`} label={listing.bathrooms === 1 ? 'Baño' : 'Baños'} />
          <Feature icon="expand-outline" value={`${listing.area} m²`} label="Superficie" />
        </View>
        <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>Sobre esta vivienda</Text><View style={styles.group}><Text style={styles.description}>{listing.description}</Text></View></View>
        {listing.amenities.length > 0 && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Comodidades</Text>
          <View style={styles.amenities}>{listing.amenities.map(value => <View key={value} style={styles.amenity}><Icon name="checkmark-circle" size={21} color={colors.primary} /><Text style={styles.amenityText}>{value}</Text></View>)}</View>
        </View>}
        <View style={styles.seller}>
          <View style={styles.sellerIcon}><Icon name="person" size={25} color={colors.muted} /></View>
          <View style={styles.sellerCopy}><Text style={styles.sellerTitle}>{listing.owner === 'local' ? 'Tu anuncio de prueba' : 'Perfil de demostración'}</Text><Text style={styles.sellerText}>{listing.owner === 'local' ? 'Visible solo en este dispositivo' : 'Sin vendedor real asociado'}</Text></View>
        </View>
        <Notice>{listing.photoUri ? 'Esta es una publicación local de prueba. La foto seleccionada se guarda en este dispositivo.' : 'Esta vivienda es ficticia. La fotografía fue generada para mostrar cómo se verá KarmaHouse.'}</Notice>
        {error ? <Notice error>{error}</Notice> : null}
      </View>
    </ScrollView>
    <SafeAreaView edges={['bottom']} style={styles.actionBar}>
      <NavigationMaterial />
      <View style={styles.actionContent}>
        <View style={styles.barSummary}><Text style={styles.barLabel}>Precio de venta · USD</Text><Text style={styles.barPrice}>{formatMoney(listing.price)}</Text></View>
        <Button label={listing.owner === 'local' ? 'Editar anuncio' : 'Contactar'} icon={listing.owner === 'local' ? 'create-outline' : 'chatbubble-outline'} onPress={() => listing.owner === 'local' ? router.push(`/edit/${listing.id}`) : setContact(true)} style={styles.contactButton} />
      </View>
    </SafeAreaView>
    <Modal visible={contact} transparent animationType="fade" onRequestClose={() => setContact(false)}>
      <View style={[styles.modalBackdrop, width >= 700 && styles.wideBackdrop]}>
        <View accessibilityViewIsModal style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 24) }, width >= 700 && styles.wideModal]}>
          <View style={styles.modalIcon}><Icon name="chatbubbles-outline" size={29} color={colors.primary} /></View>
          <Text accessibilityRole="header" style={styles.modalTitle}>Aquí empezará la conversación</Text>
          <Text style={styles.modalText}>Estás viendo una vivienda de demostración. En la versión con cuentas podrás contactar al vendedor desde aquí.</Text>
          <Text style={styles.modalSmall}>No se ha enviado ningún mensaje.</Text>
          <Button label="Seguir explorando" onPress={() => setContact(false)} />
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}
function Feature({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return <View style={styles.feature}><Icon name={icon} color={colors.muted} size={22} /><Text style={styles.featureValue}>{value}</Text><Text style={styles.featureLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 860, alignSelf: 'center' },
  photoFrame: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', backgroundColor: colors.border }, photo: { height: 340, width: '100%' }, widePhoto: { height: 430 },
  navigation: { position: 'absolute', top: 16, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, floatingButton: { backgroundColor: '#FFFFFFF5' }, navigationTitle: { backgroundColor: '#FFFFFFF5', borderRadius: 22, paddingVertical: 11, paddingHorizontal: 17, flexShrink: 1 }, navText: { color: colors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28, gap: 24 }, summary: { gap: 9 },
  badges: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }, statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.softGreen, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }, statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green }, statusText: { fontSize: 12, fontWeight: '600', color: colors.green }, inactiveBadge: { backgroundColor: '#FFF3DA' }, inactiveDot: { backgroundColor: colors.amber }, inactiveText: { color: colors.amber }, demo: { fontSize: 12, color: colors.muted },
  price: { color: colors.ink, fontSize: 34, fontWeight: '700', letterSpacing: -1.1 }, currency: { color: colors.muted, fontSize: 15, fontWeight: '500', letterSpacing: 0 }, title: { fontFamily: typefaces.display, color: colors.ink, fontWeight: '600', fontSize: 24, lineHeight: 30, letterSpacing: -.6 }, location: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 1 }, locationText: { color: colors.muted, fontSize: 14, lineHeight: 20, flex: 1 },
  features: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 10, rowGap: 18 }, feature: { flex: 1, minWidth: 95, alignItems: 'center', gap: 8, paddingHorizontal: 4 }, featureValue: { fontSize: 20, fontWeight: '600', color: colors.ink, letterSpacing: -.4, textAlign: 'center' }, featureLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  section: { gap: 12 }, sectionTitle: { fontSize: 21, fontWeight: '700', color: colors.ink, letterSpacing: -.4, paddingHorizontal: 2 }, group: { backgroundColor: colors.white, borderRadius: 24, padding: 20 }, description: { color: colors.ink, lineHeight: 25, fontSize: 16 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 20, backgroundColor: colors.white, borderRadius: 24, padding: 20 }, amenity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexBasis: '45%', flexGrow: 1, minWidth: 120 }, amenityText: { color: colors.ink, fontSize: 15, lineHeight: 21, flex: 1 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: colors.white, borderRadius: 24 }, sellerIcon: { backgroundColor: colors.paper, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, sellerCopy: { flex: 1, gap: 5 }, sellerTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, sellerText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actionBar: { width: '100%', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden' }, actionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, rowGap: 12, paddingVertical: 13, paddingHorizontal: 20, width: '100%', maxWidth: 860, alignSelf: 'center', flexWrap: 'wrap' }, barSummary: { flexGrow: 1, gap: 4 }, barLabel: { fontSize: 12, color: colors.muted }, barPrice: { fontSize: 24, color: colors.ink, fontWeight: '700', letterSpacing: -.6 }, contactButton: { minWidth: 148, flexGrow: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' }, wideBackdrop: { justifyContent: 'center', padding: 24 }, modal: { width: '100%', alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, backgroundColor: colors.white, gap: 18 }, wideModal: { maxWidth: 440, borderRadius: 28 }, modalIcon: { backgroundColor: colors.softBlue, borderRadius: 28, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }, modalTitle: { color: colors.ink, fontSize: 26, fontWeight: '700', lineHeight: 32, letterSpacing: -.6 }, modalText: { color: colors.muted, fontSize: 16, lineHeight: 24 }, modalSmall: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
