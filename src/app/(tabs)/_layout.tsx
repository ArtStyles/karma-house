import { Tabs } from 'expo-router';
import { StyleSheet, View, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { UserAvatar } from '../../components/account/UserAvatar';
import { NavigationMaterial } from '../../components/NavigationMaterial';
import { TabBarSpace } from '../../components/TabBarSpace';
import { Icon, type IconName } from '../../components/ui';
import { layout, rounded, useTheme } from '../../theme';
import { useMessaging } from '../../messaging/MessagingProvider';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { useAppUpdate } from '../../updates/useAppUpdate';

export default function TabLayout() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideMinWidth;
  // A compact pill centred on the screen, like Telegram's, not one stretched edge to edge: the four sections sit closer.
  const side = Math.round((width - Math.min(width - 32, barWidth)) / 2);
  const { unreadCount: messageUnread } = useMessaging();
  const { unreadCount: noticeUnread } = useNotifications();
  // Mi espacio is the only tab that carries both inboxes, so its badge counts both.
  const unreadCount = messageUnread + noticeUnread;
  // Without unread items, a plain dot says a new version waits in Mi espacio.
  const updatePending = useAppUpdate().pending;
  const updateDot = !unreadCount && updatePending;
  const { user, displayName, avatarUrl } = useAuth();
  // The active section keeps its own icon, filled in sol by night and ocre by day; its label takes the blue.
  const tabIcon = (name: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => <Icon name={focused ? name.replace('-outline', '') as IconName : name} color={focused ? colors.navActive : color} size={24} />;
  // A signed-in account shows its own face (or initials) instead of the generic person; active, it wears a ring in the same colour.
  const accountIcon = (props: { color: ColorValue; focused: boolean }) => user
    ? <View style={[styles.avatar, props.focused && { borderColor: colors.navActive }]}><UserAvatar size={24} avatarUrl={avatarUrl} name={displayName} accessibilityLabel="" /></View>
    : tabIcon('person-circle-outline')(props);
  // The bar floats over the screens, which end their content this far up (TabBarSpace).
  const space = wide ? 0 : bar + 20 + insets.bottom;
  return (
    <TabBarSpace.Provider value={space}>
    {/* Wide screens get the root SideRail instead of a tab bar. */}
    <Tabs tabBar={wide ? () => null : undefined} screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: 'transparent',
      tabBarHideOnKeyboard: true,
      // A floating pill, at most 336 px wide and 20 above the safe area, over the screen. Hiding it for the keyboard
      // moves the whole pill out of view.
      tabBarStyle: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: bar + 20 + insets.bottom, paddingTop: 0, paddingBottom: 20 + insets.bottom, paddingHorizontal: side + 4,
        backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0,
      },
      // Opaque, in the search field's surface colour (like Telegram): the screen never shows through.
      tabBarBackground: () => <View style={[styles.pill, { left: side, right: side, borderColor: colors.navigationBorder,
        boxShadow: scheme === 'dark' ? '0 12px 32px rgba(0,0,0,0.4)' : '0 10px 28px rgba(26,43,59,0.12)' }]}><NavigationMaterial /></View>,
      // No side padding on items: at 320 px «Mi espacio» needs the whole quarter. React Navigation lays each item out
      // from the top; a row wrapper lets the button take its content's height and centres it in the pill.
      tabBarItemStyle: { height: bar, paddingHorizontal: 0, flexDirection: 'row', alignItems: 'center' },
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
    </TabBarSpace.Provider>
  );
}

const bar = 68, barWidth = 336;
const styles = StyleSheet.create({
  pill: { position: 'absolute', top: 0, height: bar, borderRadius: rounded.pill, borderWidth: 1, overflow: 'hidden' },
  avatar: { borderRadius: rounded.pill, borderWidth: 2, borderColor: 'transparent' },
});
