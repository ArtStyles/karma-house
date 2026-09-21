import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessagingRequestContext } from '../messaging/types.ts';
import { isUuid } from '../messaging/domain.ts';
import { havanaVisitInstant, NEGOTIATION_PAGE_SIZE, NegotiationError } from './domain.ts';
import type { Negotiation, NegotiationRepository } from './types.ts';

const invalid = () => new NegotiationError('No se pudo interpretar la propuesta. Actualiza la lista y vuelve a intentar.');
export function decodeNegotiation(value: unknown): Negotiation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const item = value as Negotiation;
  if (![item.id,item.conversationId,item.propertyId,item.buyerId,item.sellerId,item.createdBy].every(isUuid)
    || item.buyerId === item.sellerId || ![item.buyerId,item.sellerId].includes(item.createdBy)
    || !['visit','offer'].includes(item.kind) || !['pending','accepted','declined','cancelled','superseded','expired'].includes(item.status)
    || !Number.isSafeInteger(item.version) || item.version < 1 || typeof item.canAct !== 'boolean'
    || typeof item.propertyTitle !== 'string' || item.propertyTitle.length > 200 || typeof item.propertyLocation !== 'string' || item.propertyLocation.length > 200
    || typeof item.note !== 'string' || [...item.note].length > 500 || item.note.includes('\u0000')
    || ![item.createdAt,item.updatedAt,item.expiresAt].every(date => typeof date === 'string' && date.length <= 40 && Number.isFinite(Date.parse(date)))
    || item.parentId !== null && !isUuid(item.parentId)) throw invalid();
  if (item.kind === 'offer') {
    if (typeof item.amountUsd !== 'number' || !Number.isFinite(item.amountUsd) || item.amountUsd <= 0 || item.amountUsd > 1_000_000_000
      || Number(item.amountUsd.toFixed(2)) !== item.amountUsd || item.visitDate !== null || item.visitTime !== null || item.visitAt !== null) throw invalid();
  } else {
    if (item.amountUsd !== null || typeof item.visitDate !== 'string' || typeof item.visitTime !== 'string' || typeof item.visitAt !== 'string') throw invalid();
    try { if (Date.parse(havanaVisitInstant(item.visitDate,item.visitTime)) !== Date.parse(item.visitAt) || Date.parse(item.expiresAt) !== Date.parse(item.visitAt)) throw invalid(); } catch { throw invalid(); }
  }
  return { ...item };
}
export function createSupabaseNegotiationRepository(client: SupabaseClient): NegotiationRepository {
  const rpc = async (name: string, parameters: Record<string,unknown>, context: MessagingRequestContext): Promise<unknown> => {
    context.checkpoint(); if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    const {data,error} = await client.rpc(name,{...parameters,p_actor_id:context.userId}).setHeader('Authorization',`Bearer ${context.accessToken}`).abortSignal(context.signal);
    context.checkpoint(); if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    if (error) throw error; return data;
  };
  const decode = (value: unknown, actor: string) => { const item=decodeNegotiation(value); if (![item.buyerId,item.sellerId].includes(actor)) throw invalid(); return item; };
  return {
    async list(options,context) {
      if (!Number.isSafeInteger(options.offset) || options.offset < 0 || options.conversationId !== undefined && !isUuid(options.conversationId)) throw invalid();
      const result=await rpc('kh_list_negotiations',{p_conversation_id:options.conversationId ?? null,p_pending_only:options.pendingOnly ?? false,p_offset:options.offset,p_limit:NEGOTIATION_PAGE_SIZE},context);
      if (!Array.isArray(result) || result.length > NEGOTIATION_PAGE_SIZE) throw invalid();
      const rows=result.map(value=>decode(value,context.userId));
      if (rows.some(item=>options.conversationId && item.conversationId!==options.conversationId || options.pendingOnly && item.status!=='pending') || new Set(rows.map(item=>item.id)).size!==rows.length) throw invalid();
      return rows;
    },
    async create(input,context) {
      // Do not revalidate future time here: an idempotent retry may occur after a visit expires.
      const item=decode(await rpc('kh_create_negotiation',{p_payload:input},context),context.userId);
      if(item.conversationId!==input.conversationId || item.kind!==input.kind || item.createdBy!==context.userId || item.parentId!==(input.replacesId ?? null)) throw invalid();
      return item;
    },
    async respond(input,context) {
      const item=decode(await rpc('kh_respond_negotiation',{p_payload:input},context),context.userId);
      if(item.id!==input.id) throw invalid(); return item;
    },
  };
}
