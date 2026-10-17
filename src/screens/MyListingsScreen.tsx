import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { ActionGroup, Button, EmptyState, goBack, Icon, IconButton, Notice, Pill } from '../components/ui';
import { listingBoardLabels, listingBoardState, normalizeSearch, type Listing, type ListingBoardState, type ListingStatus } from '../domain/listings';
import { Pagination } from '../components/Pagination';
import { Sheet } from '../components/Sheet';
import { ListingStateChip } from '../components/ListingStateChip';
import { listingOperation, operationBadge, priceSuffix } from '../domain/operations';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore';
import { createThemedStyles, formatMoney, internalLayout, rounded, typography } from '../theme';
import {useIncomingTransferCount} from '../transfers/useIncomingTransferCount';
import { bumpErrorMessage, canBumpNow, formatProDate, nextBumpAt } from '../pro/domain';
import { usePro } from '../pro/usePro';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';

const boardLabels = listingBoardLabels;
// The whole list is already on the device, so search and pages work here without new queries.
const PAGE_SIZE = 10;


export default function MyListingsScreen() {
  const { colors, styles } = useStyles();
  const { ownListings: own, setStatus, mode, ready, storageError, refresh, submitForReview } = useMarketplace();
  const { user, session, isOwner } = useAuth();
  const transfers=useIncomingTransferCount();
  const pro = usePro();
  const { agencies } = useAgencyWorkspace();
  // Pro is read per listing from the server: an agency listing is covered by the agency's Pro, not by the person's.
  const [pending, setPending] = useState('');
  // «Pausar» and «Subir anuncio» share `pending`; this says which of the two is running.
  const [bumpingId, setBumpingId] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | ListingBoardState>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const search = normalizeSearch(query);
  const found = search ? own.filter(item => normalizeSearch(`${item.title} ${item.location} ${item.province ?? ''}`).includes(search)) : own;
  const filtered = filter === 'all' ? found : found.filter(item => listingBoardState(item) === filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const first = (currentPage - 1) * PAGE_SIZE;
  const visibleOwn = filtered.slice(first, first + PAGE_SIZE);
  const choose = (next: 'all' | ListingBoardState) => { setFilter(next); setPage(1); };
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

  useEffect(() => { setConfirm(null); setError(''); setPending(''); setBumpingId(''); setFilter('all'); setQuery(''); setPage(1); }, [user?.id]);

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
      {/* Back and «Crear anuncio» above the title, so a long title never shares the row (artboard MisAnuncios). */}
      <View style={styles.topBar}>
        <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/profile')} style={styles.round} />
        {own.length ? <Pressable accessibilityRole="button" accessibilityLabel="Crear anuncio" onPress={() => router.push('/publish')} style={({ pressed }) => [styles.create, pressed && styles.pressed]}><Icon name="add" size={20} color={colors.onPrimary} /><Text style={styles.createText}>Crear anuncio</Text></Pressable> : null}
      </View>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.pageTitle}>Mis anuncios</Text><Text style={styles.subtitle}>Estado y gestión de tus viviendas.</Text></View>
      {user&&!isOwner&&<Button secondary label={`Anuncios por aceptar${transfers.count===null?'':` · ${transfers.count}`}`} onPress={()=>router.push('/listing-transfers')}/>}
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/my-listings" /> : <>
      <Notice>{mode === 'cloud' ? 'Tus anuncios aparecen en el catálogo cuando están aprobados y activos. Los cambios de contenido se revisan antes de publicarse.' : 'Los anuncios de prueba se guardan en este dispositivo. Los activos aparecen en tu catálogo local.'}</Notice>
      {error || storageError ? <Notice error onRetry={error ? () => void reload.refresh() : undefined}>{error || storageError}</Notice> : null}

      {!!own.length && <View style={styles.search}>
        <Icon name="search-outline" size={20} color={colors.muted} />
        <TextInput accessibilityLabel="Buscar en tus anuncios" value={query} onChangeText={value => { setQuery(value); setPage(1); }} placeholder="Título, dirección o barrio…" placeholderTextColor={colors.muted}
          autoCorrect={false} autoCapitalize="none" inputMode="search" returnKeyType="search" style={styles.searchInput} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => { setQuery(''); setPage(1); }} style={styles.clear}><Icon name="close-circle" size={20} color={colors.muted} /></Pressable>}
      </View>}
      {!!own.length && <View style={styles.filters}>
        {/* Each state says how many it holds among what the search left. */}
        <Pill label={`Todos · ${found.length}`} accessibilityLabel={`Todos, ${found.length} ${found.length === 1 ? 'anuncio' : 'anuncios'}`} active={filter === 'all'} onPress={() => choose('all')} />
        {(Object.keys(boardLabels) as ListingBoardState[]).filter(state => own.some(item => listingBoardState(item) === state)).map(state => {
          const count = found.filter(item => listingBoardState(item) === state).length;
          return <Pill key={state} label={`${boardLabels[state]} · ${count}`} accessibilityLabel={`${boardLabels[state]}, ${count} ${count === 1 ? 'anuncio' : 'anuncios'}`} active={filter === state} onPress={() => choose(state)} />;
        })}
      </View>}
      {ready === false && !own.length ? <ActivityIndicator accessibilityLabel="Cargando tus anuncios" color={colors.primary} style={styles.loader} /> : own.length ? <View style={styles.list}>
        <Text accessibilityLiveRegion="polite" style={styles.sectionLabel}>{filtered.length ? `Mostrando ${first + 1}–${first + visibleOwn.length} de ${filtered.length} ${filtered.length === 1 ? 'anuncio' : 'anuncios'}` : `0 de ${own.length} ${own.length === 1 ? 'anuncio' : 'anuncios'}`}</Text>
        {!filtered.length && (search ? <EmptyState title="Sin resultados" description={`No encontramos anuncios con «${query.trim()}». Prueba con otra palabra del título o del barrio.`} action={<Button secondary label="Borrar búsqueda" onPress={() => { setQuery(''); setPage(1); }} />} />
          : <EmptyState plain title="Sin anuncios en este estado" description="Selecciona otro estado para consultar tus anuncios." action={<Button secondary label="Ver todos" onPress={() => choose('all')} />} />)}
        {visibleOwn.map(item => {
          const state = listingBoardState(item);
          // An agency is its origin: personal edits are refused by the server, so it is managed from the agency screens.
          const managedBy = item.agencyId ? agencies.find(agency => agency.id === item.agencyId)?.tradeName ?? 'tu inmobiliaria' : null;
          return <View key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${boardLabels[state]}. ${formatMoney(item.price)} USD${priceSuffix(item)}. ${item.location}.`} onPress={() => router.push(`/property/${item.id}`)} style={({ pressed }) => [styles.overview, pressed && styles.pressed]}>
            {listingOperation(item) === 'wanted'
              ? <View style={[styles.image, styles.wantedImage]}><Icon name="search-outline" size={28} color={colors.primary} /></View>
              : <PropertyImage listing={item} variant="thumb" style={styles.image} />}
            <View style={styles.details}>
              <ListingStateChip state={state} />
              {!!operationBadge(item) && <Text style={styles.operation}>{operationBadge(item)}</Text>}
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.price}>{listingOperation(item) === 'wanted' ? 'Hasta ' : ''}{formatMoney(item.price)} <Text style={styles.currency}>USD{priceSuffix(item)}</Text></Text>
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {item.reviewNote && <Notice error>{item.reviewNote}</Notice>}

          {managedBy && <Text style={styles.location}>{`Lo gestiona ${managedBy}.`}</Text>}
          {!managedBy && (state === 'draft' || state === 'rejected') && <Button label={isOwner ? 'Publicar ahora' : 'Enviar a revisión'} icon="paper-plane-outline" loading={pending === item.id} disabled={!!pending} onPress={() => submit(item.id)} style={styles.reviewButton} />}
          <ActionGroup style={styles.actions}>
            {managedBy ? <Button label="Gestionar en la inmobiliaria" secondary icon="business-outline" onPress={() => router.push({ pathname: '/agency-workspace', params: { agencyId: item.agencyId! } })} style={styles.actionButton} />
              : <Button label="Editar" secondary icon="create-outline" onPress={() => router.push(`/edit/${item.id}`)} style={styles.actionButton} disabled={!!pending} />}
            {/* Pausing only means anything once the listing can actually reach the catalogue. */}
            {!managedBy && state === 'live' && <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id && bumpingId !== item.id} disabled={!!pending} style={styles.actionButton} />}
            {state === 'live' && item.isPro && canBumpNow(item) && <Button label="Subir anuncio" secondary icon="arrow-up-outline" onPress={() => void bump(item)} loading={bumpingId === item.id} disabled={!!pending} style={styles.actionButton} />}
            {/* Gated on the raw status, not the chip: a paused listing under review still has to be un-pausable. */}
            {!managedBy && item.status === 'paused' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => update(item.id, 'active')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
            {!managedBy && state === 'sold' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => setConfirm({ listing: item, next: 'active' })} disabled={!!pending} style={styles.actionButton} />}
          </ActionGroup>
          {state === 'live' && item.isPro && !canBumpNow(item) && <Text style={styles.location}>Podrás subirlo el {formatProDate(nextBumpAt(item))}.</Text>}
          {!managedBy && state !== 'sold' && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!pending }} disabled={!!pending} onPress={() => setConfirm({ listing: item, next: 'sold' })} style={({ pressed }) => [styles.soldButton, pressed && styles.pressed, !!pending && styles.disabled]}>
            <Icon name="checkmark-circle-outline" color={colors.primary} size={19} />
            <Text style={styles.soldText}>Cerrar anuncio</Text>
          </Pressable>}
        </View>;
        })}
        <Pagination page={currentPage} pages={pages} onChange={next => setPage(next)} label="Páginas de tus anuncios" />
      </View> : error || storageError ? null : <EmptyState plain title="Aún no tienes anuncios" description={mode === 'cloud' ? 'Crea una ficha con los detalles y las fotos de la vivienda para enviarla a revisión.' : 'Crea un anuncio de prueba con sus detalles y una foto.'} action={<Button label="Crear anuncio" onPress={() => router.push('/publish')} />} />}
      </>}
    </ScrollView>

    <Sheet visible={!!effectiveConfirm} onClose={() => { if (!pending) setConfirm(null); }}>
      {effectiveConfirm && <View style={styles.confirmListing}>
        <PropertyImage listing={effectiveConfirm.listing} variant="thumb" style={styles.confirmImage} />
        <View style={styles.details}><Text numberOfLines={2} style={styles.confirmTitle}>{effectiveConfirm.listing.title}</Text><Text style={styles.location}>{formatMoney(effectiveConfirm.listing.price)} USD{priceSuffix(effectiveConfirm.listing)} · {boardLabels[listingBoardState(effectiveConfirm.listing)]}</Text></View>
      </View>}
      <Text accessibilityRole="header" style={styles.modalTitle}>{sellingOff ? '¿Cerrar este anuncio?' : '¿Reactivar este anuncio?'}</Text>
      <Text style={styles.modalText}>{sellingOff
        ? 'El anuncio saldrá del catálogo y quedará como cerrado en Mis anuncios. Podrás reactivarlo cuando quieras.'
        : 'El anuncio volverá al catálogo mientras esté aprobado.'}</Text>
      {error ? <Notice error>{error}</Notice> : null}
      <View style={styles.sheetActions}>
        <Button label="Cancelar" secondary disabled={!!pending} onPress={() => setConfirm(null)} style={styles.sheetButton} />
        <Button label={sellingOff ? 'Confirmar cierre' : 'Confirmar reactivación'} loading={!!pending} onPress={() => effectiveConfirm && update(effectiveConfirm.listing.id, effectiveConfirm.next)} style={styles.sheetButton} />
      </View>
    </Sheet>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }, round: { backgroundColor: colors.surface },
  heading: { gap: 2, paddingHorizontal: 4 }, pageTitle: { ...typography.display, color: colors.ink }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  create: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 12, paddingRight: 16, borderRadius: rounded.pill, backgroundColor: colors.primaryFill },
  createText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingLeft: 16, paddingRight: 6, borderRadius: rounded.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 16, color: colors.ink }, clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { gap: 12 },
  loader: { paddingVertical: 32 },
  sectionLabel: { color: colors.muted, fontSize: 13, lineHeight: 18, marginLeft: 4, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: colors.surface, padding: 12, borderRadius: rounded.card, borderWidth: 1, borderColor: colors.border },
  overview: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: rounded.inner },
  pressed: { opacity: .65 },
  // Lists show photos in the arch (DESIGN.md §5).
  image: { width: 74, height: 86, borderTopLeftRadius: 37, borderTopRightRadius: 37, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  wantedImage: { backgroundColor: colors.softNeutral, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, minWidth: 0, gap: 4 },
  reviewButton: { marginTop: 12 },
  operation: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  title: { ...typography.cardTitle, color: colors.ink },
  price: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  currency: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  location: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  actions: { marginTop: 12 },
  actionButton: { minHeight: 48 },
  soldButton: { flexDirection: 'row', gap: 7, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 6, borderRadius: rounded.pill },
  soldText: { color: colors.primary, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: .5 },
  confirmListing: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: rounded.inner, backgroundColor: colors.surface },
  confirmImage: { width: 52, height: 60, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  confirmTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  modalTitle: { ...typography.sheetTitle, color: colors.ink, marginTop: 6 },
  modalText: { color: colors.body, fontSize: 15, lineHeight: 22 },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, sheetButton: { flexGrow: 1, flexBasis: 140 },
}));
