import type { PushPayload, PushSession } from './types.ts';

export const PUSH_CHANNEL_ID = 'karmahouse-updates';
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const MAX_PUSH_REVISION = 999999999;
export const isRevision = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_PUSH_REVISION;
/** The FCM registration token, as Google issues it. The server exchanges it for an Expo token. */
export const isFcmToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_\-:.%]{64,255}$/.test(value);
export function parsePushPayload(value: unknown): PushPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || item.kind !== 'karmahouse.notification' || !isUuid(item.notificationId) || !isUuid(item.recipientId)) return null;
  return { kind: 'karmahouse.notification', notificationId: item.notificationId, recipientId: item.recipientId };
}

/** This extracts a cancellation identity; the server still authenticates the JWT and auth.sessions. */
export function sessionFromAccessToken(userId: string, accessToken: string): PushSession | null {
  try {
    const encoded = accessToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded || encoded.length > 16384) return null;
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    if (!isUuid(userId) || claims.sub !== userId || !isUuid(claims.session_id)) return null;
    return { userId, sessionId: claims.session_id, accessToken };
  } catch { return null; }
}

export class PushError extends Error {}
export const changed = () => new Error('KH_PUSH_SESSION_CHANGED');
export const registrationError = () => new PushError('No se pudieron activar los avisos de este teléfono. Comprueba tu conexión e inténtalo de nuevo.');
export const revocationError = () => new PushError('No pudimos confirmar la desactivación de los avisos. Comprueba tu conexión y vuelve a intentarlo antes de cerrar sesión.');
export function nextRevision(revision: number): number {
  if (!Number.isInteger(revision) || revision < 0 || revision >= MAX_PUSH_REVISION) throw new PushError('No se pudo actualizar el registro de este teléfono.');
  return revision + 1;
}
