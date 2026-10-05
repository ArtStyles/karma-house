import type { PhotoDraft } from './listings.ts';

/** Reorders existing references; choosing a cover never changes or removes image data. */
export function choosePhotoCover<T extends PhotoDraft>(photos: T[], index: number): T[] {
  if (!Number.isInteger(index) || index <= 0 || index >= photos.length) return photos;
  return [photos[index], ...photos.slice(0, index), ...photos.slice(index + 1)];
}
