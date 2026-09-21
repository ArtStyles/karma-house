import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { useMessaging } from '../messaging/MessagingProvider';
import type { Conversation } from '../messaging/types';
import { colors } from '../theme';

export default function InboxScreen() {
  const messaging = useMessaging();
  const auth = useAuth();
  const active = useMessagingActivity();
  const latestRefresh = useRef(messaging.refresh);
  latestRefresh.current = messaging.refresh;
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (active && messaging.available && auth.user && messaging.userId === auth.user.id) void latestRefresh.current().catch(() => undefined);
  }, [active, messaging.available, messaging.userId, auth.user?.id]);
  async function refresh() {
    setRefreshing(true);
    try { await latestRefresh.current(); } catch { /* The provider keeps the synchronization error. */ }
    finally { setRefreshing(false); }
  }
  const authorized = !!auth.user && messaging.userId === auth.user.id;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <View style={styles.shell}>
      <View style={styles.header}><PageTitle title="Mensajes" subtitle="Cada vivienda, una conversación." back /></View>
      {authorized && <Pressable accessibilityRole="button" accessibilityLabel="Ver visitas y ofertas" onPress={() => router.push('/requests')} style={({ pressed }) => [styles.requests, pressed && styles.pressed]}>
        <View style={styles.requestIcon}><Icon name="calendar-outline" color={colors.primary} size={23} /></View>
        <View style={styles.copy}><Text style={styles.requestTitle}>Visitas y ofertas</Text><Text style={styles.requestSubtitle}>Tus solicitudes y próximos pasos</Text></View>
        <Icon name="chevron-forward" size={17} color={colors.primary} />
      </Pressable>}
      {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !messaging.available ? <EmptyState icon="chatbubbles-outline" title="Tus conversaciones, aquí." description="Los mensajes estarán disponibles al conectar una cuenta. La demostración no envía mensajes." /> : !auth.user ? <View style={styles.header}><AccountPrompt returnTo="/messages" title="Conversa sobre tu próxima vivienda" description="Inicia sesión para hablar con propietarios y compradores sin publicar tu teléfono." /></View> : !authorized || (!messaging.ready && !messaging.error) ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <>
        {messaging.error && <View style={styles.sync}><Notice error>{messaging.error}</Notice><Button label="Reintentar actualización" secondary loading={refreshing} onPress={refresh} /></View>}
        <FlatList data={messaging.conversations} keyExtractor={item => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => <ConversationCard conversation={item} />}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="Empieza una conversación" description="Abre una vivienda y toca Contactar para hablar con su propietario. Tus conversaciones aparecerán aquí." action={<Button label="Explorar viviendas" onPress={() => router.replace('/')} />} />}
          ListFooterComponent={messaging.conversations.length ? <Text style={styles.footer}>Se actualiza mientras KarmaHouse está abierta.</Text> : null}
        />
      </>}
    </View>
  </SafeAreaView>;
}

function ConversationCard({ conversation: item }: { conversation: Conversation }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.otherName}. ${item.propertyTitle}. ${item.unreadCount ? `${item.unreadCount} mensajes sin leer` : 'Sin mensajes nuevos'}`} onPress={() => router.push(`/messages/${item.id}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon name="home-outline" size={23} color={colors.primary} /></View>
    <View style={styles.copy}>
      <View style={styles.line}><Text numberOfLines={1} style={[styles.name, item.unreadCount > 0 && styles.unreadName]}>{item.otherName}</Text><Text style={styles.date}>{shortDate(item.lastMessageAt ?? item.createdAt)}</Text></View>
      <Text numberOfLines={1} style={styles.property}>{item.propertyTitle}</Text>
      <View style={styles.line}><Text numberOfLines={2} style={[styles.preview, item.unreadCount > 0 && styles.unreadPreview]}>{item.lastMessage ?? 'Escribe el primer mensaje.'}</Text>{item.unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}</View>
      {(item.blockedByMe || item.blockedByOther) && <Text style={styles.blocked}>Mensajes bloqueados</Text>}
    </View>
  </Pressable>;
}

function shortDate(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { width: '100%', maxWidth: 800, alignSelf: 'center', flex: 1 }, header: { paddingHorizontal: 20 },
  loading: { padding: 50 }, sync: { paddingHorizontal: 20, paddingBottom: 14 }, list: { paddingHorizontal: 20, paddingBottom: 28, gap: 10, flexGrow: 1 },
  card: { padding: 16, borderRadius: 22, backgroundColor: colors.white, flexDirection: 'row', gap: 12 }, pressed: { opacity: 0.7 },
  icon: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.softBlue, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, gap: 5 }, line: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '500' }, unreadName: { fontWeight: '700' },
  date: { fontSize: 11, color: colors.muted }, property: { color: colors.primary, fontSize: 12, fontWeight: '500' },
  preview: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 }, unreadPreview: { color: colors.ink },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 11 }, badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  blocked: { color: colors.muted, fontSize: 11, marginTop: 3 }, footer: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 19, padding: 20 },
  requests: { marginHorizontal: 20, marginBottom: 18, padding: 16, borderRadius: 22, backgroundColor: colors.softBlue, flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, justifyContent: 'center', alignItems: 'center' },
  requestTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, requestSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
