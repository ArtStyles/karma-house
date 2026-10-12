import { Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../components/ui';
import { useTheme } from '../../theme';
import { useMessaging } from '../../messaging/MessagingProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadCount: messageUnread } = useMessaging();
  const { unreadCount: noticeUnread } = useNotifications();
  // Mi espacio is the only tab that carries both inboxes, so its badge counts both.
  const unreadCount = messageUnread + noticeUnread;
  const tabIcon = (name: IconName, active: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? active : name} color={color} size={24} />;
  return (
    <Tabs screenOptions={{
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
      tabBarLabelStyle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline', 'heart') }} />
      <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: tabIcon('person-circle-outline', 'person-circle'), tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : undefined, tabBarBadgeStyle: { backgroundColor: colors.primaryFill, color: colors.onPrimary, fontSize: 11 } }} />
    </Tabs>
  );
}
