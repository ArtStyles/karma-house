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
import { ActionGroup, Button, EmptyState, goBack, Icon, IconButton, Notice, PageTitle, type IconName } from '../components/ui';
import { ArchImage } from '../components/ArchImage';
import { Sheet } from '../components/Sheet';
import { useMessaging } from '../messaging/MessagingProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

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

/** `embedded` is the right-hand pane of the wide inbox: no back button, the list stays beside it. */
export function ConversationBody({ id, userId, embedded = false }: { id: string; userId: string; embedded?: boolean }) {
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
  const [blockConfirm, setBlockConfirm] = useState(false);
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
    {opening ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <><Notice error>{issue || syncIssue || messaging.error || 'Esta conversación no está disponible para tu cuenta.'}</Notice><Button label="Ir a mensajes" onPress={() => router.replace('/messages')} style={{ marginTop: 12 }} /></>}
  </ScrollView></View></SafeAreaView>;

  const lastOwnKey = [...rows].reverse().find(row => !row.message?.negotiation && (row.message ?? row.pending).senderId === userId)?.key;
  const disabledReason = conversation.blockedByMe ? 'Has bloqueado a esta persona. Puedes leer el historial y desbloquearla desde las opciones.' : conversation.blockedByOther ? 'No puedes enviar mensajes a esta persona. El historial sigue disponible.' : conversation.managementChanged ? 'La gestión del anuncio cambió. Esta conversación conserva su historial y sus acuerdos con los participantes anteriores.' : !conversation.propertyAvailable ? 'Esta vivienda ya no está disponible para nuevas conversaciones. Puedes consultar el historial.' : !conversation.canSend ? 'No se pueden enviar mensajes en esta conversación.' : '';
  const syncError = syncIssue || history?.error || messaging.error;
  const toggleBlock = () => void perform('block', async () => { await latest.current.setBlocked(id, !conversation.blockedByMe); await invalidateAfterBlockChange(); if (mounted.current) { setMenu(false); setBlockConfirm(false); setNotice(conversation.blockedByMe ? 'Has desbloqueado a esta persona.' : 'Has bloqueado a esta persona.'); } });
  const initials = conversation.otherName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('es') || '·';

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    {/* Android runs edge-to-edge (targetSdk 36), so the window no longer shrinks for the keyboard:
        without padding on Android too, the keyboard covers the composer. */}
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.shell}>
        <View style={styles.chatHeader}>
          {!embedded && <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/messages')} />}
          <ArchImage width={40} height={46} bottom={12} style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></ArchImage>
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
        <View style={styles.privacy}><Icon name="lock-closed-outline" size={14} color={colors.muted} /><Text style={styles.privacyText}>Tu teléfono y tu correo no se muestran.</Text></View>
        <ConversationNegotiations conversation={conversation} userId={userId} store={negotiations} mutations={negotiationMutations} request={sheet} onClose={() => setSheet(null)} />
        {(issue || syncError) && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{issue || syncError}</Text></View>}
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
        {!!disabledReason && <View style={[styles.reason, conversation.blockedByMe && styles.reasonBlocked]}>
          <Text style={styles.reasonText}>{disabledReason}</Text>
          {conversation.blockedByMe && <Button label="Desbloquear persona" secondary loading={busy === 'block'} disabled={!!busy} onPress={toggleBlock} style={styles.unblock} />}
        </View>}
        {conversation.managementChanged&&conversation.currentContactAvailable&&<View style={styles.padding}><Button secondary label={`Consultar al gestor actual${conversation.currentManagerName?`: ${conversation.currentManagerName}`:''}`} onPress={()=>router.push(`/property/${conversation.propertyId}`)}/><Text style={styles.disabledReason}>Abrirás otra conversación desde la ficha actual. Este historial y sus borradores permanecen aquí.</Text></View>}
        {!!composer.error && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{composer.error}</Text><Pressable accessibilityRole="button" onPress={() => { void composer.retry().catch(() => undefined); }} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Visitas y ofertas" onPress={() => { Keyboard.dismiss(); setSheet({}); }} style={({ pressed }) => [styles.plus, pressed && { opacity: 0.7 }]}>
            <Icon name="add" size={26} color={colors.ink} />
          </Pressable>
          <View style={styles.inputField}><TextInput accessibilityLabel="Escribe un mensaje" placeholder={auth.suspended ? 'Tu cuenta está suspendida' : composer.ready ? 'Escribe un mensaje…' : 'Recuperando borrador…'} placeholderTextColor={colors.muted} value={composer.text} onChangeText={composer.change} multiline numberOfLines={Platform.OS === 'web' ? 1 : undefined} maxLength={2000} editable={composer.ready && !busy && !auth.suspended && !conversation.managementChanged} style={[styles.input, !conversation.canSend && styles.mutedInput]} textAlignVertical="top" /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim(), busy: busy === 'send' }} disabled={auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim()} onPress={send} style={({ pressed }) => [styles.send, (auth.suspended || !conversation.canSend || !composer.ready || !!busy || !composer.text.trim() || pressed) && styles.sendDisabled]}>
            {busy === 'send' ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="paper-plane" size={21} color={colors.onPrimary} />}
          </Pressable>
        </View>
        {composer.text.length > 1800 && <Text style={styles.count}>{composer.text.length}/2000</Text>}
      </View>
    </KeyboardAvoidingView>
    {/* A menu anchored to the options button; blocking asks first in a sheet. */}
    <Modal visible={menu} transparent animationType="fade" onRequestClose={() => { if (!busy) setMenu(false); }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones" onPress={() => { if (!busy) setMenu(false); }} style={[StyleSheet.absoluteFill, styles.menuVeil]} />
      <View accessibilityViewIsModal accessibilityRole="menu" accessibilityLabel="Opciones de conversación" style={[styles.menu, { top: insets.top + 60 }]}>
        {conversation.propertyAvailable && <MenuItem icon="home-outline" label="Ver vivienda" onPress={() => { setMenu(false); router.push(`/property/${conversation.propertyId}`); }} />}
        <MenuItem icon="calendar-outline" label="Visitas y ofertas" onPress={() => { setMenu(false); setSheet({}); }} />
        <MenuItem icon="flag-outline" label="Reportar conversación" disabled={!!busy} onPress={() => { setMenu(false); setReport(true); }} />
        <MenuItem icon={conversation.blockedByMe ? 'checkmark-circle-outline' : 'ban-outline'} label={conversation.blockedByMe ? 'Desbloquear persona' : 'Bloquear persona'} danger={!conversation.blockedByMe} disabled={!!busy}
          onPress={() => { if (conversation.blockedByMe) toggleBlock(); else { setMenu(false); setBlockConfirm(true); } }} />
        {!!issue && <Notice error>{issue}</Notice>}
      </View>
    </Modal>
    <Sheet visible={blockConfirm} onClose={() => { if (!busy) setBlockConfirm(false); }}>
      <View style={styles.warning}><Icon name="ban-outline" size={22} color={colors.danger} /></View>
      <Text accessibilityRole="header" style={styles.sheetTitle}>¿Bloquear a {conversation.otherName}?</Text>
      <Text style={styles.sheetDescription}>Al bloquear, no podréis enviaros mensajes en ninguna de vuestras conversaciones. El historial se conserva.</Text>
      <Text style={styles.sheetHint}>Puedes desbloquear a esta persona más tarde desde las opciones de la conversación.</Text>
      {!!issue && <Notice error>{issue}</Notice>}
      <View style={styles.sheetActions}>
        <Button label="Cancelar" secondary disabled={!!busy} onPress={() => setBlockConfirm(false)} style={styles.sheetButton} />
        <Pressable accessibilityRole="button" accessibilityLabel="Bloquear persona" accessibilityState={{ disabled: !!busy, busy: busy === 'block' }} disabled={!!busy} onPress={toggleBlock} style={({ pressed }) => [styles.danger, (pressed || !!busy) && { opacity: .7 }]}>
          {busy === 'block' ? <ActivityIndicator color={colors.onDark} /> : <Text style={styles.dangerText}>Bloquear persona</Text>}
        </Pressable>
      </View>
    </Sheet>
    <Sheet visible={!!discard} onClose={() => { if (!busy) setDiscard(null); }} title="Descartar mensaje">
      <Text style={styles.sheetDescription}>Se quitará de la bandeja de salida de este dispositivo. No se borran mensajes ya recibidos por la otra persona.</Text>
      {!!issue && <Notice error>{issue}</Notice>}
      <View style={styles.sheetActions}>
        <Button label="Cancelar" secondary disabled={!!busy} onPress={() => setDiscard(null)} style={styles.sheetButton} />
        <Button label="Confirmar descarte" loading={busy === 'discard'} disabled={!!busy} onPress={() => discard && void perform('discard', async () => { await latest.current.discardMessage(discard); if (mounted.current) setDiscard(null); })} style={styles.sheetButton} />
      </View>
    </Sheet>
    <Sheet visible={!!cancelTarget} onClose={() => { if (!negotiations.mutating) setCancelTarget(null); }} title="¿Cancelar el acuerdo?">
      {cancelTarget && <Text style={styles.sheetDescription}>La {proposalSubject(cancelTarget)} ya estaba aceptada. Si la cancelas, {conversation.otherName} lo verá en el chat.</Text>}
      <ActionGroup><Button label="Cancelar acuerdo" loading={negotiations.mutating} onPress={() => { const target = cancelTarget; if (target) void negotiationMutations.respond(target, 'cancel').finally(() => { if (mounted.current) setCancelTarget(null); }); }} />
      <Button label="Mantener acuerdo" secondary disabled={negotiations.mutating} onPress={() => setCancelTarget(null)} /></ActionGroup>
    </Sheet>
    <ReportConversationSheet visible={report} onClose={() => setReport(false)} onReport={(reason, details, clientId) => latest.current.reportConversation(id, reason, details, clientId)} />
  </SafeAreaView>;
}

