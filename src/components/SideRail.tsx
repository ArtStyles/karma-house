import { router, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { createThemedStyles, layout, rounded, typography } from '../theme';
import { useAppUpdate } from '../updates/useAppUpdate';
import { UserAvatar } from './account/UserAvatar';
import { Mediopunto } from './Mediopunto';
import { MotionPressable } from './MotionPressable';
import { Brand, Icon, type IconName } from './ui';

// The sections the rail stays beside; any other screen keeps the whole width.
export const railPath = (path: string) => /^\/(favorites|publish|profile|notifications|messages(\/.*)?)?$/.test(path);

const items: { href: Href; title: string; icon: IconName; inbox?: 'notices' | 'messages' }[] = [
  { href: '/', title: 'Explorar', icon: 'compass-outline' },
  { href: '/favorites', title: 'Favoritos', icon: 'heart-outline' },
  { href: '/publish', title: 'Publicar', icon: 'add-circle-outline' },
  { href: '/notifications', title: 'Notificaciones', icon: 'notifications-outline', inbox: 'notices' },
  { href: '/messages', title: 'Mensajes', icon: 'chatbubble-outline', inbox: 'messages' },
];

/** Wide-screen navigation: the logo, sections as pills (the active one with the lit mediopunto), the account at the foot. */
export function SideRail() {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { user, displayName, avatarUrl } = useAuth();
  const unread = { notices: useNotifications().unreadCount, messages: useMessaging().unreadCount };
  const updateDot = useAppUpdate().pending;
  const current = (href: string) => href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  // Each section starts from the tabs, so moving around the rail never piles up screens.
  const go = (href: Href) => { if (router.canDismiss()) router.dismissAll(); router.navigate(href); };
  // `dot` marks a new version of the app, which waits in Mi espacio.
  const item = (href: Href, title: string, badge: number, icon: (focused: boolean) => ReactNode, dot = false) => {
    const focused = current(href as string);
    return <MotionPressable key={title} accessibilityRole="tab" aria-selected={focused}
      accessibilityLabel={badge ? `${title}, ${badge} sin leer` : dot ? `${title}, nueva versión disponible` : title} onPress={() => go(href)}
      style={({ pressed }) => [styles.item, focused && styles.focused, pressed && { opacity: .7 }]}>
      <View style={styles.icon}>{icon(focused)}{!badge && dot && <View pointerEvents="none" style={styles.dot} />}</View>
      <Text numberOfLines={1} style={[styles.label, focused && { color: colors.ink }]}>{title}</Text>
      {badge > 0 && <View pointerEvents="none" style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
    </MotionPressable>;
  };
  const lit = <Mediopunto width={28} ground={colors.raised} />;
  return <View accessibilityRole="tablist" style={[styles.rail, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16 }]}>
    <Brand height={26} style={styles.brand} />
    {items.map(i => item(i.href, i.title, i.inbox ? unread[i.inbox] : 0, focused => focused ? lit : <Icon name={i.icon} size={22} color={colors.body} />))}
    <View style={styles.spacer} />
    {item('/profile', 'Mi espacio', 0, focused => user
      ? <UserAvatar size={32} avatarUrl={avatarUrl} name={displayName} accessibilityLabel="" />
      : focused ? lit : <Icon name="person-circle-outline" size={24} color={colors.body} />, updateDot)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  rail: { width: layout.railWidth, paddingRight: 16, gap: 4, backgroundColor: colors.sheet, borderRightWidth: 1, borderRightColor: colors.border },
  brand: { paddingHorizontal: 8, paddingBottom: 18 },
  item: { minHeight: 46, borderRadius: rounded.pill, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 6 },
  // A solid step up from the rail, so the mediopunto's leading matches it.
  focused: { backgroundColor: colors.raised },
  icon: { width: 28, alignItems: 'center' },
  label: { ...typography.control, flex: 1, color: colors.body },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: rounded.pill, backgroundColor: colors.sol, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: colors.onSol, fontSize: 12, fontWeight: '700' },
  dot: { position: 'absolute', right: -2, top: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sol, borderWidth: 2, borderColor: colors.sheet },
  spacer: { flex: 1 },
}));
