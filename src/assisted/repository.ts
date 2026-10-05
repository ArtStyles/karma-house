import type {SupabaseClient} from '@supabase/supabase-js';import type {MessagingRequestContext} from '../messaging/types.ts';import type {Listing,ListingDraft} from '../domain/listings.ts';
import {isUuid} from '../messaging/domain.ts';import {createScopedRpc} from '../transfers/repository.ts';import {validateCollaborator,validateProvenance,validateDraftProvenance} from './domain.ts';import type {AssistedCapabilities,AssistedCollaborator,AssistedCollaboratorInput,AssistedListingRow,AssistedProvenance} from './types.ts';
import {propertyPayload} from '../data/propertyPayload.ts';import {uploadDraftPhotos,uploadCoverThumb,type PhotoUploadPort} from '../data/photoUpload.ts';import {mapRemoteListing,type RemotePropertyRow} from '../data/remoteMapping.ts';
const invalid=()=>Error('No se pudieron interpretar los datos privados.');
function collaborator(value:unknown):AssistedCollaborator {const x=value as AssistedCollaborator;if(!x||!isUuid(x.id)||!Number.isInteger(x.version)||x.version<1||!['active','withdrawn'].includes(x.state))throw invalid();validateCollaborator(x);return x;}
function page<T>(value:unknown,decode:(v:unknown)=>T){const p=value as {items:unknown[];hasMore:boolean};if(!p||!Array.isArray(p.items)||p.items.length>50||typeof p.hasMore!=='boolean')throw invalid();return {items:p.items.map(decode),hasMore:p.hasMore};}
export function createAssistedRepository(client:SupabaseClient,media:{port(context:MessagingRequestContext):PhotoUploadPort;sign(row:RemotePropertyRow,context:MessagingRequestContext):Promise<Listing>}){
 const rpc=createScopedRpc(client);
 return {
  async capabilities(context:MessagingRequestContext):Promise<AssistedCapabilities>{const r=await rpc('kh_assisted_capabilities',{},context) as AssistedCapabilities;if(!r||['canPrepare','canOffer','transfersEnabled'].some(k=>typeof r[k as keyof AssistedCapabilities]!=='boolean'))throw invalid();return r;},
  async collaborators(offset:number,context:MessagingRequestContext){return page(await rpc('kh_admin_assisted_collaborators',{p_offset:offset},context),collaborator);},
  async saveCollaborator(input:AssistedCollaboratorInput,context:MessagingRequestContext){return collaborator(await rpc('kh_admin_save_assisted_collaborator',{p_payload:validateCollaborator(input)},context));},
  async listings(id:string,offset:number,context:MessagingRequestContext){return page(await rpc('kh_admin_list_assisted_listings',{p_collaborator_id:id,p_offset:offset},context),(value):AssistedListingRow=>{const x=value as AssistedListingRow;if(!x||!isUuid(x.id)||!isUuid(x.ownerId)||!isUuid(x.collaboratorId)||!Number.isInteger(x.version)||!Number.isInteger(x.provenanceVersion)||typeof x.eligible!=='boolean'||typeof x.title!=='string')throw invalid();return x;});},
  async provenance(id:string,context:MessagingRequestContext):Promise<AssistedProvenance|null>{const value=await rpc('kh_get_assisted_record',{p_property_id:id},context);return value==null?null:validateDraftProvenance(value as AssistedProvenance);},
  async revoke(id:string,version:number,context:MessagingRequestContext){await rpc('kh_revoke_assisted_permission',{p_property_id:id,p_expected_version:version},context);},
  async save(draft:ListingDraft,provenance:AssistedProvenance,moderation:'draft'|'pending',current:Listing|undefined,context:MessagingRequestContext){
   const proof=moderation==='draft'?validateDraftProvenance(provenance):validateProvenance(provenance),requestId=draft.clientRequestId;if(!requestId)throw Error('Falta el identificador del borrador.');if(current&&current.ownerId!==context.userId)throw Error('KH_PROPERTY_MANAGEMENT_CHANGED');
   const port=media.port(context),photos=draft.photos??(draft.photoUri?[{uri:draft.photoUri}]:[]);
   const paths=await uploadDraftPhotos(photos,context.userId,requestId,port,context.checkpoint,current?{propertyId:current.id,reusablePaths:current.photos?.flatMap(x=>x.storagePath?[x.storagePath]:[])??[]}:undefined);
   const thumb=paths[0]?.startsWith(`${context.userId}/${requestId}/`)?await uploadCoverThumb(photos[0],paths,port,context.checkpoint):undefined;
   const value=await rpc('kh_save_assisted_property',{p_listing_payload:propertyPayload(draft,context.userId,paths,moderation,current,thumb),p_provenance_payload:proof},context) as RemotePropertyRow;
   mapRemoteListing(value,new Map());return media.sign(value,context);
  },
 };
}
