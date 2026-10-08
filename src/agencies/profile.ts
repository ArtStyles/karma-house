import type {SupabaseClient} from '@supabase/supabase-js';
import type {AgencyApplicationInput,AgencyRequestContext} from './types.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {object,text,uuid,integer,nullableText} from './deals/domain.ts';
import {normalizeAgencyApplication} from './domain.ts';
export type CommercialInput=Omit<AgencyApplicationInput,'responsibleFullName'|'evidenceReferences'>;
export interface CommercialProfile {agencyId:string;version:number;logoPath:string|null;input:CommercialInput}
export interface PublicAgencyProfile extends Omit<CommercialInput,'publishOfficeAddress'|'officeAddress'> {agencyId:string;logoPath:string|null;verified:boolean;officeAddress?:string}
export function commercialInput(value:unknown):CommercialInput{
 const raw=object(value);if('responsibleFullName'in raw||'evidenceReferences'in raw)throw Error('Perfil comercial inválido.');
 const {responsibleFullName:_,evidenceReferences:__,...input}=normalizeAgencyApplication({...raw,responsibleFullName:'Validación comercial',evidenceReferences:[]});return input;
}
export function decodePublicAgencyProfile(value:unknown):PublicAgencyProfile{
 const v=object(value);if(typeof v.verified!=='boolean'||Object.keys(v).some(k=>!['agencyId','tradeName','businessPhone','province','municipality','serviceAreas','description','logoPath','verified','officeAddress'].includes(k)))throw Error('Perfil público inválido.');
 const input=commercialInput({tradeName:v.tradeName,businessPhone:v.businessPhone,province:v.province,municipality:v.municipality,serviceAreas:v.serviceAreas,description:v.description,officeAddress:v.officeAddress??null,publishOfficeAddress:v.officeAddress!==undefined});
 const {officeAddress,publishOfficeAddress:_,...rest}=input;
 return {...rest,agencyId:uuid(v.agencyId),logoPath:nullableText(v.logoPath),verified:v.verified,...(officeAddress?{officeAddress}:{})};
}
export function createAgencyProfileRepository(client:SupabaseClient){
 const rpc=createScopedRpc(client),decode=(raw:unknown,c:AgencyRequestContext)=>{const v=object(raw);if(v.agencyId!==c.agencyId)throw Error('Perfil de otra agencia.');return {agencyId:uuid(v.agencyId),version:integer(v.version,1),logoPath:nullableText(v.logoPath),input:commercialInput(v.input)};};
 return {async get(c:AgencyRequestContext){return decode(await rpc('kh_get_agency_profile',{p_agency_id:c.agencyId},c),c);},async save(payload:{input:CommercialInput;expectedVersion:number;clientRequestId:string;logoPath?:string|null},c:AgencyRequestContext){uuid(payload.clientRequestId);return decode(await rpc('kh_update_agency_profile',{p_agency_id:c.agencyId,p_payload:{...payload,input:commercialInput(payload.input)}},c),c);}};
}
