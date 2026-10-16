import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatNegotiationValue, negotiationErrorMessage, validateCreateNegotiation } from '../../negotiations/domain';
import type { CreateNegotiationInput, Negotiation } from '../../negotiations/types';
import type { ProposalDraft, ProposalTarget } from '../../negotiations/proposalDraft';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Mediopunto } from '../Mediopunto';
import { ActionGroup, Button, Notice } from '../ui';
import { VisitDateTimeFields } from './VisitDateTimeFields';

export type { ProposalTarget } from '../../negotiations/proposalDraft';
export function NegotiationComposer({ target, draft, updateDraft, disabled, disabledReason, onCreate, onRefresh, onBack, onConfirmed }: {
  draft:ProposalDraft; updateDraft(patch:Partial<ProposalDraft>):void;
  target:ProposalTarget; disabled:boolean; disabledReason?:string; onCreate(input:CreateNegotiationInput):Promise<Negotiation>;
  onRefresh():Promise<void>; onBack():void; onConfirmed():void;
}) {
  const { colors, styles } = useStyles();
  const {amount,date,time,note,error,confirmed}=draft;
  const setAmount=(amount:string)=>updateDraft({amount}),setDate=(date:string)=>updateDraft({date}),setTime=(time:string)=>updateDraft({time}),setNote=(note:string)=>updateDraft({note});
  const [busy,setBusy]=useState(false);
  const lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  const uncertain=!!draft.attempt&&!!error;
  async function submit(){
    if(lock.current||disabled&&!uncertain)return;
    lock.current=true;setBusy(true);updateDraft({error:''});
    try{
      // Keep the exact normalized payload after a transport failure: an expired request may still have an accepted receipt.
      const attempt=draft.attempt??validateCreateNegotiation({conversationId:target.conversationId,kind:target.kind,clientRequestId:randomUUID(),note, ...(target.kind==='offer'?{amountUsd:amount}:{visitDate:date,visitTime:time}),...(target.previous?{replacesId:target.previous.id,expectedVersion:target.previous.version}:{})});
      updateDraft({attempt});
      const result=await onCreate(attempt);
      // The actor-scoped parent owns this draft even if the Modal closes after acknowledgement.
      updateDraft({confirmed:result});
    }catch(failure){updateDraft({error:negotiationErrorMessage(failure)});}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  }
  if(confirmed)return <View style={[styles.form,styles.done]}><Mediopunto width={140} ground={colors.sheet}/><Text accessibilityRole="header" style={[styles.title,styles.center]}>Propuesta enviada</Text><Text style={[confirmed.kind==='offer'?styles.amountValue:styles.value,styles.center]}>{formatNegotiationValue(confirmed)}</Text><Text style={[styles.copy,styles.center]}>Quedó registrada en esta conversación. La otra persona podrá responder desde KarmaHouse.</Text><Button label="Ver historial" onPress={onConfirmed} style={styles.stretch}/></View>;
  const fieldsDisabled=busy||uncertain||disabled;
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>{target.previous?'Proponer una alternativa':target.kind==='visit'?'Proponer una visita':'Hacer una oferta'}</Text>
    <Text style={styles.copy}>{target.kind==='visit'?'Acuerda un día y una hora para conocer la vivienda.':'Indica el importe que propones para esta vivienda, en dólares estadounidenses.'}</Text>
    {target.previous&&<View style={styles.previous}><Text style={styles.label}>Propuesta anterior</Text><Text style={styles.previousValue}>{formatNegotiationValue(target.previous)}</Text></View>}
    {target.kind==='visit'?<VisitDateTimeFields date={date} time={time} disabled={fieldsDisabled} onDate={setDate} onTime={setTime}/>:<View style={styles.field}><Text style={[styles.label,styles.center]}>Importe propuesto en USD</Text><View style={styles.amountBox}><Text style={styles.dollar}>$</Text><TextInput accessibilityLabel="Importe de la oferta en USD" value={amount} onChangeText={setAmount} editable={!fieldsDisabled} keyboardType="decimal-pad" inputMode="decimal" placeholder="Ej. 60000" placeholderTextColor={colors.muted} maxLength={16} style={styles.amountInput}/></View><Text style={[styles.help,styles.center]}>Puedes usar hasta dos decimales. La propuesta caduca a los siete días.</Text></View>}
    <View style={styles.field}><Text style={styles.label}>Nota opcional</Text><TextInput accessibilityLabel="Nota de la propuesta" value={note} onChangeText={value=>setNote([...value].slice(0,500).join(''))} editable={!fieldsDisabled} multiline placeholder={target.kind==='visit'?'Añade algo que deban tener en cuenta.':'Cuéntale algo más sobre tu propuesta.'} placeholderTextColor={colors.muted} textAlignVertical="top" style={[styles.input,styles.note]}/><Text style={styles.help}>{[...note].length}/500 caracteres</Text></View>
    {target.kind==='offer'&&<Notice>Aceptar una oferta registra una negociación. No realiza pagos, reservas ni cambios en la disponibilidad de la vivienda.</Notice>}
    {disabled&&<Notice>{disabledReason??'Ahora no se pueden enviar nuevas propuestas en esta conversación.'}</Notice>}
    {!!error&&<Notice error>{error}</Notice>}
    {uncertain&&<Text style={styles.help}>No se pudo confirmar el resultado. Reintenta para consultar el mismo envío o actualiza el historial antes de editarlo.</Text>}
    <ActionGroup direction="vertical"><Button label={uncertain?'Reintentar el mismo envío':'Enviar propuesta'} onPress={submit} loading={busy} disabled={disabled&&!uncertain}/>
    {uncertain&&<ActionGroup><Button label="Actualizar historial" secondary disabled={busy} onPress={()=>void onRefresh()}/><Button label="Editar propuesta" secondary disabled={busy} onPress={()=>updateDraft({attempt:null,error:''})}/></ActionGroup>}
    <Button label="Volver al historial" secondary disabled={busy} onPress={onBack}/></ActionGroup>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({form:{gap:16},done:{alignItems:'center',paddingTop:12},stretch:{alignSelf:'stretch'},center:{textAlign:'center'},
  title:{...typography.displayLong,color:colors.ink},copy:{color:colors.body,fontSize:15,lineHeight:21},field:{gap:8},label:{color:colors.body,fontSize:13,lineHeight:18,fontWeight:'600'},
  input:{minHeight:52,borderRadius:rounded.pill,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,paddingHorizontal:18,paddingVertical:12,color:colors.ink,fontSize:16},
  note:{minHeight:96,borderRadius:rounded.card,fontSize:15,lineHeight:21},help:{color:colors.muted,fontSize:12,lineHeight:17},
  // The offer is the figure of the form: a large Calistoga amount in a framed box.
  amountBox:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:14,paddingHorizontal:18,borderRadius:30,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.accentBorder},
  dollar:{...typography.numeralLg,color:colors.muted},amountInput:{...typography.numeralLg,minWidth:120,maxWidth:240,flexShrink:1,color:colors.ink,paddingVertical:4},
  amountValue:{...typography.numeralLg,color:colors.ink},value:{fontSize:17,lineHeight:22,fontWeight:'600',color:colors.ink},
  previous:{padding:14,borderRadius:rounded.inner,backgroundColor:colors.surface,gap:4},previousValue:{fontSize:16,lineHeight:22,fontWeight:'600',color:colors.ink},
  successHeading:{flexDirection:'row',alignItems:'center',gap:8}}));
