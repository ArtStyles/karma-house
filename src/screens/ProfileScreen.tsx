import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Notice, PageTitle } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { useAuth } from '../auth/AuthProvider';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { AccountMenu } from '../components/account/AccountMenu';

export default function ProfileScreen() {
  const { listings, favoriteIds, ownListings: own, mode } = useMarketplace();
  const { user, displayName, isAdmin, signOut, error: authError, refreshProfile } = useAuth();
  const { unreadCount } = useMessaging();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const favorites = listings.filter(item => favoriteIds.includes(item.id) && item.status === 'active');

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Mi espacio" />

      <View style={styles.identity}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.identityRing} />
        <AccountMenu size={62} />
        <View style={styles.identityText}>
          <Text style={styles.identityEyebrow}>TU KARMAHOUSE</Text>
          <Text style={styles.heading}>{user ? displayName || 'Mi cuenta' : 'Tu espacio personal'}</Text>
          <Text style={styles.identityDescription}>{mode === 'demo' ? 'Demostración local' : user?.email ?? 'Tu próximo comienzo, contigo.'}</Text>
        </View>
      </View>

      {mode === 'cloud' && !user ? <View style={styles.accountPrompt}><AccountPrompt returnTo="/profile" /></View> : null}
      <Text style={styles.sectionLabel}>Tu actividad</Text>
      <View style={styles.group}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notificaciones, ${notificationUnreadCount} sin leer`} onPress={() => router.push('/notifications')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><Icon name="notifications-outline" size={21} color={colors.primary} /></View>
          <View style={styles.rowBody}><View style={styles.rowCopy}><Text style={styles.rowTitle}>Notificaciones</Text><Text style={styles.rowDescription}>Novedades de tus conversaciones</Text></View><View style={styles.accessory}>{notificationUnreadCount > 0 && <Text style={[styles.count, styles.unread]}>{notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}</Text>}<Icon name="chevron-forward" size={17} color={colors.muted} /></View></View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Mensajes, ${unreadCount} sin leer`} onPress={() => router.push('/messages')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><Icon name="chatbubbles-outline" size={21} color={colors.primary} /></View>
          <View style={styles.rowBody}><View style={styles.rowCopy}><Text style={styles.rowTitle}>Mensajes</Text><Text style={styles.rowDescription}>{mode === 'demo' ? 'Disponible con una cuenta conectada' : 'Conversa sobre cada vivienda'}</Text></View><View style={styles.accessory}>{unreadCount > 0 && <Text style={[styles.count, styles.unread]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>}<Icon name="chevron-forward" size={17} color={colors.muted} /></View></View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable accessibilityRole="button" accessibilityLabel="Visitas y ofertas" onPress={() => router.push('/requests')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><Icon name="calendar-outline" size={21} color={colors.primary} /></View>
          <View style={styles.rowBody}><View style={styles.rowCopy}><Text style={styles.rowTitle}>Visitas y ofertas</Text><Text style={styles.rowDescription}>Solicitudes, respuestas y próximos pasos</Text></View><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Mis anuncios, ${own.length}`} onPress={() => router.push('/my-listings')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.rowIcon, styles.listingsIcon]}><Icon name="home-outline" size={21} color="#467660" /></View>
          <View style={styles.rowBody}>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>Mis anuncios</Text><Text style={styles.rowDescription}>{mode === 'demo' ? 'Tus anuncios en este dispositivo' : 'Tus viviendas y su revisión'}</Text></View>
            <View style={styles.accessory}><Text style={styles.count}>{own.length}</Text><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
          </View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Favoritos, ${favorites.length}`} onPress={() => router.push('/favorites')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.rowIcon, styles.favoritesIcon]}><Icon name="heart-outline" size={21} color="#A85D70" /></View>
          <View style={styles.rowBody}>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>Favoritos</Text><Text style={styles.rowDescription}>Lugares que quieres recordar</Text></View>
            <View style={styles.accessory}><Text style={styles.count}>{favorites.length}</Text><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
          </View>
        </Pressable>
      </View>

      <View style={styles.publish}>
        <View style={styles.publishHeading}><View style={styles.publishIcon}><Icon name="key-outline" color={colors.primary} size={25} /></View><Text style={styles.publishEyebrow}>PARA PROPIETARIOS</Text></View>
        <Text style={styles.publishTitle}>Dale un lugar a tu vivienda.</Text>
        <Text style={styles.publishText}>Añade los detalles, elige sus mejores fotos y prepara tu {own.length ? 'próximo' : 'primer'} anuncio.</Text>
        <Button label={mode === 'cloud' ? 'Publicar mi vivienda' : 'Crear anuncio de prueba'} onPress={() => router.push('/publish')} icon="add-outline" />
      </View>

      {isAdmin && <View style={{ marginTop: 18 }}><Button label="Revisar anuncios" secondary icon="shield-checkmark-outline" onPress={() => router.push('/admin')} /></View>}
      {isAdmin && <View style={{ marginTop: 12 }}><Button label="Reportes de mensajes" secondary icon="flag-outline" onPress={() => router.push('/message-reports')} /></View>}
      <Text style={styles.demoNote}>{mode === 'demo' ? 'Tus cambios se guardan en este dispositivo. Esta demo no incluye cuentas, mensajes ni publicaciones públicas.' : 'Conversa sobre cada vivienda sin publicar tu teléfono. Tus anuncios se revisan antes de aparecer en el catálogo.'}</Text>
      {error || authError ? <Notice error>{error || authError}</Notice> : null}
      {authError && user && <Button label="Volver a cargar perfil" secondary onPress={() => void refreshProfile()} />}
      {user && <View style={{ marginTop: 22 }}><Button label="Cerrar sesión" secondary loading={busy} onPress={async () => {
        setBusy(true); setError('');
        try { await signOut(); } catch { setError('No pudimos cerrar la sesión. Inténtalo de nuevo.'); } finally { setBusy(false); }
      }} /></View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: layout.tabContentBottom },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: '#EAF2FC', borderRadius: 26, padding: 22, borderWidth: 1, borderColor: '#DDE9F8', overflow: 'hidden' },
  identityRing: { position: 'absolute', right: -72, top: -73, width: 195, height: 195, borderRadius: 100, borderWidth: 30, borderColor: '#DEEBFB' },
  avatar: { width: 62, height: 62, backgroundColor: colors.white, borderRadius: 22, borderWidth: 4, borderColor: '#F8FBFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(51, 87, 137, 0.05)' },
  initials: { color: colors.primary, fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  identityText: { flex: 1, minWidth: 0, gap: 5 },
  identityEyebrow: { color: '#46698F', fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
  heading: { color: '#213B5A', fontSize: 21, lineHeight: 27, fontWeight: '600', letterSpacing: -.5 },
  identityDescription: { color: '#566D87', fontSize: 13, lineHeight: 19 },
  accountPrompt: { marginTop: 18 },
  sectionLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 26, marginBottom: 11, marginLeft: 4 },
  group: { backgroundColor: colors.white, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: '#ECEFF3' },
  row: { minHeight: 79, flexDirection: 'row', alignItems: 'center', gap: 13, paddingLeft: 16, paddingRight: 18, paddingVertical: 15 },
  pressed: { backgroundColor: colors.paper },
  rowIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  listingsIcon: { backgroundColor: '#EAF3EE' }, favoritesIcon: { backgroundColor: '#F8ECEF' },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, letterSpacing: -.25 },
  rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  accessory: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  count: { color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], minWidth: 26, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 4, backgroundColor: colors.paper, borderRadius: 12 },
  unread: { color: colors.primary, backgroundColor: colors.softBlue, fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ECEFF3', marginLeft: 68 },
  publish: { padding: 22, backgroundColor: '#EDF4FD', borderRadius: 25, gap: 12, marginTop: 24, borderWidth: 1, borderColor: '#E1ECFA' },
  publishHeading: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 2 },
  publishIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: 14 },
  publishEyebrow: { color: '#4C6C93', fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  publishTitle: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -.5, color: colors.ink },
  publishText: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 6 },
  demoNote: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 16, marginTop: 18 },
});
