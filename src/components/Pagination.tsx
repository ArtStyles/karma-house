import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { createThemedStyles, rounded, spacing, typography } from '../theme';
import { MotionPressable } from './MotionPressable';
import { Icon } from './ui';

/** Numbered pages for long lists: arrows and Calistoga numbers in 44 px circles, the current one in blue. Pages start at 1. */
export function Pagination({ page, pages, onChange, label }: { page: number; pages: number; onChange(page: number): void; label: string }) {
  const { colors, styles } = useStyles();
  // At 320 px only arrows and three numbers fit in one row.
  const span = useWindowDimensions().width < 360 ? 3 : 5;
  if (pages < 2) return null;
  const first = Math.max(1, Math.min(page - Math.floor(span / 2), pages - span + 1));
  const numbers = Array.from({ length: Math.min(span, pages) }, (_, i) => first + i);
  const arrow = (to: number, name: 'chevron-back' | 'chevron-forward', text: string) => {
    const disabled = to < 1 || to > pages;
    return <MotionPressable accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => onChange(to)} style={({ pressed }) => [styles.circle, styles.arrow, disabled && { opacity: .4 }, pressed && { opacity: .7 }]}>
      <Icon name={name} size={18} color={colors.ink} />
    </MotionPressable>;
  };
  return <View role="navigation" aria-label={label} style={styles.row}>
    {arrow(page - 1, 'chevron-back', 'Página anterior')}
    {numbers.map(n => {
      const current = n === page;
      return <MotionPressable key={n} accessibilityRole="button" accessibilityLabel={`Página ${n}`} accessibilityState={{ selected: current }} aria-current={current ? 'page' : undefined}
        onPress={() => { if (!current) onChange(n); }} style={({ pressed }) => [styles.circle, current && styles.current, pressed && { opacity: .7 }]}>
        <Text style={[styles.number, current && { color: colors.onPrimary }]}>{n}</Text>
      </MotionPressable>;
    })}
    {arrow(page + 1, 'chevron-forward', 'Página siguiente')}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.gapXs },
  circle: { width: spacing.touch, height: spacing.touch, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center' },
  arrow: { backgroundColor: colors.surface }, current: { backgroundColor: colors.primaryFill },
  number: { ...typography.cardTitle, color: colors.body, fontVariant: ['tabular-nums'] },
}));
