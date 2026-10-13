import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { MessageBubble, type MessageRow } from '../components/messaging/MessageBubble';
import { ReportConversationSheet } from '../components/messaging/ReportConversationSheet';
import { useComposerDraft } from '../components/messaging/useComposerDraft';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { ConversationNegotiations, type NegotiationSheetRequest } from '../components/negotiations/ConversationNegotiations';
import { NegotiationNotice } from '../components/negotiations/NegotiationNotice';
import { ProposalCard } from '../components/negotiations/ProposalCard';
import { useNegotiationMutations } from '../components/negotiations/useNegotiationMutations';
import { proposalSubject } from '../negotiations/presentation';
import type { Negotiation } from '../negotiations/types';
import { useNegotiations } from '../negotiations/useNegotiations';
import { ActionGroup, Button, EmptyState, goBack, Icon, IconButton, Notice, PageTitle } from '../components/ui';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { createThemedStyles, internalLayout } from '../theme';

export default function ConversationScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const messaging = useMessaging();
  const auth = useAuth();
  const validId = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!auth.ready || (auth.user && messaging.userId !== auth.user.id)) return <SafeAreaView style={styles.safe}><ActivityIndicator style={styles.loading} color={colors.primary} /></SafeAreaView>;
  if (!messaging.available || !auth.user || !validId) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={styles.shell}><ScrollView contentContainerStyle={styles.padding}><PageTitle compact title="Conversación" back />
    {!messaging.available ? <EmptyState plain title="Mensajes no disponibles" description="La mensajería estará disponible con tu cuenta cuando se conecte el servicio." /> : !auth.user ? <AccountPrompt returnTo={validId ? `/messages/${id}` : '/messages'} title="Consulta tu conversación" description="Inicia sesión para hablar con propietarios y compradores sin publicar tu teléfono." /> : <EmptyState plain title="No encontramos la conversación" description="Vuelve a tu bandeja para elegir una conversación disponible." action={<Button label="Ir a mensajes" onPress={() => router.replace('/messages')} />} />}
  </ScrollView></View></SafeAreaView>;
  return <ConversationBody key={`${auth.user.id}:${id}`} id={id!} userId={auth.user.id} />;
}

