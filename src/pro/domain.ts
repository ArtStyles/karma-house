import { isUuid } from '../messaging/domain.ts';
import { ASSISTED_PUBLICATION_EMAIL } from '../lib/assistedPublication.ts';

export const PRO_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const BUMP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export type ProRole = 'manager' | 'coordinator' | 'admin';
export interface ProAgency { id: string; tradeName: string; role: ProRole; until: string | null }
export interface ProStatus { personalUntil: string | null; agencies: ProAgency[] }
export interface ProRedeemResult { kind: 'user' | 'agency'; id: string; until: string }
export interface ProBumpResult { bumpedAt: string; nextBumpAt: string }
export type ProCodeState = 'unused' | 'redeemed' | 'expired' | 'cancelled';
export interface ProCodeRow { id: string; days: number; note: string; boundName: string | null; state: ProCodeState; createdAt: string; expiresAt: string; redeemedAt: string | null; redeemedFor: string | null; cancelNote: string | null }
export interface ProAccountRow { kind: 'user' | 'agency'; id: string; name: string; until: string; note: string | null; effective: boolean }
export interface ProPage<T> { items: T[]; hasMore: boolean }
interface Bumpable { createdAt: string; bumpedAt?: string }

/** Mirrors kh_private.pro_code_hash: the 12-symbol body counts; a 14-symbol input carries the KH prefix. */
export function normalizeProCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return compact.length === 14 && compact.startsWith('KH') ? compact.slice(2) : compact;
}
export function isProCodeShape(input: string): boolean {
  const body = normalizeProCode(input);
  return body.length === 12 && [...body].every(symbol => PRO_CODE_ALPHABET.includes(symbol));
}
export const isProActive = (until: string | null | undefined, now = Date.now()): boolean => !!until && Date.parse(until) > now;
/** A listing can be bumped a week after its last bump, or after publication if it never was. */
export const nextBumpAt = (listing: Bumpable): Date => new Date(Date.parse(listing.bumpedAt ?? listing.createdAt) + BUMP_INTERVAL_MS);
export const canBumpNow = (listing: Bumpable, now = Date.now()): boolean => nextBumpAt(listing).getTime() <= now;
export const formatProDate = (value: string | Date): string => new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
export const proContactMailto = (): string => `mailto:${ASSISTED_PUBLICATION_EMAIL}?subject=${encodeURIComponent('Quiero KarmaHouse Pro')}`;

const messages: Record<string, string> = {
  KH_PRO_CODE_INVALID: 'Código no válido o ya usado. Revisa que esté bien escrito o escríbenos.',
  KH_PRO_CODE_RATE: 'Demasiados intentos. Vuelve a probar dentro de una hora.',
  KH_PRO_REQUIRED: 'Subir anuncio es parte de KarmaHouse Pro.',
  KH_BUMP_TOO_SOON: 'Este anuncio ya se subió esta semana.',
  KH_BUMP_NOT_ELIGIBLE: 'Solo se pueden subir anuncios publicados y activos.',
  KH_PRO_CODE_STATE: 'Ese código ya se usó o ya estaba anulado.',
  KH_PRO_NOT_ACTIVE: 'Esa cuenta ya no tiene Pro activo.',
  KH_PRO_INVALID: 'Revisa los días (de 1 a 365) y escribe una nota de entre 3 y 500 caracteres.',
  KH_ACCOUNT_DELETING: 'Esta cuenta se está eliminando.',
  KH_ACCOUNT_SUSPENDED: 'Esta cuenta está suspendida.',
  KH_ACCOUNT_CHANGED: 'La sesión cambió. Vuelve a abrir esta pantalla.',
  KH_AGENCY_DISABLED: 'El espacio de inmobiliarias aún no está habilitado.',
  KH_EMAIL_UNCONFIRMED: 'Confirma tu correo para operar con la inmobiliaria.',
  KH_OWNER_REQUIRED: 'Solo el propietario de KarmaHouse puede gestionar Pro.',
  KH_ASSISTED_CONSENT_REQUIRED: 'Este anuncio necesita el consentimiento vigente de quien lo autorizó.',
  KH_ADMIN_REQUIRED: 'Tu cuenta ya no tiene acceso a Administración.',
};
const messageOf = (error: unknown): string => typeof error === 'string' ? error
  : error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
