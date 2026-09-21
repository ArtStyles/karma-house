export const NOTIFICATION_PAGE_SIZE = 30;
export class NotificationError extends Error {}

/** PostgreSQL bigint values cross the API as canonical decimal strings. */
export function isNotificationSequence(value: unknown, allowZero = false): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (allowZero || value !== '0')
    && (value.length < 19 || value <= '9223372036854775807');
}
export function compareNotificationSequence(a: string, b: string): number {
  if (!isNotificationSequence(a, true) || !isNotificationSequence(b, true)) throw new NotificationError('No se pudo interpretar el orden de los avisos. Actualiza la bandeja.');
  return a.length === b.length ? (a === b ? 0 : a > b ? 1 : -1) : a.length > b.length ? 1 : -1;
}
export function notificationErrorMessage(error: unknown): string {
  if (error instanceof NotificationError) return error.message;
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/ACCOUNT_CHANGED|SESSION_CHANGED/.test(message)) return 'La sesión cambió. Abre los avisos con la cuenta actual.';
  if (/AUTH_REQUIRED|JWT|token.*expired|PGRST301/i.test(message)) return 'Inicia sesión de nuevo para consultar tus avisos.';
  if (/PREFERENCES_CONFLICT/.test(message)) return 'Tus preferencias cambiaron en otra sesión. Actualízalas antes de guardar.';
  if (/NOT_FOUND/.test(message)) return 'Este aviso ya no está disponible. Actualiza la bandeja.';
  if (/network|fetch|timeout|abort/i.test(message)) return 'No se pudo conectar. Vuelve a intentar cuando tengas conexión.';
  return 'No se pudieron actualizar los avisos. Inténtalo de nuevo.';
}
