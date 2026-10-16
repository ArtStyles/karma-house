import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activeFilterCount, defaultFilters, type ListingFilters } from '../domain/listings';
import { useCatalogPage } from '../catalog/useCatalog';
import { catalogRetryAction } from '../catalog/presentation';
import { snapshotAgeText } from '../catalog/offlineSnapshot';
import { catalogFilterTags, removeCatalogFilter } from '../catalog/activeFilters';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, layout, rounded, typography } from '../theme';
import { PropertyCard } from '../components/PropertyCard';
import { ExploreDiscovery } from '../components/ExploreDiscovery';
import { OperationTabs, ProvincePicker } from '../components/CatalogRefinements';
import { ArchImage } from '../components/ArchImage';
import { MotionPressable } from '../components/MotionPressable';
import { Button, EmptyState, Icon, IconButton, Notice } from '../components/ui';
import { CatalogFilters } from '../components/CatalogFilters';
import { CatalogSortMenu } from '../components/CatalogSortMenu';
import { InstallHint } from '../components/InstallHint';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { SaveSearchSheet } from '../components/SaveSearchSheet';
import { useAuth } from '../auth/AuthProvider';
import { fromSavedFilters, toSavedFilters } from '../searches/domain';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { useSavedSearches } from '../searches/useSavedSearches';

