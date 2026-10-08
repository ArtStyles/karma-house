import type {SupabaseClient} from '@supabase/supabase-js';
import {isUuid} from '../../messaging/domain.ts';
import {mapRemoteListing,type RemotePropertyRow} from '../../data/remoteMapping.ts';
import {propertyPayload} from '../../data/propertyPayload.ts';
import {uploadDraftPhotos,uploadCoverThumb,type PhotoUploadPort} from '../../data/photoUpload.ts';
import {createScopedRpc} from '../../transfers/repository.ts';
import {decodeAgencyPage} from '../repository.ts';
import type {AgencyRequestContext} from '../types.ts';
import type {AgencyProperty,AgencyPropertyRepository} from './types.ts';
const invalid=()=>Error('No se pudieron interpretar los datos de la vivienda empresarial.');
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Record<string,unknown>}
function uuid(v:unknown):string{if(!isUuid(v))throw invalid();return v}
function version(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)throw invalid();return v}
function boolean(v:unknown):boolean{if(typeof v!=='boolean')throw invalid();return v}
export function decodeAgencyProperty(value:unknown,agencyId:string,urls:ReadonlyMap<string,string>=new Map()):AgencyProperty{
 const v=object(value),m=object(v.mandate),p=object(v.property);
 uuid(p.id);uuid(p.owner_id);
 if(m.agencyId!==agencyId||!['active','withdrawn'].includes(String(m.state))||typeof m.reference!=='string'||!m.reference.trim()||!['requires_review','direct'].includes(String(v.publicationPolicy)))throw invalid();
 if(!['title','location','province','description','client_request_id','created_at'].every(k=>typeof p[k]==='string')||!['number','string'].includes(typeof p.price)||(p.area!==null&&!['number','string'].includes(typeof p.area))||(p.review_note!==null&&typeof p.review_note!=='string')||!Array.isArray(p.photo_paths)||p.photo_paths.length>6||!p.photo_paths.every(path=>typeof path==='string'&&/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/.test(path))||!Array.isArray(p.amenities)||!p.amenities.every(a=>typeof a==='string'))throw invalid();
 let property;try{property=mapRemoteListing(p as unknown as RemotePropertyRow,urls)}catch{throw invalid()}
 // Custody is never a contact or a personal ownership affordance in this repository.
 delete property.ownerId;
 return {property,originAgencyId:v.originAgencyId===null?null:uuid(v.originAgencyId),authorityVersion:version(v.authorityVersion),cycleId:uuid(v.cycleId),mandate:{agencyId:uuid(m.agencyId),state:m.state as 'active'|'withdrawn',version:version(m.version),reference:m.reference},canEditCommon:boolean(v.canEditCommon),canConfirmSale:boolean(v.canConfirmSale),publicationPolicy:v.publicationPolicy as AgencyProperty['publicationPolicy'],moderationHold:boolean(v.moderationHold)};
}
export interface AgencyPropertyMedia {photos(context:AgencyRequestContext):PhotoUploadPort;sign(paths:string[],context:AgencyRequestContext):Promise<ReadonlyMap<string,string>>}
export function createAgencyPropertyRepository(client:SupabaseClient,media?:AgencyPropertyMedia):AgencyPropertyRepository{
 const rpc=createScopedRpc(client);
 async function decode(value:unknown,context:AgencyRequestContext){const item=decodeAgencyProperty(value,context.agencyId);const paths=[...(item.property.photos??[]).map(p=>p.storagePath!),...(item.property.coverThumb?[item.property.coverThumb.storagePath]:[])];if(media&&paths.length){const urls=await media.sign(paths,context);context.checkpoint();return decodeAgencyProperty(value,context.agencyId,urls)}return item;}
 return {
  async list(offset,context){if(!Number.isSafeInteger(offset)||offset<0)throw invalid();const page=decodeAgencyPage(await rpc('kh_agency_properties',{p_agency_id:uuid(context.agencyId),p_offset:offset,p_limit:30},context),v=>decodeAgencyProperty(v,context.agencyId));return {items:await Promise.all(page.items.map(async item=>{if(!media)return item;const paths=[...(item.property.photos??[]).map(p=>p.storagePath!),...(item.property.coverThumb?[item.property.coverThumb.storagePath]:[])];if(!paths.length)return item;const urls=await media.sign(paths,context);context.checkpoint();return {...item,property:{...item.property,photos:item.property.photos?.map(p=>({...p,uri:urls.get(p.storagePath!)??''})),coverThumb:item.property.coverThumb?{...item.property.coverThumb,uri:urls.get(item.property.coverThumb.storagePath)??''}:undefined}}})),hasMore:page.hasMore}},
  async get(id,context){const item=await decode(await rpc('kh_agency_property',{p_property_id:uuid(id),p_agency_id:uuid(context.agencyId)},context),context);if(item.property.id!==id)throw invalid();return item},
  async save(input,context){
   context.checkpoint();uuid(input.clientRequestId);if((input.draft.operation??'sale')!=='sale')throw Error('La cartera empresarial admite viviendas en venta.');
   if(!['draft','submit'].includes(input.publicationIntent)||!input.sourceReference.trim()||!input.consentReference.trim())throw Error('Añade las referencias de origen y autorización.');
   const current=input.propertyId?await this.get(input.propertyId,context):undefined;
   if(current&&!current.canEditCommon)throw Error('Solo el administrador de la inmobiliaria de origen puede editar esta vivienda.');
   const photos=input.draft.photos??[],request=input.clientRequestId;
   const reusable=current?.property.photos?.flatMap(p=>p.storagePath?[p.storagePath]:[])??[];
   let paths:string[],thumb:string|undefined;
   if(media){const port=media.photos(context);paths=await uploadDraftPhotos(photos,context.userId,request,port,context.checkpoint,current?{propertyId:current.property.id,reusablePaths:reusable}:undefined);thumb=await uploadCoverThumb(photos[0],paths,port,context.checkpoint,{ownerId:context.userId,requestId:request});}
   else {if(photos.some(p=>!p.storagePath))throw Error('No se pudo preparar la carga de fotografías.');paths=photos.map(p=>p.storagePath!);}
   if(current&&photos[0]?.thumbUri&&photos[0].storagePath!==current.property.photos?.[0]?.storagePath&&!thumb)throw Error('No pudimos guardar la miniatura de la nueva portada. Vuelve a prepararla antes de guardar.');
   const {ownerId:_owner,moderation:_moderation,clientRequestId:_request,...draft}=propertyPayload(input.draft,context.userId,paths,'draft',undefined,thumb);
   const item=await decode(await rpc('kh_agency_save_property',{p_agency_id:uuid(context.agencyId),p_payload:{draft,publicationIntent:input.publicationIntent,sourceReference:input.sourceReference.trim(),consentReference:input.consentReference.trim(),clientRequestId:request,...(input.propertyId?{propertyId:input.propertyId,expectedVersion:version(input.expectedVersion)}:{})}},context),context);
   if(input.propertyId&&item.property.id!==input.propertyId)throw invalid();if(item.originAgencyId!==context.agencyId)throw invalid();return item;
  },
 };
}
