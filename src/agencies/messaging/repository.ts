import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { createMessageId } from '../../messaging/domain.ts';
import { decodeAgencyPage } from '../repository.ts';
import { object, uuid, integer, text, nullableUuid, nullableText, invalidAgencyData } from '../deals/domain.ts';
import type { AgencyConversation, AgencyConversationContext, AgencyMessage, AgencyMessagingRepository, PublicPropertyContact } from './types.ts';
const agency = (c: AgencyConversationContext) => 'agencyId' in c ? uuid(c.agencyId) : null;
export function decodeAgencyConversation(value: unknown, context: AgencyConversationContext): AgencyConversation {
    const v = object(value);
    if (typeof v.canSend !== 'boolean' || (agency(context) ? v.agencyId !== agency(context) : v.buyerId !== context.userId))
        throw invalidAgencyData();
    if (!Array.isArray(v.blockedUserIds) || new Set(v.blockedUserIds).size !== v.blockedUserIds.length) throw invalidAgencyData();
    const blockedUserIds = v.blockedUserIds.map(uuid);
    return { blockedUserIds, id: uuid(v.id), agencyId: uuid(v.agencyId), dealId: uuid(v.dealId), propertyId: uuid(v.propertyId), buyerId: nullableUuid(v.buyerId), canSend: v.canSend, closedReason: nullableText(v.closedReason), lastSeq: integer(v.lastSeq), agencyName: text(v.agencyName), propertyTitle: text(v.propertyTitle), assigneeId: nullableUuid(v.assigneeId), dealVersion: integer(v.dealVersion, 1), unreadCount: integer(v.unreadCount) };
}
export function decodeAgencyMessage(value: unknown, conversationId: string): AgencyMessage {
    const v = object(value);
    if (v.conversationId !== conversationId || !Number.isFinite(Date.parse(text(v.createdAt))))
        throw invalidAgencyData();
    return { id: uuid(v.id), conversationId: uuid(v.conversationId), seq: integer(v.seq, 1), clientMessageId: uuid(v.clientMessageId), senderId: nullableUuid(v.senderId), body: text(v.body), createdAt: text(v.createdAt) };
}
export function mergeAgencyMessages(previous: AgencyMessage[], incoming: AgencyMessage[]): AgencyMessage[] { const byId = new Map(previous.map(m => [m.id, m])); for (const m of incoming)
    byId.set(m.id, m); return [...byId.values()].sort((a, b) => a.seq - b.seq); }
export function decodePublicContact(value: unknown): PublicPropertyContact {
    const v = object(value);
    if (typeof v.personalContact !== 'boolean' || !Array.isArray(v.agencies) || v.agencies.length > 100)
        throw invalidAgencyData();
    return { propertyId: uuid(v.propertyId), personalContact: v.personalContact, agencies: v.agencies.map(value => { const a = object(value); if (typeof a.verified !== 'boolean' || typeof a.contactAvailable !== 'boolean')
            throw invalidAgencyData(); return { agencyId: uuid(a.agencyId), tradeName: text(a.tradeName), verified: a.verified, contactAvailable: a.contactAvailable }; }) };
}
export async function readPublicPropertyContact(client: SupabaseClient, propertyId: string, signal: AbortSignal): Promise<PublicPropertyContact | null> { const { data, error } = await client.rpc('kh_public_property_contact', { p_property_id: uuid(propertyId) }).abortSignal(signal); if (error)
    throw error; if (signal.aborted)
    throw Error('KH_ACCOUNT_CHANGED'); return data === null ? null : decodePublicContact(data); }
export function createAgencyMessagingRepository(client: SupabaseClient): AgencyMessagingRepository {
    const rpc = createScopedRpc(client);
    return {
        async start(input, context) {
            uuid(input.agencyId);
            uuid(input.propertyId);
            uuid(input.clientRequestId);
            if (input.preferredManagerId)
                uuid(input.preferredManagerId);
            const { agencyId, ...payload } = input;
            // Buyers always use account context, including buyers who work for another agency.
            if ('agencyId' in context)
                throw invalidAgencyData();
            const c = decodeAgencyConversation(await rpc('kh_start_agency_conversation', { p_agency_id: agencyId, p_payload: payload }, context), context);
            if (c.agencyId !== agencyId)
                throw invalidAgencyData();
            return c;
        },
        async list(offset, context) { return decodeAgencyPage(await rpc('kh_list_agency_conversations', { p_agency_id: agency(context), p_offset: integer(offset), p_limit: 30 }, context), v => decodeAgencyConversation(v, context)); },
        async get(id, context) { const c = decodeAgencyConversation(await rpc('kh_get_agency_conversation', { p_agency_id: agency(context), p_conversation_id: uuid(id) }, context), context); if (c.id !== id)
            throw invalidAgencyData(); return c; },
        async history(id, beforeSeq, context) { const p = decodeAgencyPage(await rpc('kh_list_agency_messages', { p_agency_id: agency(context), p_conversation_id: uuid(id), p_before_seq: beforeSeq === null ? null : integer(beforeSeq, 1), p_limit: 30 }, context), v => decodeAgencyMessage(v, id)); if (new Set(p.items.map(m => m.seq)).size !== p.items.length)
            throw invalidAgencyData(); return { ...p, items: p.items.sort((a, b) => a.seq - b.seq) }; },
        async send(input, context) { uuid(input.conversationId); uuid(input.clientMessageId); const body = input.body.trim(); if (!body || body.length > 2000)
            throw invalidAgencyData(); const m = decodeAgencyMessage(await rpc('kh_send_agency_message', { p_agency_id: agency(context), p_payload: { ...input, body, clientRequestId: input.clientMessageId } }, context), input.conversationId); if (m.clientMessageId !== input.clientMessageId || m.senderId !== context.userId || m.body !== body)
            throw invalidAgencyData(); return m; },
        async markRead(id, lastSeq, context) { await rpc('kh_read_agency_conversation', { p_agency_id: agency(context), p_payload: { conversationId: uuid(id), lastSeq: integer(lastSeq), clientRequestId: createMessageId() } }, context); },
        async setBlocked(input, context) { uuid(input.conversationId); uuid(input.otherUserId); uuid(input.clientRequestId); if (typeof input.blocked !== 'boolean' || input.otherUserId === context.userId)
            throw invalidAgencyData(); await rpc('kh_set_agency_conversation_block', { p_agency_id: agency(context), p_payload: input }, context); },
        async report(input, context) { uuid(input.conversationId); uuid(input.reportedUserId); uuid(input.clientRequestId); if (!['spam', 'fraud', 'harassment', 'other'].includes(input.reason) || input.details.length > 1000)
            throw invalidAgencyData(); await rpc('kh_report_agency_conversation', { p_agency_id: agency(context), p_payload: input }, context); },
    };
}
