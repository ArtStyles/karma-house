import { isExpoPushToken, isUuid, MAX_PUSH_REVISION, PushError } from './domain.ts';
import type { InstallationIdentity, InstallationState, InstallationStore } from './types.ts';

export const INSTALLATION_STORAGE_KEY = 'karmahouse.push.installation.v1';
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
function validate(value: unknown): InstallationState {
  const item = value as InstallationState;
  if (!item || item.version !== 1 || !isUuid(item.installationId) || !/^[a-f0-9]{64}$/.test(item.installationSecret)
    || !Number.isInteger(item.revision) || item.revision < 0 || item.revision > MAX_PUSH_REVISION) throw new Error('Invalid installation');
  const intent = item.intent;
  if (intent === null) { if (item.revision !== 0) throw new Error('Missing intent'); }
  else if (!intent || item.revision === 0 || typeof intent.enabled !== 'boolean' || typeof intent.confirmed !== 'boolean' || typeof intent.wasEnabled !== 'boolean'
    || intent.userId !== null && !isUuid(intent.userId) || intent.sessionId !== null && !isUuid(intent.sessionId)
    || intent.expoPushToken !== null && !isExpoPushToken(intent.expoPushToken)
    || intent.enabled && (!intent.userId || !intent.sessionId || !intent.expoPushToken)) throw new Error('Invalid intent');
  return { version: 1, installationId: item.installationId, installationSecret: item.installationSecret, revision: item.revision,
    intent: intent ? { enabled: intent.enabled, userId: intent.userId, sessionId: intent.sessionId, expoPushToken: intent.expoPushToken, confirmed: intent.confirmed, wasEnabled: intent.wasEnabled } : null };
}

/** One durable write precedes each outbound mutation. Failed writes never publish an in-memory revision. */
export function createInstallationStore(storage: Storage, identity: () => InstallationIdentity | Promise<InstallationIdentity>): InstallationStore {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = tail.then(action, action); tail = result.catch(() => {}); return result;
  };
  async function read() {
    try {
      const raw = await storage.getItem(INSTALLATION_STORAGE_KEY);
      if (raw !== null) return validate(JSON.parse(raw));
      const initial = validate({ ...await identity(), version: 1, revision: 0, intent: null });
      await storage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify(initial)); return initial;
    } catch { throw new PushError('No se pudo recuperar el registro seguro de avisos de este teléfono. Vuelve a intentarlo.'); }
  }
  return {
    read: () => serial(read),
    change: update => serial(async () => {
      const current = await read(), next = validate(update(current));
      if (next.installationId !== current.installationId || next.installationSecret !== current.installationSecret || next.revision < current.revision) throw new PushError('El registro del teléfono no se puede reemplazar.');
      await storage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify(next)); return next;
    }),
  };
}
