import {router,useLocalSearchParams,useFocusEffect} from 'expo-router';import {useCallback} from 'react';import {ActivityIndicator,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';import {SafeAreaView} from 'react-native-safe-area-context';import {Button,EmptyState,Notice,PageTitle} from '../components/ui';import {TransferRequestCard} from '../components/transfers/TransferRequestCard';import {useListingTransfers} from '../transfers/useListingTransfers';import {fixtureTransfer} from '../transfers/fixtures';import {createThemedStyles,internalLayout} from '../theme';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
import {AccountPrompt} from '../components/AccountPrompt';
export default function ListingTransfersScreen(){
  const { styles: s, colors } = useStyles();const params=useLocalSearchParams<{scope?:string}>(),scope=params.scope==='outgoing'?'outgoing':'incoming',transfers=useListingTransfers(scope),demo=!transfers.controller;
 const reload=useConsultationRefresh(`${transfers.auth.user?.id}:${transfers.auth.session?.access_token}:${scope}`,transfers.refresh,demo||!transfers.auth.user||transfers.state.loading||transfers.state.busy);
 useFocusEffect(useCallback(()=>{if(transfers.auth.user)void transfers.controller?.refresh(scope);},[transfers.controller,transfers.auth.user?.id,scope]));
 const items=demo?[fixtureTransfer]:transfers.state.items;
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!demo&&!transfers.state.busy} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle compact title={scope==='outgoing'?'Solicitudes enviadas':'Anuncios por aceptar'} subtitle={scope==='outgoing'?'Anuncios que la cuenta oficial ha ofrecido.':'Revisa la cuenta y las fichas antes de decidir.'} back fallback={scope==='outgoing'?'/assisted-listings':'/my-listings'}/>
 {demo&&<Notice>Demostración con una solicitud sintética. Aceptar, rechazar y cancelar requieren una cuenta y el servidor configurado.</Notice>}
 {!demo&&!transfers.auth.user?<AccountPrompt returnTo="/listing-transfers" title="Anuncios por aceptar" description="Inicia sesión para ver los anuncios que te ofrecen. Solo los ven quienes participan."/>:<>
 {transfers.state.error&&<Notice error onRetry={()=>void reload.refresh()}>{transfers.state.error}</Notice>}
 {transfers.state.loading&&!items.length&&<ActivityIndicator accessibilityLabel="Cargando solicitudes" color={colors.primary} style={s.loader}/>}
 {!!items.length&&<><Text style={s.meta}>{items.length} {items.length===1?'solicitud':'solicitudes'}</Text><View style={s.list}>{items.map(request=><TransferRequestCard key={request.id} request={request} onPress={()=>router.push(`/listing-transfer/${request.id}`)}/>)}</View></>}
 {!items.length&&!transfers.state.loading&&!transfers.state.error&&<EmptyState plain title="Sin solicitudes" description={scope==='outgoing'?'Todavía no has enviado solicitudes de gestión.':'No tienes lotes de anuncios por aceptar.'}/>}
 </>}
 </ScrollView></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:internalLayout.maxWidth,alignSelf:'center',paddingHorizontal:internalLayout.gutter,gap:16,paddingBottom:32},meta:{color:colors.muted,fontSize:14,lineHeight:21},list:{backgroundColor:colors.surface,borderRadius:16,borderWidth:1,borderColor:colors.border,overflow:'hidden'},loader:{paddingVertical:32}}));
