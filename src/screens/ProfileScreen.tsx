import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, IconButton, Notice, PageTitle, type IconName } from '../components/ui';
import { UserAvatar } from '../components/account/UserAvatar';
import { AgencyVerifiedBadge } from '../components/agencies/AgencyVerifiedBadge';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { PRIVACY_URL, TERMS_URL } from '../lib/publicSite';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, layout } from '../theme';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useSavedSearches } from '../searches/useSavedSearches';
import { setDataSaver, useDataSaver } from '../settings/useDataSaver';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { useIncomingTransferCount } from '../transfers/useIncomingTransferCount';

export default function ProfileScreen() {
  const { colors, styles } = useStyles();
  const { favoriteIds, ownListings: own, mode, refresh: refreshListings } = useMarketplace();
  const { ready: authReady, user, session, displayName, avatarUrl, isAdmin, isOwner, suspended, suspensionReason, signOut, error: authError, refreshProfile } = useAuth();
  const { unreadCount, refresh: refreshMessages } = useMessaging();
  const { unreadCount: notificationUnreadCount, refreshSummary, marking } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const savedSearches = useSavedSearches();
  const dataSaver = useDataSaver();
  const transfers = useIncomingTransferCount();
  const agencies = useAgencyWorkspace();
  const reload = useConsultationRefresh(`${user?.id}:${session?.access_token}`, async () => {
    setError('');
    const outcomes = await Promise.allSettled([refreshProfile(), refreshListings(), refreshMessages(), refreshSummary(), savedSearches.refresh(), agencies.refreshAgencies(), transfers.refresh()]);
    const failed = outcomes.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }, busy || !!marking || !user || mode !== 'cloud', () => setError('No pudimos actualizar toda tu actividad. Desliza hacia abajo para volver a intentarlo.'));
  const refreshSearches = savedSearches.refresh;
  const seen = useRef(false);
  useFocusEffect(useCallback(() => { if (seen.current) void refreshSearches(); seen.current = true; }, [refreshSearches]));
  const principal = agencies.principalAgency;
  const agencyInvitations = user && !principal && (agencies.enabled || agencies.agencies.length > 0);

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy && !!user && mode === 'cloud'} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
      <PageTitle title="Mi espacio" right={<IconButton name="settings-outline" label="Ajustes de cuenta" onPress={() => router.push('/account-settings')} />} />

      {(user || mode === 'demo') && <View style={styles.identity}>
        <UserAvatar size={48} avatarUrl={user ? avatarUrl : null} name={user ? displayName : ''} />
        <View style={styles.identityText}>
          <Text style={styles.heading}>{user ? displayName || 'Mi cuenta' : 'Demostración local'}</Text>
          <Text style={styles.identityDescription}>{mode === 'demo' ? 'Guardado en este dispositivo' : user?.email}</Text>
        </View>
      </View>}

      {/* A device preference stays reachable before any private activity, including for guests. */}
      <View style={styles.group}>
        <View style={[styles.row, styles.dataRow]}>
          <Icon name="cellular-outline" size={21} color={colors.primary} />
          <View style={styles.rowCopy}><Text style={styles.rowTitle}>Ahorro de datos</Text><Text style={styles.rowDescription}>Fotos al tocar; mapa al pedirlo.</Text></View>
          <Switch accessibilityLabel="Ahorro de datos" accessibilityHint="Carga fotos solo cuando las tocas y no descarga el mapa hasta que lo pidas." hitSlop={10} value={dataSaver} onValueChange={setDataSaver} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.onPrimary} ios_backgroundColor={colors.switchTrack} />
        </View>
      </View>

      {mode === 'cloud' && !authReady ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.rowDescription}>Cargando tu cuenta…</Text></View> : mode === 'cloud' && !user ? <View style={styles.guest}>
        <Text accessibilityRole="header" style={styles.guestTitle}>Entra a tu cuenta</Text>
        <Text style={styles.guestText}>Guarda viviendas y consulta tus anuncios y conversaciones.</Text>
        <Button label="Entrar o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo: '/profile' } })} style={styles.guestAction} />
      </View> : null}
      {suspended && <Notice error>Tu cuenta está suspendida. No puedes publicar ni enviar mensajes. {suspensionReason}</Notice>}

      {user && (principal || agencyInvitations || isAdmin) && <>
        <Text style={styles.sectionLabel}>Gestión</Text>
        <View style={styles.group}>
          {principal && <AccountRow icon="business-outline" title={principal.tradeName} description="Inmobiliaria principal" onPress={() => router.push({ pathname: '/agency-workspace', params: { agencyId: principal.id } })}>
            <AgencyVerifiedBadge agencyName={principal.tradeName} verified={principal.verified} principal={principal.isPrincipal} labelled />
          </AccountRow>}
          {agencyInvitations && <AccountRow icon="business-outline" title="Mi inmobiliaria e invitaciones" onPress={() => router.push('/agency-workspace')} />}
          {isAdmin && <AccountRow icon="shield-checkmark-outline" title="Administración" onPress={() => router.push('/administration')} />}
        </View>
      </>}

      {(user || mode === 'demo') && <>
        <Text style={styles.sectionLabel}>Actividad</Text>
        <View style={styles.group}>
          <AccountRow icon="chatbubbles-outline" title="Mensajes" count={unreadCount} unread description={mode === 'demo' ? 'Disponible con una cuenta conectada' : undefined} onPress={() => router.push('/messages')} />
          <AccountRow icon="notifications-outline" title="Notificaciones" count={notificationUnreadCount} unread onPress={() => router.push('/notifications')} />
          <AccountRow icon="calendar-outline" title="Visitas y ofertas" onPress={() => router.push('/requests')} />
        </View>
        <Text style={styles.sectionLabel}>Viviendas</Text>
        <View style={styles.group}>
          <AccountRow icon="home-outline" title="Mis anuncios" count={own.length} onPress={() => router.push('/my-listings')} />
          <AccountRow icon="heart-outline" title="Favoritos" count={favoriteIds.length} onPress={() => router.push('/favorites')} />
          {mode === 'cloud' && <>
            <AccountRow icon="bookmark-outline" title="Mis alertas" count={savedSearches.items.length} onPress={() => router.push('/saved-searches')} />
            {user && own.some(item => item.status === 'active' && item.moderationStatus === 'approved') && <AccountRow icon="person-circle-outline" title="Ver mi perfil público" onPress={() => router.push(`/user/${user.id}`)} />}
          </>}
          {user && !isOwner && <AccountRow icon="swap-horizontal-outline" title="Anuncios por aceptar" count={transfers.count} onPress={() => router.push('/listing-transfers')} />}
        </View>
      </>}

      {user && <>
        <Text style={styles.sectionLabel}>Cuenta</Text>
        <View style={styles.group}>
          <AccountRow icon="notifications-outline" title="Preferencias de notificaciones" onPress={() => router.push('/notification-settings')} />
          <AccountRow icon="log-out-outline" title="Cerrar sesión" danger disabled={busy} loading={busy} onPress={async () => {
            setBusy(true); setError('');
            try { await signOut(); } catch { setError('No pudimos cerrar la sesión. Inténtalo de nuevo.'); } finally { setBusy(false); }
          }} />
        </View>
      </>}
      {mode === 'demo' && <Text style={styles.demoNote}>Esta demo no incluye cuentas, mensajes ni publicaciones públicas.</Text>}
      <View style={styles.legal}>
        <Pressable accessibilityRole="link" style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={styles.legalText}>Privacidad</Text></Pressable>
        <Text style={styles.legalText}>·</Text>
        <Pressable accessibilityRole="link" style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}><Text style={styles.legalText}>Términos de uso</Text></Pressable>
      </View>
      {error || authError ? <Notice error>{error || authError}</Notice> : null}
      {authError && user && <Text style={styles.demoNote}>Desliza hacia abajo para volver a cargar tu perfil y actividad.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function AccountRow({ icon, title, description, count, unread = false, danger = false, disabled = false, loading = false, children, onPress }: {
  icon: IconName; title: string; description?: string; count?: number | null; unread?: boolean; danger?: boolean;
  disabled?: boolean; loading?: boolean; children?: ReactNode; onPress(): void;
}) {
  const { colors, styles } = useStyles();
  const hasCount = count != null && (!unread || count > 0);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}${count != null ? `, ${count}${unread ? ' sin leer' : ''}` : ''}`} accessibilityHint={description} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, styles.accountRow, pressed && styles.pressed]}>
    {loading ? <ActivityIndicator size="small" color={danger ? colors.danger : colors.primary} /> : <Icon name={icon} color={danger ? colors.danger : colors.primary} size={21} />}
    <View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>{children}{description && <Text style={styles.rowDescription}>{description}</Text>}</View>
    {hasCount && <Text style={[styles.count, unread && styles.unread]}>{unread && count! > 99 ? '99+' : count}</Text>}
    {!danger && <Icon name="chevron-forward" size={16} color={colors.muted} />}
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: layout.tabContentBottom },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2, paddingBottom: 20 },
  identityText: { flex: 1, minWidth: 0, gap: 4 }, heading: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  identityDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '500', marginTop: 22, marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 13 },
  accountRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dataRow: { minHeight: 68 }, pressed: { backgroundColor: colors.softBlue }, rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: colors.ink }, rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  count: { color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], minWidth: 22, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 3 },
  unread: { color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 12, fontWeight: '600' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 24 },
  guest: { gap: 14, paddingVertical: 32 }, guestTitle: { fontSize: 23, lineHeight: 29, fontWeight: '600', letterSpacing: -.4, color: colors.ink },
  guestText: { fontSize: 16, lineHeight: 25, color: colors.muted, maxWidth: 350 }, guestAction: { alignSelf: 'flex-start' },
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 },
  legalText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, legalLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  demoNote: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 4, marginTop: 20 },
}));
