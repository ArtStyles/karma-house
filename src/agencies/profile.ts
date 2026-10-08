import type {SupabaseClient} from '@supabase/supabase-js';
import type {AgencyApplicationInput,AgencyRequestContext} from './types.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {object,text,uuid,integer,nullableText} from './deals/domain.ts';
import {agencyField,normalizeAgencyApplication} from './domain.ts';
import {decodePrincipalStatus,principalCommercialDraft} from './principal.ts';
export type CommercialInput=Omit<AgencyApplicationInput,'responsibleFullName'|'evidenceReferences'>;
export interface CommercialProfile {agencyId:string;version:number;logoPath:string|null;input:CommercialInput;isPrincipal?:boolean;commercialProfileComplete?:boolean}
interface PublicAgencyIdentity {agencyId:string;tradeName:string;logoPath:string|null;verified:boolean;isPrincipal?:boolean}
export type PublicAgencyProfile=(PublicAgencyIdentity&{identityOnly:true})|(PublicAgencyIdentity&Omit<CommercialInput,'publishOfficeAddress'|'officeAddress'>&{identityOnly?:false;officeAddress?:string});
export function commercialInput(value:unknown):CommercialInput{
 const raw=object(value);if('responsibleFullName'in raw||'evidenceReferences'in raw)throw Error('Perfil comercial inválido.');
 const {responsibleFullName:_,evidenceReferences:__,...input}=normalizeAgencyApplication({...raw,responsibleFullName:'Validación comercial',evidenceReferences:[]});return input;
}
export function decodePublicAgencyProfile(value:unknown):PublicAgencyProfile{
 const v=object(value);if(typeof v.verified!=='boolean'||Object.keys(v).some(k=>!['agencyId','tradeName','businessPhone','province','municipality','serviceAreas','description','logoPath','verified','officeAddress','isPrincipal','identityOnly'].includes(k)))throw Error('Perfil público inválido.');
 const isPrincipal=decodePrincipalStatus(v.isPrincipal,v.verified);
 if(v.identityOnly===true){
  if(!isPrincipal||Object.keys(v).some(k=>!['agencyId','tradeName','logoPath','verified','isPrincipal','identityOnly'].includes(k)))throw Error('Perfil público inválido.');
  return {agencyId:uuid(v.agencyId),tradeName:agencyField(v.tradeName,2,120,'el nombre comercial'),logoPath:nullableText(v.logoPath),verified:v.verified,isPrincipal,identityOnly:true};
 }
 if(v.identityOnly!==undefined&&v.identityOnly!==false)throw Error('Perfil público inválido.');
 const input=commercialInput({tradeName:v.tradeName,businessPhone:v.businessPhone,province:v.province,municipality:v.municipality,serviceAreas:v.serviceAreas,description:v.description,officeAddress:v.officeAddress??null,publishOfficeAddress:v.officeAddress!==undefined});
 const {officeAddress,publishOfficeAddress:_,...rest}=input;
 return {...rest,agencyId:uuid(v.agencyId),logoPath:nullableText(v.logoPath),verified:v.verified,isPrincipal,...(officeAddress?{officeAddress}:{})};
}
export function createAgencyProfileRepository(client:SupabaseClient){
 const rpc=createScopedRpc(client),decode=(raw:unknown,c:AgencyRequestContext):CommercialProfile=>{
  const v=object(raw);if(v.agencyId!==c.agencyId)throw Error('Perfil de otra agencia.');
  const isPrincipal=decodePrincipalStatus(v.isPrincipal,true),commercialProfileComplete=v.commercialProfileComplete===undefined?true:v.commercialProfileComplete;
  if(typeof commercialProfileComplete!=='boolean'||(!commercialProfileComplete&&!isPrincipal))throw Error('Perfil comercial inválido.');
  let input:CommercialInput;
  if(commercialProfileComplete)input=commercialInput(v.input);
  else{
   const rawInput=object(v.input),draft=principalCommercialDraft(agencyField(rawInput.tradeName,2,120,'el nombre comercial'));
   if(Object.keys(rawInput).length!==Object.keys(draft).length||Object.entries(draft).some(([key,expected])=>JSON.stringify(rawInput[key])!==JSON.stringify(expected)))throw Error('Perfil comercial inválido.');
   input=draft;
  }
  return {agencyId:uuid(v.agencyId),version:integer(v.version,1),logoPath:nullableText(v.logoPath),input,isPrincipal,commercialProfileComplete};
 };
 return {async get(c:AgencyRequestContext){return decode(await rpc('kh_get_agency_profile',{p_agency_id:c.agencyId},c),c);},async save(payload:{input:CommercialInput;expectedVersion:number;clientRequestId:string;logoPath?:string|null},c:AgencyRequestContext){uuid(payload.clientRequestId);return decode(await rpc('kh_update_agency_profile',{p_agency_id:c.agencyId,p_payload:{...payload,input:commercialInput(payload.input)}},c),c);}};
}
