import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessagingRequestContext } from '../messaging/types.ts';
import { isUuid } from '../messaging/domain.ts';
import { compareNotificationSequence, isNotificationSequence, NOTIFICATION_PAGE_SIZE, NotificationError } from './domain.ts';
import type { AppNotification, NotificationPreferences, NotificationRepository, NotificationSummary } from './types.ts';

const invalid = () => new NotificationError('No se pudieron interpretar los avisos. Actualiza la bandeja e inténtalo de nuevo.');
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const timestamp = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const text = (value: unknown, max: number) => typeof value === 'string' && [...value].length <= max && !value.includes('\u0000');
function decodeCount(value: unknown): { unreadCount: number } {
  const item = record(value);
  if (!Number.isSafeInteger(item.unreadCount) || (item.unreadCount as number) < 0) throw invalid();
  return { unreadCount: item.unreadCount as number };
}
function decodeSummary(value: unknown): NotificationSummary {
  const item = record(value);
  if (!isNotificationSequence(item.readThrough, true)) throw invalid();
  const count = decodeCount(item);
  if (item.readThrough === '0' && count.unreadCount !== 0) throw invalid();
  return { ...count, readThrough: item.readThrough };
}
export function decodeNotification(value: unknown): AppNotification {
  const item = record(value) as unknown as AppNotification;
  if (![item.id, item.recipientId, item.actorId, item.conversationId, item.messageId].every(isUuid)
    || item.actorId === item.recipientId || !isNotificationSequence(item.seq)
    || !['message', 'visit', 'offer'].includes(item.category)
    || (item.negotiationId !== null && !isUuid(item.negotiationId))
    || (item.category === 'message' && item.negotiationId !== null)
    || !text(item.actorName, 200) || !text(item.propertyTitle, 200)
    || !text(item.title, 200) || !text(item.body, 500)
    || !timestamp(item.createdAt) || (item.readAt !== null && !timestamp(item.readAt))) throw invalid();
  return { id: item.id, seq: item.seq, recipientId: item.recipientId, category: item.category,
    conversationId: item.conversationId, messageId: item.messageId, negotiationId: item.negotiationId,
    actorId: item.actorId, actorName: item.actorName, propertyTitle: item.propertyTitle,
    title: item.title, body: item.body, createdAt: item.createdAt, readAt: item.readAt };
}
function decodePreferences(value: unknown): NotificationPreferences {
  const item = record(value);
  if (typeof item.messages !== 'boolean' || typeof item.visits !== 'boolean' || typeof item.offers !== 'boolean'
    || !Number.isSafeInteger(item.version) || (item.version as number) < 0) throw invalid();
  return { messages: item.messages, visits: item.visits, offers: item.offers, version: item.version as number };
}
export function createSupabaseNotificationRepository(client: SupabaseClient): NotificationRepository {
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
  return {
    async summary(context) { return decodeSummary(await rpc('kh_notification_summary', {}, context)); },
    async list(options, context) {
      if (options.beforeSeq !== undefined && !isNotificationSequence(options.beforeSeq)
        || options.unreadOnly !== undefined && typeof options.unreadOnly !== 'boolean'
        || options.category !== undefined && !['message', 'visit', 'offer'].includes(options.category)) throw invalid();
      const result = record(await rpc('kh_list_notifications', { p_before_seq: options.beforeSeq ?? null,
        p_unread_only: options.unreadOnly ?? false, p_category: options.category ?? null, p_limit: NOTIFICATION_PAGE_SIZE }, context));
      const summary = decodeSummary(result);
      if (!Array.isArray(result.items) || result.items.length > NOTIFICATION_PAGE_SIZE
        || result.nextCursor !== null && !isNotificationSequence(result.nextCursor)) throw invalid();
      const items = result.items.map(decodeNotification);
      if (items.some((item, index) => item.recipientId !== context.userId
        || options.beforeSeq && compareNotificationSequence(item.seq, options.beforeSeq) >= 0
        || compareNotificationSequence(item.seq, summary.readThrough) > 0
        || options.unreadOnly && item.readAt !== null || options.category && item.category !== options.category
        || index > 0 && compareNotificationSequence(items[index - 1].seq, item.seq) <= 0)
        || new Set(items.map(item => item.id)).size !== items.length
        || result.nextCursor !== null && (items.length !== NOTIFICATION_PAGE_SIZE || result.nextCursor !== items.at(-1)?.seq)) throw invalid();
      return { ...summary, items, nextCursor: result.nextCursor as string | null };
    },
    async markRead(id, context) {
      if (!isUuid(id)) throw invalid();
      return decodeCount(await rpc('kh_read_notification', { p_id: id }, context));
    },
    async markAllRead(readThrough, context) {
      if (!isNotificationSequence(readThrough, true)) throw invalid();
      return decodeCount(await rpc('kh_read_notifications_through', { p_through_seq: readThrough }, context));
    },
    async preferences(context) { return decodePreferences(await rpc('kh_get_notification_preferences', {}, context)); },
    async savePreferences(input, context) {
      if (![input.messages, input.visits, input.offers].every(value => typeof value === 'boolean')
        || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw invalid();
      const result = decodePreferences(await rpc('kh_save_notification_preferences', { p_payload: input }, context));
      if (result.messages !== input.messages || result.visits !== input.visits || result.offers !== input.offers) throw invalid();
      return result;
    },
  };
}
