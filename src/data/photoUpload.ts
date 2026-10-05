import { isSupportedPhotoUri, type PhotoDraft } from '../domain/listings.ts';

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export function ownedPhotoPath(path: string, ownerId: string, requestId: string): boolean {
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === ownerId && parts[1] === requestId &&
    /^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(parts[2]);
}

export function decodePhotoDataUri(uri: string): { bytes: ArrayBuffer; contentType: string } {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if (!match || !isSupportedPhotoUri(uri)) throw new Error('La imagen local no tiene un formato válido.');
  const encoded = match[2];
  if (encoded.length % 4 === 1) throw new Error('La imagen contiene datos incompletos.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array(Math.floor(encoded.replace(/=+$/, '').length * 6 / 8));
  let bits = 0; let value = 0; let offset = 0;
  for (const char of encoded) {
    if (char === '=') break;
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; output[offset++] = (value >>> bits) & 255; }
  }
  if (!output.byteLength || output.byteLength > MAX_PHOTO_BYTES) throw new Error('La imagen debe ocupar entre 1 byte y 4 MB.');
  return { bytes: output.buffer, contentType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1] };
}

export interface PhotoUploadPort {
  upload(path: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readLocal(uri: string): Promise<{ bytes: ArrayBuffer; contentType: string }>;
  getUploadId(photo: PhotoDraft, ownerId: string, requestId: string): Promise<string>;
}

/** Each checkpoint stops subsequent requests if the account changed while reading/uploading. */
export async function uploadDraftPhotos(photos: PhotoDraft[], ownerId: string, requestId: string, port: PhotoUploadPort, checkpoint: () => void, current?: { propertyId: string; reusablePaths: readonly string[] }): Promise<string[]> {
  if (photos.length > 6) throw new Error('Puedes añadir hasta seis fotos.');
  const paths: string[] = [];
  for (const photo of photos) {
    checkpoint();
    if (photo.storagePath) {
      if (!ownedPhotoPath(photo.storagePath, ownerId, requestId) && !(current?.propertyId && current.reusablePaths.includes(photo.storagePath))) throw new Error('No puedes reutilizar fotos de otra propiedad o cuenta.');
      paths.push(photo.storagePath);
      continue;
    }
    if (!photo.uri || !isSupportedPhotoUri(photo.uri)) throw new Error('Selecciona una imagen local; no se importan direcciones externas.');
    const uploadId = await port.getUploadId(photo, ownerId, requestId);
    checkpoint();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(uploadId)) throw new Error('El identificador de la foto no es válido.');
    const data = photo.uri.startsWith('data:') ? decodePhotoDataUri(photo.uri) : await port.readLocal(photo.uri);
    checkpoint();
    if (data.bytes.byteLength === 0 || data.bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('Cada foto debe ocupar como máximo 4 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.contentType)) throw new Error('La foto debe ser JPEG, PNG o WebP.');
    const extension = data.contentType === 'image/png' ? 'png' : data.contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${ownerId}/${requestId}/${uploadId}.${extension}`;
    // Check before retrying: successful uploads remain immutable, even after a lost response.
    if (!await port.exists(path)) {
      checkpoint();
      await port.upload(path, data.bytes, data.contentType);
    }
    checkpoint();
    paths.push(path);
  }
  return paths;
}

/**
 * New local covers use `<cover name>_t.jpg`; stored covers use a fresh token in the current
 * owner's request. Unreadable thumbnails return nothing; a changed-cover save rejects that
 * result so it cannot silently increase card downloads.
 */
export async function uploadCoverThumb(cover: PhotoDraft | undefined, photoPaths: string[], port: Pick<PhotoUploadPort, 'upload' | 'exists' | 'readLocal'>, checkpoint: () => void, scope?: { ownerId: string; requestId: string }): Promise<string | undefined> {
  if (!cover?.thumbUri || !photoPaths[0]) return undefined;
  // Stored media stays immutable. A fresh thumbnail belongs to the current owner's request.
  const stored = scope && !!cover.storagePath;
  if (stored && (!/^[0-9a-f-]{36}$/i.test(scope.ownerId) || !/^[A-Za-z0-9_-]{1,100}$/.test(scope.requestId) || !cover.uploadId || !/^[A-Za-z0-9_-]{1,98}$/.test(cover.uploadId))) return undefined;
  const path = stored ? `${scope.ownerId}/${scope.requestId}/${cover.uploadId}_t.jpg` : photoPaths[0].replace(/\.[A-Za-z]+$/, '_t.jpg');
  if (!/^[^/]+\/[^/]+\/[A-Za-z0-9_-]{1,100}\.jpg$/.test(path) || photoPaths.includes(path)) return undefined;
  let data: { bytes: ArrayBuffer; contentType: string };
  try {
    data = cover.thumbUri.startsWith('data:') ? decodePhotoDataUri(cover.thumbUri) : await port.readLocal(cover.thumbUri);
  } catch { return undefined; }
  checkpoint();
  if (data.contentType !== 'image/jpeg' || data.bytes.byteLength === 0 || data.bytes.byteLength > MAX_PHOTO_BYTES) return undefined;
  if (!await port.exists(path)) {
    checkpoint();
    await port.upload(path, data.bytes, data.contentType);
  }
  checkpoint();
  return path;
}
