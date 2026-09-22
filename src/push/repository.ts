import { changed, isFcmToken, isRevision, isUuid, registrationError, revocationError, PushError } from './domain.ts';
import type { PushRepository, PushRequestContext, RevocationInput } from './types.ts';

const invalid = () => new PushError('No se pudo confirmar el registro de avisos. Vuelve a intentarlo.');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function validateIdentity(input: RevocationInput) {
  if (!isUuid(input.installationId) || !/^[a-f0-9]{64}$/.test(input.installationSecret) || !isRevision(input.revision)) throw invalid();
}
function checkpoint(context?: PushRequestContext) { context?.checkpoint(); if (context?.signal.aborted) throw changed(); }

/** Uses a captured JWT, never the mutable client's current account. Revocation needs only the installation secret. */
export function createPushRepository(url: string, publicKey: string, fetcher: typeof fetch): PushRepository {
  async function rpc(name: string, args: Record<string, unknown>, context?: PushRequestContext): Promise<Record<string, unknown>> {
    checkpoint(context);
    const headers: Record<string, string> = { apikey: publicKey, 'Content-Type': 'application/json' };
    if (context) headers.Authorization = `Bearer ${context.accessToken}`;
    const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(args), ...(context ? { signal: context.signal } : {}),
    });
    checkpoint(context);
    if (!response.ok) throw name === 'kh_disable_push_device' ? revocationError() : registrationError();
    const result: unknown = await response.json(); checkpoint(context); return record(result);
  }
  return {
    async register(input, context) {
      validateIdentity(input);
      if (!isUuid(context.userId) || !isUuid(context.sessionId) || !isUuid(input.projectId) || input.platform !== 'android' || !isFcmToken(input.fcmToken)) throw invalid();
      const result = await rpc('kh_register_push_device', { p_actor_id: context.userId, p_payload: input }, context);
      if (result.enabled !== true || result.revision !== input.revision || result.platform !== 'android') throw invalid();
      return { enabled: true, revision: input.revision, platform: 'android' };
    },
    async disable(input) {
      validateIdentity(input);
      const result = await rpc('kh_disable_push_device', { p_installation_id: input.installationId, p_installation_secret: input.installationSecret, p_revision: input.revision });
      if (result.enabled !== false || result.revision !== input.revision) throw invalid();
      return { enabled: false, revision: input.revision };
    },
    async resolve(notificationId, context) {
      if (!isUuid(notificationId) || !isUuid(context.userId)) throw invalid();
      const result = await rpc('kh_resolve_push_notification', { p_actor_id: context.userId, p_notification_id: notificationId }, context);
      if (result.notificationId !== notificationId || result.recipientId !== context.userId || !isUuid(result.conversationId)) throw invalid();
      return { notificationId, recipientId: context.userId, conversationId: result.conversationId };
    },
  };
}
