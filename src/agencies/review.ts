import type {SupabaseClient} from '@supabase/supabase-js';
import type {MessagingRequestContext} from '../messaging/types.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {isUuid} from '../messaging/domain.ts';
import {decodeAgencyApplication,decodeVerificationRequest} from './repository.ts';
export async function loadAgencyReviewDetail(client:SupabaseClient,agencyId:string,context:MessagingRequestContext){
 if(!isUuid(agencyId))throw Error('Revisa la inmobiliaria.');
 const value=await createScopedRpc(client)('kh_agency_review_detail',{p_agency_id:agencyId},context);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('No se pudo interpretar la revisión.');
 const record=value as Record<string,unknown>,application=decodeAgencyApplication(record.application),request=record.request===null?null:decodeVerificationRequest(record.request);
 if(application.agency.id!==agencyId||(request&&request.agencyId!==agencyId))throw Error('No se pudo interpretar la revisión.');
 return {application,request};
}
