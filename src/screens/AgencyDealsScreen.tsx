import {router,useLocalSearchParams} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {createAgencyDealRepository} from '../agencies/deals/repository';
import {useFollowupScope,type FollowupCapture} from '../agencies/deals/useFollowupScope';
import type {AgencyDeal,AgencyDealFilter,CreateAgencyDeal} from '../agencies/deals/types';
import type {AgencyMembership} from '../agencies/types';
import {dealStageLabel} from '../agencies/deals/domain';
import {agencyError} from '../agencies/domain';
import {createMessageId,isUuid} from '../messaging/domain';
import {supabase} from '../lib/supabase';
import {ActionGroup,Button,EmptyState,Notice,PageTitle,Pill} from '../components/ui';
import {AgencyTextField,useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {agencyInitials} from '../components/agencies/agencyInitials';
const repository=supabase?createAgencyDealRepository(supabase):null;
export default function AgencyDealsScreen(){const a=useAuth(),w=useAgencyWorkspace(),{propertyId}=useLocalSearchParams<{propertyId?:string}>();return <Deals key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}:${propertyId}`} propertyId={propertyId}/>;}
function Deals({propertyId}:{propertyId?:string}){
 const w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles();
 const [items,setItems]=useState<AgencyDeal[]>([]),[more,setMore]=useState(false),[members,setMembers]=useState<AgencyMembership[]>([]),[moreMembers,setMoreMembers]=useState(false),[assignee,setAssignee]=useState<string|null|undefined>(undefined),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const [loading,setLoading]=useState(true);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(''),[intake,setIntake]=useState(false);
 const filters=useRef<AgencyDealFilter>({offset:0,...(propertyId?{propertyId}:{})}),rows=useRef(items);rows.current=items;
 const lock=useRef(false),pending=useRef<CreateAgencyDeal|null>(null);
 const allowed=w.ready&&!!w.activeAgency&&!!w.membership;
 const coordinate=w.membership?.role==='admin'||w.membership?.role==='coordinator';
 const load=useCallback(async(capture:FollowupCapture,append=false)=>{if(!repository||!allowed)return;setLoading(true);let c:ReturnType<FollowupCapture>|undefined;try{c=capture(true);const page=await repository.list({...filters.current,offset:append?rows.current.length:0},c);const team=append?null:await w.repository?.listMembers(0,c);c.checkpoint();setItems(old=>append?[...old,...page.items.filter(x=>!old.some(y=>y.id===x.id))]:page.items);setMore(page.hasMore);if(team){setMembers(team.items);setMoreMembers(team.hasMore);}setIssue('');}catch(e){try{c?.checkpoint();setIssue(agencyError(e));}catch{}}finally{try{c?.checkpoint();setLoading(false);}catch{}c?.release();}},[allowed,w.repository]);
 const clear=useCallback(()=>{setItems([]);setMore(false);setMembers([]);setMoreMembers(false);setIssue('');setBusy(false);setLoading(true);pending.current=null;setName('');setPhone('');setConsent('');setIntake(false);},[]);
 const scope=useFollowupScope(load,clear);
 const reload=useConsultationRefresh(`${w.activeAgencyId}:${w.generation}:${propertyId}:${assignee}`,()=>load(scope.capture),()=>lock.current||!!pending.current||!allowed);
 async function act(work:(c:ReturnType<FollowupCapture>)=>Promise<void>,write=true){if(lock.current||reload.isRefreshing())return;lock.current=true;setBusy(true);let c:ReturnType<FollowupCapture>|undefined;try{c=scope.capture(false,write);await work(c);c.checkpoint();}catch(e){try{c?.checkpoint();setIssue(agencyError(e));}catch{}}finally{c?.release();lock.current=false;if(scope.isActive())setBusy(false);}}
 async function create(c:ReturnType<FollowupCapture>){if(!repository||!propertyId)return;if(!pending.current)pending.current={propertyId,externalContact:{name,phone:phone.trim()||null,consentReference:consent},...(coordinate?{}:{assigneeId:w.membership!.userId}),clientRequestId:createMessageId()};const d=await repository.create(pending.current,c);c.checkpoint();pending.current=null;router.push({pathname:'/agency-deal/[id]',params:{id:d.id}});}
 function filter(userId:string|null|undefined){if(busy)return;setAssignee(userId);filters.current={offset:0,...(propertyId?{propertyId}:{}),...(userId!==undefined?{assigneeId:userId}:{})};setItems([]);void load(scope.capture);}
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardDismissMode="on-drag" alwaysBounceVertical keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!busy&&allowed} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle compact title="Seguimientos" subtitle={w.activeAgency?.tradeName??'Selecciona una inmobiliaria'} back fallback="/agency-workspace"/>
 {!allowed?<Notice>Selecciona una inmobiliaria aprobada con una membresía activa.</Notice>:<>
 {issue?<Notice error>{issue}</Notice>:null}
 {propertyId&&!isUuid(propertyId)?<Notice error>La vivienda seleccionada no es válida.</Notice>:propertyId?<Notice>Interesados privados de la vivienda seleccionada.</Notice>:w.enabled&&w.activeAgency?.state==='approved'?<Button secondary label="Elegir vivienda de cartera para registrar interesado" onPress={()=>router.push('/agency-portfolio')}/>:null}
 <View style={s.card}><Text accessibilityRole="header" style={s.title}>Filtrar por responsable</Text><View style={s.wrap}><Pill label="Todos mis casos" active={assignee===undefined} onPress={()=>filter(undefined)}/><Pill label="Asignados a mí" active={assignee===w.membership?.userId} onPress={()=>filter(w.membership!.userId)}/>{coordinate&&<Pill label="Cola sin responsable" active={assignee===null} onPress={()=>filter(null)}/>}</View>
 {/* Each person on the team as a round avatar: initials, «Tú» for oneself, the chosen one in blue. */}
 {coordinate&&members.length>0&&<View style={s.field}><Text style={s.caption}>Responsable</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatars}>{members.map(m=>{const self=m.userId===w.membership?.userId,name=m.displayName??'Miembro del equipo',active=assignee===m.userId;return <Pressable key={m.userId} accessibilityRole="button" accessibilityLabel={`Responsable: ${self?'tú':name}`} accessibilityState={{selected:active}} disabled={busy} onPress={()=>filter(m.userId)} style={[s.avatar,active&&s.avatarOn]}><Text style={[s.avatarText,active&&s.avatarTextOn]}>{self?'Tú':agencyInitials(name)}</Text></Pressable>;})}</ScrollView></View>}
 {moreMembers&&<Button secondary label="Más miembros para filtrar" disabled={busy} onPress={()=>void act(async c=>{const p=await w.repository!.listMembers(members.length,c);c.checkpoint();setMembers(old=>[...old,...p.items]);setMoreMembers(p.hasMore);},false)}/>}</View>
 {items.map(d=><View key={d.id} style={s.card}><Text style={s.title}>{d.buyerName}</Text><Text style={s.copy}>{d.propertyTitle}</Text><Text style={s.status}>{dealStageLabel[d.stage]}</Text><Text style={s.copy}> {d.assigneeId===w.membership?.userId?'Responsable: tú':d.assigneeId?'Responsable: '+(members.find(m=>m.userId===d.assigneeId)?.displayName??'Miembro del equipo'):'En cola de asignación'}</Text>{d.closedReason&&<Notice>Seguimiento terminado · {d.closedReason}</Notice>}<Button label="Abrir expediente privado" onPress={()=>router.push({pathname:'/agency-deal/[id]',params:{id:d.id}})}/></View>)}
 {loading&&!reload.refreshing&&!items.length&&<ActivityIndicator accessibilityLabel="Consultando interesados" color={colors.primary}/>}
 {!items.length&&!loading&&!issue&&<EmptyState plain title="Sin interesados en este filtro" description="Los expedientes disponibles aparecerán aquí según el responsable elegido."/>}
 {more&&<Button secondary label="Cargar más interesados" disabled={busy} onPress={()=>void load(scope.capture,true)}/>}
 {w.enabled&&w.activeAgency?.state==='approved'&&propertyId&&isUuid(propertyId)&&<View style={s.card}><Text accessibilityRole="header" style={s.title}>Contacto externo</Text><Button secondary label={intake?'Cerrar formulario':'Registrar contacto externo'} disabled={busy||!!pending.current} onPress={()=>setIntake(v=>!v)}/>{intake&&<><Notice>Registra el consentimiento recibido. Este interesado se conserva solo en el expediente privado de tu inmobiliaria.</Notice>
 <AgencyTextField label="Nombre del contacto externo" placeholder="Nombre del interesado" value={name} maxLength={120} editable={!busy&&!pending.current} onChangeText={setName}/>
 <AgencyTextField label="Teléfono externo · opcional" placeholder="Teléfono opcional" value={phone} keyboardType="phone-pad" maxLength={24} editable={!busy&&!pending.current} onChangeText={setPhone}/>
 <AgencyTextField label="Referencia del consentimiento" placeholder="Cuándo y cómo autorizó este registro" value={consent} maxLength={1000} multiline editable={!busy&&!pending.current} onChangeText={setConsent}/>
 <ActionGroup><Button label={pending.current?'Reintentar registro':'Guardar interesado privado'} loading={busy} onPress={()=>void act(create)}/>{pending.current&&<Button secondary label="Descartar intento" disabled={busy} onPress={()=>{pending.current=null;setIssue('');}}/>}</ActionGroup></>}
 </View>}
 </>}
 </ScrollView></SafeAreaView>;
}
