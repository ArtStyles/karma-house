import { router } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, Notice, PageTitle } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { useFavoriteListings } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';

export default function FavoritesScreen() {
  const { favoriteIds, mode, storageError, refresh } = useMarketplace();
  const auth = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const { listings: favorites, ready } = useFavoriteListings();
  async function reload() { setRefreshing(true); try { await refresh(); } catch { /* Provider exposes the remote error. */ } finally { setRefreshing(false); } }
  const { width } = useWindowDimensions();
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}><PageTitle title="Favoritos" subtitle="Los lugares que quieres tener cerca." />
    {mode === 'cloud' && auth.ready && !auth.user ? <AccountPrompt returnTo="/favorites" title="Lleva tus favoritos contigo" description="Entra en tu cuenta para guardar viviendas y volver a ellas desde cualquier dispositivo." /> : <>
      {storageError && <><Notice error>{storageError}</Notice><Button label="Volver a cargar" secondary loading={refreshing} onPress={reload} /></>}
      {!ready ? <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 50 }} /> : favorites.length ? <View style={styles.grid}>{favorites.map(listing => <View key={listing.id} style={{ width: width >= 720 ? '48.8%' : '100%' }}><PropertyCard listing={listing} /></View>)}</View> : !storageError ? <EmptyState icon="heart-outline" title="Algunos lugares se quedan contigo" description="Toca el corazón de una vivienda y encuéntrala aquí cuando quieras volver a verla." action={<Button label="Descubrir viviendas" onPress={() => router.push('/')} />} /> : null}
      {ready && favoriteIds.length > favorites.length && <Notice>Algunas viviendas guardadas ya no están disponibles en el catálogo.</Notice>}
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 24 } });
