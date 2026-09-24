import { StyleSheet, Text, View } from 'react-native';
import type { MessageNegotiation } from '../../messaging/types';
import { noticeText } from '../../negotiations/presentation';
import { colors } from '../../theme';
import { Icon } from '../ui';

/** An answer to a proposal, shown as a quiet centred line instead of a chat bubble. */
export function NegotiationNotice({ answer, actorId, userId, otherName, time }: { answer: MessageNegotiation; actorId: string; userId: string; otherName: string; time: string }) {
  const icon = answer.action === 'accepted' ? 'checkmark-circle' : answer.action === 'declined' ? 'close-circle' : 'remove-circle-outline';
  const tint = answer.action === 'accepted' ? colors.green : answer.action === 'declined' ? colors.danger : colors.muted;
  return <View style={styles.row}><View style={styles.pill}>
    <Icon name={icon} size={16} color={tint} />
    <Text style={styles.text}>{noticeText(answer, actorId, userId, otherName)} · {time}</Text>
  </View></View>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: 6 },
  pill: { maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  text: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center' },
});
