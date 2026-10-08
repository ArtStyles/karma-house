import {randomUUID} from 'expo-crypto';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyPrivateScreenKey,loadAgencyTeamPage,type AgencyTeamPage} from '../agencies/screenRequests';
import {agencyError} from '../agencies/domain';
import type {AgencyInvitation,AgencyMembership,AgencyRole} from '../agencies/types';
import type {CapturedAccountContext,CapturedAgencyContext} from '../agencies/controller';
import {isUuid} from '../messaging/domain';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {AccountPrompt} from '../components/AccountPrompt';
import {Button,Notice,PageTitle,Pill} from '../components/ui';
import {agencyRoleLabel} from './AgencyWorkspaceScreen';
const roles:AgencyRole[]=['manager','coordinator','admin'];
export default function AgencyTeamScreen(){
 const auth=useAuth(),{user}=auth,w=useAgencyWorkspace(),{styles:s}=useAgencyFormStyles();
 const key=agencyPrivateScreenKey(user?.id,w.activeAgencyId,w.generation);
 const workspaceRef=useRef(w),authRef=useRef(auth);workspaceRef.current=w;authRef.current=auth;
 const [record,setRecord]=useState<{key:string;members:AgencyMembership[];invitations:AgencyInvitation[];membersMore:boolean;invitationsMore:boolean}|null>(null);
 const [issue,setIssue]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[lookup,setLookup]=useState(''),[role,setRole]=useState<AgencyRole>('manager');
 const [candidate,setCandidate]=useState<{id:string;displayName:string;canInvite:boolean}|null>(null),[confirmRemove,setConfirmRemove]=useState<string|null>(null);
 const sequence=useRef(0),focused=useRef(false),latestKey=useRef(key);latestKey.current=key;
 const recordRef=useRef(record);recordRef.current=record;
 const data=record?.key===key&&!auth.suspended&&auth.session?record:null,admin=Boolean(data&&!busy&&w.membership?.role==='admin');
 const load=useCallback(async(append=false)=>{
  const currentAuth=authRef.current,currentWorkspace=workspaceRef.current;
  if(!currentAuth.user||currentAuth.suspended||!currentAuth.session||!currentWorkspace.repository||!currentWorkspace.ready){setRecord(null);setBusy(false);return;}
  const request=++sequence.current,checkpoint=()=>{if(!focused.current||request!==sequence.current)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');
  try{
   const old=recordRef.current,state=currentWorkspace.getCurrentWorkspace();
   const previous:AgencyTeamPage|null=old&&old.key===agencyPrivateScreenKey(currentAuth.user.id,state.activeAgencyId,state.generation)?{...old,userId:currentAuth.user.id,agencyId:state.activeAgencyId,generation:state.generation}:null;
   const result=await loadAgencyTeamPage({...currentWorkspace,repository:currentWorkspace.repository},append,previous,checkpoint);checkpoint();
   const fresh=workspaceRef.current.getCurrentWorkspace(),actualKey=agencyPrivateScreenKey(result.userId,result.agencyId,result.generation);
   if(actualKey!==agencyPrivateScreenKey(authRef.current.user?.id,fresh.activeAgencyId,fresh.generation)||authRef.current.suspended)throw Error('KH_AGENCY_CONTEXT_CHANGED');
   setRecord({key:actualKey,members:result.members,invitations:result.invitations,membersMore:result.membersMore,invitationsMore:result.invitationsMore});
  }catch(error){try{checkpoint();setRecord(null);setCandidate(null);setConfirmRemove(null);setIssue(agencyError(error));}catch{}}
  finally{try{checkpoint();setBusy(false);}catch{}}
 },[]);
 useEffect(()=>{if(recordRef.current?.key!==key)setRecord(null);setCandidate(null);setLookup('');setConfirmRemove(null);setIssue('');setNote('');setBusy(false);},[key,auth.suspended]);
 useFocusEffect(useCallback(()=>{focused.current=true;setRecord(null);setCandidate(null);setLookup('');setConfirmRemove(null);setIssue('');setNote('');setBusy(false);void load();return()=>{focused.current=false;sequence.current++}},[load,user?.id,w.activeAgencyId,w.ready,auth.suspended]));
 async function run(enterprise:boolean,action:(context:CapturedAccountContext|CapturedAgencyContext)=>Promise<void>,refresh=true){
  if(busy||!w.repository||auth.suspended||!auth.session)return;
  let context:CapturedAccountContext|CapturedAgencyContext|null=null;const capturedKey=key;
  const current=()=>{context?.checkpoint();if(!focused.current||latestKey.current!==capturedKey)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');setNote('');
  try{context=enterprise?w.captureAgencyContext():w.captureAccountContext();await action(context);current();if(refresh){setCandidate(null);setConfirmRemove(null);setNote('Cambio guardado.');setBusy(false);await load();}}
  catch(error){try{current();setRecord(null);setCandidate(null);setConfirmRemove(null);setIssue(agencyError(error));}catch{}}
  finally{try{current();setBusy(false);}catch{}context?.release()}
 }
 async function find(){
  const raw=lookup.trim(),match=raw.match(/(?:^|\/user\/)([0-9a-f-]{36})(?:[?#].*)?$/i),id=match?.[1]??raw;
  if(!isUuid(id)){setIssue('Introduce el enlace del perfil público o el identificador de la cuenta.');return}
  await run(true,async context=>{const person=await w.repository!.invitationCandidate(id,context as CapturedAgencyContext);context.checkpoint();setCandidate(person);if(!person)setIssue('No se encontró esa cuenta. Pídele a la persona el enlace de su perfil.');},false);
 }
 async function decide(invitation:AgencyInvitation,accept:boolean){
  await run(false,async context=>{await w.repository!.decideInvitation({invitationId:invitation.id,accept,expectedVersion:invitation.version,clientRequestId:randomUUID()},context);context.checkpoint();await w.refreshAgencies();});
 }
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><PageTitle title="Equipo e invitaciones" subtitle={w.activeAgency?.tradeName??'Acepta una invitación para empezar a trabajar con una agencia.'} back fallback="/agency-workspace"/>
 {!user?<AccountPrompt returnTo="/agency-team"/>:auth.suspended||!auth.session?<Notice>Tu sesión no permite consultar el equipo. Revisa el estado de tu cuenta.</Notice>:<>
 {(issue||w.error)&&<Notice error>{issue||w.error}</Notice>}{note&&<Notice>{note}</Notice>}
 <Button label="Actualizar equipo e invitaciones" secondary loading={busy} onPress={()=>void load()}/>
 <Text style={s.title}>Invitaciones recibidas</Text>
 {data?.invitations.length===0&&<Text style={s.copy}>No tienes invitaciones.</Text>}
 {data?.invitations.map(invitation=><View key={invitation.id} style={s.card}><Text style={s.title}>{invitation.agencyName??`Inmobiliaria ${invitation.agencyId.slice(0,8)}`}</Text><Text style={s.copy}>{agencyRoleLabel[invitation.role]} · {invitation.state==='pending'?'Pendiente':invitation.state==='accepted'?'Aceptada':invitation.state==='declined'?'Rechazada':invitation.state==='expired'?'Caducada':'Cancelada'}</Text>{invitation.state==='pending'&&w.enabled&&<><Text style={s.copy}>Caduca el {new Date(invitation.expiresAt).toLocaleDateString('es-CU')}.</Text><Button label="Aceptar invitación" disabled={busy} onPress={()=>void decide(invitation,true)}/><Button secondary label="Rechazar invitación" disabled={busy} onPress={()=>void decide(invitation,false)}/></>}</View>)}
 {!w.enabled&&<Notice>Las operaciones empresariales aún no están habilitadas.</Notice>}
 {w.activeAgency&&w.membership&&w.enabled?<>
 <Text style={s.title}>Miembros de {w.activeAgency.tradeName}</Text>
 <Notice>Los coordinadores también gestionan casos. Los administradores pueden gestionar casos, coordinar y administrar el equipo.</Notice>
 {data?.members.map(member=><View key={member.userId} style={s.card}><Text style={s.title}>{member.displayName??`Cuenta ${member.userId.slice(0,8)}`}{member.userId===user.id?' · tú':''}</Text><Text style={s.copy}>{agencyRoleLabel[member.role]}</Text>{admin&&<><View style={s.wrap}>{roles.map(next=><Pill key={next} label={agencyRoleLabel[next]} active={member.role===next} onPress={()=>{if(!busy&&member.role!==next)void run(true,async context=>{await w.repository!.setMemberRole({userId:member.userId,role:next,expectedVersion:member.version,clientRequestId:randomUUID()},context as CapturedAgencyContext);await w.refreshAgencies()})}}/>)}</View>{confirmRemove===member.userId?<><Notice>¿Retirar a {member.displayName??'esta cuenta'} del equipo? Perderá el acceso a los expedientes de la agencia.</Notice><Button label="Confirmar retirada" disabled={busy} onPress={()=>void run(true,async context=>{await w.repository!.removeMember({userId:member.userId,expectedVersion:member.version,clientRequestId:randomUUID()},context as CapturedAgencyContext);await w.refreshAgencies()})}/><Button secondary label="Conservar miembro" disabled={busy} onPress={()=>setConfirmRemove(null)}/></>:<Button secondary label="Retirar del equipo" disabled={busy} onPress={()=>setConfirmRemove(member.userId)}/>}</>}</View>)}
 {admin&&<View style={s.card}><Text style={s.title}>Invitar a una persona</Text><Text style={s.copy}>La persona debe tener una cuenta personal con correo confirmado. Pídele el enlace de su perfil público para encontrar su cuenta exacta.</Text><AgencyTextField label="Enlace de perfil o identificador de cuenta" value={lookup} onChangeText={text=>{setLookup(text);setCandidate(null)}} autoCapitalize="none" editable={!busy}/><Button secondary label="Buscar cuenta" disabled={busy} onPress={()=>void find()}/>{candidate&&<><Text style={s.title}>{candidate.displayName}</Text>{!candidate.canInvite?<Notice>Esta cuenta ya pertenece al equipo o no está disponible para recibir invitaciones.</Notice>:<><View style={s.wrap}>{roles.map(next=><Pill key={next} label={agencyRoleLabel[next]} active={role===next} onPress={()=>{if(!busy)setRole(next)}}/>)}</View><Button label={`Invitar como ${agencyRoleLabel[role].toLowerCase()}`} disabled={busy} onPress={()=>void run(true,async context=>{await w.repository!.inviteMember({userId:candidate.id,role,clientRequestId:randomUUID()},context as CapturedAgencyContext)})}/></>}</>}</View>}
 </>:<Button label="Elegir inmobiliaria" secondary onPress={()=>router.push('/agency-workspace')}/>}
 {(data?.membersMore||data?.invitationsMore)&&<Button secondary label="Cargar más" disabled={busy} onPress={()=>void load(true)}/>}
 </>}
 </ScrollView></SafeAreaView>;
}
