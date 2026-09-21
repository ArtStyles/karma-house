import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatReport } from './types';

const failure = () => new Error('No pudimos cargar o actualizar los reportes. Comprueba tu conexión y el acceso de tu cuenta.');
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string';
function message(value: unknown): value is ChatMessage {
  return record(value) && ['id', 'conversationId', 'clientMessageId', 'senderId', 'body', 'createdAt'].every(key => text(value[key])) && typeof value.seq === 'number' && Number.isSafeInteger(value.seq) && value.seq > 0;
}
function report(value: unknown): value is ChatReport {
  return record(value) && ['id', 'conversationId', 'propertyTitle', 'reporterId', 'reportedUserId', 'details', 'createdAt'].every(key => text(value[key])) &&
    ['spam', 'fraud', 'harassment', 'other'].includes(String(value.reason)) && ['open', 'reviewed'].includes(String(value.status)) &&
    (value.reviewNote === null || text(value.reviewNote)) && Array.isArray(value.context) && value.context.length <= 20 && value.context.every(message);
}

/** The supplied identity is immutable for this repository, including delayed requests. */
export function createReportModerationRepository(client: SupabaseClient, credentials: { actorId: string; accessToken: string }) {
  const { actorId, accessToken } = credentials;
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
    async list(status: 'open' | 'reviewed', offset = 0, signal?: AbortSignal): Promise<ChatReport[]> {
      const data = await request('kh_list_message_reports', { p_status: status, p_offset: offset, p_limit: 50 }, signal);
      if (!Array.isArray(data) || !data.every(report)) throw failure();
      return data;
    },
    async review(id: string, note: string, signal?: AbortSignal): Promise<void> {
      if (note.trim().length > 1000) throw new Error('La nota debe tener como máximo 1000 caracteres.');
      await request('kh_review_message_report', { p_report_id: id, p_note: note.trim() }, signal);
    },
  };
}
