import { router, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { createThemedStyles } from '../theme';
import { UserAvatar } from './account/UserAvatar';
import { MotionPressable } from './MotionPressable';
import { Icon, type IconName } from './ui';

// The sections the rail stays beside; any other screen keeps the whole width.
export const railPath = (path: string) => /^\/(favorites|publish|profile|notifications|messages(\/.*)?)?$/.test(path);

const items: { href: Href; title: string; icon: IconName; active: IconName; inbox?: 'notices' | 'messages' }[] = [
  { href: '/', title: 'Explorar', icon: 'compass-outline', active: 'compass' },
  { href: '/favorites', title: 'Favoritos', icon: 'heart-outline', active: 'heart' },
  { href: '/publish', title: 'Publicar', icon: 'add-circle-outline', active: 'add-circle' },
  { href: '/notifications', title: 'Notificaciones', icon: 'notifications-outline', active: 'notifications', inbox: 'notices' },
  { href: '/messages', title: 'Mensajes', icon: 'chatbubble-outline', active: 'chatbubble', inbox: 'messages' },
];

/** Wide-screen navigation: sections on top, the signed-in account at the foot. */
export function SideRail() {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { user, displayName, avatarUrl } = useAuth();
  const unread = { notices: useNotifications().unreadCount, messages: useMessaging().unreadCount };
  const current = (href: string) => href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  // Each section starts from the tabs, so moving around the rail never piles up screens.
  const go = (href: Href) => { if (router.canDismiss()) router.dismissAll(); router.navigate(href); };
  const item = (href: Href, title: string, badge: number, icon: (focused: boolean) => ReactNode) => {
    const focused = current(href as string);
    return <MotionPressable key={title} accessibilityRole="tab" aria-selected={focused}
      accessibilityLabel={badge ? `${title}, ${badge} sin leer` : title} onPress={() => go(href)}
      style={({ pressed }) => [styles.item, focused && styles.focused, pressed && { opacity: .7 }]}>
      <View>{icon(focused)}{badge > 0 && <View pointerEvents="none" style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}</View>
      <Text numberOfLines={1} style={[styles.label, focused && { color: colors.primary }]}>{title}</Text>
    </MotionPressable>;
  };
  return <View accessibilityRole="tablist" style={[styles.rail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 8 }]}>
    {items.map(i => item(i.href, i.title, i.inbox ? unread[i.inbox] : 0, focused => <Icon name={focused ? i.active : i.icon} size={24} color={focused ? colors.primary : colors.muted} />))}
    <View style={styles.spacer} />
    <View style={styles.divider} />
    {item('/profile', 'Mi espacio', 0, focused => user
      ? <View style={[styles.ring, focused && { borderColor: colors.primary }]}><UserAvatar size={36} avatarUrl={avatarUrl} name={displayName} accessibilityLabel="" /></View>
      : <Icon name={focused ? 'person-circle' : 'person-circle-outline'} size={28} color={focused ? colors.primary : colors.muted} />)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  rail: { width: 104, paddingRight: 8, gap: 4, backgroundColor: colors.surface, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  item: { minHeight: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  focused: { backgroundColor: colors.softBlue },
  label: { fontSize: 12, fontWeight: '500', color: colors.muted },
  badge: { position: 'absolute', right: -10, top: -6, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.primaryFill, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  spacer: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 10, marginBottom: 8 },
  ring: { borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
}));
