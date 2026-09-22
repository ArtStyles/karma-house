import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropertyCard } from '../components/PropertyCard';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { useFavoriteListings } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import type { Listing } from '../domain/listings';
import { colors, layout } from '../theme';

export default function FavoritesScreen() {
  const { favoriteIds, toggleFavorite, mode, storageError, refresh } = useMarketplace();
  const auth = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [undoing, setUndoing] = useState(false);
  const { listings: favorites, ready } = useFavoriteListings();
  async function reload() { setRefreshing(true); try { await refresh(); } catch { /* Provider exposes the remote error. */ } finally { setRefreshing(false); } }
  const { width } = useWindowDimensions();

  // A tap on the heart used to erase the card in the same frame. Keeping every listing seen this
  // visit, in the order it arrived, leaves the removed ones in place so the tap can be taken back.
  const seen = useRef(new Map<string, Listing>());
  favorites.forEach(listing => seen.current.set(listing.id, listing));
  const visible = new Set(favorites.map(listing => listing.id));
  const cards = [...seen.current.values()].filter(listing => visible.has(listing.id) || !favoriteIds.includes(listing.id));
  const removed = cards.filter(listing => !favoriteIds.includes(listing.id));
  const missing = favoriteIds.length - favorites.length;

  async function undo() {
    // Without the lock a second tap runs the same closure and toggles the restored listings straight back off.
    if (undoing) return;
    setUndoing(true); setUndoError('');
    try { for (const listing of removed) await toggleFavorite(listing.id); }
    catch { setUndoError('No pudimos devolver la vivienda a tus favoritos. Inténtalo de nuevo.'); }
    finally { setUndoing(false); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}><PageTitle title="Favoritos" subtitle="Los lugares que quieres tener cerca." />
    {mode === 'cloud' && auth.ready && !auth.user ? <AccountPrompt returnTo="/favorites" title="Lleva tus favoritos contigo" description="Entra en tu cuenta para guardar viviendas y volver a ellas desde cualquier dispositivo." /> : <>
      {storageError && <><Notice error>{storageError}</Notice><Button label="Volver a cargar" secondary loading={refreshing} onPress={reload} /></>}
      {ready && missing > 0 && <Notice>{missing === 1 ? 'Una vivienda guardada ya no está disponible en el catálogo.' : `${missing} viviendas guardadas ya no están disponibles en el catálogo.`}</Notice>}
      {/* Not a Notice: the undo has to be a real 44 pt target, and Notice renders its children as text. */}
      {removed.length > 0 && <View style={styles.undoRow}>
        <Icon name="information-circle-outline" size={19} color={colors.muted} />
        <Text style={styles.undoText}>{removed.length === 1 ? 'Quitado de favoritos' : `${removed.length} quitados de favoritos`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Deshacer y devolver a favoritos" accessibilityState={{ disabled: undoing }} disabled={undoing} onPress={() => void undo()} style={({ pressed }) => [styles.undoButton, (pressed || undoing) && { opacity: .5 }]}><Text style={styles.undo}>Deshacer</Text></Pressable>
      </View>}
      {undoError ? <Notice error>{undoError}</Notice> : null}
      {!ready ? <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 50 }} /> : cards.length ? <View style={styles.grid}>{cards.map(listing => <View key={listing.id} style={[{ width: width >= 720 ? '48.8%' : '100%' }, !favoriteIds.includes(listing.id) && styles.faded]}><PropertyCard listing={listing} /></View>)}</View> : !storageError ? <EmptyState icon="heart-outline" title="Algunos lugares se quedan contigo" description="Toca el corazón de una vivienda y encuéntrala aquí cuando quieras volver a verla." action={<Button label="Descubrir viviendas" onPress={() => router.push('/')} />} /> : null}
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 24 }, faded: { opacity: .6 }, undoRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 }, undoText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted }, undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }, undo: { color: colors.primary, fontSize: 13, fontWeight: '600' } });
