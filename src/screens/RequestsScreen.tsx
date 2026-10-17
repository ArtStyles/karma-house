import { router } from 'expo-router';
import { useState } from 'react';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { Segmented } from '../components/Segmented';
import { NegotiationCard } from '../components/negotiations/NegotiationCard';
import { NegotiationComposer } from '../components/negotiations/NegotiationComposer';
import { NegotiationSheet } from '../components/negotiations/NegotiationSheet';
import { useNegotiationMutations } from '../components/negotiations/useNegotiationMutations';
import { useProposalDrafts } from '../components/negotiations/useProposalDrafts';
import { isSupabaseConfigured } from '../lib/supabase';
import { useMessaging } from '../messaging/MessagingProvider';
import type { Negotiation } from '../negotiations/types';
import { useNegotiations } from '../negotiations/useNegotiations';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

export default function RequestsScreen(){
  const { colors, styles } = useStyles();
  const auth=useAuth();
  return <SafeAreaView edges={['top','left','right','bottom']} style={styles.safe}><View style={styles.shell}>
    <View style={styles.header}><PageTitle compact title="Visitas y ofertas" subtitle="Visitas, ofertas y acuerdos de tus viviendas." back fallback="/profile"/></View>
    {!auth.ready?<ActivityIndicator color={colors.primary} style={styles.loading}/>:!isSupabaseConfigured?<View style={styles.header}><EmptyState plain title="Visitas y ofertas no disponibles" description="Las visitas y ofertas estarán disponibles con el servicio conectado."/></View>:!auth.user?<View style={styles.header}><AccountPrompt returnTo="/requests" title="Consulta tus visitas y ofertas" description="Inicia sesión para consultar tus visitas y ofertas de compra."/></View>:<RequestsBody key={auth.user.id} userId={auth.user.id}/>}
  </View></SafeAreaView>;
}
function RequestsBody({userId}:{userId:string}){
  const { colors, styles } = useStyles();
  const drafts=useProposalDrafts();
  const [pendingOnly,setPendingOnly]=useState(true),[counter,setCounter]=useState<Negotiation|null>(null),[counterOpen,setCounterOpen]=useState(false);
  const store=useNegotiations({pendingOnly}),messaging=useMessaging();
  const auth=useAuth();
  const reload=useConsultationRefresh(`${userId}:${auth.session?.access_token}:${pendingOnly}`,store.refresh,store.loading||store.loadingMore||store.mutating||counterOpen);
  const mutations=useNegotiationMutations(userId,store,async item=>{await Promise.all([messaging.refresh(),messaging.openConversation(item.conversationId)])});
  const selected=counter?store.items.find(item=>item.id===counter.id):null;
  const target=counter?{conversationId:counter.conversationId,kind:counter.kind,previous:counter}:null;
  return <>
    <View style={styles.tabs}><Segmented<'pending' | 'all'> label="Filtro de solicitudes" value={pendingOnly ? 'pending' : 'all'} disabled={store.mutating} onChange={value=>{setPendingOnly(value==='pending');mutations.clearFeedback()}}
      options={[{ value: 'pending', label: 'Pendientes' }, { value: 'all', label: 'Todas' }]}/></View>
    <FlatList data={store.items} keyExtractor={item=>item.id} alwaysBounceVertical contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!store.mutating&&!counterOpen} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={styles.listHeader}><RequestsNavigation />{!!(store.error||mutations.issue)&&<View style={styles.message}><Notice error onRetry={()=>void reload.refresh()}>{mutations.issue||store.error}</Notice></View>}{!!mutations.feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{mutations.feedback}</Text>}<Text accessibilityRole="header" style={styles.sectionTitle}>{pendingOnly ? 'Propuestas pendientes' : 'Historial de solicitudes'}</Text></View>}
      renderItem={({item})=><NegotiationCard item={item} userId={userId} busy={store.mutating||reload.refreshing} managementChanged={messaging.conversations.find(c=>c.id===item.conversationId)?.managementChanged} onRespond={(value,action)=>{if(!reload.isRefreshing())void mutations.respond(value,action);}} onCounter={item=>{setCounter(item);setCounterOpen(true)}} onOpenConversation={()=>router.push(`/messages/${item.conversationId}`)}/>}
      ListEmptyComponent={!store.ready?<ActivityIndicator color={colors.primary} style={styles.loading}/>:!store.error?<EmptyState plain title={pendingOnly?'Sin propuestas pendientes':'Sin solicitudes'} description={pendingOnly?'En Todas puedes consultar visitas confirmadas y el historial.':'Abre una conversación para proponer una visita o hacer una oferta por una vivienda.'} action={<Button label={pendingOnly?'Ver todas las solicitudes':'Ir a mensajes'} secondary onPress={()=>pendingOnly?setPendingOnly(false):router.push('/messages')}/>}/>:null}
      ListFooterComponent={<View style={styles.footer}>{store.hasMore&&<Button label="Cargar más solicitudes" secondary loading={store.loadingMore} disabled={store.mutating} onPress={()=>void store.loadMore()}/>}<Text style={styles.hint}>Las visitas se muestran en hora de Cuba. Aceptar una oferta registra la negociación, sin pago ni reserva.</Text></View>}
    />
    <NegotiationSheet visible={counterOpen} title="Proponer una alternativa" busy={store.mutating} onClose={()=>{if(!store.mutating)setCounterOpen(false)}}>{counter&&target&&<NegotiationComposer key={`${counter.id}:${counter.version}`} target={target} draft={drafts.get(target)} updateDraft={patch=>drafts.update(target,patch)} disabled={!selected?.canAct||selected.status!=='pending'} disabledReason="La propuesta anterior cambió o no admite una alternativa ahora. Vuelve a la lista para consultar su estado." onCreate={mutations.create} onRefresh={store.refresh} onBack={()=>setCounterOpen(false)} onConfirmed={()=>{drafts.discard(target);setCounter(null);setCounterOpen(false)}}/>}</NegotiationSheet>
  </>;
}
function RequestsNavigation() {
  const auth = useAuth();
  const { colors, styles } = useStyles();
  if (!auth.session || auth.suspended) return null;
  const links = [
    { label: 'Cierres de mis viviendas', open: () => router.push({ pathname: '/agency-closures', params: { personal: '1' } }) },
    { label: 'Autorizaciones de mis viviendas', open: () => router.push({ pathname: '/agency-property-requests', params: { personal: '1' } }) },
    ...(auth.isOwner ? [{ label: 'Revisar viviendas duplicadas', open: () => router.push('/agency-duplicate-reviews') }] : []),
  ];
  return <View style={styles.navigation}><Text accessibilityRole="header" style={styles.sectionTitle}>Gestión de mis viviendas</Text><View style={styles.navigationRows}>{links.map(link => <Pressable key={link.label} accessibilityRole="button" onPress={link.open} style={({ pressed }) => [styles.navigationRow, pressed && { opacity: .7 }]}><Text style={styles.navigationLabel}>{link.label}</Text><Icon name="chevron-forward" size={18} color={colors.muted} /></Pressable>)}</View></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},shell:{flex:1,width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center'},header:{paddingHorizontal:16},loading:{padding:40},tabs:{paddingHorizontal:16,paddingBottom:14,maxWidth:420},list:{paddingHorizontal:16,paddingBottom:28,gap:12,flexGrow:1},listHeader:{gap:16},sectionTitle:{...typography.section,color:colors.ink,paddingHorizontal:4},navigation:{gap:10},navigationRows:{borderWidth:1,borderColor:colors.border,borderRadius:rounded.card,paddingHorizontal:16,backgroundColor:colors.surface},navigationRow:{minHeight:52,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},navigationLabel:{flex:1,minWidth:0,fontSize:15,lineHeight:22,color:colors.ink},message:{gap:12},feedback:{fontSize:14,lineHeight:21,color:colors.green},footer:{gap:16,paddingTop:8},hint:{fontSize:12,lineHeight:18,color:colors.muted,paddingHorizontal:4}}));
