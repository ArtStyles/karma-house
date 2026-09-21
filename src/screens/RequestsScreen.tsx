import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Notice, PageTitle, Pill } from '../components/ui';
import { NegotiationCard } from '../components/negotiations/NegotiationCard';
import { NegotiationComposer } from '../components/negotiations/NegotiationComposer';
import { NegotiationSheet } from '../components/negotiations/NegotiationSheet';
import { useNegotiationMutations } from '../components/negotiations/useNegotiationMutations';
import { useProposalDrafts } from '../components/negotiations/useProposalDrafts';
import { isSupabaseConfigured } from '../lib/supabase';
import { useMessaging } from '../messaging/MessagingProvider';
import type { Negotiation } from '../negotiations/types';
import { useNegotiations } from '../negotiations/useNegotiations';
import { colors } from '../theme';

export default function RequestsScreen(){
  const auth=useAuth();
  return <SafeAreaView edges={['top','left','right','bottom']} style={styles.safe}><View style={styles.shell}>
    <View style={styles.header}><PageTitle title="Solicitudes" subtitle="Tus visitas y ofertas, en un lugar." back/></View>
    {!auth.ready?<ActivityIndicator color={colors.primary} style={styles.loading}/>:!isSupabaseConfigured?<View style={styles.header}><EmptyState icon="calendar-outline" title="Tu próximo paso, organizado" description="Las visitas y ofertas estarán disponibles cuando conectes una cuenta."/></View>:!auth.user?<View style={styles.header}><AccountPrompt returnTo="/requests" title="Organiza tu próximo paso" description="Inicia sesión para consultar tus visitas y ofertas de compra."/></View>:<RequestsBody key={auth.user.id} userId={auth.user.id}/>}
  </View></SafeAreaView>;
}
function RequestsBody({userId}:{userId:string}){
  const drafts=useProposalDrafts();
  const [pendingOnly,setPendingOnly]=useState(true),[counter,setCounter]=useState<Negotiation|null>(null),[counterOpen,setCounterOpen]=useState(false);
  const store=useNegotiations({pendingOnly}),messaging=useMessaging();
  const mutations=useNegotiationMutations(userId,store,async item=>{await Promise.all([messaging.refresh(),messaging.openConversation(item.conversationId)])});
  const selected=counter?store.items.find(item=>item.id===counter.id):null;
  const target=counter?{conversationId:counter.conversationId,kind:counter.kind,previous:counter}:null;
  return <>
    <View style={styles.tabs}><Pill label="Pendientes" active={pendingOnly} onPress={()=>{if(!store.mutating){setPendingOnly(true);mutations.clearFeedback()}}}/><Pill label="Todas" active={!pendingOnly} onPress={()=>{if(!store.mutating){setPendingOnly(false);mutations.clearFeedback()}}}/></View>
    <FlatList data={store.items} keyExtractor={item=>item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={store.loading&&store.ready} onRefresh={()=>void store.refresh()} tintColor={colors.primary}/>}
      ListHeaderComponent={<>{(store.error||mutations.issue)&&<View style={styles.message}><Notice error>{mutations.issue||store.error}</Notice><Button label="Actualizar solicitudes" secondary onPress={()=>void store.refresh()} disabled={store.mutating} loading={store.loading}/></View>}{!!mutations.feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{mutations.feedback}</Text>}</>}
      renderItem={({item})=><NegotiationCard item={item} userId={userId} busy={store.mutating} onRespond={(value,action)=>void mutations.respond(value,action)} onCounter={item=>{setCounter(item);setCounterOpen(true)}} onOpenConversation={()=>router.push(`/messages/${item.conversationId}`)}/>}
      ListEmptyComponent={!store.ready?<ActivityIndicator color={colors.primary} style={styles.loading}/>:!store.error?<EmptyState icon="calendar-outline" title={pendingOnly?'Todo al día':'Tus acuerdos empiezan conversando'} description={pendingOnly?'No tienes propuestas pendientes. En Todas puedes consultar visitas confirmadas y el historial.':'Abre una conversación para proponer una visita o hacer una oferta por una vivienda.'} action={<Button label={pendingOnly?'Ver todas las solicitudes':'Ir a mensajes'} secondary onPress={()=>pendingOnly?setPendingOnly(false):router.push('/messages')}/>}/>:null}
      ListFooterComponent={<View style={styles.footer}>{store.hasMore&&<Button label="Cargar más solicitudes" secondary loading={store.loadingMore} disabled={store.mutating} onPress={()=>void store.loadMore()}/>}<Text style={styles.hint}>Las visitas se muestran en hora de Cuba. Aceptar una oferta registra la negociación, sin pago ni reserva.</Text></View>}
    />
    <NegotiationSheet visible={counterOpen} title="Proponer una alternativa" busy={store.mutating} onClose={()=>{if(!store.mutating)setCounterOpen(false)}}>{counter&&target&&<NegotiationComposer key={`${counter.id}:${counter.version}`} target={target} draft={drafts.get(target)} updateDraft={patch=>drafts.update(target,patch)} disabled={!selected?.canAct||selected.status!=='pending'} disabledReason="La propuesta anterior cambió o no admite una alternativa ahora. Vuelve a la lista para consultar su estado." onCreate={mutations.create} onRefresh={store.refresh} onBack={()=>setCounterOpen(false)} onConfirmed={()=>{drafts.discard(target);setCounter(null);setCounterOpen(false)}}/>}</NegotiationSheet>
  </>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},shell:{flex:1,width:'100%',maxWidth:780,alignSelf:'center'},header:{paddingHorizontal:20},loading:{padding:40},tabs:{flexDirection:'row',gap:8,paddingHorizontal:20,paddingBottom:16},list:{paddingHorizontal:20,paddingBottom:24,gap:12,flexGrow:1},message:{gap:7,paddingBottom:10},feedback:{fontSize:14,lineHeight:21,color:colors.green,paddingBottom:12},footer:{gap:15,paddingTop:15},hint:{fontSize:12,lineHeight:19,color:colors.muted,textAlign:'center'}});
