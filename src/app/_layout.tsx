import { Stack, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {AgencyProvider} from '../agencies/AgencyProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { shouldClearAuthIntent } from '../auth/intentLifecycle';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { SideRail, railPath } from '../components/SideRail';
import { MessagingProvider } from '../messaging/MessagingProvider';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { PushProvider } from '../push/PushProvider';
import { MarketplaceProvider } from '../state/MarketplaceProvider';
import { ThemeProvider, layout, useTheme } from '../theme';

export default function RootLayout() {
  return <ThemeProvider><SafeAreaProvider><AuthProvider><AgencyProvider><NotificationsProvider><PushProvider><MessagingProvider><MarketplaceProvider><AppContent /></MarketplaceProvider></MessagingProvider></PushProvider></NotificationsProvider></AgencyProvider></AuthProvider></SafeAreaProvider></ThemeProvider>;
}
function AppContent() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const { user } = useAuth();
  const wide = useWindowDimensions().width >= layout.wideMinWidth;
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (shouldClearAuthIntent(previousPath.current, pathname, !!user)) void pendingIntentStore.clear().catch(() => undefined);
    previousPath.current = pathname;
  }, [pathname, user]);
  // On wide screens the rail lives outside the stack, so it stays put while its sections change.
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.paper }}>
    {wide && railPath(pathname) && <SideRail />}
    <View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} /></View>
  </View>;
}
