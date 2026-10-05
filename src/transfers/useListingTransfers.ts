import {useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';import AsyncStorage from '@react-native-async-storage/async-storage';import {randomUUID} from 'expo-crypto';import {useAuth} from '../auth/AuthProvider';import {supabase} from '../lib/supabase';import {createListingTransferController,type TransferControllerState} from './controller';import {createListingTransferRepository} from './repository';
const empty:TransferControllerState={userId:null,items:[],opened:null,busy:false,loading:false,error:null};
export function useListingTransfers(scope:'incoming'|'outgoing'='incoming'){
 const auth=useAuth(),identityKey=`${auth.user?.id??''}:${auth.session?.access_token??''}`,activated=useRef('');
 const controller=useMemo(()=>supabase?createListingTransferController(createListingTransferRepository(supabase),AsyncStorage,randomUUID):null,[]);
 const state=useSyncExternalStore(controller?.subscribe??(()=>()=>{}),controller?.getState??(()=>empty),()=>empty);
 useLayoutEffect(()=>{activated.current=identityKey;controller?.activate(auth.user&&auth.session?{userId:auth.user.id,accessToken:auth.session.access_token}:null);return()=>controller?.reset();},[identityKey,controller]);
 useEffect(()=>{if(auth.user&&controller)void controller.refresh(scope);},[identityKey,scope,controller]);
 return {state:activated.current===identityKey&&state.userId===auth.user?.id?state:empty,controller,auth,refresh:()=>controller?.refresh(scope)??Promise.resolve()};
}
