import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListingFilters } from '../domain/listings';
import { PROVINCES } from '../domain/listingOptions';
import { createThemedStyles } from '../theme';
import { SelectionField } from './SelectionField';
import { Icon } from './ui';

const operations = [
  { value: 'offers', label: 'Venta y permuta' }, { value: 'sale', label: 'Venta' },
  { value: 'swap', label: 'Permuta' }, { value: 'rent', label: 'Alquiler' }, { value: 'wanted', label: 'Busco' },
];
const provinces = [{ value: '', label: 'Toda Cuba' }, ...PROVINCES.map(value => ({ value, label: value }))];

export function CatalogRefinements({ filters, onChange, disabled = false }: {
  filters: ListingFilters; onChange(next: Partial<ListingFilters>): void; disabled?: boolean;
}) {
  const { colors, styles } = useStyles();
  const fields = [
    { label: 'Operación', value: filters.operation ?? 'offers', options: operations,
      change: (value: string) => onChange({ operation: value as ListingFilters['operation'] }) },
    { label: 'Provincia', value: filters.province ?? '', options: provinces,
      change: (value: string) => onChange({ province: value }) },
  ];
  return <View style={[styles.bar, disabled && { opacity: .45 }]}>
    {fields.map((field, index) => {
      const selected = field.options.find(option => option.value === field.value)?.label ?? field.value;
      return <View key={field.label} style={[styles.field, index === 0 && styles.operation]}>
        {index > 0 && <View style={styles.divider} />}
        <SelectionField label={field.label} value={field.value} options={field.options} onChange={field.change} disabled={disabled}
          renderTrigger={open => <Pressable accessibilityRole="button" accessibilityLabel={`${field.label}: ${selected}`}
            accessibilityState={{ disabled }} disabled={disabled} onPress={open}
            style={({ pressed }) => [styles.trigger, pressed && { opacity: .65 }]}>
            <Text numberOfLines={1} style={styles.value}>{selected}</Text><Icon name="chevron-down" size={14} color={colors.muted} />
          </Pressable>} />
      </View>;
    })}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', maxWidth: 640, minHeight: 52, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 3 },
  field: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }, operation: { flex: 1.2 },
  divider: { width: 1, height: 23, backgroundColor: colors.border },
  trigger: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '500' },
}));
