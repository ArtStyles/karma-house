import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Children, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle, type ColorValue } from 'react-native';
import { createThemedStyles, typography, useTheme } from '../theme';
import { MotionPressable } from './MotionPressable';
import { HeartIcon } from './HeartIcon';

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
    {loading ? <ActivityIndicator color={secondary ? colors.primary : colors.onPrimary} /> : icon ? <Icon name={icon} size={19} color={secondary ? colors.primary : colors.onPrimary} /> : null}
    <Text style={[styles.buttonText, secondary && { color: colors.primary }]}>{label}</Text>
  </MotionPressable>;
}
/** `active` left undefined marks a plain action; only a real toggle reports a pressed state. */
export function IconButton({ name, label, onPress, active, style }: { name: IconName; label: string; onPress: () => void; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useStyles();
  return <MotionPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} aria-pressed={active} style={({ pressed }) => [styles.iconButton, pressed && { opacity: .7 }, style]}>
    {(name==='heart'||name==='heart-outline')&&typeof active==='boolean'?<HeartIcon active={active}><Icon name={name} size={22} color={active ? colors.primary : colors.ink}/></HeartIcon>:<Icon name={name} size={22} color={active ? colors.primary : colors.ink} />}
  </MotionPressable>;
}
export function Pill({ label, active = false, onPress, icon, accessibilityLabel }: { label: string; active?: boolean; onPress: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const { colors, styles } = useStyles();
  return <MotionPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: active }} aria-pressed={active} style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: .7 }]}>
    {icon && <Icon name={icon} size={17} color={active ? colors.primary : colors.muted} />}
    <Text style={[styles.pillText, active && { color: colors.primary }]}>{label}</Text>
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
export function EmptyState({ title, description, icon = 'home-outline', action, plain = false }: { title: string; description: string; icon?: IconName; action?: ReactNode; plain?: boolean }) {
  const { colors, styles } = useStyles();
  return <View style={[styles.empty, plain && styles.plainEmpty]}>
    {!plain && <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emptyArtwork}>
      <View style={styles.emptyHalo} />
      <View style={styles.emptyBackCard}><View style={styles.emptyCardLine} /><View style={[styles.emptyCardLine, styles.emptyShortLine]} /></View>
      <View style={styles.emptyIcon}><Icon name={icon} color={colors.primary} size={31} /></View>
      <View style={styles.emptyAccent} />
      <View style={styles.emptyGround} />
    </View>}
    <Text accessibilityRole="header" style={[styles.emptyTitle, plain && styles.plainTitle]}>{title}</Text>
    <Text style={[styles.emptyDescription, plain && styles.plainDescription]}>{description}</Text>
    {action ? <View style={styles.emptyAction}>{action}</View> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 }, brandText: { fontWeight: '400', letterSpacing: -.4 }, brandStrong: { fontWeight: '800' },
  button: { minHeight: 52, borderRadius: 26, backgroundColor: colors.primaryFill, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.softBlue }, buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16, flexShrink: 1, textAlign: 'center' },
  iconButton: { width: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.surface, flexDirection: 'row', gap: 7, alignItems: 'center' },
  pillActive: { backgroundColor: colors.softBlue }, pillText: { fontSize: 14, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 26, paddingBottom: 24 }, title: { ...typography.display, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  compactHeader: { paddingTop: 18, paddingBottom: 22, alignItems: 'flex-start' }, compactTitle: typography.displayLong,
  noticeBody: { flex: 1, gap: 8, alignItems: 'flex-start' }, retry: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }, retryText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  notice: { paddingVertical: 14, paddingHorizontal: 4, borderRadius: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, noticeError: { backgroundColor: colors.softDanger, paddingHorizontal: 14 }, noticeText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20 },
  empty: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 26, borderWidth: 1, borderColor: colors.border, boxShadow: '0 4px 18px rgba(32, 62, 94, 0.025)' },
  emptyArtwork: { width: 150, height: 90, marginBottom: 2 },
  emptyHalo: { position: 'absolute', width: 134, height: 65, borderRadius: 38, backgroundColor: colors.softBlue, left: 9, top: 10, transform: [{ rotate: '-9deg' }] },
  emptyBackCard: { position: 'absolute', width: 55, height: 63, borderRadius: 14, backgroundColor: colors.blueDecoration, borderWidth: 2, borderColor: colors.border, left: 32, top: 7, transform: [{ rotate: '-14deg' }], padding: 11, justifyContent: 'flex-end', gap: 5 },
  emptyCardLine: { width: 26, height: 4, borderRadius: 2, backgroundColor: colors.blueLine }, emptyShortLine: { width: 18 },
  emptyIcon: { position: 'absolute', width: 62, height: 65, borderRadius: 17, backgroundColor: colors.surface, left: 63, top: 12, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '7deg' }], boxShadow: '0 5px 12px rgba(35, 89, 150, 0.08)' },
  emptyAccent: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface, left: 24, top: 18 },
  emptyGround: { position: 'absolute', width: 64, height: 4, borderRadius: 2, backgroundColor: colors.softNeutral, left: 49, bottom: 0 },
  emptyTitle: { fontSize: 21, lineHeight: 27, letterSpacing: -0.45, color: colors.ink, textAlign: 'center', fontWeight: '600', maxWidth: 390 },
  emptyDescription: { fontSize: 14, lineHeight: 22, color: colors.muted, maxWidth: 370, textAlign: 'center' },
  emptyAction: { width: '100%', maxWidth: 330, marginTop: 6 },
  plainEmpty: { alignItems: 'flex-start', maxWidth: 720, padding: 20, borderRadius: 16, boxShadow: 'none', gap: 8 },
  plainTitle: { textAlign: 'left', fontSize: 19, lineHeight: 26, maxWidth: '100%' },
  plainDescription: { textAlign: 'left', maxWidth: '100%' },
}));
