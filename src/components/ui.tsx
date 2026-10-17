import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Children, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle, type ColorValue } from 'react-native';
import { createThemedStyles, rounded, typography, useTheme } from '../theme';
import { MotionPressable } from './MotionPressable';
import { HeartIcon } from './HeartIcon';
import { Mediopunto } from './Mediopunto';

/** Back that never dead-ends: history first, then the screen's own parent. */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back(); else router.replace(fallback);
}
export type IconName = ComponentProps<typeof Ionicons>['name'];
/** Decorative by default: the label lives on the control that wraps the icon. */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const { colors } = useStyles();
  return <Ionicons name={name} size={size} color={color ?? colors.ink} aria-hidden />;
}
/** Logo symbol alone: brand blue on light grounds, white on dark ones (never another hue). */
export function BrandMark({ height = 28 }: { height?: number }) {
  const dark = useTheme().scheme === 'dark';
  return <Image source={require('../../assets/karmahouse-mark.png')} accessible={false} accessibilityIgnoresInvertColors resizeMode="contain" style={{ width: Math.round(height * 1.276), height, tintColor: dark ? '#FFFFFF' : undefined }} />;
}
/** Logo symbol plus the two-weight wordmark; `height` sizes the symbol, the text follows. */
export function Brand({ height = 28, color, style }: { height?: number; color?: ColorValue; style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useStyles();
  const dark = useTheme().scheme === 'dark';
  return <View style={[styles.brand, style]}>
    <BrandMark height={height} />
    <Text style={[styles.brandText, { fontSize: Math.round(height * .62), color: color ?? (dark ? '#FFFFFF' : colors.primary) }]}><Text style={styles.brandStrong}>Karma</Text>House</Text>
  </View>;
}
export function Button({ label, onPress, secondary = false, loading = false, disabled = false, icon, style }: {
  label: string; onPress: () => void; secondary?: boolean; loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const { colors, styles } = useStyles();
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && { opacity: .5 }, pressed && { opacity: .8 }, style]}>
    {loading ? <ActivityIndicator color={secondary ? colors.ink : colors.onPrimary} /> : icon ? <Icon name={icon} size={19} color={secondary ? colors.ink : colors.onPrimary} /> : null}
    <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{label}</Text>
  </MotionPressable>;
}
/** `active` left undefined marks a plain action; only a real toggle reports a pressed state. `color` overrides both states (on a photo scrim). */
export function IconButton({ name, label, onPress, active, color, style }: { name: IconName; label: string; onPress: () => void; active?: boolean; color?: ColorValue; style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useStyles();
  const tint = color ?? (active ? colors.primary : colors.ink);
  return <MotionPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} aria-pressed={active} style={({ pressed }) => [styles.iconButton, pressed && { opacity: .7 }, style]}>
    {(name==='heart'||name==='heart-outline')&&typeof active==='boolean'?<HeartIcon active={active}><Icon name={name} size={22} color={tint}/></HeartIcon>:<Icon name={name} size={22} color={tint} />}
  </MotionPressable>;
}
export function Pill({ label, active = false, onPress, icon, accessibilityLabel }: { label: string; active?: boolean; onPress: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const { colors, styles } = useStyles();
  return <MotionPressable onPress={onPress} hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: active }} aria-pressed={active} style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: .7 }]}>
    {icon && <Icon name={icon} size={17} color={active ? colors.onPrimary : colors.muted} />}
    <Text style={[styles.pillText, active && { color: colors.onPrimary }]}>{label}</Text>
  </MotionPressable>;
}
/** Related actions retain a readable label and a separate touch target at narrow widths. */
export function ActionGroup({ children, direction = 'auto', style }: { children: ReactNode; direction?: 'auto' | 'vertical' | 'horizontal'; style?: StyleProp<ViewStyle> }) {
  const { width, fontScale } = useWindowDimensions();
  const items = Children.toArray(children);
  const stacked = direction === 'vertical' || (direction === 'auto' && (width < 380 || fontScale > 1.2 || items.length > 2));
  return <View style={[{ flexDirection: stacked ? 'column' : 'row', gap: 12, width: '100%' }, style]}>
    {items.map((child, index) => <View key={(child as { key?: string }).key ?? index} style={{ minWidth: 0, ...(stacked ? {} : { flex: 1 }) }}>{child}</View>)}
  </View>;
}
export function PageTitle({ title, subtitle, back = false, fallback, right, compact = false }: { title: string; subtitle?: string; back?: boolean; fallback?: Href; right?: ReactNode; compact?: boolean }) {
  const { styles } = useStyles();
  return <View style={[styles.pageTitle, compact && styles.compactHeader]}>
    {back && <IconButton name="chevron-back" label="Volver" onPress={() => goBack(fallback)} style={{ marginLeft: -4 }} />}
    <View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{right}
  </View>;
}
/** `onRetry` adds a «Reintentar» pill: pull-to-refresh does not exist on the web, so a failed load needs a button. */
export function Notice({ children, error = false, onRetry }: { children: ReactNode; error?: boolean; onRetry?: () => void }) {
  const { colors, styles } = useStyles();
  // Inside the column, flex: 1 would let the text collapse to zero height.
  const text = <Text style={[styles.noticeText, onRetry && { flex: 0, alignSelf: 'stretch' }, error && { color: colors.danger }]}>{children}</Text>;
  return <View accessibilityRole={error ? 'alert' : undefined} style={[styles.notice, error && styles.noticeError]}>
    <Icon name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={error ? colors.danger : colors.muted} />
    {onRetry ? <View style={styles.noticeBody}>{text}<Pressable accessibilityRole="button" hitSlop={6} onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && { opacity: .7 }]}><Text style={[styles.retryText, error && { color: colors.danger }]}>Reintentar</Text></Pressable></View> : text}
  </View>;
}
/** An empty or missing answer: the mediopunto off with one pane lit. `icon` is kept for callers; the window replaces it. */
export function EmptyState({ title, description, action, plain = false }: { title: string; description: string; icon?: IconName; action?: ReactNode; plain?: boolean }) {
  const { colors, styles } = useStyles();
  return <View style={[styles.empty, plain && styles.plainEmpty]}>
    {!plain && <Mediopunto state="off" width={140} ground={colors.surface} />}
    <Text accessibilityRole="header" style={[styles.emptyTitle, plain && styles.plainTitle]}>{title}</Text>
    <Text style={[styles.emptyDescription, plain && styles.plainDescription]}>{description}</Text>
    {action ? <View style={styles.emptyAction}>{action}</View> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 }, brandText: { fontWeight: '400', letterSpacing: -.4 }, brandStrong: { fontWeight: '800' },
  // DESIGN.md: 56 px pills; the secondary one is an outline with ink text.
  button: { minHeight: 56, borderRadius: rounded.pill, backgroundColor: colors.primaryFill, paddingVertical: 14, paddingHorizontal: 22, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.outline }, buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16, lineHeight: 20, flexShrink: 1, textAlign: 'center' },
  iconButton: { width: 44, minHeight: 44, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pill: { minHeight: 40, borderRadius: rounded.pill, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 7, alignItems: 'center' },
  pillActive: { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill }, pillText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 26, paddingBottom: 24 }, title: { ...typography.display, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  compactHeader: { paddingTop: 18, paddingBottom: 22, alignItems: 'flex-start' }, compactTitle: typography.displayLong,
  noticeBody: { flex: 1, gap: 8, alignItems: 'flex-start' }, retry: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }, retryText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  notice: { paddingVertical: 14, paddingHorizontal: 4, borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, noticeError: { backgroundColor: colors.softDanger, paddingHorizontal: 14 }, noticeText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20 },
  empty: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: rounded.cardLg },
  emptyTitle: { ...typography.sheetTitle, color: colors.ink, textAlign: 'center', maxWidth: 390, marginTop: 6 },
  emptyDescription: { fontSize: 15, lineHeight: 22, color: colors.body, maxWidth: 370, textAlign: 'center' },
  emptyAction: { width: '100%', maxWidth: 330, marginTop: 6 },
  plainEmpty: { alignItems: 'flex-start', maxWidth: 720, padding: 20, borderRadius: rounded.card, gap: 8 },
  plainTitle: { textAlign: 'left', ...typography.section, maxWidth: '100%' },
  plainDescription: { textAlign: 'left', maxWidth: '100%' },
}));
