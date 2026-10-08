import {useCallback,useRef,useState} from 'react';
import {useFocusEffect,router} from 'expo-router';
import {Image,Linking,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {commercialInput,createAgencyProfileRepository,type CommercialProfile} from '../agencies/profile';
import {AgencyRegistrationFields,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {emptyAgencyApplication} from '../agencies/registration';
import {createAgencyAssetsRepository} from '../agencies/assets';
import {pickAccountAvatar,type PreparedAvatar} from '../auth/prepareAvatar';
import {agencyError} from '../agencies/domain';
import {createMessageId} from '../messaging/domain';
import {supabase} from '../lib/supabase';
import {PUBLIC_PAGES_URL} from '../lib/publicSite';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {Button,Notice,PageTitle} from '../components/ui';
const repo=supabase?createAgencyProfileRepository(supabase):null;
export default function AgencyProfileScreen(){const a=useAuth(),w=useAgencyWorkspace();return <Profile key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}`}/>;}
function Profile(){
 const w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles(),[record,setRecord]=useState<CommercialProfile|null>(null),[input,setInput]=useState(emptyAgencyApplication),[logo,setLogo]=useState<PreparedAvatar|null>(null),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false);
 const baseline=useRef(''),dirty=useRef(false);dirty.current=!!logo||!!record&&JSON.stringify(input)!==baseline.current;
 const epoch=useRef(0),focused=useRef(false),lock=useRef(false),pending=useRef<{input:ReturnType<typeof commercialInput>;expectedVersion:number;clientRequestId:string;logoPath?:string}|null>(null);
 const editable=w.enabled&&w.activeAgency?.state==='approved'&&w.membership?.role==='admin';
 const capture=useCallback((write=false)=>{const version=epoch.current,base=write?w.captureAgencyContext():w.captureAgencyReadContext();return {...base,checkpoint(){base.checkpoint();if(!focused.current||version!==epoch.current)throw Error('KH_AGENCY_CONTEXT_CHANGED');}};},[w.captureAgencyContext,w.captureAgencyReadContext]);
 const load=useCallback(async()=>{if(!repo||w.membership?.role!=='admin')return;const c=capture();try{const r=await repo.get(c);c.checkpoint();const next={...emptyAgencyApplication(),...r.input};baseline.current=JSON.stringify(next);setRecord(r);setInput(next);setIssue('');}catch(e){try{c.checkpoint();setIssue(agencyError(e));}catch{}}finally{c.release();}},[capture,w.membership?.role]);
 const reload=useConsultationRefresh(`${w.activeAgencyId}:${w.generation}`,load,()=>lock.current||!!pending.current||dirty.current||w.membership?.role!=='admin');
 useFocusEffect(useCallback(()=>{focused.current=true;epoch.current++;void load();return()=>{focused.current=false;epoch.current++;};},[load]));
 async function act(work:(c:ReturnType<typeof capture>)=>Promise<void>){if(lock.current||reload.isRefreshing()||!editable)return;lock.current=true;setBusy(true);let c:ReturnType<typeof capture>|undefined;try{c=capture(true);await work(c);c.checkpoint();setIssue('');}catch(e){try{c?.checkpoint();setIssue(agencyError(e));}catch{}}finally{c?.release();lock.current=false;if(focused.current)setBusy(false);}}
 async function save(c:ReturnType<typeof capture>){if(!repo||!record)return;
  if(!pending.current){const {responsibleFullName:_,evidenceReferences:__,...fields}=input;pending.current={input:commercialInput(fields),expectedVersion:record.version,clientRequestId:createMessageId()};}
  if(logo&&!pending.current.logoPath){const assets=createAgencyAssetsRepository(process.env.EXPO_PUBLIC_SUPABASE_URL??'',process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'');pending.current.logoPath=await assets.upload(c.agencyId,pending.current.clientRequestId,logo,c);}
  const r=await repo.save(pending.current,c);c.checkpoint();pending.current=null;const next={...emptyAgencyApplication(),...r.input};baseline.current=JSON.stringify(next);setRecord(r);setInput(next);setLogo(null);
 }
 return <SafeAreaView style={s.safe}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!dirty.current&&w.membership?.role==='admin'} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle title="Perfil comercial" subtitle={w.activeAgency?.tradeName} back fallback="/agency-workspace"/>
 {w.activeAgency&&<AgencyVerifiedBadge verified={w.activeAgency.verified} agencyName={w.activeAgency.tradeName} principal={w.activeAgency.isPrincipal} labelled/>}
 {Boolean(issue)&&<Notice error>{issue}</Notice>}<Notice>El teléfono, las zonas, la descripción y el logo son públicos. Publica la oficina solo si lo deseas.</Notice>
 {!editable&&<Notice>La edición requiere una agencia aprobada y un administrador actual.</Notice>}
 {record?.commercialProfileComplete===false&&<Notice>Completa el perfil comercial de tu inmobiliaria principal. Hasta guardarlo, el perfil público solo muestra su nombre y distintivo.</Notice>}
 {record&&<><AgencyRegistrationFields commercialOnly value={input} onChange={setInput} disabled={!editable||busy||!!pending.current}/>{logo&&<Image source={{uri:logo.previewUri}} accessibilityLabel="Logo preparado" style={{width:96,height:96}}/>}<Button label="Seleccionar logo comercial" secondary disabled={!editable||busy||!!pending.current} onPress={()=>void act(async c=>{const image=await pickAccountAvatar(c.checkpoint);c.checkpoint();setLogo(image);})}/><Button label={pending.current?'Reintentar guardar perfil':'Guardar perfil comercial'} disabled={!editable} loading={busy} onPress={()=>void act(save)}/>{pending.current&&<Button label="Descartar intento" secondary disabled={busy} onPress={()=>{pending.current=null;setLogo(null);setIssue('');}}/>}</>}
 <Button label="Ver perfil público" secondary onPress={()=>void Linking.openURL(`${PUBLIC_PAGES_URL}agency/${w.activeAgencyId}`)}/><Button label="Volver a mi inmobiliaria" secondary onPress={()=>router.replace('/agency-workspace')}/>
 </ScrollView></SafeAreaView>;
}
