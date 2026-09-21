export const AVATAR_BUCKET = 'account-avatars';
export const AVATAR_MAX_BYTES = 1024 * 1024;
export interface AvatarUpload { data: ArrayBuffer; contentType: 'image/jpeg' }
export interface AccountProfile { id: string; displayName: string; avatarPath: string | null }
export interface AccountProfileInput { displayName: string; avatar?: AvatarUpload | null }
export interface AccountRequestContext { actorId: string; accessToken: string; signal: AbortSignal; checkpoint(): void }
export class AccountProfileError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAccountName(value: string): string {
  if (typeof value !== 'string') throw new AccountProfileError('Escribe tu nombre, entre 2 y 80 caracteres.');
  const name = value.trim();
  if ([...name].length < 2 || [...name].length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new AccountProfileError('Escribe tu nombre, entre 2 y 80 caracteres, en una sola línea.');
  return name;
}

export function avatarPathFor(actorId: string, imageId: string): string {
  if (!uuid.test(actorId) || !uuid.test(imageId)) throw new AccountProfileError('No pudimos preparar la foto para tu cuenta.');
  return `${actorId}/${imageId}.jpg`;
}
export function isOwnedAvatarPath(path: unknown, actorId: string): path is string {
  if (typeof path !== 'string') return false;
  const pieces = path.split('/');
  return pieces.length === 2 && pieces[0] === actorId && uuid.test(actorId) && pieces[1].endsWith('.jpg') && uuid.test(pieces[1].slice(0, -4));
}
export function validateAvatarUpload(value: { data: ArrayBuffer; contentType: string }): asserts value is AvatarUpload {
  if (value.contentType !== 'image/jpeg' || !(value.data instanceof ArrayBuffer) || value.data.byteLength < 4 || value.data.byteLength > AVATAR_MAX_BYTES) throw new AccountProfileError('Elige una foto JPEG de hasta 1 MB.');
  const bytes = new Uint8Array(value.data);
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new AccountProfileError('La foto no se pudo preparar. Elige otra imagen.');
}

interface AvatarAsset { uri: string; width: number; height: number; type?: string | null; mimeType?: string | null; fileSize?: number }
export function selectedAvatarAsset<T extends AvatarAsset>(result: { canceled: boolean; assets: T[] | null }): T | null {
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset || !/^(?:file:|content:|blob:|data:image\/)/.test(asset.uri) || asset.type && asset.type !== 'image'
    || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width < 1 || asset.height < 1 || asset.width * asset.height > 100_000_000
    || asset.fileSize && asset.fileSize > 30 * 1024 * 1024
    || asset.mimeType && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/bmp'].includes(asset.mimeType)) throw new AccountProfileError('Elige una fotografía válida en JPEG, PNG, HEIC o WebP.');
  return asset;
}

export function validateSignedAvatarUrl(value: string, origin: string, path: string): string {
  try {
    const base = new URL(origin);
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.hash
      || url.pathname !== `/storage/v1/object/sign/${AVATAR_BUCKET}/${path}` || !url.searchParams.get('token')) throw new Error();
    return url.toString();
  } catch { throw new AccountProfileError('No pudimos cargar la foto de tu cuenta.'); }
}

export function accountProfileError(error: unknown): string {
  if (error instanceof AccountProfileError) return error.message;
  const value = error instanceof Error ? error.message : '';
  if (/KH_ACCOUNT_CHANGED|AbortError/.test(value)) return 'La sesión cambió. Abre los ajustes con la cuenta actual.';
  if (/KH_PROFILE_NAME/.test(value)) return 'Escribe un nombre de entre 2 y 80 caracteres.';
  if (/KH_PROFILE_AVATAR/.test(value)) return 'No pudimos guardar esta foto. Elige otra y vuelve a intentarlo.';
  return 'No pudimos guardar los cambios. Comprueba tu conexión y vuelve a intentarlo.';
}
