import { isUuid } from '../messaging/domain.ts';
import type { CreateNegotiationInput, Negotiation } from './types.ts';

export const NEGOTIATION_PAGE_SIZE = 30;
export const NEGOTIATION_TIME_ZONE = 'America/Havana';
export class NegotiationError extends Error {}
const havanaFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: NEGOTIATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function havanaDateTime(now = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(havanaFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function havanaVisitInstant(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new NegotiationError('Elige un día y una hora válidos.');
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) throw new NegotiationError('Elige una fecha que exista en el calendario.');
  // Obtain offsets on both sides of a possible DST boundary, independent of device timezone.
  const offsets = new Set([-1, 0, 1].map(day => {
    const sample = wall + day * 86400000; const local = havanaDateTime(new Date(sample));
    return Date.parse(`${local.date}T${local.time}:00Z`) - sample;
  }));
  const candidates = [...offsets].map(offset => wall - offset).filter(instant => {
    const local = havanaDateTime(new Date(instant)); return local.date === date && local.time === time;
  });
  if (!candidates.length) throw new NegotiationError('Esa hora no existe por el cambio de horario en Cuba. Elige otra.');
  // PostgreSQL selects the standard-time occurrence for an ambiguous repeated wall time.
  return new Date(Math.max(...candidates)).toISOString();
}
export function validateCreateNegotiation(input: CreateNegotiationInput, now = new Date()): CreateNegotiationInput {
  if (!isUuid(input.conversationId) || !isUuid(input.clientRequestId) || !['visit', 'offer'].includes(input.kind)) throw new NegotiationError('No se pudo identificar la propuesta. Abre la conversación de nuevo.');
  if (typeof input.note !== 'string' || [...input.note.trim()].length > 500 || input.note.includes('\u0000')) throw new NegotiationError('La nota admite hasta 500 caracteres.');
  if (input.replacesId !== undefined && (!isUuid(input.replacesId) || !Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion ?? 0) < 1)
    || input.replacesId === undefined && input.expectedVersion !== undefined) throw new NegotiationError('Actualiza la propuesta antes de sugerir una alternativa.');
  const common = { conversationId: input.conversationId, kind: input.kind, clientRequestId: input.clientRequestId, note: input.note.trim(), ...(input.replacesId ? { replacesId: input.replacesId, expectedVersion: input.expectedVersion } : {}) };
  if (input.kind === 'offer') {
    const amount = typeof input.amountUsd === 'string' ? input.amountUsd.trim().replace(',', '.') : '';
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 1_000_000_000) throw new NegotiationError('Introduce un importe en USD mayor que cero, hasta 1 000 000 000 y con dos decimales como máximo.');
    return { ...common, amountUsd: Number(amount).toFixed(2) };
  }
  const visitDate = input.visitDate ?? ''; const visitTime = input.visitTime ?? '';
  const instant = Date.parse(havanaVisitInstant(visitDate, visitTime));
  if (instant <= now.getTime() || instant > now.getTime() + 180 * 86400000) throw new NegotiationError('La visita debe ser futura y estar dentro de los próximos 180 días, en hora de Cuba.');
  return { ...common, visitDate, visitTime };
}
export function availableNegotiationActions(item: Negotiation, actorId: string | null) {
  const participant = !!actorId && [item.buyerId, item.sellerId].includes(actorId);
  const recipient = participant && item.createdBy !== actorId;
  const respond = recipient && item.status === 'pending' && item.canAct;
  return { accept: respond, decline: respond, counter: respond, cancel: participant && (item.status === 'accepted' || item.status === 'pending' && item.createdBy === actorId) };
}
export function formatNegotiationValue(item: Negotiation): string {
  if (item.kind === 'offer') return `${new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(item.amountUsd ?? 0)} USD`;
  if (!item.visitAt) return 'Fecha sin especificar';
  return `${new Intl.DateTimeFormat('es', { timeZone: NEGOTIATION_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.visitAt))} · hora de Cuba`;
}
export function negotiationErrorMessage(error: unknown): string {
  if (error instanceof NegotiationError) return error.message;
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/ACCOUNT_CHANGED|SESSION_CHANGED/.test(message)) return 'La sesión cambió. Abre la conversación con la cuenta actual.';
  if (/AUTH_REQUIRED|JWT|token.*expired|PGRST301/i.test(message)) return 'Inicia sesión de nuevo para continuar.';
  if (/PENDING_EXISTS/.test(message)) return 'Ya hay una propuesta pendiente de este tipo. Revísala en Solicitudes → Pendientes.';
  if (/VERSION_CONFLICT|INVALID_STATE|NOT_YOUR_TURN/.test(message)) return 'La propuesta cambió o ya tiene una respuesta. Actualiza la lista antes de continuar.';
  if (/EXPIRED/.test(message)) return 'Esta propuesta ha caducado. Puedes preparar una nueva.';
  if (/REQUEST_CONFLICT/.test(message)) return 'Este envío ya se registró con otro contenido. Actualiza antes de continuar.';
  if (/BLOCKED/.test(message)) return 'Solo puedes retirar o cancelar tus compromisos mientras exista un bloqueo.';
  if (/PROPERTY_UNAVAILABLE/.test(message)) return 'El anuncio ya no está disponible. Aún puedes retirar o cancelar tus compromisos.';
  if (/NOT_FOUND|NOT_PARTICIPANT|FORBIDDEN|BUYER_REQUIRED/.test(message)) return 'Tu cuenta no puede realizar esta acción en esta conversación.';
  if (/INVALID_VISIT/.test(message)) return 'Revisa el día y la hora de Cuba: la visita debe ser futura y dentro de 180 días.';
  if (/INVALID_AMOUNT/.test(message)) return 'Revisa el importe en USD, con hasta dos decimales.';
  if (/RATE_LIMIT|TOO_MANY/.test(message)) return 'Has realizado varias propuestas. Espera un momento y vuelve a intentar.';
  if (/network|fetch|timeout|abort/i.test(message)) return 'No se pudo conectar. Conservamos tu propuesta para que puedas reintentar.';
  return 'No se pudo guardar la propuesta. Actualiza e inténtalo de nuevo.';
}
