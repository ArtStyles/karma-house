import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { NotificationCard } from '../components/notifications/NotificationCard';
import { NotificationHeader } from '../components/notifications/NotificationHeader';
import { Button, EmptyState, IconButton, Notice, Pill } from '../components/ui';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useNotificationCenter } from '../notifications/useNotificationCenter';
import { colors } from '../theme';

export default function NotificationsScreen() {
  const auth = useAuth();
  const store = useNotifications();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}>
    <View style={styles.inset}><NotificationHeader title="Notificaciones" subtitle="Avisos dentro de KarmaHouse" right={<IconButton name="options-outline" label="Preferencias de notificaciones" onPress={() => router.push('/notification-settings')} />} /></View>
    {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !store.available ? <View style={styles.inset}><EmptyState icon="notifications-outline" title="Cada novedad, en su lugar" description="Los avisos estarán disponibles cuando conectes una cuenta." /></View>
      : !auth.user ? <View style={styles.inset}><AccountPrompt returnTo="/notifications" title="Mantente al tanto" description="Inicia sesión para consultar los avisos de tus mensajes, visitas y ofertas." /></View>
      : <NotificationsBody key={auth.user.id} />}
  </View></SafeAreaView>;
}

function NotificationsBody() {
  const store = useNotificationCenter();
  const { list } = store;
  const issue = store.mutationError || list.error || store.summaryError;
  const markAll = () => {
    // Capture precisely the last server-observed sequence, never a future unread count.
    const cutoff = store.readThrough;
    void store.markAllRead(cutoff).catch(() => {});
  };
  return <>
    <View style={styles.filters}>
      <View style={styles.filterOptions}><Pill label="Todas" active={!list.unreadOnly} onPress={() => { if (!store.marking) store.setUnreadOnly(false); }} />
      <Pill label="Sin leer" active={list.unreadOnly} onPress={() => { if (!store.marking) store.setUnreadOnly(true); }} /></View>
      <IconButton name="refresh-outline" label="Actualizar avisos" onPress={() => { if (!store.marking) void store.refreshList().catch(() => {}); }} />
    </View>
    <FlatList data={list.items} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={list.loading && list.ready} onRefresh={() => void store.refreshList().catch(() => {})} tintColor={colors.primary} />}
      ListHeaderComponent={<View style={styles.listHeader}>
        <View style={styles.summary}>
          <Text style={styles.count}>{store.summaryReady && !store.summaryError ? `${store.unreadCount} ${store.unreadCount === 1 ? 'aviso sin leer' : 'avisos sin leer'}` : 'Tus novedades'}</Text>
          <Text style={styles.hint}>Abrir una conversación no marca este aviso como leído.</Text>
        </View>
        {store.unreadCount > 0 && <Button label="Marcar todos como leídos" secondary icon="checkmark-done-outline" disabled={!!store.marking || store.readThrough === '0'} loading={store.marking === 'all'} onPress={markAll} />}
        {!!issue && <Notice error>{issue}</Notice>}
      </View>}
      renderItem={({ item }) => <NotificationCard item={item} busy={!!store.marking} marking={store.marking === item.id} onRead={() => void store.markRead(item.id).catch(() => {})} onOpen={() => router.push(`/messages/${item.conversationId}`)} />}
      ListEmptyComponent={!list.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
        : list.error ? null
        : list.nextCursor ? <Notice>Has revisado esta página. Carga más avisos para seguir consultando los anteriores.</Notice>
        : list.unreadOnly && store.unreadCount > 0 ? <EmptyState icon="notifications-outline" title="Hay novedades por consultar" description="Actualiza la bandeja para ver los avisos que llegaron después de esta página." action={<Button label="Actualizar avisos" secondary loading={list.loading} onPress={() => void store.refreshList().catch(() => {})} />} />
        : <EmptyState icon={list.unreadOnly ? 'checkmark-done-outline' : 'notifications-outline'} title={list.unreadOnly ? 'Estás al día' : 'Aquí llegan tus novedades'} description={list.unreadOnly ? 'No tienes avisos sin leer. Puedes consultar los anteriores en Todas.' : 'Cuando recibas novedades sobre visitas y ofertas, las encontrarás aquí. Los mensajes se consultan en el chat.'} action={<Button label={list.unreadOnly ? 'Ver todos los avisos' : 'Ir a mensajes'} secondary onPress={() => list.unreadOnly ? store.setUnreadOnly(false) : router.push('/messages')} />} />}
      ListFooterComponent={<View style={styles.footer}>{list.nextCursor && <Button label="Cargar más avisos" secondary disabled={!!store.marking} loading={list.loadingMore} onPress={() => void store.loadMore().catch(() => {})} />}<Text style={styles.hint}>El contenido de tus conversaciones se consulta dentro del chat.</Text></View>}
    />
  </>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { flex: 1, width: '100%', maxWidth: 740, alignSelf: 'center' }, inset: { paddingHorizontal: 20 },
  filters: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 16 }, filterOptions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flexShrink: 1 }, list: { paddingHorizontal: 20, paddingBottom: 28, gap: 12, flexGrow: 1 },
  loading: { padding: 40 }, listHeader: { gap: 14, paddingBottom: 4 }, summary: { gap: 6 }, count: { color: colors.ink, fontSize: 16, fontWeight: '600' }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 }, error: { gap: 7 }, footer: { paddingTop: 12, gap: 16 },
});
