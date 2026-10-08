import {randomUUID} from 'expo-crypto';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Image,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {pickAccountAvatar,type PreparedAvatar} from '../auth/prepareAvatar';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import type {CapturedAccountContext} from '../agencies/controller';
import type {AgencyApplication} from '../agencies/types';
import {agencyError} from '../agencies/domain';
import {agencyApplicationErrors,agencyStateLabel,emptyAgencyApplication,type AgencyFieldErrors} from '../agencies/registration';
import {attachAgencyLogo,createAgencyAssetsRepository,validateAgencyLogo} from '../agencies/assets';
import {supabase} from '../lib/supabase';
import {createDeadlineFetch} from '../lib/fetchTimeout';
import {AgencyRegistrationFields,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {Button,EmptyState,Notice,PageTitle} from '../components/ui';
import {AccountPrompt} from '../components/AccountPrompt';
export default function AgencyApplicationScreen(){
 const auth=useAuth(),workspace=useAgencyWorkspace(),{colors,styles:s}=useAgencyFormStyles();
 const [record,setRecord]=useState<{owner:string;application:AgencyApplication}|null>(null),[input,setInput]=useState(emptyAgencyApplication),[errors,setErrors]=useState<AgencyFieldErrors>({}),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[logo,setLogo]=useState<PreparedAvatar|null>(null);
 const application=!auth.suspended&&auth.session&&record&&record.owner===auth.user?.id?record.application:null;
 const editable=Boolean(application&&['pending','needs_changes','rejected'].includes(application.agency.state)&&workspace.enabled);
 const locked=useRef(false),dirty=useRef(false);
 dirty.current=!!logo||!!application&&JSON.stringify(input)!==JSON.stringify(application.input);
 const load=useCallback(async()=>{
 if(!auth.user||auth.suspended||!auth.session||!workspace.repository)return;
 let context:CapturedAccountContext|null=null;setLoading(true);setIssue('');
 try{context=workspace.captureAccountContext();const next=await workspace.repository.application(context);context.checkpoint();setRecord(next?{owner:context.userId,application:next}:null);if(next)setInput(next.input);}
 catch(cause){try{context?.checkpoint();setIssue(agencyError(cause));}catch{}}
 finally{try{context?.checkpoint();setLoading(false);}catch{}context?.release();}
 },[auth.user?.id,auth.suspended,Boolean(auth.session),workspace.repository,workspace.captureAccountContext]);
 const reload=useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}`,load,()=>locked.current||dirty.current||loading||!auth.user||auth.suspended);
 useFocusEffect(useCallback(()=>{setRecord(null);setIssue('');setBusy(false);setLoading(false);setLogo(null);setErrors({});void load();},[load]));
 async function save(){
 if(!application||!workspace.repository||locked.current||reload.isRefreshing()||!editable)return;
 const found=agencyApplicationErrors(input);setErrors(found);if(Object.keys(found).length){setIssue('Revisa los campos indicados.');return;}
 let context:CapturedAccountContext|null=null;locked.current=true;setBusy(true);setIssue('');
 try{context=workspace.captureAccountContext();const next=await workspace.repository.submitApplication(input,randomUUID(),application.agency.version,context);context.checkpoint();setRecord({owner:context.userId,application:next});setInput(next.input);}
 catch(cause){try{context?.checkpoint();setIssue(agencyError(cause));}catch{}}
 finally{locked.current=false;try{context?.checkpoint();setBusy(false);}catch{}context?.release();}
 }
 async function selectLogo(){
 if(locked.current||reload.isRefreshing()||!editable)return;let context:CapturedAccountContext|null=null;locked.current=true;setBusy(true);setIssue('');
 try{context=workspace.captureAccountContext();const next=await pickAccountAvatar(context.checkpoint);context.checkpoint();if(next){validateAgencyLogo(next);setLogo(next);}}
 catch(cause){try{context?.checkpoint();setIssue(cause instanceof Error?cause.message:'No se pudo preparar el logo.');}catch{}}
 finally{locked.current=false;try{context?.checkpoint();setBusy(false);}catch{}context?.release();}
 }
 async function uploadLogo(){
 if(!application||!supabase||!logo||locked.current||reload.isRefreshing()||!editable)return;let context:CapturedAccountContext|null=null;locked.current=true;setBusy(true);setIssue('');
 try{context=workspace.captureAccountContext();const assets=createAgencyAssetsRepository(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()??'',process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()??'',createDeadlineFetch());const path=await assets.upload(application.agency.id,randomUUID(),logo,context);const next=await attachAgencyLogo(supabase,application.agency.id,path,application.agency.version,context);context.checkpoint();setRecord({owner:context.userId,application:next});setLogo(null);}
 catch(cause){try{context?.checkpoint();setIssue(cause instanceof Error?cause.message:agencyError(cause));}catch{}}
 finally{locked.current=false;try{context?.checkpoint();setBusy(false);}catch{}context?.release();}
 }
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!dirty.current&&!!auth.user} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle title="Solicitud de inmobiliaria" subtitle="Consulta el estado y corrige los datos de tu solicitud." back fallback="/profile"/>
 {!auth.user?<AccountPrompt returnTo="/agency-application"/>:<>{Boolean(issue)&&<Notice error>{issue}</Notice>}{loading&&!application?<ActivityIndicator color={colors.primary}/>:!application?<EmptyState title="No hay solicitud" description="El registro de inmobiliarias estará disponible cuando KarmaHouse lo habilite. Desliza hacia abajo para volver a consultar."/>:<>
 <View style={s.card}><Text style={s.title}>{agencyStateLabel[application.agency.state]}</Text><Text style={s.copy}>{application.agency.tradeName}</Text>{application.reviewNote&&<Notice>{application.reviewNote}</Notice>}<Notice>{application.agency.state==='approved'?'La aprobación permite operar. La verificación se solicita por separado.':'Hasta la aprobación no puedes publicar, invitar equipo ni gestionar operaciones en nombre de la inmobiliaria.'}</Notice>{application.agency.state==='approved'&&workspace.enabled&&<Button label="Abrir mi inmobiliaria" onPress={()=>router.push('/agency-workspace')}/>}</View>
 {!workspace.enabled&&<Notice>El módulo de inmobiliarias aún no está habilitado.</Notice>}
 <AgencyRegistrationFields value={input} onChange={setInput} disabled={!editable||busy||loading} errors={errors}/>
 {editable&&<><Button label="Enviar solicitud corregida" onPress={()=>void save()} loading={busy} disabled={loading}/><View style={s.card}><Text style={s.title}>Logo opcional</Text><Text style={s.copy}>JPEG hasta 1 MiB. Se conserva privado hasta aprobar la agencia. El logo seleccionado aún no está guardado.</Text>{application.agency.logoPath&&<Notice>Hay un logo guardado para revisión.</Notice>}{logo&&<Image source={{uri:logo.previewUri}} accessible accessibilityLabel="Vista previa del logo seleccionado" style={{width:96,height:96,borderRadius:18}}/>}<Button secondary label="Seleccionar logo" onPress={()=>void selectLogo()} disabled={busy||loading}/>{logo&&<Button label="Guardar logo" onPress={()=>void uploadLogo()} loading={busy} disabled={loading}/>}</View></>}
 </>}</>}
 </ScrollView></SafeAreaView>;
}
