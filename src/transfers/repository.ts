import type {SupabaseClient} from '@supabase/supabase-js';import type {MessagingRequestContext} from '../messaging/types.ts';
import {scopedAdminRequest} from '../admin/request.ts';import {decodeTransferDecision,decodeTransferRequest,validateOffer} from './domain.ts';import type {ListingTransferRepository} from './types.ts';
export function createScopedRpc(client:SupabaseClient){return async(name:string,args:Record<string,unknown>,context:MessagingRequestContext):Promise<unknown>=>scopedAdminRequest(async()=>{
 if(context.signal.aborted)throw Error('KH_ACCOUNT_CHANGED');
 const {data,error}=await client.rpc(name,{...args,p_actor_id:context.userId}).setHeader('Authorization',`Bearer ${context.accessToken}`).abortSignal(context.signal);
 context.checkpoint();if(context.signal.aborted)throw Error('KH_ACCOUNT_CHANGED');if(error)throw error;return data;
},context.checkpoint);}
export function createListingTransferRepository(client:SupabaseClient):ListingTransferRepository {
 const rpc=createScopedRpc(client);
 const decode=(value:unknown,context:MessagingRequestContext)=>{const r=decodeTransferRequest(value);if(context.userId!==r.recipient.id&&context.userId!==r.sourceManagerId)throw Error('No se pudo interpretar la solicitud.');return r;};
 return {
  async list(scope,offset,context){const value=await rpc('kh_list_listing_transfers',{p_scope:scope,p_offset:offset},context) as {items?:unknown;hasMore?:unknown};if(!value||!Array.isArray(value.items)||value.items.length>50||typeof value.hasMore!=='boolean')throw Error('No se pudo interpretar la solicitud.');const items=value.items.map(x=>decode(x,context));if(items.some(x=>(scope==='incoming'?x.recipient.id:x.sourceManagerId)!==context.userId))throw Error('No se pudo interpretar la solicitud.');return {items,hasMore:value.hasMore};},
  async get(id,context){const r=decode(await rpc('kh_get_listing_transfer',{p_request_id:id},context),context);if(r.id!==id)throw Error('No se pudo interpretar la solicitud.');return r;},
  async offer(input,context){return decode(await rpc('kh_offer_listing_transfer',{p_payload:validateOffer(input)},context),context);},
  async decide(input,context){const r=decodeTransferDecision(await rpc('kh_decide_listing_transfer',{p_payload:input},context));if(r.requestId!==input.requestId)throw Error('No se pudo interpretar la solicitud.');return r;},
 };
}