/** Known server codes become guidance; an unknown KH_ code is a refusal; anything else is a connection problem worth retrying. */
export function proErrorMessage(error: unknown): string {
  const text = messageOf(error);
  const code = Object.keys(messages).find(key => text.includes(key));
  if (code) return messages[code];
  return /\bKH_[A-Z0-9_]+/.test(text) ? 'No se pudo completar esta acción.' : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';
}
/** Stale local data (bumped from another device) can put the computed date in the past; then the generic text is the honest one. */
export function bumpErrorMessage(error: unknown, listing: Bumpable): string {
  if (!messageOf(error).includes('KH_BUMP_TOO_SOON')) return proErrorMessage(error);
  const next = nextBumpAt(listing);
  return next.getTime() > Date.now() ? `Podrás subir este anuncio el ${formatProDate(next)}.` : messages.KH_BUMP_TOO_SOON;
}

const invalid = () => new Error('No se pudieron interpretar los datos de KarmaHouse Pro.');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const instant = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableInstant = (v: unknown): v is string | null => v === null || instant(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const nullableText = (v: unknown, max: number): v is string | null => v === null || text(v, max);
/** The server sends one extra row to answer «is there more»; keep 30. */
function page<T>(value: unknown, decode: (item: unknown) => T): ProPage<T> {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 31 || typeof value.hasMore !== 'boolean') throw invalid();
  return { items: value.items.slice(0, 30).map(decode), hasMore: value.hasMore };
}
export function decodeProStatus(value: unknown): ProStatus {
  if (!record(value) || !nullableInstant(value.personalUntil) || !Array.isArray(value.agencies) || value.agencies.length > 100) throw invalid();
  return {
    personalUntil: value.personalUntil as string | null,
    agencies: value.agencies.map(item => {
      if (!record(item) || !isUuid(item.id) || !text(item.tradeName, 120) || !['manager', 'coordinator', 'admin'].includes(String(item.role)) || !nullableInstant(item.until)) throw invalid();
      return { id: item.id as string, tradeName: item.tradeName as string, role: item.role as ProRole, until: item.until as string | null };
    }),
  };
}
/** A refused code arrives as data, not as an exception, so the server can count the attempt. */
export function decodeRedeem(value: unknown): ProRedeemResult {
  if (!record(value) || typeof value.ok !== 'boolean') throw invalid();
  if (!value.ok) throw new Error(typeof value.error === 'string' ? value.error : 'KH_PRO_CODE_INVALID');
  if (!['user', 'agency'].includes(String(value.kind)) || !isUuid(value.id) || !instant(value.until)) throw invalid();
  return { kind: value.kind as 'user' | 'agency', id: value.id as string, until: value.until as string };
}
export function decodeBump(value: unknown): ProBumpResult {
  if (!record(value) || !instant(value.bumpedAt) || !instant(value.nextBumpAt)) throw invalid();
  return { bumpedAt: value.bumpedAt as string, nextBumpAt: value.nextBumpAt as string };
}
export function decodeCreatedCode(value: unknown): { id: string; code: string; expiresAt: string } {
  if (!record(value) || !isUuid(value.id) || typeof value.code !== 'string' || !/^KH-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(value.code) || !instant(value.expiresAt)) throw invalid();
  return { id: value.id as string, code: value.code, expiresAt: value.expiresAt as string };
}
export function decodeGrant(value: unknown): { until: string } {
  if (!record(value) || !instant(value.until)) throw invalid();
  return { until: value.until as string };
}
export function decodeProCodes(value: unknown): ProPage<ProCodeRow> {
  return page(value, item => {
    if (!record(item) || !isUuid(item.id) || !Number.isSafeInteger(item.days) || !text(item.note, 500) || !nullableText(item.boundName, 120)
      || !['unused', 'redeemed', 'expired', 'cancelled'].includes(String(item.state)) || !instant(item.createdAt) || !instant(item.expiresAt)
      || !nullableInstant(item.redeemedAt) || !nullableText(item.redeemedFor, 120) || !nullableText(item.cancelNote, 500)) throw invalid();
    return item as unknown as ProCodeRow;
  });
}
export function decodeProAccounts(value: unknown): ProPage<ProAccountRow> {
  return page(value, item => {
    if (!record(item) || !['user', 'agency'].includes(String(item.kind)) || !isUuid(item.id) || !text(item.name, 120) || !instant(item.until) || !nullableText(item.note, 500) || typeof item.effective !== 'boolean') throw invalid();
    return item as unknown as ProAccountRow;
  });
}
