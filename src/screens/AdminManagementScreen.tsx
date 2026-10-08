import {PROVINCES} from '../domain/listingOptions';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {accountActions,actionLabel,adminError,eventLabel,roleLabel,type AccountAction,type AdminAccount,type AdminEvent,type AdminListing,type AdminSection} from '../admin/domain';
import {useAdminApi} from '../admin/useAdminApi';
import {decodeAdminHistoryActors,type AdminHistoryActor} from '../admin/queries';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options,type AdminFilter} from '../components/admin/AdminControls';
import {Button,EmptyState,Notice,PageTitle} from '../components/ui';
import {createThemedStyles} from '../theme';

type Selection = {actor:string;kind:'account';row:AdminAccount;action:AccountAction}|{actor:string;kind:'listing';row:AdminListing};
const titles:Record<AdminSection,string>={accounts:'Cuentas',listings:'Anuncios',history:'Historial'};
const moderationLabel:Record<string,string>={draft:'Borrador',pending:'En revisión',approved:'Aprobado',rejected:'Necesita cambios'};
const availabilityLabel:Record<string,string>={active:'Activo',paused:'En pausa',sold:'Cerrado'};

export default function AdminManagementScreen({section}:{section:AdminSection}) {
  const { colors, styles: s } = useStyles();
  const {user,session,isAdmin,isOwner}=useAuth(); const call=useAdminApi();
  const [search,setSearch]=useState(''),[filters,setFilters]=useState<Record<string,string>>({}),[sort,setSort]=useState<'newest'|'oldest'|'name'>('newest');
  const list=useAdminQuery(section,search,filters,sort),loading=list.loading;
  const data={items:list.items,hasMore:list.hasMore};
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const [selection,setSelection]=useState<Selection|null>(null);const [reason,setReason]=useState('');
  const scope=JSON.stringify([user?.id,session?.access_token,isAdmin,section,search,filters,sort]);
  const current=useRef(scope);current.current=scope;
  const saving=useRef(false);
  const selected=selection?.actor===user?.id && isAdmin?selection:null;
  const load=list.reload;
  const [actorOptions,setActorOptions]=useState<{scope:string;items:AdminHistoryActor[]}|null>(null);
  useFocusEffect(useCallback(()=>{
    if(section!=='history'||!isAdmin)return;
    let active=true;const controller=new AbortController();
    void call('kh_admin_history_actors',{},controller.signal).then(value=>{if(active)setActorOptions({scope:`${user?.id}:${session?.access_token}`,items:decodeAdminHistoryActors(value)});}).catch(()=>{});
    return()=>{active=false;controller.abort();};
  },[section,call,isAdmin,user?.id,session?.access_token]));
  useEffect(()=>{setSelection(null);setReason('');setError('');setSuccess('');setBusy(false);saving.current=false;},[user?.id,session?.access_token,isAdmin]);
  const fields:AdminFilter[]=section==='accounts'?[
    {key:'status',label:'Estado de la cuenta',options:options({active:'Activas',suspended:'Suspendidas'})},
    {key:'role',label:'Permiso',options:options({owner:'Propietario',admin:'Administración',member:'Miembro'})},
    {key:'link',label:'Vínculo',options:options({personal:'Personal',agency:'Inmobiliaria',assisted:'Publicación asistida'})},
  ]:section==='listings'?[
    {key:'moderation',label:'Revisión',options:options(moderationLabel)},
    {key:'availability',label:'Disponibilidad',options:options(availabilityLabel)},
    {key:'origin',label:'Origen',options:options({personal:'Personal',agency:'Inmobiliaria',assisted:'Asistido'})},
    {key:'operation',label:'Operación',options:options({sale:'Venta',rent:'Alquiler',swap:'Permuta',wanted:'Búsqueda'})},
    {key:'province',label:'Provincia',options:PROVINCES.map(value=>({value,label:value}))},
  ]:[{key:'actor',label:'Responsable de la gestión',options:actorOptions?.scope===`${user?.id}:${session?.access_token}`?actorOptions.items.map(actor=>({value:actor.id,label:actor.displayName})):[]},{key:'action',label:'Tipo de gestión',options:options({suspend:'Suspender cuenta',reactivate:'Reactivar cuenta',grant_admin:'Dar acceso',revoke_admin:'Quitar acceso',property_rejected_active:'Retirar anuncio activo',property_rejected_paused:'Retirar anuncio pausado',verify:'Verificar cuenta',unverify:'Retirar verificación',report_reviewed:'Revisar reporte',transfer_offered:'Ofrecer gestión',transfer_accepted:'Aceptar gestión',transfer_rejected:'Rechazar gestión'})},{key:'from',label:'Desde',kind:'date'},{key:'to',label:'Hasta',kind:'date'}];
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
  return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={isAdmin&&!busy} onRefresh={()=>{if(!busy)void list.refresh();}} tintColor={colors.primary}/> }>
    <PageTitle title={titles[section]} subtitle={section==='accounts'?'Personas y permisos de la comunidad.':section==='listings'?'Consulta y moderación de publicaciones.':'Registro de las gestiones administrativas.'} back fallback="/administration"/>
    {!isAdmin?<EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Esta sección requiere una cuenta administradora."/>:<>
      <AdminToolbar query={search} onSearch={setSearch} filters={filters} onFilters={setFilters} fields={fields} sort={sort} onSort={value=>setSort(value as typeof sort)} allowName={section!=='history'} disabled={busy}/>
      {success?<Notice>{success}</Notice>:null}{(error||list.error)&&!selected?<Notice error>{error||adminError(new Error(list.error!))}</Notice>:null}
      {loading&&list.total===null?<ActivityIndicator color={colors.primary} style={{padding:28}}/>:data.items.length===0&&!list.error?<EmptyState icon="search-outline" title="Sin resultados" description="No hay elementos que coincidan con esta búsqueda."/>:data.items.map(item=>{
        if(section==='accounts'){
          const row=item as AdminAccount;
          return <View key={row.id} style={s.card}><View style={s.row}><View style={s.initial}><Text style={s.initialText}>{row.displayName.slice(0,1).toUpperCase()}</Text></View><View style={s.copy}><Text style={s.title}>{row.displayName}</Text><Text style={s.meta}>{roleLabel[row.role]}</Text></View></View><AdminStatus label={row.suspended?'Suspendida':'Activa'} tone={row.suspended?'danger':'green'}/>
            {row.reason?<Notice error>{row.reason}</Notice>:null}
            {row.role==='owner'?<Text style={s.meta}>Cuenta propietaria protegida.</Text>:<View style={s.actions}>{accountActions(isOwner?'owner':'admin',row.role,row.suspended).map(action=><Button key={action} label={actionLabel[action]} secondary disabled={loading||busy} onPress={()=>choose({actor:user!.id,kind:'account',row,action})}/>)}</View>}
          </View>;
        }
        if(section==='listings'){
          const row=item as AdminListing;return <View key={row.id} style={s.card}><Text style={s.title}>{row.title}</Text><Text style={s.meta}>{row.ownerName} · {availabilityLabel[row.availability]}</Text><AdminStatus label={moderationLabel[row.moderation]} tone={row.moderation==='approved'?'green':row.moderation==='pending'?'amber':'neutral'}/><View style={s.actions}><Button label="Ver anuncio" secondary onPress={()=>router.push(`/property/${row.id}`)}/>{row.moderation==='approved'&&<Button label="Retirar anuncio" secondary disabled={loading||busy} onPress={()=>choose({actor:user!.id,kind:'listing',row})}/>}</View></View>;
        }
        const row=item as AdminEvent;return <View key={row.id} style={s.card}><Text style={s.title}>{eventLabel(row.action)}</Text><Text style={s.body}>{row.targetName}</Text><Text style={s.meta}>{row.actorName} · {new Date(row.createdAt).toLocaleString('es')}</Text>{row.reason?<Text style={s.body}>{row.reason}</Text>:null}</View>;
      })}
      <AdminPagination {...list} loading={loading||busy}/>
    </>}
  </ScrollView><Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>{if(!busy)setSelection(null);}}><View style={s.backdrop}><ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled"><View accessibilityViewIsModal style={s.modal}>
    <Text style={s.modalTitle}>{selected?.kind==='account'?actionLabel[selected.action]:'Retirar anuncio'}</Text><Text style={s.title}>{selected?.kind==='account'?selected.row.displayName:selected?.row.title}</Text>
    <Text style={s.body}>{selected?.kind==='listing'?'El anuncio dejará de aparecer en el catálogo. Su autor recibirá el motivo y podrá enviarlo de nuevo a revisión.':selected?.action==='suspend'?'Se bloquearán sus publicaciones y mensajes y se ocultarán sus anuncios. Podrás reactivarla después sin borrar sus datos.':selected?.action==='reactivate'?'La cuenta podrá volver a publicar y enviar mensajes. Se restaurarán los anuncios que no hayan cambiado durante la suspensión.':selected?.action==='grant_admin'?'Esta persona podrá revisar anuncios y reportes. Las suspensiones y los permisos seguirán reservados al propietario.':'Esta persona perderá el acceso a las gestiones administrativas.'}</Text>
    <TextInput accessibilityLabel="Motivo de la gestión" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Escribe el motivo (obligatorio)" placeholderTextColor={colors.muted} editable={!busy} style={[s.input,s.reason]}/>
    {error?<Notice error>{error}</Notice>:null}<Button label="Confirmar gestión" loading={busy} disabled={reason.trim().length<3} onPress={()=>void confirm()}/><Button label="Cancelar" secondary disabled={busy} onPress={()=>setSelection(null)}/>
  </View></ScrollView></View></Modal></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:820,alignSelf:'center',padding:20,paddingBottom:36,gap:14},search:{gap:10},input:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,minHeight:48,padding:14,fontSize:16,color:colors.ink},filters:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{padding:20,borderRadius:22,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,gap:12},title:{fontSize:18,fontWeight:'600',color:colors.ink},body:{fontSize:15,lineHeight:23,color:colors.ink},meta:{fontSize:14,lineHeight:21,color:colors.muted},row:{flexDirection:'row',gap:12,alignItems:'center'},copy:{flex:1,gap:5},initial:{width:46,height:46,borderRadius:23,backgroundColor:colors.softBlue,alignItems:'center',justifyContent:'center'},initialText:{fontSize:20,fontWeight:'600',color:colors.primary},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},pagination:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10},backdrop:{flex:1,backgroundColor:colors.photoOverlay},modalScroll:{flexGrow:1,justifyContent:'center',padding:20},modal:{width:'100%',maxWidth:480,alignSelf:'center',backgroundColor:colors.surface,borderRadius:26,padding:24,gap:16},modalTitle:{fontSize:24,fontWeight:'700',color:colors.ink},reason:{minHeight:112,textAlignVertical:'top',backgroundColor:colors.paper}}));
