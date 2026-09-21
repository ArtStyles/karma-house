import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatNegotiationValue, negotiationErrorMessage, validateCreateNegotiation } from '../../negotiations/domain';
import type { CreateNegotiationInput, Negotiation } from '../../negotiations/types';
import type { ProposalDraft, ProposalTarget } from '../../negotiations/proposalDraft';
import { colors } from '../../theme';
import { Button, Icon, Notice } from '../ui';
import { VisitDateTimeFields } from './VisitDateTimeFields';

export type { ProposalTarget } from '../../negotiations/proposalDraft';
export function NegotiationComposer({ target, draft, updateDraft, disabled, disabledReason, onCreate, onRefresh, onBack, onConfirmed }: {
  draft:ProposalDraft; updateDraft(patch:Partial<ProposalDraft>):void;
  target:ProposalTarget; disabled:boolean; disabledReason?:string; onCreate(input:CreateNegotiationInput):Promise<Negotiation>;
  onRefresh():Promise<void>; onBack():void; onConfirmed():void;
}) {
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
  if(confirmed)return <View style={styles.form}><View style={styles.successIcon}><Icon name="checkmark-circle-outline" size={29} color={colors.green}/></View><Text accessibilityRole="header" style={styles.title}>Propuesta enviada</Text><Text style={styles.value}>{formatNegotiationValue(confirmed)}</Text><Text style={styles.copy}>Quedó registrada en esta conversación. La otra persona podrá responder desde KarmaHouse.</Text><Button label="Ver historial" onPress={onConfirmed}/></View>;
  const fieldsDisabled=busy||uncertain||disabled;
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>{target.previous?'Proponer una alternativa':target.kind==='visit'?'Proponer una visita':'Hacer una oferta'}</Text>
    <Text style={styles.copy}>{target.kind==='visit'?'Acuerda un día y una hora para conocer la vivienda.':'Indica el importe que propones para esta vivienda, en dólares estadounidenses.'}</Text>
    {target.previous&&<View style={styles.previous}><Text style={styles.label}>Propuesta anterior</Text><Text style={styles.previousValue}>{formatNegotiationValue(target.previous)}</Text></View>}
    {target.kind==='visit'?<VisitDateTimeFields date={date} time={time} disabled={fieldsDisabled} onDate={setDate} onTime={setTime}/>:<View style={styles.field}><Text style={styles.label}>Importe propuesto en USD</Text><TextInput accessibilityLabel="Importe de la oferta en USD" value={amount} onChangeText={setAmount} editable={!fieldsDisabled} keyboardType="decimal-pad" placeholder="Ej. 60000" placeholderTextColor={colors.muted} maxLength={16} style={styles.input}/><Text style={styles.help}>Puedes usar hasta dos decimales. La propuesta caduca a los siete días.</Text></View>}
    <View style={styles.field}><Text style={styles.label}>Nota opcional</Text><TextInput accessibilityLabel="Nota de la propuesta" value={note} onChangeText={value=>setNote([...value].slice(0,500).join(''))} editable={!fieldsDisabled} multiline placeholder={target.kind==='visit'?'Añade algo que deban tener en cuenta.':'Cuéntale algo más sobre tu propuesta.'} placeholderTextColor={colors.muted} textAlignVertical="top" style={[styles.input,styles.note]}/><Text style={styles.help}>{[...note].length}/500 caracteres</Text></View>
    {target.kind==='offer'&&<Notice>Aceptar una oferta registra una negociación. No realiza pagos, reservas ni cambios en la disponibilidad de la vivienda.</Notice>}
    {disabled&&<Notice>{disabledReason??'Ahora no se pueden enviar nuevas propuestas en esta conversación.'}</Notice>}
    {!!error&&<Notice error>{error}</Notice>}
    {uncertain&&<Text style={styles.help}>No se pudo confirmar el resultado. Reintenta para consultar el mismo envío o actualiza el historial antes de editarlo.</Text>}
    <Button label={uncertain?'Reintentar el mismo envío':'Enviar propuesta'} onPress={submit} loading={busy} disabled={disabled&&!uncertain}/>
    {uncertain&&<><Button label="Actualizar historial" secondary disabled={busy} onPress={()=>void onRefresh()}/><Button label="Editar propuesta" secondary disabled={busy} onPress={()=>updateDraft({attempt:null,error:''})}/></>}
    <Button label="Volver al historial" secondary disabled={busy} onPress={onBack}/>
  </View>;
}
const styles=StyleSheet.create({form:{gap:16},title:{color:colors.ink,fontSize:25,lineHeight:31,fontWeight:'600',letterSpacing:-.6},copy:{color:colors.muted,fontSize:14,lineHeight:21},field:{gap:8},label:{color:colors.ink,fontSize:13,fontWeight:'600'},input:{minHeight:53,borderRadius:16,borderWidth:1,borderColor:'#DDE6F1',backgroundColor:'#F8FAFD',paddingHorizontal:14,paddingVertical:13,color:colors.ink,fontSize:17},note:{minHeight:90,fontSize:14,lineHeight:21},help:{color:colors.muted,fontSize:12,lineHeight:19},previous:{padding:15,borderRadius:17,backgroundColor:colors.softBlue,gap:7},previousValue:{color:colors.primary,fontSize:17,lineHeight:24,fontWeight:'500'},successIcon:{backgroundColor:'#EBF7F0',width:55,height:55,borderRadius:19,alignItems:'center',justifyContent:'center'},value:{fontSize:23,lineHeight:30,fontWeight:'600',color:colors.ink}});
