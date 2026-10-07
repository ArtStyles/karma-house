import {useFocusEffect,router} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {accountActions,actionLabel,adminError,decodeAdminPage,eventLabel,roleLabel,type AccountAction,type AdminAccount,type AdminEvent,type AdminListing,type AdminPage,type AdminSection} from '../admin/domain';
import {useAdminApi} from '../admin/useAdminApi';
import {Button,EmptyState,Notice,PageTitle,Pill} from '../components/ui';
import {createThemedStyles} from '../theme';

type Selection = {actor:string;kind:'account';row:AdminAccount;action:AccountAction}|{actor:string;kind:'listing';row:AdminListing};
const titles:Record<AdminSection,string>={accounts:'Cuentas',listings:'Anuncios',history:'Historial'};
const rpc:Record<AdminSection,string>={accounts:'kh_admin_accounts',listings:'kh_admin_listings',history:'kh_admin_history'};
const moderationLabel:Record<string,string>={draft:'Borrador',pending:'En revisión',approved:'Aprobado',rejected:'Necesita cambios'};
const availabilityLabel:Record<string,string>={active:'Activo',paused:'En pausa',sold:'Cerrado'};

export default function AdminManagementScreen({section}:{section:AdminSection}) {
  const { colors, styles: s } = useStyles();
  const {user,isAdmin,isOwner}=useAuth(); const call=useAdminApi();
  const [query,setQuery]=useState('');const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');const [offset,setOffset]=useState(0);
  const [snapshot,setSnapshot]=useState<{scope:string;page:AdminPage}|null>(null);
  const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const [selection,setSelection]=useState<Selection|null>(null);const [reason,setReason]=useState('');
  const scope=`${user?.id}:${isAdmin}:${section}:${search}:${status}:${offset}`;
  const current=useRef(scope);current.current=scope;
  const sequence=useRef(0);const saving=useRef(false);
  const data=snapshot?.scope===scope?snapshot.page:null;
  const selected=selection?.actor===user?.id && isAdmin?selection:null;
  const load=useCallback(async()=>{
    if(!isAdmin || !user) return;
    const seq=++sequence.current;setLoading(true);setError('');
    try {
      const result=await call(rpc[section],{p_offset:offset,...(section!=='history'?{p_query:search}:{}),...(section==='accounts'?{p_status:status}:{})});
      if(current.current===scope && seq===sequence.current) setSnapshot({scope,page:decodeAdminPage(section,result)});
    } catch(e){if(current.current===scope && seq===sequence.current)setError(adminError(e));}
    finally{if(current.current===scope && seq===sequence.current)setLoading(false);}
  },[call,scope,isAdmin,user?.id,section,offset,search,status]);
  useFocusEffect(useCallback(()=>{void load();return ()=>{sequence.current++;};},[load]));
  useEffect(()=>{setSelection(null);setReason('');setError('');setSuccess('');setSnapshot(null);setBusy(false);saving.current=false;},[user?.id,isAdmin]);
  function choose(next:Selection){setSelection(next);setReason('');setError('');setSuccess('');}
  async function confirm(){
    if(!selected || saving.current || reason.trim().length<3)return;
    const captured=scope;saving.current=true;setBusy(true);setError('');
    try{
      if(selected.kind==='account')await call('kh_admin_account_action',{p_user_id:selected.row.id,p_action:selected.action,p_reason:reason.trim(),p_expected_role:selected.row.role,p_expected_suspended:selected.row.suspended});
      else await call('kh_admin_unpublish',{p_property_id:selected.row.id,p_expected_version:selected.row.version,p_reason:reason.trim()});
      if(current.current!==captured)return;
      setSelection(null);setReason('');setSuccess('Gestión guardada.');await load();
    }catch(e){if(current.current===captured)setError(adminError(e));}
    finally{if(current.current===captured){saving.current=false;setBusy(false);}}
  }
  return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <PageTitle title={titles[section]} subtitle={section==='accounts'?'Personas y permisos de la comunidad.':section==='listings'?'Consulta y moderación de publicaciones.':'Registro de las gestiones administrativas.'} back fallback="/administration"/>
    {!isAdmin?<EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Esta sección requiere una cuenta administradora."/>:<>
      {section!=='history'&&<View style={s.search}><TextInput accessibilityLabel={section==='accounts'?'Buscar cuentas por nombre':'Buscar anuncios por título'} placeholder={section==='accounts'?'Buscar por nombre':'Buscar por título'} placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} maxLength={section==='accounts'?80:100} style={s.input} returnKeyType="search" onSubmitEditing={()=>{setOffset(0);setSearch(query.trim());}}/><Button label="Buscar" secondary onPress={()=>{setOffset(0);setSearch(query.trim());}}/></View>}
      {section==='accounts'&&<View style={s.filters}>{[['all','Todas'],['active','Activas'],['suspended','Suspendidas']].map(([value,label])=><Pill key={value} label={label} active={status===value} onPress={()=>{setStatus(value);setOffset(0);}}/>)}</View>}
      <Button label="Actualizar" secondary icon="refresh-outline" onPress={()=>void load()} loading={loading} disabled={busy}/>
      {success?<Notice>{success}</Notice>:null}{error&&!selected?<Notice error>{error}</Notice>:null}
      {loading&&!data?<ActivityIndicator color={colors.primary} style={{padding:28}}/>:data?.items.length===0?<EmptyState icon="search-outline" title="Sin resultados" description="No hay elementos que coincidan con esta búsqueda."/>:data?.items.map(item=>{
        if(section==='accounts'){
          const row=item as AdminAccount;
          return <View key={row.id} style={s.card}><View style={s.row}><View style={s.initial}><Text style={s.initialText}>{row.displayName.slice(0,1).toUpperCase()}</Text></View><View style={s.copy}><Text style={s.title}>{row.displayName}</Text><Text style={s.meta}>{roleLabel[row.role]} · {row.suspended?'Suspendida':'Activa'}</Text></View></View>
            {row.reason?<Notice error>{row.reason}</Notice>:null}
            {row.role==='owner'?<Text style={s.meta}>Cuenta propietaria protegida.</Text>:<View style={s.actions}>{accountActions(isOwner?'owner':'admin',row.role,row.suspended).map(action=><Button key={action} label={actionLabel[action]} secondary disabled={loading||busy} onPress={()=>choose({actor:user!.id,kind:'account',row,action})}/>)}</View>}
          </View>;
        }
        if(section==='listings'){
          const row=item as AdminListing;return <View key={row.id} style={s.card}><Text style={s.title}>{row.title}</Text><Text style={s.meta}>{row.ownerName}</Text><Text style={s.meta}>{moderationLabel[row.moderation]} · {availabilityLabel[row.availability]}</Text><View style={s.actions}><Button label="Ver anuncio" secondary onPress={()=>router.push(`/property/${row.id}`)}/>{row.moderation==='approved'&&<Button label="Retirar anuncio" secondary disabled={loading||busy} onPress={()=>choose({actor:user!.id,kind:'listing',row})}/>}</View></View>;
        }
        const row=item as AdminEvent;return <View key={row.id} style={s.card}><Text style={s.title}>{eventLabel(row.action)}</Text><Text style={s.body}>{row.targetName}</Text><Text style={s.meta}>{row.actorName} · {new Date(row.createdAt).toLocaleString('es')}</Text>{row.reason?<Text style={s.body}>{row.reason}</Text>:null}</View>;
      })}
      {data&&<View style={s.pagination}><Button label="Anterior" secondary disabled={loading||offset===0} onPress={()=>setOffset(Math.max(0,offset-50))}/><Text style={s.meta}>Página {offset/50+1}</Text><Button label="Siguiente" secondary disabled={loading||!data.hasMore} onPress={()=>setOffset(offset+50)}/></View>}
    </>}
  </ScrollView><Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>{if(!busy)setSelection(null);}}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled"><View accessibilityViewIsModal style={s.modal}>
    <Text style={s.modalTitle}>{selected?.kind==='account'?actionLabel[selected.action]:'Retirar anuncio'}</Text><Text style={s.title}>{selected?.kind==='account'?selected.row.displayName:selected?.row.title}</Text>
    <Text style={s.body}>{selected?.kind==='listing'?'El anuncio dejará de aparecer en el catálogo. Su autor recibirá el motivo y podrá enviarlo de nuevo a revisión.':selected?.action==='suspend'?'Se bloquearán sus publicaciones y mensajes y se ocultarán sus anuncios. Podrás reactivarla después sin borrar sus datos.':selected?.action==='reactivate'?'La cuenta podrá volver a publicar y enviar mensajes. Se restaurarán los anuncios que no hayan cambiado durante la suspensión.':selected?.action==='grant_admin'?'Esta persona podrá revisar anuncios y reportes. Las suspensiones y los permisos seguirán reservados al propietario.':'Esta persona perderá el acceso a las gestiones administrativas.'}</Text>
    <TextInput accessibilityLabel="Motivo de la gestión" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Escribe el motivo (obligatorio)" placeholderTextColor={colors.muted} editable={!busy} style={[s.input,s.reason]}/>
    {error?<Notice error>{error}</Notice>:null}<Button label="Confirmar gestión" loading={busy} disabled={reason.trim().length<3} onPress={()=>void confirm()}/><Button label="Cancelar" secondary disabled={busy} onPress={()=>setSelection(null)}/>
  </View></ScrollView></View></Modal></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:820,alignSelf:'center',padding:20,paddingBottom:36,gap:14},search:{gap:10},input:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,minHeight:48,padding:14,fontSize:16,color:colors.ink},filters:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{padding:20,borderRadius:22,backgroundColor:colors.surface,gap:12},title:{fontSize:18,fontWeight:'600',color:colors.ink},body:{fontSize:15,lineHeight:23,color:colors.ink},meta:{fontSize:14,lineHeight:21,color:colors.muted},row:{flexDirection:'row',gap:12,alignItems:'center'},copy:{flex:1,gap:5},initial:{width:46,height:46,borderRadius:23,backgroundColor:colors.softBlue,alignItems:'center',justifyContent:'center'},initialText:{fontSize:20,fontWeight:'600',color:colors.primary},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},pagination:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10},backdrop:{flex:1,backgroundColor:colors.photoOverlay},modalScroll:{flexGrow:1,justifyContent:'center',padding:20},modal:{width:'100%',maxWidth:480,alignSelf:'center',backgroundColor:colors.surface,borderRadius:26,padding:24,gap:16},modalTitle:{fontSize:24,fontWeight:'700',color:colors.ink},reason:{minHeight:112,textAlignVertical:'top',backgroundColor:colors.paper}}));
