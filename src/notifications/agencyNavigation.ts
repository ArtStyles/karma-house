import type {AgencyPushTarget} from '../push/types.ts';
import type {AgencyWorkspaceContextValue} from '../agencies/AgencyProvider.tsx';

type NavigationWorkspace = Pick<AgencyWorkspaceContextValue,
 'captureAccountContext'|'refreshAgencies'|'setActiveAgency'|'getCurrentWorkspace'|'resetAgencyContext'>;

export interface PreparedAgencyNavigation {
 /** Synchronous final checkpoint and router handoff; the captured scope is released afterward. */
 dispatch(navigate:(path:string)=>void, outerCheckpoint?:()=>void):void;
 release():void;
}

function routePath(target:AgencyPushTarget):string {
 switch(target.route){
  case 'account_notice':return '/notifications';
  case 'reviews':return '/agency-reviews';
  case 'verification_reviews':return '/agency-reviews?section=verification';
  case 'application':return '/agency-application';
  case 'verification':return '/agency-verification';
  case 'team':return '/agency-team';
  case 'closures':return target.agencyId?'/agency-closures':'/agency-closures?personal=1';
  case 'deal':return `/agency-deal/${target.dealId}`;
  case 'buyer_conversation':return `/agency-conversation/${target.dealId}`;
  case 'personal_conversation':return `/messages/${target.dealId}`;
 }
}

export async function prepareAgencyNotificationTarget(target:AgencyPushTarget,w:NavigationWorkspace):Promise<PreparedAgencyNavigation>{
 const context=w.captureAccountContext();
 let released=false;
 const release=()=>{if(!released){released=true;context.release()}};
 try{
  context.checkpoint();
  if(target.agencyId){
   await w.refreshAgencies();context.checkpoint();
   await w.setActiveAgency(target.agencyId);context.checkpoint();
   const current=w.getCurrentWorkspace();
   if(current.activeAgencyId!==target.agencyId||current.membership?.state!=='active')throw Error('KH_AGENCY_CONTEXT_CHANGED');
  }else w.resetAgencyContext();
  context.checkpoint();
  const generation=w.getCurrentWorkspace().generation;
  const path=routePath(target);
  return {
   release,
   dispatch(navigate,outerCheckpoint){
    try{
     if(released)throw Error('KH_AGENCY_CONTEXT_CHANGED');
     outerCheckpoint?.();
     context.checkpoint();
     const current=w.getCurrentWorkspace();
     if(current.generation!==generation||current.activeAgencyId!==target.agencyId
       ||target.agencyId&&current.membership?.state!=='active')throw Error('KH_AGENCY_CONTEXT_CHANGED');
     context.checkpoint();
     // No promise/microtask between these checks and the synchronous router callback.
     navigate(path);
    }finally{release()}
   },
  };
 }catch(error){release();throw error}
}
