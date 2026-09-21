import type { CreateNegotiationInput, Negotiation, NegotiationKind } from './types.ts';

export interface ProposalTarget { conversationId:string; kind:NegotiationKind; previous?:Negotiation }
export interface ProposalDraft { amount:string; date:string; time:string; note:string; attempt:CreateNegotiationInput|null; error:string; confirmed:Negotiation|null }
const key=(target:ProposalTarget)=>`${target.conversationId}:${target.kind}:${target.previous?.id??'new'}:${target.previous?.version??0}`;
/** Lives above the native Modal. Each actor-keyed screen owns its own instance. */
export function createProposalDraftStore(defaultDate:string){
  const drafts=new Map<string,ProposalDraft>(),listeners=new Set<()=>void>();let revision=0;
  const initial=(target:ProposalTarget):ProposalDraft=>({amount:target.previous?.amountUsd?.toString()??'',date:target.previous?.visitDate??defaultDate,time:target.previous?.visitTime??'10:00',note:'',attempt:null,error:'',confirmed:null});
  function get(target:ProposalTarget){return drafts.get(key(target))??initial(target)}
  function changed(){revision++;for(const listener of listeners)listener()}
  return {get,getSnapshot:()=>revision,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
    update(target:ProposalTarget,patch:Partial<ProposalDraft>){drafts.set(key(target),{...get(target),...patch});changed()},
    discard(target:ProposalTarget){drafts.delete(key(target));changed()},
  };
}
