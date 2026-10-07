import { useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ListingFilters } from '../domain/listings';
import { describeSearch, searchName, toSavedFilters } from '../searches/domain';
import { useSavedSearches } from '../searches/useSavedSearches';
import { createThemedStyles } from '../theme';
import { Button, Icon, Notice } from './ui';

/** Mounted only while open, so Explorar asks for the saved searches only when someone saves one. */
export function SaveSearchSheet({ filters, onClose, onSaved }: { filters: ListingFilters; onClose(): void; onSaved(): void }) {
  const { colors, styles } = useStyles();
  const { save, saving, error } = useSavedSearches();
  const [name, setName] = useState(() => searchName(filters).slice(0, 60));
  // The hook also reports list errors; the sheet only shows the outcome of a save.
  const [tried, setTried] = useState(false);
  const insets = useSafeAreaInsets();
  const saved = toSavedFilters(filters);
  async function submit() {
    setTried(true);
    if (await save({ name: name.trim(), filters: saved, enabled: true })) onSaved();
  }
  const close = () => { if (!saving) onClose(); };
  return <Modal transparent visible animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.icon}><Icon name="bookmark-outline" color={colors.primary} size={28} /></View>
            <Text accessibilityRole="header" style={styles.title}>Guardar búsqueda</Text>
            <Text style={styles.description}>{describeSearch(saved)}</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput accessibilityLabel="Nombre de la búsqueda" value={name} onChangeText={setName} maxLength={60} editable={!saving} style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={styles.counter}>{name.length}/60</Text>
            {tried && !!error && <Notice error>{error}</Notice>}
            <Button label="Guardar" onPress={() => void submit()} loading={saving} disabled={!name.trim()} />
            <Button label="Cancelar" secondary onPress={close} disabled={saving} />
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { backgroundColor: colors.surface, width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: 28, overflow: 'hidden' },
  content: { padding: 24, gap: 14 }, icon: { width: 54, height: 54, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.5, color: colors.ink }, description: { fontSize: 15, lineHeight: 22, color: colors.muted },
  label: { fontSize: 13, fontWeight: '500', color: colors.muted },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, fontSize: 16, color: colors.ink }, counter: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: -6 },
}));