function ConversationBody({ id, userId }: { id: string; userId: string }) {
  const { colors, styles } = useStyles();
  const auth = useAuth();
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
  const [sheet, setSheet] = useState<NegotiationSheetRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Negotiation | null>(null);
  const negotiationsOpen = sheet !== null;
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
  // Cards in the thread act on these rows, so the store stays live for as long as the chat is open.
  const negotiations = useNegotiations({ conversationId: id });
  const negotiationMutations = useNegotiationMutations(userId, negotiations, async () => {
    await latest.current.openConversation(id);
    if (mounted.current) setReadAttempt(value => value + 1);
  });
  const reload=useConsultationRefresh(`${userId}:${auth.session?.access_token}:${id}`,async()=>{await refreshNow();await negotiations.refresh();},()=>actionLock.current||negotiations.mutating||!!history?.loading||!!sheet||report||!!discard);

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
  const liveProposals = useMemo(() => new Map(negotiations.items.map(item => [item.id, item])), [negotiations.items]);
  // A proposal or answer from the other person arrives as a message first; fetch its live row right away.
  const latestProposalMessage = rows.reduce((last, row) => row.message?.negotiation ? row.message.id : last, '');
  const refreshNegotiations = negotiations.refresh;
  useEffect(() => { if (latestProposalMessage) void refreshNegotiations(); }, [latestProposalMessage, refreshNegotiations]);

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
    if (actionLock.current || reload.isRefreshing()) return;
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

  if (!conversation) return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}><View style={styles.shell}><ScrollView alwaysBounceVertical contentContainerStyle={[styles.padding,{flexGrow:1}]} refreshControl={<RefreshControl refreshing={reload.refreshing} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
    <PageTitle compact title="Conversación" back />
    {opening ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <><Notice error>{issue || syncIssue || messaging.error || 'Esta conversación no está disponible para tu cuenta.'} Desliza hacia abajo para volver a consultar.</Notice><Button label="Ir a mensajes" onPress={() => router.replace('/messages')} style={{ marginTop: 12 }} /></>}
  </ScrollView></View></SafeAreaView>;

  const lastOwnKey = [...rows].reverse().find(row => !row.message?.negotiation && (row.message ?? row.pending).senderId === userId)?.key;
  const disabledReason = conversation.blockedByMe ? 'Has bloqueado a esta persona. Puedes leer el historial y desbloquearla desde las opciones.' : conversation.blockedByOther ? 'No puedes enviar mensajes a esta persona. El historial sigue disponible.' : conversation.managementChanged ? 'La gestión del anuncio cambió. Esta conversación conserva su historial y sus acuerdos con los participantes anteriores.' : !conversation.propertyAvailable ? 'Esta vivienda ya no está disponible para nuevas conversaciones. Puedes consultar el historial.' : !conversation.canSend ? 'No se pueden enviar mensajes en esta conversación.' : '';
  const syncError = syncIssue || history?.error || messaging.error;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    {/* Android runs edge-to-edge (targetSdk 36), so the window no longer shrinks for the keyboard:
        without padding on Android too, the keyboard covers the composer. */}
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.shell}>
        <View style={styles.chatHeader}>
          <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/messages')} />
          <View style={styles.person}>
            {/* A chat partner can always see the other's profile, even without active listings. */}
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver el perfil de ${conversation.otherName}`} onPress={() => router.push(`/user/${conversation.otherUserId}`)} style={({ pressed }) => [styles.contextLink, pressed && { opacity: 0.7 }]}>
              <Text numberOfLines={2} style={styles.personName}>{conversation.otherName}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver vivienda: ${conversation.propertyTitle}`} disabled={!conversation.propertyAvailable} onPress={() => router.push(`/property/${conversation.propertyId}`)} style={({ pressed }) => [styles.contextLink, pressed && { opacity: 0.7 }]}>
              <Text numberOfLines={2} style={[styles.personHint, conversation.propertyAvailable && styles.propertyLink]}>{conversation.propertyTitle}{conversation.propertyAvailable ? ' ›' : ''}</Text>
            </Pressable>
          </View>
          <IconButton name="ellipsis-horizontal" label="Opciones de conversación" onPress={() => { Keyboard.dismiss(); setMenu(true); }} />
        </View>
        <ConversationNegotiations conversation={conversation} userId={userId} store={negotiations} mutations={negotiationMutations} request={sheet} onClose={() => setSheet(null)} />
        {(issue || syncError) && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{issue || syncError} Desliza hacia abajo para volver a consultar.</Text></View>}
        {!!negotiationMutations.issue && !sheet && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{negotiationMutations.issue}</Text><Pressable accessibilityRole="button" onPress={negotiationMutations.clearFeedback} style={styles.retryLink}><Text style={styles.link}>Cerrar</Text></Pressable></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        {readError && <View style={styles.sync}><Text style={styles.syncText}>No pudimos actualizar los mensajes leídos.</Text><Pressable accessibilityRole="button" onPress={() => setReadAttempt(value => value + 1)} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <View style={styles.flex}>
        <FlatList ref={list} data={rows} keyExtractor={item => item.key} style={styles.flex} alwaysBounceVertical refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!negotiations.mutating&&!sheet} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          viewabilityConfig={viewabilityConfig.current} onViewableItemsChanged={onViewableItemsChanged.current}
          onLayout={event => {
            metrics.current.height = event.nativeEvent.layout.height;
            // The keyboard shrinks the list from below. Keep the latest message in view if it was.
            if (follow.current) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
            else updateBottom();
          }}
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
          ListEmptyComponent={history?.loading || opening ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : history && !syncError ? <EmptyState plain title="Sin mensajes" description="Todavía no hay mensajes en esta conversación." /> : null}
          renderItem={({ item, index }) => {
            const date = new Date((item.message ?? item.pending).createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long' });
            const previous = index > 0 ? rows[index - 1] : undefined;
            const previousDate = previous ? new Date((previous.message ?? previous.pending).createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long' }) : '';
            const proposal = item.message?.negotiation;
            const time = new Date((item.message ?? item.pending).createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            return <View>{date !== previousDate && <Text style={styles.day}>{date}</Text>}{proposal && item.message
              ? proposal.action === 'created'
                ? <ProposalCard proposal={proposal} live={liveProposals.get(proposal.id)} userId={userId} time={time} busy={negotiations.mutating||reload.refreshing} managementChanged={conversation.managementChanged}
                    onRespond={(target, action) => {if(!reload.isRefreshing())void negotiationMutations.respond(target, action);}} onCounter={target => setSheet({ compose: { kind: target.kind, previous: target } })} onCancelAgreement={setCancelTarget} />
                : <NegotiationNotice answer={proposal} actorId={item.message.senderId} userId={userId} otherName={conversation.otherName} time={time} />
              : <MessageBubble row={item} own={(item.message ?? item.pending).senderId === userId} showStatus={item.key === lastOwnKey} canRetry={conversation.canSend} busy={!!busy} onRetry={() => item.pending && void perform(item.pending.clientMessageId, () => latest.current.retryMessage(item.pending!.clientMessageId))} onDiscard={() => item.pending && setDiscard(item.pending.clientMessageId)} />}</View>;
          }}
        />
        {/* Floats over the list: in the flow it resized the list each time it appeared, making it jump. */}
        {!atBottom && rows.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Ir al final de la conversación" onPress={() => { follow.current = true; list.current?.scrollToEnd({ animated: true }); }} style={styles.toBottom}><Icon name="arrow-down" size={17} color={colors.primary} /><Text style={styles.link}>Ir al final</Text></Pressable>}
        </View>
        {!!disabledReason && <Text style={styles.disabledReason}>{disabledReason}</Text>}
        {conversation.managementChanged&&conversation.currentContactAvailable&&<View style={styles.padding}><Button secondary label={`Consultar al gestor actual${conversation.currentManagerName?`: ${conversation.currentManagerName}`:''}`} onPress={()=>router.push(`/property/${conversation.propertyId}`)}/><Text style={styles.disabledReason}>Abrirás otra conversación desde la ficha actual. Este historial y sus borradores permanecen aquí.</Text></View>}
        {!!composer.error && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{composer.error}</Text><Pressable accessibilityRole="button" onPress={() => { void composer.retry().catch(() => undefined); }} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Visitas y ofertas" onPress={() => { Keyboard.dismiss(); setSheet({}); }} style={({ pressed }) => [styles.plus, pressed && { opacity: 0.7 }]}>
            <Icon name="add" size={26} color={colors.primary} />
          </Pressable>
          <View style={styles.inputField}><Text style={styles.inputLabel}>Mensaje</Text><TextInput accessibilityLabel="Escribe un mensaje" placeholder={auth.suspended ? 'Tu cuenta está suspendida' : composer.ready ? 'Escribe un mensaje…' : 'Recuperando borrador…'} placeholderTextColor={colors.muted} value={composer.text} onChangeText={composer.change} multiline maxLength={2000} editable={composer.ready && !busy && !auth.suspended && !conversation.managementChanged} style={[styles.input, !conversation.canSend && styles.mutedInput]} textAlignVertical="top" /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim(), busy: busy === 'send' }} disabled={auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim()} onPress={send} style={({ pressed }) => [styles.send, (auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim() || pressed) && styles.sendDisabled]}>
            {busy === 'send' ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="arrow-up" size={24} color={colors.onPrimary} />}
          </Pressable>
        </View>
        {composer.text.length > 1800 && <Text style={styles.count}>{composer.text.length}/2000</Text>}
      </View>
    </KeyboardAvoidingView>
    <Modal visible={menu || !!discard || !!cancelTarget} transparent animationType="fade" onRequestClose={() => { if (!busy && !negotiations.mutating) { setMenu(false); setDiscard(null); setCancelTarget(null); } }}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding"><View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 20), paddingTop: Math.max(insets.top, 20) }]}><View accessibilityViewIsModal style={styles.actionSheet}><ScrollView contentContainerStyle={styles.actionSheetContent} keyboardShouldPersistTaps="handled">
        {cancelTarget ? <>
          <Text accessibilityRole="header" style={styles.sheetTitle}>¿Cancelar el acuerdo?</Text>
          <Text style={styles.sheetDescription}>La {proposalSubject(cancelTarget)} ya estaba aceptada. Si la cancelas, {conversation.otherName} lo verá en el chat.</Text>
          <ActionGroup><Button label="Cancelar acuerdo" loading={negotiations.mutating} onPress={() => { const target = cancelTarget; void negotiationMutations.respond(target, 'cancel').finally(() => { if (mounted.current) setCancelTarget(null); }); }} />
          <Button label="Mantener acuerdo" secondary disabled={negotiations.mutating} onPress={() => setCancelTarget(null)} /></ActionGroup>
        </> : <>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{discard ? 'Descartar mensaje' : 'Opciones de conversación'}</Text>
        <Text style={styles.sheetDescription}>{discard ? 'Se quitará de la bandeja de salida de este dispositivo. No se borran mensajes ya recibidos por la otra persona.' : conversation.blockedByMe ? 'Puedes volver a permitir mensajes con esta persona.' : 'Al bloquear, no podréis enviaros mensajes en ninguna de vuestras conversaciones. El historial se conserva.'}</Text>
        <ActionGroup direction="vertical">{discard ? <Button label="Confirmar descarte" loading={busy === 'discard'} disabled={!!busy} onPress={() => void perform('discard', async () => { await latest.current.discardMessage(discard); if (mounted.current) setDiscard(null); })} /> : <View style={{ gap: 12 }}>
          <Button label={conversation.blockedByMe ? 'Desbloquear persona' : 'Bloquear persona'} loading={busy === 'block'} disabled={!!busy} secondary onPress={() => void perform('block', async () => { await latest.current.setBlocked(id, !conversation.blockedByMe); await invalidateAfterBlockChange(); if (mounted.current) { setMenu(false); setNotice(conversation.blockedByMe ? 'Has desbloqueado a esta persona.' : 'Has bloqueado a esta persona.'); } })} />
          <Button label="Reportar conversación" secondary icon="flag-outline" disabled={!!busy} onPress={() => { setMenu(false); setReport(true); }} />
        </View>}
        {!!issue && <Notice error>{issue}</Notice>}
        <Button label="Cancelar" secondary disabled={!!busy} onPress={() => { setMenu(false); setDiscard(null); }} />
        </ActionGroup>
        </>}
      </ScrollView></View></View></KeyboardAvoidingView>
    </Modal>
    <ReportConversationSheet visible={report} onClose={() => setReport(false)} onReport={(reason, details, clientId) => latest.current.reportConversation(id, reason, details, clientId)} />
  </SafeAreaView>;
}

function message(failure: unknown, fallback: string) { return failure instanceof Error && failure.message ? failure.message : fallback; }

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, padding: { paddingHorizontal: internalLayout.gutter }, loading: { padding: 36 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, person: { flex: 1, minWidth: 0 }, contextLink: { minHeight: 44, justifyContent: 'center' }, personName: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600' }, personHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  propertyLink: { color: colors.primary },
  plus: { width: 48, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: 20, paddingVertical: 16, flexGrow: 1 }, older: { alignSelf: 'center', marginBottom: 12 }, day: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '500', marginTop: 16, marginBottom: 12 },
  sync: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.softDanger, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 }, syncText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.danger }, retryLink: { minHeight: 44, justifyContent: 'center' }, link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  notice: { marginHorizontal: 20, paddingVertical: 8, color: colors.green, fontSize: 12, lineHeight: 18 }, disabledReason: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.softNeutral },
  toBottom: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44, paddingHorizontal: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  inputField: { flex: 1, minWidth: 0, gap: 6 }, inputLabel: { fontSize: 12, lineHeight: 18, color: colors.muted }, input: { minHeight: 52, maxHeight: 152, fontSize: 16, lineHeight: 23, paddingVertical: 13, paddingHorizontal: 12, backgroundColor: colors.paper, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.ink }, mutedInput: { opacity: 0.6 },
  send: { width: 48, height: 52, borderRadius: 14, backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, count: { fontSize: 12, color: colors.muted, textAlign: 'right', paddingHorizontal: 20, paddingBottom: 6, backgroundColor: colors.surface },
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: colors.overlay, paddingHorizontal: 20 }, actionSheet: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: internalLayout.radius, overflow: 'hidden', backgroundColor: colors.surface }, actionSheetContent: { padding: 20, gap: 20 }, sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '600' }, sheetDescription: { color: colors.muted, fontSize: 14, lineHeight: 21 },
}));
