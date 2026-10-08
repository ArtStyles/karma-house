import type {MessagingRequestContext} from '../messaging/types.ts';
import type {AgencyRepository} from './repository.ts';
import type {AgencyMembership,AgencyRequestContext,AgencySummary} from './types.ts';
import {agencyError} from './domain.ts';
export interface AgencyWorkspaceState {activeAgencyId:string|null;generation:number;agencies:AgencySummary[];membership:AgencyMembership|null;ready:boolean;enabled:boolean;error:string|null}
export interface AgencySession {userId:string;accessToken:string}
export type CapturedAccountContext=MessagingRequestContext&{release():void};
export type CapturedAgencyContext=AgencyRequestContext&{release():void};
export function createAgencyController(repository:AgencyRepository|null){
 let session:AgencySession|null=null,accountEpoch=0,refreshSequence=0;
 let state:AgencyWorkspaceState={activeAgencyId:null,generation:0,agencies:[],membership:null,ready:true,enabled:false,error:null};
 const listeners=new Set<()=>void>(),accountRequests=new Set<AbortController>(),agencyRequests=new Set<AbortController>();
 const publish=(patch:Partial<AgencyWorkspaceState>)=>{state={...state,...patch};for(const listener of listeners)listener()};
 const abort=(requests:Set<AbortController>)=>{for(const c of requests)c.abort();requests.clear()};
 const invalidateAgency=()=>{abort(agencyRequests);publish({generation:state.generation+1,activeAgencyId:null,membership:null})};
 function captureAccountContext():CapturedAccountContext{
  if(!session||!repository)throw Error('KH_SESSION_REQUIRED');
  const captured=session,epoch=accountEpoch,controller=new AbortController();accountRequests.add(controller);
  return {userId:captured.userId,accessToken:captured.accessToken,signal:controller.signal,
   checkpoint(){if(controller.signal.aborted||epoch!==accountEpoch||session?.userId!==captured.userId)throw Error('KH_AGENCY_CONTEXT_CHANGED')},
   release(){accountRequests.delete(controller)}};
 }
 function captureAgencyContext():CapturedAgencyContext{
  if(!state.enabled||!state.agencies.some(a=>a.id===state.activeAgencyId&&a.state==='approved'))throw Error('KH_AGENCY_CONTEXT_REQUIRED');
  return captureAgencyReadContext();
 }
 function captureAgencyReadContext():CapturedAgencyContext{
  if(!state.activeAgencyId||state.membership?.state!=='active')throw Error('KH_AGENCY_CONTEXT_REQUIRED');
  const base=captureAccountContext(),generation=state.generation,agencyId=state.activeAgencyId,controller=new AbortController();agencyRequests.add(controller);
  return {...base,agencyId,generation,signal:controller.signal,
   checkpoint(){base.checkpoint();if(controller.signal.aborted||generation!==state.generation||state.activeAgencyId!==agencyId)throw Error('KH_AGENCY_CONTEXT_CHANGED')},
   onAuthorizationError(error:unknown){
    const rejection=error as {code?:unknown;message?:unknown}|null;
    if(rejection?.code!=='42501'||typeof rejection.message!=='string'||!/^KH_(AGENCY_(MEMBERSHIP_REQUIRED|ROLE_REQUIRED|DEAL_NOT_FOUND|NOT_APPROVED)|ACCOUNT_(CHANGED|DELETING|SUSPENDED)|EMAIL_UNCONFIRMED)$/.test(rejection.message))return;
    // An old denial must never invalidate a newly selected account or agency.
    try{base.checkpoint();if(controller.signal.aborted||generation!==state.generation||state.activeAgencyId!==agencyId)return;}catch{return}
    invalidateAgency();publish({error:agencyError(error)});
   },
   release(){base.release();agencyRequests.delete(controller)}};
 }
 function setSession(next:AgencySession|null){
  if(session?.userId===next?.userId){session=next;return}
  session=next;accountEpoch++;refreshSequence++;abort(accountRequests);invalidateAgency();
  publish({agencies:[],enabled:false,error:null,ready:!next||!repository});
 }
 async function refreshAgencies(){
  if(!repository||!session){publish({ready:true});return}
  const sequence=++refreshSequence,context=captureAccountContext();
  const current=()=>{context.checkpoint();if(sequence!==refreshSequence)throw Error('KH_AGENCY_REFRESH_SUPERSEDED')};
  try{
   const capabilities=await repository.capabilities(context);current();
   const agencies=await repository.listMine(context);current();
   const selected=state.activeAgencyId,generation=state.generation;
   let membership:AgencyMembership|null=null;
   if(selected&&agencies.some(a=>a.id===selected))membership=await repository.membership(selected,context);
   current();
   if(selected===state.activeAgencyId&&generation===state.generation){
    if(selected&&membership?.state!=='active')invalidateAgency();
    else if(selected&&membership&&(membership.role!==state.membership?.role||membership.version!==state.membership?.version||capabilities.enabled!==state.enabled||agencies.find(a=>a.id===selected)?.state!==state.agencies.find(a=>a.id===selected)?.state)){
     abort(agencyRequests);publish({generation:state.generation+1,membership});
    }else if(selected)publish({membership});
   }
   publish({agencies,enabled:capabilities.enabled,error:null,ready:true});
  }catch(error){
   try{current();}catch{return}
   // A failed membership refresh cannot leave a previously captured operational session usable.
   if(state.activeAgencyId)invalidateAgency();
   publish({error:agencyError(error),ready:true});
  }finally{context.release()}
 }
 async function setActiveAgency(id:string|null){
  if(id!==null){
   if(!state.enabled)throw Error('KH_AGENCY_DISABLED');
   if(!state.agencies.some(a=>a.id===id&&a.state==='approved'))throw Error('KH_AGENCY_NOT_APPROVED');
  }
  return setActiveAgencyForRead(id);
 }
 async function setActiveAgencyForRead(id:string|null){
  if(id===null){invalidateAgency();return}
  if(!repository||!session)throw Error('KH_SESSION_REQUIRED');
  if(!state.agencies.some(a=>a.id===id))throw Error('KH_AGENCY_MEMBERSHIP_REQUIRED');
  invalidateAgency();const generation=state.generation,context=captureAccountContext();
  const current=()=>{context.checkpoint();if(generation!==state.generation)throw Error('KH_AGENCY_CONTEXT_CHANGED')};
  try{
   const membership=await repository.membership(id,context);current();
   if(membership?.state!=='active')throw Error('KH_AGENCY_MEMBERSHIP_REQUIRED');
   publish({activeAgencyId:id,membership,error:null});
  }catch(error){try{current();}catch{return}publish({error:agencyError(error)});throw error}finally{context.release()}
 }
 return {getSessionUserId:()=>session?.userId??null,getSnapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},setSession,refreshAgencies,setActiveAgency,setActiveAgencyForRead,captureAccountContext,captureAgencyContext,captureAgencyReadContext,
  resetAgencyContext(){refreshSequence++;invalidateAgency();publish({error:null})},
  dispose(){accountEpoch++;refreshSequence++;abort(accountRequests);abort(agencyRequests);listeners.clear()}};
}
export type AgencyController=ReturnType<typeof createAgencyController>;
