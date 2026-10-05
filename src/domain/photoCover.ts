import type { PhotoDraft } from './listings.ts';

/** Reorders existing references; choosing a cover never changes or removes image data. */
export function choosePhotoCover<T extends PhotoDraft>(photos: T[], index: number): T[] {
  if (!Number.isInteger(index) || index <= 0 || index >= photos.length) return photos;
  return [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)];
}

/** Prepare before committing a new cover; failed optimization leaves the previous order intact. */
export async function prepareCoverPhoto(photo: PhotoDraft, thumbnail: (uri: string, token: string) => Promise<string | undefined>, token: () => string): Promise<PhotoDraft> {
  if (photo.thumbUri) return photo;
  // A previous cover thumbnail can be orphaned and cannot be attached again; use a fresh identity.
  const uploadId = photo.storagePath ? token() : photo.uploadId ?? token();
  const thumbUri = await thumbnail(photo.uri, uploadId);
  if (!thumbUri) throw new Error('No pudimos preparar la miniatura. Intenta elegir la portada otra vez.');
  return { ...photo, uploadId, thumbUri };
}
