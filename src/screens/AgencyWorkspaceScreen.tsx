import {router,useFocusEffect} from 'expo-router';
import {useCallback,useState} from 'react';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyError,canPerformAgencyAction} from '../agencies/domain';
import {agencyStateLabel} from '../agencies/registration';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {AccountPrompt} from '../components/AccountPrompt';
import {Button,EmptyState,Notice,PageTitle,Pill} from '../components/ui';
export const agencyRoleLabel={manager:'Gestor',coordinator:'Coordinador',admin:'Administrador'} as const;
export default function AgencyWorkspaceScreen(){
 const {user}=useAuth(),w=useAgencyWorkspace(),{colors,styles:s}=useAgencyFormStyles();
 const [issue,setIssue]=useState(''),[selecting,setSelecting]=useState(false);
 useFocusEffect(useCallback(()=>{setIssue('');setSelecting(false);void w.refreshAgencies()},[w.refreshAgencies]));
 async function select(id:string){setSelecting(true);setIssue('');try{await w.setActiveAgency(id)}catch(e){setIssue(agencyError(e))}finally{setSelecting(false)}}
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={s.content}><PageTitle title="Mi inmobiliaria" subtitle="Elige la agencia en cuyo nombre vas a trabajar." back fallback="/profile"/>
 {!user?<AccountPrompt returnTo="/agency-workspace"/>:!w.ready?<ActivityIndicator color={colors.primary}/>:<>
 {issue||w.error?<Notice error>{issue||w.error}</Notice>:null}
 {!w.enabled&&<Notice>El módulo de inmobiliarias aún no está habilitado. Puedes consultar tu solicitud.</Notice>}
 {w.agencies.length===0?<EmptyState title="Aún no perteneces a una inmobiliaria" description="Para ser gestor, un administrador de una agencia aprobada te invita a tu cuenta personal. La membresía comienza cuando aceptas." action={<Button label="Ver invitaciones" onPress={()=>router.push('/agency-team')}/>}/>:w.agencies.map(agency=><View key={agency.id} style={s.card}><View style={s.row}><Text style={[s.title,{flex:1}]}>{agency.tradeName}</Text><AgencyVerifiedBadge verified={agency.verified} agencyName={agency.tradeName}/></View><Text style={s.copy}>{agencyStateLabel[agency.state]}</Text>{agency.state==='approved'&&w.enabled?<Pill label={agency.id===w.activeAgencyId?'Espacio seleccionado':'Trabajar con esta agencia'} active={agency.id===w.activeAgencyId} onPress={()=>{if(!selecting&&agency.id!==w.activeAgencyId)void select(agency.id)}}/>:<Button label="Consultar solicitud" secondary onPress={()=>router.push('/agency-application')}/>}</View>)}
 {w.activeAgency&&w.membership&&<View style={s.card}><Text style={s.title}>{agencyRoleLabel[w.membership.role]}</Text><Text style={s.copy}>Las consultas, clientes y negociaciones de este espacio pertenecen a {w.activeAgency.tradeName}.</Text><Button label="Cartera de viviendas" icon="home-outline" onPress={()=>router.push('/agency-portfolio')}/><Button label="Equipo e invitaciones" icon="people-outline" onPress={()=>router.push('/agency-team')}/>{canPerformAgencyAction(w.membership.role,'request_verification')&&<Button secondary label={w.activeAgency.verified?'Ver estado de verificación':'Solicitar verificación a KarmaHouse'} icon="checkmark-circle-outline" onPress={()=>router.push('/agency-verification')}/>}<Notice>{w.activeAgency.verified?'Esta agencia puede enviar viviendas de su origen a publicación directa, salvo que requieran revisión de KarmaHouse.':'Las viviendas de esta agencia pasan por la aprobación de KarmaHouse antes de publicarse.'}</Notice></View>}
 {w.agencies.length>0&&<Button secondary label="Invitaciones a otras agencias" onPress={()=>router.push('/agency-team')}/>}
 <Button secondary label="Estado de mi solicitud" onPress={()=>router.push('/agency-application')}/><Button secondary label="Actualizar espacios" onPress={()=>void w.refreshAgencies()}/>
 </>}
 </ScrollView></SafeAreaView>;
}
