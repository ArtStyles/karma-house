import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activeFilterCount, defaultFilters, type ListingFilters } from '../domain/listings';
import { useCatalogPage } from '../catalog/useCatalog';
import { catalogRetryAction } from '../catalog/presentation';
import { snapshotAgeText } from '../catalog/offlineSnapshot';
import { catalogFilterTags, removeCatalogFilter } from '../catalog/activeFilters';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, layout } from '../theme';
import { PropertyCard } from '../components/PropertyCard';
import { ExploreDiscovery } from '../components/ExploreDiscovery';
import { CatalogRefinements } from '../components/CatalogRefinements';
import { Brand, Button, EmptyState, Icon, IconButton, Notice } from '../components/ui';
import { CatalogFilters } from '../components/CatalogFilters';
import { CatalogSortMenu } from '../components/CatalogSortMenu';
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
  const columns = width >= 1060 ? 3 : width >= 700 ? 2 : 1;
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
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        renderItem={({ item }) => <View style={[styles.cell, { width: result.length === 1 ? '100%' : columns === 3 ? '31.9%' : columns === 2 ? '48.8%' : '100%' }]}><PropertyCard listing={item} offline={offline} horizontal={columns > 1 && result.length === 1} /></View>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
        ListEmptyComponent={!ready || updating ? <View style={styles.skeletons}>{Array.from({ length: columns === 1 ? 2 : columns }, (_, index) => <CardSkeleton key={index} />)}</View> : !pageError && !storageError ? <EmptyState title={hasFilters ? 'Sin coincidencias' : 'Aquí empieza tu próximo hogar'} description={hasFilters ? 'Prueba otra zona o amplía los filtros. También puedes guardar la búsqueda para volver cuando aparezca una coincidencia.' : 'Aún no hay viviendas publicadas. Si tienes una en venta, puedes preparar el primer anuncio.'} icon={hasFilters ? 'search-outline' : 'home-outline'} action={<View style={{ gap: 10 }}><Button label={hasFilters ? 'Ampliar búsqueda' : 'Publicar una vivienda'} onPress={() => hasFilters ? setFilters({ ...defaultFilters }) : router.push('/publish')} />{hasFilters && !offline && <Button label="Guardar esta búsqueda" secondary icon="bookmark-outline" onPress={saveSearch} />}</View>} /> : null}
        ListHeaderComponent={<View>
          <View style={styles.topbar}>
            <View style={styles.brand}><Brand height={width < 360 ? 22 : 26} />{mode === 'demo' && <Text style={styles.demo}>Demo</Text>}</View>
            <View style={styles.actions}>
              <NotificationBell unreadCount={notificationUnreadCount} />
              <View><IconButton name="chatbubbles-outline" label={unreadCount ? `Mensajes, ${unreadCount} sin leer` : 'Abrir mensajes'} onPress={() => router.push('/messages')} />
                {unreadCount > 0 && <View pointerEvents="none" style={styles.messageBadge}><Text style={styles.messageBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
              </View>
            </View>
          </View>
          <View style={styles.discovery}>
            <ExploreDiscovery offline={offline} onOperation={operation => change({ operation })} onPublish={() => router.push('/publish')} />
            <View style={[styles.search, locked]}>
              <Icon name="search" size={20} color={colors.muted} />
              <TextInput accessibilityLabel="Buscar por barrio, municipio o calle" placeholder="Barrio, municipio o calle" placeholderTextColor={colors.muted} style={styles.searchInput} editable={!offline} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />
              {filters.query ? <IconButton name="close-circle" label="Borrar búsqueda" onPress={() => change({ query: '' })} style={styles.clearSearch} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={filterCount ? `Filtros, ${filterCount} ${filterCount === 1 ? 'activo' : 'activos'}` : 'Abrir filtros'} onPress={openFilters} style={({ pressed }) => [styles.filterButton, filterCount > 0 && styles.filterActive, pressed && { opacity: .7 }]}>
                <Icon name="options-outline" size={21} color={filterCount > 0 ? colors.onPrimary : colors.primary} />
                {filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}
              </Pressable>
            </View>
          </View>
          <View style={styles.refinements}>
            <CatalogRefinements filters={filters} onChange={change} disabled={offline} />
          </View>
          {filterTags.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={locked} contentContainerStyle={styles.activeFilters}>
            {filterTags.map(tag => <FilterTag key={tag.key} label={tag.label} onRemove={() => removeFilter(tag.key)} />)}
            <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda y filtros" disabled={offline} onPress={clearFilters} style={styles.clear}><Text style={styles.clearText}>Limpiar</Text></Pressable>
          </ScrollView>}
          <View style={[styles.resultMeta, compactMeta && styles.compactMeta]}>
            <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{count}</Text>
            <View style={[styles.metaControls, compactMeta && styles.compactMetaControls, locked]}>
              <CatalogSortMenu value={filters.sort} onChange={sort => change({ sort })} disabled={offline} />
              <IconButton name="bookmark-outline" label="Guardar búsqueda" onPress={saveSearch} style={styles.saveSearch} />
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
        ListFooterComponent={<View>
          {pageError && ready ? <View style={{ gap: 8, marginBottom: 18 }}><Notice error>{pageError}</Notice><Button label="Reintentar" secondary loading={loading} onPress={() => { if (catalogRetryAction({ current, hasMore }) === 'page') loadMore(); else void refreshCatalog().catch(() => {}); }} /></View>
            : loading && ready ? <View style={styles.skeletons}><CardSkeleton /></View>
            : current && !updating && !hasMore && result.length > 0 && !offline ? <Text style={styles.listEnd}>{total === 1 ? 'Has visto la única vivienda que coincide.' : `Has visto las ${total} viviendas que coinciden.`}</Text> : null}
          {/* The seller invitation closes a real list; under an empty or failed one it reads as the answer. */}
          {result.length > 0 && !storageError && <Pressable accessibilityRole="button" accessibilityLabel="Publicar una vivienda" onPress={() => router.push('/publish')} style={({ pressed }) => [styles.sellerBanner, pressed && { opacity: .85 }]}>
            <View style={styles.sellerIcon}><Icon name="key-outline" size={25} color={colors.onPrimary} /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>Tu vivienda, aquí.</Text><Text style={styles.sellerText}>Dale su próximo capítulo.</Text></View><Icon name="arrow-forward" size={21} color={colors.onPrimary} />
          </Pressable>}
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

function CardSkeleton() {
  const { styles } = useStyles();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeleton}>
    <View style={styles.skeletonImage} />
    <View style={[styles.skeletonLine, { width: '38%', height: 20 }]} />
    <View style={[styles.skeletonLine, { width: '72%' }]} />
    <View style={[styles.skeletonLine, { width: '52%' }]} />
  </View>;
}

function FilterTag({ label, onRemove }: { label: string; onRemove(): void }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Quitar filtro: ${label}`} onPress={onRemove} hitSlop={{ top: 4, bottom: 4 }} style={styles.filterTag}><Text style={styles.filterTagText}>{label}</Text><Icon name="close-circle" size={16} color={colors.primary} /></Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }, actions: { flexDirection: 'row', gap: 6 },
  demo: { color: colors.muted, fontSize: 11, backgroundColor: colors.softNeutral, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  messageBadge: { position: 'absolute', right: -2, top: -2, borderRadius: 11, minWidth: 19, paddingHorizontal: 5, height: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryFill }, messageBadgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  discovery: { maxWidth: 640, gap: 12 },
  search: { minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 26, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 16, color: colors.ink }, clearSearch: { backgroundColor: 'transparent', width: 40 },
  filterButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.softBlue }, filterActive: { backgroundColor: colors.primaryFill },
  filterCount: { position: 'absolute', right: -3, top: -3, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.inverseSurface, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface }, filterCountText: { color: colors.inverseInk, fontSize: 11, fontWeight: '700' },
  refinements: { marginTop: 12 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 }, metaControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactMeta: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  compactMetaControls: { justifyContent: 'space-between' },
  resultCount: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.muted },
  saveSearch: { backgroundColor: 'transparent' },
  saveNotice: { gap: 8, marginBottom: 10 },
  activeFilters: { gap: 7, paddingTop: 12, alignItems: 'center' }, filterTag: { minHeight: 44, paddingHorizontal: 11, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.softBlue, borderRadius: 12 }, filterTagText: { fontSize: 13, color: colors.primary },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, clearText: { color: colors.muted, fontSize: 13 },
  listEnd: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  row: { columnGap: '2%' }, cell: { marginBottom: 26 },
  skeletons: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 4 }, skeleton: { flex: 1, minWidth: 260, gap: 8, marginBottom: 26 },
  skeletonImage: { height: 200, borderRadius: 16, backgroundColor: colors.skeleton, marginBottom: 4 }, skeletonLine: { height: 14, borderRadius: 7, backgroundColor: colors.skeleton },
  sellerBanner: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.banner, borderRadius: 22, padding: 20, marginTop: 18, marginBottom: 10 },
  sellerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.bannerIcon, alignItems: 'center', justifyContent: 'center' },
  sellerTitle: { color: colors.onPrimary, fontSize: 19, fontWeight: '600', letterSpacing: -.3 }, sellerText: { fontSize: 13, lineHeight: 18, color: colors.bannerText, marginTop: 4 },
}));
