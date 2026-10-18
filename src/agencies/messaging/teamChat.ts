import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { decodeAgencyPage } from '../repository.ts';
import { object, uuid, integer, text, nullableUuid, invalidAgencyData } from '../deals/domain.ts';
import type { AgencyRequestContext, AgencyRole, Page } from '../types.ts';

export interface AgencyTeamChat {
  agencyId: string; agencyName: string; lastSeq: number; unreadCount: number; canSend: boolean; memberCount: number;
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
}
export interface AgencyTeamMessage {
  id: string; agencyId: string; seq: number; clientMessageId: string; senderId: string | null;
  senderName: string; senderRole: AgencyRole | null; body: string; createdAt: string;
}
export interface AgencyTeamChatRepository {
  get(context: AgencyRequestContext): Promise<AgencyTeamChat>;
  history(agencyId: string, beforeSeq: number | null, context: AgencyRequestContext): Promise<Page<AgencyTeamMessage>>;
  send(input: { clientMessageId: string; body: string }, context: AgencyRequestContext): Promise<AgencyTeamMessage>;
  markRead(lastSeq: number, context: AgencyRequestContext): Promise<void>;
}

const roles: readonly unknown[] = ['manager', 'coordinator', 'admin'];
const date = (value: unknown) => { const s = text(value); if (!Number.isFinite(Date.parse(s))) throw invalidAgencyData(); return s; };

export function decodeAgencyTeamChat(value: unknown, agencyId: string): AgencyTeamChat {
  const v = object(value);
  if (v.agencyId !== agencyId || typeof v.canSend !== 'boolean') throw invalidAgencyData();
  const last = v.lastMessage === null ? null : object(v.lastMessage);
  return { agencyId, agencyName: text(v.agencyName), lastSeq: integer(v.lastSeq), unreadCount: integer(v.unreadCount), canSend: v.canSend, memberCount: integer(v.memberCount),
    lastMessage: last && { body: text(last.body), senderName: text(last.senderName), createdAt: date(last.createdAt) } };
}
export function decodeAgencyTeamMessage(value: unknown, agencyId: string): AgencyTeamMessage {
  const v = object(value);
  if (v.agencyId !== agencyId || (v.senderRole !== null && !roles.includes(v.senderRole))) throw invalidAgencyData();
  return { id: uuid(v.id), agencyId, seq: integer(v.seq, 1), clientMessageId: uuid(v.clientMessageId), senderId: nullableUuid(v.senderId),
    senderName: text(v.senderName), senderRole: v.senderRole as AgencyRole | null, body: text(v.body), createdAt: date(v.createdAt) };
}

export function createAgencyTeamChatRepository(client: SupabaseClient): AgencyTeamChatRepository {
  const rpc = createScopedRpc(client);
  return {
    async get(context) {
      return decodeAgencyTeamChat(await rpc('kh_get_agency_team_chat', { p_agency_id: uuid(context.agencyId) }, context), context.agencyId);
    },
    async history(agencyId, beforeSeq, context) {
      if (agencyId !== context.agencyId) throw invalidAgencyData();
      const page = decodeAgencyPage(await rpc('kh_list_agency_team_messages', { p_agency_id: uuid(agencyId), p_before_seq: beforeSeq === null ? null : integer(beforeSeq, 1), p_limit: 30 }, context), v => decodeAgencyTeamMessage(v, agencyId));
      if (new Set(page.items.map(m => m.seq)).size !== page.items.length) throw invalidAgencyData();
      return { ...page, items: page.items.sort((a, b) => a.seq - b.seq) };
    },
    async send(input, context) {
      uuid(input.clientMessageId);
      const body = input.body.trim();
      if (!body || body.length > 2000) throw invalidAgencyData();
      const m = decodeAgencyTeamMessage(await rpc('kh_send_agency_team_message', { p_agency_id: uuid(context.agencyId), p_payload: { clientMessageId: input.clientMessageId, body } }, context), context.agencyId);
      if (m.clientMessageId !== input.clientMessageId || m.senderId !== context.userId || m.body !== body) throw invalidAgencyData();
      return m;
    },
    async markRead(lastSeq, context) {
      await rpc('kh_read_agency_team_chat', { p_agency_id: uuid(context.agencyId), p_payload: { lastSeq: integer(lastSeq) } }, context);
    },
  };
}
