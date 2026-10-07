import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SORT_OPTIONS } from '../catalog/sortOptions';
import type { ListingFilters } from '../domain/listings';
import { createThemedStyles } from '../theme';
import { Icon } from './ui';

/** A small menu anchored to the current order; choosing never touches the other filters. */
export function CatalogSortMenu({ value, onChange, disabled = false }: {
  value: ListingFilters['sort']; onChange(value: ListingFilters['sort']): void; disabled?: boolean;
}) {
  const { colors, styles } = useStyles();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selected = SORT_OPTIONS.find(option => option.value === value)!;
  const close = useCallback(() => {
    setAnchor(null);
    // Restore keyboard focus to the trigger after dismissing the web modal.
    if (Platform.OS === 'web') requestAnimationFrame(() => (trigger.current as unknown as HTMLElement | null)?.focus());
  }, []);

  useEffect(() => { setAnchor(null); }, [disabled, width, height]);
  useEffect(() => {
    if (!anchor || Platform.OS !== 'web') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [anchor, close]);

  const menuWidth = Math.min(224, width - 24 - insets.left - insets.right);
  const menuHeight = 248;
  const left = anchor ? Math.max(insets.left + 12, Math.min(anchor.x + anchor.width - menuWidth, width - insets.right - menuWidth - 12)) : 0;
  const bottomLimit = height - insets.bottom - 12;
  const top = anchor ? Math.max(insets.top + 12, anchor.y + anchor.height + 6 + menuHeight <= bottomLimit
    ? anchor.y + anchor.height + 6 : anchor.y - menuHeight - 6) : 0;

  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Ordenar viviendas: ${selected.label}`}
      accessibilityState={{ expanded: !!anchor, disabled }} aria-haspopup="menu" disabled={disabled}
      onPress={() => trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))}
      style={({ pressed }) => [styles.trigger, pressed && { opacity: .7 }]}>
      <Text style={styles.triggerText}>{selected.label}</Text><Icon name={anchor ? 'chevron-up' : 'chevron-down'} size={13} color={colors.muted} />
    </Pressable>
    <Modal visible={!!anchor && !disabled} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones de orden" style={StyleSheet.absoluteFill} onPress={close} />
        <View accessibilityViewIsModal accessibilityRole="menu" accessibilityLabel="Ordenar viviendas"
          style={[styles.menu, { top, left, width: menuWidth, maxHeight: Math.max(0, bottomLimit - top) }]}>
          <Text style={styles.heading}>Ordenar por</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {SORT_OPTIONS.map(option => <Pressable key={option.value} accessibilityRole="menuitem"
              accessibilityLabel={option.label} accessibilityState={{ selected: value === option.value }}
              onPress={() => { if (!disabled) onChange(option.value); close(); }}
              style={({ pressed }) => [styles.option, value === option.value && styles.selected, pressed && { opacity: .7 }]}>
              <Text style={[styles.optionText, value === option.value && styles.selectedText]}>{option.label}</Text>
              {value === option.value && <Icon name="checkmark" size={19} color={colors.primary} />}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  trigger: { flexDirection: 'row', minHeight: 44, gap: 4, alignItems: 'center' },
  triggerText: { fontSize: 13, color: colors.muted },
  overlay: { flex: 1, backgroundColor: colors.subtleOverlay },
  menu: { position: 'absolute', padding: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: '0 6px 24px rgba(20,40,61,0.16)' },
  heading: { color: colors.muted, fontSize: 12, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 9 },
  option: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11 },
  selected: { backgroundColor: colors.softBlue },
  optionText: { flex: 1, fontSize: 15, color: colors.ink },
  selectedText: { color: colors.primary, fontWeight: '600' },
}));
