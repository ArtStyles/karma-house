import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Icon, IconButton } from './ui';

export type SelectOption = { value: string; label: string };

export function SelectionField({ label, value, options, onChange, placeholder = 'Seleccionar', required = false, error, hint, disabled = false, inline = false }: {
  label: string; value: string; options: readonly SelectOption[]; onChange(value: string): void;
  placeholder?: string; required?: boolean; error?: string; hint?: string; disabled?: boolean; inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const selected = options.find(option => option.value === value);
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const visible = options.filter(option => normalize(option.label).includes(normalize(query.trim())));
  const close = () => { setOpen(false); setQuery(''); };
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); setQuery(''); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open]);

  const choices = <>
    {options.length > 8 && <View style={styles.search}><Icon name="search-outline" size={18} color={colors.muted} /><TextInput accessibilityLabel={`Buscar en ${label}`} placeholder="Buscar una opción" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.searchInput} autoCorrect={false} /></View>}
    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={inline ? styles.inlineList : styles.list} contentContainerStyle={styles.options}>
      {visible.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: value === option.value }} onPress={() => { onChange(option.value); close(); }} style={({ pressed }) => [styles.option, value === option.value && styles.selectedOption, pressed && { opacity: .65 }]}>
        <Text style={[styles.optionText, value === option.value && styles.selectedText]}>{option.label}</Text><Icon name={value === option.value ? 'checkmark-circle' : 'ellipse-outline'} color={value === option.value ? colors.primary : '#B7C1CE'} size={21} />
      </Pressable>)}
      {!visible.length && <Text style={styles.noResults}>No hay opciones con ese nombre.</Text>}
    </ScrollView>
  </>;

  return <View style={styles.field}>
    <Text style={styles.label}>{label}{required && <Text style={{ color: colors.primary }}> *</Text>}</Text>
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label || value || placeholder}`} accessibilityHint={error || hint} accessibilityState={{ expanded: open, disabled }} onPress={() => { setQuery(''); setOpen(!open); }} style={({ pressed }) => [styles.trigger, open && styles.triggerOpen, !!error && styles.triggerError, disabled && { opacity: .5 }, pressed && { opacity: .75 }]}>
      <Text style={[styles.value, !value && !selected && { color: colors.muted }]}>{selected?.label || value || placeholder}</Text><Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.primary} />
    </Pressable>
    {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {inline ? open && <View style={styles.inlinePanel}>{choices}</View> : <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar selección" onPress={close} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.header}><View style={styles.headerText}><Text style={styles.eyebrow}>ELIGE UNA OPCIÓN</Text><Text accessibilityRole="header" style={styles.title}>{label}</Text></View><IconButton name="close" label="Cerrar selector" onPress={close} style={{ backgroundColor: colors.paper }} /></View>
            {choices}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, field: { gap: 8 }, label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  trigger: { minHeight: 52, borderRadius: 15, backgroundColor: '#F4F6F9', borderWidth: 1, borderColor: '#E5EAF0', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, triggerOpen: { borderColor: colors.primary, backgroundColor: colors.softBlue }, triggerError: { borderColor: colors.danger },
  value: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.ink }, hint: { fontSize: 12, lineHeight: 18, color: colors.muted }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  overlay: { flex: 1, backgroundColor: '#14283D66', paddingHorizontal: 16, justifyContent: 'center' }, sheet: { backgroundColor: colors.white, borderRadius: 26, maxHeight: '90%', width: '100%', maxWidth: 480, alignSelf: 'center', overflow: 'hidden', flexShrink: 1 },
  header: { padding: 20, flexDirection: 'row', gap: 12, alignItems: 'center' }, headerText: { flex: 1, gap: 5 }, eyebrow: { color: colors.primary, fontSize: 9, fontWeight: '700', letterSpacing: 1 }, title: { color: colors.ink, fontSize: 23, fontWeight: '700', letterSpacing: -.5 },
  list: { flexShrink: 1 }, options: { padding: 12, gap: 5 }, option: { minHeight: 50, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, selectedOption: { backgroundColor: colors.softBlue }, optionText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 }, selectedText: { color: colors.primary, fontWeight: '600' },
  search: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.paper, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }, searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15, color: colors.ink }, noResults: { padding: 20, textAlign: 'center', color: colors.muted, fontSize: 14 },
  inlinePanel: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingTop: 12, backgroundColor: colors.white }, inlineList: { maxHeight: 230 },
});
