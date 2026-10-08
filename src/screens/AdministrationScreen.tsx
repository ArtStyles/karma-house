import {router} from 'expo-router';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {EmptyState,Icon,PageTitle,type IconName} from '../components/ui';
const entries: {title:string;description:string;icon:IconName;path:'/admin'|'/admin-accounts'|'/admin-listings'|'/message-reports'|'/property-reports'|'/admin-history'}[]=[
  {title:'Revisar anuncios',description:'Aprobar publicaciones y solicitar cambios.',icon:'checkmark-circle-outline',path:'/admin'},
  {title:'Anuncios',description:'Consultar el catálogo y retirar contenido.',icon:'home-outline',path:'/admin-listings'},
  {title:'Cuentas',description:'Consultar usuarios, permisos y suspensiones.',icon:'people-outline',path:'/admin-accounts'},
  {title:'Reportes de anuncios',description:'Atender incidencias de las publicaciones.',icon:'flag-outline',path:'/property-reports'},
  {title:'Reportes de mensajes',description:'Revisar las conversaciones denunciadas.',icon:'chatbubbles-outline',path:'/message-reports'},
  {title:'Historial',description:'Consultar las gestiones y sus motivos.',icon:'time-outline',path:'/admin-history'},
];
import {createThemedStyles} from '../theme';
export default function AdministrationScreen(){
  const { colors, styles: s } = useStyles();
  const {isAdmin,isOwner}=useAuth();
  return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={s.content}>
    <PageTitle title="Administración" subtitle="Cuida la comunidad de KarmaHouse." back />
    {!isAdmin?<EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Inicia sesión con una cuenta administradora."/>:<>
      <View style={s.banner}><Icon name="shield-checkmark-outline" size={27} color={colors.primary}/><View style={s.copy}><Text style={s.title}>{isOwner?'Propietario de KarmaHouse':'Administración de KarmaHouse'}</Text><Text style={s.description}>{isOwner?'Tus anuncios se publican directamente. Desde aquí gestionas la comunidad y los permisos.':'Revisa anuncios y reportes. Los permisos y las suspensiones los gestiona el propietario.'}</Text></View></View>
      <View style={s.cards}>{entries.map(entry=><Pressable key={entry.path} accessibilityRole="button" accessibilityLabel={entry.title} onPress={()=>router.push(entry.path)} style={({pressed})=>[s.card,pressed&&{opacity:.7}]}>
        <View style={s.icon}><Icon name={entry.icon} size={23} color={colors.primary}/></View><View style={s.copy}><Text style={s.title}>{entry.title}</Text><Text style={s.description}>{entry.description}</Text></View><Icon name="chevron-forward" size={19} color={colors.muted}/>
      </Pressable>)}</View>
      {isOwner&&<Pressable accessibilityRole="button" accessibilityLabel="Revisar inmobiliarias" onPress={()=>router.push('/agency-reviews')} style={s.card}><View style={s.icon}><Icon name="business-outline" size={23} color={colors.primary}/></View><View style={s.copy}><Text style={s.title}>Inmobiliarias</Text><Text style={s.description}>Aprobar solicitudes y conceder o retirar la verificación empresarial.</Text></View><Icon name="chevron-forward" size={19} color={colors.muted}/></Pressable>}
      {isOwner&&<Pressable accessibilityRole="button" accessibilityLabel="Publicación asistida" onPress={()=>router.push('/assisted-listings')} style={s.card}><View style={s.icon}><Icon name="swap-horizontal-outline" size={23} color={colors.primary}/></View><View style={s.copy}><Text style={s.title}>Publicación asistida</Text><Text style={s.description}>Preparar material autorizado y ofrecer su gestión a la cuenta vinculada.</Text></View><Icon name="chevron-forward" size={19} color={colors.muted}/></Pressable>}
    </>}
  </ScrollView></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:800,alignSelf:'center',padding:20,gap:20,paddingBottom:36},banner:{backgroundColor:colors.softBlue,padding:20,borderRadius:24,flexDirection:'row',gap:14,alignItems:'center'},copy:{flex:1,minWidth:0,gap:5},title:{color:colors.ink,fontSize:17,fontWeight:'600'},description:{color:colors.muted,fontSize:14,lineHeight:21},cards:{gap:12},card:{backgroundColor:colors.surface,padding:18,borderRadius:20,flexDirection:'row',alignItems:'center',gap:14,minHeight:96},icon:{backgroundColor:colors.paper,width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center'}}));
