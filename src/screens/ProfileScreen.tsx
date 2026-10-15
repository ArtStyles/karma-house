import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, IconButton, Notice, PageTitle, type IconName } from '../components/ui';
import { UserAvatar } from '../components/account/UserAvatar';
import { ProBadge } from '../components/ProBadge';
import { usePro } from '../pro/usePro';
import { formatProDate, isProActive } from '../pro/domain';
import { AgencyVerifiedBadge } from '../components/agencies/AgencyVerifiedBadge';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { PRIVACY_URL, TERMS_URL } from '../lib/publicSite';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { createThemedStyles, internalLayout, layout } from '../theme';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useSavedSearches } from '../searches/useSavedSearches';
import { setDataSaver, useDataSaver } from '../settings/useDataSaver';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { loadAgencyOverview, type AgencyOverview } from '../agencies/screenRequests';
import { agencyStateLabel } from '../agencies/registration';
import { agencyRoleLabel } from './AgencyWorkspaceScreen';
import { useIncomingTransferCount } from '../transfers/useIncomingTransferCount';
import { UpdateSheet } from '../components/UpdateSheet';
import { formatSize } from '../updates/release';
import { useAppUpdate } from '../updates/useAppUpdate';

export default function ProfileScreen() {
  const { colors, styles } = useStyles();
  const { favoriteIds, ownListings: own, mode, refresh: refreshListings } = useMarketplace();
  const { ready: authReady, user, session, displayName, avatarUrl, isAdmin, isOwner, suspended, suspensionReason, signOut, error: authError, refreshProfile } = useAuth();
  const { unreadCount, refresh: refreshMessages } = useMessaging();
  const { unreadCount: notificationUnreadCount, refreshSummary, marking } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountCode, setAccountCode] = useState<{ id: string; copied: boolean } | null>(null);
  const savedSearches = useSavedSearches();
  const dataSaver = useDataSaver();
  const transfers = useIncomingTransferCount();
  const agencies = useAgencyWorkspace();
  const pro = usePro();
  const update = useAppUpdate();
  const [updateSheet, setUpdateSheet] = useState(false);
  const [overview, setOverview] = useState<{ userId: string; value: AgencyOverview } | null>(null);
  const agencyIds = agencies.agencies.map(agency => agency.id).join(',');
  const { repository: agencyRepository, ready: agenciesReady, enabled: agenciesEnabled, captureAccountContext, getCurrentWorkspace } = agencies;
  const overviewRef = useRef(overview), overviewSequence = useRef(0);
  overviewRef.current = overview;
  // Roles, pending invitations and an application under review, so each person lands where they work.
  // It reads the agencies at call time and only the latest call may write, so a slow older load cannot win.
  const loadOverview = useCallback(async () => {
    if (!agencyRepository || !agenciesReady) return;
    const sequence = ++overviewSequence.current, workspace = getCurrentWorkspace();
    if (!workspace.enabled && !workspace.agencies.length) { setOverview(null); return; }
    let context: ReturnType<typeof captureAccountContext>;
    try { context = captureAccountContext(); } catch { return; }
    try {
      const previous = overviewRef.current?.userId === context.userId ? overviewRef.current.value : null;
      const value = await loadAgencyOverview(agencyRepository, workspace.agencies.map(agency => agency.id), context, previous);
      if (sequence === overviewSequence.current) setOverview({ userId: context.userId, value });
    } catch { /* The account changed; the next focus loads the new one. */ } finally { context.release(); }
    // agencyIds and agenciesEnabled only re-run the load when the list changes; the values come from the snapshot.
  }, [agencyRepository, agenciesReady, agenciesEnabled, agencyIds, captureAccountContext, getCurrentWorkspace]);
  useFocusEffect(useCallback(() => { void loadOverview(); }, [loadOverview]));
  const reload = useConsultationRefresh(`${user?.id}:${session?.access_token}`, async () => {
    setError('');
    const outcomes = await Promise.allSettled([refreshProfile(), refreshListings(), refreshMessages(), refreshSummary(), savedSearches.refresh(), agencies.refreshAgencies().then(() => loadOverview()), transfers.refresh(), pro.reload()]);
    const failed = outcomes.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }, busy || !!marking || !user || mode !== 'cloud', () => setError('No pudimos actualizar toda tu actividad.'));
  const refreshSearches = savedSearches.refresh;
  const seen = useRef(false);
  useFocusEffect(useCallback(() => { if (seen.current) void refreshSearches(); seen.current = true; }, [refreshSearches]));
  // The account id is what an agency pastes into «Invitar a una persona».
  async function shareAccountCode(id: string) {
    setAccountCode({ id, copied: false });
    try {
      if (Platform.OS === 'web') { await navigator.clipboard.writeText(id); setAccountCode({ id, copied: true }); }
      else await Share.share({ message: `Mi código de cuenta en KarmaHouse: ${id}` });
    } catch { /* Dismissed or no clipboard: the code stays on screen to copy by hand. */ }
  }
  const mine = overview && overview.userId === user?.id ? overview.value : null;
  // Pro is shown only to its holder, here; listings and the public profile carry no label.
  const personalPro = isProActive(pro.status?.personalUntil ?? null) ? pro.status!.personalUntil! : null;
  const agencyPro = pro.status?.agencies.find(agency => isProActive(agency.until));
  const proDetail = personalPro ? `Activo hasta el ${formatProDate(personalPro)}` : agencyPro ? `Activo para ${agencyPro.tradeName} hasta el ${formatProDate(agencyPro.until!)}` : undefined;
  const myAgencies = [...agencies.agencies].sort((a, b) => Number(b.isPrincipal) - Number(a.isPrincipal));
  const pendingInvitations = mine?.pendingInvitations ?? 0;
  // An applicant joins the agency only once it is approved; until then the application is the way in.
  const application = mine?.application && !agencies.agencies.some(agency => agency.id === mine.application!.agency.id) ? mine.application.agency : null;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy && !!user && mode === 'cloud'} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
      <PageTitle title="Mi espacio" right={<IconButton name="settings-outline" label="Ajustes de cuenta" onPress={() => router.push('/account-settings')} />} />

      {/* Name and photo are edited in Ajustes de cuenta, so the identity opens it. */}
      {(user || mode === 'demo') && <Pressable disabled={!user} accessibilityRole={user ? 'button' : undefined} accessibilityLabel={user ? `${displayName || 'Mi cuenta'}${proDetail ? ', cuenta Pro' : ''}, ${user.email ?? ''}. Editar nombre y foto` : undefined} onPress={() => router.push('/account-settings')} style={({ pressed }) => [styles.identity, pressed && { opacity: .7 }]}>
        <UserAvatar size={48} avatarUrl={user ? avatarUrl : null} name={user ? displayName : ''} />
        <View style={styles.identityText}>
          <Text style={styles.heading}>{user ? displayName || 'Mi cuenta' : 'Demostración local'}</Text>
          {user && proDetail && <ProBadge decorative />}
          <Text style={styles.identityDescription}>{mode === 'demo' ? 'Guardado en este dispositivo' : user?.email}</Text>
        </View>
        {user && <Icon name="chevron-forward" size={16} color={colors.muted} />}
      </Pressable>}

      {/* Android only: a newer APK on karmahouse.site, for guests too. Nothing downloads until the sheet asks. */}
      {update.release && <View style={[styles.group, styles.updateGroup]}>
        <AccountRow icon="cloud-download-outline" title={`Nueva versión ${update.release.version}`} dot={update.pending} onPress={() => setUpdateSheet(true)}
          description={update.phase === 'downloading' ? `Descargando… ${update.percent} %` : update.downloaded ? 'Lista para instalar' : `${formatSize(update.release.size)} · Mira qué cambia`} />
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
        <Text accessibilityRole="header" style={styles.guestTitle}>Entra en tu cuenta</Text>
        <Text style={styles.guestText}>Guarda viviendas y consulta tus anuncios y conversaciones.</Text>
        <Button label="Entrar o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo: '/profile' } })} style={styles.guestAction} />
      </View> : null}
      {suspended && <Notice error>Tu cuenta está suspendida. No puedes publicar ni enviar mensajes. {suspensionReason}</Notice>}
      {user && !suspended && !!agencies.error && <Notice error onRetry={() => void reload.refresh()}>{`No pudimos cargar tus inmobiliarias. ${agencies.error}`}</Notice>}

      {user && (myAgencies.length > 0 || pendingInvitations > 0 || application || isAdmin) && <>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Gestión</Text>
        <View style={styles.group}>
          {myAgencies.map(agency => {
            const role = mine?.roles[agency.id];
            const detail = [role && agencyRoleLabel[role], agency.state !== 'approved' && agencyStateLabel[agency.state]].filter(Boolean).join(' · ');
            return <AccountRow key={agency.id} icon="business-outline" title={agency.tradeName} description={detail || undefined} extraLabel={agency.verified ? (agency.isPrincipal ? 'Inmobiliaria principal' : 'Inmobiliaria verificada por KarmaHouse') : undefined} onPress={() => router.push({ pathname: '/agency-workspace', params: { agencyId: agency.id } })}>
              <AgencyVerifiedBadge agencyName={agency.tradeName} verified={agency.verified} principal={agency.isPrincipal} labelled />
            </AccountRow>;
          })}
          {pendingInvitations > 0 && <AccountRow icon="mail-unread-outline" title="Invitaciones de inmobiliarias" count={pendingInvitations} unread onPress={() => router.push('/agency-team')} />}
          {application && <AccountRow icon="document-text-outline" title={`Solicitud de ${application.tradeName}`} description={agencyStateLabel[application.state]} onPress={() => router.push('/agency-application')} />}
          {isAdmin && <AccountRow icon="shield-checkmark-outline" title="Administración" onPress={() => router.push('/administration')} />}
        </View>
      </>}

      {(user || mode === 'demo') && <>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Actividad</Text>
        <View style={styles.group}>
          <AccountRow icon="chatbubbles-outline" title="Mensajes" count={unreadCount} unread description={mode === 'demo' ? 'Disponible con una cuenta conectada' : undefined} onPress={() => router.push('/messages')} />
          <AccountRow icon="notifications-outline" title="Notificaciones" count={notificationUnreadCount} unread onPress={() => router.push('/notifications')} />
          <AccountRow icon="calendar-outline" title="Visitas y ofertas" onPress={() => router.push('/requests')} />
        </View>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Viviendas</Text>
        <View style={styles.group}>
          <AccountRow icon="home-outline" title="Mis anuncios" count={own.length} onPress={() => router.push('/my-listings')} />
          <AccountRow icon="heart-outline" title="Favoritos" count={favoriteIds.length} onPress={() => router.push('/favorites')} />
          {mode === 'cloud' && <>
            <AccountRow icon="bookmark-outline" title="Mis alertas" count={savedSearches.items.length} onPress={() => router.push('/saved-searches')} />
            {user && <AccountRow icon="person-circle-outline" title="Ver mi perfil público" onPress={() => router.push(`/user/${user.id}`)} />}
          </>}
          {/* Always reachable from Mis anuncios; here only when something waits. */}
          {user && !isOwner && (transfers.count ?? 0) > 0 && <AccountRow icon="swap-horizontal-outline" title="Anuncios por aceptar" count={transfers.count} onPress={() => router.push('/listing-transfers')} />}
        </View>
      </>}

      {user && <>
        <Text accessibilityRole="header" style={styles.sectionLabel}>Cuenta</Text>
        <View style={styles.group}>
          <AccountRow icon="id-card-outline" title="Mi código de cuenta" description="Compártelo con una inmobiliaria para que te invite a su equipo." extraLabel={accountCode?.id === user.id ? user.id : undefined} onPress={() => void shareAccountCode(user.id)}>
            {accountCode?.id === user.id && <Text selectable style={styles.code}>{user.id}</Text>}
          </AccountRow>
          <AccountRow icon="star-outline" title="KarmaHouse Pro" description={proDetail} onPress={() => router.push('/pro')} />
          <AccountRow icon="log-out-outline" title="Cerrar sesión" danger disabled={busy} loading={busy} onPress={async () => {
            setBusy(true); setError('');
            try { await signOut(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cerrar la sesión. Inténtalo de nuevo.'); } finally { setBusy(false); }
          }} />
        </View>
        {/* A live region, so screen readers hear the copy on the web too. */}
        {accountCode?.id === user.id && accountCode.copied && <Text accessibilityLiveRegion="polite" style={styles.copied}>Código copiado. Pégalo en un mensaje a la inmobiliaria.</Text>}
      </>}
      {mode === 'demo' && <Text style={styles.demoNote}>Esta demo no incluye cuentas, mensajes ni publicaciones públicas.</Text>}
      <View style={styles.legal}>
        <Pressable accessibilityRole="link" style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={styles.legalText}>Política de privacidad</Text></Pressable>
        <Text style={styles.legalText}>·</Text>
        <Pressable accessibilityRole="link" style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}><Text style={styles.legalText}>Términos de uso</Text></Pressable>
      </View>
      {error || authError ? <Notice error onRetry={user ? () => void reload.refresh() : undefined}>{error || authError}</Notice> : null}
    </ScrollView>
    <UpdateSheet visible={updateSheet} onClose={() => setUpdateSheet(false)} />
  </SafeAreaView>;
}

