import {useEffect,useRef} from 'react';import {createClient} from '@supabase/supabase-js';import {useAuth} from '../auth/AuthProvider';import type {MessagingRequestContext} from '../messaging/types';
export function usePrivateSession(){
 const auth=useAuth(),current=useRef({id:auth.user?.id,token:auth.session?.access_token}),controllers=useRef(new Set<AbortController>()),mounted=useRef(true);
 current.current={id:auth.user?.id,token:auth.session?.access_token};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controllers.current.forEach(x=>x.abort());controllers.current.clear();};},[]);
 useEffect(()=>{controllers.current.forEach(x=>x.abort());controllers.current.clear();},[auth.user?.id,auth.session?.access_token]);
 const capture=()=>{const actor=current.current;if(!actor.id||!actor.token)throw Error('KH_ACCOUNT_CHANGED');const controller=new AbortController();controllers.current.add(controller);const context:MessagingRequestContext={userId:actor.id,accessToken:actor.token,signal:controller.signal,checkpoint(){if(!mounted.current||controller.signal.aborted||current.current.id!==actor.id||current.current.token!==actor.token)throw Error('KH_ACCOUNT_CHANGED');}};return {context,release(){controllers.current.delete(controller);}};};
 async function run<T>(work:(context:MessagingRequestContext)=>Promise<T>):Promise<T>{const r=capture();try{r.context.checkpoint();const result=await work(r.context);r.context.checkpoint();return result;}catch(e){r.context.checkpoint();throw e;}finally{r.release();}}
 return {auth,run,capture,key:`${auth.user?.id??'signed-out'}:${auth.session?.access_token??''}`};
}
// Storage uploads/signatures use the captured JWT as well as the actor checkpoint.
export function scopedClient(context:MessagingRequestContext){return createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${context.accessToken}`}}});}
