import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
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
import {useMessagingActivity} from '../components/messaging/useMessagingActivity';
import {startAgencyPoll,readIncomingAgencyMessages,isAgencyReadAccessFailure} from '../agencies/messaging/live';
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
    const epoch = useRef(0), busyRef = useRef(false), readTicket=useRef(0);
    const proposalRefresh=useRef(async()=>{}),proposalBlocked=useRef(false);
    const active=useMessagingActivity();
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
    const latestState=useRef(visible);latestState.current=visible;
    const capture = useCallback((write=false): CapturedAccountContext | CapturedAgencyContext => {
        if (!isUuid(id) || (agencyId && !isUuid(agencyId)))
            throw Error('Enlace de conversación inválido.');
        if (agencyId && w.activeAgencyId !== agencyId)
            throw Error('Selecciona el espacio de esta inmobiliaria para abrir su conversación.');
        const base = agencyId ? (write?w.captureAgencyContext():w.captureAgencyReadContext()) : w.captureAccountContext(), version = epoch.current, key = current.current;
        return { ...base, checkpoint() { base.checkpoint(); if (version !== epoch.current || key !== current.current)
                throw Error('KH_AGENCY_CONTEXT_CHANGED'); } };
    }, [id, agencyId, agencyId ? w.activeAgencyId : null, w.captureAgencyReadContext,w.captureAgencyContext, w.captureAccountContext]);
    const load = useCallback(async () => {
        if (!repo || !auth.user)
            return;
        const ticket=++readTicket.current;
        let ctx: ReturnType<typeof capture> | undefined;
        try {
            ctx = capture();
            const conversation = await repo.get(id, ctx);
            const previous=latestState.current;
            const page = await readIncomingAgencyMessages(repo,id,previous?.messages??[],previous?.hasMore??false,ctx);
            ctx.checkpoint();
            if(ticket!==readTicket.current)return;
            setState(old=>({ scope, conversation, messages: mergeAgencyMessages(old.scope===scope?old.messages:[],page.items), hasMore: old.scope===scope&&old.messages.length?old.hasMore:page.hasMore, error: '' }));
            await repo.markRead(id, conversation.lastSeq, ctx);
        }
        catch (e) {
            try {
                ctx?.checkpoint();
                if (current.current === scope && ticket===readTicket.current) {
                    const preserve=!!ctx&&!isAgencyReadAccessFailure(e);
                    setState(old=>preserve&&old.scope===scope
                        ? {...old,error:agencyError(e)}
                        : { scope, conversation: null, messages: [], hasMore: false, error: agencyError(e) });
                    if(!preserve){setBody('');setReportTarget(null);pending.current=null;}
                }
            }
            catch { }
        }
        finally {
            ctx?.release();
        }
    }, [repo, auth.user?.id, capture, id, scope]);
    const reload=useConsultationRefresh(scope,async()=>{await load();await proposalRefresh.current();},()=>busyRef.current||proposalBlocked.current||!auth.user||!!reportTarget);
    useFocusEffect(useCallback(() => {
        epoch.current++;
        busyRef.current = false;
        setBusy(false);
        setBody('');
        setReportTarget(null);
        pending.current = null;
        setState({scope,conversation:null,messages:[],hasMore:false,error:''});
        void load();
        return () => {
            epoch.current++; readTicket.current++; busyRef.current = false;
            setState({scope,conversation:null,messages:[],hasMore:false,error:''});
            setBody('');setReportTarget(null);pending.current=null;
        };
    }, [load,scope]));
    useEffect(()=>{if(!active||!auth.user||(agencyId&&w.activeAgencyId!==agencyId))return;return startAgencyPoll(load);},[active,load,auth.user?.id,agencyId,w.activeAgencyId]);
    async function act(work:(ctx:ReturnType<typeof capture>)=>Promise<void>,write=false) {
        if(busyRef.current || reload.isRefreshing()) return;
        busyRef.current=true;
        setBusy(true);
        let ctx:ReturnType<typeof capture>|undefined;
        try {
            ctx=capture(write);
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
        },true);
    }
    const counterpartActions = agencyConversationCounterparts(c ?? null, (visible?.messages ?? []).map(m => m.senderId), auth.user?.id, !!agencyId);
    const counterparts = counterpartActions.map(target => target.userId);
    return <SafeAreaView style={s.safe}><ScrollView alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!!auth.user&&!reportTarget} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
  <PageTitle title={c?.agencyName ?? 'Conversación con inmobiliaria'} subtitle={c?.propertyTitle} back/>
  {!auth.user ? <AccountPrompt returnTo={`/agency-conversation/${id}${agencyId ? `?agencyId=${agencyId}` : ''}`}/> : <>
   <Notice>Esta conversación pertenece a {c?.agencyName ?? 'la inmobiliaria elegida'}. Solo tú y su equipo autorizado podéis verla. Las conversaciones personales siguen siendo privadas.</Notice>
   {visible?.error && <Notice error>{visible.error} Desliza hacia abajo para reintentar.</Notice>}
   {w.enabled && w.activeAgency?.state==='approved' && c && agencyId && c.assigneeId !== auth.user.id && w.membership?.role !== 'manager' && !c.closedReason && <Button label="Tomar este caso" loading={busy} onPress={() => void act(async (ctx) => { if (!supabase || !('agencyId' in ctx))
            return; await createAgencyDealRepository(supabase).assign({ dealId: c.dealId, userId: ctx.userId, expectedVersion: c.dealVersion, clientRequestId: createMessageId() }, ctx); await load(); },true)}/>}
   {visible?.hasMore && <Button label="Ver mensajes anteriores" secondary loading={busy} onPress={() => void act(async (ctx) => { if (!repo)
            return; const page = await repo.history(id, visible.messages[0]?.seq ?? null, ctx); ctx.checkpoint(); setState(old => ({ ...old, messages: mergeAgencyMessages(old.messages, page.items), hasMore: page.hasMore })); })}/>}
   {visible?.messages.map(m => <View key={m.id} style={s.card}><Text style={s.meta}>{m.senderId === null ? 'Cuenta eliminada' : m.senderId === auth.user?.id ? 'Tú' : m.senderId === c?.buyerId ? 'Comprador' : `Equipo · participante ${counterparts.indexOf(m.senderId)+1}`} · {new Date(m.createdAt).toLocaleString('es', { timeZone: 'America/Havana' })}</Text><Text selectable style={s.body}>{m.body}</Text></View>)}
   {c && !c.canSend && <Notice>{c.closedReason ? 'Este expediente está cerrado. El historial se conserva.' : 'El envío no está disponible. Puede requerir asignación, autorización vigente o resolver un bloqueo.'}</Notice>}
   {c && <AgencyProposalPanel consultation={{refresh:proposalRefresh,blocked:proposalBlocked,refreshing:reload.isRefreshing}} onRequestClosure={agencyId&&c&&!c.closedReason?()=>router.push({pathname:'/agency-closures',params:{dealId:c.dealId}}):undefined} key={scope} conversation={c} actorId={auth.user.id} staff={!!agencyId} capture={capture} onChanged={load}/>}
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
