import type {SupabaseClient} from '@supabase/supabase-js';
import type {AgencyRequestContext} from './types.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {object,uuid,nullableUuid} from './deals/domain.ts';
import {listingShareUrl} from '../lib/publicSite.ts';
export interface AgencyShareContext {propertyId:string;agencyId:string;managerId:string|null}
export function decodeAgencyShareContext(value:unknown):AgencyShareContext{const v=object(value);return{propertyId:uuid(v.propertyId),agencyId:uuid(v.agencyId),managerId:nullableUuid(v.managerId)};}
export function agencyShareUrl(v:AgencyShareContext){return `${listingShareUrl(uuid(v.propertyId))}?agencyId=${uuid(v.agencyId)}${v.managerId?`&managerId=${uuid(v.managerId)}`:''}`;}
export async function prepareAgencyShare(client:SupabaseClient,propertyId:string,c:AgencyRequestContext){const r=decodeAgencyShareContext(await createScopedRpc(client)('kh_agency_share_context',{p_property_id:uuid(propertyId),p_agency_id:c.agencyId,p_manager_id:c.userId},c));if(r.agencyId!==c.agencyId||r.managerId!==c.userId)throw Error('Destino de contacto inválido.');return r;}
export async function validatePublicAgencyShare(client:SupabaseClient,propertyId:string,agencyId:string,managerId?:string,signal?:AbortSignal){let query=client.rpc('kh_public_agency_share_context',{p_property_id:uuid(propertyId),p_agency_id:uuid(agencyId),p_manager_id:managerId?uuid(managerId):null});if(signal)query=query.abortSignal(signal);const {data,error}=await query;if(error)throw error;if(signal?.aborted)throw Error('KH_ACCOUNT_CHANGED');return data===null?null:decodeAgencyShareContext(data);}
