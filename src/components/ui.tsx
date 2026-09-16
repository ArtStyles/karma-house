import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, type ColorValue } from 'react-native';
import { colors, typefaces } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: ColorValue }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Button({ label, onPress, secondary = false, loading = false, disabled = false, icon, style }: {
  label: string; onPress: () => void; secondary?: boolean; loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading }}
    disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && { opacity: .5 }, pressed && { opacity: .8 }, style]}>
    {loading ? <ActivityIndicator color={secondary ? colors.ink : 'white'} /> : icon ? <Icon name={icon} size={19} color={secondary ? colors.ink : 'white'} /> : null}
    <Text style={[styles.buttonText, secondary && { color: colors.primary }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ name, label, onPress, active = false, style }: { name: IconName; label: string; onPress: () => void; active?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} style={({ pressed }) => [styles.iconButton, pressed && { opacity: .7 }, style]}>
    <Icon name={name} size={22} color={active ? colors.primary : colors.ink} />
  </Pressable>;
}
export function Pill({ label, active = false, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: .7 }]}>
    {icon && <Icon name={icon} size={17} color={active ? colors.primary : colors.muted} />}
    <Text style={[styles.pillText, active && { color: colors.primary }]}>{label}</Text>
  </Pressable>;
}
export function PageTitle({ title, subtitle, back = false, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  return <View style={styles.pageTitle}>
    {back && <IconButton name="chevron-back" label="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ marginLeft: -4 }} />}
    <View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{right}
  </View>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} style={[styles.notice, error && { backgroundColor: '#FCEEF0' }]}>
    <Icon name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={error ? colors.danger : colors.muted} />
    <Text style={[styles.noticeText, error && { color: colors.danger }]}>{children}</Text>
  </View>;
}
export function EmptyState({ title, description, icon = 'home-outline', action }: { title: string; description: string; icon?: IconName; action?: ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} color={colors.primary} size={30} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text>{action}</View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 26, backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.softBlue }, buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  iconButton: { width: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.white, flexDirection: 'row', gap: 7, alignItems: 'center' },
  pillActive: { backgroundColor: colors.softBlue }, pillText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 26, paddingBottom: 24 }, title: { fontFamily: typefaces.display, fontSize: 34, fontWeight: '700', color: colors.ink, letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  notice: { paddingVertical: 14, paddingHorizontal: 4, borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, noticeText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20 },
  empty: { paddingVertical: 50, paddingHorizontal: 18, alignItems: 'center', gap: 16 }, emptyIcon: { backgroundColor: colors.softBlue, width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 22, color: colors.ink, textAlign: 'center', fontWeight: '600' }, emptyDescription: { fontSize: 15, lineHeight: 23, color: colors.muted, maxWidth: 350, textAlign: 'center', marginBottom: 6 },
});
