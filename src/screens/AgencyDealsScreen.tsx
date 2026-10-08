import {router,useLocalSearchParams} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
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
import {Button,Notice,PageTitle,Pill} from '../components/ui';
import {useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
const repository=supabase?createAgencyDealRepository(supabase):null;
export default function AgencyDealsScreen(){const a=useAuth(),w=useAgencyWorkspace(),{propertyId}=useLocalSearchParams<{propertyId?:string}>();return <Deals key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}:${propertyId}`} propertyId={propertyId}/>;}
function Deals({propertyId}:{propertyId?:string}){
 const w=useAgencyWorkspace(),{styles:s,colors}=useAgencyFormStyles();
 const [items,setItems]=useState<AgencyDeal[]>([]),[more,setMore]=useState(false),[members,setMembers]=useState<AgencyMembership[]>([]),[moreMembers,setMoreMembers]=useState(false),[assignee,setAssignee]=useState<string|null|undefined>(undefined),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(''),[intake,setIntake]=useState(false);
 const filters=useRef<AgencyDealFilter>({offset:0,...(propertyId?{propertyId}:{})}),rows=useRef(items);rows.current=items;
 const lock=useRef(false),pending=useRef<CreateAgencyDeal|null>(null);
 const allowed=w.ready&&w.enabled&&w.activeAgency?.state==='approved'&&!!w.membership;
 const coordinate=w.membership?.role==='admin'||w.membership?.role==='coordinator';
 const load=useCallback(async(capture:FollowupCapture,append=false)=>{if(!repository||!allowed)return;let c:ReturnType<FollowupCapture>|undefined;try{c=capture(true);const page=await repository.list({...filters.current,offset:append?rows.current.length:0},c);const team=append?null:await w.repository?.listMembers(0,c);c.checkpoint();setItems(old=>append?[...old,...page.items.filter(x=>!old.some(y=>y.id===x.id))]:page.items);setMore(page.hasMore);if(team){setMembers(team.items);setMoreMembers(team.hasMore);}setIssue('');}catch(e){try{c?.checkpoint();setItems([]);setMore(false);setIssue(agencyError(e));}catch{}}finally{c?.release();}},[allowed,w.repository]);
 const clear=useCallback(()=>{setItems([]);setMore(false);setMembers([]);setMoreMembers(false);setIssue('');setBusy(false);pending.current=null;setName('');setPhone('');setConsent('');setIntake(false);},[]);
 const scope=useFollowupScope(load,clear);
 async function act(work:(c:ReturnType<FollowupCapture>)=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);let c:ReturnType<FollowupCapture>|undefined;try{c=scope.capture();await work(c);c.checkpoint();}catch(e){try{c?.checkpoint();setIssue(agencyError(e));}catch{}}finally{c?.release();lock.current=false;if(scope.isActive())setBusy(false);}}
 async function create(c:ReturnType<FollowupCapture>){if(!repository||!propertyId)return;if(!pending.current)pending.current={propertyId,externalContact:{name,phone:phone.trim()||null,consentReference:consent},...(coordinate?{}:{assigneeId:w.membership!.userId}),clientRequestId:createMessageId()};const d=await repository.create(pending.current,c);c.checkpoint();pending.current=null;router.push({pathname:'/agency-deal/[id]',params:{id:d.id}});}
 function filter(userId:string|null|undefined){if(busy)return;setAssignee(userId);filters.current={offset:0,...(propertyId?{propertyId}:{}),...(userId!==undefined?{assigneeId:userId}:{})};setItems([]);void load(scope.capture);}
 return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}><PageTitle title="Seguimientos" subtitle={w.activeAgency?.tradeName??'Selecciona una inmobiliaria'} back fallback="/agency-workspace"/>
 {!allowed?<Notice>Selecciona una inmobiliaria aprobada con una membresía activa.</Notice>:<>
 {issue?<Notice error>{issue}</Notice>:null}
 {propertyId&&!isUuid(propertyId)?<Notice error>La vivienda seleccionada no es válida.</Notice>:propertyId?<Notice>Interesados privados de la vivienda seleccionada.</Notice>:<Button secondary label="Elegir vivienda de cartera para registrar interesado" onPress={()=>router.push('/agency-portfolio')}/>}
 <View style={s.wrap}><Pill label="Todos mis casos" active={assignee===undefined} onPress={()=>filter(undefined)}/><Pill label="Asignados a mí" active={assignee===w.membership?.userId} onPress={()=>filter(w.membership!.userId)}/>{coordinate&&<Pill label="Cola sin responsable" active={assignee===null} onPress={()=>filter(null)}/>}</View>
 {coordinate&&members.map(m=><Pill key={m.userId} label={m.displayName??'Miembro del equipo'} active={assignee===m.userId} onPress={()=>filter(m.userId)}/>)}
 {moreMembers&&<Button secondary label="Más miembros para filtrar" disabled={busy} onPress={()=>void act(async c=>{const p=await w.repository!.listMembers(members.length,c);c.checkpoint();setMembers(old=>[...old,...p.items]);setMoreMembers(p.hasMore);})}/>}
 <Button secondary label="Actualizar seguimientos" disabled={busy} onPress={()=>void load(scope.capture)}/>
 {items.map(d=><View key={d.id} style={s.card}><Text style={s.title}>{d.privateContact?.name??'Interesado con cuenta'}</Text><Text style={s.copy}>{dealStageLabel[d.stage]} · {d.assigneeId===w.membership?.userId?'Responsable: tú':d.assigneeId?'Responsable: '+(members.find(m=>m.userId===d.assigneeId)?.displayName??'Miembro del equipo'):'En cola de asignación'}</Text>{d.closedReason&&<Notice>Seguimiento terminado · {d.closedReason}</Notice>}<Button label="Abrir expediente privado" onPress={()=>router.push({pathname:'/agency-deal/[id]',params:{id:d.id}})}/></View>)}
 {!items.length&&<Notice>No hay interesados en este filtro.</Notice>}
 {more&&<Button secondary label="Cargar más interesados" disabled={busy} onPress={()=>void load(scope.capture,true)}/>}
 {propertyId&&isUuid(propertyId)&&<View style={s.card}><Button label={intake?'Cerrar formulario':'Registrar contacto externo'} disabled={busy||!!pending.current} onPress={()=>setIntake(v=>!v)}/>{intake&&<><Notice>Registra el consentimiento recibido. Este interesado se conserva solo en el expediente privado de tu agencia.</Notice>
 <TextInput style={s.input} accessibilityLabel="Nombre del contacto externo" placeholder="Nombre del interesado" placeholderTextColor={colors.muted} value={name} maxLength={120} editable={!busy&&!pending.current} onChangeText={setName}/>
 <TextInput style={s.input} accessibilityLabel="Teléfono externo" placeholder="Teléfono opcional" placeholderTextColor={colors.muted} value={phone} keyboardType="phone-pad" maxLength={24} editable={!busy&&!pending.current} onChangeText={setPhone}/>
 <TextInput style={s.input} accessibilityLabel="Referencia del consentimiento" placeholder="Cuándo y cómo autorizó este registro" placeholderTextColor={colors.muted} value={consent} maxLength={1000} multiline editable={!busy&&!pending.current} onChangeText={setConsent}/>
 <Button label={pending.current?'Reintentar registro':'Guardar interesado privado'} loading={busy} onPress={()=>void act(create)}/>{pending.current&&<Button secondary label="Descartar intento" disabled={busy} onPress={()=>{pending.current=null;setIssue('');}}/>}</>}
 </View>}
 </>}
 </ScrollView></SafeAreaView>;
}
