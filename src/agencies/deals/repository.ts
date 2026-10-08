import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { decodeAgencyPage } from '../repository.ts';
import { decodeAgencyDeal, decodeAgencyTask, decodeFollowupEvent, validateTask, dealStages, normalizeExternalContact, integer, uuid, invalidAgencyData } from './domain.ts';
import type { AgencyDealRepository } from './types.ts';
import { createAgencySchedulingRepository } from '../scheduling/repository.ts';
import {decodeAgencyVisit} from '../scheduling/domain.ts';
export function createAgencyDealRepository(client: SupabaseClient): AgencyDealRepository {
    const rpc = createScopedRpc(client);
    return {
        scheduling: createAgencySchedulingRepository(client),
        async list(input, context) { const f=typeof input==='number'?{offset:input}:input;const filters={...(f.propertyId?{propertyId:uuid(f.propertyId)}:{}),...(f.assigneeId!==undefined?{assigneeId:f.assigneeId===null?null:uuid(f.assigneeId)}:{})};return decodeAgencyPage(await rpc('kh_list_agency_deals', { p_agency_id: uuid(context.agencyId), p_offset: integer(f.offset), p_limit: 30,p_filters:filters }, context), v => decodeAgencyDeal(v, context.agencyId)); },
        async get(id, context) { const d = decodeAgencyDeal(await rpc('kh_get_agency_deal', { p_agency_id: uuid(context.agencyId), p_deal_id: uuid(id) }, context), context.agencyId); if (d.id !== id)
            throw invalidAgencyData(); return d; },
        async create(input, context) { uuid(input.propertyId); uuid(input.clientRequestId); if (Boolean(input.buyerId) === Boolean(input.externalContact))
            throw invalidAgencyData(); if (input.buyerId)
            uuid(input.buyerId); if (input.assigneeId)
            uuid(input.assigneeId); const payload = { ...input, ...(input.externalContact ? { externalContact: normalizeExternalContact(input.externalContact) } : {}) }; return decodeAgencyDeal(await rpc('kh_create_agency_deal', { p_agency_id: uuid(context.agencyId), p_payload: payload }, context), context.agencyId); },
        async assign(input, context) { uuid(input.dealId); uuid(input.userId); uuid(input.clientRequestId); integer(input.expectedVersion, 1); const d = decodeAgencyDeal(await rpc('kh_assign_agency_deal', { p_agency_id: uuid(context.agencyId), p_payload: input }, context), context.agencyId); if (d.id !== input.dealId)
            throw invalidAgencyData(); return d; },
        async setStage(input,context){uuid(input.dealId);uuid(input.clientRequestId);integer(input.expectedVersion,1);if(!dealStages.includes(input.stage))throw invalidAgencyData();const d=decodeAgencyDeal(await rpc('kh_set_agency_deal_stage',{p_agency_id:uuid(context.agencyId),p_payload:input},context),context.agencyId);if(d.id!==input.dealId)throw invalidAgencyData();return d;},
        async saveTask(input,context){const payload=validateTask(input);const t=decodeAgencyTask(await rpc('kh_save_agency_task',{p_agency_id:uuid(context.agencyId),p_payload:payload},context));if(t.dealId!==input.dealId||input.id&&t.id!==input.id)throw invalidAgencyData();return t;},
        async finishTask(input,context){uuid(input.taskId);uuid(input.clientRequestId);integer(input.expectedVersion,1);if(!['done','cancelled'].includes(input.state))throw invalidAgencyData();const t=decodeAgencyTask(await rpc('kh_finish_agency_task',{p_agency_id:uuid(context.agencyId),p_payload:input},context));if(t.id!==input.taskId)throw invalidAgencyData();return t;},
        async listTasks(input,context){const deal=input.dealId?uuid(input.dealId):null;return decodeAgencyPage(await rpc('kh_list_agency_tasks',{p_agency_id:uuid(context.agencyId),p_deal_id:deal,p_offset:integer(input.offset),p_limit:30},context),v=>{const t=decodeAgencyTask(v);if(deal&&t.dealId!==deal)throw invalidAgencyData();return t;});},
        async history(dealId,offset,context){uuid(dealId);return decodeAgencyPage(await rpc('kh_list_agency_followup_events',{p_agency_id:uuid(context.agencyId),p_deal_id:dealId,p_offset:integer(offset),p_limit:30},context),v=>{const e=decodeFollowupEvent(v);if(e.dealId!==dealId)throw invalidAgencyData();return e;});},
        async visits(dealId,offset,context){return decodeAgencyPage(await rpc('kh_list_agency_deal_visits',{p_agency_id:uuid(context.agencyId),p_deal_id:uuid(dealId),p_offset:integer(offset),p_limit:30},context),decodeAgencyVisit);},
        async conversationId(dealId,context){const v=await rpc('kh_get_agency_deal_conversation_id',{p_agency_id:uuid(context.agencyId),p_deal_id:uuid(dealId)},context);return v===null?null:uuid(v);},
    };
}
