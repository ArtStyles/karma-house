import {useCallback,useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {useFocusEffect} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {createAdminQueryController} from './queryController';
import {ADMIN_PAGE_SIZE,buildAdminQueryArgs,decodeAdminQueryPage,type AdminQueryInput,type AdminQuerySection} from './queries';
import {useAdminApi} from './useAdminApi';

export function useAdminQuery(section:AdminQuerySection,query='',filters:Record<string,string>={},sort:AdminQueryInput['sort']='newest',enabled=true,transform?:(items:unknown[],signal:AbortSignal)=>Promise<unknown[]>) {
  const auth=useAuth(),rpc=useAdminApi(),rpcRef=useRef(rpc);rpcRef.current=rpc;
  const transformRef=useRef(transform);transformRef.current=transform;
  const controller=useMemo(()=>createAdminQueryController<AdminQueryInput,unknown>(async(input,offset,signal)=>{
    const capturedRpc=rpcRef.current,capturedTransform=transformRef.current;
    const page=decodeAdminQueryPage(input.section,await capturedRpc('kh_admin_query',buildAdminQueryArgs({...input,offset}),signal));
    return {...page,items:capturedTransform?await capturedTransform(page.items,signal):page.items};
  }),[]);
  const filterKey=JSON.stringify(Object.entries(filters).sort(([a],[b])=>a.localeCompare(b)));
  const input=useMemo(()=>({section,query,filters,sort}),[section,query,filterKey,sort]);
  const key=JSON.stringify([auth.session?.user.id,auth.session?.access_token,auth.isAdmin,enabled,section,query,filterKey,sort]);
  const allowed=enabled&&auth.isAdmin&&!!auth.session;
  useEffect(()=>{controller.setContext(key,allowed?input:null);},[controller,key,allowed,input]);
  useFocusEffect(useCallback(()=>{controller.setContext(key,allowed?input:null);if(allowed)void controller.load();return controller.cancel;},[controller,key,allowed,input]));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const valid=state.key===key;
  return {
    items:valid?(state.page?.items??[]):[],total:valid?(state.page?.total??null):null,
    offset:valid?state.offset:0,hasMore:valid?!!state.page?.hasMore:false,
    loading:valid?state.loading:allowed,refreshing:valid&&state.refreshing,error:valid?state.error:null,
    refresh:controller.refresh,reload:()=>controller.load(controller.getSnapshot().offset),
    next:()=>controller.load(controller.getSnapshot().offset+ADMIN_PAGE_SIZE),previous:()=>controller.load(Math.max(0,controller.getSnapshot().offset-ADMIN_PAGE_SIZE)),
  };
}