function AccountRow({ icon, title, description, extraLabel, count, unread = false, dot = false, danger = false, disabled = false, loading = false, children, onPress }: {
  icon: IconName; title: string; description?: string; extraLabel?: string; count?: number | null; unread?: boolean; dot?: boolean; danger?: boolean;
  disabled?: boolean; loading?: boolean; children?: ReactNode; onPress(): void;
}) {
  const { colors, styles } = useStyles();
  const hasCount = count != null && (!unread || count > 0);
  // The label replaces what the row shows, so it carries the badge or code (extraLabel) and the description too.
  const label = [title, count != null ? `${count}${unread ? ' sin leer' : ''}` : '', extraLabel, description].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, styles.accountRow, pressed && styles.pressed]}>
    {loading ? <ActivityIndicator size="small" color={danger ? colors.danger : colors.primary} /> : <Icon name={icon} color={danger ? colors.danger : colors.primary} size={21} />}
    <View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>{children}{description && <Text style={styles.rowDescription}>{description}</Text>}</View>
    {hasCount && <Text style={[styles.count, unread && styles.unread]}>{unread && count! > 99 ? '99+' : count}</Text>}
    {dot && <View style={styles.dot} />}
    {!danger && <Icon name="chevron-forward" size={16} color={colors.muted} />}
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: layout.tabContentBottom },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2, paddingBottom: 20 },
  identityText: { flex: 1, minWidth: 0, gap: 4 }, heading: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  identityDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '500', marginTop: 22, marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: internalLayout.radius, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 13 },
  accountRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dataRow: { minHeight: 68 }, pressed: { backgroundColor: colors.softBlue }, rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: colors.ink }, rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  count: { color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], minWidth: 22, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 3 },
  unread: { color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 12, fontWeight: '600' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primaryFill }, updateGroup: { marginBottom: 12 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 24 },
  guest: { gap: 14, paddingVertical: 32 }, guestTitle: { fontSize: 23, lineHeight: 29, fontWeight: '600', letterSpacing: -.4, color: colors.ink },
  guestText: { fontSize: 16, lineHeight: 25, color: colors.muted, maxWidth: 350 }, guestAction: { alignSelf: 'flex-start' },
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 },
  legalText: { color: colors.muted, fontSize: 12, lineHeight: 18 }, legalLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  code: { color: colors.ink, fontSize: 13, lineHeight: 19, fontVariant: ['tabular-nums'] },
  copied: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 4, marginTop: 8 },
  demoNote: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 4, marginTop: 20 },
}));
