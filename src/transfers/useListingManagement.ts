import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';import {AppState} from 'react-native';import {useFocusEffect} from 'expo-router';import {useAuth} from '../auth/AuthProvider';import {supabase} from '../lib/supabase';import {isUuid} from '../messaging/domain';import {listingManagementEvents} from '../state/listingManagementEvents';
export interface ListingManagement {propertyId:string;managerId:string;assistedByKarmaHouse:boolean;contactAvailable:boolean;canEditPersonal:boolean}
export function useListingManagement(id:string|undefined){
 const auth=useAuth(),generation=useSyncExternalStore(listingManagementEvents.subscribe,listingManagementEvents.getSnapshot,listingManagementEvents.getSnapshot);
 const scope=`${id??''}:${auth.user?.id??''}:${auth.session?.access_token??''}:${generation}`,latest=useRef(scope);latest.current=scope;
 const [state,setState]=useState<{scope:string;value:ListingManagement|null;error:string|null;ready:boolean}>({scope:'',value:null,error:null,ready:false});
 const controllers=useRef(new Set<AbortController>());useEffect(()=>()=>{controllers.current.forEach(x=>x.abort());},[]);
 const refresh=useCallback(async():Promise<ListingManagement|null>=>{
  if(!supabase||!id)return null;const captured=scope,controller=new AbortController();controllers.current.add(controller);
  const checkpoint=()=>{if(controller.signal.aborted||latest.current!==captured)throw Error('KH_ACCOUNT_CHANGED');};
  try{checkpoint();let query=supabase.rpc('kh_get_listing_management',{p_property_id:id}).abortSignal(controller.signal);if(auth.session?.access_token)query=query.setHeader('Authorization',`Bearer ${auth.session.access_token}`);const {data,error}=await query;checkpoint();if(error)throw error;
   if(data!==null&&(!isUuid(data?.propertyId)||data.propertyId!==id||!isUuid(data.managerId)||typeof data.assistedByKarmaHouse!=='boolean'||typeof data.contactAvailable!=='boolean'))throw Error('KH_MANAGEMENT_INVALID');
   if(data!==null&&data.canEditPersonal!==undefined&&typeof data.canEditPersonal!=='boolean')throw Error('KH_MANAGEMENT_INVALID');
   const value=data===null?null:{...data,canEditPersonal:data.canEditPersonal===true};setState({scope:captured,value,error:null,ready:true});return value;
  }catch(error){checkpoint();setState({scope:captured,value:null,error:'No se pudo confirmar el responsable vigente. Comprueba la conexión.',ready:true});throw error;}finally{controllers.current.delete(controller);}
 },[scope,id,auth.session?.access_token]);
 useFocusEffect(useCallback(()=>{void refresh().catch(()=>{});const sub=AppState.addEventListener('change',next=>{if(next==='active')void refresh().catch(()=>{});});return()=>{sub.remove();controllers.current.forEach(x=>x.abort());};},[refresh]));
 return {...(state.scope===scope?state:{value:null,error:null,ready:!supabase}),refresh};
}
