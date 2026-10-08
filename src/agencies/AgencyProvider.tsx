import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {AppState} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {createAgencyRepository,type AgencyRepository} from './repository';
import {createAgencyController,type CapturedAccountContext,type CapturedAgencyContext,type AgencyWorkspaceState} from './controller';
import type {AgencyMembership,AgencySummary} from './types';
export interface AgencyWorkspaceContextValue {ready:boolean;enabled:boolean;agencies:AgencySummary[];activeAgency:AgencySummary|null;principalAgency:AgencySummary|null;activeAgencyId:string|null;generation:number;membership:AgencyMembership|null;error:string|null;repository:AgencyRepository|null;getCurrentWorkspace():AgencyWorkspaceState;refreshAgencies():Promise<void>;setActiveAgency(id:string|null):Promise<void>;setActiveAgencyForRead(id:string|null,isCurrent?:()=>boolean):Promise<void>;resetAgencyContext():void;captureAccountContext():CapturedAccountContext;captureAgencyContext():CapturedAgencyContext;captureAgencyReadContext():CapturedAgencyContext}
const AgencyContext=createContext<AgencyWorkspaceContextValue|null>(null);
export function AgencyProvider({children}:{children:ReactNode}){
 const {ready:authReady,session,suspended}=useAuth();
 const repository=useMemo(()=>supabase?createAgencyRepository(supabase):null,[]);
 const controller=useMemo(()=>createAgencyController(repository),[repository]);
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const actor=suspended?null:session?.user.id??null,token=suspended?null:session?.access_token??null;
 useLayoutEffect(()=>{controller.setSession(actor&&token?{userId:actor,accessToken:token}:null);if(authReady)void controller.refreshAgencies()},[controller,actor,token,authReady]);
 useEffect(()=>{const subscription=AppState.addEventListener('change',status=>{if(status==='active')void controller.refreshAgencies()});return()=>subscription.remove()},[controller]);
 useEffect(()=>()=>controller.dispose(),[controller]);
 const aligned=controller.getSessionUserId()===actor;
 const captureAccountContext=useCallback(()=>{if(controller.getSessionUserId()!==actor||!authReady||suspended)throw Error('KH_SESSION_REQUIRED');return controller.captureAccountContext()},[controller,actor,authReady,suspended]);
 const captureAgencyContext=useCallback(()=>{if(controller.getSessionUserId()!==actor||!authReady||suspended)throw Error('KH_AGENCY_CONTEXT_CHANGED');return controller.captureAgencyContext()},[controller,actor,authReady,suspended]);
 const captureAgencyReadContext=useCallback(()=>{if(controller.getSessionUserId()!==actor||!authReady||suspended)throw Error('KH_AGENCY_CONTEXT_CHANGED');return controller.captureAgencyReadContext()},[controller,actor,authReady,suspended]);
 const value:AgencyWorkspaceContextValue={...state,ready:authReady&&aligned&&state.ready,enabled:aligned&&state.enabled,agencies:aligned?state.agencies:[],activeAgencyId:aligned?state.activeAgencyId:null,membership:aligned?state.membership:null,error:aligned?state.error:null,
  activeAgency:aligned?state.agencies.find(a=>a.id===state.activeAgencyId)??null:null,principalAgency:aligned?state.agencies.find(a=>a.isPrincipal===true)??null:null,repository,
  getCurrentWorkspace:controller.getSnapshot,refreshAgencies:controller.refreshAgencies,setActiveAgency:controller.setActiveAgency,setActiveAgencyForRead:controller.setActiveAgencyForRead,resetAgencyContext:controller.resetAgencyContext,
  captureAccountContext,captureAgencyContext,captureAgencyReadContext};
 return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
}
export function useAgencyWorkspace(){const context=useContext(AgencyContext);if(!context)throw Error('AgencyProvider is required');return context}