export default function ExploreScreen() {
  const { colors, styles } = useStyles();
  const { mode, storageError, refresh } = useMarketplace();
  const { unreadCount } = useMessaging();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  async function reload() { setRefreshing(true); try { await Promise.all([refresh(), refreshCatalog()]); } catch { /* Provider and catalogue expose their own errors. */ } finally { setRefreshing(false); } }
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters });
  const [expanded, setExpanded] = useState(false);
  const auth = useAuth();
  const { search } = useLocalSearchParams<{ search?: string }>();
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<'demo' | 'saved' | null>(null);
  const [intentError, setIntentError] = useState('');
  const intentBusy = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (auth.ready && auth.user) void pendingIntentStore.take('/', () => active).then(intent => {
      if (!active || intent?.kind !== 'search') return;
      setFilters({ ...fromSavedFilters(intent.filters), sort: intent.sort });
      setSaveNotice(null); setSaving(true);
    });
    return () => { active = false; };
  }, [auth.ready, auth.user?.id]));
  async function saveSearch() {
    if (offline) return;
    if (mode === 'demo') return setSaveNotice('demo');
    if (!auth.ready || intentBusy.current) return;
    if (!auth.user) {
      intentBusy.current = true; setIntentError('');
      try {
        await pendingIntentStore.write({ kind: 'search', filters: toSavedFilters(filters), sort: filters.sort });
        router.push({ pathname: '/auth', params: { returnTo: '/' } });
      } catch { setIntentError('No pudimos conservar la búsqueda. Inténtalo de nuevo.'); }
      finally { intentBusy.current = false; }
      return;
    }
    setSaveNotice(null); setSaving(true);
  }
  const { width, fontScale } = useWindowDimensions();
  const compactMeta = width < 360 || fontScale > 1.2;
  const wide = width >= layout.wideMinWidth;
  // A grid of arches: two on a phone, more as the screen widens. Cells get a pixel width so each arch is a true half circle.
  const columns = width >= 1060 ? 4 : width >= 700 ? 3 : 2;
  const contentWidth = Math.min(width - (wide ? layout.railWidth : 0), 1180) - 32;
  const cellWidth = Math.floor((contentWidth - GRID_GAP * (columns - 1)) / columns);
  const { rows: result, total, hasMore, ready, loading, updating, current, pageError, offlineSince, loadMore, refresh: refreshCatalog } = useCatalogPage(filters);
  // On the saved snapshot nothing can ask the server, so every control that would is held still.
  const offline = offlineSince !== null;
  const locked = offline ? { pointerEvents: 'none' as const, opacity: .45 } : undefined;
  const openFilters = () => { if (!offline) setExpanded(true); };
  const clearFilters = () => { if (!offline) setFilters({ ...defaultFilters }); };
  const hasFilters = activeFilterCount(filters) > 0;
  const filterCount = activeFilterCount({ ...filters, query: '' });
  const change = (next: Partial<ListingFilters>) => { if (!offline) setFilters(old => ({ ...old, ...next })); };
  // The count shares one line with sort and saved searches on regular screens.
  const homes = filters.operation === 'wanted' ? `${total} ${total === 1 ? 'búsqueda' : 'búsquedas'}` : `${total} ${total === 1 ? 'vivienda' : 'viviendas'}`;
  const count = offline ? 'Últimos resultados guardados' : updating ? 'Actualizando…' : !current ? 'Resultados sin actualizar' : mode === 'demo' ? `${homes} de prueba` : homes;
  const filterTags = catalogFilterTags(filters);
  // The arch carousel opens a search that has not been narrowed yet; once it is, the grid answers alone.
  const carousel = ready && current && !filters.query && !filterTags.length && result.length >= 3 ? result.slice(0, 5) : [];
  const removeFilter = (key: string) => { if (!offline) setFilters(old => removeCatalogFilter(old, key)); };
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        // numColumns cannot change on a mounted list; only a breakpoint remounts it.
        key={columns}
        data={!ready ? [] : result}
        numColumns={columns}
        keyExtractor={item => item.id}
        initialNumToRender={6}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        columnWrapperStyle={styles.row}
        ItemSeparatorComponent={() => <View accessible={false} style={styles.rowGap} />}
        renderItem={({ item }) => result.length === 1 ? <View style={styles.single}><PropertyCard listing={item} offline={offline} horizontal /></View> : <PropertyCard listing={item} offline={offline} width={cellWidth} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
        ListEmptyComponent={!ready || updating ? <View style={styles.skeletons}>{Array.from({ length: columns }, (_, index) => <CardSkeleton key={index} width={cellWidth} />)}</View> : !pageError && !storageError ? <EmptyState title={hasFilters ? 'Sin coincidencias' : 'Aquí empieza tu próximo hogar'} description={hasFilters ? 'Prueba otra zona o amplía los filtros. También puedes guardar la búsqueda para volver cuando aparezca una coincidencia.' : 'Aún no hay viviendas publicadas. Si tienes una en venta, puedes preparar el primer anuncio.'} icon={hasFilters ? 'search-outline' : 'home-outline'} action={<View style={{ gap: 10 }}><Button label={hasFilters ? 'Ampliar búsqueda' : 'Publicar una vivienda'} onPress={() => hasFilters ? setFilters({ ...defaultFilters }) : router.push('/publish')} />{hasFilters && !offline && <Button label="Guardar esta búsqueda" secondary icon="bookmark-outline" onPress={saveSearch} />}</View>} /> : null}
        ListHeaderComponent={<View>
          {/* Wide screens carry the logo and the inboxes in the SideRail. */}
          <View style={styles.topbar}>
            <View style={styles.where}><ProvincePicker value={filters.province} onChange={province => change({ province })} disabled={offline} />{mode === 'demo' && <Text style={styles.demo}>Demo</Text>}</View>
            {!wide && <View style={styles.actions}>
              <NotificationBell unreadCount={notificationUnreadCount} />
              <View><IconButton name="chatbubbles-outline" label={unreadCount ? `Mensajes, ${unreadCount} sin leer` : 'Abrir mensajes'} onPress={() => router.push('/messages')} />
                {unreadCount > 0 && <View pointerEvents="none" style={styles.messageBadge}><Text style={styles.messageBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
              </View>
            </View>}
          </View>
          <OperationTabs value={filters.operation} onChange={operation => change({ operation })} disabled={offline} />
          <InstallHint />
          <View style={[styles.search, locked]}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput accessibilityLabel="Buscar por barrio, municipio o calle" placeholder="Barrio, municipio o calle" placeholderTextColor={colors.muted} style={styles.searchInput} editable={!offline} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />
            {filters.query ? <IconButton name="close-circle" label="Borrar búsqueda" onPress={() => change({ query: '' })} style={styles.clearSearch} /> : null}
            <MotionPressable accessibilityRole="button" accessibilityLabel={filterCount ? `Filtros, ${filterCount} ${filterCount === 1 ? 'activo' : 'activos'}` : 'Abrir filtros'} onPress={openFilters} style={({ pressed }) => [styles.filterButton, filterCount > 0 && styles.filterActive, pressed && { opacity: .7 }]}>
              <Icon name="options-outline" size={21} color={filterCount > 0 ? colors.onPrimary : colors.primary} />
              {filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}
            </MotionPressable>
          </View>
          {filterTags.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[styles.tagsRow, locked]} contentContainerStyle={styles.activeFilters}>
            {filterTags.map(tag => <FilterTag key={tag.key} label={tag.label} onRemove={() => removeFilter(tag.key)} />)}
            <MotionPressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda y filtros" disabled={offline} onPress={clearFilters} style={styles.clear}><Text style={styles.clearText}>Limpiar</Text></MotionPressable>
          </ScrollView>}
          {carousel.length > 0 && <View style={styles.carousel}><ExploreDiscovery listings={carousel} onOpen={listing => router.push(`/property/${listing.id}`)} /></View>}
          <View style={[styles.resultMeta, compactMeta && styles.compactMeta]}>
            <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{count}</Text>
            <View style={[styles.metaControls, locked]}>
              <CatalogSortMenu value={filters.sort} onChange={sort => change({ sort })} disabled={offline} />
              <IconButton name="notifications-outline" label="Guardar búsqueda" onPress={saveSearch} />
            </View>
          </View>
          {offlineSince !== null && <View style={styles.saveNotice}>
            <Notice>{`Sin conexión. Viendo lo último que cargaste, ${snapshotAgeText(offlineSince, Date.now())}. Los filtros y la búsqueda volverán cuando recuperes la conexión.`}</Notice>
            <Button label="Reintentar" secondary icon="refresh-outline" loading={loading} onPress={() => void refreshCatalog().catch(() => {})} />
          </View>}
          {saveNotice === 'demo' && <View style={styles.saveNotice}><Notice>Las alertas necesitan una cuenta de KarmaHouse.</Notice></View>}
          {saveNotice === 'saved' && <View style={styles.saveNotice}><Notice>Te avisaremos cuando aparezca una vivienda que encaje.</Notice><Button label="Ver mis alertas" secondary icon="bookmark-outline" onPress={() => router.push('/saved-searches')} /></View>}
          {storageError && <View style={{ gap: 8, marginBottom: 18 }}><Notice error>{storageError}</Notice><Button label="Volver a cargar" secondary loading={refreshing} onPress={reload} /></View>}
        </View>}
        ListFooterComponent={<View style={result.length > 0 ? styles.listFooter : undefined}>
          {pageError && ready ? <View style={{ gap: 8, marginBottom: 18 }}><Notice error>{pageError}</Notice><Button label="Reintentar" secondary loading={loading} onPress={() => { if (catalogRetryAction({ current, hasMore }) === 'page') loadMore(); else void refreshCatalog().catch(() => {}); }} /></View>
            : loading && ready ? <View style={styles.skeletons}><CardSkeleton width={cellWidth} /></View>
            : current && !updating && !hasMore && result.length > 0 && !offline ? <Text style={styles.listEnd}>{total === 1 ? 'Has visto la única vivienda que coincide.' : `Has visto las ${total} viviendas que coinciden.`}</Text> : null}
          {/* The seller invitation closes a real list; under an empty or failed one it reads as the answer. */}
          {result.length > 0 && !storageError && <MotionPressable accessibilityRole="button" accessibilityLabel="Publicar una vivienda" onPress={() => router.push('/publish')} style={({ pressed }) => [styles.paper, pressed && { opacity: .85 }]}>
            <View style={{ flex: 1 }}><Text style={styles.paperTitle}>Tu vivienda, aquí.</Text><Text style={styles.paperText}>Dale su próximo capítulo.</Text></View><Icon name="arrow-forward" size={21} color={colors.creamInk} />
          </MotionPressable>}
          {mode === 'demo' && <Notice>Viviendas e imágenes de demostración. Tus anuncios y favoritos se guardan solo en este dispositivo.</Notice>}
        </View>}
      />
      {expanded && <CatalogFilters filters={filters} onApply={setFilters} onClose={() => setExpanded(false)} />}
      {saving && <SaveSearchSheet filters={filters} onClose={() => setSaving(false)} onSaved={() => { setSaving(false); setSaveNotice('saved'); }} />}
      {!!search && mode === 'cloud' && !!auth.user && <SavedSearchParam key={search} id={search} onApply={setFilters} />}
      {!!intentError && <Notice error>{intentError}</Notice>}
    </SafeAreaView>
  );
}

