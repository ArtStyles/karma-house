import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { createMessageId } from '../../messaging/domain.ts';
import { decodeAgencyPage } from '../repository.ts';
import {decodePrincipalStatus} from '../principal.ts';
import { object, uuid, integer, text, nullableUuid, nullableText, invalidAgencyData } from '../deals/domain.ts';
import type { AgencyConversation, AgencyConversationContext, AgencyMessage, AgencyMessagingRepository, PublicPropertyContact } from './types.ts';
import type { AgencyRole } from '../types.ts';
const agency = (c: AgencyConversationContext) => 'agencyId' in c ? uuid(c.agencyId) : null;
const roles: readonly unknown[] = ['manager', 'coordinator', 'admin'];
const conversationRoles: readonly unknown[] = ['client', 'supervisor', 'lead', 'attendant'];
const role = (v: unknown) => { if (v !== null && !roles.includes(v)) throw invalidAgencyData(); return v as AgencyRole | null; };
const date = (v: unknown) => { const s = text(v); if (!Number.isFinite(Date.parse(s))) throw invalidAgencyData(); return s; };
// Fields added with the team chat default to what the server meant before, so the app also reads an older server.
export function decodeAgencyConversation(value: unknown, context: AgencyConversationContext): AgencyConversation {
    const v = object(value), staff = agency(context);
    if (typeof v.canSend !== 'boolean' || (staff ? v.agencyId !== staff : v.buyerId !== context.userId))
        throw invalidAgencyData();
    if (!Array.isArray(v.blockedUserIds) || new Set(v.blockedUserIds).size !== v.blockedUserIds.length) throw invalidAgencyData();
    const blockedUserIds = v.blockedUserIds.map(uuid);
    const assigneeId = nullableUuid(v.assigneeId);
    const legacyRole = staff ? (assigneeId === context.userId ? 'lead' : 'supervisor') : 'client';
    if (v.role !== undefined && v.role !== null && !conversationRoles.includes(v.role)) throw invalidAgencyData();
    const conversationRole = (v.role === undefined ? legacyRole : v.role) as AgencyConversation['role'];
    const flag = (x: unknown, fallback: boolean) => { if (x === undefined) return fallback; if (typeof x !== 'boolean') throw invalidAgencyData(); return x; };
    const rawAttendants = v.attendants ?? [];
    if (!Array.isArray(rawAttendants) || rawAttendants.length > 100) throw invalidAgencyData();
    const attendants = rawAttendants.map(item => { const a = object(item); if (typeof a.lead !== 'boolean') throw invalidAgencyData(); const r = role(a.role); if (!r) throw invalidAgencyData(); return { userId: uuid(a.userId), displayName: text(a.displayName), role: r, lead: a.lead }; });
    if (new Set(attendants.map(a => a.userId)).size !== attendants.length) throw invalidAgencyData();
    const last = v.lastMessage === undefined || v.lastMessage === null ? null : object(v.lastMessage);
    if (last && typeof last.fromAgency !== 'boolean') throw invalidAgencyData();
    return { blockedUserIds, id: uuid(v.id), agencyId: uuid(v.agencyId), dealId: uuid(v.dealId), propertyId: uuid(v.propertyId), buyerId: nullableUuid(v.buyerId), canSend: v.canSend, closedReason: nullableText(v.closedReason), lastSeq: integer(v.lastSeq), agencyName: text(v.agencyName), propertyTitle: text(v.propertyTitle), assigneeId, dealVersion: integer(v.dealVersion, 1), unreadCount: integer(v.unreadCount),
        role: conversationRole, canManage: flag(v.canManage, conversationRole === 'supervisor'), canSeeDeal: flag(v.canSeeDeal, !!staff), agencyBlocked: flag(v.agencyBlocked, false), clientBlockedByMe: flag(v.clientBlockedByMe, !!staff && !!v.buyerId && blockedUserIds.includes(v.buyerId as string)),
        buyerName: v.buyerName === undefined ? null : nullableText(v.buyerName), attendants,
        lastMessage: last && { body: text(last.body), createdAt: date(last.createdAt), fromAgency: last.fromAgency as boolean },
        lastMessageAt: v.lastMessageAt === undefined || v.lastMessageAt === null ? null : date(v.lastMessageAt) };
}
export function decodeAgencyMessage(value: unknown, conversationId: string): AgencyMessage {
    const v = object(value);
    if (v.conversationId !== conversationId || !Number.isFinite(Date.parse(text(v.createdAt))))
        throw invalidAgencyData();
    if (v.fromAgency !== undefined && typeof v.fromAgency !== 'boolean') throw invalidAgencyData();
    return { id: uuid(v.id), conversationId: uuid(v.conversationId), seq: integer(v.seq, 1), clientMessageId: uuid(v.clientMessageId), senderId: nullableUuid(v.senderId), body: text(v.body), createdAt: text(v.createdAt),
        fromAgency: (v.fromAgency as boolean | undefined) ?? null, senderName: v.senderName === undefined ? null : nullableText(v.senderName), senderRole: v.senderRole === undefined ? null : role(v.senderRole) };
}
export function mergeAgencyMessages<T extends { id: string; seq: number }>(previous: T[], incoming: T[]): T[] { const byId = new Map(previous.map(m => [m.id, m])); for (const m of incoming)
    byId.set(m.id, m); return [...byId.values()].sort((a, b) => a.seq - b.seq); }
export function decodePublicContact(value: unknown): PublicPropertyContact {
    const v = object(value);
    if (typeof v.personalContact !== 'boolean' || !Array.isArray(v.agencies) || v.agencies.length > 100)
        throw invalidAgencyData();
    return { propertyId: uuid(v.propertyId), personalContact: v.personalContact, agencies: v.agencies.map(value => { const a = object(value); if (typeof a.verified !== 'boolean' || typeof a.contactAvailable !== 'boolean')
            throw invalidAgencyData(); return { agencyId: uuid(a.agencyId), tradeName: text(a.tradeName), verified: a.verified, isPrincipal:decodePrincipalStatus(a.isPrincipal,a.verified), contactAvailable: a.contactAvailable }; }) };
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
        async setAttendant(input, context) { uuid(input.conversationId); uuid(input.userId); uuid(input.clientRequestId); if (typeof input.attending !== 'boolean' || !agency(context))
            throw invalidAgencyData(); const c = decodeAgencyConversation(await rpc('kh_set_agency_conversation_attendant', { p_agency_id: agency(context), p_payload: input }, context), context); if (c.id !== input.conversationId)
            throw invalidAgencyData(); return c; },
        async setAgencyBlock(input, context) { uuid(input.conversationId); uuid(input.agencyId); uuid(input.clientRequestId); if (typeof input.blocked !== 'boolean' || agency(context))
            throw invalidAgencyData(); const c = decodeAgencyConversation(await rpc('kh_set_agency_client_block', { p_payload: input }, context), context); if (c.id !== input.conversationId || c.agencyId !== input.agencyId || c.agencyBlocked !== input.blocked)
            throw invalidAgencyData(); return c; },
        async report(input, context) { uuid(input.conversationId); if (input.reportedUserId !== undefined) uuid(input.reportedUserId); else if (agency(context)) throw invalidAgencyData(); uuid(input.clientRequestId); if (!['spam', 'fraud', 'harassment', 'other'].includes(input.reason) || input.details.length > 1000)
            throw invalidAgencyData(); await rpc('kh_report_agency_conversation', { p_agency_id: agency(context), p_payload: input }, context); },
    };
}
