import {isUuid} from '../messaging/domain.ts';
import {decodeAdminPage, type AdminAccount, type AdminListing, type AdminEvent} from './domain.ts';
import {mapRemoteListing, type RemotePropertyRow} from '../data/remoteMapping.ts';
import {PROVINCES} from '../domain/listingOptions.ts';
import {decodeAgencyApplication,decodeVerificationRequest} from '../agencies/repository.ts';
import type {AgencyApplication,AgencyVerificationRequest} from '../agencies/types.ts';
import type {PropertyReport} from '../data/propertyReports.ts';
import type {ModerationReport} from '../messaging/reportModeration.ts';
import type {AssistedCollaborator, AssistedListingRow} from '../assisted/types.ts';
import {validateCollaborator} from '../assisted/domain.ts';

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_QUERY_SECTIONS = ['review','accounts','listings','history','propertyReports','messageReports','agencies','assistedCollaborators','assistedListings'] as const;
export type AdminQuerySection = typeof ADMIN_QUERY_SECTIONS[number];
export type AdminQuerySort = 'newest'|'oldest'|'name';
export interface AdminQueryInput {section:AdminQuerySection;query?:string;filters?:Record<string,string>;offset?:number;sort?:AdminQuerySort}
type Rule = readonly string[]|'uuid'|'date'|'text';
const propertyFilters = {moderation:['draft','pending','approved','rejected'],availability:['active','paused','sold'],origin:['personal','agency','assisted'],operation:['sale','swap','wanted','rent'],province:PROVINCES} satisfies Record<string,Rule>;
const reportFilters = {status:['open','reviewed'],from:'date',to:'date'} satisfies Record<string,Rule>;
export const ADMIN_QUERY_FILTERS:Record<AdminQuerySection,Readonly<Record<string,Rule>>> = {
  review:propertyFilters,listings:propertyFilters,
  accounts:{status:['active','suspended'],role:['owner','admin','member'],link:['personal','agency','assisted']},
  history:{action:'text',actor:'uuid',from:'date',to:'date'},
  propertyReports:{...reportFilters,reason:['fraud','misleading','unavailable','inappropriate','other']},
  messageReports:{...reportFilters,reason:['spam','fraud','harassment','other'],source:['personal','agency']},
  agencies:{state:['pending','needs_changes','approved','rejected','suspended'],verified:['true','false'],province:PROVINCES,review:['application','verification'],verificationState:['pending','needs_changes','approved','rejected','cancelled']},
  assistedCollaborators:{kind:['owner','manager','agency'],state:['active','withdrawn'],link:['linked','unlinked']},
  assistedListings:{collaboratorId:'uuid',moderation:propertyFilters.moderation,availability:propertyFilters.availability,eligible:['true','false']},
};
const namedSorts = ['newest','oldest','name'] as const;
const datedSorts = ['newest','oldest'] as const;
export const ADMIN_QUERY_SORTS:Record<AdminQuerySection,readonly AdminQuerySort[]> = {review:namedSorts,accounts:namedSorts,listings:namedSorts,history:datedSorts,propertyReports:datedSorts,messageReports:datedSorts,agencies:namedSorts,assistedCollaborators:namedSorts,assistedListings:namedSorts};
type CollaboratorRow = Omit<AssistedCollaborator,'linkEvidenceReference'> & {linkEvidenceReference:string|null};
type AssistedRow = Omit<AssistedListingRow,'lastConfirmedAt'> & {lastConfirmedAt:string|null};
export interface AdminAgencyQueryRow {application:AgencyApplication;request:AgencyVerificationRequest|null}
export interface AdminQueryItems {review:RemotePropertyRow;accounts:AdminAccount;listings:AdminListing;history:AdminEvent;propertyReports:PropertyReport;messageReports:ModerationReport;agencies:AdminAgencyQueryRow;assistedCollaborators:CollaboratorRow;assistedListings:AssistedRow}
export interface AdminQueryPage<S extends AdminQuerySection=AdminQuerySection> {items:AdminQueryItems[S][];total:number;hasMore:boolean}
export interface AdminDashboard {review:number;propertyReports:number;messageReports:number;agencies:number|null;verification:number|null}
export interface AdminHistoryActor {id:string;displayName:string}
const invalid=()=>new Error('No se pudieron interpretar los datos de administración.');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&v.length<=max&&!v.includes('\0');
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const integer=(v:unknown,min=1):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const nullableText=(v:unknown,max=1000)=>v===null||text(v,max);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>k in v);
const enumValue=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v);
const calendarDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&date(`${v}T00:00:00Z`)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;

