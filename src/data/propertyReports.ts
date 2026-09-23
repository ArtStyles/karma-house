import type { SupabaseClient } from '@supabase/supabase-js';

export type PropertyReportReason = 'fraud' | 'misleading' | 'unavailable' | 'inappropriate' | 'other';
export const PROPERTY_REPORT_REASONS: { value: PropertyReportReason; label: string }[] = [
  { value: 'fraud', label: 'Posible estafa' }, { value: 'misleading', label: 'Datos falsos' },
  { value: 'unavailable', label: 'Ya no está disponible' }, { value: 'inappropriate', label: 'Contenido inapropiado' },
  { value: 'other', label: 'Otro' },
];
export interface PropertyReport {
  id: string; propertyId: string; propertyTitle: string; reporterId: string; ownerId: string; reason: PropertyReportReason; details: string;
  status: 'open' | 'reviewed'; unpublished: boolean; reviewNote: string | null; createdAt: string; propertyLive: boolean;
}

const messages: Record<string, string> = {
  KH_REPORT_LIMIT: 'Has enviado muchos reportes hoy. Vuelve a intentarlo mañana.',
  KH_PROPERTY_NOT_FOUND: 'Este anuncio ya no está publicado.',
  KH_REPORT_OWN_PROPERTY: 'No puedes reportar tu propio anuncio.',
  KH_REVIEW_NOTE_REQUIRED: 'Escribe el motivo; es lo que verá quien publicó el anuncio.',
  KH_ACCOUNT_CHANGED: 'La sesión cambió. Vuelve a abrir esta pantalla.',
};
/** Known server codes become guidance; anything else is a connection problem worth retrying. */
export function propertyReportError(cause: unknown): Error {
  const text = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
  const code = Object.keys(messages).find(key => text.includes(key));
  return new Error(code ? messages[code] : 'No pudimos completar la operación. Comprueba tu conexión y vuelve a intentarlo.');
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string';
function isReport(value: unknown): value is PropertyReport {
  return record(value) && ['id', 'propertyId', 'propertyTitle', 'reporterId', 'ownerId', 'details', 'createdAt'].every(key => text(value[key])) &&
    PROPERTY_REPORT_REASONS.some(item => item.value === value.reason) && ['open', 'reviewed'].includes(String(value.status)) &&
    typeof value.unpublished === 'boolean' && typeof value.propertyLive === 'boolean' && (value.reviewNote === null || text(value.reviewNote));
}

/** The supplied identity is pinned for every call, including ones that resolve late. */
export function createPropertyReportRepository(client: SupabaseClient, credentials: { actorId: string; accessToken: string }) {
  const { actorId, accessToken } = credentials;
  async function request(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new Error('La operación se canceló.');
    let query = client.rpc(name, { ...args, p_actor_id: actorId }).setHeader('Authorization', `Bearer ${accessToken}`);
    if (signal) query = query.abortSignal(signal);
    const result = await query.then(value => value, error => ({ data: null, error }));
    if (result.error || signal?.aborted) throw propertyReportError(result.error);
    return result.data;
  }
  return {
    async report(propertyId: string, reason: PropertyReportReason, details: string, clientReportId: string): Promise<void> {
      if (!text(await request('kh_report_property', { p_property_id: propertyId, p_client_report_id: clientReportId, p_reason: reason, p_details: details.trim() }))) throw propertyReportError(null);
    },
    async list(status: 'open' | 'reviewed', offset = 0, signal?: AbortSignal): Promise<PropertyReport[]> {
      const data = await request('kh_list_property_reports', { p_status: status, p_offset: offset, p_limit: 50 }, signal);
      if (!Array.isArray(data) || !data.every(isReport)) throw propertyReportError(null);
      return data;
    },
    async review(id: string, note: string, unpublish: boolean, signal?: AbortSignal): Promise<void> {
      if (note.trim().length > 1000) throw new Error('La nota debe tener como máximo 1000 caracteres.');
      await request('kh_review_property_report', { p_report_id: id, p_note: note.trim(), p_unpublish: unpublish }, signal);
    },
  };
}
