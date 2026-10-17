import {AgencyShareActions} from '../components/agencies/AgencyShareButton';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {isAgencyReadAccessFailure} from '../agencies/messaging/live';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/useAgencyWorkspace';
import {agencyPropertyRepository as repository} from '../agencies/properties/client';
import type {AgencyProperty} from '../agencies/properties/types';
import {filterPortfolio,shownReference} from '../agencies/properties/portfolio';
import {agencyError} from '../agencies/domain';
import {ActionGroup,Button,EmptyState,Icon,Notice,PageTitle,Pill} from '../components/ui';
import {PropertyImage} from '../components/PropertyImage';
import {ListingStateChip} from '../components/ListingStateChip';
import {listingBoardLabels,listingBoardState,type ListingBoardState} from '../domain/listings';
import {priceSuffix} from '../domain/operations';
import {createThemedStyles,formatMoney,internalLayout,rounded,typography} from '../theme';
import {bumpErrorMessage,canBumpNow,formatProDate,isProActive,nextBumpAt} from '../pro/domain';
import {usePro} from '../pro/usePro';
// ponytail: the whole portfolio is loaded so search and filters see every listing; past this many, «Cargar más» pages on.
const LOAD_ALL_LIMIT=300;
export default function AgencyPortfolioScreen(){const a=useAuth(),w=useAgencyWorkspace();return <Portfolio key={`${a.user?.id}:${w.activeAgencyId}:${w.generation}:${a.suspended}:${Boolean(a.session)}`}/>}
function Portfolio(){
 const w=useAgencyWorkspace(),auth=useAuth(),{styles:s,colors}=useStyles();
 const [items,setItems]=useState<AgencyProperty[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[issue,setIssue]=useState('');
 const [query,setQuery]=useState(''),[state,setState]=useState<'all'|ListingBoardState>('all'),[origin,setOrigin]=useState<'all'|'own'|'authorized'>('all');
 const pro=usePro(),[bumping,setBumping]=useState(''),[bumpIssue,setBumpIssue]=useState<{id:string;message:string}|null>(null),bumpLock=useRef(false);
 const agencyPro=isProActive(pro.status?.agencies.find(agency=>agency.id===w.activeAgencyId)?.until);
 // Patched in place so the loaded pages stay; the error belongs to its own card, not to the pull-to-refresh notice.
 async function bump(item:AgencyProperty){
  if(!pro.repository||bumpLock.current)return;const id=item.property.id;bumpLock.current=true;setBumping(id);setBumpIssue(null);
  try{const done=await pro.repository.bump(id);setItems(old=>old.map(x=>x.property.id===id?{...x,property:{...x.property,bumpedAt:done.bumpedAt}}:x));}
  catch(e){setBumpIssue({id,message:bumpErrorMessage(e,item.property)});if(String((e as {message?:unknown}|null)?.message).includes('KH_PRO_REQUIRED'))void pro.reload();}
  finally{bumpLock.current=false;setBumping('');}
 }
 const focused=useRef(false),sequence=useRef(0),itemsRef=useRef(items);itemsRef.current=items;
 const allowed=w.ready&&!!w.activeAgency&&Boolean(w.membership&&auth.session&&!auth.suspended);
 const load=useCallback(async(append=false)=>{
  if(!repository||!allowed)return;const seq=++sequence.current;let c:ReturnType<typeof w.captureAgencyReadContext>|undefined;
  const checkpoint=()=>{c?.checkpoint();if(!focused.current||sequence.current!==seq)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  setBusy(true);setIssue('');
  try{
   c=w.captureAgencyReadContext();
   let next=append?itemsRef.current:[],hasMore=true;
   do{const page=await repository.list(next.length,c);checkpoint();const seen=new Set(next.map(x=>x.property.id));next=[...next,...page.items.filter(x=>!seen.has(x.property.id))];hasMore=page.hasMore;if(!page.items.length)break;}
   while(hasMore&&next.length<(append?itemsRef.current.length+LOAD_ALL_LIMIT:LOAD_ALL_LIMIT));
   setItems(next);setMore(hasMore);
  }
  catch(e){try{checkpoint();if(!c||isAgencyReadAccessFailure(e)){setItems([]);setMore(false);}setIssue(agencyError(e))}catch{}}
  finally{try{checkpoint();setBusy(false)}catch{}c?.release()}
 },[allowed,w.captureAgencyReadContext]);
 const reload=useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}:${w.activeAgencyId}:${w.generation}`,()=>Promise.all([load(),pro.reload()]),busy||!allowed);
 useFocusEffect(useCallback(()=>{focused.current=true;setItems([]);setIssue('');setBusy(false);void load();return()=>{focused.current=false;sequence.current++}},[load]));
 const own=(item:AgencyProperty)=>item.originAgencyId===w.activeAgencyId;
 const states=(Object.keys(listingBoardLabels) as ListingBoardState[]).filter(value=>items.some(item=>listingBoardState(item.property)===value));
 const mixedOrigins=items.some(own)&&items.some(item=>!own(item));
 const visible=filterPortfolio(items,{query,state,origin},w.activeAgencyId);
 const filtered=state!=='all'||origin!=='all'||!!query.trim();
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={allowed&&!busy} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle compact title="Cartera" subtitle={w.activeAgency?.tradeName??'Elige una inmobiliaria para consultar su cartera.'} back fallback="/agency-workspace"/>
 {!allowed?<Notice>Selecciona una inmobiliaria aprobada con una membresía activa para consultar su cartera.</Notice>:<>
 {!w.enabled&&<Notice>Solo lectura: las operaciones de la inmobiliaria están en pausa.</Notice>}
 {Boolean(issue)&&<Notice error onRetry={()=>void reload.refresh()}>{issue}</Notice>}
 {w.membership?.role==='admin'&&<ActionGroup direction="vertical">{w.enabled&&w.activeAgency?.state==='approved'&&<Button label="Añadir vivienda en venta" icon="add" onPress={()=>router.push('/agency-property/new')}/>}<Button label="Autorizaciones y cambios" secondary onPress={()=>router.push('/agency-property-requests')}/></ActionGroup>}
 {items.length>0&&<View style={s.filters}>
  <View style={s.search}><Icon name="search-outline" size={18} color={colors.muted}/><TextInput accessibilityLabel="Buscar en la cartera" value={query} onChangeText={setQuery} placeholder="Buscar por título, zona o referencia" placeholderTextColor={colors.muted} autoCorrect={false} returnKeyType="search" style={s.searchInput}/>{query?<Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={10} onPress={()=>setQuery('')}><Icon name="close-circle" size={18} color={colors.muted}/></Pressable>:null}</View>
  {states.length>1&&<View style={s.pills}><Pill label="Todas" active={state==='all'} onPress={()=>setState('all')}/>{states.map(value=><Pill key={value} label={listingBoardLabels[value]} active={state===value} onPress={()=>setState(value)}/>)}</View>}
  {mixedOrigins&&<View style={s.pills}><Pill label="Todo origen" active={origin==='all'} onPress={()=>setOrigin('all')}/><Pill label="Propias" active={origin==='own'} onPress={()=>setOrigin('own')}/><Pill label="Autorizadas" active={origin==='authorized'} onPress={()=>setOrigin('authorized')}/></View>}
 </View>}
 {busy&&!items.length&&<ActivityIndicator accessibilityLabel="Consultando cartera" color={colors.primary}/>}
 {!busy&&!issue&&!items.length&&<EmptyState plain title="Sin viviendas en cartera" description="Esta inmobiliaria todavía no tiene viviendas propias ni autorizadas."/>}
 {items.length>0&&<Text accessibilityLiveRegion="polite" style={s.count}>{filtered?`${visible.length} de ${items.length} viviendas`:`${items.length} ${items.length===1?'vivienda':'viviendas'}`}{busy?' · actualizando…':''}</Text>}
 {items.length>0&&!visible.length&&<EmptyState plain title="Nada coincide" description="Prueba con otra búsqueda o quita los filtros." action={<Button secondary label="Quitar filtros" onPress={()=>{setQuery('');setState('all');setOrigin('all');}}/>}/>}
 {visible.length>0&&<Text style={s.hint}>Al compartir una vivienda, quien abra el enlace te escribe a ti dentro de la inmobiliaria.</Text>}
 {visible.map(item=>{
  const p=item.property,state=listingBoardState(p),reference=shownReference(item.mandate.reference),mine=own(item);
  // The server lets any active member of the origin agency bump with agency Pro, so the gate follows the origin.
  const bumpable=w.enabled&&agencyPro&&mine&&state==='live';
  return <View key={p.id} style={s.card}>
   <Pressable accessibilityRole="button" accessibilityLabel={`${p.title}. ${listingBoardLabels[state]}. ${mine?'Propia':'Autorizada'}. ${formatMoney(p.price)} USD${priceSuffix(p)}. ${p.location}. Abrir vivienda`} onPress={()=>router.push({pathname:'/agency-property/[id]',params:{id:p.id}})} style={({pressed})=>[s.overview,pressed&&{opacity:.7}]}>
    <PropertyImage listing={p} variant="thumb" style={s.image}/>
    <View style={s.details}>
     <View style={s.chips}><ListingStateChip state={state}/><Text style={s.origin}>{mine?'Propia':'Autorizada'}</Text></View>
     <Text style={s.title} numberOfLines={2}>{p.title}</Text>
     <Text style={s.price}>{formatMoney(p.price)} <Text style={s.currency}>{`USD${priceSuffix(p)}`}</Text></Text>
     <Text style={s.location} numberOfLines={1}>{p.location}</Text>
     {!!reference&&<Text style={s.reference} numberOfLines={1}>{`Ref. ${reference}`}</Text>}
    </View>
    <Icon name="chevron-forward" size={16} color={colors.muted}/>
   </Pressable>
   <AgencyShareActions propertyId={p.id} title={p.title} shareable={state==='live'}>
    <Button secondary label="Interesados" icon="people-outline" style={s.action} onPress={()=>router.push({pathname:'/agency-deals',params:{propertyId:p.id}})}/>
    {bumpable&&canBumpNow(p)&&<Button secondary label="Subir anuncio" icon="arrow-up-outline" style={s.action} loading={bumping===p.id} disabled={!!bumping||busy} onPress={()=>void bump(item)}/>}
   </AgencyShareActions>
   {bumpable&&!canBumpNow(p)&&<Text style={s.note}>{`Podrás subirlo el ${formatProDate(nextBumpAt(p))}.`}</Text>}
   {bumpIssue?.id===p.id&&<Notice error>{bumpIssue.message}</Notice>}
  </View>;
 })}
 {more&&<Button label="Cargar más viviendas" secondary disabled={busy} onPress={()=>void load(true)}/>}
 </>}</ScrollView></SafeAreaView>;
}
const useStyles=createThemedStyles(colors=>StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.paper},
 content:{width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center',paddingHorizontal:16,paddingBottom:32,gap:14},
 filters:{gap:10},
 search:{flexDirection:'row',alignItems:'center',gap:10,minHeight:52,paddingHorizontal:16,borderRadius:rounded.pill,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
 searchInput:{flex:1,minWidth:0,minHeight:46,color:colors.ink,fontSize:16},
 pills:{flexDirection:'row',flexWrap:'wrap',gap:8},
 count:{color:colors.muted,fontSize:13,marginLeft:4,marginBottom:-4,fontVariant:['tabular-nums']},
 hint:{color:colors.muted,fontSize:13,lineHeight:19,marginLeft:4},
 card:{backgroundColor:colors.surface,padding:12,borderRadius:rounded.card,borderWidth:1,borderColor:colors.border},
 overview:{flexDirection:'row',gap:12,alignItems:'center',borderRadius:rounded.inner},
 image:{width:74,height:86,borderTopLeftRadius:37,borderTopRightRadius:37,borderBottomLeftRadius:14,borderBottomRightRadius:14},
 details:{flex:1,minWidth:0,gap:4},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:6,alignItems:'center'},
 origin:{color:colors.body,fontSize:11,lineHeight:14,fontWeight:'700',paddingVertical:4,paddingHorizontal:9,borderRadius:rounded.pill,backgroundColor:colors.softNeutral,overflow:'hidden'},
 title:{...typography.cardTitle,color:colors.ink},
 price:{color:colors.primary,fontSize:15,fontWeight:'700'},
 currency:{color:colors.muted,fontSize:12,fontWeight:'400'},
 location:{fontSize:13,color:colors.muted,lineHeight:18},
 reference:{fontSize:12,color:colors.muted,lineHeight:16,fontVariant:['tabular-nums']},
 action:{minHeight:44},
 note:{color:colors.muted,fontSize:13,lineHeight:19,marginTop:10},
}));
