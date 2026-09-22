import { Tabs } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationMaterial } from '../../components/NavigationMaterial';
import { Icon, type IconName } from '../../components/ui';
import { colors } from '../../theme';
import { useMessaging } from '../../messaging/MessagingProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { unreadCount: messageUnread } = useMessaging();
  const { unreadCount: noticeUnread } = useNotifications();
  // Mi espacio is the only tab that carries both inboxes, so its badge counts both.
  const unreadCount = messageUnread + noticeUnread;
  const { width } = useWindowDimensions();
  const inset = Math.max(16, (width - 520) / 2);
  const tabIcon = (name: IconName, active: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? active : name} color={color} size={24} />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: '#E5EFFACC',
      tabBarHideOnKeyboard: true,
      tabBarBackground: () => <NavigationMaterial />,
      tabBarStyle: {
        // Override the navigator's logical edges and axis-specific padding on Android.
        position: 'absolute', start: inset, end: inset, bottom: Math.max(insets.bottom + 8, 16),
        height: 68, paddingTop: 6, paddingHorizontal: 6, paddingBottom: 6, borderRadius: 34, borderTopWidth: 0,
        borderWidth: 1, borderColor: '#FFFFFFCC', backgroundColor: 'transparent', overflow: 'hidden',
        elevation: 0, boxShadow: '0 3px 14px rgba(0, 0, 0, 0.08)',
      },
      tabBarItemStyle: { borderRadius: 27, overflow: 'hidden', marginHorizontal: 2 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      tabBarLabelPosition: 'below-icon',
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoritos', tabBarIcon: tabIcon('heart-outline', 'heart') }} />
      <Tabs.Screen name="publish" options={{ title: 'Publicar', tabBarIcon: tabIcon('add-circle-outline', 'add-circle') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi espacio', tabBarIcon: tabIcon('person-circle-outline', 'person-circle'), tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : undefined, tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.white, fontSize: 10 } }} />
    </Tabs>
  );
}
