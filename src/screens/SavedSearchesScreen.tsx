import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Notice, PageTitle } from '../components/ui';
import { describeSearch } from '../searches/domain';
import type { SavedSearch } from '../searches/types';
import { useSavedSearches } from '../searches/useSavedSearches';
import { colors } from '../theme';

export default function SavedSearchesScreen() {
  const auth = useAuth();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}>
    <View style={styles.inset}><PageTitle title="Mis alertas" subtitle="Búsquedas guardadas que te avisan" back fallback="/profile" /></View>
    {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !auth.user ? <View style={styles.inset}><AccountPrompt returnTo="/saved-searches" title="Entérate primero" description="Inicia sesión para guardar tus búsquedas y recibir un aviso cuando aparezca una vivienda que encaje." /></View>
      : <SavedSearchesBody key={auth.user.id} />}
  </View></SafeAreaView>;
}

function SavedSearchesBody() {
  const { items, loading, error, saving, refresh, toggle, remove } = useSavedSearches();
  const [deleting, setDeleting] = useState<SavedSearch | null>(null);
  const [failed, setFailed] = useState(false);
  // The hook starts idle before its first load; an empty list only means «none» once a load has run.
  const started = useRef(false);
  if (loading) started.current = true;
  const ready = started.current && !loading;
  async function confirmDelete() {
    if (!deleting) return;
    if (await remove(deleting.id)) setDeleting(null); else setFailed(true);
  }
  return <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading && ready} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {!!error && !deleting && <View style={styles.error}><Notice error>{error}</Notice><Button label="Volver a cargar" secondary loading={loading} onPress={() => void refresh()} /></View>}
    {!ready && !items.length ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !items.length ? !error && <EmptyState icon="bookmark-outline" title="Sin alertas todavía" description="Guarda una búsqueda desde Explorar y te avisaremos." action={<Button label="Ir a Explorar" onPress={() => router.navigate('/')} />} />
      : items.map(item => <View key={item.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardCopy}><Text style={styles.name}>{item.name}</Text><Text style={styles.summary}>{describeSearch(item.filters)}</Text></View>
          <Switch accessibilityLabel={`Alerta ${item.name}`} accessibilityHint={item.enabled ? 'Pausar avisos' : 'Activar avisos'} value={item.enabled} disabled={saving} onValueChange={() => void toggle(item)} trackColor={{ false: '#DADCE2', true: colors.primary }} thumbColor={colors.white} ios_backgroundColor="#DADCE2" />
        </View>
        <Text style={[styles.status, !item.enabled && styles.paused]}>{item.enabled ? 'Activa' : 'En pausa'}</Text>
        <View style={styles.actions}>
          <Button label="Ver resultados" secondary icon="search-outline" onPress={() => router.push({ pathname: '/', params: { search: item.id } })} style={styles.action} />
          <Button label="Borrar" secondary icon="trash-outline" disabled={saving} onPress={() => { setFailed(false); setDeleting(item); }} style={styles.action} />
        </View>
      </View>)}
    <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => !saving && setDeleting(null)}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>¿Borrar esta alerta?</Text>
          <Text style={styles.sheetText}>Dejarás de recibir avisos de «{deleting?.name}».</Text>
          {failed && error ? <Notice error>{error}</Notice> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void confirmDelete()} style={({ pressed }) => [styles.dangerFilled, (pressed || saving) && { opacity: .7 }]}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.dangerFilledText}>{failed ? 'Reintentar' : 'Borrar'}</Text>}
          </Pressable>
          <Button label="Cancelar" secondary disabled={saving} onPress={() => setDeleting(null)} />
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { flex: 1, width: '100%', maxWidth: 740, alignSelf: 'center' }, inset: { paddingHorizontal: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 12, flexGrow: 1 }, loading: { padding: 40 }, error: { gap: 8 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#E5ECF5', borderRadius: 22, padding: 18, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cardCopy: { flex: 1, gap: 4 },
  name: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' }, summary: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  status: { color: colors.green, fontSize: 12, fontWeight: '600' }, paused: { color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flexGrow: 1, flexBasis: 140 },
  backdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'center', padding: 16 }, sheet: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.white, borderRadius: 28, padding: 24, gap: 16 },
  sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 }, sheetText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  dangerFilled: { minHeight: 52, borderRadius: 18, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, dangerFilledText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
