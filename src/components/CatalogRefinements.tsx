import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ListingFilters } from '../domain/listings';
import { PROVINCES } from '../domain/listingOptions';
import { createThemedStyles, rounded, typography } from '../theme';
import { SelectionField } from './SelectionField';
import { Icon } from './ui';
import { MotionPressable } from './MotionPressable';

const operations = [
  { value: 'offers', label: 'Venta y permuta' }, { value: 'sale', label: 'Venta' },
  { value: 'swap', label: 'Permuta' }, { value: 'rent', label: 'Alquiler' }, { value: 'wanted', label: 'Busco' },
] as const;
const provinces = [{ value: '', label: 'Toda Cuba' }, ...PROVINCES.map(value => ({ value, label: value }))];

/** The operation as Calistoga tabs; one row that slides when it does not fit. */
export function OperationTabs({ value, onChange, disabled = false }: { value: ListingFilters['operation']; onChange(value: NonNullable<ListingFilters['operation']>): void; disabled?: boolean }) {
  const { styles } = useStyles();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityRole="tablist" accessibilityLabel="Operación"
    style={[styles.tabsRow, disabled && { opacity: .45 }]} contentContainerStyle={styles.tabs}>
    {operations.map(operation => {
      const selected = (value ?? 'offers') === operation.value;
      return <MotionPressable key={operation.value} accessibilityRole="tab" accessibilityLabel={operation.label} accessibilityState={{ selected, disabled }} aria-selected={selected}
        disabled={disabled} onPress={() => { if (!selected) onChange(operation.value); }} style={({ pressed }) => [styles.tab, pressed && { opacity: .7 }]}>
        <Text style={[styles.tabText, selected && styles.selected]}>{operation.label}</Text>
        <View style={[styles.mark, selected && styles.markOn]} />
      </MotionPressable>;
    })}
  </ScrollView>;
}

/** «Buscando en La Habana»: the province, at the head of Explorar. */
export function ProvincePicker({ value, onChange, disabled = false }: { value: string | undefined; onChange(value: string): void; disabled?: boolean }) {
  const { colors, styles } = useStyles();
  const selected = provinces.find(option => option.value === (value ?? ''))?.label ?? value ?? '';
  return <SelectionField label="Provincia" value={value ?? ''} options={provinces} onChange={onChange} disabled={disabled}
    renderTrigger={open => <MotionPressable accessibilityRole="button" accessibilityLabel={`Buscando en ${selected}. Cambiar provincia`} accessibilityState={{ disabled }}
      disabled={disabled} onPress={open} style={({ pressed }) => [styles.place, disabled && { opacity: .45 }, pressed && { opacity: .7 }]}>
      <Text style={styles.caption}>Buscando en</Text>
      <View style={styles.placeRow}><Text numberOfLines={1} style={styles.placeName}>{selected}</Text><Icon name="chevron-down" size={16} color={colors.sol} /></View>
    </MotionPressable>} />;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  tabsRow: { marginHorizontal: -16, flexGrow: 0 }, tabs: { paddingHorizontal: 16, gap: 18 },
  tab: { minHeight: 44, justifyContent: 'center', gap: 4 },
  tabText: { ...typography.section, color: colors.muted }, selected: { color: colors.ink },
  mark: { height: 3, width: 22, borderRadius: rounded.pill, backgroundColor: 'transparent' }, markOn: { backgroundColor: colors.primary },
  place: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  caption: { ...typography.caption, color: colors.muted },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  placeName: { ...typography.section, color: colors.ink, flexShrink: 1 },
}));
