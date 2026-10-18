import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArchImage } from '../components/ArchImage';
import { Cartel } from '../components/Cartel';
import { PhotoGallery } from '../components/PhotoGallery';
import { Sheet } from '../components/Sheet';
import { StateChip } from '../components/StateChip';
import { PropertyImage } from '../components/PropertyImage';
import { KarmaMap } from '../components/maps/KarmaMap';
import { MapOnDemand } from '../components/ExploreMap';
import { Button, goBack, Icon, IconButton, Notice } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { useFavoriteHeart } from '../state/useFavoriteHeart';
import { createThemedStyles, formatMoney, rounded, typography } from '../theme';
import { useListing } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { useMessaging } from '../messaging/MessagingProvider';
import { CONDITIONS } from '../domain/listingOptions';
import { ReportConversationSheet } from '../components/messaging/ReportConversationSheet';
import { createPropertyReportRepository, PROPERTY_REPORT_REASONS } from '../data/propertyReports';
import { supabase } from '../lib/supabase';
import { UserAvatar } from '../components/account/UserAvatar';
import { levelLabel } from '../profiles/domain';
import { usePublicProfile } from '../profiles/usePublicProfile';
import { PUBLIC_PAGES_URL, listingShareUrl } from '../lib/publicSite';
import { cartelLabel, listingOperation, minStayText, priceSuffix, shareText, swapBalanceText, typeLabel, wantedOperationsText } from '../domain/operations';
import {useListingManagement} from '../transfers/useListingManagement';
import { listingPresentation } from '../catalog/presentation';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import {pendingIntentDestination} from '../auth/pendingIntent';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {agencyError} from '../agencies/domain';
import {readPublicPropertyContact,createAgencyMessagingRepository} from '../agencies/messaging/repository';
import type {PublicPropertyContact,PublicAgencyContact} from '../agencies/messaging/types';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {createMessageId,isUuid} from '../messaging/domain';

import {validatePublicAgencyShare,agencyShareUrl} from '../agencies/share';
const NEEDS_CONNECTION = 'Necesitas conexión para esto.';

