import {useCallback,useEffect,useRef} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {scopedAdminRequest} from './request';

/** Pin every request to the actor/token captured at click time; discard old sessions. */
export function useAdminApi() {
  const {session,isAdmin} = useAuth();
  const current = useRef({id:session?.user.id,token:session?.access_token,isAdmin});
  current.current = {id:session?.user.id,token:session?.access_token,isAdmin};
  const alive = useRef(true);
  const pending = useRef(new Set<AbortController>());
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;for(const controller of pending.current) controller.abort();pending.current.clear();};
  },[]);
  useEffect(()=>{for(const controller of pending.current) controller.abort();pending.current.clear();},[session?.user.id,session?.access_token,isAdmin]);
  return useCallback(async (name:string,args:Record<string,unknown>={},signal?:AbortSignal)=>{
    if(!supabase || !session || !isAdmin) throw new Error('KH_ADMIN_REQUIRED');
    const actor=session.user.id;
    const controller=new AbortController(); pending.current.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const check=()=>{if(!alive.current || controller.signal.aborted || current.current.id!==actor || current.current.token!==session.access_token || !current.current.isAdmin) throw new Error('KH_ACCOUNT_CHANGED');};
    try {
      check();
      const {data,error}=await scopedAdminRequest(()=>supabase!.rpc(name,{...args,p_actor_id:actor}).setHeader('Authorization',`Bearer ${session.access_token}`).abortSignal(controller.signal),check);
      check(); if(error) throw error; return data as unknown;
    } finally {signal?.removeEventListener('abort',abort);pending.current.delete(controller);}
  },[session?.user.id,session?.access_token,isAdmin]);
}
