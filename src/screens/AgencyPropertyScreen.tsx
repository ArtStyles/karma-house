import {randomUUID} from 'expo-crypto';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyPropertyRepository as repository} from '../agencies/properties/client';
import type {AgencyProperty} from '../agencies/properties/types';
import {agencyError} from '../agencies/domain';
import {isUuid} from '../messaging/domain';
import ListingForm from '../components/ListingForm';
import {toDraft} from './EditScreen';
import {emptyDraft,type ListingDraft} from '../domain/listings';
import {Button,Notice,PageTitle} from '../components/ui';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {useMarketplace} from '../state/MarketplaceProvider';
export default function AgencyPropertyScreen(){const {id}=useLocalSearchParams<{id:string}>(),a=useAuth(),w=useAgencyWorkspace();return <Property key={`${a.user?.id}:${w.activeAgencyId}:${w.generation}:${a.suspended}:${Boolean(a.session)}:${id}`} id={id}/>}
function Property({id}:{id:string}){
 const w=useAgencyWorkspace(),auth=useAuth(),market=useMarketplace(),{styles:s}=useAgencyFormStyles();
 const [item,setItem]=useState<AgencyProperty|null>(null),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(id==='new');
 const [source,setSource]=useState(''),[consent,setConsent]=useState('');
 const focused=useRef(false),sequence=useRef(0),pending=useRef<{body:string;request:string}|null>(null);
 const allowed=w.ready&&w.enabled&&w.activeAgency?.state==='approved'&&Boolean(auth.session&&!auth.suspended&&w.membership);
 const load=useCallback(async()=>{
  if(!repository||!allowed)return;if(id==='new'){setLoaded(true);return}if(!isUuid(id)){setIssue('No se encontró esta vivienda.');return}
  const seq=++sequence.current;let c:ReturnType<typeof w.captureAgencyContext>|undefined;
  const check=()=>{c?.checkpoint();if(!focused.current||seq!==sequence.current)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');setLoaded(false);
  try{c=w.captureAgencyContext();const result=await repository.get(id,c);check();setItem(result);setSource(result.mandate.reference);setLoaded(true)}
  catch(e){try{check();setItem(null);setIssue(agencyError(e))}catch{}}
  finally{try{check();setBusy(false)}catch{}c?.release()}
 },[allowed,id,w.captureAgencyContext]);
 useFocusEffect(useCallback(()=>{focused.current=true;setItem(null);setSource('');setConsent('');setIssue('');pending.current=null;void load();return()=>{focused.current=false;sequence.current++}},[load]));
 const editable=allowed&&loaded&&(id==='new'?w.membership?.role==='admin':item?.canEditCommon),direct=item?item.publicationPolicy==='direct':w.activeAgency?.verified===true;
 async function save(draft:ListingDraft,intent:'draft'|'submit'){
  if(!repository||!editable||busy)throw Error('La vivienda no está disponible para editar.');
  if(!source.trim()||!consent.trim())throw Error('Completa las referencias de origen y autorización antes de guardar.');
  const body=JSON.stringify({draft,intent,source,consent,version:item?.property.version});
  if(pending.current?.body!==body)pending.current={body,request:randomUUID()};
  const c=w.captureAgencyContext(),seq=sequence.current;
  const check=()=>{c.checkpoint();if(!focused.current||sequence.current!==seq)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);
  try{const result=await repository.save({draft,publicationIntent:intent,sourceReference:source,consentReference:consent,clientRequestId:pending.current.request,...(item?{propertyId:item.property.id,expectedVersion:item.property.version}:{})},c);check();await market.invalidateListingManagement([result.property.id]);check();pending.current=null;router.replace('/agency-portfolio')}
  finally{try{check();setBusy(false)}catch{}c.release()}
 }
 return <SafeAreaView style={[s.safe,{flex:1}]} edges={['top','bottom','left','right']}><View style={[s.content,{paddingBottom:8}]}><PageTitle title={id==='new'?'Añadir vivienda en venta':item?.property.title??'Vivienda'} subtitle={w.activeAgency?.tradeName??'Cartera empresarial'} back fallback="/agency-portfolio"/>
 {issue&&<Notice error>{issue}</Notice>}{!allowed&&<Notice>Selecciona una inmobiliaria aprobada para continuar.</Notice>}
 {item?.moderationHold&&<Notice error>{item.property.reviewNote??'KarmaHouse retiró esta ficha. Corregirla y enviarla de nuevo requiere revisión.'}</Notice>}
 {editable?<><AgencyTextField label="Referencia de origen" value={source} onChangeText={setSource} editable={!busy&&id==='new'}/><AgencyTextField label="Referencia de autorización para publicar" value={consent} onChangeText={setConsent} editable={!busy}/></>:item&&<><Text style={s.copy}>{item.property.description}</Text><Notice>La inmobiliaria de origen conserva la edición de los datos comunes y la confirmación de venta.</Notice></>}
 {!loaded&&allowed&&<Button label="Volver a cargar" secondary loading={busy} onPress={()=>void load()}/>}
 </View>{editable&&<ListingForm key={`${id}:${item?.property.version??0}`} initialDraft={item?toDraft(item.property):{...emptyDraft,operation:'sale'}} cloud directPublication={direct} submitLabel={direct?'Publicar':'Enviar a revisión'} onSubmit={draft=>save(draft,'submit')} onSaveDraft={draft=>save(draft,'draft')} onCancel={()=>router.back()}/>}</SafeAreaView>;
}
