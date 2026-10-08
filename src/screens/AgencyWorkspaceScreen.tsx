import {router,useFocusEffect,useLocalSearchParams,type Href} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyError,canPerformAgencyAction} from '../agencies/domain';
import {agencyStateLabel} from '../agencies/registration';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {AccountPrompt} from '../components/AccountPrompt';
import {Button,EmptyState,Icon,Notice,PageTitle,type IconName} from '../components/ui';
import {createThemedStyles} from '../theme';
export const agencyRoleLabel={manager:'Gestor',coordinator:'Coordinador',admin:'Administrador'} as const;
const links:{title:string;copy:string;icon:IconName;path:Href;admin?:boolean}[]=[
 {title:'Perfil comercial',copy:'Datos públicos de la inmobiliaria',icon:'business-outline',path:'/agency-profile',admin:true},
 {title:'Cartera de viviendas',copy:'Anuncios y revisión',icon:'home-outline',path:'/agency-portfolio'},
 {title:'Agenda de visitas',copy:'Citas y próximas visitas',icon:'calendar-outline',path:'/agency-agenda'},
 {title:'Seguimientos e interesados',copy:'Consultas y negociaciones',icon:'list-outline',path:'/agency-deals'},
 {title:'Cierres',copy:'Operaciones terminadas',icon:'checkmark-done-outline',path:'/agency-closures'},
 {title:'Equipo e invitaciones',copy:'Personas de este espacio',icon:'people-outline',path:'/agency-team'},
];
export default function AgencyWorkspaceScreen(){
 const params=useLocalSearchParams<{agencyId?:string}>();
 const {user,session}=useAuth(),w=useAgencyWorkspace(),{colors,styles:s}=useStyles();
 const [issue,setIssue]=useState(''),[selecting,setSelecting]=useState(false),[selectionScope,setSelectionScope]=useState(''),selection=useRef(false);
 const scope=`${user?.id}:${session?.access_token}:${params.agencyId??''}`,routePending=!!params.agencyId&&selectionScope!==scope;
 const reload=useConsultationRefresh(`${user?.id}:${session?.access_token}`,w.refreshAgencies,selecting||!user,e=>setIssue(agencyError(e)));
 useFocusEffect(useCallback(()=>{let active=true;setIssue('');setSelectionScope('');setSelecting(!!params.agencyId);selection.current=!!params.agencyId;void (async()=>{await w.refreshAgencies();if(!active)return;if(params.agencyId)await w.setActiveAgencyForRead(params.agencyId,()=>active);if(active)setSelectionScope(scope);})().catch(error=>{if(active)setIssue(agencyError(error));}).finally(()=>{if(active){selection.current=false;setSelecting(false);}});return()=>{active=false;};},[scope,params.agencyId,w.refreshAgencies,w.setActiveAgencyForRead]));
 async function select(id:string){if(selection.current)return;selection.current=true;setSelecting(true);setIssue('');try{await w.setActiveAgencyForRead(id);setSelectionScope(scope)}catch(e){setIssue(agencyError(e))}finally{selection.current=false;setSelecting(false)}}
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!!user&&!selecting} onRefresh={()=>void reload.refresh()} tintColor={colors.primary}/>}><PageTitle title="Mi inmobiliaria" subtitle="El espacio comercial de tu agencia." back fallback="/profile"/>
 {!user?<AccountPrompt returnTo="/agency-workspace"/>:!w.ready?<ActivityIndicator color={colors.primary}/>:<>
 {issue||w.error?<Notice error>{issue||w.error}</Notice>:null}
 {!w.enabled&&<Notice>El módulo está deshabilitado. Puedes consultar el historial autorizado; las operaciones están pausadas.</Notice>}
 {w.agencies.length===0?<EmptyState title="Aún no perteneces a una inmobiliaria" description="La membresía comienza al aceptar una invitación de una agencia aprobada." action={<Button label="Ver invitaciones" onPress={()=>router.push('/agency-team')}/>}/>:w.agencies.map(agency=><Pressable key={agency.id} disabled={selecting||agency.id===w.activeAgencyId} accessibilityRole="button" accessibilityState={{selected:agency.id===w.activeAgencyId}} onPress={()=>void select(agency.id)} style={[s.card,agency.isPrincipal&&s.principal,agency.id===w.activeAgencyId&&s.selected]}><View style={s.header}><View style={s.icon}><Icon name="business-outline" color={agency.isPrincipal?colors.amber:colors.primary}/></View><View style={s.copy}><Text style={s.title}>{agency.tradeName}</Text><Text style={s.meta}>{agencyStateLabel[agency.state]} · {agency.id===w.activeAgencyId?'Espacio seleccionado':'Elegir espacio'}</Text></View><Icon name={agency.id===w.activeAgencyId?'checkmark-circle':'chevron-forward'} color={agency.id===w.activeAgencyId?colors.primary:colors.muted}/></View><AgencyVerifiedBadge verified={agency.verified} principal={agency.isPrincipal} labelled agencyName={agency.tradeName}/></Pressable>)}
 {(selecting||routePending)&&<ActivityIndicator color={colors.primary}/>}
 {!selecting&&!routePending&&w.activeAgency&&w.membership&&<>
  <View style={s.context}><Text style={s.title}>{agencyRoleLabel[w.membership.role]} de {w.activeAgency.tradeName}</Text><Text style={s.meta}>Clientes, cartera y negociaciones de este espacio.</Text></View>
  <View style={s.group}>{links.filter(link=>!link.admin||w.membership?.role==='admin').map((link,index)=><Pressable key={link.title} accessibilityRole="button" onPress={()=>router.push(link.path)} style={[s.link,index>0&&s.divider]}><View style={s.icon}><Icon name={link.icon} color={colors.primary}/></View><View style={s.copy}><Text style={s.rowTitle}>{link.title}</Text><Text style={s.meta}>{link.copy}</Text></View><Icon name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>
  {w.activeAgency.isPrincipal?<Notice>Inmobiliaria principal verificada del sistema. El sello dorado distingue su identidad oficial.</Notice>:canPerformAgencyAction(w.membership.role,'request_verification')&&<Button secondary label={w.activeAgency.verified?'Ver estado de verificación':'Verificación empresarial'} icon="checkmark-circle-outline" onPress={()=>router.push('/agency-verification')}/>}
 </>}
 {w.agencies.length>0&&<Button secondary label="Invitaciones a otras agencias" onPress={()=>router.push('/agency-team')}/>}
 {!w.principalAgency&&<Button secondary label="Estado de mi solicitud" onPress={()=>router.push('/agency-application')}/>}
 </>}
 </ScrollView></SafeAreaView>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:760,alignSelf:'center',padding:22,paddingBottom:40,gap:16},card:{padding:18,backgroundColor:colors.surface,borderRadius:20,borderWidth:1,borderColor:colors.border,gap:12},selected:{borderColor:colors.primary},principal:{backgroundColor:colors.softAmber},header:{flexDirection:'row',gap:12,alignItems:'center'},icon:{width:40,height:40,borderRadius:13,backgroundColor:colors.paper,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:4},title:{color:colors.ink,fontSize:18,fontWeight:'600',lineHeight:24},meta:{color:colors.muted,fontSize:12,lineHeight:19},context:{gap:6,paddingVertical:8},group:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,borderRadius:20,overflow:'hidden'},link:{padding:16,flexDirection:'row',alignItems:'center',gap:12,minHeight:78},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},rowTitle:{color:colors.ink,fontSize:15,fontWeight:'600'}}));
