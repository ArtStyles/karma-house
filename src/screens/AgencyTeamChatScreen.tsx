import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../agencies/controller';
import { agencyError } from '../agencies/domain';
import { mergeAgencyMessages } from '../agencies/messaging/repository';
import { isAgencyReadAccessFailure, readIncomingAgencyMessages, startAgencyPoll } from '../agencies/messaging/live';
import { createAgencyTeamChatRepository, type AgencyTeamChat, type AgencyTeamMessage } from '../agencies/messaging/teamChat';
import { messageDay as day } from '../agencies/messaging/presentation';
import { createMessageId } from '../messaging/domain';
import { supabase } from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { AgencyMark } from '../components/agencies/AgencyMark';
import { MessageBubble } from '../components/messaging/MessageBubble';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { Button, EmptyState, goBack, Icon, IconButton, PageTitle } from '../components/ui';
import { agencyRoleLabel } from './AgencyWorkspaceScreen';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

const repo = supabase ? createAgencyTeamChatRepository(supabase) : null;
type Feed = { chat: AgencyTeamChat | null; messages: AgencyTeamMessage[]; hasMore: boolean; error: string; loading: boolean };

export default function AgencyTeamChatScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth(), w = useAgencyWorkspace();
  const gate = !auth.user ? <AccountPrompt returnTo="/agency-team-chat" />
    : !w.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
    : !w.activeAgencyId || !w.membership || !w.activeAgency ? <EmptyState plain title="Elige una inmobiliaria" description="El chat del equipo es el de la inmobiliaria que tengas abierta en Mi inmobiliaria." action={<Button label="Ir a Mi inmobiliaria" onPress={() => router.push('/agency-workspace')} />} />
    : !repo ? <EmptyState plain title="Chat no disponible" description="El chat del equipo necesita conexión con el servicio." /> : null;
  if (gate || !auth.user || !w.activeAgencyId) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={[styles.shell, styles.padding]}><PageTitle compact title="Chat del equipo" back fallback="/agency-workspace" />{gate}</View></SafeAreaView>;
  return <TeamChatBody key={`${auth.user.id}:${w.activeAgencyId}:${w.generation}`} userId={auth.user.id} agencyId={w.activeAgencyId} />;
}