/** Actor/token binding is supplied by useAdminApi, never by a caller's filter input. */
export function buildAdminQueryArgs(input:AdminQueryInput) {
  if(!input||!ADMIN_QUERY_SECTIONS.includes(input.section)||!text(input.query??'',100)||!integer(input.offset??0,0)||(input.offset??0)%ADMIN_PAGE_SIZE!==0||(input.offset??0)>100000||!ADMIN_QUERY_SORTS[input.section].includes(input.sort??'newest')) throw invalid();
  const filters:Record<string,string>={};
  if(input.filters!==undefined&&!object(input.filters))throw invalid();
  for(const [key,raw] of Object.entries(input.filters??{})) {
    const rule=ADMIN_QUERY_FILTERS[input.section][key];
    if(!Object.hasOwn(ADMIN_QUERY_FILTERS[input.section],key)||!rule||!text(raw,120))throw invalid();
    const value=raw.trim();if(value===''||value==='all')continue;
    if((Array.isArray(rule)&&!rule.includes(value))||(rule==='uuid'&&!isUuid(value))||(rule==='date'&&!calendarDate(value))||(rule==='text'&&value.length>80))throw invalid();
    filters[key]=value;
  }
  if(filters.from&&filters.to&&filters.from>filters.to)throw invalid();
  if(filters.verificationState&&filters.review!=='verification')throw invalid();
  return {p_section:input.section,p_query:(input.query??'').trim(),p_filters:filters,p_offset:input.offset??0,p_limit:ADMIN_PAGE_SIZE,p_sort:input.sort??'newest'};
}

