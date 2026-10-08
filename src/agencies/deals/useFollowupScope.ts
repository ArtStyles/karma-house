import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAgencyWorkspace } from '../AgencyProvider';
import { createFollowupViewScope } from './viewScope';
import type { CapturedAgencyContext } from '../controller';
export type FollowupCapture=(latest?:boolean)=>CapturedAgencyContext;
export function useFollowupScope(load:(capture:FollowupCapture)=>Promise<void>,clear:()=>void){
    const w=useAgencyWorkspace(),scope=useRef(createFollowupViewScope()).current,focused=useRef(false),refreshSequence=useRef(0),loadRef=useRef(load),clearRef=useRef(clear),refreshRef=useRef(w.refreshAgencies);
    const requests=useRef(new Set<AbortController>()).current;
    loadRef.current=load;clearRef.current=clear;refreshRef.current=w.refreshAgencies;
    const invalidate=useCallback(()=>{scope.invalidate();for(const request of requests)request.abort();requests.clear();},[scope,requests]);
    const capture=useCallback((latest=false)=>{const checkpoint=scope.capture(latest),c=w.captureAgencyContext(),request=new AbortController(),abort=()=>request.abort();requests.add(request);c.signal.addEventListener('abort',abort,{once:true});if(c.signal.aborted)abort();return {...c,signal:request.signal,checkpoint(){c.checkpoint();checkpoint();if(request.signal.aborted)throw Error('KH_AGENCY_CONTEXT_CHANGED');},release(){c.signal.removeEventListener('abort',abort);requests.delete(request);c.release();}};},[scope,requests,w.captureAgencyContext]);
    const refresh=useCallback(async()=>{const sequence=++refreshSequence.current;invalidate();clearRef.current();await refreshRef.current();if(sequence===refreshSequence.current&&focused.current&&AppState.currentState==='active'){scope.activate();await loadRef.current(capture);}},[scope,capture,invalidate]);
    useFocusEffect(useCallback(()=>{focused.current=true;void refresh();return ()=>{focused.current=false;refreshSequence.current++;invalidate();clearRef.current();};},[refresh,invalidate]));
    useEffect(()=>{const sub=AppState.addEventListener('change',state=>{refreshSequence.current++;invalidate();clearRef.current();if(state==='active'&&focused.current)void refresh();});return()=>sub.remove();},[refresh,invalidate]);
    return {capture,refresh,isActive:scope.isActive};
}
