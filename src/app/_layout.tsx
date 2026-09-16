import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Notice } from '../components/ui';
import { MarketplaceProvider, useMarketplace } from '../state/MarketplaceProvider';
import { colors } from '../theme';

export default function RootLayout() {
  return <SafeAreaProvider><MarketplaceProvider><StatusBar style="dark" /><AppContent /></MarketplaceProvider></SafeAreaProvider>;
}
function AppContent() {
  const { ready, storageError } = useMarketplace();
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Preparando tu próximo comienzo…</Text></View>;
  return <View style={{ flex: 1 }}>
    {storageError && <Notice error>{storageError}</Notice>}
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} />
  </View>;
}
const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', alignItems: 'center', gap: 15 }, loadingText: { color: colors.ink, fontSize: 15 } });
