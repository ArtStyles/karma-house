import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconButton } from '../ui';
import { colors, typefaces } from '../../theme';

export function NotificationHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  return <View style={styles.header}>
    <View style={styles.toolbar}>
      <IconButton name="chevron-back" label="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
      {right}
    </View>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>;
}
const styles = StyleSheet.create({
  header: { paddingTop: 12, paddingBottom: 22, gap: 6 }, toolbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontFamily: typefaces.display, fontSize: 30, lineHeight: 37, fontWeight: '700', letterSpacing: -0.8, color: colors.ink },
  subtitle: { fontSize: 14, lineHeight: 21, color: colors.muted },
});
