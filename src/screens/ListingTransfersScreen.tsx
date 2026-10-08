import {router,useLocalSearchParams,useFocusEffect} from 'expo-router';import {useCallback} from 'react';import {RefreshControl,ScrollView,StyleSheet,View} from 'react-native';import {SafeAreaView} from 'react-native-safe-area-context';import {Button,EmptyState,Notice,PageTitle} from '../components/ui';import {TransferRequestCard} from '../components/transfers/TransferRequestCard';import {useListingTransfers} from '../transfers/useListingTransfers';import {fixtureTransfer} from '../transfers/fixtures';import {createThemedStyles} from '../theme';
import {useConsultationRefresh} from '../lib/useConsultationRefresh';
export default function ListingTransfersScreen(){
  const { styles: s, colors } = useStyles();const params=useLocalSearchParams<{scope?:string}>(),scope=params.scope==='outgoing'?'outgoing':'incoming',transfers=useListingTransfers(scope),demo=!transfers.controller;
 const reload=useConsultationRefresh(`${transfers.auth.user?.id}:${transfers.auth.session?.access_token}:${scope}`,transfers.refresh,demo||!transfers.auth.user||transfers.state.loading||transfers.state.busy);
 useFocusEffect(useCallback(()=>{if(transfers.auth.user)void transfers.controller?.refresh(scope);},[transfers.controller,transfers.auth.user?.id,scope]));
 const items=demo?[fixtureTransfer]:transfers.state.items;
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><ScrollView alwaysBounceVertical contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!demo&&!transfers.state.busy} onRefresh={()=>void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>}><PageTitle title={scope==='outgoing'?'Solicitudes enviadas':'Anuncios por aceptar'} subtitle={scope==='outgoing'?'Solo la cuenta principal oficial puede ofrecer su gestión.':'Revisa la cuenta y todas las fichas antes de decidir.'} back/>
 {demo&&<Notice>Demostración con una solicitud sintética. Aceptar, rechazar y cancelar requieren una cuenta y el servidor configurado.</Notice>}
 {!demo&&!transfers.auth.user?<EmptyState icon="log-in-outline" title="Inicia sesión" description="Las solicitudes solo son visibles para sus participantes." action={<Button label="Entrar a mi cuenta" onPress={()=>router.push({pathname:'/auth',params:{returnTo:'/listing-transfers'}})}/>}/>:<>
 {transfers.state.error&&<Notice error>{transfers.state.error} Desliza hacia abajo para reintentar.</Notice>}
 {items.map(request=><TransferRequestCard key={request.id} request={request} onPress={()=>router.push(`/listing-transfer/${request.id}`)}/>)}
 {!items.length&&!transfers.state.loading&&<EmptyState icon="swap-horizontal-outline" title="Sin solicitudes" description="Cuando la cuenta oficial ofrezca un lote a tu cuenta, podrás revisarlo aquí."/>}
 </>}
 </ScrollView></SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},content:{width:'100%',maxWidth:850,alignSelf:'center',padding:20,gap:20,paddingBottom:40}}));
