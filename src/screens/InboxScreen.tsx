import { router,useFocusEffect } from 'expo-router';
import { useCallback,useEffect,useMemo, useRef, useState, type RefObject } from 'react';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle,Pill } from '../components/ui';
import { ArchImage } from '../components/ArchImage';
import { Mediopunto } from '../components/Mediopunto';
import { Segmented } from '../components/Segmented';
import { ConversationBody } from './ConversationScreen';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {TeamChatRow} from '../components/agencies/TeamChatRow';
import {AgencyMark} from '../components/agencies/AgencyMark';
import {StateChip} from '../components/StateChip';
import {inboxPreview,initials,shortDate} from '../agencies/messaging/presentation';
import {agencyError} from '../agencies/domain';
import {createAgencyMessagingRepository} from '../agencies/messaging/repository';
import type {AgencyConversation} from '../agencies/messaging/types';
import {supabase} from '../lib/supabase';
import {startAgencyPoll,isAgencyReadAccessFailure} from '../agencies/messaging/live';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { useMessaging } from '../messaging/MessagingProvider';
import type { Conversation } from '../messaging/types';
import { createThemedStyles, internalLayout, layout, rounded, typography } from '../theme';

export default function InboxScreen() {
  const { colors, styles } = useStyles();
  const messaging = useMessaging();
  const auth = useAuth();
  const active = useMessagingActivity();
  const latestRefresh = useRef(messaging.refresh);
  latestRefresh.current = messaging.refresh;
  const agencyRefresh = useRef<() => Promise<unknown>>(async () => {});
  const reload = useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}`, async () => {
    await Promise.allSettled([latestRefresh.current(), agencyRefresh.current()]);
  }, !auth.user || messaging.userId !== auth.user.id);
  useEffect(() => {
    if (active && messaging.available && auth.user && messaging.userId === auth.user.id) void latestRefresh.current().catch(() => undefined);
  }, [active, messaging.available, messaging.userId, auth.user?.id]);
  const authorized = !!auth.user && messaging.userId === auth.user.id;
  const [tab, setTab] = useState<'personal' | 'agency'>('personal'), [agencyUnread, setAgencyUnread] = useState(0);
  // From 1024 px the list and the open conversation sit side by side (DESIGN.md §10).
  const wide = useWindowDimensions().width >= layout.wideMinWidth;
  const [selected, setSelected] = useState<string | null>(null);
  const open = (id: string) => { if (wide) setSelected(id); else router.push(`/messages/${id}`); };
  const shown = wide && selected && messaging.conversations.some(item => item.id === selected) ? selected : null;
  const inbox = <>
    {authorized && <Pressable accessibilityRole="button" accessibilityLabel="Ver visitas y ofertas" onPress={() => router.push('/requests')} style={({ pressed }) => [styles.requests, pressed && styles.pressed]}>
      <View style={styles.requestIcon}><Icon name="calendar-outline" color={colors.sol} size={20} /></View>
      <View style={styles.copy}><Text style={styles.requestTitle}>Visitas y ofertas</Text><Text style={styles.requestSubtitle}>Tus solicitudes y próximos pasos</Text></View>
      <Icon name="chevron-forward" size={17} color={colors.body} />
    </Pressable>}
    {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !messaging.available ? <View style={styles.header}><EmptyState title="Mensajes no disponibles" description="Los mensajes estarán disponibles con el servicio conectado. La demostración no envía mensajes." /></View> : !auth.user ? <View style={styles.header}><AccountPrompt returnTo="/messages" title="Consulta tus mensajes" description="Inicia sesión para hablar con propietarios y compradores sin publicar tu teléfono." /></View> : !authorized || (!messaging.ready && !messaging.error) ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <>
      <View style={styles.tabs}><Segmented<typeof tab> label="Tipo de conversación" value={tab} onChange={setTab} options={[{ value: 'personal', label: messaging.unreadCount ? `Personales · ${messaging.unreadCount}` : 'Personales' }, { value: 'agency', label: agencyUnread ? `Inmobiliarias · ${agencyUnread}` : 'Inmobiliarias' }]} /></View>
      {messaging.error && <View style={styles.sync}><Notice error onRetry={() => void reload.refresh()}>{messaging.error}</Notice></View>}
      <FlatList data={tab === 'personal' ? messaging.conversations : []} keyExtractor={item => item.id} alwaysBounceVertical contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={reload.refreshing} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => <ConversationCard conversation={item} selected={item.id === shown} onOpen={() => open(item.id)} />}
        // Kept mounted on both tabs so the agency inbox keeps its own refresh.
        ListHeaderComponent={<View style={tab === 'agency' ? undefined : styles.hidden}><AgencyInbox refreshRef={agencyRefresh} onUnread={setAgencyUnread}/></View>}
        ListEmptyComponent={tab === 'personal' && messaging.ready && !messaging.error ? <EmptyState title="Sin conversaciones personales" description="Abre una vivienda y toca Contactar para iniciar una conversación." action={<Button label="Explorar viviendas" onPress={() => router.replace('/')} />} /> : null}
        ListFooterComponent={messaging.conversations.length ? <Text style={styles.footer}>Se actualiza mientras KarmaHouse está abierta.</Text> : null}
      />
    </>}
  </>;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    {wide && authorized ? <View style={styles.split}>
      <View style={styles.column}><View style={styles.header}><PageTitle compact title="Mensajes" subtitle="Conversaciones sobre tus viviendas." /></View>{inbox}</View>
      <View style={styles.detail}>{shown && auth.user ? <ConversationBody key={`${auth.user.id}:${shown}`} id={shown} userId={auth.user.id} embedded />
        : <View style={styles.placeholder}><Mediopunto state="off" width={140} /><Text style={styles.placeholderTitle}>Elige una conversación</Text><Text style={styles.placeholderText}>Sus mensajes, visitas y ofertas aparecerán aquí.</Text></View>}</View>
    </View> : <View style={styles.shell}>
      <View style={styles.header}><PageTitle compact title="Mensajes" subtitle="Conversaciones sobre tus viviendas." back /></View>
      {inbox}
    </View>}
  </SafeAreaView>;
}

function AgencyInbox({refreshRef,onUnread}:{refreshRef:RefObject<() => Promise<unknown>>;onUnread(count:number):void}){
 const auth=useAuth(),w=useAgencyWorkspace();const{styles:s}=useStyles();const[staff,setStaff]=useState(false);
 const repo=useMemo(()=>supabase?createAgencyMessagingRepository(supabase):null,[]);
 const scope=`${auth.user?.id}:${auth.session?.access_token}:${staff?w.activeAgencyId:'buyer'}:${staff?w.generation:''}`;
 const current=useRef(scope);current.current=scope;const epoch=useRef(0),loading=useRef(false);
 const[state,setState]=useState<{scope:string;items:AgencyConversation[];hasMore:boolean;error:string}>({scope,items:[],hasMore:false,error:''});
 const visible=state.scope===scope?state:null;
 const active=useMessagingActivity();
 const load=useCallback(async(append=false)=>{if(!repo||!auth.user||loading.current)return;loading.current=true;const version=epoch.current;let ctx:ReturnType<typeof w.captureAccountContext>|undefined;
  try{ctx=staff?w.captureAgencyReadContext():w.captureAccountContext();const offset=append&&state.scope===scope?state.items.length:0;let page=await repo.list(offset,ctx);if(!append&&state.scope===scope){const target=state.items.length;while(page.hasMore&&page.items.length<target){const next=await repo.list(page.items.length,ctx);page={items:[...page.items,...next.items],hasMore:next.hasMore};}}ctx.checkpoint();if(version===epoch.current&&current.current===scope)setState(old=>({scope,items:append?[...(old.scope===scope?old.items:[]),...page.items.filter(x=>!old.items.some(y=>x.id===y.id))]:page.items,hasMore:page.hasMore,error:''}))}
  catch(e){
   try{
    ctx?.checkpoint();
    if(version===epoch.current&&current.current===scope)
     setState(old=>ctx&&!isAgencyReadAccessFailure(e)&&old.scope===scope
      ? {...old,error:agencyError(e)}
      : {scope,items:[],hasMore:false,error:agencyError(e)});
   }catch{/* Obsolete contexts cannot publish data or errors. */}
  }finally{ctx?.release();if(version===epoch.current)loading.current=false}
 },[repo,auth.user?.id,staff,w.captureAccountContext,w.captureAgencyReadContext,scope,state.scope,state.items.length]);
 const latest=useRef(load);latest.current=load;
 refreshRef.current=()=>latest.current();
 useFocusEffect(useCallback(()=>{epoch.current++;loading.current=false;setState({scope,items:[],hasMore:false,error:''});void latest.current();return()=>{epoch.current++;loading.current=false;setState({scope,items:[],hasMore:false,error:''})}},[scope]));
 useEffect(()=>{if(!active||!auth.user||(staff&&!w.activeAgencyId))return;return startAgencyPoll(()=>latest.current());},[active,scope,auth.user?.id,staff,w.activeAgencyId]);
 const tradeName=w.activeAgency?.tradeName??'Mi inmobiliaria';
 const unread=(visible?.items??[]).reduce((sum,c)=>sum+c.unreadCount,0);
 useEffect(()=>{onUnread(unread)},[unread]);
 if(!auth.user)return null;
 return <View style={s.agencyGroup}>{!!w.activeAgencyId&&<View style={s.agencyFilters}><Pill label="Mis consultas" active={!staff} onPress={()=>setStaff(false)}/><Pill label={tradeName} accessibilityLabel={`Equipo de ${tradeName}`} active={staff} onPress={()=>setStaff(true)}/></View>}
  {staff&&<TeamChatRow/>}
  {!!visible?.error&&<Notice error>{visible.error}</Notice>}
  {visible?.items.map(c=>{const title=staff?c.buyerName??'Cliente':c.agencyName,count=c.unreadCount,unseen=count>0;
   return <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${title}. ${c.propertyTitle}. ${unseen?`${count} ${count===1?'mensaje sin leer':'mensajes sin leer'}`:'Sin mensajes nuevos'}`} style={({pressed})=>[s.card,pressed&&s.pressed]} onPress={()=>router.push({pathname:'/agency-conversation/[id]',params:{id:c.id,...(staff?{agencyId:c.agencyId}:{})}})}>
    {staff?<ArchImage width={52} height={60} bottom={14} style={s.tile}><Text style={s.initial}>{initials(title)}</Text></ArchImage>:<AgencyMark agencyId={c.agencyId} name={c.agencyName} width={52} height={60} bottom={14}/>}
    <View style={s.copy}>
     <View style={s.line}><Text numberOfLines={1} style={[s.name,unseen&&s.unreadName]}>{title}</Text>{!!c.lastMessageAt&&<Text style={[s.date,unseen&&s.unreadDate]}>{shortDate(c.lastMessageAt)}</Text>}</View>
     <Text numberOfLines={1} style={s.property}>{c.propertyTitle}</Text>
     <View style={s.line}><Text numberOfLines={1} style={[s.preview,unseen&&s.unreadPreview]}>{inboxPreview(c,staff)}</Text>{unseen&&<View style={s.badge}><Text style={s.badgeText}>{count>99?'99+':count}</Text></View>}</View>
     {staff&&(c.closedReason?<StateChip tone="neutral" label="Expediente cerrado"/>:!c.assigneeId&&<StateChip tone="waiting" label="Sin responsable"/>)}
    </View>
   </Pressable>;})}
  {visible&&!visible.error&&!visible.items.length&&<Text style={s.agencyEmpty}>{staff?'Aún no hay conversaciones con clientes.':'Sin conversaciones con inmobiliarias.'}</Text>}
  {visible?.hasMore&&<Button label="Más conversaciones de inmobiliaria" secondary onPress={()=>void load(true)}/>}
 </View>;
}
function ConversationCard({ conversation: item, selected = false, onOpen }: { conversation: Conversation; selected?: boolean; onOpen(): void }) {
  const { styles } = useStyles();
  const unread = item.unreadCount > 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.otherName}. ${item.propertyTitle}. ${item.unreadCount ? `${item.unreadCount} mensajes sin leer` : 'Sin mensajes nuevos'}`} accessibilityState={{ selected }} onPress={onOpen} style={({ pressed }) => [styles.card, selected && styles.selectedCard, pressed && styles.pressed]}>
    <ArchImage width={52} height={60} bottom={14} style={styles.tile}><Text style={styles.initial}>{initials(item.otherName)}</Text></ArchImage>
    <View style={styles.copy}>
      <View style={styles.line}><Text numberOfLines={1} style={[styles.name, unread && styles.unreadName]}>{item.otherName}</Text><Text style={[styles.date, unread && styles.unreadDate]}>{shortDate(item.lastMessageAt ?? item.createdAt)}</Text></View>
      <Text numberOfLines={1} style={styles.property}>{item.propertyTitle}</Text>
      <View style={styles.line}><Text numberOfLines={1} style={[styles.preview, unread && styles.unreadPreview]}>{item.lastMessage ?? 'Escribe el primer mensaje.'}</Text>{unread && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}</View>
      {(item.blockedByMe || item.blockedByOther) && <Text style={styles.blocked}>Mensajes bloqueados</Text>}
    </View>
  </Pressable>;
}


const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', flex: 1 }, header: { paddingHorizontal: 16 },
  split: { flex: 1, flexDirection: 'row' }, column: { width: 380, borderRightWidth: 1, borderRightColor: colors.border }, detail: { flex: 1, minWidth: 0 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }, placeholderTitle: { ...typography.sheetTitle, color: colors.ink, marginTop: 8 }, placeholderText: { color: colors.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  loading: { padding: 40 }, sync: { paddingHorizontal: 16, paddingBottom: 12 }, list: { paddingHorizontal: 12, paddingBottom: 28, flexGrow: 1 }, tabs: { paddingHorizontal: 16, paddingBottom: 8 }, hidden: { display: 'none' },
  card: { paddingVertical: 10, paddingHorizontal: 6, borderRadius: rounded.card, flexDirection: 'row', alignItems: 'center', gap: 14 }, selectedCard: { backgroundColor: colors.surface }, pressed: { opacity: 0.7 },
  tile: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }, initial: { ...typography.section, color: colors.primary },
  copy: { flex: 1, minWidth: 0, gap: 2 }, line: { flexDirection: 'row', alignItems: 'center', gap: 8 }, name: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 16, lineHeight: 22 }, unreadName: { fontWeight: '700' },
  date: { fontSize: 12, lineHeight: 16, color: colors.muted }, unreadDate: { color: colors.primary, fontWeight: '600' }, property: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  preview: { flex: 1, color: colors.body, fontSize: 14, lineHeight: 20 }, unreadPreview: { color: colors.ink, fontWeight: '600' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryFill, borderRadius: rounded.pill }, badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  blocked: { color: colors.danger, fontSize: 12, lineHeight: 16, marginTop: 2 }, footer: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingVertical: 16, paddingHorizontal: 6 },
  agencyGroup: { gap: 6, paddingBottom: 8 }, agencyEmpty: { ...typography.bodySm, color: colors.body, paddingHorizontal: 6, paddingVertical: 8 }, agencyFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, paddingBottom: 6 },
  requests: { marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: rounded.card, backgroundColor: colors.softAmber, flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIcon: { width: 40, height: 40, borderRadius: rounded.pill, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.softAmber },
  requestTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' }, requestSubtitle: { color: colors.body, fontSize: 13, lineHeight: 18 },
}));
