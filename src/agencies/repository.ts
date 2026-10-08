import type {SupabaseClient} from '@supabase/supabase-js';
import type {MessagingRequestContext} from '../messaging/types.ts';
import {isUuid} from '../messaging/domain.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {normalizeAgencyApplication,normalizeAgencyVerificationRequest} from './domain.ts';
import {decodePrincipalStatus,principalCommercialDraft} from './principal.ts';
import type {AgencyApplication,AgencyApplicationInput,AgencyInvitation,AgencyMembership,AgencyRequestContext,AgencyRole,AgencyState,AgencySummary,AgencyVerificationRequest,AgencyVerificationRequestInput,AgencyVerificationRequestState,Page} from './types.ts';
const invalid=()=>Error('No se pudieron interpretar los datos de la inmobiliaria.');
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Record<string,unknown>}
function str(v:unknown):string{if(typeof v!=='string')throw invalid();return v}
function uuid(v:unknown):string{if(!isUuid(v))throw invalid();return v}
function version(v:unknown):number{if(typeof v!=='number'||!Number.isInteger(v)||v<1)throw invalid();return v}
function nullable(v:unknown):string|null{if(v===null)return null;return str(v)}
function iso(v:unknown):string{const s=str(v);if(!Number.isFinite(Date.parse(s)))throw invalid();return s}
function enumValue<T extends string>(v:unknown,values:readonly T[]):T{if(typeof v!=='string'||!values.includes(v as T))throw invalid();return v as T}
export function decodeAgencySummary(value:unknown):AgencySummary{
 const v=object(value);if(typeof v.verified!=='boolean')throw invalid();
 const isPrincipal=decodePrincipalStatus(v.isPrincipal,v.verified),state=enumValue(v.state,['pending','needs_changes','approved','rejected','suspended']);
 if(isPrincipal&&state!=='approved')throw invalid();
 return {id:uuid(v.id),tradeName:str(v.tradeName),state,version:version(v.version),logoPath:nullable(v.logoPath),verified:v.verified,verificationVersion:version(v.verificationVersion),isPrincipal};
}
export function decodeAgencyMembership(value:unknown):AgencyMembership{
 const v=object(value);return {...(v.displayName===undefined?{}:{displayName:str(v.displayName)}),agencyId:uuid(v.agencyId),userId:uuid(v.userId),role:enumValue(v.role,['manager','coordinator','admin']),state:enumValue(v.state,['active','removed']),version:version(v.version)};
}
export function decodeAgencyInvitation(value:unknown):AgencyInvitation{
 const v=object(value);return {...(v.agencyName===undefined?{}:{agencyName:str(v.agencyName)}),id:uuid(v.id),agencyId:uuid(v.agencyId),recipientId:uuid(v.recipientId),role:enumValue(v.role,['manager','coordinator','admin']),state:enumValue(v.state,['pending','accepted','declined','cancelled','expired']),version:version(v.version),expiresAt:iso(v.expiresAt)};
}
export function decodeAgencyApplication(value:unknown):AgencyApplication{
 const v=object(value);if(typeof v.emailConfirmed!=='boolean')throw invalid();const agency=decodeAgencySummary(v.agency);
 const input=agency.isPrincipal&&Object.keys(object(v.input)).length===0?{...principalCommercialDraft(agency.tradeName),responsibleFullName:'',evidenceReferences:[]}:normalizeAgencyApplication(v.input);
 return {agency,input,reviewNote:nullable(v.reviewNote),emailConfirmed:v.emailConfirmed};
}
export function decodeVerificationRequest(value:unknown):AgencyVerificationRequest{
 const v=object(value);return {id:uuid(v.id),agencyId:uuid(v.agencyId),input:normalizeAgencyVerificationRequest(v.input),state:enumValue(v.state,['pending','needs_changes','approved','rejected','cancelled']),reviewNote:nullable(v.reviewNote),version:version(v.version),createdAt:iso(v.createdAt),reviewedAt:v.reviewedAt===null?null:iso(v.reviewedAt)};
}
export function decodeAgencyPage<T>(value:unknown,decode:(v:unknown)=>T):Page<T>{const p=object(value);if(!Array.isArray(p.items)||p.items.length>50||typeof p.hasMore!=='boolean')throw invalid();return {items:p.items.map(decode),hasMore:p.hasMore}}
interface Request{clientRequestId:string}
interface MemberChange extends Request{userId:string;expectedVersion:number}
interface Review extends Request{agencyId:string;decision:'approve'|'needs_changes'|'reject'|'suspend';note:string;expectedVersion:number}
interface VerificationReview extends Request{agencyId:string;requestId?:string;decision:'grant'|'needs_changes'|'reject'|'revoke';note:string;expectedAgencyVersion:number;expectedVerificationVersion:number;expectedRequestVersion?:number}
export function createAgencyRepository(client:SupabaseClient){
 const rpc=createScopedRpc(client);
 function sameAgency<T extends {agencyId:string}>(value:T,context:AgencyRequestContext):T{if(value.agencyId!==context.agencyId)throw invalid();return value}
 return {
  async capabilities(context:MessagingRequestContext):Promise<{enabled:boolean}>{const v=object(await rpc('kh_agency_capabilities',{},context));if(typeof v.enabled!=='boolean')throw invalid();return {enabled:v.enabled}},
  async application(context:MessagingRequestContext):Promise<AgencyApplication|null>{const v=await rpc('kh_agency_application',{},context);return v===null?null:decodeAgencyApplication(v)},
  async submitApplication(input:AgencyApplicationInput,requestId:string,expectedVersion:number,context:MessagingRequestContext):Promise<AgencyApplication>{return decodeAgencyApplication(await rpc('kh_submit_agency_application',{p_payload:{input:normalizeAgencyApplication(input),clientRequestId:uuid(requestId),expectedVersion:version(expectedVersion)}},context))},
  async listMine(context:MessagingRequestContext):Promise<AgencySummary[]>{const v=await rpc('kh_list_my_agencies',{},context);if(!Array.isArray(v)||v.length>1000)throw invalid();return v.map(decodeAgencySummary)},
  async reviewAgency(input:Review,context:MessagingRequestContext):Promise<AgencySummary>{const v=decodeAgencySummary(await rpc('kh_review_agency',{p_payload:input},context));if(v.id!==input.agencyId)throw invalid();return v},
  async recoverAgency(input:{agencyId:string;newAdminId:string;expectedVersion:number;reason:string}&Request,context:MessagingRequestContext):Promise<AgencySummary>{const payload={...input,agencyId:uuid(input.agencyId),newAdminId:uuid(input.newAdminId),expectedVersion:version(input.expectedVersion),clientRequestId:uuid(input.clientRequestId)};const v=decodeAgencySummary(await rpc('kh_admin_recover_agency',{p_payload:payload},context));if(v.id!==input.agencyId||v.verified)throw invalid();return v},
  async membership(agencyId:string,context:MessagingRequestContext):Promise<AgencyMembership|null>{const v=await rpc('kh_agency_membership',{p_agency_id:uuid(agencyId)},context);if(v===null)return null;const m=decodeAgencyMembership(v);if(m.agencyId!==agencyId||m.userId!==context.userId)throw invalid();return m},
  async listMembers(offset:number,context:AgencyRequestContext):Promise<Page<AgencyMembership>>{return decodeAgencyPage(await rpc('kh_list_agency_members',{p_agency_id:context.agencyId,p_offset:offset,p_limit:30},context),v=>sameAgency(decodeAgencyMembership(v),context))},
  async listInvitations(offset:number,context:MessagingRequestContext):Promise<Page<AgencyInvitation>>{return decodeAgencyPage(await rpc('kh_list_agency_invitations',{p_offset:offset,p_limit:30},context),v=>{const i=decodeAgencyInvitation(v);if(i.recipientId!==context.userId)throw invalid();return i})},
  async inviteMember(input:{userId:string;role:AgencyRole}&Request,context:AgencyRequestContext):Promise<AgencyInvitation>{const invitation=sameAgency(decodeAgencyInvitation(await rpc('kh_invite_agency_member',{p_agency_id:context.agencyId,p_payload:input},context)),context);if(invitation.recipientId!==input.userId||invitation.role!==input.role)throw invalid();return invitation},
  async decideInvitation(input:{invitationId:string;accept:boolean;expectedVersion:number}&Request,context:MessagingRequestContext):Promise<AgencyInvitation>{const i=decodeAgencyInvitation(await rpc('kh_decide_agency_invitation',{p_payload:input},context));if(i.id!==input.invitationId||i.recipientId!==context.userId)throw invalid();return i},
  async setMemberRole(input:MemberChange&{role:AgencyRole},context:AgencyRequestContext):Promise<AgencyMembership>{const m=sameAgency(decodeAgencyMembership(await rpc('kh_set_agency_member_role',{p_agency_id:context.agencyId,p_payload:input},context)),context);if(m.userId!==input.userId)throw invalid();return m},
  async removeMember(input:MemberChange,context:AgencyRequestContext):Promise<AgencyMembership>{const m=sameAgency(decodeAgencyMembership(await rpc('kh_remove_agency_member',{p_agency_id:context.agencyId,p_payload:input},context)),context);if(m.userId!==input.userId)throw invalid();return m},
  async listReviews(state:AgencyState,offset:number,context:MessagingRequestContext):Promise<Page<AgencyApplication>>{return decodeAgencyPage(await rpc('kh_list_agency_reviews',{p_state:state,p_offset:offset,p_limit:30},context),decodeAgencyApplication)},
  async verificationRequest(context:AgencyRequestContext):Promise<AgencyVerificationRequest|null>{const v=await rpc('kh_agency_verification_request',{p_agency_id:context.agencyId},context);return v===null?null:sameAgency(decodeVerificationRequest(v),context)},
  async requestVerification(input:{input:AgencyVerificationRequestInput;requestId?:string;expectedVersion?:number}&Request,context:AgencyRequestContext):Promise<AgencyVerificationRequest>{return sameAgency(decodeVerificationRequest(await rpc('kh_request_agency_verification',{p_agency_id:context.agencyId,p_payload:{...input,input:normalizeAgencyVerificationRequest(input.input)}},context)),context)},
  async listVerificationReviews(state:AgencyVerificationRequestState,offset:number,context:MessagingRequestContext):Promise<Page<AgencyVerificationRequest>>{return decodeAgencyPage(await rpc('kh_list_agency_verification_reviews',{p_state:state,p_offset:offset,p_limit:30},context),decodeVerificationRequest)},
  async reviewVerification(input:VerificationReview,context:MessagingRequestContext):Promise<{agency:AgencySummary;request:AgencyVerificationRequest|null}>{const v=object(await rpc('kh_review_agency_verification',{p_payload:input},context));const a=decodeAgencySummary(v.agency),r=v.request===null?null:decodeVerificationRequest(v.request);if(a.id!==input.agencyId||(r&&r.agencyId!==a.id))throw invalid();return {agency:a,request:r}},
  async invitationCandidate(userId:string,context:AgencyRequestContext):Promise<{id:string;displayName:string;canInvite:boolean}|null>{const v=await rpc('kh_agency_invitation_candidate',{p_agency_id:context.agencyId,p_user_id:uuid(userId)},context);if(v===null)return null;const r=object(v);if(r.id!==userId||typeof r.canInvite!=='boolean')throw invalid();return {id:uuid(r.id),displayName:str(r.displayName),canInvite:r.canInvite}},
 };
}
export type AgencyRepository=ReturnType<typeof createAgencyRepository>;
