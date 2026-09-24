import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilterCount, defaultFilters, shortcutActive, toggleShortcut, type ListingFilters, type Shortcut } from '../domain/listings';
import { useCatalogPage } from '../catalog/useCatalog';
import { CONDITIONS, PROVINCES } from '../domain/listingOptions';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';
import { PropertyCard } from '../components/PropertyCard';
import { ExploreMap } from '../components/ExploreMap';
import { SelectionField } from '../components/SelectionField';
import { Brand, Button, EmptyState, Icon, IconButton, Notice, type IconName } from '../components/ui';
import { CatalogFilters, SORT_OPTIONS } from '../components/CatalogFilters';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { NotificationBell } from '../components/notifications/NotificationBell';

const shortcuts: { value: Shortcut; label: string }[] = [
  { value: 'Casa', label: 'Casas' }, { value: 'Apartamento', label: 'Apartamentos' },
  { value: 'price', label: 'Hasta $30.000' }, { value: 'bedrooms', label: '3+ hab.' },
];
const provinceOptions = [{ value: '', label: 'Toda Cuba' }, ...PROVINCES.map(value => ({ value, label: value }))];

export default function ExploreScreen() {
  const { mode, storageError, refresh } = useMarketplace();
  const { unreadCount } = useMessaging();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  async function reload() { setRefreshing(true); try { await Promise.all([refresh(), refreshCatalog()]); } catch { /* Provider and catalogue expose their own errors. */ } finally { setRefreshing(false); } }
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters });
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  // The floating toggle only appears once the results line has scrolled away: on a short list it
  // would sit over the seller invitation, and at the end of a long one the bottom padding clears it.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const toggleView = () => setView(view === 'list' ? 'map' : 'list');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const columns = width >= 1060 ? 3 : width >= 700 ? 2 : 1;
  const { rows: result, total, hasMore, ready, loading, pageError, loadMore, refresh: refreshCatalog } = useCatalogPage(filters);
  const hasFilters = activeFilterCount(filters) > 0;
  const filterCount = activeFilterCount({ ...filters, query: '' });
  const change = (next: Partial<ListingFilters>) => setFilters(old => ({ ...old, ...next }));
  // Short enough to share one line with the sort and map controls at 320 pt.
  const homes = `${total} ${total === 1 ? 'vivienda' : 'viviendas'}`;
  const count = !ready ? 'Cargando…' : filters.province ? `${homes} en ${filters.province}` : hasFilters ? `${total} ${total === 1 ? 'encontrada' : 'encontradas'}` : mode === 'demo' ? `${homes} de prueba` : homes;
  // Tags list only what no shortcut already shows, so a filter never appears twice.
  const priceTag = !!(filters.minPrice || filters.maxPrice) && !shortcutActive(filters, 'price');
  const bedroomTag = filters.minBedrooms > 0 && !shortcutActive(filters, 'bedrooms');
  const hasTags = priceTag || bedroomTag || !!filters.minArea || !!filters.maxArea || !!filters.minBathrooms || !!filters.condition || !!filters.negotiableOnly || !!filters.amenities?.length;
  // Above the floating tab bar, which sits max(inset + 8, 16) from the bottom and is 68 tall.
  const toggleBottom = Math.max(insets.bottom + 8, 16) + 68 + 12;
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
        onScroll={event => setScrolled(headerHeight > 0 && event.nativeEvent.contentOffset.y > headerHeight)}
        scrollEventThrottle={100}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        renderItem={({ item }) => <View style={[styles.cell, { width: result.length === 1 ? '100%' : columns === 3 ? '31.9%' : columns === 2 ? '48.8%' : '100%' }]}><PropertyCard listing={item} horizontal={columns > 1 && result.length === 1} /></View>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
        ListEmptyComponent={!ready ? <View style={styles.skeletons}>{Array.from({ length: columns === 1 ? 2 : columns }, (_, index) => <CardSkeleton key={index} />)}</View> : view === 'map' ? <ExploreMap filters={filters} withoutLocation={result.filter(item => !item.mapLocation).length} onShowList={() => setView('list')} /> : !storageError ? <EmptyState title={hasFilters ? 'Sin coincidencias' : 'Aquí empieza tu próximo hogar'} description={hasFilters ? 'Prueba otra zona o amplía los filtros para encontrar más viviendas.' : 'Aún no hay viviendas publicadas. Si tienes una en venta, puedes preparar el primer anuncio.'} icon={hasFilters ? 'search-outline' : 'home-outline'} action={<Button label={hasFilters ? 'Ver todas las viviendas' : 'Publicar una vivienda'} onPress={() => hasFilters ? setFilters({ ...defaultFilters }) : router.push('/publish')} />} /> : null}
        ListHeaderComponent={<View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
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
            <Text accessibilityRole="header" style={[styles.title, width < 360 && styles.compactTitle]}>Encuentra tu casa en Cuba</Text>
            <View style={styles.search}>
              <Icon name="search" size={20} color={colors.muted} />
              <TextInput accessibilityLabel="Buscar por barrio, municipio o calle" placeholder="Barrio, municipio o calle" placeholderTextColor={colors.muted} style={styles.searchInput} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />
              {filters.query ? <IconButton name="close-circle" label="Borrar búsqueda" onPress={() => change({ query: '' })} style={styles.clearSearch} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={filterCount ? `Filtros, ${filterCount} ${filterCount === 1 ? 'activo' : 'activos'}` : 'Abrir filtros'} onPress={() => setExpanded(true)} style={({ pressed }) => [styles.filterButton, filterCount > 0 && styles.filterActive, pressed && { opacity: .7 }]}>
                <Icon name="options-outline" size={21} color={filterCount > 0 ? colors.white : colors.primary} />
                {filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}
              </Pressable>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.shortcutRow} contentContainerStyle={styles.shortcuts}>
            <SelectionField label="Provincia" value={filters.province ?? ''} options={provinceOptions} onChange={province => change({ province })} renderTrigger={open =>
              <ShortcutChip label={filters.province || 'Toda Cuba'} icon="location-outline" chevron active={!!filters.province} accessibilityLabel={`Provincia: ${filters.province || 'toda Cuba'}`} onPress={open} />} />
            {shortcuts.map(item => <ShortcutChip key={item.value} label={item.label} toggle active={shortcutActive(filters, item.value)} onPress={() => change(toggleShortcut(filters, item.value))} />)}
          </ScrollView>
          <View style={styles.resultMeta}>
            <Text style={styles.resultCount}>{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar orden de viviendas" onPress={() => setExpanded(true)} style={styles.sort}><Text style={styles.sortText}>{SORT_OPTIONS.find(option => option.value === filters.sort)?.label}</Text><Icon name="chevron-down" size={13} color={colors.primary} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={view === 'list' ? 'Ver en el mapa' : 'Ver en lista'} onPress={toggleView} hitSlop={{ top: 5, bottom: 5 }} style={({ pressed }) => [styles.inlineToggle, pressed && { opacity: .7 }]}>
              <Icon name={view === 'list' ? 'map-outline' : 'list-outline'} size={16} color={colors.ink} /><Text style={styles.inlineToggleText}>{view === 'list' ? 'Mapa' : 'Lista'}</Text>
            </Pressable>
          </View>
          {hasTags && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>
            {priceTag && <FilterTag label={`${filters.minPrice || '0'} – ${filters.maxPrice || 'sin límite'} USD`} onRemove={() => change({ minPrice: '', maxPrice: '' })} />}
            {!!(filters.minArea || filters.maxArea) && <FilterTag label={`${filters.minArea || '0'} – ${filters.maxArea || 'sin límite'} m²`} onRemove={() => change({ minArea: '', maxArea: '' })} />}
            {bedroomTag && <FilterTag label={`${filters.minBedrooms}+ hab.`} onRemove={() => change({ minBedrooms: 0 })} />}
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
            : view === 'list' && loading && ready ? <View style={styles.skeletons}><CardSkeleton /></View>
            : view === 'list' && !hasMore && result.length > 0 ? <Text style={styles.listEnd}>{total === 1 ? 'Has visto la única vivienda que coincide.' : `Has visto las ${total} viviendas que coinciden.`}</Text> : null}
          {/* The seller invitation closes a real list; under an empty or failed one it reads as the answer. */}
          {(result.length > 0 || view === 'map') && !storageError && <Pressable accessibilityRole="button" accessibilityLabel="Publicar una vivienda" onPress={() => router.push('/publish')} style={({ pressed }) => [styles.sellerBanner, pressed && { opacity: .85 }]}>
            <View style={styles.sellerIcon}><Icon name="key-outline" size={25} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>Tu vivienda, aquí.</Text><Text style={styles.sellerText}>Dale su próximo capítulo.</Text></View><Icon name="arrow-forward" size={21} color="#FFFFFF" />
          </Pressable>}
          {mode === 'demo' && <Notice>Viviendas e imágenes de demostración. Tus anuncios y favoritos se guardan solo en este dispositivo.</Notice>}
        </View>}
      />
      {scrolled && view === 'list' && <Pressable accessibilityRole="button" accessibilityLabel="Ver en el mapa" onPress={toggleView} style={({ pressed }) => [styles.viewToggle, { bottom: toggleBottom }, pressed && { opacity: .85 }]}>
        <Icon name="map-outline" size={18} color={colors.white} /><Text style={styles.viewToggleText}>Mapa</Text>
      </Pressable>}
      {expanded && <CatalogFilters filters={filters} total={total} onApply={setFilters} onClose={() => setExpanded(false)} />}
    </SafeAreaView>
  );
}

