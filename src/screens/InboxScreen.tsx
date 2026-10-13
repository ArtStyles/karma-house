import { router,useFocusEffect } from 'expo-router';
import { useCallback,useEffect,useMemo, useRef, useState, type RefObject } from 'react';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle,Pill } from '../components/ui';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {agencyError} from '../agencies/domain';
import {createAgencyMessagingRepository} from '../agencies/messaging/repository';
import type {AgencyConversation} from '../agencies/messaging/types';
import {supabase} from '../lib/supabase';
import {startAgencyPoll,isAgencyReadAccessFailure} from '../agencies/messaging/live';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { useMessaging } from '../messaging/MessagingProvider';
import type { Conversation } from '../messaging/types';
import { createThemedStyles, internalLayout } from '../theme';

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

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <View style={styles.shell}>
      <View style={styles.header}><PageTitle compact title="Mensajes" subtitle="Conversaciones sobre tus viviendas." back /></View>
      {authorized && <Pressable accessibilityRole="button" accessibilityLabel="Ver visitas y ofertas" onPress={() => router.push('/requests')} style={({ pressed }) => [styles.requests, pressed && styles.pressed]}>
        <View style={styles.requestIcon}><Icon name="calendar-outline" color={colors.primary} size={23} /></View>
        <View style={styles.copy}><Text style={styles.requestTitle}>Visitas y ofertas</Text><Text style={styles.requestSubtitle}>Tus solicitudes y próximos pasos</Text></View>
        <Icon name="chevron-forward" size={17} color={colors.primary} />
      </Pressable>}
      {!auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !messaging.available ? <View style={styles.header}><EmptyState plain title="Mensajes no disponibles" description="Los mensajes estarán disponibles con el servicio conectado. La demostración no envía mensajes." /></View> : !auth.user ? <View style={styles.header}><AccountPrompt returnTo="/messages" title="Consulta tus mensajes" description="Inicia sesión para hablar con propietarios y compradores sin publicar tu teléfono." /></View> : !authorized || (!messaging.ready && !messaging.error) ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <>
        {messaging.error && <View style={styles.sync}><Notice error>{messaging.error} Desliza hacia abajo para reintentar.</Notice></View>}
        <FlatList data={messaging.conversations} keyExtractor={item => item.id} alwaysBounceVertical contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={reload.refreshing} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
          renderItem={({ item }) => <ConversationCard conversation={item} />}
          ListHeaderComponent={<AgencyInbox refreshRef={agencyRefresh}/>}
          ListEmptyComponent={messaging.ready && !messaging.error ? <EmptyState plain title="Sin conversaciones personales" description="Abre una vivienda y toca Contactar para iniciar una conversación." action={<Button label="Explorar viviendas" onPress={() => router.replace('/')} />} /> : null}
          ListFooterComponent={messaging.conversations.length ? <Text style={styles.footer}>Se actualiza mientras KarmaHouse está abierta.</Text> : null}
        />
      </>}
    </View>
  </SafeAreaView>;
}

function AgencyInbox({refreshRef}:{refreshRef:RefObject<() => Promise<unknown>>}){
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
 if(!auth.user)return null;
 return <View style={s.agencyGroup}><Text accessibilityRole="header" style={s.sectionTitle}>Con inmobiliarias</Text><View style={s.agencyFilters}><Pill label="Como comprador" active={!staff} onPress={()=>setStaff(false)}/>{w.activeAgencyId&&<Pill label="Equipo de mi agencia" active={staff} onPress={()=>setStaff(true)}/>}</View>
  {visible?.error&&<Notice error>{visible.error}</Notice>}{visible?.items.map(c=><Pressable key={c.id} accessibilityRole="button" style={s.card} onPress={()=>router.push({pathname:'/agency-conversation/[id]',params:{id:c.id,...(staff?{agencyId:c.agencyId}:{})}})}><View style={s.copy}><Text style={s.name}>{c.agencyName}</Text><Text style={s.property}>{c.propertyTitle}</Text><Text style={s.preview}>{c.unreadCount} sin leer · {c.closedReason?'Expediente cerrado':c.assigneeId?'Con responsable':'Cola de la agencia'}</Text></View></Pressable>)}
  {visible?.hasMore&&<Button label="Más conversaciones de agencia" secondary onPress={()=>void load(true)}/>}<Text accessibilityRole="header" style={s.sectionTitle}>Personales</Text>
 </View>;
}
function ConversationCard({ conversation: item }: { conversation: Conversation }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.otherName}. ${item.propertyTitle}. ${item.unreadCount ? `${item.unreadCount} mensajes sin leer` : 'Sin mensajes nuevos'}`} onPress={() => router.push(`/messages/${item.id}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon name="home-outline" size={23} color={colors.primary} /></View>
    <View style={styles.copy}>
      <View style={styles.line}><Text numberOfLines={1} style={[styles.name, item.unreadCount > 0 && styles.unreadName]}>{item.otherName}</Text><Text style={styles.date}>{shortDate(item.lastMessageAt ?? item.createdAt)}</Text></View>
      <Text numberOfLines={2} style={styles.property}>{item.propertyTitle}</Text>
      <View style={styles.line}><Text numberOfLines={2} style={[styles.preview, item.unreadCount > 0 && styles.unreadPreview]}>{item.lastMessage ?? 'Escribe el primer mensaje.'}</Text>{item.unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}</View>
      {(item.blockedByMe || item.blockedByOther) && <Text style={styles.blocked}>Mensajes bloqueados</Text>}
    </View>
  </Pressable>;
}

function shortDate(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, shell: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', flex: 1 }, header: { paddingHorizontal: internalLayout.gutter },
  loading: { padding: 40 }, sync: { paddingHorizontal: 20, paddingBottom: 16 }, list: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  card: { minHeight: 88, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', gap: 12 }, pressed: { opacity: 0.7 },
  icon: { width: 32, height: 44, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 6 }, line: { flexDirection: 'row', alignItems: 'center', gap: 12 }, name: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '500' }, unreadName: { fontWeight: '700' },
  date: { fontSize: 12, lineHeight: 18, color: colors.muted }, property: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  preview: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 }, unreadPreview: { color: colors.ink },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryFill, borderRadius: 11 }, badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  blocked: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, footer: { color: colors.muted, fontSize: 12, lineHeight: 19, paddingVertical: 20 },
  agencyGroup: { gap: 16, paddingBottom: 8 }, agencyFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, sectionTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600', paddingTop: 8 },
  requests: { marginHorizontal: 20, marginBottom: 20, padding: 16, borderRadius: internalLayout.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIcon: { width: 28, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  requestTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, requestSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
}));
