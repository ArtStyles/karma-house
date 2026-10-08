import {PROVINCES} from '../domain/listingOptions';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import {createRowSigner} from '../data/supabaseMarketplace';
import type {RemotePropertyRow} from '../data/remoteMapping';
import {supabase} from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Notice, PageTitle } from '../components/ui';
import type { Listing } from '../domain/listings';
import { listingFacts, operationBadge, typeLabel } from '../domain/operations';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage, type ReviewDecision } from '../state/remoteMarketplaceStore';
import { createThemedStyles, formatMoney } from '../theme';

type Review = { listing: Listing; decision: ReviewDecision; actorId: string };

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
  const selectedReview = review?.actorId === user?.id && isAdmin ? review : null;

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
    setError(''); setNote(''); setReview({ listing, decision, actorId: user.id });
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={isAdmin&&!busy} onRefresh={()=>{if(!saving.current)void list.refresh();}} tintColor={colors.primary}/>}>
      <PageTitle title="Revisión" subtitle="Viviendas pendientes de publicación." back />
      {!user ? <AccountPrompt returnTo="/admin" /> : !isAdmin || mode !== 'cloud' ?
        <EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Esta sección está disponible para las cuentas administradoras de KarmaHouse." /> : <>
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
            error ? <EmptyState icon="cloud-offline-outline" title="No pudimos cargar los anuncios" description="Actualiza la lista cuando recuperes la conexión para comprobar los pendientes." /> :
            <EmptyState icon="checkmark-circle-outline" title="Todo revisado" description="No hay anuncios pendientes de revisión en este momento." /> :
            <View style={styles.list}>
              <Text style={styles.count}>{list.total??'…'} resultados</Text>
              {moderationQueue.map((listing) => <View key={listing.id} style={styles.card}>
                <PropertyImage listing={listing} variant="thumb" style={styles.photo}/>
                <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
                <Text style={styles.price}>{formatMoney(listing.price)} USD</Text>
                <Text style={styles.meta}>{[operationBadge(listing), typeLabel(listing)].filter(Boolean).join(' · ')} · {listing.location}, {listing.province}</Text>
                <Text style={styles.meta}>{listingFacts(listing)}</Text>
                <Text numberOfLines={2} style={styles.description}>{listing.description}</Text>
                {listing.amenities.length > 0 && <Text style={styles.meta}>{listing.amenities.join(' · ')}</Text>}
                <AdminStatus label={listing.moderationStatus==='pending'?'En revisión':listing.moderationStatus==='approved'?'Aprobado':listing.moderationStatus==='rejected'?'Necesita cambios':'Borrador'} tone={listing.moderationStatus==='pending'?'amber':listing.moderationStatus==='approved'?'green':'neutral'}/>
                <Button label="Ver ficha completa" secondary onPress={()=>router.push(`/property/${listing.id}`)} disabled={busy}/>
                {listing.moderationStatus!=='pending'?null:listing.ownerId === user.id ? <Notice>Este anuncio es tuyo. Otra cuenta administradora debe revisarlo.</Notice> :
                  <View style={styles.actions}>
                    <Button label="Aprobar" icon="checkmark-outline" onPress={() => openReview(listing, 'approved')} disabled={loading || busy} style={styles.action} />
                    <Button label="Pedir cambios" secondary icon="create-outline" onPress={() => openReview(listing, 'rejected')} disabled={loading || busy} style={styles.action} />
                  </View>}
              </View>)}
            </View>}
          <AdminPagination {...list} loading={loading||busy}/>
        </>}
    </ScrollView>
    <Modal visible={!!selectedReview} transparent animationType="fade" onRequestClose={() => !busy && setReview(null)}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}>
        <Text accessibilityRole="header" style={styles.modalTitle}>{selectedReview?.decision === 'approved' ? 'Aprobar anuncio' : 'Solicitar cambios'}</Text>
        <Text style={styles.description}>{selectedReview?.listing.title}</Text>
        {selectedReview?.decision === 'approved' ? <Text style={styles.meta}>El anuncio estará disponible en el catálogo mientras su propietario lo mantenga activo.</Text> : <>
          <Text style={styles.label}>Motivo para el propietario</Text>
          <TextInput accessibilityLabel="Motivo del rechazo" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!busy} placeholder="Explica qué información o fotografía debe corregir." placeholderTextColor={colors.muted} style={styles.input} />
        </>}
        {error ? <Notice error>{error}</Notice> : null}
        <Button label={selectedReview?.decision === 'approved' ? 'Confirmar aprobación' : 'Enviar motivo'} loading={busy} disabled={selectedReview?.decision === 'rejected' && !note.trim()} onPress={confirmReview} />
        <Button label="Cancelar" secondary disabled={busy} onPress={() => setReview(null)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 28, gap: 10 },
  loader: { marginVertical: 40 }, list: { gap: 20, marginTop: 12 }, count: { color: colors.muted, fontSize: 14, marginLeft: 4 },
  card: { backgroundColor: colors.surface, padding: 18, borderRadius: 20, gap: 10,borderWidth:1,borderColor:colors.border },
  photos: { gap: 10, marginBottom: 8 }, photo: { width: '100%', height: 160, borderRadius: 16 },
  title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -.5 },
  price: { color: colors.ink, fontSize: 20, fontWeight: '600' }, meta: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  description: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, action: { flex: 1, minWidth: 150 },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay, justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.surface, borderRadius: 26, padding: 24, gap: 15, width: '100%', maxWidth: 480, alignSelf: 'center' },
  modalTitle: { fontSize: 24, fontWeight: '600', letterSpacing: -.5, color: colors.ink }, label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: { minHeight: 128, backgroundColor: colors.paper, borderRadius: 16, padding: 15, fontSize: 16, lineHeight: 23, color: colors.ink, textAlignVertical: 'top' },
}));
