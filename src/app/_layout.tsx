import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { MessagingProvider } from '../messaging/MessagingProvider';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { PushProvider } from '../push/PushProvider';
import { MarketplaceProvider } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><NotificationsProvider><PushProvider><MessagingProvider><MarketplaceProvider><StatusBar style="dark" /><AppContent /></MarketplaceProvider></MessagingProvider></PushProvider></NotificationsProvider></AuthProvider></SafeAreaProvider>;
}
function AppContent() {
  return <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} />
  </View>;
}
