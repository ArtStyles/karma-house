import { isUuid } from '../../messaging/domain.ts';
import type { AgencyDeal, AgencyTask, AgencyFollowupEvent, ExternalContact, SaveAgencyTask } from './types.ts';
import {agencyError} from '../domain.ts';
import {schedulingError} from '../scheduling/domain.ts';
export const invalidAgencyData = () => Error('No se pudieron interpretar los datos de la conversación empresarial.');
export function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw invalidAgencyData(); return v as Record<string, unknown>; }
export function uuid(v: unknown): string { if (!isUuid(v))
    throw invalidAgencyData(); return v; }
export function integer(v: unknown, min = 0): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min)
    throw invalidAgencyData(); return v; }
export function text(v: unknown): string { if (typeof v !== 'string')
    throw invalidAgencyData(); return v; }
export function nullableUuid(v: unknown): string | null { return v === null ? null : uuid(v); }
export function nullableText(v: unknown): string | null { return v === null ? null : text(v); }
export function timestamp(v: unknown): string { const t=text(v); if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(t)||!Number.isFinite(Date.parse(t))) throw invalidAgencyData();return t; }
export const dealStages = ['inquiry','visit_proposed','visit_confirmed','visited','offer','won','lost'] as const;
export const dealStageLabel:Record<AgencyDeal['stage'],string>={inquiry:'Consulta',visit_proposed:'Visita propuesta',visit_confirmed:'Visita confirmada',visited:'Visitado',offer:'Oferta',won:'Venta confirmada',lost:'Interés terminado'};
export function followupError(error:unknown):string {
    const message=error instanceof Error?error.message:error&&typeof error==='object'&&'message' in error?String(error.message):'';
    if(/TASK_ASSIGNEE_MISMATCH/.test(message))return 'Asigna primero el caso a ese responsable. La tarea debe pertenecer al responsable actual o quedar sin asignación.';
    if(/PROPERTY_CLOSED/.test(message))return 'Este seguimiento terminó. Puedes consultar su historial y completar las comunicaciones externas pendientes.';
    if(/CLOSURE_REQUIRED/.test(message))return 'La venta debe confirmarse mediante el proceso de cierre.';
    if(/INVALID_TASK/.test(message))return 'Revisa el título, el vencimiento y el estado actual de la tarea.';
    if(/ROLE_REQUIRED|MEMBERSHIP_REQUIRED|MANAGER_CHANGED/.test(message))return agencyError(error);
    return schedulingError(error);
}
export function validateTask(input: SaveAgencyTask): SaveAgencyTask {
    const v=object(input); if(Object.keys(v).some(k=>!['id','dealId','assigneeId','dueAt','title','expectedVersion','clientRequestId'].includes(k))) throw invalidAgencyData();
    uuid(input.dealId);uuid(input.clientRequestId);nullableUuid(input.assigneeId);if(input.dueAt!==null)timestamp(input.dueAt);
    const title=text(input.title).trim();if(title.length<2||title.length>200)throw invalidAgencyData();
    if(input.expectedVersion!==undefined)integer(input.expectedVersion,1);
    if(input.id){uuid(input.id);integer(input.expectedVersion,1);}else if(input.expectedVersion!==undefined)throw invalidAgencyData();
    return {...input,title};
}
export function decodeAgencyTask(value:unknown):AgencyTask {
    const v=object(value);if(!['followup','external_notification'].includes(String(v.kind))||!['open','done','cancelled'].includes(String(v.state)))throw invalidAgencyData();
    const title=text(v.title);if(title.length<2||title.length>200)throw invalidAgencyData();
    return {id:uuid(v.id),dealId:uuid(v.dealId),title,kind:v.kind as AgencyTask['kind'],assigneeId:nullableUuid(v.assigneeId),dueAt:v.dueAt===null?null:timestamp(v.dueAt),state:v.state as AgencyTask['state'],version:integer(v.version,1),reason:nullableText(v.reason)};
}
export function decodeFollowupEvent(value:unknown):AgencyFollowupEvent {
    const v=object(value),d=object(v.details),details:AgencyFollowupEvent['details']={};
    if(d.stage!==undefined){if(!dealStages.includes(d.stage as any))throw invalidAgencyData();details.stage=d.stage as AgencyDeal['stage'];}
    if(d.state!==undefined){if(!['open','done','cancelled'].includes(String(d.state)))throw invalidAgencyData();details.state=d.state as AgencyTask['state'];}
    if(d.title!==undefined)details.title=text(d.title);
    for(const k of ['assigneeId','previousAssigneeId'] as const)if(d[k]!==undefined)details[k]=nullableUuid(d[k]);
    if(d.reason!==undefined)details.reason=nullableText(d.reason);
    return {id:uuid(v.id),dealId:uuid(v.dealId),taskId:nullableUuid(v.taskId),actorId:nullableUuid(v.actorId),kind:text(v.kind),createdAt:timestamp(v.createdAt),details};
}
export function normalizeExternalContact(value: unknown): ExternalContact {
    const v = object(value), name = text(v.name).trim(), consentReference = text(v.consentReference).trim(), phone = v.phone === null ? null : text(v.phone).trim();
    if (name.length < 2 || name.length > 120 || consentReference.length < 2 || consentReference.length > 1000 || (phone !== null && !/^\+?[0-9][0-9 ()-]{6,23}$/.test(phone)))
        throw invalidAgencyData();
    return { name, phone, consentReference };
}
export function decodeAgencyDeal(value: unknown, agencyId: string): AgencyDeal {
    const v = object(value);
    if (v.agencyId !== agencyId || !['account', 'external'].includes(String(v.contactKind)) || !['inquiry', 'visit_proposed', 'visit_confirmed', 'visited', 'offer', 'won', 'lost'].includes(String(v.stage)))
        throw invalidAgencyData();
    const buyerId = nullableUuid(v.buyerId), privateContact = v.privateContact === null ? null : normalizeExternalContact(v.privateContact);
    if (v.contactKind === 'account' ? privateContact !== null : buyerId !== null || privateContact === null)
        throw invalidAgencyData();
    return { id: uuid(v.id), agencyId: uuid(v.agencyId), propertyId: uuid(v.propertyId), cycleId: uuid(v.cycleId), buyerId, contactKind: v.contactKind as AgencyDeal['contactKind'], privateContact, assigneeId: nullableUuid(v.assigneeId), stage: v.stage as AgencyDeal['stage'], version: integer(v.version, 1), closedReason: nullableText(v.closedReason) };
}
