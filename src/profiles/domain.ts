import { isOwnedAvatarPath } from '../auth/accountProfile.ts';
import { isUuid } from '../messaging/domain.ts';
import type { KarmaLevel, PublicProfile } from './types.ts';

export class ProfileError extends Error {
  readonly notFound: boolean;
  constructor(message: string, notFound = false) { super(message); this.notFound = notFound; }
}
export const PROFILE_NOT_FOUND = 'Este perfil no está disponible';

const LEVELS: Record<KarmaLevel, [string, string]> = {
  new: ['Nuevo', 'Acaba de llegar a KarmaHouse y todavía está construyendo su historial.'],
  active: ['Activo', 'Participa en KarmaHouse: publica, responde mensajes y concierta visitas.'],
  trusted: ['Confiable', 'Tiene un historial sólido de anuncios aprobados, respuestas y visitas concertadas.'],
  featured: ['Destacado', 'Uno de los perfiles con mejor historial de KarmaHouse, sin reportes confirmados recientes.'],
};
export const levelLabel = (level: KarmaLevel) => LEVELS[level][0];
export const levelDescription = (level: KarmaLevel) => LEVELS[level][1];

export function responseText(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return 'Suele responder en menos de una hora';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'Suele responder en una hora' : `Suele responder en unas ${hours} horas`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? 'Suele responder en un día' : `Suele responder en unos ${days} días`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function memberSinceText(value: string): string {
  const date = new Date(value);
  return `En KarmaHouse desde ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

const KEYS = ['id', 'displayName', 'memberSince', 'verified', 'level', 'levelReasons', 'activeListings', 'activeListingCount',
  'approvedListingCount', 'responseMinutes', 'responseRate', 'visitsAgreed', 'avatarUrlPath'];
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && [...value.trim()].length >= min && [...value].length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/** Only the documented keys: anything more (an email, a phone) means the server changed and is refused. */
export function decodePublicProfile(value: unknown): PublicProfile {
  const invalid = new ProfileError('No se pudo interpretar este perfil. Vuelve a intentarlo.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (item.identityOnly === true) {
    if (keys.length !== 4 || !['id','displayName','avatarUrlPath','identityOnly'].every(key => keys.includes(key))
      || !isUuid(item.id) || !text(item.displayName,2,80) || !(item.avatarUrlPath === null || isOwnedAvatarPath(item.avatarUrlPath,item.id))) throw invalid;
    return {id:item.id,displayName:item.displayName,avatarUrlPath:item.avatarUrlPath,identityOnly:true,
      memberSince:'',verified:false,level:'new',levelReasons:[],activeListings:[],activeListingCount:0,
      approvedListingCount:0,responseMinutes:null,responseRate:null,visitsAgreed:0};
  }
  if (keys.length !== KEYS.length || !KEYS.every(key => keys.includes(key))
    || !isUuid(item.id) || !text(item.displayName, 2, 80)
    || typeof item.memberSince !== 'string' || item.memberSince.length > 40 || !Number.isFinite(Date.parse(item.memberSince))
    || typeof item.verified !== 'boolean' || typeof item.level !== 'string' || !(item.level in LEVELS)
    || !Array.isArray(item.levelReasons) || item.levelReasons.length > 12 || !item.levelReasons.every(reason => text(reason, 1, 120))
    || !Array.isArray(item.activeListings) || item.activeListings.length > 24 || !item.activeListings.every(isUuid)
    || new Set(item.activeListings).size !== item.activeListings.length
    || ![item.activeListingCount, item.approvedListingCount, item.visitsAgreed].every(count)
    || !(item.responseMinutes === null || typeof item.responseMinutes === 'number' && Number.isFinite(item.responseMinutes) && item.responseMinutes >= 0)
    || !(item.responseRate === null || typeof item.responseRate === 'number' && item.responseRate >= 0 && item.responseRate <= 100)
    || !(item.avatarUrlPath === null || isOwnedAvatarPath(item.avatarUrlPath, item.id))) throw invalid;
  return { id: item.id, displayName: item.displayName, memberSince: item.memberSince, verified: item.verified, level: item.level as KarmaLevel,
    levelReasons: [...item.levelReasons], activeListings: [...item.activeListings], activeListingCount: item.activeListingCount as number,
    approvedListingCount: item.approvedListingCount as number, responseMinutes: item.responseMinutes, responseRate: item.responseRate,
    visitsAgreed: item.visitsAgreed as number, avatarUrlPath: item.avatarUrlPath };
}

export function profileErrorMessage(error: unknown): string {
  if (error instanceof ProfileError) return error.message;
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/KH_CANNOT_VERIFY_SELF/.test(message)) return 'No puedes verificar tu propia cuenta.';
  if (/KH_ADMIN_REQUIRED/.test(message)) return 'Necesitas una cuenta administradora para verificar perfiles.';
  if (/JWT|token.*expired|PGRST301/i.test(message)) return 'Inicia sesión de nuevo e inténtalo otra vez.';
  if (/network|fetch|timeout|abort/i.test(message)) return 'No se pudo conectar. Vuelve a intentar cuando tengas conexión.';
  return 'No se pudo cargar este perfil. Inténtalo de nuevo.';
}
