import type { Listing } from '../domain/listings.ts';
import { mapRemoteListing, type RemotePropertyRow } from './remoteMapping.ts';
import { SIGNED_URL_SECONDS, type SignedUrlCache, type SignedUrlEntry } from './signedUrlCache.ts';

/** Signs the storage paths a batch of rows needs and maps them to listings. */
export type SignRows = (rows: RemotePropertyRow[], checkpoint: () => void, photos?: 'cover' | 'all') => Promise<Listing[]>;

/** The one storage call the signer needs; Supabase's bucket API satisfies it. */
export interface SigningBucket {
  createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: { path: string | null; signedUrl: string | null; error: string | null }[] | null; error: unknown }>;
}

/**
 * A card needs only the cover thumbnail (or the cover itself on older listings); a detail
 * needs every photo, and the thumbnail rides along so lists built from those rows stay light.
 */
function rowPaths(row: RemotePropertyRow, photos: 'cover' | 'all'): string[] {
  const thumb = row.cover_thumb_path;
  if (photos === 'cover') return thumb ? [thumb] : row.photo_paths.slice(0, 1);
  return thumb ? [...row.photo_paths, thumb] : row.photo_paths;
}

/** Reuses week-long links from the cache and asks the server only for the ones it lacks. */
export function createRowSigner(bucket: SigningBucket, cache: SignedUrlCache, now: () => number = Date.now): SignRows {
  let hydrated: Promise<void> | undefined;
  return async (rows, checkpoint, photos = 'all') => {
    checkpoint();
    await (hydrated ??= cache.hydrate());
    checkpoint();
    const paths = [...new Set(rows.flatMap((row) => rowPaths(row, photos)))];
    const missing = cache.missing(paths);
    const signedUrls = new Map(paths.flatMap((path) => { const url = cache.get(path); return url ? [[path, url] as const] : []; }));
    const fresh: SignedUrlEntry[] = [];
    for (let start = 0; start < missing.length; start += 100) {
      checkpoint();
      const expiresAt = now() + SIGNED_URL_SECONDS * 1000;
      const { data, error } = await bucket.createSignedUrls(missing.slice(start, start + 100), SIGNED_URL_SECONDS);
      checkpoint();
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.error || !item.path || !item.signedUrl) throw new Error('No se pudieron cargar las fotos autorizadas del anuncio. Inténtalo de nuevo.');
        signedUrls.set(item.path, item.signedUrl);
        fresh.push({ path: item.path, url: item.signedUrl, expiresAt });
      }
    }
    if (paths.some((path) => !signedUrls.has(path))) throw new Error('Faltan fotos del anuncio en la respuesta del servidor.');
    // Persisting is best effort and must not hold up the page.
    if (fresh.length) void cache.put(fresh);
    return rows.map((row) => mapRemoteListing(row, signedUrls, photos));
  };
}
