import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { ActionGroup, Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { listingBoardState, type Listing, type ListingBoardState, type ListingStatus } from '../domain/listings';
import { listingOperation, operationBadge, priceSuffix } from '../domain/operations';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore';
import { createThemedStyles, formatMoney, internalLayout } from '../theme';
import {useIncomingTransferCount} from '../transfers/useIncomingTransferCount';
import { bumpErrorMessage, canBumpNow, formatProDate, nextBumpAt } from '../pro/domain';
import { usePro } from '../pro/usePro';

const boardLabels: Record<ListingBoardState, string> = {
  sold: 'Cerrado', rejected: 'Necesita cambios', draft: 'Borrador',
  pending: 'En revisión', paused: 'En pausa', live: 'En el catálogo',
};


export default function MyListingsScreen() {
  const { colors, styles } = useStyles();
  const boardTones: Record<ListingBoardState, { color: string; background: string }> = {
    sold: { color: colors.muted, background: colors.paper },
    rejected: { color: colors.danger, background: colors.softDanger },
    draft: { color: colors.muted, background: colors.paper },
    pending: { color: colors.amber, background: colors.softAmber },
    paused: { color: colors.amber, background: colors.softAmber },
    live: { color: colors.green, background: colors.softGreen },
  };
  const { ownListings: own, setStatus, mode, ready, storageError, refresh, submitForReview } = useMarketplace();
  const { user, session, isOwner } = useAuth();
  const transfers=useIncomingTransferCount();
  const pro = usePro();
  // Pro is read per listing from the server: an agency listing is covered by the agency's Pro, not by the person's.
  const [pending, setPending] = useState('');
  // «Pausar» and «Subir anuncio» share `pending`; this says which of the two is running.
  const [bumpingId, setBumpingId] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ListingBoardState>('all');
  const visibleOwn = filter === 'all' ? own : own.filter(item => listingBoardState(item) === filter);
  const [confirm, setConfirm] = useState<{ listing: Listing; next: 'sold' | 'active' } | null>(null);
  const locked = useRef(false);
  const reload = useConsultationRefresh(`${user?.id}:${session?.access_token}`, async () => {
    setError('');
    await Promise.all([refresh(), transfers.refresh(), pro.reload()]);
  }, () => locked.current || !user || mode !== 'cloud', failure => setError(remoteErrorMessage(failure)));
  const effectiveConfirm = confirm && (mode === 'demo' || confirm.listing.ownerId === user?.id) ? confirm : null;
  // iOS keeps the modal mounted through the fade, so the direction has to outlive the state that closed it.
  const lastDirection = useRef<'sold' | 'active'>('sold');
  if (effectiveConfirm) lastDirection.current = effectiveConfirm.next;
  const sellingOff = lastDirection.current === 'sold';

  useEffect(() => { setConfirm(null); setError(''); setPending(''); setBumpingId(''); setFilter('all'); }, [user?.id]);

  async function update(id: string, status: ListingStatus) {
    if (locked.current || reload.isRefreshing()) return;
    locked.current = true;
    setPending(id);
    setError('');
    try { await setStatus(id, status); setConfirm(null); }
    catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { locked.current = false; setPending(''); }
  }

  async function submit(id: string) {
    if (locked.current || reload.isRefreshing()) return;
    locked.current = true;
    setPending(id); setError('');
    try { await submitForReview(id); } catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { locked.current = false; setPending(''); }
  }

  async function bump(item: Listing) {
    if (locked.current || reload.isRefreshing() || !pro.repository) return;
    locked.current = true;
    setPending(item.id); setBumpingId(item.id); setError('');
    try {
      await pro.repository.bump(item.id);
      // The bump already happened: a failed refresh is a loading problem, not a failed bump.
      try { await refresh(); } catch (failure) { setError(remoteErrorMessage(failure)); }
    } catch (failure) {
      setError(bumpErrorMessage(failure, item));
      if (String((failure as { message?: unknown } | null)?.message).includes('KH_PRO_REQUIRED')) void pro.reload();
    } finally { locked.current = false; setPending(''); setBumpingId(''); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!pending && !!user && mode === 'cloud'} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
      <PageTitle compact title="Mis anuncios" subtitle="Estado y gestión de tus viviendas." back fallback="/profile" />
      {user&&!isOwner&&<Button secondary label={`Anuncios por aceptar${transfers.count===null?'':` · ${transfers.count}`}`} onPress={()=>router.push('/listing-transfers')}/>}
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/my-listings" /> : <>
      <Notice>{mode === 'cloud' ? 'Tus anuncios aparecen en el catálogo cuando están aprobados y activos. Los cambios de contenido se revisan antes de publicarse.' : 'Los anuncios de prueba se guardan en este dispositivo. Los activos aparecen en tu catálogo local.'}</Notice>
      {error || storageError ? <Notice error onRetry={error ? () => void reload.refresh() : undefined}>{error || storageError}</Notice> : null}

      {!!own.length && <View style={styles.filters}>
        <Pill label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
        {(Object.keys(boardLabels) as ListingBoardState[]).filter(state => own.some(item => listingBoardState(item) === state)).map(state => <Pill key={state} label={boardLabels[state]} active={filter === state} onPress={() => setFilter(state)} />)}
      </View>}
      {ready === false && !own.length ? <ActivityIndicator accessibilityLabel="Cargando tus anuncios" color={colors.primary} style={styles.loader} /> : own.length ? <View style={styles.list}>
        <Text accessibilityLiveRegion="polite" style={styles.sectionLabel}>{visibleOwn.length} de {own.length} {own.length === 1 ? 'anuncio' : 'anuncios'}</Text>
        {!visibleOwn.length && <EmptyState plain title="Sin anuncios en este estado" description="Selecciona otro estado para consultar tus anuncios." action={<Button secondary label="Ver todos" onPress={() => setFilter('all')} />} />}
        {visibleOwn.map(item => {
          const state = listingBoardState(item);
          const tone = boardTones[state];
          return <View key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${boardLabels[state]}. ${formatMoney(item.price)} USD${priceSuffix(item)}. ${item.location}.`} onPress={() => router.push(`/property/${item.id}`)} style={({ pressed }) => [styles.overview, pressed && styles.pressed]}>
            {listingOperation(item) === 'wanted'
              ? <View style={[styles.image, styles.wantedImage]}><Icon name="search-outline" size={28} color={colors.primary} /></View>
              : <PropertyImage listing={item} variant="thumb" style={styles.image} />}
            <View style={styles.details}>
              <View style={[styles.chip, { backgroundColor: tone.background }]}>
                <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
                <Text style={[styles.status, { color: tone.color }]}>{boardLabels[state]}</Text>
              </View>
              {!!operationBadge(item) && <Text style={styles.operation}>{operationBadge(item)}</Text>}
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.price}>{listingOperation(item) === 'wanted' ? 'Hasta ' : ''}{formatMoney(item.price)} <Text style={styles.currency}>USD{priceSuffix(item)}</Text></Text>
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {item.reviewNote && <Notice error>{item.reviewNote}</Notice>}

          {(state === 'draft' || state === 'rejected') && <Button label={isOwner ? 'Publicar ahora' : 'Enviar a revisión'} icon="paper-plane-outline" loading={pending === item.id} disabled={!!pending} onPress={() => submit(item.id)} style={styles.reviewButton} />}
          <ActionGroup style={styles.actions}>
            <Button label="Editar" secondary icon="create-outline" onPress={() => router.push(`/edit/${item.id}`)} style={styles.actionButton} disabled={!!pending} />
            {/* Pausing only means anything once the listing can actually reach the catalogue. */}
            {state === 'live' && <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id && bumpingId !== item.id} disabled={!!pending} style={styles.actionButton} />}
            {state === 'live' && item.isPro && canBumpNow(item) && <Button label="Subir anuncio" secondary icon="arrow-up-outline" onPress={() => void bump(item)} loading={bumpingId === item.id} disabled={!!pending} style={styles.actionButton} />}
            {/* Gated on the raw status, not the chip: a paused listing under review still has to be un-pausable. */}
            {item.status === 'paused' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => update(item.id, 'active')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
            {state === 'sold' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => setConfirm({ listing: item, next: 'active' })} disabled={!!pending} style={styles.actionButton} />}
          </ActionGroup>
          {state === 'live' && item.isPro && !canBumpNow(item) && <Text style={styles.location}>Podrás subirlo el {formatProDate(nextBumpAt(item))}.</Text>}
          {state !== 'sold' && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!pending }} disabled={!!pending} onPress={() => setConfirm({ listing: item, next: 'sold' })} style={({ pressed }) => [styles.soldButton, pressed && styles.pressed, !!pending && styles.disabled]}>
            <Icon name="checkmark-circle-outline" color={colors.primary} size={19} />
            <Text style={styles.soldText}>Cerrar anuncio</Text>
          </Pressable>}
        </View>;
        })}
        <Button label="Crear otro anuncio" onPress={() => router.push('/publish')} icon="add-outline" style={styles.createButton} />
      </View> : error || storageError ? null : <EmptyState plain title="Aún no tienes anuncios" description={mode === 'cloud' ? 'Crea una ficha con los detalles y las fotos de la vivienda para enviarla a revisión.' : 'Crea un anuncio de prueba con sus detalles y una foto.'} action={<Button label="Crear anuncio" onPress={() => router.push('/publish')} />} />}
      </>}
    </ScrollView>

    <Modal visible={!!effectiveConfirm} transparent animationType="fade" onRequestClose={() => !pending && setConfirm(null)}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
        <View accessibilityViewIsModal style={styles.modal}>
          <Text accessibilityRole="header" style={styles.modalTitle}>{sellingOff ? '¿Cerrar este anuncio?' : '¿Reactivar este anuncio?'}</Text>
          <Text style={styles.modalText}>{sellingOff
            ? 'El anuncio saldrá del catálogo y quedará como cerrado en Mis anuncios. Podrás reactivarlo cuando quieras.'
            : 'El anuncio volverá al catálogo mientras esté aprobado.'}</Text>
          {error ? <Notice error>{error}</Notice> : null}
          <ActionGroup direction="vertical">
            <Button label={sellingOff ? 'Confirmar cierre' : 'Confirmar reactivación'} loading={!!pending} onPress={() => effectiveConfirm && update(effectiveConfirm.listing.id, effectiveConfirm.next)} />
            <Button label="Cancelar" secondary disabled={!!pending} onPress={() => setConfirm(null)} />
          </ActionGroup>
        </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { gap: 16 },
  loader: { paddingVertical: 32 },
  sectionLabel: { color: colors.muted, fontSize: 14, marginLeft: 4, marginBottom: -4 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: internalLayout.radius, borderWidth: 1, borderColor: colors.border },
  overview: { flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 12 },
  pressed: { opacity: .65 },
  image: { width: 76, height: 98, borderRadius: 12 },
  wantedImage: { backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, gap: 6 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  status: { fontSize: 12, fontWeight: '600' },
  reviewButton: { marginTop: 16 },
  operation: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  title: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -.3 },
  price: { color: colors.ink, fontSize: 16, fontWeight: '600', letterSpacing: -.2 },
  currency: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  location: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  actions: { marginTop: 16 },
  actionButton: { minHeight: 48 },
  soldButton: { flexDirection: 'row', gap: 7, minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 8, borderRadius: 12 },
  soldText: { color: colors.primary, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: .5 },
  createButton: { marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colors.surface, borderRadius: internalLayout.radius, padding: 20, gap: 16, width: '100%', maxWidth: 520, alignSelf: 'center' },
  modalTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 },
  modalText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
}));
