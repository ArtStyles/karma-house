import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage, PendingMessage } from '../../messaging/types';
import { createThemedStyles, rounded, typography } from '../../theme';
import { ActionGroup, Icon } from '../ui';

export type MessageRow = { key: string; message: ChatMessage; pending?: never } | { key: string; pending: PendingMessage; message?: never };

type BubbleRow = { key: string; message: Pick<ChatMessage, 'body' | 'createdAt'>; pending?: never } | { key: string; pending: PendingMessage; message?: never };

/** `showStatus` marks the latest own message; pending and failed ones always show their state. `author` names who wrote it in a group chat; a `teammate` writes on the reader's side in a soft tone. */
export function MessageBubble({ row, own, teammate = false, author, showStatus = false, canRetry, busy, onRetry, onDiscard }: { row: BubbleRow; own: boolean; teammate?: boolean; author?: string; showStatus?: boolean; canRetry: boolean; busy: boolean; onRetry: () => void; onDiscard: () => void }) {
  const { colors, styles } = useStyles();
  const item = row.message ?? row.pending;
  const failed = row.pending?.status === 'failed';
  return <View style={[styles.row, (own || teammate) && styles.ownRow]}>
    <View style={[styles.bubble, own && styles.ownBubble, teammate && styles.teamBubble, failed && styles.failedBubble]}>
      {!!author && !own && <Text numberOfLines={1} style={styles.author}>{author}</Text>}
      <Text selectable style={[styles.body, own && styles.ownBody]}>{item.body}</Text>
      <View style={styles.metadata}>
        <Text style={[styles.time, own && styles.ownTime]}>{new Date(item.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</Text>
        {own && (row.pending || showStatus) && <Text style={[styles.time, styles.ownTime]}>{row.pending ? failed ? 'No enviado' : 'Enviando…' : 'Enviado'}</Text>}
      </View>
    </View>
    {failed && <View style={styles.failure}>
      {!!row.pending?.error && <Text style={styles.error}>{row.pending.error}</Text>}
      <ActionGroup style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Reintentar mensaje" accessibilityState={{ disabled: busy || !canRetry }} disabled={busy || !canRetry} onPress={onRetry} style={({ pressed }) => [styles.action, (pressed || busy || !canRetry) && styles.dimmed]}>
          <Icon name="refresh-outline" size={16} color={colors.primary} /><Text style={styles.actionText}>Reintentar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Descartar mensaje no enviado" disabled={busy} onPress={onDiscard} style={({ pressed }) => [styles.action, (pressed || busy) && styles.dimmed]}>
          <Text style={styles.discardText}>Descartar</Text>
        </Pressable>
      </ActionGroup>
    </View>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { alignItems: 'flex-start', paddingVertical: 5 }, ownRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '84%', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderRadius: rounded.inner, borderBottomLeftRadius: 8, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  ownBubble: { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill, borderBottomLeftRadius: rounded.inner, borderBottomRightRadius: 8 },
  teamBubble: { backgroundColor: colors.softBlue, borderColor: colors.softBlue, borderBottomLeftRadius: rounded.inner, borderBottomRightRadius: 8 },
  failedBubble: { backgroundColor: colors.primaryFill }, author: { ...typography.label, color: colors.body, marginBottom: 2 }, body: { color: colors.ink, fontSize: 16, lineHeight: 23 }, ownBody: { color: colors.onPrimary },
  metadata: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  time: { fontSize: 12, lineHeight: 16, color: colors.muted }, ownTime: { color: colors.onPrimaryMuted },
  failure: { width: '92%', maxWidth: 380, gap: 8, paddingTop: 8 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  actions: { gap: 12 }, action: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  actionText: { flexShrink: 1, color: colors.primary, fontWeight: '600', fontSize: 13, lineHeight: 19 }, discardText: { flexShrink: 1, color: colors.muted, fontSize: 13, lineHeight: 19 }, dimmed: { opacity: 0.45 },
}));
