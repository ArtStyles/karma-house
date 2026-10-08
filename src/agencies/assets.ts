import type {SupabaseClient} from '@supabase/supabase-js';
import type {MessagingRequestContext} from '../messaging/types.ts';
import {isUuid} from '../messaging/domain.ts';
import {createScopedRpc} from '../transfers/repository.ts';
import {decodeAgencyApplication} from './repository.ts';
export interface AgencyLogoUpload{data:ArrayBuffer;contentType:string}
export function validateAgencyLogo(logo:AgencyLogoUpload){
 if(logo.data.byteLength<3||logo.data.byteLength>1048576)throw Error('El logo debe ocupar como máximo 1 MiB.');
 const bytes=new Uint8Array(logo.data);
 if(logo.contentType!=='image/jpeg'||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Selecciona un logo JPEG válido.');
}
export async function agencyRegistrationAvailable(client:SupabaseClient,signal?:AbortSignal){
 let query=client.rpc('kh_agency_registration_available');if(signal)query=query.abortSignal(signal);
 const {data,error}=await query;if(error)throw error;if(typeof data!=='boolean')throw Error('No se pudo comprobar el registro de inmobiliarias.');return data;
}
export function createAgencyAssetsRepository(url:string,key:string,fetcher:typeof fetch=fetch){
 const base=url.replace(/\/$/,'');
 return {async upload(agencyId:string,assetId:string,logo:AgencyLogoUpload,context:MessagingRequestContext){
 context.checkpoint();validateAgencyLogo(logo);if(!isUuid(agencyId)||!isUuid(assetId))throw Error('Revisa el identificador del logo.');
 const path=`${agencyId}/logos/${assetId}.jpg`;
 const response=await fetcher(`${base}/storage/v1/object/agency-assets/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${context.accessToken}`,'Content-Type':'image/jpeg','x-upsert':'false'},body:logo.data,signal:context.signal});
 context.checkpoint();if(!response.ok)throw Error('No se pudo subir el logo. Actualiza antes de intentarlo de nuevo.');return path;
 },async sign(path:string,context:MessagingRequestContext){
 context.checkpoint();if(!/^[0-9a-f-]{36}\/logos\/[0-9a-f-]{36}\.jpg$/.test(path))throw Error('Revisa la ruta del logo.');
 const response=await fetcher(`${base}/storage/v1/object/sign/agency-assets/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${context.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300}),signal:context.signal});
 const result=await response.json().catch(()=>null);context.checkpoint();if(!response.ok||typeof result?.signedURL!=='string')throw Error('No se pudo cargar el logo para revisión.');
 const raw=result.signedURL as string,uri=new URL(raw.startsWith('/object/')?`${base}/storage/v1${raw}`:raw,base),origin=new URL(base);
 if(uri.origin!==origin.origin||decodeURIComponent(uri.pathname)!==`/storage/v1/object/sign/agency-assets/${path}`||!uri.searchParams.get('token'))throw Error('No se pudo interpretar el logo.');return uri.toString();
 }};
}
export async function attachAgencyLogo(client:SupabaseClient,agencyId:string,path:string,expectedVersion:number,context:MessagingRequestContext){
 return decodeAgencyApplication(await createScopedRpc(client)('kh_set_agency_logo',{p_agency_id:agencyId,p_path:path,p_expected_version:expectedVersion},context));
}
