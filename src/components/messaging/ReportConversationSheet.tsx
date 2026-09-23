import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createMessageId } from '../../messaging/domain';
import type { ReportReason } from '../../messaging/types';
import { colors } from '../../theme';
import { Button, Icon, Notice, Pill } from '../ui';

const chatReasons: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' }, { value: 'fraud', label: 'Posible fraude' },
  { value: 'harassment', label: 'Acoso' }, { value: 'other', label: 'Otro' },
];

type SheetProps<R extends string> = {
  visible: boolean; onClose: () => void; onReport: (reason: R, details: string, id: string) => Promise<void>;
  reasons?: { value: R; label: string }[]; title?: string; description?: string; confirmation?: string;
};

/** Defaults describe a conversation report; a listing report passes its own reasons and copy. */
export function ReportConversationSheet<R extends string = ReportReason>({ visible, onClose, onReport,
  reasons = chatReasons as { value: R; label: string }[], title = 'Reportar conversación',
  description = 'Cuéntanos qué ocurre. El reporte incluirá los mensajes recientes para que podamos revisarlo.',
  confirmation = 'El equipo de KarmaHouse podrá revisar tu reporte y los mensajes recientes de esta conversación.' }: SheetProps<R>) {
  const [reason, setReason] = useState<R>(reasons[0].value);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const attempt = useRef<{ id: string; reason: R; details: string } | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const insets = useSafeAreaInsets();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!attempt.current || attempt.current.reason !== reason || attempt.current.details !== details.trim()) attempt.current = { id: createMessageId(), reason, details: details.trim() };
      const current = attempt.current;
      await onReport(current.reason, current.details, current.id);
      if (mounted.current) setConfirmed(true);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No pudimos confirmar tu reporte. Reintenta para enviarlo.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function close() {
    if (busy) return;
    if (confirmed) { setConfirmed(false); setReason(reasons[0].value); setDetails(''); setError(''); attempt.current = null; }
    onClose();
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.icon}><Icon name={confirmed ? 'checkmark-circle-outline' : 'flag-outline'} color={colors.primary} size={28} /></View>
          <Text accessibilityRole="header" style={styles.title}>{confirmed ? 'Reporte recibido' : title}</Text>
          {confirmed ? <>
            <Text style={styles.description}>{confirmation}</Text>
            <Button label="Listo" onPress={close} />
          </> : <>
            <Text style={styles.description}>{description}</Text>
            <View style={styles.reasons}>{reasons.map(item => <View key={item.value} pointerEvents={busy ? 'none' : 'auto'}><Pill label={item.label} active={reason === item.value} onPress={() => { if (!busy) { setReason(item.value); setError(''); } }} /></View>)}</View>
            <Text style={styles.label}>Comentario (opcional)</Text>
            <TextInput accessibilityLabel="Comentario del reporte" value={details} onChangeText={setDetails} multiline maxLength={1000} editable={!busy} placeholder="Añade información que nos ayude a entenderlo." placeholderTextColor={colors.muted} style={styles.input} textAlignVertical="top" />
            <Text style={styles.counter}>{details.length}/1000</Text>
            {!!error && <Notice error>{error}</Notice>}
            <Button label={error ? 'Reintentar reporte' : 'Enviar reporte'} onPress={submit} loading={busy} />
            <Button label="Cancelar" secondary onPress={close} disabled={busy} />
          </>}
        </ScrollView>
      </View>
    </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#17233170', justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { backgroundColor: colors.white, width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: 28, overflow: 'hidden' },
  content: { padding: 24, gap: 14 }, icon: { width: 54, height: 54, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.5, color: colors.ink }, description: { fontSize: 15, lineHeight: 22, color: colors.muted },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.paper, borderRadius: 18, padding: 7 }, label: { fontSize: 13, fontWeight: '500', color: colors.muted },
  input: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, fontSize: 15, lineHeight: 22, color: colors.ink }, counter: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: -6 },
});
