import { validateCreateNegotiation, negotiationErrorMessage, havanaVisitInstant, havanaDateTime } from '../../negotiations/domain.ts';
import { object, uuid, integer, text, nullableText, nullableUuid, invalidAgencyData } from '../deals/domain.ts';
import type { AgencyProposal, AgencyProposalEvent, AgencyVisit, CreateAgencyProposal, ExternalResponse } from './types.ts';
export function instant(v: unknown): string { const s = text(v); if (s.length > 40 || !Number.isFinite(Date.parse(s)))
    throw invalidAgencyData(); return s; }
export function havanaAgendaRange(date: string): {
    from: string;
    to: string;
} {
    const start = (day: string) => { let value: string; try {
        value = havanaVisitInstant(day, '00:00');
    }
    catch {
        value = havanaVisitInstant(day, '01:00');
    } const earlier = new Date(Date.parse(value) - 3600000), wall = havanaDateTime(earlier); return wall.date === day && wall.time === '00:00' ? earlier.toISOString() : value; };
    const from = start(date), next = new Date(Date.parse(`${date}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    return { from, to: start(next) };
}
export function externalResponse(v: unknown): ExternalResponse { const e = object(v); if (!['phone', 'in_person', 'whatsapp', 'other'].includes(String(e.channel)) || text(e.reference).trim().length < 2 || text(e.reference).length > 500)
    throw invalidAgencyData(); return { channel: e.channel as ExternalResponse['channel'], reference: text(e.reference).trim() }; }
export function validateAgencyProposal(input: CreateAgencyProposal, now = new Date()): CreateAgencyProposal {
    const { dealId, durationMinutes, externalResponse: e, ...rest } = input;
    const value = validateCreateNegotiation({ ...rest, conversationId: uuid(dealId) }, now);
    const { conversationId, ...common } = value;
    if (input.kind === 'visit' && durationMinutes !== undefined && ![30, 60, 90, 120].includes(durationMinutes))
        throw Error('Elige una duración de 30, 60, 90 o 120 minutos.');
    return { ...common, dealId: conversationId, ...(input.kind === 'visit' ? { durationMinutes: durationMinutes ?? 60 } : {}), ...(e ? { externalResponse: externalResponse(e) } : {}) };
}
export function decodeAgencyProposal(value: unknown, dealId?: string): AgencyProposal {
    const p = object(value);
    if (dealId !== undefined && p.dealId !== dealId || !['visit', 'offer'].includes(String(p.kind)) || !['pending', 'accepted', 'declined', 'cancelled', 'superseded', 'expired'].includes(String(p.status)))
        throw invalidAgencyData();
    const note = text(p.note);
    if ([...note].length > 500 || note.includes('\u0000'))
        throw invalidAgencyData();
    let amountUsd: number | null = null, visitAt: string | null = null, durationMinutes: number | null = null;
    if (p.kind === 'offer') {
        if (typeof p.amountUsd !== 'number' || !Number.isFinite(p.amountUsd) || p.amountUsd <= 0 || p.amountUsd > 1e9 || Number(p.amountUsd.toFixed(2)) !== p.amountUsd || p.visitAt !== null || p.durationMinutes !== null)
            throw invalidAgencyData();
        amountUsd = p.amountUsd;
    }
    else {
        visitAt = instant(p.visitAt);
        durationMinutes = integer(p.durationMinutes, 1);
        if (p.amountUsd !== null || ![30, 60, 90, 120].includes(durationMinutes) || Date.parse(visitAt) !== Date.parse(instant(p.expiresAt)))
            throw invalidAgencyData();
    }
    return { id: uuid(p.id), dealId: uuid(p.dealId), kind: p.kind as AgencyProposal['kind'], status: p.status as AgencyProposal['status'], version: integer(p.version, 1), createdBy: uuid(p.createdBy), amountUsd, visitAt, durationMinutes, note, parentId: nullableUuid(p.parentId), expiresAt: instant(p.expiresAt), closedReason: nullableText(p.closedReason) };
}
export function decodeAgencyVisit(value: unknown): AgencyVisit { const v = object(value); const startsAt = instant(v.startsAt), endsAt = instant(v.endsAt); if (Date.parse(endsAt) <= Date.parse(startsAt) || !['unrecorded', 'performed', 'no_show', 'cancelled'].includes(String(v.outcome)))
    throw invalidAgencyData(); return { proposalId: uuid(v.proposalId), propertyId: uuid(v.propertyId), assigneeId: nullableUuid(v.assigneeId), startsAt, endsAt, outcome: v.outcome as AgencyVisit['outcome'], version: integer(v.version, 1) }; }
export function decodeAgencyProposalEvent(value: unknown, proposalId: string): AgencyProposalEvent {
    const e = object(value);
    if (e.proposalId !== proposalId || !['team', 'buyer', 'system'].includes(String(e.party)) || !['digital', 'manual', 'system'].includes(String(e.responseSource)))
        throw invalidAgencyData();
    const response = e.externalResponse === null ? null : externalResponse(e.externalResponse);
    if ((e.responseSource === 'manual') !== (response !== null) || e.responseSource === 'manual' && e.party !== 'buyer')
        throw invalidAgencyData();
    return { id: uuid(e.id), proposalId, actorId: nullableUuid(e.actorId), party: e.party as AgencyProposalEvent['party'], action: text(e.action), responseSource: e.responseSource as AgencyProposalEvent['responseSource'], externalResponse: response, createdAt: instant(e.createdAt) };
}
export const visitOutcomeLabel = (v: AgencyVisit['outcome']) => ({ unrecorded: 'Resultado sin registrar', performed: 'Visita realizada', no_show: 'Interesado ausente', cancelled: 'Visita cancelada' }[v]);
export function schedulingError(e: unknown): string {
    const message = e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String(e.message) : '';
    if (/VISIT_CONFLICT/.test(message))
        return 'La vivienda o el responsable ya tienen una cita en ese horario.';
    if (/PROPERTY_RESERVED/.test(message))
        return 'La vivienda tiene una reserva vigente. Elige otra vivienda o espera a su liberación.';
    if (/ASSIGNEE_REQUIRED|ASSIGNMENT_CHANGED/.test(message))
        return 'Un coordinador o administrador debe asignar el caso antes de confirmar la visita.';
    if (/JOINT_PERMISSION/.test(message))
        return 'La visita conjunta requiere el código autorizado por la agencia de origen y su horario exacto.';
    if (/VISIT_NOT_STARTED/.test(message))
        return 'La visita todavía no ha comenzado. Su resultado se registra después.';
    if (/OUTCOME_RECORDED/.test(message))
        return 'El resultado de esta visita ya está registrado.';
    return negotiationErrorMessage(e);
}
