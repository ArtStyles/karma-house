import { Tabs } from 'expo-router';
import { StyleSheet, View, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { UserAvatar } from '../../components/account/UserAvatar';
import { Mediopunto } from '../../components/Mediopunto';
import { Icon, type IconName } from '../../components/ui';
import { layout, rounded, useTheme } from '../../theme';
import { useMessaging } from '../../messaging/MessagingProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { useAppUpdate } from '../../updates/useAppUpdate';

export default function TabLayout() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= layout.wideMinWidth;
  const { unreadCount: messageUnread } = useMessaging();
  const { unreadCount: noticeUnread } = useNotifications();
  // Mi espacio is the only tab that carries both inboxes, so its badge counts both.
  const unreadCount = messageUnread + noticeUnread;
  // Without unread items, a plain dot says a new version waits in Mi espacio.
  const updatePending = useAppUpdate().pending;
  const updateDot = !unreadCount && updatePending;
  const { user, displayName, avatarUrl } = useAuth();
  // The active section swaps its icon for the lit mediopunto; both copies stay mounted and cross-fade.
  const active = <View style={styles.icon}><Mediopunto width={36} ground={colors.navigation} /></View>;
  const tabIcon = (name: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => focused ? active : <Icon name={name} color={color} size={24} />;
  // A signed-in account shows its own face (or initials) instead of the generic person.
  const accountIcon = (props: { color: ColorValue; focused: boolean }) => props.focused ? active : user
    ? <UserAvatar size={26} avatarUrl={avatarUrl} name={displayName} accessibilityLabel="" />
    : tabIcon('person-circle-outline')(props);
  return (
    // Wide screens get the root SideRail instead of a tab bar.
    <Tabs tabBar={wide ? () => null : undefined} screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.ink,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: 'transparent',
      tabBarHideOnKeyboard: true,
      // A floating pill 16 px from the sides and 20 above the safe area. The bar keeps its full height in the
      // layout, so content ends above it and hiding it for the keyboard moves the whole pill out of view.
      tabBarStyle: {
        height: bar + 20 + insets.bottom, paddingTop: 0, paddingBottom: 20 + insets.bottom, paddingHorizontal: 20,
        backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0,
      },
      // Opaque enough to read on Android, where it never blurs.
      tabBarBackground: () => <View style={[styles.pill, { backgroundColor: colors.navigationGlass, borderColor: colors.navigationBorder,
        boxShadow: scheme === 'dark' ? '0 12px 32px rgba(0,0,0,0.4)' : '0 10px 28px rgba(26,43,59,0.12)' }]} />,
      // No side padding on items: at 320 px «Mi espacio» needs the whole quarter.
      tabBarItemStyle: { height: bar, paddingHorizontal: 0 },
      tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2, flexShrink: 0 },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline') }} />
      <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: accountIcon, tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : updateDot ? '' : undefined, tabBarAccessibilityLabel: updateDot ? 'Mi espacio, nueva versión disponible' : undefined,
        // Sol marks what asks for attention: unread items and a new version.
        tabBarBadgeStyle: updateDot ? { backgroundColor: colors.sol, minWidth: 10, width: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, top: 0, end: 0 } : { backgroundColor: colors.sol, color: colors.onSol, fontSize: 11, fontWeight: '700' } }} />
    </Tabs>
  );
}

const bar = 68;
const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 16, right: 16, top: 0, height: bar, borderRadius: rounded.pill, borderWidth: 1 },
  icon: { width: 36, height: 24, justifyContent: 'flex-end', alignItems: 'center' },
});