function TeamChatBody({ userId, agencyId }: { userId: string; agencyId: string }) {
  const { colors, styles } = useStyles();
  const w = useAgencyWorkspace();
  const active = useMessagingActivity();
  const [feed, setFeed] = useState<Feed>({ chat: null, messages: [], hasMore: false, error: '', loading: true });
  // A new id for every edit; a retry of the same text reuses it, so a lost reply is not sent twice.
  const [draft, setDraft] = useState({ text: '', id: createMessageId() });
  const [sending, setSending] = useState(false), [sendError, setSendError] = useState(''), [older, setOlder] = useState(false);
  const feedRef = useRef(feed); feedRef.current = feed;
  const mounted = useRef(true), reading = useRef(false), markedSeq = useRef(0);
  const list = useRef<FlatList<AgencyTeamMessage>>(null), follow = useRef(true);
  const anchor = useRef<{ offset: number; content: number } | null>(null), metrics = useRef({ offset: 0, content: 0 });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!repo || reading.current) return;
    reading.current = true;
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyReadContext();
      if (ctx.agencyId !== agencyId) throw Error('KH_AGENCY_CONTEXT_CHANGED');
      const chat = await repo.get(ctx);
      const previous = feedRef.current;
      const page = await readIncomingAgencyMessages(repo, agencyId, previous.messages, previous.hasMore, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      setFeed(old => ({ chat, messages: mergeAgencyMessages(old.messages, page.items), hasMore: old.messages.length ? old.hasMore : page.hasMore, error: '', loading: false }));
      if (chat.unreadCount > 0 && chat.lastSeq > markedSeq.current) {
        markedSeq.current = chat.lastSeq;
        await repo.markRead(chat.lastSeq, ctx).catch(() => { markedSeq.current = 0; });
      }
    } catch (error) {
      if (mounted.current) setFeed(old => isAgencyReadAccessFailure(error)
        ? { chat: null, messages: [], hasMore: false, error: agencyError(error), loading: false }
        : { ...old, error: agencyError(error), loading: false });
    } finally { ctx?.release(); reading.current = false; }
  }, [agencyId, w.captureAgencyReadContext]);
  // Every 3 s while the screen is in front and the app is active, like the other agency chats.
  useFocusEffect(useCallback(() => active ? startAgencyPoll(load) : undefined, [active, load]));

  async function loadOlder() {
    const first = feed.messages[0];
    if (!repo || older || !first) return;
    setOlder(true);
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyReadContext();
      const page = await repo.history(agencyId, first.seq, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      anchor.current = { ...metrics.current };
      setFeed(old => ({ ...old, messages: mergeAgencyMessages(old.messages, page.items), hasMore: page.hasMore }));
    } catch (error) { if (mounted.current) setFeed(old => ({ ...old, error: agencyError(error) })); }
    finally { ctx?.release(); if (mounted.current) setOlder(false); }
  }
  async function send() {
    const body = draft.text.trim();
    if (!repo || sending || !body || !feed.chat?.canSend) return;
    setSending(true); setSendError('');
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyContext();
      if (ctx.agencyId !== agencyId) throw Error('KH_AGENCY_CONTEXT_CHANGED');
      const message = await repo.send({ clientMessageId: draft.id, body }, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      follow.current = true;
      markedSeq.current = Math.max(markedSeq.current, message.seq);
      setDraft({ text: '', id: createMessageId() });
      setFeed(old => ({ ...old, messages: mergeAgencyMessages(old.messages, [message]) }));
    } catch (error) { if (mounted.current) setSendError(agencyError(error)); }
    finally { ctx?.release(); if (mounted.current) setSending(false); }
  }

  const { chat, messages } = feed;
  const agency = w.activeAgency;
  const name = agency?.tradeName ?? 'tu inmobiliaria';
  const canSubmit = !!chat?.canSend && !sending && !!draft.text.trim();
  const blocked = !w.enabled ? 'La gestión de inmobiliarias está en pausa. Puedes leer el historial.'
    : agency?.state !== 'approved' ? 'La inmobiliaria no está aprobada ahora mismo. Puedes leer el historial.'
    : 'Tu cuenta no puede escribir en este chat ahora.';
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.shell}>
        <View style={styles.header}>
          <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/agency-workspace')} />
          <AgencyMark agencyId={agencyId} name={agency?.tradeName ?? ''} logoPath={agency?.logoPath} width={40} height={46} bottom={12} />
          <View style={styles.titleBox}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>Chat del equipo</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{agency?.tradeName}{chat ? ` · ${chat.memberCount === 1 ? '1 persona' : `${chat.memberCount} personas`}` : ''}</Text>
          </View>
        </View>
        <View style={styles.privacy}><Icon name="lock-closed-outline" size={14} color={colors.muted} /><Text style={styles.privacyText}>Solo lo ve el equipo de {name}.</Text></View>
        {!!feed.error && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{feed.error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <FlatList ref={list} data={messages} keyExtractor={m => m.id} style={styles.flex} contentContainerStyle={styles.messages} alwaysBounceVertical
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            metrics.current = { offset: contentOffset.y, content: contentSize.height };
            follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
          }} scrollEventThrottle={100}
          onContentSizeChange={(_, content) => {
            const mark = anchor.current;
            if (mark && content > mark.content) { list.current?.scrollToOffset({ offset: mark.offset + content - mark.content, animated: false }); anchor.current = null; }
            else if (follow.current) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
            metrics.current.content = content;
          }}
          ListHeaderComponent={feed.hasMore ? <Button label="Ver mensajes anteriores" secondary loading={older} onPress={() => void loadOlder()} style={styles.older} /> : null}
          ListEmptyComponent={feed.loading ? <ActivityIndicator accessibilityLabel="Consultando el chat del equipo" color={colors.primary} style={styles.loading} />
            : chat ? <EmptyState plain title="Todavía no hay mensajes" description={`Escribe al equipo de ${name}. Lo verán todas las personas del equipo.`} />
            : <EmptyState plain title="Chat no disponible" description="No se pudo abrir el chat de esta inmobiliaria." action={<Button label="Reintentar" secondary onPress={() => void load()} />} />}
          renderItem={({ item, index }) => {
            const previous = index > 0 ? messages[index - 1] : undefined;
            const date = day(item.createdAt), newDay = !previous || day(previous.createdAt) !== date;
            const own = item.senderId === userId;
            const author = own || (!newDay && previous?.senderId === item.senderId) ? undefined : `${item.senderName} · ${item.senderRole ? agencyRoleLabel[item.senderRole] : 'Ya no está en el equipo'}`;
            return <View>{newDay && <Text style={styles.day}>{date}</Text>}<MessageBubble row={{ key: item.id, message: item }} own={own} author={author} canRetry={false} busy={false} onRetry={() => undefined} onDiscard={() => undefined} /></View>;
          }}
        />
        {!!sendError && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{sendError}</Text></View>}
        {chat && !chat.canSend ? <Text style={styles.reason}>{blocked}</Text> : <View style={styles.composer}>
          <View style={styles.inputField}><TextInput accessibilityLabel="Mensaje para el equipo" placeholder="Escribe al equipo…" placeholderTextColor={colors.muted} value={draft.text}
            onChangeText={text => { setDraft({ text, id: createMessageId() }); setSendError(''); }} multiline maxLength={2000} editable={!!chat && !sending} style={[styles.input, (!chat || sending) && styles.mutedInput]} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: !canSubmit, busy: sending }} disabled={!canSubmit} onPress={() => void send()} style={({ pressed }) => [styles.send, !canSubmit && styles.sendDisabled, pressed && styles.pressed]}>
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="paper-plane" size={21} color={colors.onPrimary} />}
          </Pressable>
        </View>}
        {draft.text.length > 1800 && <Text style={styles.count}>{draft.text.length}/2000</Text>}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, padding: { paddingHorizontal: 16 }, loading: { padding: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  titleBox: { flex: 1, minWidth: 0 }, title: { ...typography.body, fontWeight: '600', color: colors.ink }, subtitle: { ...typography.label, fontWeight: '400', color: colors.muted },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }, privacyText: { ...typography.caption, color: colors.muted },
  messages: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 }, older: { alignSelf: 'center', marginBottom: 12 },
  day: { ...typography.caption, fontWeight: '600', color: colors.muted, textAlign: 'center', marginTop: 14, marginBottom: 10 },
  sync: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.softDanger, borderRadius: rounded.thumb, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  syncText: { ...typography.caption, flex: 1, color: colors.danger }, retryLink: { minHeight: 44, justifyContent: 'center' }, link: { ...typography.label, color: colors.primary },
  reason: { ...typography.bodySm, color: colors.body, textAlign: 'center', marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: rounded.card, backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.paper },
  inputField: { flex: 1, minWidth: 0 }, input: { ...typography.body, minHeight: 52, maxHeight: 152, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: rounded.pill, borderWidth: 1, borderColor: colors.border, color: colors.ink }, mutedInput: { opacity: 0.6 },
  send: { width: 48, height: 48, marginBottom: 2, borderRadius: rounded.pill, backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
  count: { ...typography.caption, color: colors.muted, textAlign: 'right', paddingHorizontal: 20, paddingBottom: 6 },
}));
