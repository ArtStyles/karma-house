import { Stack, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { shouldClearAuthIntent } from '../auth/intentLifecycle';
import { pendingIntentStore } from '../auth/pendingIntentStorage';
import { MessagingProvider } from '../messaging/MessagingProvider';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { PushProvider } from '../push/PushProvider';
import { MarketplaceProvider } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><NotificationsProvider><PushProvider><MessagingProvider><MarketplaceProvider><StatusBar style="dark" /><AppContent /></MarketplaceProvider></MessagingProvider></PushProvider></NotificationsProvider></AuthProvider></SafeAreaProvider>;
}
function AppContent() {
  const pathname = usePathname();
  const { user } = useAuth();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (shouldClearAuthIntent(previousPath.current, pathname, !!user)) void pendingIntentStore.clear().catch(() => undefined);
    previousPath.current = pathname;
  }, [pathname, user]);
  return <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} />
  </View>;
}
