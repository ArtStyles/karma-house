import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { decodeAgencyPage } from '../repository.ts';
import { object, uuid, integer, text, nullableUuid, invalidAgencyData } from '../deals/domain.ts';
import { decodeAgencyProposal, decodeAgencyProposalEvent, decodeAgencyVisit, instant } from './domain.ts';
import type { AgencyReservation, AgencySchedulingRepository, BusyInterval } from './types.ts';
import type { AgencyConversationContext } from '../messaging/types.ts';
const agency = (c: AgencyConversationContext) => 'agencyId' in c ? uuid(c.agencyId) : null;
function interval(value: unknown): BusyInterval { const v = object(value), startsAt = instant(v.startsAt), endsAt = instant(v.endsAt); if (Date.parse(endsAt) <= Date.parse(startsAt))
    throw invalidAgencyData(); return { startsAt, endsAt }; }
function reservation(value: unknown, agencyId: string): AgencyReservation { const r = object(value); if (r.agencyId !== agencyId || typeof r.active !== 'boolean')
    throw invalidAgencyData(); return { id: uuid(r.id), propertyId: uuid(r.propertyId), agencyId, expiresAt: instant(r.expiresAt), releasedAt: r.releasedAt === null ? null : instant(r.releasedAt), version: integer(r.version, 1), active: r.active }; }
export function createAgencySchedulingRepository(client: SupabaseClient): AgencySchedulingRepository {
    const rpc = createScopedRpc(client);
    const write = (name: string, input: object, c: AgencyConversationContext) => rpc(name, { p_agency_id: agency(c), p_payload: input }, c);
    return {
        async list(dealId, offset, c) { return decodeAgencyPage(await rpc('kh_list_agency_proposals', { p_agency_id: agency(c), p_deal_id: uuid(dealId), p_offset: integer(offset), p_limit: 30 }, c), v => decodeAgencyProposal(v, dealId)); },
        async events(proposalId, offset, c) { return decodeAgencyPage(await rpc('kh_list_agency_proposal_events', { p_agency_id: agency(c), p_proposal_id: uuid(proposalId), p_offset: integer(offset), p_limit: 30 }, c), v => decodeAgencyProposalEvent(v, proposalId)); },
        async create(input, c) { uuid(input.dealId); uuid(input.clientRequestId); const p = decodeAgencyProposal(await write('kh_create_agency_proposal', input, c), input.dealId); if (p.kind !== input.kind || p.createdBy !== c.userId || p.parentId !== (input.replacesId ?? null))
            throw invalidAgencyData(); return p; },
        async respond(input, c) { uuid(input.proposalId); uuid(input.clientRequestId); integer(input.expectedVersion, 1); const p = decodeAgencyProposal(await write('kh_respond_agency_proposal', input, c)); if (p.id !== input.proposalId)
            throw invalidAgencyData(); return p; },
        async recordOutcome(input, c) { uuid(input.proposalId); uuid(input.clientRequestId); integer(input.expectedVersion, 1); const v = decodeAgencyVisit(await write('kh_record_agency_visit_outcome', input, c)); if (v.proposalId !== input.proposalId)
            throw invalidAgencyData(); return v; },
        async calendar(from, to, offset, c) { return decodeAgencyPage(await rpc('kh_agency_calendar', { p_agency_id: uuid(c.agencyId), p_from: instant(from), p_to: instant(to), p_offset: integer(offset), p_limit: 30 }, c), value => { const v = object(value); if (v.agencyId !== c.agencyId || typeof v.existingConflict !== 'boolean')
            throw invalidAgencyData(); return { ...decodeAgencyVisit(v), agencyId: c.agencyId, dealId: uuid(v.dealId), buyerId: nullableUuid(v.buyerId), contactName: text(v.contactName), assigneeName: text(v.assigneeName), propertyTitle: text(v.propertyTitle), existingConflict: v.existingConflict }; }); },
        async occupancy(propertyId, from, to, c) { const data = await rpc('kh_property_visit_occupancy', { p_agency_id: uuid(c.agencyId), p_property_id: uuid(propertyId), p_from: instant(from), p_to: instant(to) }, c); if (!Array.isArray(data))
            throw invalidAgencyData(); return data.map(value => { const v = object(value); if (Object.keys(v).some(k => !['startsAt', 'endsAt'].includes(k)))
            throw invalidAgencyData(); return interval(v); }); },
        async setReservation(input, c) { uuid(input.propertyId); uuid(input.clientRequestId); instant(input.expiresAt); const r = reservation(await write('kh_set_agency_reservation', input, c), c.agencyId); if (r.propertyId !== input.propertyId)
            throw invalidAgencyData(); return r; },
        async reservation(propertyId, c) { const value = await rpc('kh_get_agency_reservation', { p_agency_id: uuid(c.agencyId), p_property_id: uuid(propertyId) }, c); return value === null ? null : reservation(value, c.agencyId); },
        async releaseReservation(input, c) { uuid(input.reservationId); uuid(input.clientRequestId); integer(input.expectedVersion, 1); const r = reservation(await write('kh_release_agency_reservation', input, c), c.agencyId); if (r.id !== input.reservationId)
            throw invalidAgencyData(); return r; },
        async createJointSlot(input, c) { uuid(input.propertyId); uuid(input.clientRequestId); const v = object(await write('kh_create_joint_visit_slot', input, c)); if (v.propertyId !== input.propertyId)
            throw invalidAgencyData(); return { ...interval(v), id: uuid(v.id), propertyId: uuid(v.propertyId), token: uuid(v.token) }; },
        async joinJointSlot(input, c) { uuid(input.proposalId); uuid(input.clientRequestId); uuid(input.jointVisitToken); integer(input.expectedVersion, 1); const p = decodeAgencyProposal(await write('kh_join_joint_visit_slot', input, c)); if (p.id !== input.proposalId)
            throw invalidAgencyData(); return p; },
    };
}
