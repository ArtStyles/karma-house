import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { decodeAgencyPage } from '../repository.ts';
import { decodeAgencyDeal, normalizeExternalContact, integer, uuid, invalidAgencyData } from './domain.ts';
import type { AgencyDealRepository } from './types.ts';
export function createAgencyDealRepository(client: SupabaseClient): AgencyDealRepository {
    const rpc = createScopedRpc(client);
    return {
        async list(offset, context) { return decodeAgencyPage(await rpc('kh_list_agency_deals', { p_agency_id: uuid(context.agencyId), p_offset: integer(offset), p_limit: 30 }, context), v => decodeAgencyDeal(v, context.agencyId)); },
        async get(id, context) { const d = decodeAgencyDeal(await rpc('kh_get_agency_deal', { p_agency_id: uuid(context.agencyId), p_deal_id: uuid(id) }, context), context.agencyId); if (d.id !== id)
            throw invalidAgencyData(); return d; },
        async create(input, context) { uuid(input.propertyId); uuid(input.clientRequestId); if (Boolean(input.buyerId) === Boolean(input.externalContact))
            throw invalidAgencyData(); if (input.buyerId)
            uuid(input.buyerId); if (input.assigneeId)
            uuid(input.assigneeId); const payload = { ...input, ...(input.externalContact ? { externalContact: normalizeExternalContact(input.externalContact) } : {}) }; return decodeAgencyDeal(await rpc('kh_create_agency_deal', { p_agency_id: uuid(context.agencyId), p_payload: payload }, context), context.agencyId); },
        async assign(input, context) { uuid(input.dealId); uuid(input.userId); uuid(input.clientRequestId); integer(input.expectedVersion, 1); const d = decodeAgencyDeal(await rpc('kh_assign_agency_deal', { p_agency_id: uuid(context.agencyId), p_payload: input }, context), context.agencyId); if (d.id !== input.dealId)
            throw invalidAgencyData(); return d; },
    };
}