function message(failure: unknown, fallback: string) { return failure instanceof Error && failure.message ? failure.message : fallback; }

function MenuItem({ icon, label, onPress, danger = false, disabled = false }: { icon: IconName; label: string; onPress(): void; danger?: boolean; disabled?: boolean }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.menuItem, danger && styles.menuDanger, (pressed || disabled) && { opacity: .6 }]}>
    <Icon name={icon} size={20} color={danger ? colors.danger : colors.muted} /><Text style={[styles.menuText, danger && styles.menuDangerText]}>{label}</Text>
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, padding: { paddingHorizontal: 16 }, loading: { padding: 36 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  avatar: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }, avatarText: { ...typography.cardTitle, color: colors.primary },
  person: { flex: 1, minWidth: 0 }, contextLink: { minHeight: 26, justifyContent: 'center' }, personName: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600' }, personHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  propertyLink: { color: colors.primary },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }, privacyText: { fontSize: 12, lineHeight: 16, color: colors.muted },
  messages: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 }, older: { alignSelf: 'center', marginBottom: 12 }, day: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 14, marginBottom: 10 },
  sync: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.softDanger, borderRadius: rounded.thumb, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 }, syncText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.danger }, retryLink: { minHeight: 44, justifyContent: 'center' }, link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  notice: { marginHorizontal: 16, paddingVertical: 6, color: colors.green, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  // Why nothing can be sent: blocked by me in a danger tint, with the way back.
  reason: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: rounded.card, backgroundColor: colors.surface, gap: 10 }, reasonBlocked: { backgroundColor: colors.softDanger }, reasonText: { color: colors.body, fontSize: 14, lineHeight: 20, textAlign: 'center' }, unblock: { minHeight: 48, paddingVertical: 10 },
  disabledReason: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 8 },
  toBottom: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44, paddingHorizontal: 18, backgroundColor: colors.surface, borderRadius: rounded.pill, borderWidth: 1, borderColor: colors.border, boxShadow: '0 6px 18px rgba(0,0,0,0.25)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.paper },
  plus: { width: 48, height: 48, marginBottom: 2, borderRadius: rounded.pill, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  inputField: { flex: 1, minWidth: 0 }, input: { minHeight: 52, maxHeight: 152, fontSize: 16, lineHeight: 22, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: rounded.pill, borderWidth: 1, borderColor: colors.border, color: colors.ink }, mutedInput: { opacity: 0.6 },
  send: { width: 48, height: 48, marginBottom: 2, borderRadius: rounded.pill, backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, count: { fontSize: 12, color: colors.muted, textAlign: 'right', paddingHorizontal: 20, paddingBottom: 6 },
  menuVeil: { backgroundColor: colors.subtleOverlay },
  menu: { position: 'absolute', right: 16, width: 264, padding: 8, borderRadius: rounded.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: '0 18px 40px rgba(0,0,0,0.35)', gap: 2 },
  menuItem: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: rounded.thumb }, menuText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 20 },
  menuDanger: { marginTop: 6, backgroundColor: colors.softDanger }, menuDangerText: { color: colors.danger, fontWeight: '600' },
  warning: { width: 52, height: 52, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softDanger },
  sheetTitle: { ...typography.sheetTitle, color: colors.ink }, sheetDescription: { color: colors.body, fontSize: 15, lineHeight: 22 }, sheetHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  // Side by side when both fit; stacked at 320 px so «Bloquear persona» stays on one line.
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  sheetButton: { flexGrow: 1, flexBasis: 136 }, danger: { flexGrow: 1, flexBasis: 136, minHeight: 56, borderRadius: rounded.pill, backgroundColor: colors.dangerFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, dangerText: { color: colors.onDark, fontSize: 16, lineHeight: 20, fontWeight: '600' },
}));
