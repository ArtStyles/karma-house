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
import {createThemedStyles,internalLayout} from '../theme';

type Counts=ReturnType<typeof decodeAdminDashboard>;
const entries:{title:string;description:string;icon:IconName;path:'/admin'|'/admin-accounts'|'/admin-listings'|'/message-reports'|'/property-reports'|'/admin-history'|'/agency-reviews'|'/assisted-listings'|'/admin-pro';owner?:boolean;count?:keyof Counts}[]=[
 {title:'Revisar anuncios',description:'Publicaciones por aprobar.',icon:'checkmark-circle-outline',path:'/admin',count:'review'},
 {title:'Anuncios',description:'Catálogo y moderación.',icon:'home-outline',path:'/admin-listings'},
 {title:'Cuentas',description:'Personas y permisos.',icon:'people-outline',path:'/admin-accounts'},
 {title:'Reportes de anuncios',description:'Incidencias de viviendas.',icon:'flag-outline',path:'/property-reports',count:'propertyReports'},
 {title:'Reportes de mensajes',description:'Conversaciones denunciadas.',icon:'chatbubbles-outline',path:'/message-reports',count:'messageReports'},
 {title:'Historial',description:'Gestiones y sus motivos.',icon:'time-outline',path:'/admin-history'},
 {title:'Inmobiliarias',description:'Solicitudes y verificación.',icon:'business-outline',path:'/agency-reviews',owner:true,count:'agencies'},
 {title:'Publicación asistida',description:'Colaboradores y sus anuncios.',icon:'swap-horizontal-outline',path:'/assisted-listings',owner:true},
 {title:'KarmaHouse Pro',description:'Códigos y cuentas Pro.',icon:'star-outline',path:'/admin-pro',owner:true},
];
export default function AdministrationScreen(){
 const {colors,styles:s}=useStyles(),auth=useAuth(),w=useAgencyWorkspace(),call=useAdminApi(),callRef=useRef(call);callRef.current=call;
 const controller=useMemo(()=>createAdminQueryController<boolean,Counts>(async(_input,_offset,signal)=>({items:[decodeAdminDashboard(await callRef.current('kh_admin_dashboard',{},signal))],total:1,hasMore:false})),[]);
 const key=JSON.stringify([auth.session?.user.id,auth.session?.access_token,auth.isAdmin]);
 useFocusEffect(useCallback(()=>{controller.setContext(key,auth.isAdmin?true:null);if(auth.isAdmin)void controller.load();return controller.cancel;},[controller,key,auth.isAdmin]));
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),counts=state.key===key?state.page?.items[0]:undefined;
 const principal=w.principalAgency;
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={state.key===key&&state.refreshing} enabled={auth.isAdmin} onRefresh={()=>void controller.refresh()} tintColor={colors.primary}/>}>
  <PageTitle compact title="Administración" subtitle="Publicaciones, comunidad y gestiones." back fallback="/profile"/>
  {!auth.isAdmin?<EmptyState plain title="Acceso reservado" description="Inicia sesión con una cuenta administradora."/>:<>
   <View style={s.identity}><Icon name="shield-checkmark-outline" color={colors.muted} size={22}/><View style={s.copy}><Text style={s.title}>{auth.isOwner?'Cuenta propietaria de KarmaHouse':'Cuenta administradora'}</Text><Text style={s.description}>{auth.isOwner?'Acceso a moderación y gestión de permisos.':'Acceso a revisión de publicaciones y reportes.'}</Text></View></View>
   {auth.isOwner&&principal&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir inmobiliaria principal" onPress={()=>router.push({pathname:'/agency-workspace',params:{agencyId:principal!.id}})} style={s.principal}><View style={s.copy}><Text style={s.title}>{principal.tradeName}</Text><AgencyVerifiedBadge verified={principal.verified} principal={principal.isPrincipal} agencyName={principal.tradeName} labelled/><Text style={s.description}>Espacio comercial de la inmobiliaria principal.</Text></View><Icon name="chevron-forward" color={colors.amber}/></Pressable>}
   {state.error&&<Notice error onRetry={()=>void controller.refresh()}>No pudimos consultar los pendientes.</Notice>}
   {[
    {title:'Publicaciones',items:entries.slice(0,2)},
    {title:'Comunidad',items:entries.slice(2,5)},
    {title:'Gestiones',items:entries.slice(5,6)},
    {title:'Cuenta oficial',items:entries.slice(6)},
   ].map(group=>{const visible=group.items.filter(entry=>!entry.owner||auth.isOwner);return visible.length?<View key={group.title} style={s.group}><Text accessibilityRole="header" style={s.groupTitle}>{group.title}</Text><View style={s.rows}>{visible.map(entry=>{const count=counts&&entry.count?counts[entry.count]:null;return <Pressable key={entry.path} accessibilityRole="button" accessibilityLabel={`${entry.title}${count===null||count===undefined?'':`, ${count} pendientes`}`} onPress={()=>router.push(entry.path)} style={({pressed})=>[s.row,pressed&&{opacity:.7}]}><Icon name={entry.icon} size={22} color={colors.muted}/><View style={s.copy}><Text style={s.title}>{entry.title}</Text><Text style={s.description}>{entry.description}</Text></View>{count!==null&&count!==undefined&&<Text style={[s.count,count>0&&s.pending]}>{count}</Text>}<Icon name="chevron-forward" size={17} color={colors.muted}/></Pressable>;})}</View></View>:null;})}
  </>}
 </ScrollView></SafeAreaView>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center',paddingHorizontal:internalLayout.gutter,gap:20,paddingBottom:32},identity:{paddingBottom:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border,flexDirection:'row',gap:12,alignItems:'flex-start'},principal:{backgroundColor:colors.surface,padding:16,borderRadius:16,borderWidth:1,borderColor:colors.border,flexDirection:'row',gap:12,alignItems:'center'},copy:{flex:1,minWidth:0,gap:5},title:{color:colors.ink,fontSize:16,lineHeight:23,fontWeight:'600'},description:{color:colors.muted,fontSize:13,lineHeight:20},group:{gap:10},groupTitle:{color:colors.muted,fontSize:13,lineHeight:20,fontWeight:'600'},rows:{borderRadius:16,borderWidth:1,borderColor:colors.border,overflow:'hidden',backgroundColor:colors.surface},row:{minHeight:76,padding:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},count:{fontSize:13,color:colors.muted,backgroundColor:colors.paper,paddingHorizontal:9,paddingVertical:5,borderRadius:8,fontWeight:'600'},pending:{color:colors.amber,backgroundColor:colors.softAmber}}));
