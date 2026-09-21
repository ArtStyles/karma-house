import type { ChatMessage, PendingMessage, ReportReason } from './types.ts';

export const MESSAGE_PAGE_SIZE = 50;
export const MAX_PENDING_MESSAGES = 50;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class MessagingError extends Error {}

let idGenerator: (() => string) | undefined;
export function setMessageIdGenerator(generator: () => string) { idGenerator = generator; }
export function createMessageId(): string {
  const id = idGenerator ? idGenerator() : globalThis.crypto?.randomUUID?.();
  if (!isUuid(id)) throw new MessagingError('No se pudo preparar el mensaje. Vuelve a abrir KarmaHouse.');
  return id;
}

export function normalizeMessageBody(body: string): string {
  if (typeof body !== 'string') throw new MessagingError('Escribe un mensaje de entre 1 y 2000 caracteres.');
  const normalized = body.trim();
  if (!normalized || [...normalized].length > 2000 || normalized.includes('\u0000')) throw new MessagingError('Escribe un mensaje de entre 1 y 2000 caracteres.');
  return normalized;
}

export function validateReport(reason: ReportReason, details: string, clientId: string) {
  if (!['spam', 'fraud', 'harassment', 'other'].includes(reason) || !isUuid(clientId)) throw new MessagingError('Elige un motivo válido para el reporte.');
  if (typeof details !== 'string' || details.trim().length > 1000 || details.includes('\u0000')) throw new MessagingError('El comentario del reporte admite hasta 1000 caracteres.');
}

export function decodeOutbox(raw: string | null, ownerId: string): PendingMessage[] {
  if (raw === null) return [];
  const invalid = () => new MessagingError('No se pudieron recuperar tus mensajes pendientes. Vuelve a intentar sin borrar los datos de la aplicación.');
  try {
    if (raw.length > 550000) throw invalid();
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || value.ownerId !== ownerId || !Array.isArray(value.pending) || value.pending.length > MAX_PENDING_MESSAGES) throw invalid();
    const ids = new Set<string>();
    return value.pending.map((item: PendingMessage) => {
      if (!item || !isUuid(item.clientMessageId) || !isUuid(item.conversationId) || item.senderId !== ownerId || ids.has(item.clientMessageId)
        || !['sending', 'failed'].includes(item.status) || typeof item.createdAt !== 'string' || item.createdAt.length > 40 || !Number.isFinite(Date.parse(item.createdAt))
        || normalizeMessageBody(item.body) !== item.body) throw invalid();
      ids.add(item.clientMessageId);
      return { clientMessageId: item.clientMessageId, conversationId: item.conversationId, senderId: ownerId, body: item.body, createdAt: item.createdAt, status: 'failed', error: 'No enviado. Puedes comprobarlo y reintentar.' };
    });
  } catch { throw invalid(); }
}

export function mergeMessages(previous: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byRequest = new Map<string, ChatMessage>();
  for (const message of [...previous, ...incoming]) byRequest.set(`${message.senderId}:${message.clientMessageId}`, message);
  return [...byRequest.values()].sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id));
}

export function mergeHistoryWindow(previous: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const merged = mergeMessages(previous, incoming);
  let start = 0;
  for (let index = 1; index < merged.length; index++) {
    if (merged[index].seq > merged[index - 1].seq + 1) start = index;
  }
  // Keep the newest contiguous window. Its oldest cursor still reaches every omitted page.
  return merged.slice(start);
}

export function acknowledgedPending(pending: PendingMessage, message: ChatMessage): boolean {
  return pending.clientMessageId === message.clientMessageId && pending.senderId === message.senderId && pending.conversationId === message.conversationId && pending.body === message.body;
}

export function messagingErrorMessage(error: unknown): string {
  if (error instanceof MessagingError) return error.message;
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/ACCOUNT_CHANGED|SESSION_CHANGED/.test(message)) return 'La sesión cambió. Abre tus mensajes con la cuenta actual.';
  if (/AUTH_REQUIRED|JWT|token.*expired|PGRST301/i.test(message)) return 'Vuelve a iniciar sesión para continuar con tus mensajes.';
  if (/REQUEST_CONFLICT|IDEMPOTENCY_CONFLICT|MESSAGE_CONFLICT|REPORT_CONFLICT/.test(message)) return 'Este envío ya existe con otro contenido. Actualiza la conversación antes de continuar.';
  if (/BLOCKED|USER_BLOCK/.test(message)) return 'No se pueden enviar mensajes mientras exista un bloqueo entre estas cuentas.';
  if (/PROPERTY_UNAVAILABLE|LISTING_UNAVAILABLE|NOT_AVAILABLE/.test(message)) return 'Este anuncio ya no está disponible para nuevas conversaciones o mensajes.';
  if (/RATE_LIMIT|TOO_MANY|CONVERSATION_LIMIT|REPORT_LIMIT/.test(message)) return 'Has realizado muchos envíos. Espera un momento antes de volver a intentarlo.';
  if (/ADMIN_REQUIRED|CANNOT_REVIEW_OWN_REPORT/.test(message)) return 'Tu cuenta no puede revisar este reporte.';
  if (/REPORT_ALREADY_REVIEWED/.test(message)) return 'Este reporte ya fue revisado. Actualiza la lista.';
  if (/NOT_PARTICIPANT|FORBIDDEN|NOT_FOUND|SELF_CONTACT|SELF_CONVERSATION/.test(message)) return 'Esta conversación no está disponible para tu cuenta.';
  if (/INVALID_MESSAGE|INVALID_BODY|MESSAGE_TOO_LONG/.test(message)) return 'Escribe un mensaje de entre 1 y 2000 caracteres.';
  if (/INVALID_REPORT/.test(message)) return 'Revisa el motivo y el comentario del reporte.';
  if (/failed to fetch|fetch failed|network|load failed|timed?\s*out|timeout|abort/i.test(message)
    || error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'No se pudo conectar con los mensajes. Comprueba tu conexión y vuelve a intentar.';
  return 'No se pudo completar la operación de mensajes. Vuelve a intentar.';
}
