import {canonicalFavoriteCards} from '../catalog/favoritesController';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropertyCard } from '../components/PropertyCard';
import { Mediopunto } from '../components/Mediopunto';
import { MotionPressable } from '../components/MotionPressable';
import { Button, Icon, Notice, PageTitle } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { useFavoriteListings } from '../catalog/useCatalog';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import type { Listing } from '../domain/listings';
import { createThemedStyles, layout, rounded, typography } from '../theme';
import { listingPresentation, unavailableFavoriteCount } from '../catalog/presentation';

export default function FavoritesScreen() {
  const { colors, styles } = useStyles();
  const { favoriteIds, canonicalFavoriteId, toggleFavorite, mode, storageError, refresh } = useMarketplace();
  const auth = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [undoing, setUndoing] = useState(false);
  const { listings: favorites, ready, error, loading, retry } = useFavoriteListings();
  async function reload() { setRefreshing(true); try { await refresh(); await retry(); } catch { /* Each reader exposes its own error. */ } finally { setRefreshing(false); } }
  const { width } = useWindowDimensions();

  // A tap on the heart used to erase the card in the same frame. Keeping every listing seen this
  // visit, in the order it arrived, leaves the removed ones in place so the tap can be taken back.
  const seen = useRef(new Map<string, Listing>());
  const seenSession = useRef('');
  const sessionKey = `${mode}:${auth.user?.id ?? ''}`;
  if (seenSession.current !== sessionKey) { seen.current.clear(); seenSession.current = sessionKey; }
  seen.current=new Map(canonicalFavoriteCards([...seen.current.values(),...favorites],canonicalFavoriteId).map(listing=>[listing.id,listing]));
  const visible = new Set(favorites.map(listing => listing.id));
  const cards = [...seen.current.values()].filter(listing => visible.has(listing.id) || !favoriteIds.includes(canonicalFavoriteId(listing.id)));
  const removed = cards.filter(listing => !favoriteIds.includes(canonicalFavoriteId(listing.id)));
  const missing = unavailableFavoriteCount(favoriteIds.length, favorites.length, { ready, error });
  const presentation = listingPresentation({ ready, error, hasData: cards.length > 0 });

  async function undo() {
    // Without the lock a second tap runs the same closure and toggles the restored listings straight back off.
    if (undoing) return;
    setUndoing(true); setUndoError('');
    try { for (const listing of removed) await toggleFavorite(listing.id); }
    catch { setUndoError('No pudimos devolver la vivienda a tus favoritos. Inténtalo de nuevo.'); }
    finally { setUndoing(false); }
  }

  const alerts = <MotionPressable accessibilityRole="button" accessibilityLabel="Mis alertas" onPress={() => router.push('/saved-searches')} style={({ pressed }) => [styles.alerts, pressed && { opacity: .7 }]}>
    <Icon name="notifications-outline" size={16} color={colors.sol} /><Text style={styles.alertsText}>Mis alertas</Text>
  </MotionPressable>;
  const saved = favorites.length;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={[styles.content, removed.length > 0 && styles.underToast]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}><PageTitle title="Favoritos" subtitle={saved ? `${saved} ${saved === 1 ? 'vivienda guardada' : 'viviendas guardadas'}` : undefined} right={alerts} />
    {mode === 'cloud' && !auth.ready ? <ActivityIndicator accessibilityLabel="Cargando tu cuenta" color={colors.primary} size="large" style={{ marginTop: 40 }} /> : mode === 'cloud' && !auth.user ? <AccountPrompt returnTo="/favorites" title="Entra para ver tus favoritos" description="Guarda viviendas y consúltalas desde cualquiera de tus dispositivos." /> : <>
      {storageError && <><Notice error>{storageError}</Notice><Button label="Volver a cargar" secondary loading={refreshing} onPress={reload} /></>}
      {error && <View style={{ gap: 8, marginBottom: 16 }}><Notice error>{`No pudimos actualizar tus favoritos. ${error}`}</Notice><Button label="Reintentar favoritos" secondary loading={loading} onPress={() => void retry()} /></View>}
      {ready && missing > 0 && <Notice>{missing === 1 ? 'Una vivienda guardada ya no está disponible en el catálogo.' : `${missing} viviendas guardadas ya no están disponibles en el catálogo.`}</Notice>}
      {presentation === 'loading' ? <ActivityIndicator accessibilityLabel="Cargando favoritos" color={colors.primary} size="large" style={{ marginTop: 50 }} /> : cards.length ? <View style={styles.grid}>{cards.map(listing => <View key={listing.id} style={[{ width: width >= 720 ? '49%' : '100%' }, !favoriteIds.includes(canonicalFavoriteId(listing.id)) && styles.faded]}><PropertyCard listing={listing} offline={!!error} horizontal /></View>)}</View> : presentation === 'empty' && !storageError && missing === 0 && favoriteIds.length === 0 ? <View style={styles.empty}>
        <Mediopunto state="off" width={200} />
        <Text accessibilityRole="header" style={styles.emptyTitle}>Todavía no tienes favoritos.</Text>
        <Text style={styles.emptyText}>En Explorar, toca el corazón de una vivienda para guardarla aquí.</Text>
        <Button label="Ir a Explorar" onPress={() => router.push('/')} style={styles.emptyAction} />
      </View> : missing > 0 ? <Button label="Ir a Explorar" secondary onPress={() => router.push('/')} /> : null}
      {undoError ? <Notice error>{undoError}</Notice> : null}
    </>}
  </ScrollView>
    {/* A toast over the tab bar: removed cards stay in place, so the heart stays under the finger. */}
    {removed.length > 0 && <View style={styles.toast}>
      <Text accessibilityLiveRegion="polite" style={styles.toastText}>{removed.length === 1 ? 'Quitado de favoritos' : `${removed.length} quitados de favoritos`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Deshacer y devolver a favoritos" accessibilityState={{ disabled: undoing }} disabled={undoing} onPress={() => void undo()} style={({ pressed }) => [styles.undoButton, (pressed || undoing) && { opacity: .5 }]}><Text style={styles.undo}>Deshacer</Text></Pressable>
    </View>}
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: layout.tabContentBottom }, underToast: { paddingBottom: 92 },
  alerts: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: rounded.pill, backgroundColor: colors.surface }, alertsText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  empty: { paddingTop: 48, paddingBottom: 32, gap: 14, maxWidth: 380, alignSelf: 'center', alignItems: 'center' },
  emptyTitle: { ...typography.sheetTitle, color: colors.ink, textAlign: 'center', marginTop: 14 }, emptyText: { color: colors.body, fontSize: 15, lineHeight: 22, textAlign: 'center' }, emptyAction: { marginTop: 10, minWidth: 200 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 12 }, faded: { opacity: .6 },
  // The inverted toast: ink ground, and its action in the other mode's blue so it reads on both.
  toast: { position: 'absolute', left: 16, right: 16, bottom: 12, maxWidth: 560, alignSelf: 'center', minHeight: 52, paddingLeft: 20, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: rounded.pill, backgroundColor: colors.inverseSurface, boxShadow: '0 12px 28px rgba(0,0,0,0.35)' },
  toastText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.inverseInk },
  undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }, undo: { color: colors.inversePrimary, fontSize: 15, fontWeight: '700' },
}));
