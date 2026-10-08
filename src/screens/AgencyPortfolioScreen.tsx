import {AgencyShareButton} from '../components/agencies/AgencyShareButton';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {isAgencyReadAccessFailure} from '../agencies/messaging/live';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyPropertyRepository as repository} from '../agencies/properties/client';
import type {AgencyProperty} from '../agencies/properties/types';
import {agencyError} from '../agencies/domain';
import {Button,Notice,PageTitle} from '../components/ui';
import {useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
export default function AgencyPortfolioScreen(){const a=useAuth(),w=useAgencyWorkspace();return <Portfolio key={`${a.user?.id}:${w.activeAgencyId}:${w.generation}:${a.suspended}:${Boolean(a.session)}`}/>}
function Portfolio(){
 const w=useAgencyWorkspace(),auth=useAuth(),{styles:s,colors}=useAgencyFormStyles();
 const [items,setItems]=useState<AgencyProperty[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const focused=useRef(false),sequence=useRef(0),itemsRef=useRef(items);itemsRef.current=items;
 const allowed=w.ready&&!!w.activeAgency&&Boolean(w.membership&&auth.session&&!auth.suspended);
 const load=useCallback(async(append=false)=>{
  if(!repository||!allowed)return;const seq=++sequence.current;let c:ReturnType<typeof w.captureAgencyReadContext>|undefined;
  const checkpoint=()=>{c?.checkpoint();if(!focused.current||sequence.current!==seq)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');
  try{c=w.captureAgencyReadContext();const page=await repository.list(append?itemsRef.current.length:0,c);checkpoint();setItems(old=>append?[...old,...page.items]:page.items);setMore(page.hasMore)}
  catch(e){try{checkpoint();if(!c||isAgencyReadAccessFailure(e)){setItems([]);setMore(false);}setIssue(agencyError(e))}catch{}}
  finally{try{checkpoint();setBusy(false)}catch{}c?.release()}
 },[allowed,w.captureAgencyReadContext]);
 const reload=useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}:${w.activeAgencyId}:${w.generation}`,()=>load(),busy||!allowed);
 useFocusEffect(useCallback(()=>{focused.current=true;setItems([]);setIssue('');setBusy(false);void load();return()=>{focused.current=false;sequence.current++}},[load]));
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={allowed&&!busy} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle title="Cartera" subtitle={w.activeAgency?.tradeName??'Elige una inmobiliaria para consultar su cartera.'} back fallback="/agency-workspace"/>
 {!allowed?<Notice>Selecciona una inmobiliaria aprobada con una membresía activa para consultar su cartera.</Notice>:<>
 {!w.enabled&&<Notice>Solo lectura: las operaciones empresariales están pausadas.</Notice>}
 {Boolean(issue)&&<Notice error>{issue} Desliza hacia abajo para reintentar.</Notice>}
 {w.enabled&&w.activeAgency?.state==='approved'&&w.membership?.role==='admin'&&<Button label="Añadir vivienda en venta" onPress={()=>router.push('/agency-property/new')}/>}
 {w.membership?.role==='admin'&&<Button label="Autorizaciones y cambios compartidos" secondary onPress={()=>router.push('/agency-property-requests')}/>}
 {!busy&&!items.length&&<Notice>Esta inmobiliaria todavía no tiene viviendas autorizadas.</Notice>}
 {items.map(item=><View key={item.property.id} style={s.card}><Text style={s.title}>{item.property.title}</Text><Text style={s.copy}>{item.property.location} · {item.mandate.reference}</Text><Text style={s.copy}>{item.property.moderationStatus==='draft'?'Borrador':item.property.moderationStatus==='pending'?'En revisión':item.property.moderationStatus==='approved'?'Aprobada':'Rechazada'} · {item.canEditCommon?'Origen de esta inmobiliaria':'Cartera autorizada'}</Text><Button label="Ver interesados y expediente privado" onPress={()=>router.push({pathname:'/agency-deals',params:{propertyId:item.property.id}})}/>{item.property.moderationStatus==='approved'&&item.property.status==='active'&&<AgencyShareButton propertyId={item.property.id} title={item.property.title}/>}<Button label="Abrir vivienda" secondary onPress={()=>router.push({pathname:'/agency-property/[id]',params:{id:item.property.id}})}/></View>)}
 {more&&<Button label="Cargar más viviendas" secondary disabled={busy} onPress={()=>void load(true)}/>}
 </>}</ScrollView></SafeAreaView>;
}
