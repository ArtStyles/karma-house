import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListingFilters } from '../domain/listings';
import { describeSearch, searchName, toSavedFilters } from '../searches/domain';
import { useSavedSearches } from '../searches/useSavedSearches';
import { createThemedStyles, internalLayout } from '../theme';
import { ActionGroup, Button, Notice } from './ui';

/** Mounted only while open, so Explorar asks for the saved searches only when someone saves one. */
export function SaveSearchSheet({ filters, onClose, onSaved }: { filters: ListingFilters; onClose(): void; onSaved(): void }) {
  const { colors, styles } = useStyles();
  const { save, saving, error } = useSavedSearches();
  const [name, setName] = useState(() => searchName(filters).slice(0, 60));
  // The hook also reports list errors; the sheet only shows the outcome of a save.
  const [tried, setTried] = useState(false);
  const lock = useRef(false);
  const insets = useSafeAreaInsets();
  const saved = toSavedFilters(filters);
  async function submit() {
    if (lock.current || saving || !name.trim()) return;
    lock.current = true;
    setTried(true);
    try { if (await save({ name: name.trim(), filters: saved, enabled: true })) onSaved(); }
    finally { lock.current = false; }
  }
  const close = () => { if (!saving && !lock.current) onClose(); };
  return <Modal transparent visible animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>Guardar búsqueda</Text>
            <Text style={styles.description}>Recibe avisos cuando se publiquen viviendas que coincidan con estos criterios.</Text>
            <View style={styles.criteria}><Text style={styles.label}>Criterios de búsqueda</Text><Text style={styles.description}>{describeSearch(saved)}</Text></View>
            <View style={styles.field}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput accessibilityLabel="Nombre de la búsqueda" value={name} onChangeText={setName} maxLength={60} editable={!saving} style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={styles.counter}>{name.length}/60</Text>
            </View>
            {tried && !!error && <Notice error>{error}</Notice>}
            <ActionGroup><Button label="Guardar" onPress={() => void submit()} loading={saving} disabled={!name.trim()} />
            <Button label="Cancelar" secondary onPress={close} disabled={saving} /></ActionGroup>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: internalLayout.gutter },
  sheet: { backgroundColor: colors.surface, width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: internalLayout.radius, overflow: 'hidden' },
  content: { padding: 20, gap: 20 }, criteria: { gap: 8, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, field: { gap: 8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.5, color: colors.ink }, description: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink }, counter: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'right' },
}));
