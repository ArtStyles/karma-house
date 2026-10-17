import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, rounded } from '../theme';
import { MotionPressable } from './MotionPressable';

/** DESIGN.md segmented control: a surface pill with the chosen option in blue. Options share the width. */
export function Segmented<T extends string>({ options, value, onChange, label, disabled = false }: {
  options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void; label: string; disabled?: boolean;
}) {
  const { styles } = useStyles();
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.track, disabled && { opacity: .45 }]}>
    {options.map(option => {
      const selected = option.value === value;
      return <MotionPressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected, disabled }} aria-selected={selected}
        disabled={disabled} onPress={() => { if (!selected) onChange(option.value); }} style={[styles.option, selected && styles.selected]}>
        <Text numberOfLines={1} style={[styles.text, selected && styles.selectedText]}>{option.label}</Text>
      </MotionPressable>;
    })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: rounded.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  option: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primaryFill },
  text: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.body }, selectedText: { color: colors.onPrimary },
}));
