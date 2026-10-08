import type {AgencyConversationContext,AgencyMessage,AgencyMessagingRepository} from './types.ts';
import {mergeAgencyMessages} from './repository.ts';

/** Access denials must never leave a previously authorized private read visible. */
export function isAgencyReadAccessFailure(error:unknown):boolean{
 const rejection=error as {code?:unknown;status?:unknown;message?:unknown}|null;
 if(rejection?.code==='42501'||rejection?.status===401||rejection?.status===403||/^PGRST30[123]$/.test(String(rejection?.code)))return true;
 return typeof rejection?.message==='string'&&/^KH_(ACCOUNT_(CHANGED|DELETING|SUSPENDED)|SESSION_REQUIRED|EMAIL_UNCONFIRMED|AGENCY_(CONTEXT_(CHANGED|REQUIRED)|MEMBERSHIP_REQUIRED|ROLE_REQUIRED|DEAL_NOT_FOUND|NOT_APPROVED))$/.test(rejection.message);
}

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
