import {router,useFocusEffect} from 'expo-router';
import {useCallback,useMemo,useRef,useSyncExternalStore} from 'react';
import {Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {useAdminApi} from '../admin/useAdminApi';
import {createAdminQueryController} from '../admin/queryController';
import {decodeAdminDashboard} from '../admin/queries';
import {AgencyVerifiedBadge} from '../components/agencies/AgencyVerifiedBadge';
import {EmptyState,Icon,Notice,PageTitle,type IconName} from '../components/ui';
import {createThemedStyles} from '../theme';

type Counts=ReturnType<typeof decodeAdminDashboard>;
const entries:{title:string;description:string;icon:IconName;path:'/admin'|'/admin-accounts'|'/admin-listings'|'/message-reports'|'/property-reports'|'/admin-history'|'/agency-reviews'|'/assisted-listings';owner?:boolean;count?:keyof Counts}[]=[
 {title:'Revisar anuncios',description:'Publicaciones por aprobar.',icon:'checkmark-circle-outline',path:'/admin',count:'review'},
 {title:'Anuncios',description:'Catálogo y moderación.',icon:'home-outline',path:'/admin-listings'},
 {title:'Cuentas',description:'Personas y permisos.',icon:'people-outline',path:'/admin-accounts'},
 {title:'Reportes de anuncios',description:'Incidencias de viviendas.',icon:'flag-outline',path:'/property-reports',count:'propertyReports'},
 {title:'Reportes de mensajes',description:'Conversaciones denunciadas.',icon:'chatbubbles-outline',path:'/message-reports',count:'messageReports'},
 {title:'Historial',description:'Gestiones y sus motivos.',icon:'time-outline',path:'/admin-history'},
 {title:'Inmobiliarias',description:'Solicitudes y verificación.',icon:'business-outline',path:'/agency-reviews',owner:true,count:'agencies'},
 {title:'Publicación asistida',description:'Colaboradores y sus anuncios.',icon:'swap-horizontal-outline',path:'/assisted-listings',owner:true},
];
export default function AdministrationScreen(){
 const {colors,styles:s}=useStyles(),auth=useAuth(),w=useAgencyWorkspace(),call=useAdminApi(),callRef=useRef(call);callRef.current=call;
 const controller=useMemo(()=>createAdminQueryController<boolean,Counts>(async(_input,_offset,signal)=>({items:[decodeAdminDashboard(await callRef.current('kh_admin_dashboard',{},signal))],total:1,hasMore:false})),[]);
 const key=JSON.stringify([auth.session?.user.id,auth.session?.access_token,auth.isAdmin]);
 useFocusEffect(useCallback(()=>{controller.setContext(key,auth.isAdmin?true:null);if(auth.isAdmin)void controller.load();return controller.cancel;},[controller,key,auth.isAdmin]));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),counts=state.key===key?state.page?.items[0]:undefined;
 const principal=w.principalAgency;
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={state.key===key&&state.refreshing} enabled={auth.isAdmin} onRefresh={()=>void controller.refresh()} tintColor={colors.primary}/>}>
  <PageTitle title="Administración" subtitle="Todo lo que necesita tu atención." back fallback="/profile"/>
  {!auth.isAdmin?<EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Inicia sesión con una cuenta administradora."/>:<>
   <View style={s.banner}><View style={s.icon}><Icon name="shield-checkmark-outline" color={colors.primary} size={25}/></View><View style={s.copy}><Text style={s.title}>{auth.isOwner?'Propietario de KarmaHouse':'Administración de KarmaHouse'}</Text><Text style={s.description}>{auth.isOwner?'Gestiona la comunidad y los permisos desde tu cuenta protegida.':'Revisa publicaciones y reportes de la comunidad.'}</Text></View></View>
   {auth.isOwner&&principal&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir inmobiliaria principal" onPress={()=>router.push({pathname:'/agency-workspace',params:{agencyId:principal!.id}})} style={s.principal}><View style={s.copy}><Text style={s.title}>{principal.tradeName}</Text><AgencyVerifiedBadge verified={principal.verified} principal={principal.isPrincipal} agencyName={principal.tradeName} labelled/><Text style={s.description}>Espacio comercial de la inmobiliaria principal.</Text></View><Icon name="chevron-forward" color={colors.amber}/></Pressable>}
   {state.error&&<Notice error>No pudimos consultar los pendientes. Desliza hacia abajo para volver a intentarlo.</Notice>}
   <View style={s.cards}>{entries.filter(entry=>!entry.owner||auth.isOwner).map(entry=>{const count=counts&&entry.count?counts[entry.count]:null;return <Pressable key={entry.path} accessibilityRole="button" accessibilityLabel={`${entry.title}${count===null||count===undefined?'':`, ${count} pendientes`}`} onPress={()=>router.push(entry.path)} style={({pressed})=>[s.card,pressed&&{opacity:.7}]}><View style={s.top}><View style={s.icon}><Icon name={entry.icon} size={23} color={colors.primary}/></View>{count!==null&&count!==undefined&&<Text style={[s.count,count>0&&s.pending]}>{count}</Text>}</View><Text style={s.tileTitle}>{entry.title}</Text><Text style={s.description}>{entry.description}</Text><View style={s.bottom}><Text style={s.open}>Abrir</Text><Icon name="arrow-forward" size={16} color={colors.primary}/></View></Pressable>;})}</View>
  </>}
 </ScrollView></SafeAreaView>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:820,alignSelf:'center',padding:20,gap:16,paddingBottom:36},banner:{backgroundColor:colors.softBlue,padding:18,borderRadius:20,flexDirection:'row',gap:14,alignItems:'center'},principal:{backgroundColor:colors.softAmber,padding:18,borderRadius:20,borderWidth:1,borderColor:colors.amber,flexDirection:'row',gap:10,alignItems:'center'},copy:{flex:1,minWidth:0,gap:7},title:{color:colors.ink,fontSize:17,fontWeight:'600'},description:{color:colors.muted,fontSize:12,lineHeight:18},cards:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{backgroundColor:colors.surface,padding:16,borderRadius:20,borderWidth:1,borderColor:colors.border,flexBasis:'47%',flexGrow:1,gap:10,minHeight:175},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},icon:{backgroundColor:colors.softBlue,width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},tileTitle:{color:colors.ink,fontSize:16,lineHeight:21,fontWeight:'600'},count:{fontSize:13,color:colors.muted,backgroundColor:colors.paper,paddingHorizontal:9,paddingVertical:5,borderRadius:9,fontWeight:'600'},pending:{color:colors.amber,backgroundColor:colors.softAmber},bottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:'auto',paddingTop:6},open:{color:colors.primary,fontSize:12,fontWeight:'600'}}));
