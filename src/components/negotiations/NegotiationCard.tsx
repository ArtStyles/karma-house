import { StyleSheet, Text, View } from 'react-native';
import { availableNegotiationActions, formatNegotiationValue } from '../../negotiations/domain';
import type { Negotiation, NegotiationAction } from '../../negotiations/types';
import { createThemedStyles, rounded, typography } from '../../theme';
import { StateChip, type StateTone } from '../StateChip';
import { ActionGroup, Button, Icon } from '../ui';

const statusLabels:Record<Negotiation['status'],string>={pending:'Pendiente',accepted:'Aceptada',declined:'Rechazada',cancelled:'Cancelada',superseded:'Con alternativa',expired:'Vencida'};
const statusTones:Record<Negotiation['status'],StateTone>={pending:'waiting',accepted:'done',declined:'danger',cancelled:'neutral',superseded:'neutral',expired:'neutral'};
export function NegotiationCard({ item, userId, busy = false, managementChanged=false, onRespond, onCounter, onOpenConversation }: {
  item:Negotiation; userId:string; busy?:boolean;managementChanged?:boolean;
  onRespond(item:Negotiation,action:NegotiationAction):void; onCounter(item:Negotiation):void; onOpenConversation?:()=>void;
}) {
  const { colors, styles } = useStyles();
  const actions=availableNegotiationActions(item,userId);
  const own=item.createdBy===userId;
  const active=item.status==='pending'||item.status==='accepted';
  return <View style={styles.card}>
    <View style={styles.heading}><View style={[styles.icon,item.kind==='offer'&&styles.offerIcon]}><Icon name={item.kind==='visit'?'calendar-outline':'pricetag-outline'} size={20} color={item.kind==='offer'?colors.amber:colors.primary}/></View><View style={styles.headingCopy}><Text style={styles.kind}>{item.kind==='visit'?'Visita a la vivienda':'Oferta de compra'}</Text><Text style={styles.author}>{item.parentId?'Alternativa · ':''}{own?'Propuesta por ti':'Propuesta recibida'}</Text></View><StateChip tone={statusTones[item.status]} label={statusLabels[item.status]}/></View>
    <Text style={item.kind==='offer'?styles.amount:styles.value}>{formatNegotiationValue(item)}</Text>
    {onOpenConversation&&<View style={styles.detail}><Text style={styles.label}>Vivienda</Text><Text style={styles.property}>{item.propertyTitle} · {item.propertyLocation}</Text></View>}
    {!!item.note&&<View style={styles.detail}><Text style={styles.label}>Nota de la propuesta</Text><Text style={styles.note}>{item.note}</Text></View>}
    {managementChanged&&<Text style={styles.unavailable}>Este acuerdo pertenece a la conversación anterior. El gestor nuevo no recibe su historial ni participa en él.</Text>}
    {item.status==='pending'&&<Text style={styles.meta}>{own?'Esperando la respuesta de la otra persona.':'Puedes responder a esta propuesta.'}{item.kind==='offer'?' Caduca a los siete días.':''}</Text>}
    {!item.canAct&&active&&<Text style={styles.unavailable}>Las nuevas propuestas y respuestas están pausadas. Puedes retirar o cancelar tus compromisos.</Text>}
    {(actions.accept||actions.decline)&&<ActionGroup>
      {actions.accept&&<Button label="Aceptar propuesta" disabled={busy} onPress={()=>onRespond(item,'accept')} style={styles.action}/>}
      {actions.decline&&<Button label="Rechazar" secondary disabled={busy} onPress={()=>onRespond(item,'decline')} style={styles.action}/>}
    </ActionGroup>}
    {(actions.counter||actions.cancel)&&<ActionGroup direction="vertical">
      {actions.counter&&<Button label={item.kind==='visit'?'Proponer otra fecha':'Proponer otro importe'} secondary disabled={busy} onPress={()=>onCounter(item)}/>}
      {actions.cancel&&<Button label={item.status==='pending'?'Retirar propuesta':item.kind==='visit'?'Cancelar visita':'Cancelar oferta'} secondary disabled={busy} onPress={()=>onRespond(item,'cancel')}/>}
    </ActionGroup>}
    {onOpenConversation&&<View style={styles.conversation}><Button label="Abrir conversación" secondary onPress={onOpenConversation} disabled={busy}/></View>}
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  card:{backgroundColor:colors.surface,borderRadius:rounded.cardLg,padding:16,gap:14},heading:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},
  icon:{width:44,height:44,borderRadius:rounded.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.softBlue},offerIcon:{backgroundColor:colors.softAmber},
  headingCopy:{flexGrow:1,flexBasis:125,minWidth:0,gap:2},kind:{fontSize:15,lineHeight:20,fontWeight:'600',color:colors.ink},author:{fontSize:12,lineHeight:16,color:colors.muted},
  // An offer reads as a figure; a visit as a date.
  amount:{...typography.numeral,color:colors.ink},value:{fontSize:16,lineHeight:22,fontWeight:'600',color:colors.ink},
  detail:{gap:4},label:{fontSize:12,lineHeight:16,fontWeight:'600',color:colors.muted},property:{fontSize:14,lineHeight:20,color:colors.ink},note:{fontSize:14,lineHeight:20,color:colors.body},
  meta:{fontSize:13,lineHeight:18,color:colors.muted},unavailable:{fontSize:13,lineHeight:18,color:colors.amber},action:{minHeight:48,paddingHorizontal:12,paddingVertical:10},conversation:{paddingTop:4},
}));
