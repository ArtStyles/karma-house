import type {MessagingRequestContext} from '../messaging/types.ts';
import type {CapturedAccountContext,CapturedAgencyContext,AgencyWorkspaceState} from './controller.ts';
import type {AgencyRepository} from './repository.ts';
import type {AgencyInvitation,AgencyMembership} from './types.ts';
export function agencyPrivateScreenKey(actor:string|null|undefined,agency:string|null|undefined,generation:number){return `${actor??''}:${agency??''}:${generation}`;}
export function createAgencyScreenRequestScope(){
 let epoch=0,focused=false,key='';
 return {enter(next:string){focused=true;key=next;epoch++;},leave(){focused=false;epoch++;},invalidate(){epoch++;},begin(){
 const captured=++epoch,capturedKey=key,current=()=>focused&&epoch===captured&&key===capturedKey;
 return {current,checkpoint(context?:Pick<MessagingRequestContext,'checkpoint'>){context?.checkpoint();if(!current())throw Error('KH_AGENCY_CONTEXT_CHANGED');}};
 }};
}
export interface AgencyTeamPage{userId:string;agencyId:string|null;generation:number;members:AgencyMembership[];invitations:AgencyInvitation[];sent:AgencyInvitation[];membersMore:boolean;invitationsMore:boolean;sentMore:boolean}
interface TeamSource{repository:AgencyRepository;refreshAgencies():Promise<void>;getCurrentWorkspace():AgencyWorkspaceState;captureAccountContext():CapturedAccountContext;captureAgencyReadContext():CapturedAgencyContext}
export async function loadAgencyTeamPage(source:TeamSource,append:boolean,previous:AgencyTeamPage|null,checkpoint:()=>void):Promise<AgencyTeamPage>{
 let account:CapturedAccountContext|null=null,enterprise:CapturedAgencyContext|null=null;
 try{
  await source.refreshAgencies();checkpoint();
  const state=source.getCurrentWorkspace();
  if(state.error)throw Error(state.error);
  account=source.captureAccountContext();account.checkpoint();checkpoint();
  const same=Boolean(append&&previous?.userId===account.userId&&previous.agencyId===state.activeAgencyId&&previous.generation===state.generation);
  const invitations=await source.repository.listInvitations(same?previous!.invitations.length:0,account);account.checkpoint();checkpoint();
  let members:AgencyMembership[]=[],membersMore=false,sent:AgencyInvitation[]=[],sentMore=false;
  if(state.activeAgencyId&&state.membership?.state==='active'){
   enterprise=source.captureAgencyReadContext();const page=await source.repository.listMembers(same?previous!.members.length:0,enterprise);enterprise.checkpoint();checkpoint();members=page.items;membersMore=page.hasMore;
   // Only admins invite, so only they see who has not answered yet.
   if(state.membership.role==='admin'){const pending=await source.repository.listSentInvitations(same?previous!.sent.length:0,enterprise);enterprise.checkpoint();checkpoint();sent=pending.items;sentMore=pending.hasMore;}
  }
  return {userId:account.userId,agencyId:state.activeAgencyId,generation:state.generation,members:same?[...previous!.members,...members]:members,invitations:same?[...previous!.invitations,...invitations.items]:invitations.items,sent:same?[...previous!.sent,...sent]:sent,membersMore,invitationsMore:invitations.hasMore,sentMore};
 }finally{account?.release();enterprise?.release();}
}