function ShortcutChip({ label, active, onPress, icon, chevron = false, toggle = false, accessibilityLabel }: { label: string; active: boolean; onPress(): void; icon?: IconName; chevron?: boolean; toggle?: boolean; accessibilityLabel?: string }) {
  const tint = active ? colors.primary : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} aria-pressed={toggle ? active : undefined} accessibilityState={toggle ? { selected: active } : undefined} onPress={onPress} hitSlop={{ top: 4, bottom: 4 }}
    style={({ pressed }) => [styles.shortcut, active && styles.shortcutActive, pressed && { opacity: .7 }]}>
    {icon && <Icon name={icon} size={16} color={tint} />}
    <Text style={[styles.shortcutText, active && styles.shortcutTextActive]}>{label}</Text>
    {chevron && <Icon name="chevron-down" size={14} color={tint} />}
  </Pressable>;
}

function CardSkeleton() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeleton}>
    <View style={styles.skeletonImage} />
    <View style={[styles.skeletonLine, { width: '38%', height: 20 }]} />
    <View style={[styles.skeletonLine, { width: '72%' }]} />
    <View style={[styles.skeletonLine, { width: '52%' }]} />
  </View>;
}

function FilterTag({ label, onRemove }: { label: string; onRemove(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Quitar filtro: ${label}`} onPress={onRemove} hitSlop={{ top: 4, bottom: 4 }} style={styles.filterTag}><Text style={styles.filterTagText}>{label}</Text><Icon name="close-circle" size={16} color={colors.primary} /></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }, actions: { flexDirection: 'row', gap: 6 },
  demo: { color: colors.muted, fontSize: 11, backgroundColor: '#EAEAEE', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  messageBadge: { position: 'absolute', right: -2, top: -2, borderRadius: 11, minWidth: 19, paddingHorizontal: 5, height: 19, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }, messageBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  discovery: { maxWidth: 640, gap: 12 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -.7, color: colors.ink }, compactTitle: { fontSize: 24, lineHeight: 30 },
  search: { minHeight: 52, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E1E5EB', borderRadius: 26, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 16, color: colors.ink }, clearSearch: { backgroundColor: 'transparent', width: 40 },
  filterButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.softBlue }, filterActive: { backgroundColor: colors.primary },
  filterCount: { position: 'absolute', right: -3, top: -3, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white }, filterCountText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  shortcutRow: { marginHorizontal: -20, marginTop: 12 }, shortcuts: { paddingHorizontal: 20, paddingVertical: 4, gap: 8 },
  shortcut: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: '#D9DEE6', backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 5 },
  shortcutActive: { backgroundColor: colors.softBlue, borderColor: '#A9C8EC' }, shortcutText: { fontSize: 14, color: colors.ink, fontWeight: '500' }, shortcutTextActive: { color: colors.primary, fontWeight: '600' },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  resultCount: { flex: 1, fontSize: 14, color: colors.muted },
  sort: { flexDirection: 'row', minHeight: 44, gap: 4, alignItems: 'center' }, sortText: { fontSize: 14, color: colors.primary },
  inlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: '#D9DEE6', backgroundColor: colors.white }, inlineToggleText: { fontSize: 14, fontWeight: '500', color: colors.ink },
  activeFilters: { gap: 7, paddingBottom: 10 }, filterTag: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 8, gap: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.softBlue, borderRadius: 14 }, filterTagText: { fontSize: 13, color: colors.primary },
  clear: { minHeight: 44, justifyContent: 'center', marginTop: -6, marginBottom: 4 }, clearText: { color: colors.primary, fontSize: 14 },
  listEnd: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  row: { columnGap: '2%' }, cell: { marginBottom: 26 },
  skeletons: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 4 }, skeleton: { flex: 1, minWidth: 260, gap: 8, marginBottom: 26 },
  skeletonImage: { height: 200, borderRadius: 16, backgroundColor: '#E6E9EE', marginBottom: 4 }, skeletonLine: { height: 14, borderRadius: 7, backgroundColor: '#E6E9EE' },
  viewToggle: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.ink, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' },
  viewToggleText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  sellerBanner: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#173B60', borderRadius: 22, padding: 20, marginTop: 18, marginBottom: 10 },
  sellerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#305577', alignItems: 'center', justifyContent: 'center' },
  sellerTitle: { color: colors.white, fontSize: 19, fontWeight: '600', letterSpacing: -.3 }, sellerText: { fontSize: 13, lineHeight: 18, color: '#CADBEB', marginTop: 4 },
});
