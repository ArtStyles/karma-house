import {randomUUID} from 'expo-crypto';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {isAgencyReadAccessFailure} from '../agencies/messaging/live';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyPrivateScreenKey,loadAgencyTeamPage,type AgencyTeamPage} from '../agencies/screenRequests';
import {accountIdFrom,agencyError} from '../agencies/domain';
import type {AgencyInvitation,AgencyMembership,AgencyRole} from '../agencies/types';
import type {CapturedAccountContext,CapturedAgencyContext} from '../agencies/controller';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {AccountPrompt} from '../components/AccountPrompt';
import {ActionGroup,Button,EmptyState,Notice,PageTitle,Pill} from '../components/ui';
import {agencyRoleLabel} from './AgencyWorkspaceScreen';
const roles:AgencyRole[]=['manager','coordinator','admin'];
export default function AgencyTeamScreen(){
 const auth=useAuth(),{user}=auth,w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles();
 const key=agencyPrivateScreenKey(user?.id,w.activeAgencyId,w.generation);
 const workspaceRef=useRef(w),authRef=useRef(auth);workspaceRef.current=w;authRef.current=auth;
 const [record,setRecord]=useState<{key:string;members:AgencyMembership[];invitations:AgencyInvitation[];sent:AgencyInvitation[];membersMore:boolean;invitationsMore:boolean;sentMore:boolean}|null>(null);
 const [issue,setIssue]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[lookup,setLookup]=useState(''),[role,setRole]=useState<AgencyRole>('manager');
 const [candidate,setCandidate]=useState<{id:string;displayName:string;canInvite:boolean}|null>(null),[confirmRemove,setConfirmRemove]=useState<string|null>(null);
 const [joined,setJoined]=useState<{id:string;name:string}|null>(null);
 const sequence=useRef(0),focused=useRef(false),latestKey=useRef(key);latestKey.current=key;
 const recordRef=useRef(record);recordRef.current=record;
 // One id per intended write, kept across retries: a retry after a lost response returns the server's receipt instead of failing as a repeat.
 const requestIds=useRef(new Map<string,string>());
 const requestId=(intent:string)=>{let id=requestIds.current.get(intent);if(!id){id=randomUUID();requestIds.current.set(intent,id)}return id};
 const data=record?.key===key&&!auth.suspended&&auth.session?record:null,admin=Boolean(w.enabled&&w.activeAgency?.state==='approved'&&data&&!busy&&w.membership?.role==='admin');
 const load=useCallback(async(append=false,keepIssue=false)=>{
  const currentAuth=authRef.current,currentWorkspace=workspaceRef.current;
  if(!currentAuth.user||currentAuth.suspended||!currentAuth.session||!currentWorkspace.repository||!currentWorkspace.ready){setRecord(null);setBusy(false);return;}
  const request=++sequence.current,checkpoint=()=>{if(!focused.current||request!==sequence.current)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);if(!keepIssue)setIssue('');
  try{
   const old=recordRef.current,state=currentWorkspace.getCurrentWorkspace();
   const previous:AgencyTeamPage|null=old&&old.key===agencyPrivateScreenKey(currentAuth.user.id,state.activeAgencyId,state.generation)?{...old,userId:currentAuth.user.id,agencyId:state.activeAgencyId,generation:state.generation}:null;
   const result=await loadAgencyTeamPage({...currentWorkspace,repository:currentWorkspace.repository},append,previous,checkpoint);checkpoint();
   const fresh=workspaceRef.current.getCurrentWorkspace(),actualKey=agencyPrivateScreenKey(result.userId,result.agencyId,result.generation);
   if(actualKey!==agencyPrivateScreenKey(authRef.current.user?.id,fresh.activeAgencyId,fresh.generation)||authRef.current.suspended)throw Error('KH_AGENCY_CONTEXT_CHANGED');
   setRecord({key:actualKey,members:result.members,invitations:result.invitations,sent:result.sent,membersMore:result.membersMore,invitationsMore:result.invitationsMore,sentMore:result.sentMore});
  }catch(error){try{checkpoint();if(isAgencyReadAccessFailure(error)){setRecord(null);setCandidate(null);setConfirmRemove(null);}setIssue(agencyError(error));}catch{}}
  finally{try{checkpoint();setBusy(false);}catch{}}
 },[]);
 const reload=useConsultationRefresh(`${key}:${auth.session?.access_token}`,()=>load(),busy||!auth.session||auth.suspended);
 useEffect(()=>{if(recordRef.current?.key!==key)setRecord(null);setJoined(null);setCandidate(null);setLookup('');setConfirmRemove(null);setIssue('');setNote('');setBusy(false);},[key,auth.suspended]);
 useFocusEffect(useCallback(()=>{focused.current=true;requestIds.current.clear();setJoined(null);setRecord(null);setCandidate(null);setLookup('');setConfirmRemove(null);setIssue('');setNote('');setBusy(false);void load();return()=>{focused.current=false;sequence.current++}},[load,user?.id,w.activeAgencyId,w.ready,auth.suspended]));
 async function run(enterprise:boolean,action:(context:CapturedAccountContext|CapturedAgencyContext)=>Promise<void>,saved:string|null='Cambio guardado.'){
  if(busy||reload.isRefreshing()||!w.repository||auth.suspended||!auth.session)return;
  let context:CapturedAccountContext|CapturedAgencyContext|null=null;const capturedKey=key;
  const current=()=>{context?.checkpoint();if(!focused.current||latestKey.current!==capturedKey)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');setNote('');setJoined(null);
  try{context=enterprise?w.captureAgencyContext():w.captureAccountContext();await action(context);current();if(saved!==null){requestIds.current.clear();setCandidate(null);setConfirmRemove(null);setNote(saved);setBusy(false);await load();}}
  // A failed write keeps the lists on screen and refreshes them; the candidate stays so a retry reuses its request id.
  catch(error){try{current();setConfirmRemove(null);setIssue(agencyError(error));await load(false,true);}catch{}}
  finally{try{current();setBusy(false);}catch{}context?.release()}
 }
 async function find(){
  const id=accountIdFrom(lookup);
  if(!id){setIssue('Pega el código de cuenta o el enlace de perfil que te envió la persona.');return}
  await run(true,async context=>{const person=await w.repository!.invitationCandidate(id,context as CapturedAgencyContext);context.checkpoint();setCandidate(person);if(!person)setIssue('No se encontró esa cuenta. Pídele a la persona su código de cuenta.');},null);
 }
 async function decide(invitation:AgencyInvitation,accept:boolean){
  const name=invitation.agencyName??'la inmobiliaria';
  await run(false,async context=>{await w.repository!.decideInvitation({invitationId:invitation.id,accept,expectedVersion:invitation.version,clientRequestId:requestId(`decide:${invitation.id}:${accept}:${invitation.version}`)},context);context.checkpoint();await w.refreshAgencies();if(accept)setJoined({id:invitation.agencyId,name});},
   accept?`Ya formas parte de ${name} como ${agencyRoleLabel[invitation.role].toLowerCase()}.`:'Invitación rechazada.');
 }
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardDismissMode="on-drag" alwaysBounceVertical contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&!!user&&!auth.suspended} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle compact title="Equipo e invitaciones" subtitle={w.activeAgency?.tradeName??'Acepta una invitación para empezar a trabajar con una inmobiliaria.'} back fallback="/agency-workspace"/>
 {!user?<AccountPrompt returnTo="/agency-team"/>:auth.suspended||!auth.session?<Notice>Tu sesión no permite consultar el equipo. Revisa el estado de tu cuenta.</Notice>:<>
 {(issue||w.error)&&<Notice error>{issue||w.error}</Notice>}{note&&<Notice>{note}</Notice>}{joined&&<Button label={`Ir a ${joined.name}`} onPress={()=>router.push({pathname:'/agency-workspace',params:{agencyId:joined.id}})}/>}
 {busy&&!data&&<ActivityIndicator accessibilityLabel="Consultando equipo e invitaciones" color={colors.primary}/>}
 <Text accessibilityRole="header" style={s.title}>Invitaciones recibidas</Text>
 {data?.invitations.length===0&&!busy&&!issue&&<EmptyState plain title="Sin invitaciones" description="No tienes invitaciones a inmobiliarias en esta cuenta."/>}
 {data?.invitations.map(invitation=><View key={invitation.id} style={s.card}><Text style={s.title}>{invitation.agencyName??`Inmobiliaria ${invitation.agencyId.slice(0,8)}`}</Text><Text style={s.copy}>{agencyRoleLabel[invitation.role]} · {invitation.state==='pending'?'Pendiente':invitation.state==='accepted'?'Aceptada':invitation.state==='declined'?'Rechazada':invitation.state==='expired'?'Caducada':'Cancelada'}</Text>{invitation.state==='pending'&&w.enabled&&<><Text style={s.copy}>Caduca el {new Date(invitation.expiresAt).toLocaleDateString('es-CU')}.</Text><ActionGroup><Button label="Aceptar invitación" disabled={busy} onPress={()=>void decide(invitation,true)}/><Button secondary label="Rechazar invitación" disabled={busy} onPress={()=>void decide(invitation,false)}/></ActionGroup></>}</View>)}
 {!w.enabled&&<Notice>Las operaciones empresariales aún no están habilitadas.</Notice>}
 {w.activeAgency&&w.membership?<>
 <Text accessibilityRole="header" style={s.title}>Equipo de {w.activeAgency.tradeName}</Text>
 <Notice>Los coordinadores también gestionan casos. Los administradores pueden gestionar casos, coordinar y administrar el equipo.</Notice>
 <View style={s.card}>{data?.members.map(member=><View key={member.userId} style={s.item}><Text style={s.title}>{member.displayName??`Cuenta ${member.userId.slice(0,8)}`}{member.userId===user.id?' · tú':''}</Text><Text style={s.status}>{agencyRoleLabel[member.role]}</Text>{admin&&<><Text style={s.caption}>Permisos en esta inmobiliaria</Text><View style={s.wrap}>{roles.map(next=><Pill key={next} label={agencyRoleLabel[next]} active={member.role===next} onPress={()=>{if(!busy&&member.role!==next)void run(true,async context=>{await w.repository!.setMemberRole({userId:member.userId,role:next,expectedVersion:member.version,clientRequestId:requestId(`role:${member.userId}:${next}:${member.version}`)},context as CapturedAgencyContext);await w.refreshAgencies()})}}/>)}</View>{confirmRemove===member.userId?<><Notice>¿Retirar a {member.displayName??'esta cuenta'} del equipo? Perderá el acceso a los expedientes de la inmobiliaria.</Notice><ActionGroup><Button label="Confirmar retirada" disabled={busy} onPress={()=>void run(true,async context=>{await w.repository!.removeMember({userId:member.userId,expectedVersion:member.version,clientRequestId:requestId(`remove:${member.userId}:${member.version}`)},context as CapturedAgencyContext);await w.refreshAgencies()})}/><Button secondary label="Conservar miembro" disabled={busy} onPress={()=>setConfirmRemove(null)}/></ActionGroup></>:<Button secondary label="Retirar del equipo" disabled={busy} onPress={()=>setConfirmRemove(member.userId)}/>}</>}</View>)}</View>
 {(data?.sent.length??0)>0&&<View style={s.card}><Text accessibilityRole="header" style={s.title}>Invitaciones enviadas</Text><Text style={s.copy}>Aún no han respondido. Cada persona la acepta en Mi espacio › Invitaciones de inmobiliarias.</Text>{data?.sent.map(invitation=><View key={invitation.id} style={s.item}><Text style={s.title}>{invitation.recipientName??`Cuenta ${invitation.recipientId.slice(0,8)}`}</Text><Text style={s.status}>{agencyRoleLabel[invitation.role]} · Pendiente</Text><Text style={s.copy}>Caduca el {new Date(invitation.expiresAt).toLocaleDateString('es-CU')}.</Text></View>)}</View>}
 {admin&&<View style={s.card}><Text accessibilityRole="header" style={s.title}>Invitar a una persona</Text><Text style={s.copy}>La persona debe tener una cuenta con correo confirmado. Pídele su código de cuenta: lo copia en Mi espacio › Mi código de cuenta.</Text><AgencyTextField label="Código de cuenta o enlace de perfil" value={lookup} onChangeText={text=>{setLookup(text);setCandidate(null)}} autoCapitalize="none" editable={!busy}/><Button secondary label="Buscar cuenta" disabled={busy} onPress={()=>void find()}/>{candidate&&<><Text style={s.title}>{candidate.displayName}</Text>{!candidate.canInvite?<Notice>Esta cuenta ya pertenece al equipo o no está disponible para recibir invitaciones.</Notice>:<><Text style={s.label}>Rol de la invitación</Text><View style={s.wrap}>{roles.map(next=><Pill key={next} label={agencyRoleLabel[next]} active={role===next} onPress={()=>{if(!busy)setRole(next)}}/>)}</View><Button label={`Invitar como ${agencyRoleLabel[role].toLowerCase()}`} disabled={busy} onPress={()=>void run(true,async context=>{await w.repository!.inviteMember({userId:candidate.id,role,clientRequestId:requestId(`invite:${candidate.id}:${role}`)},context as CapturedAgencyContext)},`Invitación enviada a ${candidate.displayName}. Debe aceptarla en Mi espacio › Invitaciones de inmobiliarias.`)}/></>}</>}</View>}
 </>:<Button label="Elegir inmobiliaria" secondary onPress={()=>router.push('/agency-workspace')}/>}
 {(data?.membersMore||data?.invitationsMore||data?.sentMore)&&<Button secondary label="Cargar más" disabled={busy} onPress={()=>void load(true)}/>}
 </>}
 </ScrollView></SafeAreaView>;
}
