import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { negotiationErrorMessage } from '../../negotiations/domain';
import type { CreateNegotiationInput, Negotiation, NegotiationAction, RespondNegotiationInput } from '../../negotiations/types';

export function useNegotiationMutations(userId:string,store:{create(input:CreateNegotiationInput):Promise<Negotiation>;respond(input:RespondNegotiationInput):Promise<Negotiation>},onChanged:(item:Negotiation)=>Promise<void>) {
  const auth=useAuth(),actor=useRef(auth.user?.id);actor.current=auth.user?.id;
  const mounted=useRef(true),attempts=useRef(new Map<string,string>()),responding=useRef(false);
  const [issue,setIssue]=useState(''),[feedback,setFeedback]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  function checkpoint(){if(!mounted.current||actor.current!==userId)throw Error('KH_ACCOUNT_CHANGED')}
  function refreshChat(item:Negotiation){
    void onChanged(item).then(()=>{checkpoint()}).catch(()=>{if(mounted.current&&actor.current===userId)setIssue('El cambio se guardó. No pudimos actualizar el chat; vuelve a abrirlo para ver el resumen.');});
  }
  return {issue,feedback,clearFeedback(){setIssue('');setFeedback('')},
    async create(input:CreateNegotiationInput){checkpoint();setIssue('');setFeedback('');const result=await store.create(input);checkpoint();refreshChat(result);return result},
    async respond(item:Negotiation,action:NegotiationAction){
      if(responding.current)return;
      responding.current=true;
      try{
        checkpoint();setIssue('');setFeedback('');
        const key=`${item.id}:${item.version}:${action}`;let id=attempts.current.get(key);if(!id){id=randomUUID();attempts.current.set(key,id)}
        const result=await store.respond({id:item.id,action,expectedVersion:item.version,clientRequestId:id});checkpoint();
        setFeedback(action==='accept'?'Propuesta aceptada.':action==='decline'?'Propuesta rechazada.':item.status==='pending'?'Propuesta retirada.':'Propuesta cancelada.');refreshChat(result);
      }catch(error){if(mounted.current&&actor.current===userId)setIssue(negotiationErrorMessage(error));}
      finally{responding.current=false;}
    },
  };
}
