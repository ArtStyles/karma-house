import { StyleSheet, Text, View } from 'react-native';
import { availableNegotiationActions, formatNegotiationValue } from '../../negotiations/domain';
import type { Negotiation, NegotiationAction } from '../../negotiations/types';
import { colors } from '../../theme';
import { Button, Icon } from '../ui';

const statusLabels:Record<Negotiation['status'],string>={pending:'Pendiente',accepted:'Aceptada',declined:'Rechazada',cancelled:'Cancelada',superseded:'Con alternativa',expired:'Vencida'};
export function NegotiationCard({ item, userId, busy = false, onRespond, onCounter, onOpenConversation }: {
  item:Negotiation; userId:string; busy?:boolean;
  onRespond(item:Negotiation,action:NegotiationAction):void; onCounter(item:Negotiation):void; onOpenConversation?:()=>void;
}) {
  const actions=availableNegotiationActions(item,userId);
  const own=item.createdBy===userId;
  const active=item.status==='pending'||item.status==='accepted';
  return <View style={styles.card}>
    <View style={styles.heading}><View style={styles.icon}><Icon name={item.kind==='visit'?'calendar-outline':'pricetag-outline'} size={22} color={colors.primary}/></View><View style={styles.headingCopy}><Text style={styles.kind}>{item.kind==='visit'?'Visita a la vivienda':'Oferta de compra'}</Text><Text style={styles.author}>{item.parentId?'Alternativa · ':''}{own?'Propuesta por ti':'Propuesta recibida'}</Text></View><View style={[styles.badge,item.status==='accepted'&&styles.accepted]}><Text style={[styles.status,item.status==='accepted'&&styles.acceptedText]}>{statusLabels[item.status]}</Text></View></View>
    <Text style={styles.value}>{formatNegotiationValue(item)}</Text>
    {onOpenConversation&&<Text style={styles.property}>{item.propertyTitle} · {item.propertyLocation}</Text>}
    {!!item.note&&<Text style={styles.note}>{item.note}</Text>}
    {item.status==='pending'&&<Text style={styles.meta}>{own?'Esperando la respuesta de la otra persona.':'Puedes responder a esta propuesta.'}{item.kind==='offer'?' Caduca a los siete días.':''}</Text>}
    {!item.canAct&&active&&<Text style={styles.unavailable}>Las nuevas propuestas y respuestas están pausadas. Puedes retirar o cancelar tus compromisos.</Text>}
    <View style={styles.actions}>
      {actions.accept&&<Button label="Aceptar propuesta" disabled={busy} onPress={()=>onRespond(item,'accept')} style={styles.action}/>}
      {actions.decline&&<Button label="Rechazar" secondary disabled={busy} onPress={()=>onRespond(item,'decline')} style={styles.action}/>}
      {actions.counter&&<Button label={item.kind==='visit'?'Proponer otra fecha':'Proponer otro importe'} secondary disabled={busy} onPress={()=>onCounter(item)} style={styles.fullAction}/>}
      {actions.cancel&&<Button label={item.status==='pending'?'Retirar propuesta':item.kind==='visit'?'Cancelar visita':'Cancelar oferta'} secondary disabled={busy} onPress={()=>onRespond(item,'cancel')} style={styles.fullAction}/>}
    </View>
    {onOpenConversation&&<Button label="Abrir conversación" secondary onPress={onOpenConversation} disabled={busy}/>}
  </View>;
}
const styles=StyleSheet.create({
  card:{backgroundColor:colors.white,borderWidth:1,borderColor:'#E1EAF5',borderRadius:23,padding:17,gap:12},heading:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap'},icon:{width:40,height:40,borderRadius:14,backgroundColor:colors.softBlue,alignItems:'center',justifyContent:'center'},headingCopy:{flexGrow:1,flexBasis:125,gap:3},kind:{fontSize:14,fontWeight:'600',color:colors.ink},author:{fontSize:11,lineHeight:16,color:colors.muted},badge:{borderRadius:11,paddingHorizontal:9,paddingVertical:5,backgroundColor:'#EDF2F9'},status:{fontSize:10,fontWeight:'600',color:'#4D6585'},accepted:{backgroundColor:'#E7F4ED'},acceptedText:{color:'#267249'},value:{fontSize:22,lineHeight:29,fontWeight:'600',letterSpacing:-.5,color:colors.ink},property:{fontSize:13,lineHeight:19,color:colors.primary},note:{fontSize:14,lineHeight:21,color:colors.ink},meta:{fontSize:12,lineHeight:18,color:colors.muted},unavailable:{fontSize:12,lineHeight:19,color:'#775F3C'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},action:{flexGrow:1,flexBasis:110,minHeight:44,paddingHorizontal:12,paddingVertical:11},fullAction:{width:'100%',minHeight:44,paddingVertical:11},
});
