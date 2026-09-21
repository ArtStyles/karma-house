import { StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '../../notifications/types';
import { colors } from '../../theme';
import { Button, Icon, type IconName } from '../ui';

const categoryIcons: Record<AppNotification['category'], IconName> = {
  message: 'chatbubble-outline', visit: 'calendar-outline', offer: 'pricetag-outline',
};
const categoryLabels: Record<AppNotification['category'], string> = { message: 'Mensaje', visit: 'Visita', offer: 'Oferta' };

export function NotificationCard({ item, busy, marking, onOpen, onRead }: {
  item: AppNotification; busy: boolean; marking: boolean; onOpen(): void; onRead(): void;
}) {
  const unread = item.readAt === null;
  const timestamp = new Intl.DateTimeFormat('es-CU', {
    timeZone: 'America/Havana', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(item.createdAt));
  return <View style={[styles.card, unread && styles.unread]}>
    <View style={styles.heading}>
      <View style={styles.icon}><Icon name={categoryIcons[item.category]} color={colors.primary} size={21} /></View>
      <View style={styles.headingCopy}>
        <Text style={styles.category}>{categoryLabels[item.category]}</Text>
        <Text style={styles.date}>{timestamp} · Cuba</Text>
      </View>
      {unread && <View accessibilityLabel="Sin leer" style={styles.dot} />}
    </View>
    <View style={styles.copy}>
      <Text numberOfLines={2} style={styles.actor}>{item.actorName}</Text>
      <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
      <View style={styles.property}><Icon name="home-outline" size={15} color={colors.muted} /><Text style={styles.propertyText}>{item.propertyTitle}</Text></View>
    </View>
    <View style={styles.actions}>
      <Button label="Abrir conversación" secondary onPress={onOpen} style={styles.action} />
      {unread
        ? <Button label="Marcar como leído" secondary icon="checkmark-outline" loading={marking} disabled={busy} onPress={onRead} style={[styles.action, styles.readAction]} />
        : <View style={styles.readLabel}><Icon name="checkmark-circle-outline" size={16} color={colors.muted} /><Text style={styles.readText}>Leído</Text></View>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: '#E9ECF1', padding: 18, gap: 16 },
  unread: { borderColor: '#D6E5F8' }, heading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, minWidth: 0, gap: 3 }, category: { color: colors.primary, fontSize: 12, fontWeight: '600' }, date: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }, copy: { gap: 8 }, title: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: colors.ink, fontWeight: '600' },
  actor: { fontSize: 13, lineHeight: 19, color: colors.ink, fontWeight: '600' }, body: { fontSize: 14, lineHeight: 21, color: colors.muted }, property: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingTop: 3 }, propertyText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, color: colors.muted },
  actions: { gap: 4 }, action: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 12 }, readAction: { backgroundColor: 'transparent' }, readLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34 }, readText: { fontSize: 12, color: colors.muted },
});
