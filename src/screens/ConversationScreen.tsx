import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { MessageBubble, type MessageRow } from '../components/messaging/MessageBubble';
import { ReportConversationSheet } from '../components/messaging/ReportConversationSheet';
import { useComposerDraft } from '../components/messaging/useComposerDraft';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { ConversationNegotiations } from '../components/negotiations/ConversationNegotiations';
import { Button, EmptyState, goBack, Icon, IconButton, Notice, PageTitle } from '../components/ui';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { colors } from '../theme';

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const messaging = useMessaging();
  const auth = useAuth();
  const validId = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!auth.ready || (auth.user && messaging.userId !== auth.user.id)) return <SafeAreaView style={styles.safe}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!messaging.available || !auth.user || !validId) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}><View style={styles.padding}><PageTitle title="Conversación" back />
    {!messaging.available ? <EmptyState icon="chatbubbles-outline" title="Mensajes entre personas" description="La mensajería estará disponible con tu cuenta cuando se conecte el servicio." /> : !auth.user ? <AccountPrompt returnTo={validId ? `/messages/${id}` : '/messages'} title="Conversa sobre tu próxima vivienda" description="Inicia sesión para hablar con propietarios y compradores sin publicar tu teléfono." /> : <EmptyState icon="chatbubble-outline" title="No encontramos la conversación" description="Vuelve a tu bandeja para elegir una conversación disponible." action={<Button label="Ir a mensajes" onPress={() => router.replace('/messages')} />} />}
  </View></View></SafeAreaView>;
  return <ConversationBody key={`${auth.user.id}:${id}`} id={id!} userId={auth.user.id} />;
}

