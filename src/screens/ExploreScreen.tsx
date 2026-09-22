import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activeFilterCount, defaultFilters, type ListingFilters } from '../domain/listings';
import { useCatalogPage } from '../catalog/useCatalog';
import { CONDITIONS } from '../domain/listingOptions';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';
import { ExploreIntro } from '../components/ExploreIntro';
import { PropertyCard } from '../components/PropertyCard';
import { ExploreMap } from '../components/ExploreMap';
import { Brand, Button, EmptyState, Icon, IconButton, Notice } from '../components/ui';
import { CatalogFilters, SORT_OPTIONS } from '../components/CatalogFilters';
import { AccountMenu } from '../components/account/AccountMenu';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { NotificationBell } from '../components/notifications/NotificationBell';

const categories = [
  { label: 'Todas', value: 'Todas' },
  { label: 'Casas', value: 'Casa' },
  { label: 'Apartamentos', value: 'Apartamento' },
] as const;

export default function ExploreScreen() {
  const { mode, storageError, refresh } = useMarketplace();
  const { unreadCount } = useMessaging();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  async function reload() { setRefreshing(true); try { await Promise.all([refresh(), refreshCatalog()]); } catch { /* Provider and catalogue expose their own errors. */ } finally { setRefreshing(false); } }
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters });
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const { width } = useWindowDimensions();
  const columns = width >= 1060 ? 3 : width >= 700 ? 2 : 1;
  const { rows: result, total, hasMore, ready, loading, pageError, loadMore, refresh: refreshCatalog } = useCatalogPage(filters);
  const hasFilters = activeFilterCount(filters) > 0;
  const filterCount = activeFilterCount({ ...filters, query: '' });
  const change = (next: Partial<ListingFilters>) => setFilters(old => ({ ...old, ...next }));
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        // numColumns cannot change on a mounted list; only a breakpoint remounts it.
        key={columns}
        data={!ready || view === 'map' ? [] : result}
        numColumns={columns}
        keyExtractor={item => item.id}
        initialNumToRender={6}
        onEndReached={() => { if (view === 'list') loadMore(); }}
        onEndReachedThreshold={0.6}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        renderItem={({ item }) => <View style={[styles.cell, { width: result.length === 1 ? '100%' : columns === 3 ? '31.9%' : columns === 2 ? '48.8%' : '100%' }]}><PropertyCard listing={item} horizontal={columns > 1 && result.length === 1} /></View>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
        ListEmptyComponent={!ready ? <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 45 }} /> : view === 'map' ? <ExploreMap filters={filters} withoutLocation={result.filter(item => !item.mapLocation).length} onShowList={() => setView('list')} /> : !storageError ? <EmptyState title={hasFilters ? 'Sin coincidencias' : 'Aquí empieza tu próximo hogar'} description={hasFilters ? 'Prueba otra zona o amplía los filtros para encontrar más viviendas.' : 'Aún no hay viviendas publicadas. Si tienes una en venta, puedes preparar el primer anuncio.'} icon={hasFilters ? 'search-outline' : 'home-outline'} action={<Button label={hasFilters ? 'Ver todas las viviendas' : 'Publicar una vivienda'} onPress={() => hasFilters ? setFilters({ ...defaultFilters }) : router.push('/publish')} />} /> : null}
        ListHeaderComponent={<View>
        <View style={styles.topbar}>
          <View style={styles.brand}><Brand height={width < 360 ? 24 : 30} />{mode === 'demo' && <Text style={styles.demo}>Demo</Text>}</View>
          <View style={{ flexDirection: 'row', gap: width < 360 ? 4 : 8 }}>
            <NotificationBell unreadCount={notificationUnreadCount} />
            <View><IconButton name="chatbubbles-outline" label={unreadCount ? `Mensajes, ${unreadCount} sin leer` : 'Abrir mensajes'} onPress={() => router.push('/messages')} />
              {unreadCount > 0 && <View pointerEvents="none" style={{ position: 'absolute', right: -2, top: -2, borderRadius: 11, minWidth: 19, paddingHorizontal: 5, height: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }}><Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
            </View>
            <AccountMenu />
          </View>
        </View>
        <View style={width >= 700 && styles.discoveryHeader}>
        {/* The welcome panel is the empty-handed state; a search or a filter means the results are the page. */}
        {!hasFilters && <View style={width >= 700 && styles.introColumn}><ExploreIntro /></View>}
        <View style={width >= 700 && styles.searchColumn}>
        <View style={styles.searchArea}>
          <View style={styles.search}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput accessibilityLabel="Buscar por zona o vivienda" placeholder="Ciudad, zona o vivienda" placeholderTextColor={colors.muted} style={styles.searchInput} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />
            {filters.query ? <IconButton name="close-circle" label="Borrar búsqueda" onPress={() => change({ query: '' })} style={styles.clearSearch} /> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir filtros" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.filterButton, expanded && styles.filterActive, pressed && { opacity: .7 }]}>
            <Icon name="options-outline" size={23} color={expanded ? colors.white : colors.primary} />
            {filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}
          </Pressable>
        </View>
        <View style={styles.segments}>
          {categories.map(category => <Pressable key={category.value} accessibilityRole="button" accessibilityLabel={category.label} accessibilityState={{ selected: filters.type === category.value }} aria-pressed={filters.type === category.value} onPress={() => change({ type: category.value })} style={[styles.segment, filters.type === category.value && styles.segmentActive]}>
            <Text style={[styles.segmentText, filters.type === category.value && styles.segmentTextActive]}>{category.label}</Text>
          </Pressable>)}
        </View>
        </View>
        </View>
        <View style={styles.resultsHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{hasFilters ? 'Resultados' : 'Explora viviendas'}</Text>
        <View style={styles.viewSwitch}>
          {([{ value: 'list', label: 'Lista', icon: 'list-outline' }, { value: 'map', label: 'Mapa', icon: 'map-outline' }] as const).map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`Ver ${option.label.toLowerCase()}`} accessibilityState={{ selected: view === option.value }} onPress={() => setView(option.value)} style={[styles.viewOption, view === option.value && styles.viewSelected]}>
            <Icon name={option.icon} size={19} color={view === option.value ? colors.primary : colors.muted} />
          </Pressable>)}
        </View>
        </View>
        <View style={styles.resultMeta}>
          <Text style={styles.resultCount}>{ready ? `${total} ${total === 1 ? 'vivienda' : 'viviendas'}${hasFilters ? (total === 1 ? ' encontrada' : ' encontradas') : mode === 'demo' ? ' · Catálogo de prueba' : ' en venta'}` : 'Cargando viviendas…'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar orden de viviendas" onPress={() => setExpanded(true)} style={styles.sort}><Text style={styles.sortText}>{SORT_OPTIONS.find(option => option.value === filters.sort)?.label}</Text><Icon name="chevron-down" size={13} color={colors.primary} /></Pressable>
        </View>
        {filterCount > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>
          {!!filters.province && <FilterTag label={filters.province} onRemove={() => change({ province: '' })} />}
          {!!(filters.minPrice || filters.maxPrice) && <FilterTag label={`${filters.minPrice || '0'} – ${filters.maxPrice || 'sin límite'} USD`} onRemove={() => change({ minPrice: '', maxPrice: '' })} />}
          {!!(filters.minArea || filters.maxArea) && <FilterTag label={`${filters.minArea || '0'} – ${filters.maxArea || 'sin límite'} m²`} onRemove={() => change({ minArea: '', maxArea: '' })} />}
          {filters.minBedrooms > 0 && <FilterTag label={`${filters.minBedrooms}+ hab.`} onRemove={() => change({ minBedrooms: 0 })} />}
          {!!filters.minBathrooms && <FilterTag label={`${filters.minBathrooms}+ baños`} onRemove={() => change({ minBathrooms: 0 })} />}
          {!!filters.condition && <FilterTag label={CONDITIONS.find(option => option.value === filters.condition)?.label ?? filters.condition} onRemove={() => change({ condition: '' })} />}
          {filters.negotiableOnly && <FilterTag label="Negociable" onRemove={() => change({ negotiableOnly: false })} />}
          {filters.amenities?.map(item => <FilterTag key={item} label={item} onRemove={() => change({ amenities: filters.amenities?.filter(value => value !== item) })} />)}
        </ScrollView>}
        {hasFilters && <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda y filtros" onPress={() => setFilters({ ...defaultFilters })} style={styles.clear}><Text style={styles.clearText}>Limpiar búsqueda y filtros</Text></Pressable>}
        {storageError && <View style={{ gap: 8, marginBottom: 18 }}><Notice error>{storageError}</Notice><Button label="Volver a cargar" secondary loading={refreshing} onPress={reload} /></View>}
        </View>}
        ListFooterComponent={<View>
        {view === 'list' && pageError && ready ? <View style={{ gap: 8, marginBottom: 18 }}><Notice error>{pageError}</Notice><Button label="Cargar más viviendas" secondary loading={loading} onPress={loadMore} /></View>
          : view === 'list' && loading && ready ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          : view === 'list' && !hasMore && result.length > 0 ? <Text style={styles.listEnd}>{total === 1 ? 'Has visto la única vivienda que coincide.' : `Has visto las ${total} viviendas que coinciden.`}</Text> : null}
        {/* The seller invitation closes a real list; under an empty or failed one it reads as the answer. */}
        {(result.length > 0 || view === 'map') && !storageError && <Pressable accessibilityRole="button" accessibilityLabel="Publicar una vivienda" onPress={() => router.push('/publish')} style={({ pressed }) => [styles.sellerBanner, pressed && { opacity: .85 }]}>
          <View style={styles.sellerIcon}><Icon name="key-outline" size={25} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>Tu vivienda, aquí.</Text><Text style={styles.sellerText}>Dale su próximo capítulo.</Text></View><Icon name="arrow-forward" size={21} color="#FFFFFF" />
        </Pressable>}
        {mode === 'demo' && <Notice>Viviendas e imágenes de demostración. Tus anuncios y favoritos se guardan solo en este dispositivo.</Notice>}
        </View>}
      />
      {expanded && <CatalogFilters filters={filters} total={total} onApply={setFilters} onClose={() => setExpanded(false)} />}
    </SafeAreaView>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Quitar filtro: ${label}`} onPress={onRemove} hitSlop={{ top: 4, bottom: 4 }} style={styles.filterTag}><Text style={styles.filterTagText}>{label}</Text><Icon name="close-circle" size={16} color={colors.primary} /></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 18 },
  brand: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginRight: 8 },
  demo: { color: colors.muted, fontSize: 11, backgroundColor: '#EAEAEE', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginLeft: 3 },
  discoveryHeader: { flexDirection: 'row', gap: 28, alignItems: 'center' }, introColumn: { flex: 1 }, searchColumn: { flex: 1, paddingBottom: 18 },
  searchArea: { flexDirection: 'row', gap: 10 }, search: { flex: 1, minHeight: 50, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E1E5EB', borderRadius: 16, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 16, color: colors.ink }, clearSearch: { backgroundColor: 'transparent', width: 44 },
  filterButton: { width: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.softBlue, borderWidth: 1, borderColor: '#D8E6F6' }, filterActive: { backgroundColor: colors.primary },
  segments: { flexDirection: 'row', borderRadius: 13, padding: 3, backgroundColor: '#EAEAEE', marginTop: 16 }, segment: { flex: 1, minHeight: 44, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.white, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }, segmentText: { fontSize: 13, color: colors.muted, fontWeight: '500' }, segmentTextActive: { fontWeight: '600', color: colors.ink },
  filterCount: { position: 'absolute', right: -5, top: -5, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.paper }, filterCountText: { color: colors.white, fontSize: 10, fontWeight: '700' }, activeFilters: { gap: 7, paddingBottom: 14 }, filterTag: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.softBlue, borderRadius: 14 }, filterTagText: { fontSize: 12, color: colors.primary },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 24 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink, letterSpacing: -.2 }, resultCount: { flex: 1, fontSize: 12, color: colors.muted }, resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sort: { flexDirection: 'row', minHeight: 44, gap: 4, alignItems: 'center' }, sortText: { fontSize: 13, color: colors.primary },
  viewSwitch: { flexDirection: 'row', padding: 3, borderRadius: 15, backgroundColor: '#EAEAEE' },
  viewOption: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, viewSelected: { backgroundColor: colors.white, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  listEnd: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  clear: { minHeight: 44, justifyContent: 'center', marginTop: -8, marginBottom: 6 }, clearText: { color: colors.primary, fontSize: 14 },
  row: { columnGap: '2%' }, cell: { marginBottom: 24 },
  sellerBanner: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#173B60', borderRadius: 22, padding: 20, marginTop: 18, marginBottom: 10 },
  sellerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#305577', alignItems: 'center', justifyContent: 'center' },
  sellerTitle: { color: colors.white, fontSize: 19, fontWeight: '600', letterSpacing: -.3 }, sellerText: { fontSize: 12, lineHeight: 18, color: '#CADBEB', marginTop: 4 },
});
