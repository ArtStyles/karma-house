import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { defaultFilters, filterListings, type ListingFilters } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, typefaces } from '../theme';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, Icon, IconButton, Notice, Pill } from '../components/ui';

export default function ExploreScreen() {
  const { listings } = useMarketplace();
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters });
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const columns = width >= 1060 ? 3 : width >= 700 ? 2 : 1;
  const result = useMemo(() => filterListings(listings, filters), [listings, filters]);
  const hasFilters = !!(filters.query || filters.type !== 'Todas' || filters.maxPrice || filters.minBedrooms);
  const change = (next: Partial<ListingFilters>) => setFilters(old => ({ ...old, ...next }));
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.topbar}>
      <View style={styles.brand}><View style={styles.brandIcon}><Icon name="home" size={21} color={colors.white} /></View><Text style={styles.brandText}>KarmaHouse<Text style={{ color: colors.primary }}>.</Text></Text></View>
      <View style={styles.topRight}><Text style={styles.demo}>DEMO</Text><IconButton name="person-outline" label="Abrir mi espacio" onPress={() => router.push('/profile')} style={styles.avatar} /></View>
    </View>
    <View style={styles.hero}>
      <View style={styles.eyebrow}><View style={styles.greenDot} /><Text style={styles.eyebrowText}>HOGARES REALES. NUEVOS COMIENZOS.</Text></View>
      <Text accessibilityRole="header" style={[styles.headline, width >= 700 && { fontSize: 54 }]}>Tu próximo hogar,{width < 500 ? '\n' : ' '}<Text style={styles.headlineAccent}>más cerca.</Text></Text>
      <Text style={styles.intro}>Compra y vende viviendas en Cuba.{'\n'}Encuentra ese lugar que se siente tuyo.</Text>
    </View>
    <View style={styles.searchArea}>
      <View style={styles.search}><Icon name="search-outline" size={22} color={colors.muted} /><TextInput accessibilityLabel="Buscar por zona o vivienda" placeholder="¿Dónde te gustaría vivir?" placeholderTextColor={colors.muted} style={styles.searchInput} value={filters.query} onChangeText={query => change({ query })} returnKeyType="search" />{filters.query ? <IconButton name="close" label="Borrar búsqueda" onPress={() => change({ query: '' })} /> : null}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir filtros" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={[styles.filterButton, expanded && { backgroundColor: colors.ink }]}><Icon name="options-outline" size={24} color={expanded ? colors.white : colors.ink} /></Pressable>
    </View>
    <View style={styles.chips}><Pill label="Todas" active={filters.type === 'Todas'} onPress={() => change({ type: 'Todas' })} icon="grid-outline" /><Pill label="Casas" active={filters.type === 'Casa'} onPress={() => change({ type: 'Casa' })} icon="home-outline" /><Pill label="Apartamentos" active={filters.type === 'Apartamento'} onPress={() => change({ type: 'Apartamento' })} icon="business-outline" /></View>
    {expanded && <View style={styles.filters}>
      <View style={{ flex: 1, minWidth: 200 }}><Text style={styles.filterLabel}>Precio máximo (USD)</Text><TextInput accessibilityLabel="Precio máximo en USD" style={styles.filterInput} placeholder="Sin límite" placeholderTextColor={colors.muted} keyboardType="numeric" value={filters.maxPrice} onChangeText={maxPrice => change({ maxPrice: maxPrice.replace(/[^0-9]/g, '') })} /></View>
      <View style={{ gap: 8 }}><Text style={styles.filterLabel}>Habitaciones</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>{[0, 1, 2, 3].map(n => <Pill key={n} label={n === 0 ? 'Todas' : `${n}+`} active={filters.minBedrooms === n} onPress={() => change({ minBedrooms: n })} />)}</View></View>
    </View>}
    <View style={styles.resultsHeader}><View><Text accessibilityRole="header" style={styles.sectionTitle}>{hasFilters ? 'Tu búsqueda' : 'Un lugar para empezar'}</Text><Text style={styles.resultCount}>{result.length} {result.length === 1 ? 'vivienda' : 'viviendas'} {hasFilters ? 'en tu búsqueda' : 'de demostración'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cambiar orden de viviendas" onPress={() => change({ sort: filters.sort === 'recent' ? 'price-asc' : 'recent' })} style={styles.sort}><Text style={styles.sortText}>{filters.sort === 'recent' ? 'Recientes' : 'Menor precio'}</Text><Icon name="swap-vertical-outline" size={15} color={colors.muted} /></Pressable></View>
    {hasFilters && <Pressable accessibilityRole="button" onPress={() => setFilters({ ...defaultFilters })} style={styles.clear}><Text style={{ color: colors.primary, fontSize: 13 }}>Limpiar búsqueda y filtros</Text></Pressable>}
    {result.length ? <View style={styles.grid}>{result.map(listing => <View key={listing.id} style={{ width: columns === 3 ? '31.9%' : columns === 2 ? '48.8%' : '100%' }}><PropertyCard listing={listing} /></View>)}</View> : <EmptyState title="Tu hogar puede estar un poco más allá" description="Prueba otra zona o amplía tus filtros para ver más viviendas." icon="search-outline" action={<Button label="Ver todas las viviendas" onPress={() => setFilters({ ...defaultFilters })} />} />}
    <Pressable accessibilityRole="button" onPress={() => router.push('/publish')} style={styles.sellerBanner}><View style={styles.sellerIcon}><Icon name="key-outline" size={29} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={styles.sellerTitle}>El próximo capítulo empieza contigo.</Text><Text style={styles.sellerText}>Dale un nuevo comienzo a tu casa.</Text></View><Icon name="arrow-forward" /></Pressable>
    <Notice>Estás explorando una demo. Las viviendas y sus imágenes son ficticias; los cambios se guardan solo en este dispositivo.</Notice>
    <Text style={styles.footer}>KARMAHOUSE · HECHO PARA ENCONTRARNOS</Text>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 28 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 26 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandIcon: { height: 34, width: 34, backgroundColor: colors.ink, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: colors.ink, fontWeight: '700', letterSpacing: -.8, fontSize: 23 }, topRight: { flexDirection: 'row', gap: 12, alignItems: 'center' }, demo: { color: colors.muted, fontSize: 9, letterSpacing: 1.4, fontWeight: '600' }, avatar: { borderWidth: 1, borderColor: colors.border },
  hero: { paddingTop: 12, paddingBottom: 27 }, eyebrow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 15 }, greenDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green }, eyebrowText: { color: colors.green, fontSize: 9, letterSpacing: 1.2, fontWeight: '600' },
  headline: { fontFamily: typefaces.display, fontSize: 39, lineHeight: 46, letterSpacing: -1.6, color: colors.ink }, headlineAccent: { fontStyle: 'italic', color: colors.primary }, intro: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 16 },
  searchArea: { flexDirection: 'row', gap: 10 }, search: { flex: 1, minHeight: 58, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, minWidth: 0, minHeight: 54, fontSize: 14, color: colors.ink }, filterButton: { width: 58, borderRadius: 14, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white },
  chips: { flexDirection: 'row', gap: 8, marginTop: 15, flexWrap: 'wrap' }, filters: { backgroundColor: '#EEF0ED', padding: 17, borderRadius: 16, marginTop: 18, gap: 18, flexDirection: 'row', flexWrap: 'wrap' }, filterLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 8 }, filterInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 13, color: colors.ink, backgroundColor: colors.white },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 32, marginBottom: 19, flexWrap: 'wrap' }, sectionTitle: { fontSize: 20, fontWeight: '600', color: colors.ink, letterSpacing: -.5 }, resultCount: { fontSize: 12, color: colors.muted, marginTop: 6 }, sort: { flexDirection: 'row', minHeight: 44, gap: 5, alignItems: 'center' }, sortText: { fontSize: 11, color: colors.muted },
  clear: { minHeight: 44, justifyContent: 'center', marginTop: -10, marginBottom: 5 }, grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2%', rowGap: 23 },
  sellerBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#E8EEE7', borderRadius: 18, padding: 20, marginTop: 28, marginBottom: 24, minHeight: 120 }, sellerIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F8FBF6', alignItems: 'center', justifyContent: 'center' }, sellerTitle: { fontFamily: typefaces.display, color: colors.ink, fontSize: 20, lineHeight: 26 }, sellerText: { fontSize: 12, color: colors.muted, marginTop: 7 }, footer: { fontSize: 9, letterSpacing: 1.4, textAlign: 'center', color: '#7A878D', marginTop: 27 },
});
