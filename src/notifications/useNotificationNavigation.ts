import {useRef} from 'react';
import {router,type Href} from 'expo-router';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import {createPushRepository} from '../push/repository';
import type {PushTarget} from '../push/types';
import {createDeadlineFetch} from '../lib/fetchTimeout';
import {prepareAgencyNotificationTarget} from './agencyNavigation';
const repository=createPushRepository(process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()??'',process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()??'',createDeadlineFetch());
export function useNotificationNavigation(){
 const workspace=useAgencyWorkspace(),current=useRef(workspace);current.current=workspace;
 async function navigate(target:PushTarget){
  if('agencyTarget' in target){const path=await prepareAgencyNotificationTarget(target.agencyTarget,current.current);router.push(path as Href)}
  else if('conversationId' in target)router.push({pathname:'/messages/[id]',params:{id:target.conversationId}});
  else router.push({pathname:'/property/[id]',params:{id:target.propertyId}});
 }
 async function open(id:string){
  const context=current.current.captureAccountContext();
  try{
   // Tap resolution uses the captured account token; no client-side ID grants access.
   const result=await repository.resolve(id,{...context,sessionId:''});context.checkpoint();
   if(result.agencyTarget)await navigate({agencyTarget:result.agencyTarget});
   else if(result.conversationId)await navigate({conversationId:result.conversationId});
   else if(result.propertyId)await navigate({propertyId:result.propertyId});
  }finally{context.release()}
 }
 return {navigate,open};
}
