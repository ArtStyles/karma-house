import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { ActionGroup, Button, EmptyState, Notice, PageTitle } from '../components/ui';
import { describeSearch } from '../searches/domain';
import type { SavedSearch } from '../searches/types';
import { useSavedSearches } from '../searches/useSavedSearches';
import { createThemedStyles, internalLayout } from '../theme';

export default function SavedSearchesScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}>
    <View style={styles.inset}><PageTitle compact title="Mis alertas" subtitle="Criterios guardados y avisos de nuevas viviendas." back fallback="/profile" /></View>
    {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !auth.user ? <View style={styles.inset}><AccountPrompt returnTo="/saved-searches" title="Guarda tus búsquedas" description="Inicia sesión para recibir un aviso cuando aparezca una vivienda que encaje con tus criterios." /></View>
      : <SavedSearchesBody key={auth.user.id} />}
  </View></SafeAreaView>;
}

function SavedSearchesBody() {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const { items, loading, error, saving, refresh, toggle, remove } = useSavedSearches();
  const [deleting, setDeleting] = useState<SavedSearch | null>(null);
  const [failed, setFailed] = useState(false);
  // The hook starts idle before its first load; an empty list only means «none» once a load has run.
  const started = useRef(false);
  const loaded = useRef(false);
  if (loading) started.current = true;
  if (started.current && !loading) loaded.current = true;
  const ready = loaded.current;
  async function confirmDelete() {
    if (!deleting) return;
    if (await remove(deleting.id)) setDeleting(null); else setFailed(true);
  }
  return <ScrollView alwaysBounceVertical contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading && ready} enabled={!saving && !deleting} onRefresh={() => void refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
    {!!error && !deleting && <View style={styles.error}><Notice error>{error}</Notice><Button label="Volver a cargar" secondary loading={loading} onPress={() => void refresh()} /></View>}
    {!ready && !items.length ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !items.length ? !error && <EmptyState plain title="Sin búsquedas guardadas" description="Guarda una búsqueda desde Explorar para recibir avisos de viviendas que coincidan." action={<Button label="Ir a Explorar" onPress={() => router.navigate('/')} />} />
      : items.map(item => <View key={item.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardCopy}><Text accessibilityRole="header" style={styles.name}>{item.name}</Text><Text style={[styles.status, !item.enabled && styles.paused]}>{item.enabled ? 'Avisos activos' : 'Avisos en pausa'}</Text></View>
          <Switch accessibilityLabel={`Alerta ${item.name}`} accessibilityHint={item.enabled ? 'Pausar avisos' : 'Activar avisos'} value={item.enabled} disabled={saving} onValueChange={() => void toggle(item)} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.onPrimary} ios_backgroundColor={colors.switchTrack} />
        </View>
        <View style={styles.criteria}><Text style={styles.label}>Criterios de búsqueda</Text><Text style={styles.summary}>{describeSearch(item.filters)}</Text></View>
        <ActionGroup>
          <Button label="Ver resultados" icon="search-outline" onPress={() => router.push({ pathname: '/', params: { search: item.id } })} />
          <Button label="Borrar alerta" secondary icon="trash-outline" disabled={saving} onPress={() => { setFailed(false); setDeleting(item); }} />
        </ActionGroup>
      </View>)}
    <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => !saving && setDeleting(null)}>
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>¿Borrar esta alerta?</Text>
          <Text style={styles.sheetText}>Dejarás de recibir avisos de «{deleting?.name}».</Text>
          {failed && error ? <Notice error>{error}</Notice> : null}
          <ActionGroup><Pressable accessibilityRole="button" accessibilityLabel={failed ? 'Reintentar eliminación de alerta' : 'Borrar alerta'} accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void confirmDelete()} style={({ pressed }) => [styles.dangerFilled, (pressed || saving) && { opacity: .7 }]}>
            {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.dangerFilledText}>{failed ? 'Reintentar' : 'Borrar'}</Text>}
          </Pressable>
          <Button label="Cancelar" secondary disabled={saving} onPress={() => setDeleting(null)} /></ActionGroup>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, inset: { paddingHorizontal: internalLayout.gutter },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 16, flexGrow: 1 }, loading: { padding: 40 }, error: { gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: internalLayout.radius, padding: 16, gap: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardCopy: { flex: 1, minWidth: 0, gap: 6 },
  name: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' }, summary: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  status: { color: colors.green, fontSize: 12, lineHeight: 18, fontWeight: '600' }, paused: { color: colors.muted }, criteria: { gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay, justifyContent: 'center', paddingHorizontal: 20 }, sheet: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: internalLayout.radius, overflow: 'hidden' }, sheetContent: { padding: 20, gap: 16 },
  sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 }, sheetText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  dangerFilled: { minHeight: 52, borderRadius: 14, backgroundColor: colors.dangerFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 }, dangerFilledText: { color: colors.onPrimary, fontSize: 16, lineHeight: 23, fontWeight: '600' },
}));