export default function DetailScreen() {
  const { colors, styles } = useStyles();
  const { id,agencyId,managerId } = useLocalSearchParams<{ id: string;agencyId?:string;managerId?:string }>();
  const { isOwnListing, mode, storageError } = useMarketplace();
  const auth = useAuth();
  const messaging = useMessaging();
  const workspace=useAgencyWorkspace();
  const[publicContact,setPublicContact]=useState<{id:string;value:PublicPropertyContact|null}|null>(null);
  const [contactReadError, setContactReadError] = useState('');
  const [contactLoadAttempt, setContactLoadAttempt] = useState(0);
  const[agencyChoice,setAgencyChoice]=useState(false);
  const[preferred,setPreferred]=useState<{agencyId:string;managerId?:string}|null>(null);
  const contactOptions=publicContact?.id===id?publicContact.value:null;
  const agencyAttempt=useRef<{key:string;requestId:string}|null>(null);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setPublicContact(null); setContactReadError('');
    setPreferred(agencyId && isUuid(agencyId) && (!managerId || isUuid(managerId)) ? { agencyId, managerId } : null);
    if (supabase && isUuid(id)) void readPublicPropertyContact(supabase, id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPublicContact({ id, value }); })
      .catch(() => { if (!controller.signal.aborted) setContactReadError('No pudimos cargar las opciones de contacto. Inténtalo de nuevo.'); });
    return () => controller.abort();
  }, [id, agencyId, managerId, contactLoadAttempt]));
  const { listing, ready, offline, error: listingError, retry } = useListing(id);
  const heart=useFavoriteHeart(listing?.id??id),favorite=heart.favorite;
  const management=useListingManagement(id);
  const [contact, setContact] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const contactScope = `${id}:${auth.user?.id ?? ''}:${auth.session?.access_token??''}`;
  const currentScope = useRef(contactScope);
  currentScope.current = contactScope;
  const contactInFlight = useRef(false);
  const contactGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const closeContact = useCallback(() => {
    contactGeneration.current += 1;
    contactInFlight.current = false;
    setContactBusy(false); setAgencyChoice(false); setContact(false);
  }, []);
  useEffect(() => { closeContact(); setContactError(''); }, [contactScope, closeContact]);
  useFocusEffect(useCallback(() => () => closeContact(), [closeContact]));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intentNotice, setIntentNotice] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setIntentNotice('');
    const destination=agencyId&&isUuid(agencyId)&&(!managerId||isUuid(managerId))?pendingIntentDestination({kind:'agency-contact',propertyId:id,agencyId,...(managerId?{preferredManagerId:managerId}:{})}):`/property/${id}`;
    if (auth.ready && auth.user) void pendingIntentStore.take(destination, () => active).then(intent => {
      if(active&&intent?.kind==='agency-contact')setPreferred({agencyId:intent.agencyId,managerId:intent.preferredManagerId});
      if (active && intent && intent.kind !== 'search') setIntentNotice(intent.kind === 'favorite'
        ? 'Volviste a esta vivienda. Toca el corazón para confirmar el favorito.'
        : 'Volviste a esta vivienda. Revisa su responsable y toca Contactar para iniciar la conversación.');
    });
    return () => { active = false; };
  }, [id,agencyId,managerId, auth.ready, auth.user?.id]));
  const [photoIndex, setPhotoIndex] = useState(0);
  const [report, setReport] = useState(false);
  const [gallery, setGallery] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => { setPhotoIndex(0); setError(''); setContact(false); setReport(false); setGallery(false); }, [id]);
  const sellerId = contactOptions?.personalContact && !offline && mode === 'cloud' && management.value?.contactAvailable && management.value.managerId!==auth.user?.id ? management.value.managerId : undefined;
  // Only owners of an approved, active listing (or someone already in a chat) have a public profile.
  const seller = usePublicProfile(sellerId);
  const sellerProfile = sellerId ? seller.profile : null;
  const presentation = listingPresentation({ ready, hasData: !!listing, error: listingError, offline });
  if (!listing) return <SafeAreaView style={styles.safe}>{presentation === 'loading' ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.sellerText}>Cargando vivienda…</Text></View> : presentation === 'error' ? <View style={styles.body}><Notice error>{`No pudimos cargar esta vivienda. ${listingError}`}</Notice><Button label="Reintentar" onPress={retry} /><Button label="Volver a explorar" secondary onPress={() => router.replace('/')} /></View> : <Unavailable />}</SafeAreaView>;
  const own = mode==='demo'?isOwnListing(listing):Boolean(!offline&&auth.user&&management.value?.canEditPersonal&&management.value.managerId===auth.user.id);
  const operation = listingOperation(listing);
  const wanted = operation === 'wanted';
  const photoCount = offline ? (listing.coverThumb?.uri || listing.photoUri ? 1 : 0) : Math.min(listing.photos?.length || (listing.photoUri ? 1 : 0), 6);
  const selectedPhoto = Math.min(photoIndex, Math.max(photoCount - 1, 0));
  const moderation = listing.moderationStatus === 'draft' ? 'Borrador' : listing.moderationStatus === 'pending' ? 'En revisión' : listing.moderationStatus === 'rejected' ? 'Necesita cambios' : '';
  async function toggle() {
    if (busy || !listing || !auth.ready) return;
    if (offline) { setError(NEEDS_CONNECTION); return; }
    setError('');
    try {
      if (mode === 'cloud' && !auth.user) {
        setBusy(true);
        await pendingIntentStore.write({ kind: 'favorite', propertyId: listing.id });
        router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } });
      } else { setIntentNotice(''); await heart.toggle(); }
    }
    catch { setError('No pudimos guardar tu favorito. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  async function contactSeller(choice?:PublicAgencyContact,personal=false) {
    if (!listing || !auth.ready || contactInFlight.current) return;
    if (mode === 'demo') { setContact(true); return; }
    if (offline) { setContactError(NEEDS_CONNECTION); return; }
    if(!contactOptions){setContactError('No pudimos comprobar las opciones de contacto. Actualiza la ficha.');return;}
    if(!choice&&!personal&&((agencyId&&!isUuid(agencyId))||(managerId&&(!agencyId||!isUuid(managerId))))){setPreferred(null);setContactError('El destino del enlace no es válido. Elige un contacto para confirmarlo.');setAgencyChoice(true);return;}
    if(!choice&&!personal&&(contactOptions.agencies.length>0||preferred)){setAgencyChoice(true);return;}
    if(!choice&&!contactOptions.personalContact){setContactError('El contacto de esta inmobiliaria no está disponible.');return;}
    contactInFlight.current = true; setContactBusy(true); setContactError('');
    const scope = contactScope;
    const generation = ++contactGeneration.current;
    const isCurrent = () => mounted.current && currentScope.current === scope && contactGeneration.current === generation;
    try {
      if (!auth.user) {
        const intent=choice?{kind:'agency-contact' as const,propertyId:listing.id,agencyId:choice.agencyId,...(preferred?.agencyId===choice.agencyId&&preferred.managerId?{preferredManagerId:preferred.managerId}:{})}:{kind:'contact' as const,propertyId:listing.id};
        await pendingIntentStore.write(intent);
        if (!isCurrent()) return;
        closeContact();
        router.push({ pathname: '/auth', params: { returnTo: pendingIntentDestination(intent) } });
        return;
      }
      setIntentNotice('');
      if(choice){
        if(!supabase)throw Error(NEEDS_CONNECTION);
        const ctx=workspace.captureAccountContext();
        try{const fresh=await readPublicPropertyContact(supabase,listing.id,ctx.signal);ctx.checkpoint();if(!isCurrent())return;if(!fresh?.agencies.some(a=>a.agencyId===choice.agencyId&&a.contactAvailable))throw Error('La inmobiliaria elegida ya no está disponible. Revisa las opciones.');
          const preferredManagerId=preferred?.agencyId===choice.agencyId?preferred.managerId:undefined,key=`${scope}:${choice.agencyId}:${preferredManagerId??''}`;
          if(agencyAttempt.current?.key!==key)agencyAttempt.current={key,requestId:createMessageId()};
          const conversation=await createAgencyMessagingRepository(supabase).start({propertyId:fresh.propertyId,agencyId:choice.agencyId,...(preferredManagerId?{preferredManagerId}:{}),clientRequestId:agencyAttempt.current.requestId},ctx);
          ctx.checkpoint();if(isCurrent()){closeContact();router.push(`/agency-conversation/${conversation.id}`)}
        }finally{ctx.release()}return;
      }
      const expected=management.value?.managerId??listing.ownerId;
      const current=await management.refresh();
      if (!isCurrent()) return;
      if(!current?.contactAvailable)throw Error('Este anuncio ya no está disponible para contacto.');
      if(current.managerId!==expected){retry();throw Error('El responsable del anuncio cambió. Revisa la ficha actualizada y vuelve a tocar Contactar.');}
      const conversationId = await messaging.startConversation(listing.id,current.managerId);
      if (isCurrent()) { closeContact(); router.push(`/messages/${conversationId}`); }
    } catch (failure) {
      if(!isCurrent())return;
      const failureText=failure instanceof Error?failure.message:failure&&typeof failure==='object'&&'message'in failure&&typeof failure.message==='string'?failure.message:'';
      if(/KH_AGENCY_MANAGER_CHANGED|KH_AGENCY_ASSIGNMENT_CHANGED|KH_CHAT_BLOCKED/.test(failureText)){setPreferred(null);agencyAttempt.current=null;setAgencyChoice(true);setContactError('Ese contacto no está disponible. Elige de nuevo una inmobiliaria para confirmar el destino.');return;}
      if(/responsable.*cambió|KH_CHAT_MANAGER_CHANGED/i.test(failure instanceof Error?failure.message:'')){retry();void management.refresh().catch(()=>{});}
      if (isCurrent()) setContactError(choice?agencyError(failure):failure instanceof Error ? failure.message : 'No pudimos abrir la conversación. Inténtalo de nuevo.');
    } finally {
      if (isCurrent()) { contactInFlight.current = false; setContactBusy(false); }
    }
  }
  function openContact() {
    setContactError('');
    if (mode === 'demo') { setContact(true); return; }
    if (offline) { setContactError(NEEDS_CONNECTION); return; }
    if ((agencyId && !isUuid(agencyId)) || (managerId && (!agencyId || !isUuid(managerId)))) {
      setPreferred(null); setContactError('El destino del enlace no es válido. Elige un contacto para confirmarlo.');
    }
    const only = contactOptions && !contactOptions.personalContact && contactOptions.agencies.length === 1 ? contactOptions.agencies[0] : null;
    // One agency and no link to confirm: Contactar opens its chat without a choice to make.
    if (only?.contactAvailable && !preferred && !agencyId && !managerId && auth.ready && (!auth.user || messaging.ready)) { void contactSeller(only); return; }
    setAgencyChoice(true);
  }
  async function share() {
    if (!listing) return;
    try { let url=listingShareUrl(listing.id);if(supabase&&preferred){const destination=await validatePublicAgencyShare(supabase,listing.id,preferred.agencyId,preferred.managerId);if(destination)url=agencyShareUrl(destination);else{setPreferred(null);setError('El contacto del enlace ya no está autorizado. Se comparte la ficha general.');}}
    const message = shareText(listing,url);await Share.share({ title: listing.title, message, url }); } catch { /* Dismissed, or this browser has no share target. */ }
  }
  function openReport() {
    if (!listing) return;
    if (offline) { setError(NEEDS_CONNECTION); return; }
    if (!auth.user) { router.push({ pathname: '/auth', params: { returnTo: `/property/${listing.id}` } }); return; }
    setReport(true);
  }
  async function sendReport(reason: (typeof PROPERTY_REPORT_REASONS)[number]['value'], details: string, clientReportId: string) {
    const session = auth.session;
    if (!supabase || !session || !listing) throw new Error('Inicia sesión para reportar este anuncio.');
    await createPropertyReportRepository(supabase, { actorId: session.user.id, accessToken: session.access_token }).report(listing.id, reason, details, clientReportId);
  }
  const contactProperty = <View style={styles.contactProperty}>
    <ArchImage width={56} height={64} bottom={14}>{wanted && photoCount === 0 ? <View style={styles.contactWanted}><Icon name="search-outline" size={22} color={colors.primary} /></View> : <PropertyImage listing={listing} photoIndex={selectedPhoto} variant="thumb" style={styles.fill} />}</ArchImage>
    <View style={styles.contactPropertyCopy}><Text numberOfLines={2} style={styles.contactPropertyTitle}>{listing.title}</Text><Text style={styles.sellerText}>{listing.location}, {listing.province}</Text><Text style={styles.contactPropertyPrice}>{wanted ? 'Hasta ' : ''}{formatMoney(listing.price)} USD{priceSuffix(listing)}</Text></View>
  </View>;
  const statusText = wanted ? listing.status === 'active' ? 'Búsqueda activa' : listing.status === 'sold' ? 'Cerrada' : 'En pausa' : listing.status === 'active' ? operation === 'swap' ? 'En permuta' : operation === 'rent' ? 'En alquiler' : 'En venta' : listing.status === 'sold' ? operation === 'rent' ? 'Alquilada' : 'Vendida' : 'En pausa';
  // The sign names the operation; once a sale or rental closes it says so instead.
  const sign = listing.status === 'sold' && !wanted ? operation === 'rent' ? 'Alquilada' : 'Vendida' : cartelLabel(listing);
  const priceHeading = wanted ? 'Presupuesto máximo · USD' : operation === 'swap' ? 'Valor estimado · USD' : operation === 'rent' ? `Alquiler · USD${priceSuffix(listing)}` : 'Precio de venta · USD';
  const approximate = listing.mapLocation?.precision === 'approximate';
  // Up to four thumbnails; a fifth tile with «+N» opens the gallery.
  const thumbs = photoCount > 5 ? 4 : photoCount;
  const wide = width >= 700;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    {!!intentNotice && <View style={{ padding: 16 }}><Notice>{intentNotice}</Notice></View>}
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.photoFrame, wide && styles.widePhotoFrame]}>
        {wanted && photoCount === 0
          ? <View style={styles.wantedHero}><Icon name="search-outline" size={40} color={colors.primary} /><Text style={styles.wantedHeroText}>Busco vivienda</Text></View>
          : <Pressable accessibilityRole="button" accessibilityLabel={photoCount > 1 ? `Ver las ${photoCount} fotos a pantalla completa` : 'Ver la foto a pantalla completa'} disabled={photoCount === 0} onPress={() => setGallery(true)}>
            <PropertyImage listing={listing} photoIndex={selectedPhoto} eager fit="contain" style={[styles.photo, wide && styles.widePhoto]} />
          </Pressable>}
        <View style={styles.navigation}>
          <IconButton name="chevron-back" label="Volver al catálogo" onPress={() => goBack()} color={colors.onDark} style={styles.floatingButton} />
          <View style={styles.navigationActions}>
            <IconButton name={favorite ? 'heart' : 'heart-outline'} label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} onPress={toggle} active={favorite} color={colors.onDark} style={styles.floatingButton} />
            <IconButton name="share-social-outline" label="Compartir vivienda" onPress={() => void share()} color={colors.onDark} style={styles.floatingButton} />
          </View>
        </View>
        {photoCount > 1 && <Text accessibilityLiveRegion="polite" style={styles.photoCount}>{selectedPhoto + 1} / {photoCount}</Text>}
      </View>
      {photoCount > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>
        {Array.from({ length: thumbs }, (_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Ver foto ${index + 1} de ${photoCount}`} accessibilityState={{ selected: index === selectedPhoto }} onPress={() => setPhotoIndex(index)} style={[styles.thumbnail, index === selectedPhoto && styles.thumbnailSelected]}>
          <PropertyImage listing={listing} photoIndex={index} onReveal={() => setPhotoIndex(index)} style={styles.fill} />
        </Pressable>)}
        {photoCount > thumbs && <Pressable accessibilityRole="button" accessibilityLabel={`Ver las ${photoCount} fotos`} onPress={() => setGallery(true)} style={[styles.thumbnail, styles.more]}><Text style={styles.moreText}>+{photoCount - thumbs}</Text></Pressable>}
      </ScrollView>}
      <View style={styles.body}>
        {contactOptions&&!contactOptions.personalContact&&contactOptions.agencies.length===0&&<Notice>El contacto de esta inmobiliaria no está disponible ahora.</Notice>}
        {Boolean(heart.error)&&<Notice error>{heart.error}</Notice>}
        {management.value?.assistedByKarmaHouse&&<Notice>Publicado con asistencia de KarmaHouse. {own ? 'Ahora tú gestionas este anuncio.' : sellerProfile?.displayName?`La gestión actual corresponde a ${sellerProfile.displayName}.`:'Las consultas nuevas se dirigen al responsable vigente.'}</Notice>}
        {Boolean(management.error)&&!offline&&<Notice error>{management.error}</Notice>}
        {Boolean(listingError) && !offline && <View style={{ gap: 8 }}><Notice error>{`No pudimos actualizar la ficha. ${listingError}`}</Notice><Button label="Reintentar ficha" secondary onPress={retry} /></View>}
        {offline && <View style={{ gap: 8 }}><Notice>Sin conexión. Esta es una copia guardada; el precio y la disponibilidad pueden haber cambiado. Contactar y guardar favoritos requieren conexión.</Notice><Button label="Reintentar conexión" secondary onPress={retry} /></View>}
        <View style={styles.summary}>
          <View pointerEvents="none" style={styles.sign}><Cartel label={sign} /></View>
          <View style={styles.badges}>
            <StateChip tone={listing.status === 'active' ? 'done' : listing.status === 'sold' ? 'neutral' : 'paused'} label={statusText} />
            {mode === 'demo' ? <Text style={styles.demo}>{own ? 'Anuncio local' : 'Vivienda de muestra'}</Text> : moderation ? <Text style={styles.moderation}>{moderation}</Text> : own ? <Text style={styles.demo}>Tu anuncio</Text> : null}
          </View>
          <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
          <View style={styles.location}><Icon name="location-outline" color={colors.body} size={17} /><Text style={styles.locationText}>{listing.location}, {listing.province}, Cuba{approximate ? ' · ubicación aproximada' : ''}</Text></View>
        </View>
        {own && Boolean(moderation) && <Notice>{listing.moderationStatus === 'rejected' ? listing.reviewNote || 'Revisa los detalles del anuncio antes de enviarlo de nuevo.' : listing.moderationStatus === 'pending' ? 'Tu anuncio está en revisión. Aparecerá en el catálogo cuando sea aprobado y esté en venta.' : 'Este borrador solo aparece en tu cuenta. Envíalo a revisión cuando esté listo.'}</Notice>}
        {mode === 'cloud' && wanted && own && listing.moderationStatus === 'approved' && <Notice>Te avisaremos cuando aparezca una vivienda que encaje.</Notice>}
        <View style={styles.features}>
          {wanted ? <>
            <Feature value={`${listing.bedrooms}`} unit="hab" label="Mínimo" />
            <Feature value={typeLabel(listing)} label="Tipo" text />
          </> : <>
            <Feature value={`${listing.bedrooms}`} label={listing.bedrooms === 1 ? 'Habitación' : 'Habitaciones'} />
            <Feature value={`${listing.bathrooms}`} label={listing.bathrooms === 1 ? 'Baño' : 'Baños'} />
            {listing.area !== undefined && <Feature value={`${listing.area}`} unit="m²" label="Superficie" />}
          </>}
        </View>
        {wanted && <Text style={styles.wantedOperations}>Busca: {wantedOperationsText(listing)}</Text>}
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>{priceHeading}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{wanted ? 'Hasta ' : ''}{formatMoney(listing.price)}</Text>
            {listing.priceNegotiable && <Text style={styles.negotiable}>Precio negociable</Text>}
          </View>
        </View>
        <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{wanted ? 'Qué busca' : 'Sobre esta vivienda'}</Text><Text style={styles.description}>{listing.description}</Text></View>
        {listing.swap && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>A cambio busca</Text>
          <Text style={styles.description}>{listing.swap.wants}</Text>
          <View style={styles.tiles}>
            <Detail label="Diferencia" value={swapBalanceText(listing.swap)} />
            {listing.swap.provinces.length > 0 && <Detail label="Provincias" value={listing.swap.provinces.join(', ')} />}
          </View>
        </View>}
        {(listing.condition || listing.floor !== undefined || listing.priceNegotiable !== undefined || listing.rent?.minStay !== undefined) && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Más detalles</Text>
          <View style={styles.tiles}>
            {listing.condition && <Detail label="Estado" value={CONDITIONS.find(item => item.value === listing.condition)?.label ?? ''} />}
            {listing.floor !== undefined && <Detail label="Planta" value={listing.floor === 0 ? 'Planta baja' : `Planta ${listing.floor}`} />}
            {listing.priceNegotiable !== undefined && <Detail label="Precio" value={listing.priceNegotiable ? 'Precio negociable' : 'Precio fijo'} />}
            {listing.rent?.minStay !== undefined && <Detail label="Estancia mínima" value={minStayText(listing.rent.period, listing.rent.minStay)} />}
          </View>
        </View>}
        {listing.amenities.length > 0 && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Comodidades</Text>
          <View style={styles.amenities}>{listing.amenities.map(value => <Text key={value} style={styles.amenity}>{value}</Text>)}</View>
        </View>}
        {listing.mapLocation && !offline && <View style={styles.section}>
          <View style={styles.mapHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Ubicación</Text><Text style={styles.mapPrecision}>{approximate ? 'Aproximada · 800 m' : 'Exacta'}</Text></View>
          {/* A map inside a ScrollView must not eat the drag; the listing is read, not explored. */}
          <View style={styles.mapFrame}><MapOnDemand height={240}><KarmaMap
            interactive={false}
            style={{ height: 240 }} center={listing.mapLocation} zoom={approximate ? 13 : 15}
            markers={[{ id: listing.id, coordinate: listing.mapLocation, precision: listing.mapLocation.precision }]}
            selectedMarkerId={listing.id} accessibilityLabel={`Ubicación ${approximate ? 'aproximada' : 'exacta'} de ${listing.title}`}
          /></MapOnDemand></View>
          <Text style={styles.mapDescription}>{approximate ? 'El área de 800 m muestra la zona de la vivienda. El punto exacto no se publica.' : 'Punto indicado por quien publica la vivienda.'}</Text>
        </View>}
        {contactOptions?.agencies.map(agency => <View key={agency.agencyId} style={styles.card}>
          <View style={styles.sellerBadges}><Text style={styles.sellerTitle}>{agency.tradeName}</Text><AgencyVerifiedBadge verified={agency.verified} principal={agency.isPrincipal} labelled agencyName={agency.tradeName} /></View>
          <Button label="Ver perfil comercial" secondary onPress={() => void Linking.openURL(`${PUBLIC_PAGES_URL}agency/${agency.agencyId}`)} />
          <Button label={`Contactar con ${agency.tradeName}`} secondary disabled={!agency.contactAvailable || contactBusy} onPress={() => { setPreferred(null); openContact(); }} />
        </View>)}
        <Pressable accessibilityRole={sellerProfile ? 'button' : undefined} accessibilityLabel={sellerProfile ? `Ver el perfil de ${sellerProfile.displayName}` : undefined} disabled={!sellerProfile} onPress={() => sellerProfile && router.push(`/user/${sellerProfile.id}`)} style={({ pressed }) => [styles.seller, pressed && { opacity: .7 }]}>
          {sellerProfile ? <UserAvatar size={48} avatarUrl={seller.avatarUrl} name={sellerProfile.displayName} accessibilityLabel={`Foto de ${sellerProfile.displayName}`} /> : <View style={styles.sellerIcon}><Icon name="person" size={24} color={colors.primary} /></View>}
          <View style={styles.sellerCopy}>
            <Text style={styles.sellerTitle}>{mode === 'cloud' ? own ? 'Publicado por ti' : sellerProfile?.displayName || 'Información del anuncio' : own ? 'Tu anuncio de prueba' : 'Perfil de demostración'}</Text>
            {sellerProfile && !sellerProfile.identityOnly && <View style={styles.sellerBadges}><Text style={styles.sellerLevel}>{levelLabel(sellerProfile.level)}</Text>{sellerProfile.verified && <><Icon name="shield-checkmark" size={14} color={colors.green} /><Text style={styles.sellerVerified}>Perfil revisado por KarmaHouse</Text></>}</View>}
            <Text style={styles.sellerText}>{mode === 'cloud' ? `Publicado el ${new Date(listing.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}` : own ? 'Visible solo en este dispositivo' : 'Sin vendedor real asociado'}</Text>
          </View>
          {sellerProfile && <Icon name="chevron-forward" size={18} color={colors.primary} />}
        </Pressable>
        {mode === 'cloud' && listing.moderationStatus === 'approved' && <View style={styles.reviewed}><Icon name="shield-checkmark-outline" size={16} color={colors.muted} /><Text style={styles.reviewedText}>Revisado antes de publicarse. La revisión no certifica la propiedad.</Text></View>}
        {mode === 'cloud' && !own && <Pressable accessibilityRole="button" onPress={openReport} style={({ pressed }) => [styles.report, pressed && { opacity: .6 }]}>
          <Icon name="flag-outline" size={17} color={colors.body} /><Text style={styles.reportText}>Reportar anuncio</Text>
        </Pressable>}
        {mode === 'demo' && <Notice>{own ? `Esta es una publicación local de prueba.${listing.photoUri ? ' La foto seleccionada se guarda en este dispositivo.' : ''}` : 'Esta vivienda es ficticia. La fotografía fue generada para mostrar cómo se verá KarmaHouse.'}</Notice>}
        {storageError ? <Notice error>{storageError}</Notice> : null}
        {error ? <Notice error>{error}</Notice> : null}
      </View>
    </ScrollView>
    {/* The one main action, fixed above the safe area. */}
    <SafeAreaView edges={['bottom']} style={styles.actionBar}>
      {contactError ? <View style={styles.actionError}><Notice error>{contactError}</Notice></View> : null}
      <View style={styles.actionContent}>
        <Button label={own ? 'Editar anuncio' : wanted ? 'Tengo algo que encaja' : 'Contactar'} icon={own ? 'create-outline' : 'chatbubble-outline'} loading={contactBusy} onPress={() => own ? router.push(`/edit/${listing.id}`) : openContact()} style={styles.contactButton} />
      </View>
    </SafeAreaView>
    {photoCount > 0 && <PhotoGallery listing={listing} count={photoCount} index={selectedPhoto} onIndex={setPhotoIndex} visible={gallery} onClose={() => setGallery(false)} />}
    <ReportConversationSheet visible={report} onClose={() => setReport(false)} onReport={sendReport} reasons={PROPERTY_REPORT_REASONS} title="Reportar anuncio"
      description="Cuéntanos qué ocurre con esta vivienda. El equipo de KarmaHouse lo revisará y puede retirar el anuncio."
      confirmation="Gracias. El equipo de KarmaHouse revisará este anuncio. Quien lo publicó no sabrá quién lo reportó." />
    <Sheet visible={contact} onClose={() => setContact(false)} title="Contactar">
      {contactProperty}
      <Text style={styles.modalText}>Esta vivienda no tiene un vendedor real. El chat está disponible para los anuncios publicados con una cuenta de KarmaHouse.</Text>
      <Button label="Entendido" onPress={() => setContact(false)} />
    </Sheet>
    <Sheet visible={agencyChoice} onClose={closeContact} title="Contactar">
      {contactProperty}
      {preferred && <Notice>El enlace propone una inmobiliaria{preferred.managerId ? ' y un gestor' : ''}. Revisa el destino y confirma para continuar.</Notice>}
      {contactReadError ? <><Notice error>{contactReadError}</Notice><Button label="Volver a cargar contactos" secondary onPress={() => setContactLoadAttempt(value => value + 1)} /></> : publicContact?.id !== id ? <View style={styles.contactLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.sellerText}>Cargando opciones de contacto…</Text></View> : !contactOptions || (!contactOptions.personalContact && contactOptions.agencies.length === 0) ? <Notice>Los contactos de este anuncio no están disponibles ahora.</Notice> : null}
      {Boolean(contactError) && <Notice error>{contactError}</Notice>}
      {(!auth.ready || (Boolean(auth.user) && !messaging.ready)) && <Text accessibilityLiveRegion="polite" style={styles.sellerText}>Preparando tu cuenta…</Text>}
      {contactOptions?.agencies.map(agency => <View key={agency.agencyId} style={styles.contactChoice}>
        <View style={styles.sellerBadges}><Text style={styles.sellerTitle}>{agency.tradeName}</Text><AgencyVerifiedBadge verified={agency.verified} principal={agency.isPrincipal} labelled agencyName={agency.tradeName} /></View>
        {!agency.contactAvailable && <Text style={styles.sellerText}>Contacto no disponible</Text>}
        <Button label={preferred?.agencyId === agency.agencyId && preferred.managerId ? 'Confirmar contacto con el gestor del enlace' : `Contactar con ${agency.tradeName}`} disabled={!agency.contactAvailable || !auth.ready || (Boolean(auth.user) && !messaging.ready)} loading={contactBusy} onPress={() => void contactSeller(agency)} />
      </View>)}
      {contactOptions?.personalContact && <Button label="Contactar con el responsable personal" secondary disabled={!auth.ready || (Boolean(auth.user) && !messaging.ready)} loading={contactBusy} onPress={() => void contactSeller(undefined, true)} />}
      <View style={styles.privacy}><Icon name="lock-closed-outline" size={16} color={colors.muted} /><Text style={styles.privacyText}>Tu teléfono y tu correo no se muestran a quien publica.</Text></View>
      <Button label="Cerrar" secondary onPress={closeContact} />
    </Sheet>
  </SafeAreaView>;
}
/** A figure of the home in Calistoga: «3» habitaciones, «140» m². `text` is for a word instead of a number. */
function Feature({ value, unit, label, text = false }: { value: string; unit?: string; label: string; text?: boolean }) {
  const { styles } = useStyles();
  return <View accessible accessibilityLabel={`${value}${unit ? ` ${unit}` : ''} · ${label}`} style={styles.feature}>
    <Text numberOfLines={1} style={text ? styles.featureWord : styles.featureValue}>{value}{unit ? <Text style={styles.featureUnit}> {unit}</Text> : null}</Text>
    <Text style={styles.featureLabel}>{label}</Text>
  </View>;
}
function Detail({ label, value }: { label: string; value: string }) {
  const { styles } = useStyles();
  return <View style={styles.tile}><Text style={styles.tileLabel}>{label}</Text><Text style={styles.tileValue}>{value}</Text></View>;
}
/** An unavailable home: the persiana closed in its arch. */
function Unavailable() {
  const { styles } = useStyles();
  return <View style={styles.unavailable}>
    <View style={styles.unavailableBack}><IconButton name="chevron-back" label="Volver al catálogo" onPress={() => goBack()} /></View>
    <View accessible={false} aria-hidden style={styles.window}>
      {Array.from({ length: 9 }, (_, slat) => <View key={slat} style={styles.slat} />)}
      <View style={styles.mullion} />
    </View>
    <Text accessibilityRole="header" style={styles.unavailableTitle}>Esta vivienda no está disponible</Text>
    <Text style={styles.unavailableText}>Vuelve al catálogo para explorar otras viviendas.</Text>
    <Button label="Volver a explorar" onPress={() => router.replace('/')} style={styles.unavailableAction} />
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingBottom: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 }, fill: { width: '100%', height: '100%' },
  // The whole photo, never cropped, on photo-ground.
  photoFrame: { backgroundColor: colors.photoGround }, widePhotoFrame: { marginTop: 16, marginHorizontal: 16, borderRadius: rounded.cardLg, overflow: 'hidden' },
  photo: { height: 300, width: '100%', backgroundColor: colors.photoGround }, widePhoto: { height: 440 },
  wantedHero: { height: 220, paddingTop: 40, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', gap: 8 }, wantedHeroText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  navigation: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, floatingButton: { backgroundColor: colors.photoOverlay }, navigationActions: { flexDirection: 'row', gap: 10 },
  photoCount: { position: 'absolute', right: 12, bottom: 12, ...typography.caption, fontWeight: '600', color: colors.onDark, backgroundColor: colors.photoOverlay, paddingHorizontal: 10, paddingVertical: 4, borderRadius: rounded.pill, overflow: 'hidden', fontVariant: ['tabular-nums'] },
  thumbnails: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  thumbnail: { width: 64, height: 56, borderRadius: rounded.thumb, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', opacity: .7 }, thumbnailSelected: { borderColor: colors.sol, opacity: 1 },
  more: { opacity: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, moreText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  body: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, gap: 28 }, summary: { gap: 10 },
  sign: { alignSelf: 'flex-start', marginBottom: 4 },
  badges: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }, demo: { fontSize: 12, color: colors.muted }, moderation: { color: colors.amber, fontSize: 12, fontWeight: '600' },
  title: { ...typography.listingTitle, color: colors.ink }, location: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 }, locationText: { color: colors.body, fontSize: 14, lineHeight: 20, flex: 1 },
  wantedOperations: { color: colors.ink, fontSize: 15, fontWeight: '600', marginTop: -12 },
  features: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 8 }, feature: { flex: 1, minWidth: 76, gap: 2 },
  featureValue: { ...typography.numeralLg, color: colors.ink }, featureWord: { ...typography.section, color: colors.ink }, featureUnit: { ...typography.cardTitle, fontSize: 16, lineHeight: 34, color: colors.muted }, featureLabel: { ...typography.caption, color: colors.muted },
  priceCard: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: rounded.card, backgroundColor: colors.surface, gap: 2, marginTop: -6 },
  priceLabel: { fontSize: 13, lineHeight: 18, color: colors.muted }, priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  price: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -.5, color: colors.primary, fontVariant: ['tabular-nums'] },
  negotiable: { fontSize: 13, fontWeight: '600', color: colors.amber, backgroundColor: colors.softAmber, paddingHorizontal: 10, paddingVertical: 5, borderRadius: rounded.pill, overflow: 'hidden' },
  section: { gap: 12 }, sectionTitle: { ...typography.section, color: colors.ink }, description: { color: colors.body, lineHeight: 24, fontSize: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tile: { flexGrow: 1, flexBasis: '45%', minWidth: 130, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface, gap: 2 },
  tileLabel: { ...typography.caption, color: colors.muted }, tileValue: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.ink },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, amenity: { fontSize: 14, lineHeight: 20, color: colors.ink, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 7, borderRadius: rounded.pill, overflow: 'hidden' },
  mapHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, mapPrecision: { color: colors.primary, fontSize: 13, fontWeight: '600', backgroundColor: colors.softBlue, paddingHorizontal: 12, paddingVertical: 6, borderRadius: rounded.pill, overflow: 'hidden' }, mapFrame: { borderRadius: rounded.cardLg, overflow: 'hidden' }, mapDescription: { fontSize: 13, lineHeight: 18, color: colors.muted },
  card: { gap: 12, padding: 18, borderRadius: rounded.card, backgroundColor: colors.surface },
  reviewed: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: -12 }, reviewedText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.muted },
  report: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start', marginTop: -12 }, reportText: { color: colors.body, fontSize: 14, fontWeight: '600' },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: rounded.card }, sellerIcon: { backgroundColor: colors.raised, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, sellerCopy: { flex: 1, gap: 4 }, sellerTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, sellerBadges: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }, sellerLevel: { color: colors.primary, fontSize: 13, fontWeight: '600', marginRight: 4 }, sellerVerified: { color: colors.green, fontSize: 13, fontWeight: '600' }, sellerText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actionBar: { width: '100%', backgroundColor: colors.paper }, actionError: { paddingHorizontal: 16, maxWidth: 860, width: '100%', alignSelf: 'center' }, actionContent: { paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16, width: '100%', maxWidth: 860, alignSelf: 'center' }, contactButton: { width: '100%' },
  contactProperty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: rounded.inner, backgroundColor: colors.surface }, contactWanted: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softBlue }, contactPropertyCopy: { flex: 1, minWidth: 0, gap: 2 }, contactPropertyTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' }, contactPropertyPrice: { color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  contactLoading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, contactChoice: { gap: 10, padding: 16, borderRadius: rounded.card, backgroundColor: colors.surface },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, privacyText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.muted },
  modalText: { color: colors.body, fontSize: 15, lineHeight: 22 },
  unavailable: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingBottom: 40 }, unavailableBack: { alignSelf: 'stretch', paddingTop: 8, marginLeft: -16, marginBottom: 56 },
  window: { width: 170, height: 200, borderTopLeftRadius: 85, borderTopRightRadius: 85, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 2, borderBottomWidth: 0, borderColor: colors.outline, paddingTop: 70, gap: 8 },
  slat: { height: 6, backgroundColor: colors.softGreen }, mullion: { position: 'absolute', left: 83, top: 68, bottom: 0, width: 4, backgroundColor: colors.paper },
  unavailableTitle: { ...typography.sheetTitle, color: colors.ink, textAlign: 'center', marginTop: 28 }, unavailableText: { color: colors.body, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }, unavailableAction: { marginTop: 24, minWidth: 220 },
}));
