import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { defaultFilters, filterListings, type ListingFilters } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout, typefaces } from '../theme';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, Icon, IconButton, Notice, Pill } from '../components/ui';

const categories = [
  { label: 'Todas', value: 'Todas' },
  { label: 'Casas', value: 'Casa' },
  { label: 'Apartamentos', value: 'Apartamento' },
] as const;

export default function ExploreScreen() {
  const { listings } = useMarketplace();
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters });
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const columns = width >= 1060 ? 3 : width >= 700 ? 2 : 1;
  const result = useMemo(() => filterListings(listings, filters), [listings, filters]);
  const hasFilters = !!(filters.query || filters.type !== 'Todas' || filters.maxPrice || filters.minBedrooms);
  const change = (next: Partial<ListingFilters>) => setFilters(old => ({ ...old, ...next }));
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.brand}><Icon name="home" size={17} color={colors.primary} /><Text style={styles.brandText}>KarmaHouse</Text><Text style={styles.demo}>Demo</Text></View>
          <IconButton name="person-circle-outline" label="Abrir mi espacio" onPress={() => router.push('/profile')} />
        </View>
        <View style={styles.headingRow}>
          <Text accessibilityRole="header" style={styles.headline}>Explorar</Text>
          <View style={styles.country}><Icon name="location" size={13} color={colors.muted} /><Text style={styles.countryText}>Cuba</Text></View>
        </View>
        <Text style={styles.intro}>Un lugar para tu próximo capítulo.</Text>
        <View style={styles.searchArea}>
          <View style={styles.search}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput accessibilityLabel="Buscar por zona o vivienda" placeholder="Ciudad, zona o vivienda" placeholderTextColor={colors.muted} style={styles.searchInput} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />
            {filters.query ? <IconButton name="close-circle" label="Borrar búsqueda" onPress={() => change({ query: '' })} style={styles.clearSearch} /> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir filtros" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.filterButton, expanded && styles.filterActive, pressed && { opacity: .7 }]}>
            <Icon name="options-outline" size={23} color={expanded ? colors.white : colors.primary} />
          </Pressable>
        </View>
        <View style={styles.segments}>
          {categories.map(category => <Pressable key={category.value} accessibilityRole="button" accessibilityLabel={category.label} accessibilityState={{ selected: filters.type === category.value }} aria-pressed={filters.type === category.value} onPress={() => change({ type: category.value })} style={[styles.segment, filters.type === category.value && styles.segmentActive]}>
            <Text style={[styles.segmentText, filters.type === category.value && styles.segmentTextActive]}>{category.label}</Text>
          </Pressable>)}
        </View>
        {expanded && <View style={styles.filters}>
          <View style={styles.filterPrice}><Text style={styles.filterLabel}>Precio máximo · USD</Text><TextInput accessibilityLabel="Precio máximo en USD" style={styles.filterInput} placeholder="Sin límite" placeholderTextColor={colors.muted} keyboardType="numeric" value={filters.maxPrice} onChangeText={maxPrice => change({ maxPrice: maxPrice.replace(/[^0-9]/g, '') })} /></View>
          <View><Text style={styles.filterLabel}>Habitaciones</Text><View style={styles.roomOptions}>{[0, 1, 2, 3].map(n => <Pill key={n} label={n === 0 ? 'Todas' : n + '+'} active={filters.minBedrooms === n} onPress={() => change({ minBedrooms: n })} />)}</View></View>
        </View>}
        <View style={styles.resultsHeader}>
          <View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.sectionTitle}>{hasFilters ? 'Resultados' : 'Viviendas en venta'}</Text><Text style={styles.resultCount}>{result.length} {result.length === 1 ? 'vivienda' : 'viviendas'}{hasFilters ? (result.length === 1 ? ' encontrada' : ' encontradas') : ' · Catálogo de prueba'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar orden de viviendas" onPress={() => change({ sort: filters.sort === 'recent' ? 'price-asc' : 'recent' })} style={styles.sort}><Text style={styles.sortText}>{filters.sort === 'recent' ? 'Recientes' : 'Precio'}</Text><Icon name="chevron-down" size={13} color={colors.primary} /></Pressable>
        </View>
        {hasFilters && <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda y filtros" onPress={() => setFilters({ ...defaultFilters })} style={styles.clear}><Text style={styles.clearText}>Limpiar búsqueda y filtros</Text></Pressable>}
        {result.length ? <View style={styles.grid}>{result.map(listing => <View key={listing.id} style={{ width: columns === 3 ? '31.9%' : columns === 2 ? '48.8%' : '100%' }}><PropertyCard listing={listing} /></View>)}</View> : <EmptyState title="Sin coincidencias" description="Prueba otra zona o amplía los filtros para encontrar más viviendas." icon="search-outline" action={<Button label="Ver todas las viviendas" onPress={() => setFilters({ ...defaultFilters })} />} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Publicar una vivienda" onPress={() => router.push('/publish')} style={styles.sellerBanner}>
          <View style={styles.sellerIcon}><Icon name="add" size={25} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>Tu vivienda, aquí.</Text><Text style={styles.sellerText}>Crea tu primer anuncio en unos pasos.</Text></View><Icon name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
        <Notice>Viviendas e imágenes de demostración. Tus anuncios y favoritos se guardan solo en este dispositivo.</Notice>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 }, brandText: { color: colors.ink, fontWeight: '600', fontSize: 15, letterSpacing: -.3 },
  demo: { color: colors.muted, fontSize: 11, backgroundColor: '#EAEAEE', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginLeft: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headline: { fontFamily: typefaces.display, fontSize: 36, lineHeight: 43, fontWeight: '700', letterSpacing: -1.2, color: colors.ink },
  country: { flexDirection: 'row', alignItems: 'center', gap: 4 }, countryText: { fontSize: 14, color: colors.muted },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 4, marginBottom: 22 },
  searchArea: { flexDirection: 'row', gap: 10 }, search: { flex: 1, minHeight: 50, backgroundColor: '#EAEAEE', borderRadius: 15, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 16, color: colors.ink }, clearSearch: { backgroundColor: 'transparent', width: 44 },
  filterButton: { width: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white }, filterActive: { backgroundColor: colors.primary },
  segments: { flexDirection: 'row', borderRadius: 13, padding: 3, backgroundColor: '#EAEAEE', marginTop: 16 }, segment: { flex: 1, minHeight: 44, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.white, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }, segmentText: { fontSize: 13, color: colors.muted, fontWeight: '500' }, segmentTextActive: { fontWeight: '600', color: colors.ink },
  filters: { backgroundColor: colors.white, padding: 18, borderRadius: 20, marginTop: 16, gap: 20, flexDirection: 'row', flexWrap: 'wrap' }, filterPrice: { flex: 1, minWidth: 210 }, filterLabel: { color: colors.ink, fontSize: 15, fontWeight: '600', marginBottom: 10 },
  filterInput: { minHeight: 48, borderRadius: 12, paddingHorizontal: 13, fontSize: 16, color: colors.ink, backgroundColor: colors.paper }, roomOptions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 27, marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -.5 }, resultCount: { fontSize: 13, color: colors.muted, marginTop: 5 },
  sort: { flexDirection: 'row', minHeight: 44, gap: 4, alignItems: 'center' }, sortText: { fontSize: 13, color: colors.primary },
  clear: { minHeight: 44, justifyContent: 'center', marginTop: -8, marginBottom: 6 }, clearText: { color: colors.primary, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%', rowGap: 24 },
  sellerBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: 22, padding: 20, marginTop: 26, marginBottom: 10 },
  sellerIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  sellerTitle: { color: colors.ink, fontSize: 18, fontWeight: '600', letterSpacing: -.3 }, sellerText: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
});
