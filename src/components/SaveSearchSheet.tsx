import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ListingFilters } from '../domain/listings';
import { describeSearch, searchName, toSavedFilters } from '../searches/domain';
import { useSavedSearches } from '../searches/useSavedSearches';
import { createThemedStyles, rounded } from '../theme';
import { Sheet } from './Sheet';
import { Button, Notice } from './ui';

/** Mounted only while open, so Explorar asks for the saved searches only when someone saves one. */
export function SaveSearchSheet({ filters, onClose, onSaved }: { filters: ListingFilters; onClose(): void; onSaved(): void }) {
  const { colors, styles } = useStyles();
  const { save, saving, error } = useSavedSearches();
  const [name, setName] = useState(() => searchName(filters).slice(0, 60));
  // The hook also reports list errors; the sheet only shows the outcome of a save.
  const [tried, setTried] = useState(false);
  const lock = useRef(false);
  const saved = toSavedFilters(filters);
  async function submit() {
    if (lock.current || saving || !name.trim()) return;
    lock.current = true;
    setTried(true);
    try { if (await save({ name: name.trim(), filters: saved, enabled: true })) onSaved(); }
    finally { lock.current = false; }
  }
  const close = () => { if (!saving && !lock.current) onClose(); };
  const criteria = describeSearch(saved);
  return <Sheet visible onClose={close} title="Guardar búsqueda">
    <Text style={styles.description}>Recibe avisos cuando se publiquen viviendas que coincidan con estos criterios.</Text>
    <View style={styles.field}><Text style={styles.label}>Criterios de búsqueda</Text>
      <View accessible accessibilityLabel={criteria} style={styles.criteria}>{criteria.split(' · ').map(item => <Text key={item} style={styles.chip}>{item}</Text>)}</View>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>Nombre</Text>
      <TextInput accessibilityLabel="Nombre de la búsqueda" value={name} onChangeText={setName} maxLength={60} editable={!saving} style={styles.input} placeholderTextColor={colors.muted} />
      <Text style={styles.counter}>{name.length}/60</Text>
    </View>
    {tried && !!error && <Notice error>{error}</Notice>}
    <View style={styles.actions}>
      <Button label="Cancelar" secondary onPress={close} disabled={saving} style={styles.cancel} />
      <Button label="Guardar" icon="notifications-outline" onPress={() => void submit()} loading={saving} disabled={!name.trim()} style={styles.save} />
    </View>
  </Sheet>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  description: { fontSize: 15, lineHeight: 21, color: colors.body }, field: { gap: 8, marginTop: 6 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.body },
  criteria: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: rounded.inner, backgroundColor: colors.surface },
  chip: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.primary, backgroundColor: colors.softBlue, paddingHorizontal: 12, paddingVertical: 6, borderRadius: rounded.pill, overflow: 'hidden' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.pill, paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  counter: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 }, cancel: { flexShrink: 1 }, save: { flex: 1 },
}));
