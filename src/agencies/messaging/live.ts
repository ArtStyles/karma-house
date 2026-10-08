import type {AgencyConversationContext,AgencyMessage,AgencyMessagingRepository} from './types.ts';
import {mergeAgencyMessages} from './repository.ts';

/** One authorized read at a time, including foreground recovery. */
export function startAgencyPoll(refresh:()=>Promise<void>,clock:{schedule:(fn:()=>void)=>unknown;cancel:(id:unknown)=>void}={schedule:fn=>setTimeout(fn,3000),cancel:id=>clearTimeout(id as ReturnType<typeof setTimeout>)}){
 let stopped=false,timer:unknown;
 async function tick(){try{await refresh();}catch{/* The scoped reader owns its error UI. */}finally{if(!stopped)timer=clock.schedule(()=>void tick());}}
 void tick();return()=>{stopped=true;if(timer!==undefined)clock.cancel(timer);};
}
/** Fill any incoming gap before merging; keep the user's already loaded pages. */
export async function readIncomingAgencyMessages(repo:AgencyMessagingRepository,id:string,previous:AgencyMessage[],hadMore:boolean,context:AgencyConversationContext){
 const newest=previous.at(-1)?.seq??0;let before:number|null=null,items:AgencyMessage[]=[],hasMore=false;
 do{
  context.checkpoint();const page=await repo.history(id,before,context);context.checkpoint();items=mergeAgencyMessages(items,page.items);hasMore=page.hasMore;
  const earliest=page.items[0]?.seq;
  if(!newest||!hasMore||earliest===undefined||earliest<=newest+1)break;
  before=earliest;
 }while(true);
 return {items:mergeAgencyMessages(previous,items),hasMore:previous.length?hadMore:hasMore};
}
