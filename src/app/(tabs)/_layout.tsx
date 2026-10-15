import { Tabs } from 'expo-router';
import { StyleSheet, View, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { UserAvatar } from '../../components/account/UserAvatar';
import { Icon, type IconName } from '../../components/ui';
import { layout, useTheme } from '../../theme';
import { useMessaging } from '../../messaging/MessagingProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { useAppUpdate } from '../../updates/useAppUpdate';

export default function TabLayout() {
  const { colors } = useTheme();
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
  const tabIcon = (name: IconName, active: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? active : name} color={color} size={24} />;
  // A signed-in account shows its own face (or initials) instead of the generic person.
  const accountIcon = (props: { color: ColorValue; focused: boolean }) => user
    ? <View style={{ borderRadius: 16, borderWidth: 2, borderColor: props.focused ? colors.primary : 'transparent' }}><UserAvatar size={26} avatarUrl={avatarUrl} name={displayName} accessibilityLabel="" /></View>
    : tabIcon('person-circle-outline', 'person-circle')(props);
  return (
    // Wide screens get the root SideRail instead of a tab bar.
    <Tabs tabBar={wide ? () => null : undefined} screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: 'transparent',
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
        // The navigator reserves this space; content never scrolls behind the bar.
        height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6),
        paddingHorizontal: 6, borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border, backgroundColor: colors.surface, elevation: 0,
      },
      tabBarItemStyle: { minHeight: 48 },
      // On web the item is a few pixels shorter, and a shrinking label gets its lower half clipped.
      tabBarLabelStyle: { fontSize: 12, fontWeight: '500', marginTop: 2, flexShrink: 0 },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline', 'heart') }} />
      <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: accountIcon, tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : updateDot ? '' : undefined, tabBarAccessibilityLabel: updateDot ? 'Mi espacio, nueva versión disponible' : undefined,
        tabBarBadgeStyle: updateDot ? { backgroundColor: colors.primaryFill, minWidth: 10, width: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, top: 0, end: 0 } : { backgroundColor: colors.primaryFill, color: colors.onPrimary, fontSize: 11 } }} />
    </Tabs>
  );
}
