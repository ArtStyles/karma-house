import {useEffect,useState} from 'react';import {Modal,ScrollView,StyleSheet,Text,View} from 'react-native';import {Button,Notice,PageTitle} from '../ui';import {colors} from '../../theme';import type {AssistedListingRow} from '../../assisted/types';
export function TransferOfferSheet({visible,recipientId,recipientName,items,busy,error,onClose,onOffer}:{visible:boolean;recipientId:string;recipientName:string;items:AssistedListingRow[];busy:boolean;error?:string|null;onClose():void;onOffer():void}){
 const [confirmed,setConfirmed]=useState(false);useEffect(()=>{setConfirmed(false);},[visible,recipientId]);
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={s.shade}><View style={s.sheet}><ScrollView contentContainerStyle={s.content}>
 <PageTitle title="Ofrecer gestión" subtitle={`${items.length} de un máximo de 20 anuncios por lote`}/>
 <Text style={s.label}>Cuenta destinataria</Text><Text style={s.title}>{recipientName}</Text><Text selectable style={s.detail}>{recipientId}</Text>
 {items.map(item=><View key={item.id} style={s.row}><Text style={s.title}>{item.title}</Text><Text style={s.detail}>{item.availability==='paused'?'Pausado':'Activo'} · versión {item.version}</Text></View>)}
 <Notice>El destinatario tendrá siete días para aceptar el lote completo. Conserva los enlaces, fotos, favoritos y fechas de publicación. Después de aceptar, podrá editar y atender consultas nuevas.</Notice>
 <Notice>Las conversaciones y los acuerdos anteriores permanecen con sus participantes. No se comparten contactos privados ni pruebas de autorización. Si cambia una ficha o el vínculo, hará falta una solicitud nueva.</Notice>
 {!!error&&<Notice error>{error}</Notice>}
 <Button secondary label={confirmed?'Cuenta confirmada por el canal conocido':'Confirmar que esta es la cuenta vinculada'} onPress={()=>setConfirmed(!confirmed)}/>
 <Button label="Enviar solicitud" disabled={!confirmed||!items.length||items.length>20} loading={busy} onPress={onOffer}/><Button label="Volver" secondary disabled={busy} onPress={onClose}/>
 </ScrollView></View></View></Modal>;
}
const s=StyleSheet.create({shade:{flex:1,backgroundColor:'#0007',justifyContent:'flex-end',alignItems:'center'},sheet:{width:'100%',maxWidth:660,maxHeight:'92%',backgroundColor:colors.paper,borderTopLeftRadius:28,borderTopRightRadius:28},content:{padding:24,gap:16,paddingBottom:36},label:{color:colors.muted,fontSize:13},title:{color:colors.ink,fontSize:16,fontWeight:'600'},detail:{color:colors.muted,fontSize:14,lineHeight:21},row:{padding:14,backgroundColor:colors.white,borderRadius:16,gap:5}});