/** Mounted only while `?search=<id>` is present: applies that saved search once, then drops the parameter. */
function SavedSearchParam({ id, onApply }: { id: string; onApply(filters: ListingFilters): void }) {
  const { items, loading } = useSavedSearches();
  const started = useRef(false);
  useEffect(() => {
    if (loading) { started.current = true; return; }
    if (!started.current) return;
    const found = items.find(item => item.id === id);
    if (found) onApply(fromSavedFilters(found.filters));
    router.setParams({ search: undefined });
  }, [loading, items, id, onApply]);
  return null;
}

const GRID_GAP = 14;

function CardSkeleton({ width }: { width: number }) {
  const { styles } = useStyles();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.skeleton, { width }]}>
    <ArchImage width={width} height={Math.round(width * 1.16)} style={styles.skeletonImage}><View /></ArchImage>
    <View style={[styles.skeletonLine, { width: '38%', height: 20 }]} />
    <View style={[styles.skeletonLine, { width: '72%' }]} />
    <View style={[styles.skeletonLine, { width: '52%' }]} />
  </View>;
}

function FilterTag({ label, onRemove }: { label: string; onRemove(): void }) {
  const { colors, styles } = useStyles();
  return <MotionPressable accessibilityRole="button" accessibilityLabel={`Quitar filtro: ${label}`} onPress={onRemove} hitSlop={{ top: 4, bottom: 4 }} style={styles.filterTag}><Text style={styles.filterTagText}>{label}</Text><Icon name="close" size={16} color={colors.muted} /></MotionPressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: layout.tabContentBottom },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, paddingBottom: 6 },
  where: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }, actions: { flexDirection: 'row', gap: 8 },
  demo: { ...typography.caption, fontWeight: '600', color: colors.muted, backgroundColor: colors.softNeutral, paddingHorizontal: 9, paddingVertical: 3, borderRadius: rounded.pill, overflow: 'hidden' },
  messageBadge: { position: 'absolute', right: -2, top: -2, borderRadius: 11, minWidth: 19, paddingHorizontal: 5, height: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.sol }, messageBadgeText: { color: colors.onSol, fontSize: 11, fontWeight: '700' },
  search: { marginTop: 12, maxWidth: 640, minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.pill, paddingLeft: 16, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 16, color: colors.ink }, clearSearch: { backgroundColor: 'transparent', width: 40 },
  filterButton: { width: 40, height: 40, borderRadius: rounded.pill, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.softBlue }, filterActive: { backgroundColor: colors.primaryFill },
  filterCount: { position: 'absolute', right: -4, top: -4, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.sol, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface }, filterCountText: { color: colors.onSol, fontSize: 11, fontWeight: '700' },
  tagsRow: { marginHorizontal: -16 }, activeFilters: { gap: 8, paddingTop: 12, paddingHorizontal: 16, alignItems: 'center' },
  filterTag: { minHeight: 36, paddingLeft: 14, paddingRight: 10, gap: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: rounded.pill }, filterTagText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, clearText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  carousel: { width: '100%', maxWidth: 640, alignSelf: 'center', marginTop: 18 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 14 }, metaControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactMeta: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  resultCount: { flex: 1, ...typography.section, color: colors.ink, fontVariant: ['tabular-nums'] },
  saveNotice: { gap: 8, marginBottom: 10 },
  listEnd: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  row: { gap: GRID_GAP }, rowGap: { height: 18 }, single: { flex: 1 },
  listFooter: { paddingTop: 26 },
  skeletons: { flexDirection: 'row', gap: GRID_GAP, flexWrap: 'wrap' }, skeleton: { gap: 8, marginBottom: 26 },
  skeletonImage: { backgroundColor: colors.skeleton, marginBottom: 4 }, skeletonLine: { height: 14, borderRadius: 7, backgroundColor: colors.skeleton },
  // The one paper card on the screen.
  paper: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.cream, borderRadius: rounded.card, padding: 18, marginTop: 18, marginBottom: 10 },
  paperTitle: { ...typography.cardTitle, color: colors.creamInk }, paperText: { fontSize: 13, lineHeight: 18, color: colors.creamInk, opacity: .78, marginTop: 4 },
}));
