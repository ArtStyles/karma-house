import {isUuid} from '../messaging/domain.ts';import type {MessagingRequestContext} from '../messaging/types.ts';import {transferError} from './domain.ts';import type {ListingTransferRepository,TransferRequest,OfferTransferInput,DecideTransferInput} from './types.ts';
interface Storage {getItem(k:string):Promise<string|null>;setItem(k:string,v:string):Promise<void>;removeItem(k:string):Promise<void>}
interface Identity {userId:string;accessToken:string}
export interface TransferControllerState {userId:string|null;items:TransferRequest[];opened:TransferRequest|null;loading:boolean;busy:boolean;error:string|null}
const empty=(id:string|null=null):TransferControllerState=>({userId:id,items:[],opened:null,loading:false,busy:false,error:null});
export function createListingTransferController(repository:ListingTransferRepository,storage:Storage,uuid:()=>string){
 let identity:Identity|null=null,epoch=0,sequence=0,state=empty(),action:Promise<unknown>|null=null,actionKey:string|null=null;const listeners=new Set<()=>void>(),requests=new Set<AbortController>();
 let readFlight:{key:string;promise:Promise<void>}|null=null;
 const read=(key:string,work:()=>Promise<void>)=>{if(state.busy)return Promise.resolve();if(readFlight?.key===key)return readFlight.promise;const flight={key,promise:Promise.resolve()};readFlight=flight;flight.promise=work().finally(()=>{if(readFlight===flight)readFlight=null;});return flight.promise;};
 const publish=(next:TransferControllerState)=>{state=next;listeners.forEach(fn=>fn());};
 const capture=()=>{if(!identity)throw Error('KH_ACCOUNT_CHANGED');const actor=identity,mine=epoch,controller=new AbortController();requests.add(controller);const context:MessagingRequestContext={userId:actor.userId,accessToken:actor.accessToken,signal:controller.signal,checkpoint(){if(mine!==epoch||controller.signal.aborted)throw Error('KH_ACCOUNT_CHANGED');}};return {mine,context,release(){requests.delete(controller);}};};
 const merge=(row:TransferRequest)=>publish({...state,opened:row,items:[row,...state.items.filter(x=>x.id!==row.id)]});
 const refresh=(scope:'incoming'|'outgoing'='incoming')=>read(`list:${scope}`,async()=>{
  const request=capture(),read=++sequence;publish({...state,loading:true,error:null});
  try{const rows=new Map<string,TransferRequest>();let offset=0;while(true){const page=await repository.list(scope,offset,request.context);request.context.checkpoint();const previous=rows.size;page.items.forEach(x=>rows.set(x.id,x));if(!page.hasMore)break;if(rows.size===previous||!page.items.length)throw Error('KH_TRANSFER_INVALID');offset+=page.items.length;}if(read===sequence)publish({...state,items:[...rows.values()],loading:false});}
  catch(error){if(request.mine===epoch&&read===sequence)publish({...state,loading:false,error:transferError(error)});}
  finally{request.release();}
 });
 const open=(id:string)=>read(`open:${id}`,async()=>{const request=capture(),version=++sequence;publish({...state,opened:state.opened?.id===id?state.opened:null,loading:true,error:null});try{const row=await repository.get(id,request.context);request.context.checkpoint();if(version===sequence)publish({...state,opened:row,loading:false});}catch(error){if(request.mine===epoch&&version===sequence){const rejection=error as {code?:string;status?:number;message?:string};const denied=rejection?.code==='42501'||rejection?.status===401||rejection?.status===403||/^PGRST30[123]$/.test(rejection?.code??'')||/KH_(TRANSFER_NOT_FOUND|ACCOUNT_(CHANGED|SUSPENDED|DELETING)|AUTH_REQUIRED|SESSION_REQUIRED)/.test(rejection?.message??'');publish({...state,opened:denied?null:state.opened,loading:false,error:transferError(error)});}}finally{request.release();}});
 function mutate<T>(kind:string,input:unknown,send:(token:string,context:MessagingRequestContext)=>Promise<T>):Promise<T>{
  const fingerprint=kind+':'+JSON.stringify(input);
  if(action)return actionKey===fingerprint?action as Promise<T>:Promise.reject(Error('Espera a que termine la gestión actual.'));
  const request=capture(),key=`karmahouse.transfer-action.v1:${request.context.userId}:${kind}:${JSON.stringify(input)}`;
  publish({...state,busy:true,error:null});
  const pending=(async()=>{try{
   const previous=await storage.getItem(key);request.context.checkpoint();const token=isUuid(previous)?previous:uuid();await storage.setItem(key,token);request.context.checkpoint();
   const result=await send(token,request.context);request.context.checkpoint();await storage.removeItem(key);request.context.checkpoint();return result;
  }catch(error){if(request.mine===epoch)publish({...state,error:transferError(error)});request.context.checkpoint();throw error;}
  finally{request.release();if(request.mine===epoch){action=null;actionKey=null;publish({...state,busy:false});}}})();
  action=pending;actionKey=fingerprint;return pending;
 }
 return {getState:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn);},
 activate(next:Identity|null){if(next?.userId===identity?.userId&&next?.accessToken===identity?.accessToken)return;epoch++;sequence++;requests.forEach(c=>c.abort());requests.clear();identity=next;action=null;readFlight=null;publish(empty(next?.userId??null));},
 reset(){epoch++;sequence++;requests.forEach(c=>c.abort());requests.clear();identity=null;action=null;readFlight=null;publish(empty());},refresh,open,
 offer(input:Omit<OfferTransferInput,'clientRequestId'>){return mutate('offer',input,async(token,context)=>{const r=await repository.offer({...input,clientRequestId:token},context);context.checkpoint();merge(r);return r;});},
 decide(input:Omit<DecideTransferInput,'clientRequestId'>){return mutate('decision',input,async(token,context)=>{const result=await repository.decide({...input,clientRequestId:token},context);context.checkpoint();sequence++;const row=await repository.get(input.requestId,context);context.checkpoint();merge(row);return result;});},
 };
}
