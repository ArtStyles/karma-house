import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import type { Conversation } from '../../messaging/types';
import { useNegotiations } from '../../negotiations/useNegotiations';
import type { Negotiation, NegotiationKind } from '../../negotiations/types';
import { colors } from '../../theme';
import { Button, Icon, Notice } from '../ui';
import { NegotiationCard } from './NegotiationCard';
import { NegotiationComposer, type ProposalTarget } from './NegotiationComposer';
import { NegotiationSheet } from './NegotiationSheet';
import { useNegotiationMutations } from './useNegotiationMutations';
import { useProposalDrafts } from './useProposalDrafts';

/** `entryHidden` hides only the entry card; the sheet stays mounted so open proposals keep their drafts. */
export interface ConversationNegotiationsProps { conversation:Conversation; userId:string; entryHidden?:boolean; onChanged():Promise<void>; onVisibilityChange?(open:boolean):void }
export function ConversationNegotiations(props:ConversationNegotiationsProps){return <ConversationNegotiationsBody key={`${props.userId}:${props.conversation.id}`} {...props}/>}
function ConversationNegotiationsBody({conversation,userId,entryHidden=false,onChanged,onVisibilityChange}:ConversationNegotiationsProps){
  const auth=useAuth();
  const drafts=useProposalDrafts();
  const [open,setOpen]=useState(false),[showComposer,setShowComposer]=useState(false),[target,setTarget]=useState<ProposalTarget|null>(null);
  const visibility=useRef(onVisibilityChange);visibility.current=onVisibilityChange;
  useEffect(()=>()=>visibility.current?.(false),[]);
  const store=useNegotiations({conversationId:conversation.id,enabled:open});
  const mutations=useNegotiationMutations(userId,store,onChanged);
  const authorized=auth.user?.id===userId&&store.userId===userId;
  const canSend=authorized&&conversation.canSend;
  const previous=target?.previous?store.items.find(item=>item.id===target.previous?.id):undefined;
  const staleAlternative=!!target?.previous&&(previous?previous.status!=='pending'||!previous.canAct:store.ready&&!store.loading);
  const reason=conversation.blockedByMe||conversation.blockedByOther?'Hay un bloqueo en esta conversación. Puedes consultar el historial, retirar propuestas propias o cancelar acuerdos.':'El anuncio no está disponible. Puedes consultar el historial, retirar propuestas propias o cancelar acuerdos.';
  function close(){if(store.mutating)return;setOpen(false);visibility.current?.(false)}
  function compose(kind:NegotiationKind,previous?:Negotiation){
    const same=target?.kind===kind&&target.previous?.id===previous?.id;
    if(!same)setTarget({conversationId:conversation.id,kind,previous});
    setShowComposer(true);mutations.clearFeedback();
  }
  const pending=(kind:NegotiationKind)=>store.items.some(item=>item.kind===kind&&item.status==='pending');
  return <>
    {!entryHidden&&<Pressable accessibilityRole="button" accessibilityLabel="Visitas y ofertas" onPress={()=>{Keyboard.dismiss();setOpen(true);visibility.current?.(true)}} style={({pressed})=>[styles.entry,pressed&&{opacity:.7}]}>
      <View style={styles.entryIcon}><Icon name="calendar-outline" color={colors.primary} size={20}/></View><View style={styles.entryCopy}><Text style={styles.entryTitle}>Visitas y ofertas</Text><Text style={styles.entryText}>Acuerda una fecha o un importe.</Text></View><Icon name="chevron-forward" color={colors.primary} size={17}/>
    </Pressable>}
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
const styles=StyleSheet.create({hidden:{display:'none'},entry:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:18,backgroundColor:'#EDF4FC',borderWidth:1,borderColor:'#DEEBF9',marginTop:8,marginHorizontal:16},entryIcon:{width:36,height:36,borderRadius:13,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},entryCopy:{flex:1,minWidth:0,gap:3},entryTitle:{color:colors.ink,fontSize:13,fontWeight:'600'},entryText:{color:'#57708E',fontSize:12,lineHeight:17},intro:{gap:6},property:{color:colors.ink,fontSize:18,lineHeight:24,fontWeight:'600',letterSpacing:-.3},description:{color:colors.muted,fontSize:13,lineHeight:20},newActions:{flexDirection:'row',flexWrap:'wrap',gap:9},newAction:{flexGrow:1,flexBasis:155},hint:{fontSize:12,lineHeight:18,color:colors.muted},listHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:15,marginTop:8},sectionTitle:{fontSize:17,fontWeight:'600',color:colors.ink},link:{fontSize:13,color:colors.primary,paddingVertical:9},loading:{padding:25},empty:{padding:23,borderRadius:23,backgroundColor:colors.white,gap:12,alignItems:'flex-start'},emptyTitle:{fontSize:18,lineHeight:24,fontWeight:'600',color:colors.ink},feedback:{flexDirection:'row',gap:8,alignItems:'center'},feedbackText:{flex:1,color:colors.green,fontSize:13,lineHeight:20}});
