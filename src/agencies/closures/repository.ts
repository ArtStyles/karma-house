import type {SupabaseClient} from '@supabase/supabase-js';
import {createScopedRpc} from '../../transfers/repository.ts';
import {decodeAgencyPage} from '../repository.ts';
import {integer,uuid,nullableUuid,nullableText,object,text,invalidAgencyData} from '../deals/domain.ts';
import {decodeSaleRequest,decodeDecision,validateRequest,validateDecision} from './domain.ts';
import type {AgencyClosureRepository} from './types.ts';
export function createAgencyClosureRepository(client:SupabaseClient):AgencyClosureRepository{const rpc=createScopedRpc(client);return{
 async prepare(id,c){const v=object(await rpc('kh_prepare_agency_sale',{p_agency_id:uuid(c.agencyId),p_deal_id:uuid(id)},c));if(v.dealId!==id)throw invalidAgencyData();return{dealId:uuid(v.dealId),propertyId:uuid(v.propertyId),propertyTitle:text(v.propertyTitle),expectedPropertyVersion:integer(v.expectedPropertyVersion,1),expectedAuthorityVersion:integer(v.expectedAuthorityVersion,1),executingManagerId:nullableUuid(v.executingManagerId),executingManagerName:nullableText(v.executingManagerName)};},
 async request(input,c){const r=decodeSaleRequest(await rpc('kh_request_agency_sale',{p_agency_id:uuid(c.agencyId),p_payload:validateRequest(input)},c));if(r.executingAgencyId!==c.agencyId||r.executingManagerId!==input.executingManagerId||r.winningDealId!==input.winningDealId)throw invalidAgencyData();return r;},
 async list(input,c){if(!['incoming','outgoing'].includes(input.scope))throw invalidAgencyData();return decodeAgencyPage(await rpc('kh_list_agency_sale_requests',{p_agency_id:uuid(c.agencyId),p_scope:input.scope,p_offset:integer(input.offset),p_limit:30},c),decodeSaleRequest);},
 async decide(input,c){return decodeDecision(await rpc('kh_decide_agency_sale',{p_agency_id:uuid(c.agencyId),p_payload:validateDecision(input)},c),input.requestId);},
 async personalList(offset,c){return decodeAgencyPage(await rpc('kh_list_personal_sale_requests',{p_offset:integer(offset),p_limit:30},c),decodeSaleRequest);},
 async personalDecide(input,c){return decodeDecision(await rpc('kh_decide_personal_sale',{p_payload:validateDecision(input)},c),input.requestId);}
};}
