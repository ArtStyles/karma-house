import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationMaterial } from '../components/NavigationMaterial';
import { PropertyImage } from '../components/PropertyImage';
import { KarmaMap } from '../components/maps/KarmaMap';
import { Button, EmptyState, goBack, Icon, IconButton, Notice, type IconName } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney, typefaces } from '../theme';
import { useListing } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { useMessaging } from '../messaging/MessagingProvider';
import { CONDITIONS } from '../domain/listingOptions';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { favoriteIds, toggleFavorite, isOwnListing, mode, storageError, refresh } = useMarketplace();
  const auth = useAuth();
  const messaging = useMessaging();
  const { listing, ready } = useListing(id);
  const [contact, setContact] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const contactScope = `${id}:${auth.user?.id ?? ''}`;
  const currentScope = useRef(contactScope);
  currentScope.current = contactScope;
  const contactInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setContactBusy(false); setContactError(''); contactInFlight.current = false; }, [contactScope]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => { setPhotoIndex(0); setError(''); setContact(false); }, [id]);
  async function reload() { setRefreshing(true); try { await refresh(); } catch { /* Provider exposes the remote error. */ } finally { setRefreshing(false); } }
  if (!listing) return <SafeAreaView style={styles.safe}>{!ready ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.sellerText}>Cargando vivienda…</Text></View> : storageError ? <View style={styles.body}><Notice error>{storageError}</Notice><Button label="Volver a cargar" loading={refreshing} onPress={reload} /><Button label="Volver a explorar" secondary onPress={() => router.replace('/')} /></View> : <EmptyState title="Esta vivienda no está disponible" description="Vuelve al catálogo para explorar otras viviendas." action={<Button label="Volver a explorar" onPress={() => router.replace('/')} />} />}</SafeAreaView>;
  const favorite = favoriteIds.includes(listing.id);
  const own = isOwnListing(listing);
  const photoCount = Math.min(listing.photos?.length || (listing.photoUri ? 1 : 0), 6);
  const selectedPhoto = Math.min(photoIndex, Math.max(photoCount - 1, 0));
  const moderation = listing.moderationStatus === 'draft' ? 'Borrador' : listing.moderationStatus === 'pending' ? 'En revisión' : listing.moderationStatus === 'rejected' ? 'Necesita cambios' : '';
  async function toggle() {
    if (busy || !listing || !auth.ready) return;
    if (mode === 'cloud' && !auth.user) { router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } }); return; }
    setBusy(true); setError('');
    try { await toggleFavorite(listing.id); }
    catch { setError('No pudimos guardar tu favorito. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  async function contactSeller() {
    if (!listing || !auth.ready || contactInFlight.current) return;
    if (mode === 'demo') { setContact(true); return; }
    if (!auth.user) { router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } }); return; }
    contactInFlight.current = true; setContactBusy(true); setContactError('');
    const scope = contactScope;
    try {
      const conversationId = await messaging.startConversation(listing.id);
      if (mounted.current && currentScope.current === scope) router.push(`/messages/${conversationId}`);
    } catch (failure) {
      if (mounted.current && currentScope.current === scope) setContactError(failure instanceof Error ? failure.message : 'No pudimos abrir la conversación. Inténtalo de nuevo.');
    } finally {
      if (mounted.current && currentScope.current === scope) { contactInFlight.current = false; setContactBusy(false); }
    }
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.photoFrame}>
        <PropertyImage listing={listing} photoIndex={selectedPhoto} style={[styles.photo, width >= 700 && styles.widePhoto]} />
        <View style={styles.navigation}>
          <IconButton name="chevron-back" label="Volver al catálogo" onPress={() => goBack()} style={styles.floatingButton} />
          <View style={styles.navigationTitle}><Text style={styles.navText}>{listing.type}</Text></View>
          <IconButton name={favorite ? 'heart' : 'heart-outline'} label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} onPress={toggle} active={favorite} style={styles.floatingButton} />
        </View>
        {photoCount > 1 && <View style={styles.photoControls}>
          <IconButton name="chevron-back" label="Foto anterior" onPress={() => setPhotoIndex((selectedPhoto + photoCount - 1) % photoCount)} style={styles.floatingButton} />
          <Text accessibilityLiveRegion="polite" style={styles.photoCount}>{selectedPhoto + 1} / {photoCount}</Text>
          <IconButton name="chevron-forward" label="Foto siguiente" onPress={() => setPhotoIndex((selectedPhoto + 1) % photoCount)} style={styles.floatingButton} />
        </View>}
      </View>
      <View style={styles.body}>
        {photoCount > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>
          {Array.from({ length: photoCount }, (_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Ver foto ${index + 1} de ${photoCount}`} accessibilityState={{ selected: index === selectedPhoto }} onPress={() => setPhotoIndex(index)} style={[styles.thumbnail, index === selectedPhoto && styles.thumbnailSelected]}>
            <PropertyImage listing={listing} photoIndex={index} style={styles.thumbnailImage} />
          </Pressable>)}
        </ScrollView>}
        <View style={styles.summary}>
          <View style={styles.badges}>
            <View style={[styles.statusBadge, listing.status !== 'active' && styles.inactiveBadge]}>
              <View style={[styles.statusDot, listing.status !== 'active' && styles.inactiveDot]} />
              <Text style={[styles.statusText, listing.status !== 'active' && styles.inactiveText]}>{listing.status === 'active' ? 'En venta' : listing.status === 'sold' ? 'Vendida' : 'En pausa'}</Text>
            </View>
            {mode === 'demo' ? <Text style={styles.demo}>{own ? 'Anuncio local' : 'Vivienda de muestra'}</Text> : moderation ? <Text style={styles.moderation}>{moderation}</Text> : own ? <Text style={styles.demo}>Tu anuncio</Text> : null}
          </View>
          <Text style={styles.price}>{formatMoney(listing.price)} <Text style={styles.currency}>USD</Text></Text>
          <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
          <View style={styles.location}><Icon name="location-outline" color={colors.muted} size={17} /><Text style={styles.locationText}>{listing.location}, {listing.province}, Cuba</Text></View>
        </View>
        {own && Boolean(moderation) && <Notice>{listing.moderationStatus === 'rejected' ? listing.reviewNote || 'Revisa los detalles del anuncio antes de enviarlo de nuevo.' : listing.moderationStatus === 'pending' ? 'Tu anuncio está en revisión. Aparecerá en el catálogo cuando sea aprobado y esté en venta.' : 'Este borrador solo aparece en tu cuenta. Envíalo a revisión cuando esté listo.'}</Notice>}
        <View style={styles.features}>
          <Feature icon="bed-outline" value={`${listing.bedrooms}`} label={listing.bedrooms === 1 ? 'Habitación' : 'Habitaciones'} />
          <Feature icon="water-outline" value={`${listing.bathrooms}`} label={listing.bathrooms === 1 ? 'Baño' : 'Baños'} />
          <Feature icon="expand-outline" value={`${listing.area} m²`} label="Superficie" />
        </View>
        <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>Sobre esta vivienda</Text><View style={styles.group}><Text style={styles.description}>{listing.description}</Text></View></View>
        {(listing.condition || listing.floor !== undefined || listing.priceNegotiable !== undefined) && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Más detalles</Text>
          <View style={styles.amenities}>
            {listing.condition && <View style={styles.amenity}><Icon name="construct-outline" size={21} color={colors.primary} /><Text style={styles.amenityText}>{CONDITIONS.find(item => item.value === listing.condition)?.label}</Text></View>}
            {listing.floor !== undefined && <View style={styles.amenity}><Icon name="layers-outline" size={21} color={colors.primary} /><Text style={styles.amenityText}>{listing.floor === 0 ? 'Planta baja' : `Planta ${listing.floor}`}</Text></View>}
            {listing.priceNegotiable !== undefined && <View style={styles.amenity}><Icon name="pricetag-outline" size={21} color={colors.primary} /><Text style={styles.amenityText}>{listing.priceNegotiable ? 'Precio negociable' : 'Precio fijo'}</Text></View>}
          </View>
        </View>}
        {listing.amenities.length > 0 && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Comodidades</Text>
          <View style={styles.amenities}>{listing.amenities.map(value => <View key={value} style={styles.amenity}><Icon name="checkmark-circle" size={21} color={colors.primary} /><Text style={styles.amenityText}>{value}</Text></View>)}</View>
        </View>}
        {listing.mapLocation && <View style={styles.section}>
          <View style={styles.mapHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Ubicación</Text><Text style={styles.mapPrecision}>{listing.mapLocation.precision === 'approximate' ? 'Aproximada' : 'Exacta'}</Text></View>
          {/* A map inside a ScrollView must not eat the drag; the listing is read, not explored. */}
          <View style={styles.mapFrame}><KarmaMap
            interactive={false}
            style={{ height: 280 }} center={listing.mapLocation} zoom={listing.mapLocation.precision === 'approximate' ? 13 : 15}
            markers={[{ id: listing.id, coordinate: listing.mapLocation, precision: listing.mapLocation.precision }]}
            selectedMarkerId={listing.id} accessibilityLabel={`Ubicación ${listing.mapLocation.precision === 'approximate' ? 'aproximada' : 'exacta'} de ${listing.title}`}
          /></View>
          <Text style={styles.mapDescription}>{listing.mapLocation.precision === 'approximate' ? 'El área de 800 m muestra la zona de la vivienda. El punto exacto no se publica.' : 'Punto indicado por quien publica la vivienda.'}</Text>
        </View>}
        <View style={styles.seller}>
          <View style={styles.sellerIcon}><Icon name="person" size={25} color={colors.muted} /></View>
          <View style={styles.sellerCopy}><Text style={styles.sellerTitle}>{mode === 'cloud' ? own ? 'Publicado por ti' : 'Información del anuncio' : own ? 'Tu anuncio de prueba' : 'Perfil de demostración'}</Text><Text style={styles.sellerText}>{mode === 'cloud' ? own ? 'Gestiona los detalles desde tu espacio' : 'Detalles aportados por quien publica' : own ? 'Visible solo en este dispositivo' : 'Sin vendedor real asociado'}</Text></View>
        </View>
        {mode === 'demo' && <Notice>{listing.photoUri ? 'Esta es una publicación local de prueba. La foto seleccionada se guarda en este dispositivo.' : 'Esta vivienda es ficticia. La fotografía fue generada para mostrar cómo se verá KarmaHouse.'}</Notice>}
        {storageError ? <Notice error>{storageError}</Notice> : null}
        {error ? <Notice error>{error}</Notice> : null}
      </View>
    </ScrollView>
    <SafeAreaView edges={['bottom']} style={styles.actionBar}>
      <NavigationMaterial />
      {contactError ? <View style={{ paddingHorizontal: 20 }}><Notice error>{contactError}</Notice></View> : null}
      <View style={styles.actionContent}>
        <View style={styles.barSummary}><Text style={styles.barLabel}>Precio de venta · USD</Text><Text style={styles.barPrice}>{formatMoney(listing.price)}</Text></View>
        <Button label={own ? 'Editar anuncio' : 'Contactar'} icon={own ? 'create-outline' : 'chatbubble-outline'} loading={contactBusy} disabled={!own && (!auth.ready || (Boolean(auth.user) && !messaging.ready))} onPress={() => own ? router.push(`/edit/${listing.id}`) : void contactSeller()} style={styles.contactButton} />
      </View>
    </SafeAreaView>
    <Modal visible={contact} transparent animationType="fade" onRequestClose={() => setContact(false)}>
      <View style={[styles.modalBackdrop, width >= 700 && styles.wideBackdrop]}>
        <View accessibilityViewIsModal style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 24) }, width >= 700 && styles.wideModal]}>
          <View style={styles.modalIcon}><Icon name="chatbubbles-outline" size={29} color={colors.primary} /></View>
          <Text accessibilityRole="header" style={styles.modalTitle}>Una vivienda de muestra</Text>
          <Text style={styles.modalText}>Esta vivienda no tiene un vendedor real. El chat está disponible para los anuncios publicados con una cuenta de KarmaHouse.</Text>
          <Button label="Entendido" onPress={() => setContact(false)} />
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  photoFrame: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', backgroundColor: colors.border }, photo: { height: 340, width: '100%' }, widePhoto: { height: 430 },
  photoControls: { position: 'absolute', bottom: 18, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, photoCount: { backgroundColor: '#00000080', color: colors.white, fontSize: 13, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  thumbnails: { gap: 10 }, thumbnail: { width: 76, height: 60, borderRadius: 13, borderWidth: 2, borderColor: 'transparent', padding: 2, overflow: 'hidden' }, thumbnailSelected: { borderColor: colors.primary }, thumbnailImage: { width: '100%', height: '100%', borderRadius: 8 }, moderation: { color: colors.amber, fontSize: 12, fontWeight: '600' },
  navigation: { position: 'absolute', top: 16, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, floatingButton: { backgroundColor: '#FFFFFFF5' }, navigationTitle: { backgroundColor: '#FFFFFFF5', borderRadius: 22, paddingVertical: 11, paddingHorizontal: 17, flexShrink: 1 }, navText: { color: colors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28, gap: 24 }, summary: { gap: 9 },
  badges: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }, statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.softGreen, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 }, statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green }, statusText: { fontSize: 12, fontWeight: '600', color: colors.green }, inactiveBadge: { backgroundColor: '#FFF3DA' }, inactiveDot: { backgroundColor: colors.amber }, inactiveText: { color: colors.amber }, demo: { fontSize: 12, color: colors.muted },
  price: { color: colors.ink, fontSize: 34, fontWeight: '700', letterSpacing: -1.1 }, currency: { color: colors.muted, fontSize: 15, fontWeight: '500', letterSpacing: 0 }, title: { fontFamily: typefaces.display, color: colors.ink, fontWeight: '600', fontSize: 24, lineHeight: 30, letterSpacing: -.6 }, location: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 1 }, locationText: { color: colors.muted, fontSize: 14, lineHeight: 20, flex: 1 },
  features: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 10, rowGap: 18 }, feature: { flex: 1, minWidth: 95, alignItems: 'center', gap: 8, paddingHorizontal: 4 }, featureValue: { fontSize: 20, fontWeight: '600', color: colors.ink, letterSpacing: -.4, textAlign: 'center' }, featureLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  section: { gap: 12 }, sectionTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, letterSpacing: -.2, paddingHorizontal: 2 }, group: { backgroundColor: colors.white, borderRadius: 24, padding: 20 }, description: { color: colors.ink, lineHeight: 25, fontSize: 16 },
  mapHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, mapPrecision: { color: colors.primary, fontSize: 12, fontWeight: '600', backgroundColor: colors.softBlue, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }, mapFrame: { borderRadius: 24, overflow: 'hidden' }, mapDescription: { fontSize: 13, lineHeight: 20, color: colors.muted, paddingHorizontal: 2 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 20, backgroundColor: colors.white, borderRadius: 24, padding: 20 }, amenity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexBasis: '45%', flexGrow: 1, minWidth: 120 }, amenityText: { color: colors.ink, fontSize: 15, lineHeight: 21, flex: 1 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: colors.white, borderRadius: 24 }, sellerIcon: { backgroundColor: colors.paper, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, sellerCopy: { flex: 1, gap: 5 }, sellerTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, sellerText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actionBar: { width: '100%', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden' }, actionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, rowGap: 12, paddingVertical: 13, paddingHorizontal: 20, width: '100%', maxWidth: 860, alignSelf: 'center', flexWrap: 'wrap' }, barSummary: { flexGrow: 1, gap: 4 }, barLabel: { fontSize: 12, color: colors.muted }, barPrice: { fontSize: 24, color: colors.ink, fontWeight: '700', letterSpacing: -.6 }, contactButton: { minWidth: 148, flexGrow: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' }, wideBackdrop: { justifyContent: 'center', padding: 24 }, modal: { width: '100%', alignSelf: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, backgroundColor: colors.white, gap: 18 }, wideModal: { maxWidth: 440, borderRadius: 28 }, modalIcon: { backgroundColor: colors.softBlue, borderRadius: 28, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }, modalTitle: { color: colors.ink, fontSize: 26, fontWeight: '700', lineHeight: 32, letterSpacing: -.6 }, modalText: { color: colors.muted, fontSize: 16, lineHeight: 24 }, modalSmall: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
