import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import type { Conversation } from '../../messaging/types';
import type { useNegotiations } from '../../negotiations/useNegotiations';
import type { Negotiation, NegotiationKind } from '../../negotiations/types';
import { colors } from '../../theme';
import { Button, Icon, Notice } from '../ui';
import { NegotiationCard } from './NegotiationCard';
import { NegotiationComposer, type ProposalTarget } from './NegotiationComposer';
import { NegotiationSheet } from './NegotiationSheet';
import type { useNegotiationMutations } from './useNegotiationMutations';
import { useProposalDrafts } from './useProposalDrafts';

/** Open the sheet on the history, or straight on the form for a kind (and the proposal it answers). */
export type NegotiationSheetRequest = { compose?: { kind: NegotiationKind; previous?: Negotiation } };
/**
 * The chat owns the proposals store and the mutations, because its cards act on the same rows; this sheet
 * is the history and the proposal form. `request` null keeps it closed while drafts stay mounted.
 */
export interface ConversationNegotiationsProps {
  conversation:Conversation; userId:string; store:ReturnType<typeof useNegotiations>; mutations:ReturnType<typeof useNegotiationMutations>;
  request:NegotiationSheetRequest|null; onClose():void;
}
export function ConversationNegotiations(props:ConversationNegotiationsProps){return <ConversationNegotiationsBody key={`${props.userId}:${props.conversation.id}`} {...props}/>}
function ConversationNegotiationsBody({conversation,userId,store,mutations,request,onClose}:ConversationNegotiationsProps){
  const auth=useAuth();
  const drafts=useProposalDrafts();
  const open=request!==null;
  const [showComposer,setShowComposer]=useState(false),[target,setTarget]=useState<ProposalTarget|null>(null);
  // Each opening decides where the sheet starts: a card asking for a counterproposal skips the history.
  useEffect(()=>{if(!request)return;if(request.compose)compose(request.compose.kind,request.compose.previous);else setShowComposer(false)},[request]);
  const authorized=auth.user?.id===userId&&store.userId===userId;
  const canSend=authorized&&conversation.canSend;
  const previous=target?.previous?store.items.find(item=>item.id===target.previous?.id):undefined;
  const staleAlternative=!!target?.previous&&(previous?previous.status!=='pending'||!previous.canAct:store.ready&&!store.loading);
  const reason=conversation.blockedByMe||conversation.blockedByOther?'Hay un bloqueo en esta conversación. Puedes consultar el historial, retirar propuestas propias o cancelar acuerdos.':'El anuncio no está disponible. Puedes consultar el historial, retirar propuestas propias o cancelar acuerdos.';
  function close(){if(store.mutating)return;onClose()}
  function compose(kind:NegotiationKind,previous?:Negotiation){
    const same=target?.kind===kind&&target.previous?.id===previous?.id;
    if(!same)setTarget({conversationId:conversation.id,kind,previous});
    setShowComposer(true);mutations.clearFeedback();
  }
  const pending=(kind:NegotiationKind)=>store.items.some(item=>item.kind===kind&&item.status==='pending');
  return <>
    <NegotiationSheet visible={open} busy={store.mutating} onClose={close}>
      {target&&<View style={!showComposer&&styles.hidden}><NegotiationComposer key={`${target.kind}:${target.previous?.id??'new'}`} target={target} draft={drafts.get(target)} updateDraft={patch=>drafts.update(target,patch)} disabled={!canSend||staleAlternative} disabledReason={staleAlternative?'La propuesta anterior cambió o ya no está en esta lista. Vuelve al historial para elegir una propuesta pendiente.':reason} onCreate={mutations.create} onRefresh={store.refresh} onBack={()=>setShowComposer(false)} onConfirmed={()=>{drafts.discard(target);setTarget(null);setShowComposer(false)}}/></View>}
      {!showComposer&&<>
        <View style={styles.intro}><Text style={styles.property}>{conversation.propertyTitle}</Text><Text style={styles.description}>Las propuestas y sus respuestas quedan juntas en esta conversación.</Text></View>
        {!canSend&&<Notice>{reason}</Notice>}
        <View style={styles.newActions}><Button label="Proponer visita" icon="calendar-outline" disabled={!canSend||store.mutating||pending('visit')} onPress={()=>compose('visit')} style={styles.newAction}/>{conversation.buyerId===userId&&<Button label="Hacer oferta" secondary icon="pricetag-outline" disabled={!canSend||store.mutating||pending('offer')} onPress={()=>compose('offer')} style={styles.newAction}/>}</View>
        {(pending('visit')||pending('offer'))&&<Text style={styles.hint}>Primero responde o retira la propuesta pendiente del mismo tipo.</Text>}
        <View style={styles.listHeading}><Text style={styles.sectionTitle}>Historial</Text><Pressable accessibilityRole="button" accessibilityLabel="Actualizar solicitudes" disabled={store.loading||store.mutating} onPress={()=>void store.refresh()}><Text style={styles.link}>Actualizar</Text></Pressable></View>
        {(store.error||mutations.issue)&&<Notice error>{mutations.issue||store.error}</Notice>}
        {!!mutations.feedback&&<View accessibilityLiveRegion="polite" style={styles.feedback}><Icon name="checkmark-circle-outline" color={colors.green} size={19}/><Text style={styles.feedbackText}>{mutations.feedback}</Text></View>}
        {!store.ready&&store.loading?<ActivityIndicator color={colors.primary} style={styles.loading}/>:!store.items.length&&!store.error?<View style={styles.empty}><Icon name="calendar-clear-outline" color={colors.primary} size={29}/><Text style={styles.emptyTitle}>Dale forma al próximo paso</Text><Text style={styles.description}>Propón una visita o inicia una negociación. Aquí verás cada respuesta.</Text></View>:null}
        {store.items.map(item=><NegotiationCard key={item.id} item={{...item,canAct:item.canAct&&canSend}} userId={userId} busy={store.mutating||!authorized} onRespond={(value,action)=>void mutations.respond(value,action)} onCounter={item=>compose(item.kind,item)}/>)}
        {store.hasMore&&<Button label="Cargar más solicitudes" secondary loading={store.loadingMore} disabled={store.mutating} onPress={()=>void store.loadMore()}/>}
        <Text style={styles.hint}>Aceptar una oferta no realiza pagos ni reserva la vivienda. Las visitas se muestran en hora de Cuba.</Text>
      </>}
    </NegotiationSheet>
  </>;
}
const styles=StyleSheet.create({hidden:{display:'none'},intro:{gap:6},property:{color:colors.ink,fontSize:18,lineHeight:24,fontWeight:'600',letterSpacing:-.3},description:{color:colors.muted,fontSize:13,lineHeight:20},newActions:{flexDirection:'row',flexWrap:'wrap',gap:9},newAction:{flexGrow:1,flexBasis:155},hint:{fontSize:12,lineHeight:18,color:colors.muted},listHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:15,marginTop:8},sectionTitle:{fontSize:17,fontWeight:'600',color:colors.ink},link:{fontSize:13,color:colors.primary,paddingVertical:9},loading:{padding:25},empty:{padding:23,borderRadius:23,backgroundColor:colors.white,gap:12,alignItems:'flex-start'},emptyTitle:{fontSize:18,lineHeight:24,fontWeight:'600',color:colors.ink},feedback:{flexDirection:'row',gap:8,alignItems:'center'},feedbackText:{flex:1,color:colors.green,fontSize:13,lineHeight:20}});
