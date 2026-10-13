import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { PushDeviceCard } from '../components/notifications/PushDeviceCard';
import { ActionGroup, Button, EmptyState, Icon, type IconName, Notice, PageTitle } from '../components/ui';
import { notificationErrorMessage } from '../notifications/domain';
import { reconcileNotificationPreferenceDraft, sameNotificationChoices } from '../notifications/preferenceDraft';
import { useNotifications } from '../notifications/NotificationsProvider';
import type { NotificationPreferences } from '../notifications/types';
import { createThemedStyles, internalLayout } from '../theme';

export default function NotificationSettingsScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const store = useNotifications();
  const formDirty=useRef(false),formLocked=useRef(false);
  const reload=useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}`,store.loadPreferences,()=>formDirty.current||formLocked.current||store.savingPreferences||store.preferencesLoading||!auth.user||!store.available);
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!!auth.user&&!store.savingPreferences&&!formDirty.current} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
      <PageTitle compact title="Tus avisos" subtitle="Preferencias y permisos de notificaciones." back fallback="/notifications" />
      {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
        : !store.available ? <EmptyState plain title="Preferencias no disponibles" description="Las preferencias estarán disponibles con el servicio conectado." />
        : !auth.user ? <AccountPrompt returnTo="/notification-settings" title="Avisos a tu medida" description="Inicia sesión para elegir los avisos de mensajes, visitas y ofertas que quieres recibir." />
        : <View style={styles.form}><PushDeviceCard /><PreferencesBody key={auth.user.id} userId={auth.user.id} dirty={formDirty} locked={formLocked} refreshing={reload.isRefreshing} /></View>}
    </ScrollView>
  </SafeAreaView>;
}

type PreferenceRefreshGuard={dirty:RefObject<boolean>;locked:RefObject<boolean>;refreshing():boolean};
function PreferencesBody({ userId, ...guard }: { userId: string }&PreferenceRefreshGuard) {
  const { colors, styles } = useStyles();
  const store = useNotifications();
  const active = useMessagingActivity();
  const { loadPreferences } = store;
  useEffect(() => { if (active) void loadPreferences().catch(() => {}); }, [active, loadPreferences]);
  if (!store.preferences) return <View style={styles.form}>
    {store.preferencesLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : <Notice error>{store.preferencesError || 'No se pudieron cargar tus preferencias.'} Desliza hacia abajo para volver a consultarlas.</Notice>}
  </View>;
  return <PreferencesForm userId={userId} preferences={store.preferences} {...guard} />;
}

function PreferencesForm({ userId, preferences, dirty, locked, refreshing }: { userId: string; preferences: NotificationPreferences }&PreferenceRefreshGuard) {
  const { colors, styles } = useStyles();
  const store = useNotifications();
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(false);
  const [issue, setIssue] = useState('');
  const previous = useRef(preferences);
  const mounted = useRef(true);
  const actor = useRef(store.userId); actor.current = store.userId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const old = previous.current;
    previous.current = preferences;
    // Refresh clean forms without overwriting deliberate unsaved choices or their version.
    setDraft(value => reconcileNotificationPreferenceDraft(value, old, preferences));
  }, [preferences]);
  const changed = !sameNotificationChoices(draft, preferences);
  dirty.current=changed;
  const busy = store.savingPreferences || store.preferencesLoading;
  const checkpoint = () => { if (!mounted.current || actor.current !== userId) throw new Error('KH_ACCOUNT_CHANGED'); };
  function change(key: 'messages' | 'visits' | 'offers' | 'alerts' | 'agencies', value: boolean) {
    if (busy) return;
    setDraft(current => ({ ...current, [key]: value })); setSaved(false); setIssue('');
  }
  async function save() {
    if (locked.current || refreshing() || busy || !changed) return;
    locked.current = true; setSaved(false); setIssue('');
    try {
      checkpoint();
      const result = await store.savePreferences({ messages: draft.messages, visits: draft.visits, offers: draft.offers, alerts: draft.alerts, agencies: draft.agencies, expectedVersion: draft.version });
      checkpoint(); setDraft(result); setSaved(true);
    } catch (error) {
      if (mounted.current && actor.current === userId) setIssue(notificationErrorMessage(error));
    } finally { locked.current = false; }
  }
  function discardChanges() {
    if (busy) return;
    setDraft(preferences); setSaved(false); setIssue('');
  }
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.groupLabel}>Categorías de avisos</Text>
    <View style={styles.card}>
      <PreferenceRow label="Mensajes" description="Aviso en tu teléfono cuando alguien te escriba. El chat marca siempre los no leídos." icon="chatbubble-outline" value={draft.messages} disabled={busy} onChange={value => change('messages', value)} />
      <PreferenceRow label="Visitas" description="Propuestas de visita y cambios en su estado." icon="calendar-outline" value={draft.visits} disabled={busy} onChange={value => change('visits', value)} />
      <PreferenceRow label="Ofertas" description="Ofertas de compra y novedades de la negociación." icon="pricetag-outline" value={draft.offers} disabled={busy} onChange={value => change('offers', value)} />
      <PreferenceRow label="Alertas de búsqueda" description="Cuando se publique una vivienda que encaje con tus búsquedas guardadas o tu busco, y cuando alguien busque lo que publicas." icon="search-outline" value={draft.alerts} disabled={busy} onChange={value => change('alerts', value)} />
      <PreferenceRow label="Agencias" description="Equipo, verificación, cierres y recordatorios de tus agencias." icon="business-outline" value={draft.agencies} disabled={busy} onChange={value => change('agencies', value)} last />
    </View>
    <Text style={styles.footnote}>Desactivar una categoría evita sus próximos avisos. Tu bandeja recoge visitas, ofertas, alertas de búsqueda y avisos de agencias; los mensajes se consultan en el chat.</Text>
    {!!(issue || store.preferencesError) && <Notice error>{issue || store.preferencesError}</Notice>}
    {saved && <View accessibilityLiveRegion="polite" style={styles.success}><Icon name="checkmark-circle" color={colors.green} size={19} /><Text style={styles.successText}>Preferencias guardadas.</Text></View>}
    <ActionGroup><Button label="Guardar preferencias" onPress={() => void save()} loading={store.savingPreferences} disabled={busy || !changed} />
    {changed && <Button label="Descartar cambios" secondary disabled={busy} onPress={discardChanges} />}</ActionGroup>
  </View>;
}

function PreferenceRow({ label, description, icon, value, disabled, onChange, last = false }: {
  label: string; description: string; icon: IconName; value: boolean; disabled: boolean; onChange(value: boolean): void; last?: boolean;
}) {
  const { colors, styles } = useStyles();
  return <View style={[styles.row, !last && styles.rowBorder]}>
    <View style={styles.rowTop}><View style={styles.rowIcon}><Icon name={icon} color={colors.primary} size={20} /></View><Text style={styles.rowTitle}>{label}</Text><Switch accessibilityLabel={`Avisos de ${label.toLowerCase()}`} accessibilityHint={description} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.onPrimary} ios_backgroundColor={colors.switchTrack} /></View>
    <Text style={styles.rowDescription}>{description}</Text>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 36, gap: 20 }, loading: { padding: 40 }, form: { gap: 20 },
  groupLabel: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2, marginBottom: -4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: internalLayout.radius, paddingHorizontal: 16 }, row: { paddingVertical: 16, gap: 8 }, rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, rowIcon: { width: 24, alignItems: 'center', justifyContent: 'center' }, rowTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.ink }, rowDescription: { color: colors.muted, fontSize: 14, lineHeight: 21 }, footnote: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  success: { flexDirection: 'row', alignItems: 'center', gap: 8 }, successText: { flex: 1, color: colors.green, fontSize: 14, lineHeight: 21 },
}));
