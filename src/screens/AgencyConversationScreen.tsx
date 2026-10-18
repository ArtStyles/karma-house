import { KeyboardAvoidingView } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/AgencyProvider';
import {agencyError} from '../agencies/domain';
import type { CapturedAccountContext, CapturedAgencyContext } from '../agencies/controller';
import { createAgencyMessagingRepository, mergeAgencyMessages } from '../agencies/messaging/repository';
import { initials, messageDay, messageSide, sendBlockedReason, teamAuthor } from '../agencies/messaging/presentation';
import type { AgencyConversation, AgencyMessage } from '../agencies/messaging/types';
import { createMessageId, isUuid } from '../messaging/domain';
import { supabase } from '../lib/supabase';
import { ActionGroup, Button, EmptyState, goBack, Icon, IconButton, Notice, PageTitle, type IconName } from '../components/ui';
import { AccountPrompt } from '../components/AccountPrompt';
import { ArchImage } from '../components/ArchImage';
import { Sheet } from '../components/Sheet';
import { AgencyMark } from '../components/agencies/AgencyMark';
import { AgencyAttendantsSheet } from '../components/agencies/AgencyAttendantsSheet';
import { MessageBubble } from '../components/messaging/MessageBubble';
import { ReportConversationSheet } from '../components/messaging/ReportConversationSheet';
import { AgencyProposalPanel } from '../components/agencies/AgencyProposalPanel';
import {useMessagingActivity} from '../components/messaging/useMessagingActivity';
import {startAgencyPoll,readIncomingAgencyMessages,isAgencyReadAccessFailure} from '../agencies/messaging/live';
import { agencyRoleLabel } from './AgencyWorkspaceScreen';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';
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
    const scroll=useRef<ScrollView>(null),follow=useRef(true);
    /** Without a person, a report from the client names «la inmobiliaria»; the server picks the last team member who wrote. */
    const AGENCY_TARGET = 'agency';
    const active=useMessagingActivity();
    const [state, setState] = useState<{
        scope: string;
        conversation: AgencyConversation | null;
        messages: AgencyMessage[];
        hasMore: boolean;
        error: string;
    }>({ scope, conversation: null, messages: [], hasMore: false, error: '' });
    const [reading,setReading]=useState({scope,loading:true});
    const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [reportTarget, setReportTarget] = useState<string | null>(null);
    const [menu, setMenu] = useState(false), [blockConfirm, setBlockConfirm] = useState(false), [teamSheet, setTeamSheet] = useState(false), [proposalsOpen, setProposalsOpen] = useState(false);
    const pending = useRef<{
        scope: string;
        clientMessageId: string;
        body: string;
    } | null>(null);
    const loading=reading.scope!==scope||reading.loading;
    const visible = state.scope === scope ? state : null, c = visible?.conversation;
    const latestState=useRef(visible);latestState.current=visible;
    const capture = useCallback((write=false): CapturedAccountContext | CapturedAgencyContext => {
        if (!isUuid(id) || (agencyId && !isUuid(agencyId)))
            throw Error('Enlace de conversación inválido.');
        if (agencyId && w.activeAgencyId !== agencyId)
            throw Error('Selecciona esta inmobiliaria en Mi inmobiliaria para abrir su conversación.');
        const base = agencyId ? (write?w.captureAgencyContext():w.captureAgencyReadContext()) : w.captureAccountContext(), version = epoch.current, key = current.current;
        return { ...base, checkpoint() { base.checkpoint(); if (version !== epoch.current || key !== current.current)
                throw Error('KH_AGENCY_CONTEXT_CHANGED'); } };
    }, [id, agencyId, agencyId ? w.activeAgencyId : null, w.captureAgencyReadContext,w.captureAgencyContext, w.captureAccountContext]);
    const load = useCallback(async () => {
        if (!repo || !auth.user) {
            if(current.current===scope)setReading({scope,loading:false});
            return;
        }
        const ticket=++readTicket.current;
        setReading({scope,loading:true});
        let ctx: ReturnType<typeof capture> | undefined;
        try {
            ctx = capture();
            const conversation = await repo.get(id, ctx);
            const previous=latestState.current;
            const page = await readIncomingAgencyMessages(repo,id,previous?.messages??[],previous?.hasMore??false,ctx);
            ctx.checkpoint();
            if(ticket!==readTicket.current)return;
            setState(old=>({ scope, conversation, messages: mergeAgencyMessages(old.scope===scope?old.messages:[],page.items), hasMore: old.scope===scope&&old.messages.length?old.hasMore:page.hasMore, error: '' }));
            // Each read takes the case's locks and writes a receipt: only when something is unread.
            if (conversation.unreadCount > 0) await repo.markRead(id, conversation.lastSeq, ctx);
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
            try {ctx?.checkpoint();if(current.current===scope&&ticket===readTicket.current)setReading({scope,loading:false});}catch{}
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
        setMenu(false);setBlockConfirm(false);setTeamSheet(false);setProposalsOpen(false);
        pending.current = null;
        setState({scope,conversation:null,messages:[],hasMore:false,error:''});
        setReading({scope,loading:true});
        void load();
        return () => {
            epoch.current++; readTicket.current++; busyRef.current = false;
            setState({scope,conversation:null,messages:[],hasMore:false,error:''});
            setReading({scope,loading:false});
            setBody('');setReportTarget(null);pending.current=null;
            setMenu(false);setBlockConfirm(false);setTeamSheet(false);
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
    const staff = !!agencyId, me = auth.user?.id;
    const messages = visible?.messages ?? [];
    const proposals = !!c && (!staff || c.canSeeDeal);
    const reason = c ? sendBlockedReason(c, staff) : '';
    const blockedClient = staff && !!c?.clientBlockedByMe;
    const canReport = !!c && messages.some(m => staff ? m.senderId === c.buyerId : messageSide(m, c, me, false).own === false);
    const lead = c?.attendants.find(a => a.lead);
    const attending = c?.attendants.filter(a => !a.lead) ?? [];
    function option(icon: IconName, label: string, onPress: () => void, danger = false) {
        return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={() => { setMenu(false); onPress(); }} style={({ pressed }) => [s.option, danger && s.optionDanger, (pressed || busy) && s.dimmed]}>
            <Icon name={icon} size={20} color={danger ? colors.danger : colors.muted} /><Text style={[s.optionText, danger && s.optionDangerText]}>{label}</Text>
        </Pressable>;
    }
    const toggleBlock = (blocked: boolean) => void act(async ctx => {
        if (!repo || !c) return;
        if (staff) { if (c.buyerId) await repo.setBlocked({ conversationId: id, otherUserId: c.buyerId, blocked, clientRequestId: createMessageId() }, ctx); }
        else await repo.setAgencyBlock({ conversationId: id, agencyId: c.agencyId, blocked, clientRequestId: createMessageId() }, ctx);
        ctx.checkpoint(); setBlockConfirm(false); await load();
    });
    return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><KeyboardAvoidingView style={s.flex} behavior="padding"><View style={s.shell}>
  {!auth.user ? <ScrollView contentContainerStyle={s.padding}><PageTitle compact title="Conversación con inmobiliaria" back/><AccountPrompt returnTo={`/agency-conversation/${id}${agencyId ? `?agencyId=${agencyId}` : ''}`}/></ScrollView> : <>
   <View style={s.header}>
    <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/messages')}/>
    {c && (staff ? <ArchImage width={40} height={46} bottom={12} style={s.avatar}><Text style={s.avatarText}>{initials(c.buyerName ?? '')}</Text></ArchImage>
     : <AgencyMark agencyId={c.agencyId} name={c.agencyName} width={40} height={46} bottom={12}/>)}
    <View style={s.titleBox}>
     <Text accessibilityRole="header" numberOfLines={1} style={s.title}>{c ? staff ? c.buyerName ?? 'Cliente' : c.agencyName : 'Conversación con inmobiliaria'}</Text>
     {c && <Pressable accessibilityRole="link" accessibilityLabel={`Ver vivienda: ${c.propertyTitle}`} onPress={() => router.push(`/property/${c.propertyId}`)} style={s.contextLink}><Text numberOfLines={1} style={s.subtitle}>{c.propertyTitle} ›</Text></Pressable>}
    </View>
    {c && <IconButton name="ellipsis-horizontal" label="Opciones de conversación" onPress={() => setMenu(true)}/>}
   </View>
   {c && <View style={s.privacy}><Icon name="lock-closed-outline" size={14} color={colors.muted}/><Text style={s.privacyText}>{staff ? `El cliente ve las respuestas como ${c.agencyName}.` : `Te responde el equipo de ${c.agencyName}. Tu teléfono y tu correo no se muestran.`}</Text></View>}
   {c && staff && <Pressable accessibilityRole="button" accessibilityLabel={`Quién atiende. ${lead ? `Responsable: ${lead.displayName}` : 'Sin responsable'}${attending.length ? `. Atienden también ${attending.map(a => a.displayName).join(', ')}` : ''}`} onPress={() => setTeamSheet(true)} style={({ pressed }) => [s.team, pressed && s.dimmed]}>
    <Icon name="people-outline" size={18} color={colors.primary}/>
    <Text numberOfLines={1} style={s.teamText}>{lead ? `Responsable: ${lead.displayName}` : 'Sin responsable'}{attending.length ? ` · Atienden: ${attending.map(a => a.displayName).join(', ')}` : ''}</Text>
    <Icon name="chevron-forward" size={16} color={colors.body}/>
   </Pressable>}
   {visible?.error && <View style={s.padding}><Notice error onRetry={()=>void reload.refresh()}>{visible.error}</Notice></View>}
   <ScrollView ref={scroll} style={s.flex} keyboardDismissMode="on-drag" alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.messages}
    onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80; }} scrollEventThrottle={100}
    onContentSizeChange={() => { if (follow.current && !proposalsOpen) scroll.current?.scrollToEnd({ animated: false }); }}
    refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!!auth.user&&!reportTarget} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}>
    {loading&&!c&&<ActivityIndicator accessibilityLabel="Consultando conversación privada" color={colors.primary} style={s.loading}/>}
    {!loading&&!c&&!visible?.error&&<EmptyState plain title="Conversación no disponible" description="No se pudo abrir una conversación autorizada en esta inmobiliaria."/>}
    {visible?.hasMore && <Button label="Ver mensajes anteriores" secondary loading={busy} style={s.older} onPress={() => void act(async (ctx) => { if (!repo)
            return; const page = await repo.history(id, visible.messages[0]?.seq ?? null, ctx); ctx.checkpoint(); setState(old => ({ ...old, messages: mergeAgencyMessages(old.messages, page.items), hasMore: page.hasMore })); })}/>}
    {c && !loading && !messages.length && <Text style={s.empty}>{staff ? 'El cliente aún no ha escrito.' : 'Escribe el primer mensaje.'}</Text>}
    {c && messages.map((m, index) => {
     const side = messageSide(m, c, me, staff), date = messageDay(m.createdAt), previous = messages[index - 1];
     const newDay = !previous || messageDay(previous.createdAt) !== date;
     const author = side.teammate && (newDay || previous?.senderId !== m.senderId) ? teamAuthor(m, agencyRoleLabel) : undefined;
     return <View key={m.id}>{newDay && <Text style={s.day}>{date}</Text>}<MessageBubble row={{ key: m.id, message: m }} own={side.own} teammate={side.teammate} author={author} canRetry={false} busy={false} onRetry={() => undefined} onDiscard={() => undefined}/></View>;
    })}
    {proposals && <View style={proposalsOpen ? s.proposals : s.hidden}><AgencyProposalPanel consultation={{refresh:proposalRefresh,blocked:proposalBlocked,refreshing:reload.isRefreshing}} onRequestClosure={agencyId&&c&&!c.closedReason?()=>router.push({pathname:'/agency-closures',params:{dealId:c.dealId}}):undefined} key={scope} conversation={c} actorId={auth.user.id} staff={staff} capture={capture} onChanged={load}/></View>}
   </ScrollView>
   {!!reason && <Text style={s.reason}>{reason}</Text>}
   {pending.current && !busy && <View style={s.retry}><Text accessibilityRole="alert" style={s.retryText}>Este mensaje no se envió.</Text><ActionGroup><Button label="Reintentar el mismo mensaje" loading={busy} onPress={() => void send()}/><Button label="Descartar intento" secondary disabled={busy} onPress={() => { pending.current = null; setBody(''); setState(old => ({ ...old, error: '' })); }}/></ActionGroup></View>}
   {c && c.canSend && <View style={s.composer}>
    {proposals && <Pressable accessibilityRole="button" accessibilityLabel="Visitas y ofertas" accessibilityState={{ expanded: proposalsOpen }} onPress={() => { setProposalsOpen(open => !open); requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })); }} style={({ pressed }) => [s.plus, pressed && s.dimmed]}><Icon name={proposalsOpen ? 'close' : 'add'} size={26} color={colors.ink}/></Pressable>}
    <View style={s.inputField}><TextInput accessibilityLabel={staff ? 'Mensaje al cliente' : 'Mensaje a la inmobiliaria'} style={[s.input, (busy || !!pending.current) && s.mutedInput]} multiline maxLength={2000} value={visible ? body : ''} editable={!busy && !pending.current} onChangeText={setBody} placeholder={staff ? `Responde como ${c.agencyName}…` : 'Escribe un mensaje…'} placeholderTextColor={colors.muted}/></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: busy || !!pending.current || !body.trim(), busy }} disabled={busy || !!pending.current || !body.trim()} onPress={() => void send()} style={({ pressed }) => [s.send, (busy || !!pending.current || !body.trim()) && s.sendDisabled, pressed && s.dimmed]}>
     {busy ? <ActivityIndicator color={colors.onPrimary}/> : <Icon name="paper-plane" size={21} color={colors.onPrimary}/>}
    </Pressable>
   </View>}
   {body.length > 1800 && <Text style={s.count}>{body.length}/2000</Text>}
  </>}
 </View></KeyboardAvoidingView>
 {c && <Sheet visible={menu} onClose={() => setMenu(false)} title="Opciones">
  {option('home-outline', 'Ver vivienda', () => router.push(`/property/${c.propertyId}`))}
  {proposals && option('calendar-outline', 'Visitas y ofertas', () => { setProposalsOpen(true); requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })); })}
  {staff && c.canSeeDeal && option('folder-open-outline', 'Abrir expediente', () => router.push({ pathname: '/agency-deal/[id]', params: { id: c.dealId } }))}
  {staff && option('people-outline', 'Quién atiende', () => setTeamSheet(true))}
  {canReport && option('flag-outline', staff ? 'Reportar cliente' : 'Reportar conversación', () => setReportTarget(staff ? c.buyerId : AGENCY_TARGET))}
  {!staff && c.blockedUserIds.length > 0 && option('checkmark-circle-outline', 'Desbloquear al equipo', () => void act(async ctx => { if (!repo) return; for (const target of c.blockedUserIds) await repo.setBlocked({ conversationId: id, otherUserId: target, blocked: false, clientRequestId: createMessageId() }, ctx); await load(); }))}
  {(staff ? blockedClient : c.agencyBlocked) ? option('checkmark-circle-outline', staff ? 'Desbloquear cliente' : `Desbloquear a ${c.agencyName}`, () => toggleBlock(false))
   : (!staff || c.buyerId) && option('ban-outline', staff ? 'Bloquear cliente' : `Bloquear a ${c.agencyName}`, () => setBlockConfirm(true), true)}
 </Sheet>}
 {c && <Sheet visible={blockConfirm} onClose={() => { if (!busy) setBlockConfirm(false); }}>
  <View style={s.warning}><Icon name="ban-outline" size={22} color={colors.danger}/></View>
  <Text accessibilityRole="header" style={s.sheetTitle}>{staff ? `¿Bloquear a ${c.buyerName ?? 'este cliente'}?` : `¿Bloquear a ${c.agencyName}?`}</Text>
  <Text style={s.sheetText}>{staff ? 'No podrás escribirle en ninguna conversación y no podréis escribiros en las personales. El resto del equipo sí podrá responderle aquí. El historial se conserva.' : `Nadie de ${c.agencyName} podrá escribirte y tú no podrás escribirles en ninguna conversación. El historial se conserva y puedes desbloquearla desde las opciones.`}</Text>
  {visible?.error ? <Notice error>{visible.error}</Notice> : null}
  <View style={s.sheetActions}><Button label="Cancelar" secondary disabled={busy} onPress={() => setBlockConfirm(false)} style={s.sheetButton}/>
   <Pressable accessibilityRole="button" accessibilityLabel={staff ? 'Bloquear cliente' : 'Bloquear inmobiliaria'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => toggleBlock(true)} style={({ pressed }) => [s.danger, (pressed || busy) && s.dimmed]}>
    {busy ? <ActivityIndicator color={colors.onDark}/> : <Text style={s.dangerText}>{staff ? 'Bloquear cliente' : 'Bloquear inmobiliaria'}</Text>}
   </Pressable></View>
 </Sheet>}
 {c && staff && <AgencyAttendantsSheet visible={teamSheet} onClose={() => setTeamSheet(false)} conversation={c} onChanged={load}/>}
 <ReportConversationSheet visible={!!reportTarget && state.scope === scope} onClose={() => setReportTarget(null)} onReport={async (reason, details, clientRequestId) => { if (!repo || !reportTarget)
        throw Error('Selecciona un participante.'); const ctx = capture(); try {
        await repo.report({ conversationId: id, ...(reportTarget === AGENCY_TARGET ? {} : { reportedUserId: reportTarget }), reason, details, clientRequestId }, ctx);
    }
    finally {
        ctx.release();
    } }}/></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.paper},flex:{flex:1},shell:{flex:1,width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center'},padding:{paddingHorizontal:16},loading:{padding:36},
 header:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingTop:8,paddingBottom:4},
 avatar:{backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'},avatarText:{...typography.cardTitle,color:colors.primary},
 titleBox:{flex:1,minWidth:0},title:{...typography.body,fontWeight:'600',color:colors.ink},contextLink:{minHeight:26,justifyContent:'center'},subtitle:{...typography.label,fontWeight:'400',color:colors.primary},
 privacy:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:6,paddingHorizontal:16},privacyText:{...typography.caption,color:colors.muted,flexShrink:1,textAlign:'center'},
 team:{marginHorizontal:16,marginBottom:6,minHeight:44,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10,borderRadius:rounded.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
 teamText:{...typography.label,fontWeight:'400',flex:1,color:colors.body},
 messages:{paddingHorizontal:16,paddingVertical:12,flexGrow:1},older:{alignSelf:'center',marginBottom:12},
 empty:{...typography.bodySm,color:colors.muted,textAlign:'center',paddingVertical:24},
 day:{...typography.caption,fontWeight:'600',color:colors.muted,textAlign:'center',marginTop:14,marginBottom:10},
 proposals:{marginTop:12},hidden:{display:'none'},
 reason:{...typography.bodySm,color:colors.body,textAlign:'center',marginHorizontal:16,marginBottom:12,padding:14,borderRadius:rounded.card,backgroundColor:colors.surface},
 retry:{marginHorizontal:16,marginBottom:8,padding:12,gap:10,borderRadius:rounded.card,backgroundColor:colors.softDanger},retryText:{...typography.label,color:colors.danger},
 composer:{flexDirection:'row',alignItems:'flex-end',gap:6,paddingHorizontal:12,paddingTop:8,paddingBottom:12,backgroundColor:colors.paper},
 plus:{width:48,height:48,marginBottom:2,borderRadius:rounded.pill,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'},
 inputField:{flex:1,minWidth:0},input:{...typography.body,minHeight:52,maxHeight:152,paddingVertical:14,paddingHorizontal:16,backgroundColor:colors.surface,borderRadius:rounded.pill,borderWidth:1,borderColor:colors.border,color:colors.ink},mutedInput:{opacity:0.6},
 send:{width:48,height:48,marginBottom:2,borderRadius:rounded.pill,backgroundColor:colors.primaryFill,alignItems:'center',justifyContent:'center'},sendDisabled:{opacity:0.45},dimmed:{opacity:0.7},
 count:{...typography.caption,color:colors.muted,textAlign:'right',paddingHorizontal:20,paddingBottom:6},
 option:{minHeight:52,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:12,borderRadius:rounded.thumb},optionText:{...typography.body,flex:1,color:colors.ink},
 optionDanger:{marginTop:6,backgroundColor:colors.softDanger},optionDangerText:{color:colors.danger,fontWeight:'600'},
 warning:{width:52,height:52,borderRadius:rounded.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.softDanger},
 sheetTitle:{...typography.sheetTitle,color:colors.ink},sheetText:{...typography.bodySm,color:colors.body},
 // Side by side when both fit; stacked at 320 px so the danger label stays on one line.
 sheetActions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:8},sheetButton:{flexGrow:1,flexBasis:136},
 danger:{flexGrow:1,flexBasis:136,minHeight:56,borderRadius:rounded.pill,backgroundColor:colors.dangerFill,alignItems:'center',justifyContent:'center',paddingHorizontal:16},dangerText:{...typography.body,fontWeight:'600',color:colors.onDark},
}));
