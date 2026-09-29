import type { SupabaseClient } from '@supabase/supabase-js';
import { AVATAR_BUCKET, validateSignedAvatarUrl } from '../auth/accountProfile.ts';
import { isUuid } from '../messaging/domain.ts';
import { decodePublicProfile, PROFILE_NOT_FOUND, ProfileError } from './domain.ts';
import type { ProfileRepository } from './types.ts';

export function createSupabaseProfileRepository(client: SupabaseClient, origin = ''): ProfileRepository {
  const decode = (data: unknown, error: { message?: string } | null) => {
    if (error) throw /KH_PROFILE_NOT_FOUND/.test(error.message ?? '') ? new ProfileError(PROFILE_NOT_FOUND, true) : error;
    return decodePublicProfile(data);
  };
  return {
    async get(userId, { signal, accessToken }) {
      if (!isUuid(userId)) throw new ProfileError(PROFILE_NOT_FOUND, true);
      const request = client.rpc('kh_public_profile', { p_user_id: userId }).abortSignal(signal);
      // Signed out the client sends only the publishable key; kh_public_profile then runs as anon.
      const { data, error } = await (accessToken ? request.setHeader('Authorization', `Bearer ${accessToken}`) : request);
      return decode(data, error);
    },
    async setVerified(userId, verified, note, context) {
      if (!context.userId || !context.accessToken) throw new ProfileError('Inicia sesión como administrador para verificar perfiles.');
      if (!isUuid(userId)) throw new ProfileError(PROFILE_NOT_FOUND, true);
      context.checkpoint();
      const { data, error } = await client.rpc('kh_set_user_verified', { p_actor_id: context.userId, p_user_id: userId, p_verified: verified, p_note: note.trim() || null })
        .setHeader('Authorization', `Bearer ${context.accessToken}`).abortSignal(context.signal);
      context.checkpoint();
      return decode(data, error);
    },
    async avatarUrl(path) {
      try {
        const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
        return error || !data?.signedUrl ? null : validateSignedAvatarUrl(data.signedUrl, origin, path);
      } catch { return null; }
    },
  };
}
