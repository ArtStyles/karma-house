import { isUuid } from '../../messaging/domain.ts';
import type { AgencyDeal, ExternalContact } from './types.ts';
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
