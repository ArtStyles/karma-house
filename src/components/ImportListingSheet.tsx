import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { parseListingText, type ImportResult } from '../domain/importListing';
import { createThemedStyles, rounded } from '../theme';
import { Sheet } from './Sheet';
import { Button, Notice } from './ui';

const MAX_LENGTH = 4000;
const MIN_LENGTH = 20;

/** Mounted only while open. The text is pasted with the system gesture; there is no clipboard button. */
export function ImportListingSheet({ onClose, onImport, preserveDraft = false }: { onClose(): void; onImport(result: ImportResult): string | void; preserveDraft?: boolean }) {
  const { colors, styles } = useStyles();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return <Sheet visible onClose={onClose} title="Pegar anuncio">
    <Text style={styles.description}>Pega el texto tal cual. Rellenamos lo que diga y tú revisas el resto. Quitamos teléfonos y enlaces: en KarmaHouse se habla por el chat.</Text>
    {preserveDraft && <Text style={styles.description}>Completamos solo los campos vacíos. Conservamos tu operación, los datos escritos y tus fotos.</Text>}
    <TextInput accessibilityLabel="Texto del anuncio" value={text} onChangeText={value => { setText(value); setError(''); }} maxLength={MAX_LENGTH} multiline textAlignVertical="top"
      placeholder="Pega aquí tu anuncio de Revolico o WhatsApp" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.counter}>{text.length}/{MAX_LENGTH}</Text>
    {Boolean(error) && <Notice error>{error}</Notice>}
    <View style={styles.actions}>
      <Button label="Cancelar" secondary onPress={onClose} style={styles.cancel} />
      <Button label="Analizar" icon="sparkles-outline" disabled={text.trim().length < MIN_LENGTH} onPress={() => setError(onImport(parseListingText(text)) ?? '')} style={styles.analyze} />
    </View>
  </Sheet>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  description: { fontSize: 15, lineHeight: 22, color: colors.body },
  input: { minHeight: 180, maxHeight: 320, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: rounded.card, paddingVertical: 14, paddingHorizontal: 18, fontSize: 16, lineHeight: 22, color: colors.ink },
  counter: { color: colors.muted, fontSize: 12, textAlign: 'right', marginTop: -6 },
  // Side by side when both fit; stacked at 320 px with a large text size.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }, cancel: { flexGrow: 1, flexBasis: 110 }, analyze: { flexGrow: 2, flexBasis: 160 },
}));
