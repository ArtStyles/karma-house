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
export function Pill({ label, active = false, onPress, icon, accessibilityLabel }: { label: string; active?: boolean; onPress: () => void; icon?: IconName; accessibilityLabel?: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: active }} style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: .7 }]}>
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
  return <View style={styles.empty}>
    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emptyArtwork}>
      <View style={styles.emptyHalo} />
      <View style={styles.emptyBackCard}><View style={styles.emptyCardLine} /><View style={[styles.emptyCardLine, styles.emptyShortLine]} /></View>
      <View style={styles.emptyIcon}><Icon name={icon} color={colors.primary} size={31} /></View>
      <View style={styles.emptyAccent} />
      <View style={styles.emptyGround} />
    </View>
    <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyDescription}>{description}</Text>
    {action ? <View style={styles.emptyAction}>{action}</View> : null}
  </View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 26, backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.softBlue }, buttonText: { color: 'white', fontWeight: '600', fontSize: 16, flexShrink: 1, textAlign: 'center' },
  iconButton: { width: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.white, flexDirection: 'row', gap: 7, alignItems: 'center' },
  pillActive: { backgroundColor: colors.softBlue }, pillText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 26, paddingBottom: 24 }, title: { fontFamily: typefaces.display, fontSize: 34, fontWeight: '700', color: colors.ink, letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  notice: { paddingVertical: 14, paddingHorizontal: 4, borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, noticeText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20 },
  empty: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 26, borderWidth: 1, borderColor: '#EBEEF3', boxShadow: '0 4px 18px rgba(32, 62, 94, 0.025)' },
  emptyArtwork: { width: 150, height: 90, marginBottom: 2 },
  emptyHalo: { position: 'absolute', width: 134, height: 65, borderRadius: 38, backgroundColor: '#EFF5FC', left: 9, top: 10, transform: [{ rotate: '-9deg' }] },
  emptyBackCard: { position: 'absolute', width: 55, height: 63, borderRadius: 14, backgroundColor: '#DCE9F9', borderWidth: 2, borderColor: '#F3F7FD', left: 32, top: 7, transform: [{ rotate: '-14deg' }], padding: 11, justifyContent: 'flex-end', gap: 5 },
  emptyCardLine: { width: 26, height: 4, borderRadius: 2, backgroundColor: '#BCD2EF' }, emptyShortLine: { width: 18 },
  emptyIcon: { position: 'absolute', width: 62, height: 65, borderRadius: 17, backgroundColor: colors.white, left: 63, top: 12, borderWidth: 1, borderColor: '#E4EDF9', justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '7deg' }], boxShadow: '0 5px 12px rgba(35, 89, 150, 0.08)' },
  emptyAccent: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#80AFE8', borderWidth: 3, borderColor: colors.white, left: 24, top: 18 },
  emptyGround: { position: 'absolute', width: 64, height: 4, borderRadius: 2, backgroundColor: '#EDF2F8', left: 49, bottom: 0 },
  emptyTitle: { fontSize: 21, lineHeight: 27, letterSpacing: -0.45, color: colors.ink, textAlign: 'center', fontWeight: '600', maxWidth: 390 },
  emptyDescription: { fontSize: 14, lineHeight: 22, color: colors.muted, maxWidth: 370, textAlign: 'center' },
  emptyAction: { width: '100%', maxWidth: 330, marginTop: 6 },
});
