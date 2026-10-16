import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Sheet } from '../components/Sheet';
import { Button, EmptyState, Icon, IconButton, Notice, PageTitle } from '../components/ui';
import { describeSearch } from '../searches/domain';
import type { SavedSearch } from '../searches/types';
import { useSavedSearches } from '../searches/useSavedSearches';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

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
          <View style={styles.cardCopy}>
            <Text accessibilityRole="header" style={styles.name}>{item.name}</Text>
            <View style={styles.statusRow}><View style={[styles.dot, !item.enabled && styles.pausedDot]} /><Text style={[styles.status, !item.enabled && styles.paused]}>{item.enabled ? 'Avisos activos' : 'Avisos en pausa'}</Text></View>
          </View>
          <Switch accessibilityLabel={`Alerta ${item.name}`} accessibilityHint={item.enabled ? 'Pausar avisos' : 'Activar avisos'} value={item.enabled} disabled={saving} onValueChange={() => void toggle(item)} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.switchThumb} ios_backgroundColor={colors.switchTrack} />
        </View>
        <View accessible accessibilityLabel={`Criterios de búsqueda: ${describeSearch(item.filters)}`} style={styles.criteria}>{describeSearch(item.filters).split(' · ').map(part => <Text key={part} style={styles.chip}>{part}</Text>)}</View>
        <View style={styles.actions}>
          <Button label="Ver resultados" secondary onPress={() => router.push({ pathname: '/', params: { search: item.id } })} style={styles.results} />
          <IconButton name="trash-outline" label={`Borrar alerta ${item.name}`} onPress={() => { if (saving) return; setFailed(false); setDeleting(item); }} style={styles.trash} />
        </View>
      </View>)}
    <Sheet visible={!!deleting} onClose={() => { if (!saving) setDeleting(null); }}>
      <View style={styles.warning}><Icon name="trash-outline" size={22} color={colors.danger} /></View>
      <Text accessibilityRole="header" style={styles.sheetTitle}>¿Borrar esta alerta?</Text>
      <Text style={styles.sheetText}>Dejarás de recibir avisos de «{deleting?.name}».</Text>
      {failed && error ? <Notice error>{error}</Notice> : null}
      <View style={styles.sheetActions}>
        <Button label="Cancelar" secondary disabled={saving} onPress={() => setDeleting(null)} style={styles.sheetAction} />
        <Pressable accessibilityRole="button" accessibilityLabel={failed ? 'Reintentar eliminación de alerta' : 'Borrar alerta'} accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void confirmDelete()} style={({ pressed }) => [styles.dangerFilled, styles.sheetAction, (pressed || saving) && { opacity: .7 }]}>
          {saving ? <ActivityIndicator color={colors.onDark} /> : <Text style={styles.dangerFilledText}>{failed ? 'Reintentar' : 'Borrar'}</Text>}
        </Pressable>
      </View>
    </Sheet>
  </ScrollView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, inset: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12, flexGrow: 1 }, loading: { padding: 40 }, error: { gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: rounded.cardLg, padding: 18, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardCopy: { flex: 1, minWidth: 0, gap: 4 },
  name: { ...typography.section, color: colors.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sol }, pausedDot: { backgroundColor: colors.outline },
  status: { color: colors.amber, fontSize: 13, lineHeight: 18 }, paused: { color: colors.muted },
  criteria: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 13, lineHeight: 18, color: colors.body, backgroundColor: colors.softNeutral, paddingHorizontal: 10, paddingVertical: 5, borderRadius: rounded.pill, overflow: 'hidden' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, results: { flex: 1, minHeight: 44, paddingVertical: 10 }, trash: { backgroundColor: colors.softNeutral },
  warning: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softDanger },
  sheetTitle: { ...typography.sheetTitle, color: colors.ink, marginTop: 4 }, sheetText: { color: colors.body, fontSize: 15, lineHeight: 22 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 10 }, sheetAction: { flex: 1 },
  dangerFilled: { minHeight: 56, borderRadius: rounded.pill, backgroundColor: colors.dangerFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 }, dangerFilledText: { color: colors.onDark, fontSize: 16, lineHeight: 20, fontWeight: '600' },
}));
