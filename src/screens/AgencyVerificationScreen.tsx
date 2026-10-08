import {randomUUID} from 'expo-crypto';
import {useFocusEffect} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {useAuth} from '../auth/AuthProvider';
import type {CapturedAgencyContext} from '../agencies/controller';
import {agencyPrivateScreenKey,createAgencyScreenRequestScope} from '../agencies/screenRequests';
import {agencyError} from '../agencies/domain';
import type {AgencyVerificationRequest} from '../agencies/types';
import {agencyVerificationPresentation,canRequestAgencyVerification} from '../agencies/registration';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {Button,EmptyState,Notice,PageTitle} from '../components/ui';
export default function AgencyVerificationScreen(){
 const auth=useAuth(),workspace=useAgencyWorkspace(),{colors,styles:s}=useAgencyFormStyles(),agency=workspace.activeAgency;
 const key=agencyPrivateScreenKey(auth.user?.id,agency?.id,workspace.generation),scope=useRef(createAgencyScreenRequestScope()).current;
 const stateKey=useRef(key),viewCurrent=stateKey.current===key;
 const [record,setRecord]=useState<{key:string;owner:string;agencyId:string;request:AgencyVerificationRequest|null}|null>(null),[message,setMessage]=useState(''),[references,setReferences]=useState(''),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const request=record&&record.key===key&&record.owner===auth.user?.id&&record.agencyId===agency?.id?record.request:null;
 const canRequest=!agency?.isPrincipal&&!auth.suspended&&Boolean(auth.session)&&canRequestAgencyVerification(agency?.state??null,workspace.membership?.state==='active'?workspace.membership.role:null,workspace.enabled);
 const canRead=!auth.suspended&&Boolean(auth.session)&&workspace.membership?.state==='active'&&workspace.membership.role==='admin';
 const presentation=agencyVerificationPresentation(agency?.verified??false,request?.state??null);
 const locked=useRef(false),dirty=useRef(false);
 dirty.current=!!record&&record.key===key&&(message!==(request?.input.message??'')||references!==(request?.input.evidenceReferences.join('\n')??''));
 const load=useCallback(async()=>{
 if(!workspace.repository||!canRead)return;
 const ticket=scope.begin();let context:CapturedAgencyContext|null=null;setLoading(true);setIssue('');
 try{context=workspace.captureAgencyReadContext();const next=await workspace.repository.verificationRequest(context);ticket.checkpoint(context);setRecord({key,owner:context.userId,agencyId:context.agencyId,request:next});setMessage(next?.input.message??'');setReferences(next?.input.evidenceReferences.join('\n')??'');}
 catch(cause){try{ticket.checkpoint(context??undefined);setIssue(agencyError(cause));}catch{}}
 finally{try{ticket.checkpoint(context??undefined);setLoading(false);}catch{}context?.release();}
 },[workspace.repository,workspace.captureAgencyReadContext,canRead,agency?.id,key,scope]);
 const reload=useConsultationRefresh(`${key}:${auth.session?.access_token}`,load,()=>locked.current||dirty.current||loading||!canRead);
 useFocusEffect(useCallback(()=>{scope.enter(key);stateKey.current=key;setRecord(null);setMessage('');setReferences('');setIssue('');setBusy(false);setLoading(false);void load();return()=>scope.leave();},[load,key,scope]));
 async function submit(){
 if(!workspace.repository||locked.current||reload.isRefreshing()||!canRequest||agency?.verified||request?.state==='pending')return;
 const ticket=scope.begin();let context:CapturedAgencyContext|null=null;locked.current=true;setBusy(true);setIssue('');
 try{context=workspace.captureAgencyContext();const correction=request?.state==='needs_changes'?{requestId:request.id,expectedVersion:request.version}:{};
 const next=await workspace.repository.requestVerification({input:{message,evidenceReferences:references?references.split('\n'):[]},...correction,clientRequestId:randomUUID()},context);ticket.checkpoint(context);setRecord({key,owner:context.userId,agencyId:context.agencyId,request:next});await workspace.refreshAgencies();}
 catch(cause){try{ticket.checkpoint(context??undefined);setIssue(agencyError(cause));}catch{}}
 finally{locked.current=false;try{ticket.checkpoint(context??undefined);setBusy(false);}catch{}context?.release();}
 }
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={canRead&&!busy&&!dirty.current} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle title="Verificación de inmobiliaria" subtitle="KarmaHouse revisa y concede el sello empresarial." back fallback="/agency-workspace"/>
 {!agency?<EmptyState title="Selecciona una inmobiliaria" description="Abre Mi inmobiliaria con una agencia aprobada para consultar su verificación."/>:<>
 <View style={s.card}><View style={s.row}><Text style={s.title}>{agency.tradeName}</Text><AgencyVerifiedBadge verified={agency.verified} agencyName={agency.tradeName} principal={agency.isPrincipal} labelled/></View><Text style={s.title}>{presentation.label}</Text><Notice>{presentation.publication}</Notice>{request?.reviewNote&&<Notice>{request.reviewNote}</Notice>}</View>
 {agency.isPrincipal&&<Notice>La identidad y la verificación de la inmobiliaria principal están protegidas por KarmaHouse.</Notice>}
 {!canRead?<Notice>Solo el administrador activo de una inmobiliaria aprobada puede solicitar o corregir su verificación. El sello personal no concede verificación empresarial.</Notice>:<>{viewCurrent&&loading&&!reload.refreshing&&<ActivityIndicator color={colors.primary}/>}</>}
 {viewCurrent&&issue&&<Notice error>{issue}</Notice>}
 {canRequest&&record?.key===key&&!agency.verified&&request?.state!=='pending'&&<View style={s.card}><AgencyTextField label="Explicación para KarmaHouse" multiline maxLength={1000} value={message} onChangeText={setMessage} editable={!busy&&!loading}/><AgencyTextField label="Referencias privadas · una por línea, máximo cinco" multiline maxLength={2504} value={references} onChangeText={setReferences} editable={!busy&&!loading}/><Text style={s.copy}>Estas referencias son privadas. Solo KarmaHouse puede conceder o retirar el sello. Una solicitud no cambia la revisión de tus anuncios.</Text><Button label={request?.state==='needs_changes'?'Enviar correcciones':'Solicitar verificación'} onPress={()=>void submit()} loading={busy} disabled={loading}/></View>}
 </>}
 </ScrollView></SafeAreaView>;
}
