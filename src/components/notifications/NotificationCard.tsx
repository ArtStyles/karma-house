import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '../../notifications/types';
import { createThemedStyles, rounded, type ThemeColors } from '../../theme';
import { Icon, type IconName } from '../ui';

const categoryIcons: Record<AppNotification['category'], IconName> = {
  message: 'chatbubble-outline', visit: 'calendar-outline', offer: 'pricetag-outline', alert: 'search-outline', agency: 'business-outline',
};
const categoryLabels: Record<AppNotification['category'], string> = { message: 'Mensaje', visit: 'Visita', offer: 'Oferta', alert: 'Alerta', agency: 'Inmobiliaria' };

export function NotificationCard({ item, busy, marking, onOpen, onRead }: {
  item: AppNotification; busy: boolean; marking: boolean; onOpen(): void; onRead(): void;
}) {
  const { colors, styles } = useStyles();
  const unread = item.readAt === null;
  const timestamp = new Intl.DateTimeFormat('es-CU', {
    timeZone: 'America/Havana', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(item.createdAt));
  const tone = categoryTones[item.category];
  return <View style={[styles.card, unread && styles.unread]}>
    <View style={styles.heading}>
      <View style={[styles.chip, { backgroundColor: colors[tone[0]] }]}><Icon name={categoryIcons[item.category]} color={colors[tone[1]]} size={13} /><Text style={[styles.category, { color: colors[tone[1]] }]}>{categoryLabels[item.category]}</Text></View>
      <Text style={styles.date}>{timestamp} · Cuba</Text>
      {unread ? <Text style={styles.unreadState}>● Sin leer</Text> : <Text style={styles.readState}>Leído</Text>}
    </View>
    <View style={styles.copy}>
      <Text numberOfLines={2} style={styles.actor}>{item.actorName}</Text>
      <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
      {!!item.propertyTitle && <View style={styles.property}><Icon name="home-outline" size={15} color={colors.muted} /><Text style={styles.propertyText}>{item.propertyTitle}</Text></View>}
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkText}>{item.category === 'agency' ? 'Abrir aviso' : item.category === 'alert' ? 'Ver vivienda' : 'Abrir conversación'}</Text><Icon name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
      {unread && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy: marking }} disabled={busy} onPress={onRead} style={({ pressed }) => [styles.link, (pressed || busy) && styles.pressed]}>
        {marking ? <ActivityIndicator size="small" color={colors.muted} /> : <Icon name="checkmark-outline" size={16} color={colors.muted} />}<Text style={styles.readLink}>Marcar como leído</Text>
      </Pressable>}
    </View>
  </View>;
}

/** Visits and offers in sol, search alerts in blue, the rest quiet: [chip ground, chip ink]. */
const categoryTones: Record<AppNotification['category'], [keyof ThemeColors, keyof ThemeColors]> = {
  message: ['softNeutral', 'body'], visit: ['softAmber', 'amber'], offer: ['softAmber', 'amber'], alert: ['softBlue', 'primary'], agency: ['softNeutral', 'body'],
};

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { borderRadius: rounded.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  unread: { backgroundColor: colors.surface, borderColor: colors.surface },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 24, paddingHorizontal: 9, borderRadius: rounded.pill }, category: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 12, lineHeight: 16 }, unreadState: { marginLeft: 'auto', color: colors.amber, fontSize: 12, lineHeight: 16, fontWeight: '600' }, readState: { marginLeft: 'auto', color: colors.muted, fontSize: 12, lineHeight: 16 },
  copy: { gap: 2 }, title: { fontSize: 16, lineHeight: 22, color: colors.ink, fontWeight: '600' },
  actor: { fontSize: 13, lineHeight: 18, color: colors.muted }, body: { fontSize: 14, lineHeight: 20, color: colors.body }, property: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingTop: 4 }, propertyText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }, link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed: { opacity: 0.6 },
  linkText: { color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '600' }, readLink: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '600' },
}));
