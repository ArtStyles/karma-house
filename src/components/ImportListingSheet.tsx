import { useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseListingText, type ImportResult } from '../domain/importListing';
import { createThemedStyles } from '../theme';
import { ActionGroup, Button, Icon, Notice } from './ui';

const MAX_LENGTH = 4000;
const MIN_LENGTH = 20;

/** Mounted only while open. The text is pasted with the system gesture; there is no clipboard button. */
export function ImportListingSheet({ onClose, onImport, preserveDraft = false }: { onClose(): void; onImport(result: ImportResult): string | void; preserveDraft?: boolean }) {
  const { colors, styles } = useStyles();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.icon}><Icon name="clipboard-outline" color={colors.primary} size={28} /></View>
            <Text accessibilityRole="header" style={styles.title}>Pegar anuncio</Text>
            <Text style={styles.description}>Pega el texto tal cual. Rellenamos lo que diga y tú revisas el resto. Quitamos teléfonos y enlaces: en KarmaHouse se habla por el chat.</Text>
            {preserveDraft && <Text style={styles.description}>Completamos solo los campos vacíos. Conservamos tu operación, los datos escritos y tus fotos.</Text>}
            <TextInput accessibilityLabel="Texto del anuncio" value={text} onChangeText={value => { setText(value); setError(''); }} maxLength={MAX_LENGTH} multiline textAlignVertical="top"
              placeholder="Pega aquí tu anuncio de Revolico o WhatsApp" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.counter}>{text.length}/{MAX_LENGTH}</Text>
            {Boolean(error) && <Notice error>{error}</Notice>}
            <ActionGroup direction="vertical">
              <Button label="Analizar" icon="sparkles-outline" disabled={text.trim().length < MIN_LENGTH} onPress={() => setError(onImport(parseListingText(text)) ?? '')} />
              <Button label="Cancelar" secondary onPress={onClose} />
            </ActionGroup>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { backgroundColor: colors.surface, width: '100%', maxWidth: 560, maxHeight: '100%', alignSelf: 'center', borderRadius: 20, overflow: 'hidden' },
  content: { padding: 20, gap: 16 }, icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.5, color: colors.ink }, description: { fontSize: 15, lineHeight: 22, color: colors.muted },
  input: { minHeight: 200, maxHeight: 360, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, fontSize: 16, lineHeight: 22, color: colors.ink },
  counter: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: -6 },
}));