/** Exactly PROPERTY_COLUMNS: compatible with mapRemoteListing/createRowSigner; no private evidence. */
export const ADMIN_REVIEW_COLUMNS = ['id','owner_id','client_request_id','title','location','province','latitude','longitude','location_precision','condition','floor','price_negotiable','price','bedrooms','bathrooms','area','type','description','amenities','photo_paths','availability','moderation','review_note','version','created_at','operation','swap_wants','swap_provinces','swap_balance','swap_amount','rent_period','rent_min_stay','wanted_operations','cover_thumb_path'] as const;
function decodeReview(v:Record<string,unknown>):RemotePropertyRow {
  if(!exact(v,ADMIN_REVIEW_COLUMNS)||!isUuid(v.id)||!isUuid(v.owner_id)||!text(v.client_request_id,100)||!text(v.title,100)||!text(v.location,120)||!text(v.province,100)||!text(v.description,3000)||!nullableText(v.review_note)||!Array.isArray(v.photo_paths)||!v.photo_paths.every(x=>text(x,500))||!Array.isArray(v.amenities)||!v.amenities.every(x=>text(x,100)))throw invalid();
  const row=v as unknown as RemotePropertyRow;mapRemoteListing(row,new Map());return row;
}
function decodeReport(section:'propertyReports'|'messageReports',v:Record<string,unknown>):PropertyReport|ModerationReport {
  const common=['id','propertyTitle','reporterId','reason','details','status','reviewNote','createdAt'];
  const keys=section==='propertyReports'?[...common,'propertyId','ownerId','unpublished','propertyLive']:[...common,'conversationId','reportedUserId','context'];
  if(!exact(v,keys)||!isUuid(v.id)||!isUuid(v.reporterId)||!text(v.propertyTitle,100)||!text(v.details)||!enumValue(v.status,['open','reviewed'])||!nullableText(v.reviewNote)||!date(v.createdAt))throw invalid();
  if(section==='propertyReports') {
    if(!isUuid(v.propertyId)||!isUuid(v.ownerId)||!enumValue(v.reason,['fraud','misleading','unavailable','inappropriate','other'])||typeof v.unpublished!=='boolean'||typeof v.propertyLive!=='boolean')throw invalid();
  } else {
    if(!isUuid(v.conversationId)||!isUuid(v.reportedUserId)||!enumValue(v.reason,['spam','fraud','harassment','other'])||!Array.isArray(v.context)||v.context.length>30)throw invalid();
    for(const m of v.context) {
      if(!object(m)||!exact(m,['id','conversationId','clientMessageId','senderId','body','seq','createdAt'])||!isUuid(m.id)||m.conversationId!==v.conversationId||!isUuid(m.clientMessageId)||!(m.senderId===null||isUuid(m.senderId))||!text(m.body,2000)||!integer(m.seq)||!date(m.createdAt))throw invalid();
    }
  }
  return v as unknown as PropertyReport|ModerationReport;
}
function decodeRow(section:AdminQuerySection,v:unknown):AdminQueryItems[AdminQuerySection] {
  if(!object(v))throw invalid();
  if(section==='accounts'||section==='listings'||section==='history')return decodeAdminPage(section,{items:[v],hasMore:false}).items[0];
  if(section==='review')return decodeReview(v);
  if(section==='propertyReports'||section==='messageReports')return decodeReport(section,v);
  if(section==='agencies') {
    if(!exact(v,['application','request']))throw invalid();
    const application=decodeAgencyApplication(v.application),request=v.request===null?null:decodeVerificationRequest(v.request);
    if(request&&request.agencyId!==application.agency.id)throw invalid();return {application,request};
  }
  if(section==='assistedCollaborators') {
    if(!exact(v,['id','kind','privateName','privateContact','contactChannel','accountId','linkEvidenceReference','version','state'])||!isUuid(v.id)||!integer(v.version)||!enumValue(v.state,['active','withdrawn'])||!(v.accountId===null||isUuid(v.accountId))||!nullableText(v.linkEvidenceReference,500))throw invalid();
    validateCollaborator({...v,linkEvidenceReference:v.linkEvidenceReference??undefined} as unknown as AssistedCollaborator);return v as unknown as CollaboratorRow;
  }
  if(!exact(v,['id','title','ownerId','version','provenanceVersion','moderation','availability','collaboratorId','collaboratorReference','lastConfirmedAt','eligible'])||!isUuid(v.id)||!isUuid(v.ownerId)||!isUuid(v.collaboratorId)||!text(v.title,100)||!integer(v.version)||!integer(v.provenanceVersion)||!enumValue(v.moderation,['draft','pending','approved','rejected'])||!enumValue(v.availability,['active','paused','sold'])||!text(v.collaboratorReference,100)||!(v.lastConfirmedAt===null||date(v.lastConfirmedAt))||typeof v.eligible!=='boolean')throw invalid();
  return v as unknown as AssistedRow;
}
export function decodeAdminQueryPage<S extends AdminQuerySection>(section:S,value:unknown):AdminQueryPage<S> {
  if(!ADMIN_QUERY_SECTIONS.includes(section)||!object(value)||!exact(value,['items','total','hasMore'])||!Array.isArray(value.items)||value.items.length>ADMIN_PAGE_SIZE||!integer(value.total,0)||value.total<value.items.length||typeof value.hasMore!=='boolean'||(value.hasMore&&(value.items.length===0||value.total<=value.items.length)))throw invalid();
  return {items:value.items.map(v=>decodeRow(section,v)) as AdminQueryItems[S][],total:value.total,hasMore:value.hasMore};
}
export function decodeAdminDashboard(value:unknown):AdminDashboard {
  if(!object(value)||!exact(value,['review','propertyReports','messageReports','agencies','verification'])||!['review','propertyReports','messageReports'].every(k=>integer(value[k],0))||!['agencies','verification'].every(k=>value[k]===null||integer(value[k],0)))throw invalid();
  return value as unknown as AdminDashboard;
}
export function decodeAdminHistoryActors(value:unknown):AdminHistoryActor[] {
  if(!Array.isArray(value))throw invalid();
  const seen=new Set<string>();
  return value.map(row=>{
    if(!object(row)||!exact(row,['id','displayName'])||!isUuid(row.id)||!text(row.displayName,80)||row.displayName.trim().length<2||seen.has(row.id.toLowerCase()))throw invalid();
    seen.add(row.id.toLowerCase());return {id:row.id,displayName:row.displayName};
  });
}
