import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { colors } from '../../theme';
import { Icon, Notice } from '../ui';
import { UserAvatar } from './UserAvatar';

export function AccountMenu({ size = 44 }: { size?: number }) {
  const auth = useAuth();
  const { unreadCount } = useNotifications();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(293);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  const actor = useRef(auth.user?.id); actor.current = auth.user?.id;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setAnchor(null); setError(''); setBusy(false); }, [auth.user?.id]);
  useEffect(() => {
    if (!anchor || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape' && !lock.current) { event.preventDefault(); setAnchor(null); } };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [anchor]);
  useEffect(() => { setAnchor(null); }, [width, height]);
  function close() { if (!lock.current) setAnchor(null); }
  function open() {
    const ownerId = actor.current;
    setError('');
    trigger.current?.measureInWindow((x, y, width, height) => { if (mounted.current && actor.current === ownerId) setAnchor({ x, y, width, height }); });
  }
  async function logout() {
    if (lock.current) return;
    const ownerId = auth.user?.id;
    if (!ownerId) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await auth.signOut();
      if (mounted.current && (!actor.current || actor.current === ownerId)) { setAnchor(null); router.replace('/'); }
    } catch (failure) { if (mounted.current && actor.current === ownerId) setError(failure instanceof Error ? failure.message : 'No pudimos cerrar la sesión. Inténtalo otra vez.'); }
    finally { lock.current = false; if (mounted.current && (!actor.current || actor.current === ownerId)) setBusy(false); }
  }
  const menuWidth = Math.min(278, width - 32);
  const left = anchor ? Math.max(16, Math.min(anchor.x + anchor.width - menuWidth, width - menuWidth - 16)) : 16;
  const top = anchor ? Math.max(insets.top + 8, Math.min(anchor.y + anchor.height + 8, height - insets.bottom - menuHeight - 12)) : 16;
  return <>
    <View ref={trigger} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel="Abrir menú de cuenta" accessibilityState={{ expanded: !!anchor }} onPress={open} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <UserAvatar size={size} avatarUrl={auth.avatarUrl} name={auth.user ? auth.displayName : ''} />
    </Pressable></View>
    <Modal transparent visible={!!anchor} animationType="fade" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú de cuenta" onPress={close} style={styles.outside} />
      <View accessibilityViewIsModal onLayout={event => setMenuHeight(event.nativeEvent.layout.height)} style={[styles.menu, { left, top, width: menuWidth, maxHeight: height - insets.top - insets.bottom - 24 }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.identity}><UserAvatar size={38} avatarUrl={auth.avatarUrl} name={auth.user ? auth.displayName : ''} /><View style={styles.nameCopy}><Text style={styles.name} numberOfLines={2}>{auth.user ? auth.displayName : 'Tu cuenta'}</Text><Text style={styles.caption}>KarmaHouse</Text></View></View>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" accessibilityLabel="Mi espacio" disabled={busy} onPress={() => { close(); router.push('/profile'); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Icon name="person-outline" size={20} color={colors.primary} /><Text style={styles.label}>Mi espacio</Text><Icon name="chevron-forward" size={14} color={colors.muted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'} disabled={busy} onPress={() => { close(); router.push('/notifications'); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Icon name="notifications-outline" size={20} color={colors.primary} /><Text style={styles.label}>Notificaciones</Text>{unreadCount > 0 && <Text style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</Text>}<Icon name="chevron-forward" size={14} color={colors.muted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajustes de cuenta" disabled={busy} onPress={() => { close(); router.push('/account-settings'); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Icon name="settings-outline" size={20} color={colors.primary} /><Text style={styles.label}>Ajustes de cuenta</Text><Icon name="chevron-forward" size={14} color={colors.muted} /></Pressable>
        {auth.user ? <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" disabled={busy} onPress={logout} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Icon name="log-out-outline" size={21} color={colors.danger} />}<Text style={[styles.label, styles.logout]}>Cerrar sesión</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => { close(); router.push({ pathname: '/auth', params: { returnTo: '/profile' } }); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Icon name="person-add-outline" size={20} color={colors.primary} /><Text style={styles.label}>Entrar o crear cuenta</Text></Pressable>}
        {!!error && <View style={styles.error}><Notice error>{error}</Notice></View>}
        </ScrollView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  outside: { ...StyleSheet.absoluteFill, backgroundColor: '#142E461A' },
  menu: { position: 'absolute', backgroundColor: colors.white, padding: 8, borderRadius: 23, borderWidth: 1, borderColor: '#E5ECF5', boxShadow: '0 12px 38px rgba(25, 57, 94, 0.15)', overflow: 'hidden' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingBottom: 14 }, nameCopy: { flex: 1, gap: 3 }, name: { color: colors.ink, fontSize: 15, fontWeight: '600' }, caption: { color: colors.muted, fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 8, marginBottom: 5 },
  badge: { color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 }, pressed: { backgroundColor: colors.paper }, label: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '500' }, logout: { color: colors.danger }, error: { paddingHorizontal: 9 },
});
