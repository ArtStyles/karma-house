import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage, PendingMessage } from '../../messaging/types';
import { colors } from '../../theme';
import { Icon } from '../ui';

export type MessageRow = { key: string; message: ChatMessage; pending?: never } | { key: string; pending: PendingMessage; message?: never };

export function MessageBubble({ row, own, canRetry, busy, onRetry, onDiscard }: { row: MessageRow; own: boolean; canRetry: boolean; busy: boolean; onRetry: () => void; onDiscard: () => void }) {
  const item = row.message ?? row.pending;
  const failed = row.pending?.status === 'failed';
  return <View style={[styles.row, own && styles.ownRow]}>
    <View style={[styles.bubble, own && styles.ownBubble, failed && styles.failedBubble]}>
      <Text selectable style={[styles.body, own && styles.ownBody]}>{item.body}</Text>
      <View style={styles.metadata}>
        <Text style={[styles.time, own && styles.ownTime]}>{new Date(item.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</Text>
        {own && <Text style={[styles.time, styles.ownTime]}>{row.pending ? failed ? 'No enviado' : 'Enviando…' : 'Enviado'}</Text>}
      </View>
    </View>
    {failed && <View style={styles.failure}>
      {!!row.pending?.error && <Text style={styles.error}>{row.pending.error}</Text>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Reintentar mensaje" accessibilityState={{ disabled: busy || !canRetry }} disabled={busy || !canRetry} onPress={onRetry} style={({ pressed }) => [styles.action, (pressed || busy || !canRetry) && styles.dimmed]}>
          <Icon name="refresh-outline" size={16} color={colors.primary} /><Text style={styles.actionText}>Reintentar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Descartar mensaje no enviado" disabled={busy} onPress={onDiscard} style={({ pressed }) => [styles.action, (pressed || busy) && styles.dimmed]}>
          <Text style={styles.discardText}>Descartar</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', paddingVertical: 5 }, ownRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '87%', paddingHorizontal: 15, paddingTop: 11, paddingBottom: 8, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.white },
  ownBubble: { backgroundColor: colors.primary, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
  failedBubble: { backgroundColor: '#375D88' }, body: { color: colors.ink, fontSize: 16, lineHeight: 23 }, ownBody: { color: colors.white },
  metadata: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  time: { fontSize: 10, lineHeight: 15, color: colors.muted }, ownTime: { color: '#E0EEFF' },
  failure: { maxWidth: '90%', alignItems: 'flex-end', paddingTop: 5 }, error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 16 }, action: { minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 2 },
  actionText: { color: colors.primary, fontWeight: '600', fontSize: 13 }, discardText: { color: colors.muted, fontSize: 13 }, dimmed: { opacity: 0.45 },
});
