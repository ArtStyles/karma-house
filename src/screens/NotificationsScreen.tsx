import {useState} from 'react';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {useNotificationNavigation} from '../notifications/useNotificationNavigation';
import {notificationErrorMessage} from '../notifications/domain';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { NotificationCard } from '../components/notifications/NotificationCard';
import { Button, EmptyState, goBack, Icon, IconButton, Notice } from '../components/ui';
import { Segmented } from '../components/Segmented';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useNotificationCenter } from '../notifications/useNotificationCenter';
import { createThemedStyles, internalLayout, typography } from '../theme';

export default function NotificationsScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const store = useNotifications();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}>
    {/* Buttons above the title, as in the artboard: «Notificaciones» does not fit beside them at 320 px. */}
    <View style={styles.inset}>
      <View style={styles.topBar}><IconButton name="chevron-back" label="Volver" onPress={() => goBack('/profile')} /><IconButton name="options-outline" label="Preferencias de notificaciones" onPress={() => router.push('/notification-settings')} /></View>
      <Text accessibilityRole="header" style={styles.title}>Notificaciones</Text><Text style={styles.subtitle}>Avisos y novedades de tu actividad.</Text>
    </View>
    {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
      : !store.available ? <View style={styles.inset}><EmptyState plain title="Notificaciones no disponibles" description="Los avisos estarán disponibles con el servicio conectado." /></View>
      : !auth.user ? <View style={styles.inset}><AccountPrompt returnTo="/notifications" title="Mantente al tanto" description="Inicia sesión para consultar los avisos de tus mensajes, visitas y ofertas." /></View>
      : <NotificationsBody key={auth.user.id} />}
  </View></SafeAreaView>;
}

function NotificationsBody() {
  const { colors, styles } = useStyles();
  const store = useNotificationCenter();
  const { list } = store;
  const auth = useAuth();
  const reload = useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}:${list.unreadOnly}`, store.refreshList, !!store.marking || list.loading || list.loadingMore);
  const navigation=useNotificationNavigation(),[openingError,setOpeningError]=useState('');
  const open=(id:string)=>{setOpeningError('');void navigation.open(id).catch(e=>setOpeningError(notificationErrorMessage(e)))};
  const issue = openingError || store.mutationError || list.error || store.summaryError;
  const markAll = () => {
    // Capture precisely the last server-observed sequence, never a future unread count.
    const cutoff = store.readThrough;
    void store.markAllRead(cutoff).catch(() => {});
  };
  return <>
    <View style={styles.filters}>
      <Segmented label="Filtro de avisos" value={list.unreadOnly ? 'unread' : 'all'} disabled={!!store.marking} onChange={value => store.setUnreadOnly(value === 'unread')}
        options={[{ value: 'unread', label: 'Sin leer' }, { value: 'all', label: 'Todas' }]} />
    </View>
    <FlatList data={list.items} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      alwaysBounceVertical refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!store.marking && !list.loadingMore} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={<View style={styles.listHeader}>
        <View style={styles.summary}>
          <Text style={styles.count}>{store.summaryReady && !store.summaryError ? `${store.unreadCount} ${store.unreadCount === 1 ? 'aviso sin leer' : 'avisos sin leer'}` : 'Tus novedades'}</Text>
          <Text style={styles.hint}>Abrir una conversación no marca este aviso como leído.</Text>
        </View>
        {store.unreadCount > 0 && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!store.marking || store.readThrough === '0', busy: store.marking === 'all' }} disabled={!!store.marking || store.readThrough === '0'} onPress={markAll} style={({ pressed }) => [styles.markAll, (pressed || !!store.marking || store.readThrough === '0') && styles.dimmed]}>
          {store.marking === 'all' ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="checkmark-done-outline" size={18} color={colors.primary} />}<Text style={styles.markAllText}>Marcar todos como leídos</Text>
        </Pressable>}
        {!!issue && <Notice error onRetry={() => void reload.refresh()}>{issue}</Notice>}
      </View>}
      renderItem={({ item }) => <NotificationCard item={item} busy={!!store.marking} marking={store.marking === item.id} onRead={() => void store.markRead(item.id).catch(() => {})} onOpen={() => open(item.id)} />}
      ListEmptyComponent={!list.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
        : list.error ? null
        : list.nextCursor ? <Notice>Has revisado esta página. Carga más avisos para seguir consultando los anteriores.</Notice>
        : list.unreadOnly && store.unreadCount > 0 ? <EmptyState title="Hay novedades por consultar" description="Llegaron avisos después de esta página." action={<Button secondary label="Ver avisos nuevos" onPress={() => void reload.refresh()} />} />
        : <EmptyState title={list.unreadOnly ? 'Sin avisos pendientes' : 'Sin notificaciones'} description={list.unreadOnly ? 'No tienes avisos sin leer. Puedes consultar los anteriores en Todas.' : 'Aquí aparecerán las novedades de visitas, ofertas y alertas de búsqueda. Los mensajes se consultan en el chat.'} action={<Button label={list.unreadOnly ? 'Ver todos los avisos' : 'Ir a mensajes'} secondary onPress={() => list.unreadOnly ? store.setUnreadOnly(false) : router.push('/messages')} />} />}
      ListFooterComponent={<View style={styles.footer}>{list.nextCursor && <Button label="Cargar más avisos" secondary disabled={!!store.marking} loading={list.loadingMore} onPress={() => void store.loadMore().catch(() => {})} />}<Text style={styles.hint}>El contenido de tus conversaciones se consulta dentro del chat.</Text></View>}
    />
  </>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, inset: { paddingHorizontal: internalLayout.gutter },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }, title: { ...typography.displayLong, color: colors.ink, marginTop: 10 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 4, marginBottom: 16 },
  filters: { paddingHorizontal: internalLayout.gutter, paddingBottom: 12, maxWidth: 420 }, list: { paddingHorizontal: internalLayout.gutter, paddingBottom: 28, flexGrow: 1 },
  markAll: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, markAllText: { color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '600' }, dimmed: { opacity: 0.5 },
  loading: { padding: 40 }, listHeader: { gap: 8, paddingBottom: 12 }, summary: { gap: 4 }, count: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '600' }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 }, error: { gap: 12 }, footer: { paddingTop: 20, gap: 16 },
}));
