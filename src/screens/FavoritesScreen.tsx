import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, PageTitle } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';

export default function FavoritesScreen() {
  const { favoriteIds, listings } = useMarketplace();
  const favorites = listings.filter(item => favoriteIds.includes(item.id) && item.status === 'active');
  const { width } = useWindowDimensions();
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}><PageTitle title="Favoritos" subtitle="Los lugares que quieres tener cerca." />
    {favorites.length ? <View style={styles.grid}>{favorites.map(listing => <View key={listing.id} style={{ width: width >= 720 ? '48.8%' : '100%' }}><PropertyCard listing={listing} /></View>)}</View> : <EmptyState icon="heart-outline" title="Algunos lugares se quedan contigo" description="Toca el corazón de una vivienda y encuéntrala aquí cuando quieras volver a verla." action={<Button label="Descubrir viviendas" onPress={() => router.push('/')} />} />}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 24 } });
