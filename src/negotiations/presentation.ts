import type { MessageNegotiation } from '../messaging/types.ts';
import { NEGOTIATION_TIME_ZONE } from './domain.ts';
import type { Negotiation } from './types.ts';

/** What a chat card needs to know about a proposal; both the message snapshot and the live row fit. */
type Proposal = Pick<MessageNegotiation, 'kind' | 'createdBy' | 'amountUsd' | 'visitAt' | 'parentId'>;
export type StatusTone = 'pending' | 'success' | 'danger' | 'neutral';

const DAY_MS = 24 * 60 * 60 * 1000;
// Same locale as formatMoney in theme.ts, with cents because offers may carry them.
const usd = new Intl.NumberFormat('es-CU', { maximumFractionDigits: 2 });
const longDay = new Intl.DateTimeFormat('es', { timeZone: NEGOTIATION_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('es', { timeZone: NEGOTIATION_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat('es', { timeZone: NEGOTIATION_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** «domingo 27 de septiembre» without the comma Intl puts after the weekday. */
function day(format: Intl.DateTimeFormat, instant: Date): string {
  return format.formatToParts(instant).filter(part => part.type !== 'literal' || part.value.trim() === 'de').map(part => part.value.trim()).join(' ');
}
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

export function formatUsd(amount: number): string { return `$ ${usd.format(amount)}`; }

export function proposalTitle(proposal: Proposal, userId: string): string {
  const own = proposal.createdBy === userId;
  if (proposal.kind === 'offer') return proposal.parentId ? own ? 'Tu contraoferta' : 'Contraoferta' : own ? 'Tu oferta' : 'Oferta de compra';
  return proposal.parentId ? own ? 'Tu nueva fecha' : 'Nueva fecha de visita' : own ? 'Tu propuesta de visita' : 'Visita propuesta';
}

/** The headline value and, for visits, the time underneath it. */
export function proposalValue(proposal: Proposal): { primary: string; secondary: string | null } {
  if (proposal.kind === 'offer') return { primary: `${formatUsd(proposal.amountUsd ?? 0)} USD`, secondary: null };
  const instant = new Date(proposal.visitAt ?? NaN);
  if (!Number.isFinite(instant.getTime())) return { primary: 'Fecha sin especificar', secondary: null };
  return { primary: capitalize(day(longDay, instant)), secondary: `${clock.format(instant)} · hora de Cuba` };
}

/** «la oferta de $ 80,000 USD» / «la visita del dom 27 sept a las 10:30», for notices and confirmations. */
export function proposalSubject(proposal: Proposal): string {
  if (proposal.kind === 'offer') return `${proposal.parentId ? 'contraoferta' : 'oferta'} de ${formatUsd(proposal.amountUsd ?? 0)} USD`;
  const instant = new Date(proposal.visitAt ?? NaN);
  return Number.isFinite(instant.getTime()) ? `visita del ${day(shortDay, instant)} a las ${clock.format(instant)}` : 'visita';
}

export function proposalStatus(live: Pick<Negotiation, 'kind' | 'status' | 'expiresAt'>, now = Date.now()): { label: string; tone: StatusTone } {
  // Between refreshes a pending row can outlive its expiry; the server would already call it expired.
  if (live.status === 'expired' || live.status === 'pending' && Date.parse(live.expiresAt) <= now) return { label: 'Caducada', tone: 'neutral' };
  if (live.status === 'pending') return { label: 'Pendiente', tone: 'pending' };
  if (live.status === 'accepted') return { label: 'Aceptada', tone: 'success' };
  if (live.status === 'declined') return { label: 'Rechazada', tone: 'danger' };
  if (live.status === 'superseded') return { label: live.kind === 'offer' ? 'Reemplazada por una contraoferta' : 'Reemplazada por otra fecha', tone: 'neutral' };
  return { label: 'Cancelada', tone: 'neutral' };
}

/** Offers lapse after seven days; a visit simply happens, so it gets no countdown. */
export function expiryHint(live: Pick<Negotiation, 'kind' | 'status' | 'expiresAt'>, now = Date.now()): string | null {
  if (live.kind !== 'offer' || live.status !== 'pending') return null;
  const left = Date.parse(live.expiresAt) - now;
  if (!(left > 0)) return null;
  const days = Math.ceil(left / DAY_MS);
  return days <= 1 ? 'Caduca en menos de un día' : `Caduca en ${days} días`;
}

/** One line for an answer: who did what to whose proposal, seen from the person reading it. */
export function noticeText(answer: Pick<MessageNegotiation, 'action'> & Proposal, actorId: string, userId: string, otherName: string): string {
  const subject = proposalSubject(answer);
  const mine = actorId === userId;
  const proposedByMe = answer.createdBy === userId;
  if (answer.action === 'accepted') return mine ? `Aceptaste la ${subject}` : `${otherName} aceptó tu ${subject}`;
  if (answer.action === 'declined') return mine ? `Rechazaste la ${subject}` : `${otherName} rechazó tu ${subject}`;
  if (mine) return proposedByMe ? `Cancelaste tu ${subject}` : `Cancelaste la ${subject}`;
  return proposedByMe ? `${otherName} canceló tu ${subject}` : `${otherName} canceló su ${subject}`;
}
