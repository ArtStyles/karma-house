import { AVATAR_BUCKET, AccountProfileError, avatarPathFor, isOwnedAvatarPath, normalizeAccountName, validateAvatarUpload, validateSignedAvatarUrl, type AccountProfile, type AccountProfileInput, type AccountRequestContext, type AvatarUpload } from './accountProfile.ts';

export interface AccountProfileRepository {
  load(context: AccountRequestContext): Promise<AccountProfile>;
  update(name: string, avatarPath: string | null, replace: boolean, context: AccountRequestContext): Promise<AccountProfile>;
  upload(path: string, photo: AvatarUpload, context: AccountRequestContext): Promise<void>;
  remove(path: string, context: AccountRequestContext): Promise<void>;
  sign(path: string, context: AccountRequestContext): Promise<string | null>;
}

export function createAccountProfileRepository(origin: string, publicKey: string, fetcher: typeof fetch = fetch): AccountProfileRepository {
  const base = origin.replace(/\/$/, '');
  async function request(path: string, context: AccountRequestContext, body?: unknown, method = 'POST') {
    context.checkpoint();
    if (context.signal.aborted) throw new Error('KH_ACCOUNT_CHANGED');
    const binary = body instanceof ArrayBuffer;
    const response = await fetcher(`${base}${path}`, { method, signal: context.signal, headers: {
      apikey: publicKey, Authorization: `Bearer ${context.accessToken}`, 'Content-Type': binary ? 'image/jpeg' : 'application/json',
      ...(binary ? { 'x-upsert': 'false', 'cache-control': 'max-age=3600' } : {}),
    }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    context.checkpoint();
    if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'ACCOUNT_REQUEST_FAILED');
    return data;
  }
  function profile(value: unknown, actorId: string): AccountProfile {
    if (!value || typeof value !== 'object') throw new AccountProfileError('No pudimos recuperar tu perfil.');
    const item = value as AccountProfile;
    if (item.id !== actorId || typeof item.displayName !== 'string' || (item.avatarPath !== null && !isOwnedAvatarPath(item.avatarPath, actorId))) throw new AccountProfileError('No pudimos recuperar tu perfil.');
    return { id: item.id, displayName: normalizeAccountName(item.displayName), avatarPath: item.avatarPath };
  }
  function assertPath(path: string, context: AccountRequestContext) { if (!isOwnedAvatarPath(path, context.actorId)) throw new Error('KH_ACCOUNT_CHANGED'); }
  return {
    async load(context) { return profile(await request('/rest/v1/rpc/kh_get_account_profile', context, { p_actor_id: context.actorId }), context.actorId); },
    async update(name, path, replace, context) {
      if (path !== null) assertPath(path, context);
      return profile(await request('/rest/v1/rpc/kh_update_account_profile', context, { p_actor_id: context.actorId, p_display_name: normalizeAccountName(name), p_avatar_path: path, p_replace_avatar: replace }), context.actorId);
    },
    async upload(path, photo, context) { assertPath(path, context); validateAvatarUpload(photo); await request(`/storage/v1/object/${AVATAR_BUCKET}/${path}`, context, photo.data); },
    async remove(path, context) { assertPath(path, context); await request(`/storage/v1/object/${AVATAR_BUCKET}`, context, { prefixes: [path] }, 'DELETE'); },
    async sign(path, context) {
      assertPath(path, context);
      const result = await request(`/storage/v1/object/sign/${AVATAR_BUCKET}/${path}`, context, { expiresIn: 3600 });
      const raw = result?.signedURL;
      if (typeof raw !== 'string') throw new AccountProfileError('No pudimos cargar la foto de tu cuenta.');
      const url = raw.startsWith('/object/') ? `${base}/storage/v1${raw}` : new URL(raw, base).toString();
      return validateSignedAvatarUrl(url, base, path);
    },
  };
}

export async function saveAccountProfile(repository: AccountProfileRepository, context: AccountRequestContext, input: AccountProfileInput, previousPath: string | null, createId: () => string): Promise<AccountProfile> {
  context.checkpoint();
  const name = normalizeAccountName(input.displayName);
  let uploadedPath: string | null = null;
  try {
    if (input.avatar) {
      validateAvatarUpload(input.avatar);
      uploadedPath = avatarPathFor(context.actorId, createId());
      await repository.upload(uploadedPath, input.avatar, context);
      context.checkpoint();
    }
    const updated = await repository.update(name, uploadedPath, input.avatar !== undefined, context);
    context.checkpoint();
    if (previousPath && input.avatar !== undefined && previousPath !== updated.avatarPath) await repository.remove(previousPath, context).catch(() => undefined);
    context.checkpoint();
    return updated;
  } catch (error) {
    // Storage refuses deleting a currently referenced avatar if an update succeeded but its response was lost.
    if (uploadedPath) { try { context.checkpoint(); await repository.remove(uploadedPath, context); } catch { /* Keep the previous account isolated. */ } }
    throw error;
  }
}
