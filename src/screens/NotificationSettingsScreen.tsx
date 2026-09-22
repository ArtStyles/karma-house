import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { PushDeviceCard } from '../components/notifications/PushDeviceCard';
import { Button, EmptyState, Icon, type IconName, Notice, PageTitle } from '../components/ui';
import { notificationErrorMessage } from '../notifications/domain';
import { reconcileNotificationPreferenceDraft, sameNotificationChoices } from '../notifications/preferenceDraft';
import { useNotifications } from '../notifications/NotificationsProvider';
import type { NotificationPreferences } from '../notifications/types';
import { colors } from '../theme';

export default function NotificationSettingsScreen() {
  const auth = useAuth();
  const store = useNotifications();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Tus avisos" subtitle="Tus novedades, a tu manera." back fallback="/notifications" />
      {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
        : !store.available ? <EmptyState icon="notifications-outline" title="Avisos a tu medida" description="Las preferencias estarán disponibles cuando conectes una cuenta." />
        : !auth.user ? <AccountPrompt returnTo="/notification-settings" title="Avisos a tu medida" description="Inicia sesión para elegir los avisos de mensajes, visitas y ofertas que quieres recibir." />
        : <View style={styles.form}><PushDeviceCard /><PreferencesBody key={auth.user.id} userId={auth.user.id} /></View>}
    </ScrollView>
  </SafeAreaView>;
}

function PreferencesBody({ userId }: { userId: string }) {
  const store = useNotifications();
  const active = useMessagingActivity();
  const { loadPreferences } = store;
  useEffect(() => { if (active) void loadPreferences().catch(() => {}); }, [active, loadPreferences]);
  if (!store.preferences) return <View style={styles.form}>
    {store.preferencesLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : <><Notice error>{store.preferencesError || 'No se pudieron cargar tus preferencias.'}</Notice><Button label="Volver a cargar preferencias" secondary onPress={() => void loadPreferences().catch(() => {})} /></>}
  </View>;
  return <PreferencesForm userId={userId} preferences={store.preferences} />;
}

function PreferencesForm({ userId, preferences }: { userId: string; preferences: NotificationPreferences }) {
  const store = useNotifications();
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(false);
  const [issue, setIssue] = useState('');
  const previous = useRef(preferences);
  const mounted = useRef(true);
  const actor = useRef(store.userId); actor.current = store.userId;
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const old = previous.current;
    previous.current = preferences;
    // Refresh clean forms without overwriting deliberate unsaved choices or their version.
    setDraft(value => reconcileNotificationPreferenceDraft(value, old, preferences));
  }, [preferences]);
  const changed = !sameNotificationChoices(draft, preferences);
  const busy = store.savingPreferences || store.preferencesLoading;
  const checkpoint = () => { if (!mounted.current || actor.current !== userId) throw new Error('KH_ACCOUNT_CHANGED'); };
  function change(key: 'messages' | 'visits' | 'offers', value: boolean) {
    if (busy) return;
    setDraft(current => ({ ...current, [key]: value })); setSaved(false); setIssue('');
  }
  async function save() {
    if (locked.current || busy || !changed) return;
    locked.current = true; setSaved(false); setIssue('');
    try {
      checkpoint();
      const result = await store.savePreferences({ messages: draft.messages, visits: draft.visits, offers: draft.offers, expectedVersion: draft.version });
      checkpoint(); setDraft(result); setSaved(true);
    } catch (error) {
      if (mounted.current && actor.current === userId) setIssue(notificationErrorMessage(error));
    } finally { locked.current = false; }
  }
  function reload() {
    if (busy) return;
    setDraft(preferences); setSaved(false); setIssue('');
    void store.loadPreferences().catch(() => {});
  }
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.groupLabel}>Lo que quieres recibir</Text>
    <View style={styles.card}>
      <PreferenceRow label="Mensajes" description="Aviso en tu teléfono cuando alguien te escriba. El chat marca siempre los no leídos." icon="chatbubble-outline" value={draft.messages} disabled={busy} onChange={value => change('messages', value)} />
      <PreferenceRow label="Visitas" description="Propuestas de visita y cambios en su estado." icon="calendar-outline" value={draft.visits} disabled={busy} onChange={value => change('visits', value)} />
      <PreferenceRow label="Ofertas" description="Ofertas de compra y novedades de la negociación." icon="pricetag-outline" value={draft.offers} disabled={busy} onChange={value => change('offers', value)} last />
    </View>
    <Text style={styles.footnote}>Desactivar una categoría evita sus próximos avisos. Tu bandeja recoge visitas y ofertas; los mensajes se consultan en el chat.</Text>
    {!!(issue || store.preferencesError) && <Notice error>{issue || store.preferencesError}</Notice>}
    {saved && <View accessibilityLiveRegion="polite" style={styles.success}><Icon name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.successText}>Preferencias guardadas.</Text></View>}
    <Button label="Guardar preferencias" onPress={() => void save()} loading={store.savingPreferences} disabled={busy || !changed} />
    {(changed || !!store.preferencesError) && <Button label={changed ? 'Descartar cambios y actualizar' : 'Actualizar preferencias'} secondary disabled={busy} onPress={reload} />}
  </View>;
}

function PreferenceRow({ label, description, icon, value, disabled, onChange, last = false }: {
  label: string; description: string; icon: IconName; value: boolean; disabled: boolean; onChange(value: boolean): void; last?: boolean;
}) {
  return <View style={[styles.row, !last && styles.rowBorder]}>
    <View style={styles.rowTop}><View style={styles.rowIcon}><Icon name={icon} color={colors.primary} size={20} /></View><Text style={styles.rowTitle}>{label}</Text><Switch accessibilityLabel={`Avisos de ${label.toLowerCase()}`} accessibilityHint={description} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: '#DADCE2', true: colors.primary }} thumbColor={colors.white} ios_backgroundColor="#DADCE2" /></View>
    <Text style={styles.rowDescription}>{description}</Text>
  </View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 36 }, loading: { padding: 40 }, form: { gap: 18 },
  groupLabel: { color: colors.ink, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginBottom: -6, paddingHorizontal: 3 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#E5ECF5', borderRadius: 24, paddingHorizontal: 18 }, row: { paddingVertical: 19, gap: 10 }, rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' }, rowTitle: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: colors.ink }, rowDescription: { color: colors.muted, fontSize: 13, lineHeight: 20 }, footnote: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingHorizontal: 3 },
  success: { flexDirection: 'row', alignItems: 'center', gap: 8 }, successText: { flex: 1, color: colors.green, fontSize: 14, lineHeight: 21 },
});
