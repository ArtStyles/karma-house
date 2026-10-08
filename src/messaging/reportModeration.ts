import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatReport } from './types';
import {createMessageId} from './domain.ts';
export type ModerationReport=Omit<ChatReport,'context'>&{context:(Omit<ChatMessage,'senderId'>&{senderId:string|null})[]};

const failure = () => new Error('No pudimos cargar o actualizar los reportes. Comprueba tu conexión y el acceso de tu cuenta.');
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string';
function message(value: unknown,allowDeleted=false): value is ModerationReport['context'][number] {
  return record(value) && ['id', 'conversationId', 'clientMessageId', 'body', 'createdAt'].every(key => text(value[key])) && (text(value.senderId)||(allowDeleted&&value.senderId===null)) && typeof value.seq === 'number' && Number.isSafeInteger(value.seq) && value.seq > 0;
}
function report(value: unknown,agency=false): value is ModerationReport {
  return record(value) && ['id', 'conversationId', 'propertyTitle', 'reporterId', 'reportedUserId', 'details', 'createdAt'].every(key => text(value[key])) &&
    ['spam', 'fraud', 'harassment', 'other'].includes(String(value.reason)) && ['open', 'reviewed'].includes(String(value.status)) &&
    (value.reviewNote === null || text(value.reviewNote)) && Array.isArray(value.context) && value.context.length <= (agency?30:20) && value.context.every(m=>message(m,agency));
}

/** The supplied identity is immutable for this repository, including delayed requests. */
export function createReportModerationRepository(client: SupabaseClient, credentials: { actorId: string; accessToken: string },source:'personal'|'agency'='personal') {
  const { actorId, accessToken } = credentials;
  const reviewAttempts=new Map<string,{note:string;clientRequestId:string}>();
  async function request(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('La operación se canceló.');
    try {
      let query = client.rpc(name, { ...args, p_actor_id: actorId }).setHeader('Authorization', `Bearer ${accessToken}`);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error || signal?.aborted) throw failure();
      return data as unknown;
    } catch { throw failure(); }
  }
  return {
    async list(status: 'open' | 'reviewed', offset = 0, signal?: AbortSignal): Promise<ModerationReport[]> {
      if(source==='agency'){
        const page=await request('kh_list_agency_message_reports',{p_status:status,p_offset:offset,p_limit:30},signal);
        if(!record(page)||typeof page.hasMore!=='boolean'||!Array.isArray(page.items)||page.items.length>30||!page.items.every(v=>report(v,true)))throw failure();
        return page.items as ModerationReport[];
      }
      const data = await request('kh_list_message_reports', { p_status: status, p_offset: offset, p_limit: 50 }, signal);
      if (!Array.isArray(data) || !data.every(v=>report(v))) throw failure();
      return data;
    },
    async review(id: string, note: string, signal?: AbortSignal): Promise<void> {
      if (note.trim().length > 1000) throw new Error('La nota debe tener como máximo 1000 caracteres.');
      if(source==='agency'){
        const previous=reviewAttempts.get(id),attempt=previous?.note===note.trim()?previous:{note:note.trim(),clientRequestId:createMessageId()};reviewAttempts.set(id,attempt);
        await request('kh_review_agency_message_report',{p_agency_id:null,p_payload:{reportId:id,...attempt}},signal);
      }
      else await request('kh_review_message_report', { p_report_id: id, p_note: note.trim() }, signal);
    },
  };
}
