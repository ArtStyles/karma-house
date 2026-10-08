import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/AgencyProvider';
import {agencyError} from '../agencies/domain';
import type { CapturedAccountContext, CapturedAgencyContext } from '../agencies/controller';
import { createAgencyMessagingRepository, mergeAgencyMessages } from '../agencies/messaging/repository';
import { agencyConversationCounterparts } from '../agencies/messaging/counterparts';
import { createAgencyDealRepository } from '../agencies/deals/repository';
import type { AgencyConversation, AgencyMessage } from '../agencies/messaging/types';
import { createMessageId, isUuid } from '../messaging/domain';
import { supabase } from '../lib/supabase';
import { Button, Notice, PageTitle } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { ReportConversationSheet } from '../components/messaging/ReportConversationSheet';
import { AgencyProposalPanel } from '../components/agencies/AgencyProposalPanel';
import { createThemedStyles } from '../theme';
export default function AgencyConversationScreen() {
    const { id, agencyId } = useLocalSearchParams<{
        id: string;
        agencyId?: string;
    }>();
    const auth = useAuth(), w = useAgencyWorkspace();
    const { styles: s, colors } = useStyles();
    const repo = useMemo(() => supabase ? createAgencyMessagingRepository(supabase) : null, []);
    const scope = `${auth.user?.id}:${auth.session?.access_token}:${id}:${agencyId ?? 'buyer'}:${agencyId ? w.generation : ''}`;
    const current = useRef(scope);
    current.current = scope;
    const epoch = useRef(0), busyRef = useRef(false);
    const [state, setState] = useState<{
        scope: string;
        conversation: AgencyConversation | null;
        messages: AgencyMessage[];
        hasMore: boolean;
        error: string;
    }>({ scope, conversation: null, messages: [], hasMore: false, error: '' });
    const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [reportTarget, setReportTarget] = useState<string | null>(null);
    const pending = useRef<{
        scope: string;
        clientMessageId: string;
        body: string;
    } | null>(null);
    const visible = state.scope === scope ? state : null, c = visible?.conversation;
    const capture = useCallback((): CapturedAccountContext | CapturedAgencyContext => {
        if (!isUuid(id) || (agencyId && !isUuid(agencyId)))
            throw Error('Enlace de conversación inválido.');
        if (agencyId && w.activeAgencyId !== agencyId)
            throw Error('Selecciona el espacio de esta inmobiliaria para abrir su conversación.');
        const base = agencyId ? w.captureAgencyContext() : w.captureAccountContext(), version = epoch.current, key = current.current;
        return { ...base, checkpoint() { base.checkpoint(); if (version !== epoch.current || key !== current.current)
                throw Error('KH_AGENCY_CONTEXT_CHANGED'); } };
    }, [id, agencyId, agencyId ? w.activeAgencyId : null, w.captureAgencyContext, w.captureAccountContext]);
    const load = useCallback(async () => {
        if (!repo || !auth.user)
            return;
        let ctx: ReturnType<typeof capture> | undefined;
        try {
            ctx = capture();
            const conversation = await repo.get(id, ctx);
            const page = await repo.history(id, null, ctx);
            ctx.checkpoint();
            setState({ scope, conversation, messages: page.items, hasMore: page.hasMore, error: '' });
            await repo.markRead(id, conversation.lastSeq, ctx);
        }
        catch (e) {
            try {
                ctx?.checkpoint();
                if (current.current === scope)
                    setState({ scope, conversation: null, messages: [], hasMore: false, error: agencyError(e) });
            }
            catch { }
        }
        finally {
            ctx?.release();
        }
    }, [repo, auth.user?.id, capture, id, scope]);
    useFocusEffect(useCallback(() => {
        epoch.current++;
        busyRef.current = false;
        setBusy(false);
        setBody('');
        setReportTarget(null);
        pending.current = null;
        setState({scope,conversation:null,messages:[],hasMore:false,error:''});
        void load();
        return () => { epoch.current++; busyRef.current = false; };
    }, [load,scope]));
    async function act(work:(ctx:ReturnType<typeof capture>)=>Promise<void>) {
        if(busyRef.current) return;
        busyRef.current=true;
        setBusy(true);
        let ctx:ReturnType<typeof capture>|undefined;
        try {
            ctx=capture();
            await work(ctx);
            ctx.checkpoint();
        } catch(error) {
            try {
                ctx?.checkpoint();
                if(current.current===scope) setState(old=>({...old,error:agencyError(error)}));
            } catch { /* Context changed; discard the old result. */ }
        } finally {
            ctx?.release();
            if(current.current===scope){busyRef.current=false;setBusy(false);}
        }
    }
    async function send() {
        await act(async ctx=>{
            if(!repo||!c?.canSend)return;
            const saved=pending.current?.scope===scope?pending.current:{scope,clientMessageId:createMessageId(),body:body.trim()};
            pending.current=saved;
            const message=await repo.send({conversationId:id,clientMessageId:saved.clientMessageId,body:saved.body},ctx);
            ctx.checkpoint();
            pending.current=null;
            setBody('');
            setState(old=>({...old,messages:mergeAgencyMessages(old.messages,[message]),error:''}));
            await load();
        });
    }
    const counterpartActions = agencyConversationCounterparts(c ?? null, (visible?.messages ?? []).map(m => m.senderId), auth.user?.id, !!agencyId);
    const counterparts = counterpartActions.map(target => target.userId);
    return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <PageTitle title={c?.agencyName ?? 'Conversación con inmobiliaria'} subtitle={c?.propertyTitle} back/>
  {!auth.user ? <AccountPrompt returnTo={`/agency-conversation/${id}${agencyId ? `?agencyId=${agencyId}` : ''}`}/> : <>
   <Notice>Esta conversación pertenece a {c?.agencyName ?? 'la inmobiliaria elegida'}. Solo tú y su equipo autorizado podéis verla. Las conversaciones personales siguen siendo privadas.</Notice>
   {visible?.error && <Notice error>{visible.error}</Notice>}<Button label="Actualizar mensajes" secondary loading={busy} onPress={() => void load()}/>
   {c && agencyId && c.assigneeId !== auth.user.id && w.membership?.role !== 'manager' && !c.closedReason && <Button label="Tomar este caso" loading={busy} onPress={() => void act(async (ctx) => { if (!supabase || !('agencyId' in ctx))
            return; await createAgencyDealRepository(supabase).assign({ dealId: c.dealId, userId: ctx.userId, expectedVersion: c.dealVersion, clientRequestId: createMessageId() }, ctx); await load(); })}/>}
   {visible?.hasMore && <Button label="Ver mensajes anteriores" secondary loading={busy} onPress={() => void act(async (ctx) => { if (!repo)
            return; const page = await repo.history(id, visible.messages[0]?.seq ?? null, ctx); ctx.checkpoint(); setState(old => ({ ...old, messages: mergeAgencyMessages(old.messages, page.items), hasMore: page.hasMore })); })}/>}
   {visible?.messages.map(m => <View key={m.id} style={s.card}><Text style={s.meta}>{m.senderId === null ? 'Cuenta eliminada' : m.senderId === auth.user?.id ? 'Tú' : m.senderId === c?.buyerId ? 'Comprador' : `Equipo · participante ${counterparts.indexOf(m.senderId)+1}`} · {new Date(m.createdAt).toLocaleString('es', { timeZone: 'America/Havana' })}</Text><Text selectable style={s.body}>{m.body}</Text></View>)}
   {c && !c.canSend && <Notice>{c.closedReason ? 'Este expediente está cerrado. El historial se conserva.' : 'El envío no está disponible. Puede requerir asignación, autorización vigente o resolver un bloqueo.'}</Notice>}
   {c && <AgencyProposalPanel key={scope} conversation={c} actorId={auth.user.id} staff={!!agencyId} capture={capture} onChanged={load}/>}
   <TextInput accessibilityLabel="Mensaje a la inmobiliaria" style={s.input} multiline maxLength={2000} value={visible ? body : ''} editable={!!c?.canSend && !busy && !pending.current} onChangeText={setBody} placeholder="Escribe un mensaje" placeholderTextColor={colors.muted}/>
   <Button label={pending.current ? 'Reintentar el mismo mensaje' : 'Enviar mensaje'} disabled={!c?.canSend || !body.trim()} loading={busy} onPress={() => void send()}/>
   {pending.current && <Button label="Descartar intento" secondary disabled={busy} onPress={() => { pending.current = null; setBody(''); setState(old => ({ ...old, error: '' })); }}/>}
   {counterparts.map((target, index) => <View key={target} style={{ gap: 8 }}>{counterpartActions[index].canReport && <Button label={`Reportar ${agencyId ? 'comprador' : `participante ${index + 1}`}`} secondary onPress={() => setReportTarget(target)}/>}{[true, false].filter(blocked => blocked ? counterpartActions[index].canBlock : counterpartActions[index].canUnblock).map(blocked => <Button key={String(blocked)} label={`${blocked ? 'Bloquear' : 'Desbloquear'} ${agencyId ? 'comprador' : `participante ${index + 1}`}`} secondary onPress={() => void act(async (ctx) => { if (!repo)
            return; await repo.setBlocked({ conversationId: id, otherUserId: target, blocked, clientRequestId: createMessageId() }, ctx); await load(); })}/>)}</View>)}
  </>}
 </ScrollView><ReportConversationSheet visible={!!reportTarget && state.scope === scope} onClose={() => setReportTarget(null)} onReport={async (reason, details, clientRequestId) => { if (!repo || !reportTarget)
        throw Error('Selecciona un participante.'); const ctx = capture(); try {
        await repo.report({ conversationId: id, reportedUserId: reportTarget, reason, details, clientRequestId }, ctx);
    }
    finally {
        ctx.release();
    } }}/></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, gap: 14 }, card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 8 }, body: { color: colors.ink, fontSize: 16, lineHeight: 24 }, meta: { color: colors.muted, fontSize: 12 }, input: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, color: colors.ink, minHeight: 90 } }));
