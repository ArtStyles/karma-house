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
 async function navigate(target:PushTarget,outerCheckpoint?:()=>void){
  const context=current.current.captureAccountContext();
  const checkpoint=()=>{outerCheckpoint?.();context.checkpoint()};
  try{
   checkpoint();
   if('agencyTarget' in target){
    const prepared=await prepareAgencyNotificationTarget(target.agencyTarget,current.current);
    prepared.dispatch(path=>router.push(path as Href),checkpoint);
   }else if('conversationId' in target){
    checkpoint();router.push({pathname:'/messages/[id]',params:{id:target.conversationId}});
   }else{
    checkpoint();router.push({pathname:'/property/[id]',params:{id:target.propertyId}});
   }
  }finally{context.release()}
 }
 async function open(id:string){
  const context=current.current.captureAccountContext();
  try{
   // The resolution scope stays live through the nested final router checkpoint.
   const result=await repository.resolve(id,{...context,sessionId:''});context.checkpoint();
   if(result.agencyTarget)await navigate({agencyTarget:result.agencyTarget},context.checkpoint);
   else if(result.conversationId)await navigate({conversationId:result.conversationId},context.checkpoint);
   else if(result.propertyId)await navigate({propertyId:result.propertyId},context.checkpoint);
  }finally{context.release()}
 }
 return {navigate,open};
}
