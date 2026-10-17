import {PROVINCES} from '../domain/listingOptions';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import {createRowSigner} from '../data/supabaseMarketplace';
import type {RemotePropertyRow} from '../data/remoteMapping';
import {supabase} from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { ActionGroup, Button, EmptyState, Notice, PageTitle } from '../components/ui';
import type { Listing } from '../domain/listings';
import { listingFacts, operationBadge, typeLabel } from '../domain/operations';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage, type ReviewDecision } from '../state/remoteMarketplaceStore';
import { createThemedStyles, formatMoney, internalLayout, layout, rounded, typography } from '../theme';

type Review = { listing: Listing; decision: ReviewDecision; actorId: string; actorToken: string | undefined };

export default function AdminScreen() {
  const { colors, styles } = useStyles();
  const { user, session,isAdmin } = useAuth();
  const { mode, reviewListing } = useMarketplace();
  const [query,setQuery]=useState(''),[filters,setFilters]=useState<Record<string,string>>({moderation:'pending'}),[sort,setSort]=useState<'newest'|'oldest'|'name'>('oldest');
  const actor=useRef({id:user?.id,token:session?.access_token});actor.current={id:user?.id,token:session?.access_token};
  const sign=useCallback(async(items:unknown[],signal:AbortSignal)=>{
    const captured={id:user?.id,token:session?.access_token};
    const checkpoint=()=>{if(signal.aborted||captured.id!==actor.current.id||captured.token!==actor.current.token)throw Error('KH_ACCOUNT_CHANGED');};
    if(!supabase)return [];checkpoint();return createRowSigner(supabase)(items as RemotePropertyRow[],checkpoint,'cover');
  },[user?.id,session?.access_token]);
  const list=useAdminQuery('review',query,filters,sort,mode==='cloud',sign);
  const moderationQueue=list.items as Listing[],loading=list.loading;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState('');
  const selectedReview = review?.actorId === user?.id && review?.actorToken === session?.access_token && isAdmin ? review : null;
  // From 1024 px the queue and the chosen listing sit side by side (DESIGN.md §10, artboard AdminEscritorio).
  const wide = useWindowDimensions().width >= layout.wideMinWidth;
  const [picked, setPicked] = useState<string | null>(null);

  const saving=useRef(false),scope=JSON.stringify([user?.id,session?.access_token,isAdmin,query,filters,sort]),current=useRef(scope);current.current=scope;
  useEffect(()=>{setReview(null);setNote('');setError('');setBusy(false);saving.current=false;},[scope]);
  async function confirmReview() {
    if (!selectedReview || saving.current || loading || selectedReview.listing.ownerId === user?.id) return;
    if (selectedReview.decision === 'rejected' && !note.trim()) { setError('Explica qué debe corregir el propietario.'); return; }
    const captured=scope;saving.current=true;setBusy(true); setError('');
    try {
      await reviewListing(selectedReview.listing.id, selectedReview.decision, note.trim(), selectedReview.listing.version!,false);
      if(current.current!==captured)return;setReview(null);setNote('');await list.reload();
    } catch (failure) { if(current.current===captured)setError(remoteErrorMessage(failure)); }
    finally { if(current.current===captured){saving.current=false;setBusy(false);} }
  }
  function openReview(listing: Listing, decision: ReviewDecision) {
    if (!user || listing.ownerId === user.id) return;
    setError(''); setNote(''); setReview({ listing, decision, actorId: user.id, actorToken: session?.access_token });
  }

  const moderationLabel = (listing: Listing) => listing.moderationStatus==='pending'?'En revisión':listing.moderationStatus==='approved'?'Aprobado':listing.moderationStatus==='rejected'?'Necesita cambios':'Borrador';
  const moderationTone = (listing: Listing) => listing.moderationStatus==='pending'?'amber' as const:listing.moderationStatus==='approved'?'green' as const:'neutral' as const;
  const shown = wide ? moderationQueue.find(listing => listing.id === picked) ?? moderationQueue[0] ?? null : null;
  const card = (listing: Listing, detail = false) => <View key={listing.id} style={[styles.card, detail && styles.detailCard]}>
    {detail ? <PropertyImage listing={listing} fit="contain" eager style={styles.detailPhoto}/> : null}
    <View style={styles.overview}>{detail ? null : <PropertyImage listing={listing} variant="thumb" style={styles.photo}/>}<View style={styles.copy}>
      <Text accessibilityRole="header" numberOfLines={detail ? undefined : 3} style={[styles.title, detail && styles.detailTitle]}>{listing.title}</Text>
      <Text style={styles.price}>{formatMoney(listing.price)} USD</Text>
    </View></View>
    <Text style={styles.meta}>{[operationBadge(listing), typeLabel(listing)].filter(Boolean).join(' · ')} · {listing.location}, {listing.province}</Text>
    <Text style={styles.meta}>{listingFacts(listing)}</Text>
    <Text numberOfLines={detail ? undefined : 2} style={styles.description}>{listing.description}</Text>
    {listing.amenities.length > 0 && <Text style={styles.meta}>{listing.amenities.join(' · ')}</Text>}
    <AdminStatus label={moderationLabel(listing)} tone={moderationTone(listing)}/>
    <Button label="Ver ficha completa" secondary onPress={()=>router.push(`/property/${listing.id}`)} disabled={busy}/>
    {listing.moderationStatus!=='pending'?null:listing.ownerId === user?.id ? <Notice>Este anuncio es tuyo. Otra cuenta administradora debe revisarlo.</Notice> :
      <ActionGroup direction={detail ? 'auto' : 'vertical'}>
        <Button label="Aprobar" icon="checkmark-outline" onPress={() => openReview(listing, 'approved')} disabled={loading || busy} />
        <Button label="Pedir cambios" secondary icon="create-outline" onPress={() => openReview(listing, 'rejected')} disabled={loading || busy} />
      </ActionGroup>}
  </View>;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={[styles.content, wide && styles.wideContent]} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={isAdmin&&!busy} onRefresh={()=>{if(!saving.current)void list.refresh();}} tintColor={colors.primary}/>}>
      <PageTitle compact title="Revisar anuncios" subtitle="Publicaciones y sus decisiones de revisión." back fallback="/administration" />
      {!user ? <AccountPrompt returnTo="/admin" /> : !isAdmin || mode !== 'cloud' ?
        <EmptyState plain title="Acceso reservado" description="Esta sección está disponible para las cuentas administradoras de KarmaHouse." /> : <>
          <AdminToolbar query={query} onSearch={setQuery} filters={filters} onFilters={setFilters} sort={sort} onSort={value=>setSort(value as typeof sort)} disabled={busy} fields={[
            {key:'moderation',label:'Revisión',options:options({pending:'En revisión',approved:'Aprobados',rejected:'Necesitan cambios',draft:'Borradores'})},
            {key:'origin',label:'Origen',options:options({personal:'Personal',agency:'Inmobiliaria',assisted:'Asistido'})},
            {key:'operation',label:'Operación',options:options({sale:'Venta',rent:'Alquiler',swap:'Permuta',wanted:'Búsqueda'})},
            {key:'province',label:'Provincia',options:PROVINCES.map(value=>({value,label:value}))},
            {key:'availability',label:'Disponibilidad',options:options({active:'Activos',paused:'En pausa',sold:'Cerrados'})},
          ]}/>
          {list.error&&<Notice error>{remoteErrorMessage(new Error(list.error))}</Notice>}
          {error && !selectedReview ? <Notice error>{error}</Notice> : null}
          {loading && moderationQueue.length === 0 ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : moderationQueue.length === 0 ?
            error || list.error ? <EmptyState plain title="No pudimos cargar los anuncios" description="Actualiza la lista cuando recuperes la conexión para comprobar los pendientes." /> :
            <EmptyState plain title="Sin anuncios en esta vista" description="No hay publicaciones que coincidan con los filtros seleccionados." /> :
            <View style={styles.list}>
              <Text style={styles.count}>{list.total??'…'} resultados</Text>
              {wide && shown ? <View style={styles.split}>
                <View accessibilityRole="list" style={styles.column}>{moderationQueue.map(listing => <Pressable key={listing.id} accessibilityRole="button" accessibilityLabel={`${listing.title}, ${moderationLabel(listing)}`} accessibilityState={{ selected: listing.id === shown.id }} onPress={() => setPicked(listing.id)} style={({ pressed }) => [styles.pick, listing.id === shown.id && styles.picked, pressed && { opacity: .75 }]}>
                  <PropertyImage listing={listing} variant="thumb" style={styles.photo}/>
                  <View style={styles.copy}><Text numberOfLines={1} style={styles.pickTitle}>{listing.title}</Text><Text numberOfLines={1} style={styles.meta}>{[operationBadge(listing), listing.location].filter(Boolean).join(' · ')} · {formatMoney(listing.price)}</Text></View>
                </Pressable>)}</View>
                <View style={styles.detail}>{card(shown, true)}</View>
              </View> : moderationQueue.map(listing => card(listing))}
            </View>}
          <AdminPagination {...list} loading={loading||busy}/>
        </>}
    </ScrollView>
    <Modal visible={!!selectedReview} transparent animationType="fade" onRequestClose={() => !busy && setReview(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding"><SafeAreaView style={styles.modalSafe} edges={['top','bottom','left','right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}><View accessibilityViewIsModal style={styles.modal}>
        <Text accessibilityRole="header" style={styles.modalTitle}>{selectedReview?.decision === 'approved' ? 'Aprobar anuncio' : 'Solicitar cambios'}</Text>
        <Text style={styles.description}>{selectedReview?.listing.title}</Text>
        {selectedReview?.decision === 'approved' ? <Text style={styles.meta}>El anuncio estará disponible en el catálogo mientras su propietario lo mantenga activo.</Text> : <>
          <Text style={styles.label}>Motivo para el propietario</Text>
          <TextInput accessibilityLabel="Motivo del rechazo" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!busy} placeholder="Explica qué información o fotografía debe corregir." placeholderTextColor={colors.muted} style={styles.input} />
        </>}
        {error ? <Notice error>{error}</Notice> : null}
        <ActionGroup direction="vertical"><Button label={selectedReview?.decision === 'approved' ? 'Confirmar aprobación' : 'Enviar motivo'} loading={busy} disabled={selectedReview?.decision === 'rejected' && !note.trim()} onPress={confirmReview} />
        <Button label="Cancelar" secondary disabled={busy} onPress={() => setReview(null)} /></ActionGroup>
      </View></ScrollView></SafeAreaView></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  wideContent: { maxWidth: 1180, paddingHorizontal: 32 },
  loader: { marginVertical: 32 }, list: { gap: 12 }, count: { color: colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 4, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: rounded.card, gap: 10, borderWidth: 1, borderColor: colors.border },
  overview: { flexDirection: 'row', gap: 12, alignItems: 'center' }, copy: { flex: 1, minWidth: 0, gap: 4 },
  // Lists show the photo in the arch; the detail shows it whole (DESIGN.md §5).
  photo: { width: 74, height: 86, borderTopLeftRadius: 37, borderTopRightRadius: 37, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  title: { ...typography.cardTitle, color: colors.ink },
  price: { color: colors.primary, fontSize: 15, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  description: { color: colors.body, fontSize: 15, lineHeight: 22 },
  split: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' }, column: { width: 360, gap: 8 }, detail: { flex: 1, minWidth: 0 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: rounded.inner, borderWidth: 1, borderColor: 'transparent' },
  picked: { backgroundColor: colors.surface, borderColor: colors.primary },
  pickTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  detailCard: { padding: 18, borderRadius: rounded.cardLg, gap: 12 },
  detailPhoto: { width: '100%', height: 320, borderRadius: rounded.inner, backgroundColor: colors.photoGround },
  detailTitle: { ...typography.listingTitle },
  backdrop: { flex: 1, backgroundColor: colors.overlay }, modalSafe: { flex: 1 }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.sheet, borderTopLeftRadius: rounded.sheet, borderTopRightRadius: rounded.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, padding: 20, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  modalTitle: { ...typography.sheetTitle, color: colors.ink }, label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.body },
  input: { minHeight: 128, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.card, paddingVertical: 14, paddingHorizontal: 18, fontSize: 16, lineHeight: 23, color: colors.ink, textAlignVertical: 'top' },
}));
