import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAgencyWorkspace } from '../../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../../agencies/controller';
import { createAgencyTeamChatRepository, type AgencyTeamChat } from '../../agencies/messaging/teamChat';
import { supabase } from '../../lib/supabase';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Icon } from '../ui';

const repo = supabase ? createAgencyTeamChatRepository(supabase) : null;

/** The agency's internal chat as one row, with its last message and unread count, read each time the screen gains focus. */
export function TeamChatRow() {
  const w = useAgencyWorkspace();
  const { colors, styles } = useStyles();
  const key = `${w.activeAgencyId}:${w.generation}`;
  const [chat, setChat] = useState<{ key: string; value: AgencyTeamChat } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!repo) return;
    let active = true, context: CapturedAgencyContext;
    try { context = w.captureAgencyReadContext(); } catch { return; }
    void repo.get(context).then(value => { context.checkpoint(); if (active) setChat({ key, value }); }).catch(() => undefined).finally(() => context.release());
    return () => { active = false; };
  }, [key, w.captureAgencyReadContext]));
  const shown = chat?.key === key ? chat.value : null;
  const unread = shown?.unreadCount ?? 0;
  const preview = shown?.lastMessage ? `${shown.lastMessage.senderName}: ${shown.lastMessage.body}` : 'Habla con todo el equipo.';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Chat del equipo. ${unread ? `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : 'Sin mensajes nuevos'}`} onPress={() => router.push('/agency-team-chat')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon name="chatbubbles-outline" size={20} color={colors.primary} /></View>
    <View style={styles.copy}>
      <Text style={[styles.title, unread > 0 && styles.unread]}>Chat del equipo</Text>
      <Text numberOfLines={1} style={[styles.preview, unread > 0 && styles.unreadPreview]}>{preview}</Text>
    </View>
    {unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
    <Icon name="chevron-forward" size={17} color={colors.body} />
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: rounded.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: rounded.pill, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 }, title: { ...typography.body, color: colors.ink }, unread: { fontWeight: '700' },
  preview: { ...typography.label, fontWeight: '400', color: colors.body }, unreadPreview: { color: colors.ink, fontWeight: '600' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryFill, borderRadius: rounded.pill },
  badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
}));