function ConversationBody({ id, userId }: { id: string; userId: string }) {
  const messaging = useMessaging();
  const { invalidateAfterBlockChange } = useNotifications();
  const active = useMessagingActivity();
  const composer = useComposerDraft(userId, id);
  const conversation = messaging.conversations.find(item => item.id === id);
  const history = messaging.histories[id];
  const [opening, setOpening] = useState(true);
  const [issue, setIssue] = useState('');
  const [syncIssue, setSyncIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [negotiationsOpen, setNegotiationsOpen] = useState(false);
  const [discard, setDiscard] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [visibleSeq, setVisibleSeq] = useState(0);
  const [readError, setReadError] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const latest = useRef(messaging); latest.current = messaging;
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const list = useRef<FlatList<MessageRow>>(null);
  const follow = useRef(true);
  const metrics = useRef({ height: 0, content: 0, offset: 0 });
  const prepend = useRef<{ content: number; offset: number } | null>(null);
  const readInFlight = useRef(false);
  const acknowledged = useRef(0);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 5, minimumViewTime: 350 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<MessageRow>[] }) => {
    setVisibleSeq(viewableItems.reduce((last, item) => Math.max(last, item.isViewable ? item.item.message?.seq ?? 0 : 0), 0));
  });
  const insets = useSafeAreaInsets();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try { await latest.current.openConversation(id); if (alive) setSyncIssue(''); }
      catch (failure) { if (alive) setSyncIssue(message(failure, 'No pudimos cargar la conversación. Reintenta.')); }
      finally { loading = false; if (alive) setOpening(false); }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [active, id]);

  const rows = useMemo<MessageRow[]>(() => {
    const received = history?.messages ?? [];
    const confirmedIds = new Set(received.map(item => `${item.senderId}:${item.clientMessageId}`));
    return [
      ...received.map(item => ({ key: item.id, message: item })),
      ...messaging.pending.filter(item => item.conversationId === id && item.senderId === userId && !confirmedIds.has(`${item.senderId}:${item.clientMessageId}`)).map(item => ({ key: `pending:${item.clientMessageId}`, pending: item })),
    ];
  }, [history?.messages, messaging.pending, id, userId]);

  useEffect(() => {
    if (!active || menu || report || discard || negotiationsOpen || !atBottom || !visibleSeq || visibleSeq <= acknowledged.current || readInFlight.current) return;
    const target = visibleSeq;
    readInFlight.current = true;
    void latest.current.markRead(id, target).then(() => {
      if (!mounted.current) return;
      acknowledged.current = Math.max(acknowledged.current, target);
      setReadError(false);
    }).catch(() => { if (mounted.current) setReadError(true); }).finally(() => {
      readInFlight.current = false;
      if (mounted.current && acknowledged.current >= target) setReadAttempt(value => value + 1);
    });
  }, [active, atBottom, visibleSeq, id, readAttempt, menu, report, discard, negotiationsOpen]);

  function updateBottom() {
    const { content, height, offset } = metrics.current;
    const bottom = height > 0 && content - height - offset <= 48;
    follow.current = bottom;
    setAtBottom(bottom);
  }
  async function refreshNow() {
    setIssue(''); setSyncIssue('');
    try { await latest.current.openConversation(id); }
    catch (failure) { if (mounted.current) setSyncIssue(message(failure, 'No pudimos actualizar la conversación.')); }
    finally { if (mounted.current) { setOpening(false); setReadAttempt(value => value + 1); } }
  }
  async function older() {
    if (history?.loading) return;
    prepend.current = { content: metrics.current.content, offset: metrics.current.offset };
    try { await latest.current.loadOlder(id); }
    catch (failure) { if (mounted.current) setIssue(message(failure, 'No pudimos cargar los mensajes anteriores.')); }
    finally { requestAnimationFrame(() => { prepend.current = null; }); }
  }
  async function perform(name: string, action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(name); setIssue(''); setNotice('');
    try { await action(); }
    catch (failure) { if (mounted.current) setIssue(message(failure, 'No pudimos completar la acción. Reintenta.')); }
    finally { actionLock.current = false; if (mounted.current) setBusy(''); }
  }
  async function send() {
    if (!conversation?.canSend || !composer.ready || !composer.text.trim() || actionLock.current) return;
    const text = composer.text;
    await perform('send', async () => {
      await latest.current.sendMessage(id, text);
      // This also clears the persisted draft after navigating away. The outbox already owns the text.
      await composer.clearAfterEnqueue(text);
      if (mounted.current) { follow.current = true; requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true })); }
    });
  }

  if (!conversation) return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}><View style={styles.shell}><View style={styles.padding}>
    <PageTitle title="Conversación" back />
    {opening ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <><Notice error>{issue || syncIssue || messaging.error || 'Esta conversación no está disponible para tu cuenta.'}</Notice><Button label="Volver a intentar" secondary onPress={refreshNow} /><Button label="Ir a mensajes" onPress={() => router.replace('/messages')} style={{ marginTop: 12 }} /></>}
  </View></View></SafeAreaView>;

  const disabledReason = conversation.blockedByMe ? 'Has bloqueado a esta persona. Puedes leer el historial y desbloquearla desde las opciones.' : conversation.blockedByOther ? 'No puedes enviar mensajes a esta persona. El historial sigue disponible.' : !conversation.propertyAvailable ? 'Esta vivienda ya no está disponible para nuevas conversaciones. Puedes consultar el historial.' : !conversation.canSend ? 'No se pueden enviar mensajes en esta conversación.' : '';
  const syncError = syncIssue || history?.error || messaging.error;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    {/* Android runs edge-to-edge (targetSdk 36), so the window no longer shrinks for the keyboard:
        without padding on Android too, the keyboard covers the composer. */}
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.shell}>
        <View style={styles.chatHeader}>
          <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/messages')} />
          <View style={styles.person}><Text numberOfLines={1} style={styles.personName}>{conversation.otherName}</Text><Text style={styles.personHint}>Conversación sobre una vivienda</Text></View>
          <IconButton name="ellipsis-horizontal" label="Opciones de conversación" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver vivienda: ${conversation.propertyTitle}`} disabled={!conversation.propertyAvailable} onPress={() => router.push(`/property/${conversation.propertyId}`)} style={({ pressed }) => [styles.property, pressed && { opacity: 0.7 }]}>
          <View style={styles.propertyIcon}><Icon name="home-outline" size={23} color={colors.primary} /></View>
          <View style={styles.propertyCopy}><Text style={styles.propertyTitle} numberOfLines={1}>{conversation.propertyTitle}</Text><Text style={styles.propertyZone} numberOfLines={1}>{conversation.propertyLocation}</Text></View>
          {conversation.propertyAvailable && <Icon name="chevron-forward" size={16} color={colors.muted} />}
        </Pressable>
        <ConversationNegotiations conversation={conversation} userId={userId} onVisibilityChange={setNegotiationsOpen} onChanged={async () => {
          await latest.current.openConversation(id);
          if (mounted.current) setReadAttempt(value => value + 1);
        }} />
        {(issue || syncError) && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{issue || syncError}</Text><Pressable accessibilityRole="button" onPress={refreshNow} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        {readError && <View style={styles.sync}><Text style={styles.syncText}>No pudimos actualizar los mensajes leídos.</Text><Pressable accessibilityRole="button" onPress={() => setReadAttempt(value => value + 1)} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <FlatList ref={list} data={rows} keyExtractor={item => item.key} style={styles.flex} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          viewabilityConfig={viewabilityConfig.current} onViewableItemsChanged={onViewableItemsChanged.current}
          onLayout={event => { metrics.current.height = event.nativeEvent.layout.height; updateBottom(); }}
          onScroll={event => { metrics.current = { height: event.nativeEvent.layoutMeasurement.height, content: event.nativeEvent.contentSize.height, offset: event.nativeEvent.contentOffset.y }; updateBottom(); }} scrollEventThrottle={100}
          onContentSizeChange={(_, content) => {
            const anchor = prepend.current;
            const shouldFollow = follow.current;
            metrics.current.content = content;
            if (anchor && content > anchor.content) { list.current?.scrollToOffset({ offset: anchor.offset + content - anchor.content, animated: false }); prepend.current = null; }
            else if (shouldFollow) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
            updateBottom();
          }}
          ListHeaderComponent={history?.hasMore ? <Button label="Ver mensajes anteriores" secondary loading={history.loading} onPress={older} style={styles.older} /> : null}
          ListEmptyComponent={history?.loading || opening ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <EmptyState icon="chatbubble-ellipses-outline" title="Saluda y pregunta" description="Puedes consultar los detalles de la vivienda y coordinar el siguiente paso por aquí." />}
          renderItem={({ item, index }) => {
            const date = new Date((item.message ?? item.pending).createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long' });
            const previous = index > 0 ? rows[index - 1] : undefined;
            const previousDate = previous ? new Date((previous.message ?? previous.pending).createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long' }) : '';
            return <View>{date !== previousDate && <Text style={styles.day}>{date}</Text>}<MessageBubble row={item} own={(item.message ?? item.pending).senderId === userId} canRetry={conversation.canSend} busy={!!busy} onRetry={() => item.pending && void perform(item.pending.clientMessageId, () => latest.current.retryMessage(item.pending!.clientMessageId))} onDiscard={() => item.pending && setDiscard(item.pending.clientMessageId)} /></View>;
          }}
        />
        {!atBottom && rows.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Ir al final de la conversación" onPress={() => { follow.current = true; list.current?.scrollToEnd({ animated: true }); }} style={styles.toBottom}><Icon name="arrow-down" size={17} color={colors.primary} /><Text style={styles.link}>Ir al final</Text></Pressable>}
        {!!disabledReason && <Text style={styles.disabledReason}>{disabledReason}</Text>}
        {!!composer.error && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{composer.error}</Text><Pressable accessibilityRole="button" onPress={() => { void composer.retry().catch(() => undefined); }} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Escribe un mensaje" placeholder={composer.ready ? 'Escribe un mensaje…' : 'Recuperando borrador…'} placeholderTextColor={colors.muted} value={composer.text} onChangeText={composer.change} multiline maxLength={2000} editable={composer.ready && !busy} style={[styles.input, !conversation.canSend && styles.mutedInput]} textAlignVertical="top" />
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: !conversation.canSend || !composer.ready || !!busy || !composer.text.trim() }} disabled={!conversation.canSend || !composer.ready || !!busy || !composer.text.trim()} onPress={send} style={({ pressed }) => [styles.send, (!conversation.canSend || !composer.ready || !!busy || !composer.text.trim() || pressed) && styles.sendDisabled]}>
            {busy === 'send' ? <ActivityIndicator color={colors.white} /> : <Icon name="arrow-up" size={24} color={colors.white} />}
          </Pressable>
        </View>
        {composer.text.length > 1800 && <Text style={styles.count}>{composer.text.length}/2000</Text>}
      </View>
    </KeyboardAvoidingView>
    <Modal visible={menu || !!discard} transparent animationType="fade" onRequestClose={() => { if (!busy) { setMenu(false); setDiscard(null); } }}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 20), paddingTop: Math.max(insets.top, 20) }]}><View accessibilityViewIsModal style={styles.actionSheet}>
        <Text style={styles.sheetTitle}>{discard ? 'Descartar mensaje' : 'Opciones de conversación'}</Text>
        <Text style={styles.sheetDescription}>{discard ? 'Se quitará de la bandeja de salida de este dispositivo. No se borran mensajes ya recibidos por la otra persona.' : conversation.blockedByMe ? 'Puedes volver a permitir mensajes con esta persona.' : 'Al bloquear, no podréis enviaros mensajes en ninguna de vuestras conversaciones. El historial se conserva.'}</Text>
        {discard ? <Button label="Confirmar descarte" loading={busy === 'discard'} disabled={!!busy} onPress={() => void perform('discard', async () => { await latest.current.discardMessage(discard); if (mounted.current) setDiscard(null); })} /> : <>
          <Button label={conversation.blockedByMe ? 'Desbloquear persona' : 'Bloquear persona'} loading={busy === 'block'} disabled={!!busy} secondary onPress={() => void perform('block', async () => { await latest.current.setBlocked(id, !conversation.blockedByMe); await invalidateAfterBlockChange(); if (mounted.current) { setMenu(false); setNotice(conversation.blockedByMe ? 'Has desbloqueado a esta persona.' : 'Has bloqueado a esta persona.'); } })} />
          <Button label="Reportar conversación" secondary icon="flag-outline" disabled={!!busy} onPress={() => { setMenu(false); setReport(true); }} />
        </>}
        {!!issue && <Notice error>{issue}</Notice>}
        <Button label="Cancelar" secondary disabled={!!busy} onPress={() => { setMenu(false); setDiscard(null); }} />
      </View></View>
    </Modal>
    <ReportConversationSheet visible={report} onClose={() => setReport(false)} onReport={(reason, details, clientId) => latest.current.reportConversation(id, reason, details, clientId)} />
  </SafeAreaView>;
}

function message(failure: unknown, fallback: string) { return failure instanceof Error && failure.message ? failure.message : fallback; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' }, padding: { paddingHorizontal: 20 }, loading: { padding: 36 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }, person: { flex: 1, gap: 3 }, personName: { color: colors.ink, fontSize: 18, fontWeight: '600' }, personHint: { color: colors.muted, fontSize: 11 },
  property: { marginHorizontal: 16, padding: 12, backgroundColor: colors.white, borderRadius: 18, flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 8 }, propertyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.softBlue }, propertyCopy: { flex: 1, gap: 4 }, propertyTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' }, propertyZone: { color: colors.muted, fontSize: 12 },
  messages: { paddingHorizontal: 18, paddingVertical: 12, flexGrow: 1 }, older: { alignSelf: 'center', marginBottom: 12 }, day: { color: colors.muted, textAlign: 'center', fontSize: 11, fontWeight: '500', marginTop: 14, marginBottom: 10 },
  sync: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF2F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 }, syncText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.danger }, retryLink: { minHeight: 44, justifyContent: 'center' }, link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  notice: { marginHorizontal: 20, paddingVertical: 8, color: colors.green, fontSize: 12, lineHeight: 18 }, disabledReason: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: '#EEEEF2' },
  toBottom: { alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44, paddingHorizontal: 18, backgroundColor: colors.white, borderRadius: 22, marginBottom: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 14, paddingTop: 10, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 46, maxHeight: 128, fontSize: 16, lineHeight: 23, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 15, backgroundColor: colors.paper, borderRadius: 23, color: colors.ink }, mutedInput: { opacity: 0.6 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, count: { fontSize: 10, color: colors.muted, textAlign: 'right', paddingHorizontal: 20, paddingBottom: 6, backgroundColor: colors.white },
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: '#17233170', paddingHorizontal: 20 }, actionSheet: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, borderRadius: 28, backgroundColor: colors.white, gap: 14 }, sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '600' }, sheetDescription: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
