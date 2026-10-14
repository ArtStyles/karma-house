import {PROVINCES} from '../domain/listingOptions';
import {randomUUID} from 'expo-crypto';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,KeyboardAvoidingView,Modal,Platform,RefreshControl,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import type {CapturedAccountContext} from '../agencies/controller';
import {createAgencyScreenRequestScope} from '../agencies/screenRequests';
import {agencyError} from '../agencies/domain';
import {createAgencyAssetsRepository} from '../agencies/assets';
import {createDeadlineFetch} from '../lib/fetchTimeout';
import {loadAgencyReviewDetail} from '../agencies/review';
import {agencyStateLabel,agencyVerificationPresentation,canReviewAgency} from '../agencies/registration';
import type {AgencyApplication,AgencyState,AgencyVerificationRequest,AgencyVerificationRequestState} from '../agencies/types';
import {supabase} from '../lib/supabase';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {ActionGroup,Button,EmptyState,Notice,PageTitle,Pill} from '../components/ui';
type Detail={application:AgencyApplication;request:AgencyVerificationRequest|null;logoUrl?:string|null};
type Choice={actorId:string;detail:Detail;kind:'recovery';decision:'recover';requestId?:undefined}|{actorId:string;requestId?:string;detail:Detail;kind:'application';decision:'approve'|'needs_changes'|'reject'|'suspend'}|{actorId:string;requestId?:string;detail:Detail;kind:'verification';decision:'grant'|'needs_changes'|'reject'|'revoke'};
const actionLabels={recover:'Recuperar inmobiliaria',approve:'Aprobar inmobiliaria',needs_changes:'Pedir correcciones',reject:'Rechazar',suspend:'Suspender inmobiliaria',grant:'Conceder verificación',revoke:'Retirar verificación'};
export default function AgencyReviewsScreen(){
 const params=useLocalSearchParams<{section?:string}>();
 const auth=useAuth(),workspace=useAgencyWorkspace(),{colors,styles:s}=useAgencyFormStyles();
 const owner=canReviewAgency(auth)&&!auth.suspended&&Boolean(auth.session),[section,setSection]=useState<'application'|'verification'>(params.section==='verification'?'verification':'application'),[agencyState,setAgencyState]=useState<AgencyState>('pending'),[verificationState,setVerificationState]=useState<AgencyVerificationRequestState|'all'>('pending'),[selection,setSelection]=useState<Choice|null>(null),[newAdminId,setNewAdminId]=useState(''),[note,setNote]=useState(''),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setSection(params.section==='verification'?'verification':'application')},[params.section]);
 const [query,setQuery]=useState(''),[filters,setFilters]=useState<Record<string,string>>({}),[sort,setSort]=useState<'newest'|'oldest'|'name'>('oldest'),[expanded,setExpanded]=useState<string|null>(null);
 const list=useAdminQuery('agencies',query,{...filters,review:section,...(section==='application'?{state:agencyState}:verificationState==='all'?{state:'approved'}:{verificationState})},sort,owner),loading=list.loading;
 const viewKey=`${auth.user?.id??''}:${section}:${agencyState}:${verificationState}:${query}:${JSON.stringify(filters)}:${sort}:${auth.session?.access_token}`,scope=useRef(createAgencyScreenRequestScope()).current;
 const items=list.items as Detail[],selected=selection?.actorId===auth.user?.id&&owner?selection:null;
 const load=list.reload;
 useFocusEffect(useCallback(()=>{scope.enter(viewKey);setSelection(null);setExpanded(null);setNote('');setNewAdminId('');setIssue('');setBusy(false);return()=>scope.leave();},[viewKey,scope]));
 async function choose(detail:Detail,kind:Choice['kind'],decision:Choice['decision']){
 if(!owner||!auth.user||auth.suspended||!auth.session||!supabase||busy||loading)return;
 const ticket=scope.begin();let context:CapturedAccountContext|null=null;setBusy(true);setIssue('');
 try{context=workspace.captureAccountContext();const current:Detail=await loadAgencyReviewDetail(supabase,detail.application.agency.id,context,kind==='verification'?detail.request?.id:undefined);if(current.application.agency.logoPath){current.logoUrl=await createAgencyAssetsRepository(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()??'',process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()??'',createDeadlineFetch()).sign(current.application.agency.logoPath,context);}ticket.checkpoint(context);setNote('');setNewAdminId('');setSelection({actorId:context.userId,requestId:kind==='verification'?detail.request?.id:undefined,detail:current,kind,decision} as Choice);}
 catch(cause){try{ticket.checkpoint(context??undefined);setIssue(agencyError(cause));}catch{}}
 finally{try{ticket.checkpoint(context??undefined);setBusy(false);}catch{}context?.release();}
 }
 async function confirm(){
 if(!selected||!workspace.repository||!supabase||auth.suspended||!auth.session||busy)return;if(note.trim().length<(selected.kind==='recovery'?10:3)){setIssue('Escribe el motivo; para recuperar una agencia, incluye cómo comprobaste la identidad del responsable.');return;}
 const ticket=scope.begin();let context:CapturedAccountContext|null=null;setBusy(true);setIssue('');
 try{context=workspace.captureAccountContext();const a=selected.detail.application.agency,r=selected.detail.request;
 if(selected.kind==='verification'){const latest=await loadAgencyReviewDetail(supabase,a.id,context,selected.requestId);ticket.checkpoint(context);if(selected.requestId&&r&&(latest.request?.id!==r.id||latest.request.version!==r.version||!['pending','needs_changes'].includes(latest.request.state)))throw Error('KH_AGENCY_VERSION_CONFLICT');}
 if(selected.kind==='recovery')await workspace.repository.recoverAgency({agencyId:a.id,newAdminId:newAdminId.trim(),reason:note.trim(),expectedVersion:a.version,clientRequestId:randomUUID()},context);
 else if(selected.kind==='application')await workspace.repository.reviewAgency({agencyId:a.id,decision:selected.decision,note:note.trim(),expectedVersion:a.version,clientRequestId:randomUUID()},context);
 else{const usesRequest=selected.decision!=='revoke'&&r&&['pending','needs_changes'].includes(r.state);await workspace.repository.reviewVerification({agencyId:a.id,decision:selected.decision,note:note.trim(),expectedAgencyVersion:a.version,expectedVerificationVersion:a.verificationVersion,...(usesRequest?{requestId:r.id,expectedRequestVersion:r.version}:{}),clientRequestId:randomUUID()},context);}
 ticket.checkpoint(context);setSelection(null);setNote('');setBusy(false);await load();await workspace.refreshAgencies();
 }catch(cause){try{ticket.checkpoint(context??undefined);setIssue(agencyError(cause));}catch{}}
 finally{try{ticket.checkpoint(context??undefined);setBusy(false);}catch{}context?.release();}
 }
 function changeSection(value:'application'|'verification'){if(busy||value===section)return;scope.invalidate();setSection(value);}
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}>
  <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={owner&&!busy} onRefresh={()=>{if(!busy)void list.refresh();}} tintColor={colors.primary}/>}>
   <PageTitle compact title="Revisión de inmobiliarias" subtitle="Aprobación inicial y verificación son decisiones independientes." back fallback="/administration"/>
   {!owner?<EmptyState plain title="Acceso reservado" description="Solo el propietario de KarmaHouse puede aprobar agencias y conceder o retirar su verificación."/>:<>
    <View style={s.card}><Text accessibilityRole="header" style={s.title}>Tipo de revisión</Text>
     <View style={s.wrap}><Pill label="Aprobación inicial" active={section==='application'} onPress={()=>changeSection('application')}/><Pill label="Verificación" active={section==='verification'} onPress={()=>changeSection('verification')}/></View>
     <Text style={s.label}>Estado</Text><View style={s.wrap}>{section==='application'?(['pending','needs_changes','rejected','approved','suspended'] as const).map(state=><Pill key={state} label={agencyStateLabel[state]} active={agencyState===state} onPress={()=>{if(!busy&&state!==agencyState){scope.invalidate();setAgencyState(state);}}}/>):(['pending','needs_changes','rejected','all'] as const).map(state=><Pill key={state} label={state==='all'?'Agencias aprobadas':agencyVerificationPresentation(false,state).label} active={verificationState===state} onPress={()=>{if(!busy&&state!==verificationState){scope.invalidate();setVerificationState(state);}}}/>)}</View>
     <AdminToolbar query={query} onSearch={setQuery} filters={filters} onFilters={setFilters} sort={sort} onSort={value=>setSort(value as typeof sort)} disabled={busy} fields={[{key:'province',label:'Provincia',options:PROVINCES.map(value=>({value,label:value}))},{key:'verified',label:'Sello',options:options({true:'Verificadas',false:'Sin verificación'})}]}/>
    </View>
    {list.error&&<Notice error>{agencyError(new Error(list.error))}</Notice>}{Boolean(issue)&&!selected&&<Notice error>{issue}</Notice>}
    {loading&&<ActivityIndicator color={colors.primary}/>}
    {!loading&&!list.error&&!issue&&!items.length&&<EmptyState plain title="Sin solicitudes en esta vista" description="Desliza hacia abajo o elige otro estado para consultar las revisiones."/>}
    {items.map(detail=>{const a=detail.application.agency,r=detail.request,input=detail.application.input;return <View key={r?.id??a.id} style={s.card}>
     <Text style={s.title}>{a.tradeName}</Text><AgencyVerifiedBadge verified={a.verified} agencyName={a.tradeName} principal={a.isPrincipal} labelled/>
     <Text style={s.status}>{agencyStateLabel[a.state]}</Text><Text style={s.copy}>{[input.province,input.municipality].filter(Boolean).join(' · ')||(a.isPrincipal?'Identidad principal protegida del sistema':'Perfil de solicitud sin ubicación')}</Text>
     <Button secondary label={expanded===(r?.id??a.id)?'Ocultar detalles':'Detalles y acciones'} disabled={busy} onPress={()=>setExpanded(expanded===(r?.id??a.id)?null:r?.id??a.id)}/>
     {auth.isOwner&&a.state==='approved'&&<Button secondary label="KarmaHouse Pro" disabled={busy} onPress={()=>router.push({pathname:'/admin-pro',params:{agencyId:a.id,name:a.tradeName}})}/>}
     {expanded===(r?.id??a.id)&&<>
      <View style={s.item}><Text accessibilityRole="header" style={s.title}>Responsable y revisión privada</Text><View style={s.datum}><Text style={s.caption}>Responsable privado</Text><Text style={s.value}>{input.responsibleFullName}</Text></View>{!a.isPrincipal&&<Text style={s.copy}>Correo {detail.application.emailConfirmed?'confirmado':'pendiente de confirmación'}</Text>}{a.logoPath&&<Notice>Logo privado guardado para revisión.</Notice>}{input.evidenceReferences.map((reference,index)=><View key={index} style={s.datum}><Text style={s.caption}>Referencia privada {index+1}</Text><Text selectable style={s.value}>{reference}</Text></View>)}{detail.application.reviewNote&&<Notice>{detail.application.reviewNote}</Notice>}</View>
      <View style={s.item}><Text accessibilityRole="header" style={s.title}>Datos comerciales</Text><Text style={s.value}>{input.description}</Text><View style={s.datum}><Text style={s.caption}>Teléfono y ubicación</Text><Text style={s.value}>{input.businessPhone}</Text><Text style={s.copy}>{input.province}, {input.municipality}</Text></View><View style={s.datum}><Text style={s.caption}>Zonas de servicio</Text><Text style={s.value}>{input.serviceAreas.join(', ')}</Text></View><View style={s.datum}><Text style={s.caption}>Oficina · {input.publishOfficeAddress?'Dirección pública':'Dirección privada'}</Text><Text style={s.value}>{input.officeAddress??'No indicada'}</Text></View></View>
      {a.isPrincipal?<Notice>Inmobiliaria principal del sistema. Su identidad y verificación están protegidas.</Notice>:section==='application'?<View style={s.item}>
       <Text accessibilityRole="header" style={s.title}>Decisión de aprobación</Text>
       {['pending','needs_changes','rejected'].includes(a.state)&&<Button label="Aprobar inmobiliaria" disabled={busy||loading||!detail.application.emailConfirmed} onPress={()=>void choose(detail,'application','approve')}/>}
       {['pending','needs_changes','rejected'].includes(a.state)&&<ActionGroup><Button secondary label="Pedir correcciones" disabled={busy||loading} onPress={()=>void choose(detail,'application','needs_changes')}/><Button secondary label="Rechazar solicitud" disabled={busy||loading} onPress={()=>void choose(detail,'application','reject')}/></ActionGroup>}
       {a.state==='suspended'&&<Button label="Recuperar inmobiliaria" disabled={busy||loading} onPress={()=>void choose(detail,'recovery','recover')}/>}
       {a.state==='approved'&&<Button secondary label="Suspender inmobiliaria" disabled={busy||loading} onPress={()=>void choose(detail,'application','suspend')}/>}
      </View>:<View style={s.item}>
       <Text accessibilityRole="header" style={s.title}>Verificación empresarial</Text>
       {r&&<><Text style={s.status}>{agencyVerificationPresentation(a.verified,r.state).label}</Text><Text style={s.value}>{r.input.message}</Text>{r.input.evidenceReferences.map((reference,index)=><View key={index} style={s.datum}><Text style={s.caption}>Evidencia privada {index+1}</Text><Text selectable style={s.value}>{reference}</Text></View>)}{r.reviewNote&&<Notice>{r.reviewNote}</Notice>}</>}
       {a.state==='approved'&&(!r||['pending','needs_changes'].includes(r.state))&&<Button label={a.verified?'Retirar verificación':'Conceder verificación'} secondary={a.verified} disabled={busy||loading} onPress={()=>void choose(detail,'verification',a.verified?'revoke':'grant')}/>}
       {r&&['pending','needs_changes'].includes(r.state)&&<ActionGroup><Button secondary label="Pedir correcciones de verificación" disabled={busy||loading} onPress={()=>void choose(detail,'verification','needs_changes')}/><Button secondary label="Rechazar verificación" disabled={busy||loading} onPress={()=>void choose(detail,'verification','reject')}/></ActionGroup>}
      </View>}
     </>}
    </View>})}
    <AdminPagination {...list} loading={loading||busy}/>
   </>}
  </ScrollView>
  <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={()=>{if(!busy)setSelection(null);}}>
   <SafeAreaView style={s.modalBackdrop} edges={['top','bottom','left','right']}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1,justifyContent:'center'}}><View style={s.modalFrame}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.modalContent}>
    {selected&&<>
     <View style={s.datum}><Text accessibilityRole="header" style={s.title}>{actionLabels[selected.decision]}</Text><Text style={s.value}>{selected.detail.application.agency.tradeName}</Text></View>
     {selected.detail.logoUrl&&<Image source={{uri:selected.detail.logoUrl}} accessible accessibilityLabel="Logo privado de la inmobiliaria para revisión" style={s.logo}/>}
     {selected.kind==='recovery'&&<AgencyTextField label="ID de la cuenta del nuevo administrador" value={newAdminId} onChangeText={setNewAdminId} editable={!busy} maxLength={36}/>}
     <Notice>{selected.kind==='recovery'?'Comprueba la identidad del nuevo responsable y registra la evidencia en el motivo. Su correo debe estar confirmado y su cuenta activa. La cartera seguirá pausada; el sello, los procesos terminados y las autorizaciones retiradas no se restauran.':selected.kind==='application'?selected.decision==='approve'?'Permite operar y asigna al responsable como administrador de esta inmobiliaria. No concede verificación.':selected.decision==='suspend'?'Suspende la operativa empresarial y retira la verificación vigente. No se restaurará al recuperar la agencia.':'Esta decisión afecta la aprobación inicial; el motivo será visible al solicitante.':selected.decision==='grant'?'Concede el check verde y permite publicación directa de nuevos envíos válidos de esta agencia. No publica automáticamente borradores o anuncios pendientes.':selected.decision==='revoke'?'Retira el check verde. Los próximos envíos requieren aprobación individual. Conserva las publicaciones ya aprobadas.':'Esta decisión afecta la solicitud de verificación. La agencia sigue operando sin publicación directa.'}</Notice>
     <AgencyTextField label="Motivo visible al solicitante" value={note} onChangeText={setNote} editable={!busy} multiline maxLength={1000}/>
     {Boolean(issue)&&<Notice error>{issue}</Notice>}
     <ActionGroup><Button label={`Confirmar: ${actionLabels[selected.decision]}`} onPress={()=>void confirm()} loading={busy}/><Button label="Cancelar" secondary onPress={()=>setSelection(null)} disabled={busy}/></ActionGroup>
    </>}
   </ScrollView></View></KeyboardAvoidingView></SafeAreaView>
  </Modal>
 </SafeAreaView>;
}
