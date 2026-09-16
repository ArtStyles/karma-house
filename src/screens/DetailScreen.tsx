import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  if (!listing) return <SafeAreaView style={styles.safe}><EmptyState title="Esta vivienda no está disponible" description="Vuelve al catálogo para explorar otras viviendas." action={<Button label="Volver a explorar" onPress={() => router.replace('/')} />} /></SafeAreaView>;
  const favorite = favoriteIds.includes(listing.id);
  async function toggle() { if (busy || !listing) return; setBusy(true); setError(''); try { await toggleFavorite(listing.id); } catch { setError('No pudimos guardar tu favorito. Inténtalo de nuevo.'); } finally { setBusy(false); } }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.navigation}><IconButton name="arrow-back" label="Volver al catálogo" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /><Text style={styles.navText}>UN NUEVO COMIENZO</Text><IconButton name={favorite ? 'heart' : 'heart-outline'} label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} onPress={toggle} active={favorite} /></View>
      <PropertyImage listing={listing} style={[styles.photo, width > 700 && { height: 430 }]} />
      <View style={styles.body}>
        <View style={styles.badges}><Text style={styles.badge}>{listing.type.toUpperCase()}</Text><Text style={styles.demo}>DEMOSTRACIÓN</Text>{listing.status !== 'active' && <Text style={styles.inactive}>{listing.status === 'sold' ? 'Vendida' : 'En pausa'}</Text>}</View>
        <Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>
        <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
        <View style={styles.location}><Icon name="location-outline" color={colors.muted} size={18} /><Text style={styles.locationText}>{listing.location}, {listing.province}, Cuba</Text></View>
        <View style={styles.features}><Feature icon="bed-outline" value={`${listing.bedrooms}`} label="Habitaciones" /><Feature icon="water-outline" value={`${listing.bathrooms}`} label="Baños" /><Feature icon="expand-outline" value={`${listing.area} m²`} label="Superficie" /></View>
        <Text style={styles.section}>Imagina tu vida aquí</Text><Text style={styles.description}>{listing.description}</Text>
        {listing.amenities.length > 0 && <><Text style={styles.section}>Lo que hace especial este hogar</Text><View style={styles.amenities}>{listing.amenities.map(value => <View key={value} style={styles.amenity}><Icon name="checkmark-circle-outline" size={18} color={colors.green} /><Text style={styles.amenityText}>{value}</Text></View>)}</View></>}
        <View style={styles.seller}><View style={styles.sellerIcon}><Icon name="person-outline" size={25} /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>{listing.owner === 'local' ? 'Tu anuncio de prueba' : 'Perfil de demostración'}</Text><Text style={styles.sellerText}>{listing.owner === 'local' ? 'Visible solo en este dispositivo' : 'Sin vendedor real asociado'}</Text></View></View>
        <Notice>{listing.photoUri ? 'Esta es una publicación local de prueba. La foto seleccionada se guarda en este dispositivo.' : 'Esta vivienda es ficticia. La fotografía fue generada para mostrar cómo se verá KarmaHouse.'}</Notice>
        {error ? <Notice error>{error}</Notice> : null}
      </View>
    </ScrollView>
    <View style={styles.actionBar}><View><Text style={styles.barLabel}>PRECIO DE VENTA</Text><Text style={styles.barPrice}>{formatMoney(listing.price)}</Text></View><Button label={listing.owner === 'local' ? 'Editar anuncio' : 'Contactar'} icon={listing.owner === 'local' ? 'create-outline' : 'chatbubble-outline'} onPress={() => listing.owner === 'local' ? router.push(`/edit/${listing.id}`) : setContact(true)} style={{ minWidth: 165 }} /></View>
    <Modal visible={contact} transparent animationType="fade" onRequestClose={() => setContact(false)}><View style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modal}><View style={styles.modalIcon}><Icon name="chatbubbles-outline" size={30} color={colors.primary} /></View><Text style={styles.modalTitle}>Aquí empezará la conversación</Text><Text style={styles.modalText}>Estás viendo una vivienda de demostración. En la versión con cuentas podrás contactar al vendedor desde aquí.</Text><Text style={styles.modalSmall}>No se ha enviado ningún mensaje.</Text><Button label="Seguir explorando" onPress={() => setContact(false)} /></View></View></Modal>
  </SafeAreaView>;
}
function Feature({ icon, value, label }: { icon: IconName; value: string; label: string }) { return <View style={styles.feature}><Icon name={icon} color={colors.ink} size={23} /><Text style={styles.featureValue}>{value}</Text><Text style={styles.featureLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 860, alignSelf: 'center' }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 18 }, navText: { color: colors.muted, fontSize: 10, letterSpacing: 1.2 },
  photo: { height: 285 }, body: { padding: 24, gap: 4 }, badges: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }, badge: { color: colors.green, backgroundColor: colors.softGreen, padding: 7, borderRadius: 5, fontSize: 10, fontWeight: '700', letterSpacing: .5 }, demo: { fontSize: 9, color: colors.muted, letterSpacing: 1 }, inactive: { color: colors.amber, fontSize: 12 },
  price: { color: colors.ink, fontSize: 33, fontWeight: '700', letterSpacing: -1 }, currency: { color: colors.muted, fontSize: 13, fontWeight: '400' }, title: { fontFamily: typefaces.display, color: colors.ink, fontSize: 30, lineHeight: 37, marginTop: 7 }, location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 }, locationText: { color: colors.muted, fontSize: 13, flex: 1 },
  features: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 23, marginVertical: 22, gap: 8 }, feature: { alignItems: 'center', gap: 7, flex: 1 }, featureValue: { fontSize: 17, fontWeight: '600', color: colors.ink }, featureLabel: { fontSize: 11, color: colors.muted }, section: { marginBottom: 10, marginTop: 12, fontSize: 18, fontWeight: '600', color: colors.ink }, description: { color: colors.muted, lineHeight: 25, fontSize: 15, marginBottom: 18 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }, amenity: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.white, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, amenityText: { color: colors.ink, fontSize: 13 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 22, borderTopWidth: 1, borderColor: colors.border }, sellerIcon: { backgroundColor: '#E8ECE8', width: 49, height: 49, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, sellerTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' }, sellerText: { color: colors.muted, fontSize: 12, marginTop: 6 },
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 14, paddingHorizontal: 22, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.white, width: '100%', maxWidth: 860, alignSelf: 'center', flexWrap: 'wrap' }, barLabel: { fontSize: 8, letterSpacing: 1, color: colors.muted, marginBottom: 4 }, barPrice: { fontSize: 23, color: colors.ink, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: '#10293D70', justifyContent: 'center', padding: 24 }, modal: { maxWidth: 420, width: '100%', alignSelf: 'center', borderRadius: 24, padding: 26, backgroundColor: colors.white, gap: 18 }, modalIcon: { backgroundColor: colors.softBlue, borderRadius: 30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }, modalTitle: { color: colors.ink, fontSize: 23, fontWeight: '600' }, modalText: { color: colors.muted, fontSize: 15, lineHeight: 23 }, modalSmall: { color: colors.muted, fontSize: 12 },
});
