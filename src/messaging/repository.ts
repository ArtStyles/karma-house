import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, Conversation, MessageNegotiation, MessagingRepository, MessagingRequestContext } from './types.ts';
import { isUuid, MESSAGE_PAGE_SIZE, MessagingError } from './domain.ts';

export function createSupabaseMessagingRepository(client: SupabaseClient): MessagingRepository {
  const rpc = async (name: string, parameters: Record<string, unknown>, context: MessagingRequestContext): Promise<unknown> => {
    context.checkpoint();
    if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    const { data, error } = await client.rpc(name, { ...parameters, p_actor_id: context.userId })
      .setHeader('Authorization', `Bearer ${context.accessToken}`).abortSignal(context.signal);
    context.checkpoint();
    if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    if (error) throw error;
    return data;
  };
  const conversation = (value: unknown, actor: string): Conversation => {
    const item = decodeConversation(value);
    const expectedOther = item.buyerId === actor ? item.sellerId : item.sellerId === actor ? item.buyerId : null;
    if (!expectedOther || item.otherUserId !== expectedOther) throw invalidResponse();
    return item;
  };
  return {
    async listConversations(context) {
      const rows = new Map<string, Conversation>();
      let offset = 0;
      while (true) {
        const page = array(await rpc('kh_list_conversations', { p_offset: offset, p_limit: MESSAGE_PAGE_SIZE }, context));
        for (const value of page) { const item = conversation(value, context.userId); rows.set(item.id, item); }
        if (page.length < MESSAGE_PAGE_SIZE) break;
        offset += page.length;
      }
      return [...rows.values()];
    },
    async startConversation(propertyId, context) { return conversation(await rpc('kh_start_conversation', { p_property_id: propertyId }, context), context.userId); },
    async getConversation(id, context) {
      const item = conversation(await rpc('kh_get_conversation', { p_conversation_id: id }, context), context.userId);
      if (item.id !== id) throw invalidResponse();
      return item;
    },
    async listMessages(id, beforeSeq, context) {
      const rows = array(await rpc('kh_list_messages', { p_conversation_id: id, p_before_seq: beforeSeq, p_limit: MESSAGE_PAGE_SIZE }, context)).map(decodeChatMessage);
      if (rows.some(item => item.conversationId !== id || beforeSeq !== null && item.seq >= beforeSeq)) throw invalidResponse();
      return rows.sort((left, right) => left.seq - right.seq);
    },
    async sendMessage(message, context) {
      if (message.senderId !== context.userId) throw new Error('KH_ACCOUNT_CHANGED');
      const result = decodeChatMessage(await rpc('kh_send_message', { p_conversation_id: message.conversationId, p_client_message_id: message.clientMessageId, p_body: message.body }, context));
      if (result.senderId !== context.userId || result.conversationId !== message.conversationId || result.clientMessageId !== message.clientMessageId || result.body !== message.body) throw invalidResponse();
      return result;
    },
    async findSentMessages(clientMessageIds, context) {
      if (!clientMessageIds.length) return [];
      const rows = array(await rpc('kh_find_sent_messages', { p_client_message_ids: clientMessageIds }, context)).map(decodeChatMessage);
      if (rows.some(item => item.senderId !== context.userId || !clientMessageIds.includes(item.clientMessageId))) throw invalidResponse();
      return rows;
    },
    async markRead(id, lastSeq, context) { await rpc('kh_mark_conversation_read', { p_conversation_id: id, p_last_seq: lastSeq }, context); },
    async setBlocked(otherUserId, blocked, context) { await rpc('kh_set_user_block', { p_other_user_id: otherUserId, p_blocked: blocked }, context); },
    async reportConversation(id, reason, details, clientReportId, context) {
      const result = await rpc('kh_report_conversation', { p_conversation_id: id, p_client_report_id: clientReportId, p_reason: reason, p_details: details.trim() }, context);
      if (!isUuid(result)) throw invalidResponse();
    },
  };
}

function invalidResponse() { return new MessagingError('No se pudo interpretar la respuesta de mensajes. Actualiza y vuelve a intentar.'); }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw invalidResponse(); return value; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse(); return value as Record<string, unknown>; }
function uuid(value: unknown): string { if (!isUuid(value)) throw invalidResponse(); return value; }
function text(value: unknown, max: number): string { if (typeof value !== 'string' || [...value].length > max) throw invalidResponse(); return value; }
function integer(value: unknown, min = 0): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw invalidResponse(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw invalidResponse(); return value; }
function date(value: unknown): string { if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw invalidResponse(); return value; }

export function decodeChatMessage(value: unknown): ChatMessage {
  const item = record(value);
  const body = text(item.body, 2000);
  // PostgreSQL btrim removes ASCII spaces; received text must not be re-normalized
  // with the composer's stricter trim or UTF-16 length rules.
  if (!body.replace(/^ +| +$/g, '') || body.includes('\u0000')) throw invalidResponse();
  return { id: uuid(item.id), conversationId: uuid(item.conversationId), seq: integer(item.seq, 1), clientMessageId: uuid(item.clientMessageId), senderId: uuid(item.senderId), body, createdAt: date(item.createdAt), negotiation: decodeMessageNegotiation(item.negotiation) };
}

/** Anything unreadable becomes null, so the message still shows as its text summary. */
function decodeMessageNegotiation(value: unknown): MessageNegotiation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const actions: unknown[] = ['created', 'accepted', 'declined', 'cancelled'];
  const offer = item.kind === 'offer' && typeof item.amountUsd === 'number' && Number.isFinite(item.amountUsd) && item.amountUsd > 0 && item.visitAt === null;
  const visit = item.kind === 'visit' && item.amountUsd === null && typeof item.visitAt === 'string' && Number.isFinite(Date.parse(item.visitAt));
  if (!isUuid(item.id) || !isUuid(item.createdBy) || !actions.includes(item.action) || !(offer || visit)
    || typeof item.note !== 'string' || !(item.parentId === null || isUuid(item.parentId))) return null;
  return { id: item.id, action: item.action as MessageNegotiation['action'], kind: item.kind as MessageNegotiation['kind'], createdBy: item.createdBy,
    amountUsd: item.amountUsd as number | null, visitAt: item.visitAt as string | null, note: item.note, parentId: item.parentId as string | null };
}

export function decodeConversation(value: unknown): Conversation {
  const item = record(value);
  return {
    id: uuid(item.id), propertyId: uuid(item.propertyId), propertyTitle: text(item.propertyTitle, 200), propertyLocation: text(item.propertyLocation, 200),
    buyerId: uuid(item.buyerId), sellerId: uuid(item.sellerId), otherUserId: uuid(item.otherUserId), otherName: text(item.otherName, 80),
    lastMessage: item.lastMessage === null ? null : text(item.lastMessage, 2000), lastMessageAt: item.lastMessageAt === null ? null : date(item.lastMessageAt),
    lastSeq: integer(item.lastSeq), unreadCount: integer(item.unreadCount), blockedByMe: boolean(item.blockedByMe), blockedByOther: boolean(item.blockedByOther),
    canSend: boolean(item.canSend), propertyAvailable: boolean(item.propertyAvailable), createdAt: date(item.createdAt),
  };
}
