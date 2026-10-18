import type { AgencyRole } from '../types.ts';
import type { AgencyConversation, AgencyMessage } from './types.ts';

/** Initials for an arch without a photo: two words at most, in capitals. */
export const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase('es') || '·';

/** The day separator in a chat: «18 de octubre». */
export const messageDay = (value: string) => new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'long' });

/** Today shows the hour; earlier days show day and month. */
export function shortDate(value: string, now = new Date()) {
  const date = new Date(value);
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(date);
}

/**
 * Where a message sits. The client talks to «la inmobiliaria»: its own messages on the right, the agency's on the left.
 * The team sees the client on the left and the team on the right: its own in blue, a teammate's in a soft tone with the author.
 */
export function messageSide(m: Pick<AgencyMessage, 'senderId' | 'fromAgency'>, c: Pick<AgencyConversation, 'buyerId'>, me: string | undefined, staff: boolean) {
  const fromAgency = m.fromAgency ?? m.senderId !== c.buyerId;
  const own = !!me && m.senderId === me;
  return { own, teammate: staff && fromAgency && !own };
}

/** «Ana · Gestor» above a teammate's message; a former member keeps the name. */
export function teamAuthor(m: Pick<AgencyMessage, 'senderName' | 'senderRole'>, labels: Record<AgencyRole, string>) {
  if (!m.senderName) return 'Persona del equipo';
  return `${m.senderName} · ${m.senderRole ? labels[m.senderRole] : 'Ya no está en el equipo'}`;
}

/** The inbox line under a conversation: who spoke last, from the reader's side. */
export function inboxPreview(c: Pick<AgencyConversation, 'lastMessage'>, staff: boolean) {
  const last = c.lastMessage;
  if (!last) return staff ? 'Sin mensajes todavía.' : 'Escribe el primer mensaje.';
  return `${staff ? (last.fromAgency ? 'Equipo: ' : '') : (last.fromAgency ? '' : 'Tú: ')}${last.body}`;
}

/** Why there is no composer, in the reader's words. Empty while sending is possible. */
export function sendBlockedReason(c: Pick<AgencyConversation, 'canSend' | 'closedReason' | 'agencyBlocked' | 'agencyName' | 'clientBlockedByMe'>, staff: boolean) {
  if (c.canSend) return '';
  if (c.closedReason) return 'Este expediente está cerrado. El historial se conserva.';
  if (c.agencyBlocked) return staff ? 'El cliente bloqueó a la inmobiliaria. No puede recibir mensajes.' : `Bloqueaste a ${c.agencyName}. Desbloquéala en las opciones para volver a escribir.`;
  if (staff && c.clientBlockedByMe) return 'Bloqueaste a este cliente. Desbloquéalo en las opciones para escribirle.';
  return staff ? 'No puedes escribir aquí ahora. La vivienda o la inmobiliaria pueden estar en pausa, o hay un bloqueo con el cliente.'
    : 'El envío no está disponible ahora. La vivienda puede estar retirada o en pausa.';
}
