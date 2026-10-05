import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhotoDraft } from '../domain/listings';
import type { MarketplaceStorage } from '../state/marketplaceStore';
import type { RemoteMarketplaceRepository } from '../state/remoteMarketplaceStore';
import { collectPages, type RemotePropertyRow } from './remoteMapping';
import { uploadCoverThumb, uploadDraftPhotos, type PhotoUploadPort } from './photoUpload';
import { propertyPayload } from './propertyPayload';
import { createRowSigner as createCachedRowSigner, type SignRows } from './rowSigner';
import { createSignedUrlCache } from './signedUrlCache';
export { propertyPayload } from './propertyPayload';
export type { SignRows } from './rowSigner';

const BUCKET = 'property-photos';
// One cache for every signer: the catalogue, the account and public profiles reuse the same links,
// so the image cache keeps hitting the same URL. Kept on sign-out: they are links to public photos.
const photoLinks = createSignedUrlCache({ storage: AsyncStorage, now: Date.now });
export const PROPERTY_COLUMNS = 'id,owner_id,client_request_id,title,location,province,latitude,longitude,location_precision,condition,floor,price_negotiable,price,bedrooms,bathrooms,area,type,description,amenities,photo_paths,availability,moderation,review_note,version,created_at,operation,swap_wants,swap_provinces,swap_balance,swap_amount,rent_period,rent_min_stay,wanted_operations,cover_thumb_path';

/** Shared by the marketplace repository and the paginated catalogue repository. */
export function createRowSigner(client: SupabaseClient): SignRows {
  return createCachedRowSigner(client.storage.from(BUCKET), photoLinks);
}

export function createSupabaseMarketplaceRepository(client: SupabaseClient, storage: MarketplaceStorage): RemoteMarketplaceRepository {
  const bucket = client.storage.from(BUCKET);
  const photoPort: PhotoUploadPort = {
    async upload(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
      if (error) throw error;
    },
    async exists(path) {
      const { data, error } = await bucket.info(path);
      if (!error) return !!data;
      if (/not.?found|does not exist/i.test(error.message) || ('status' in error && error.status === 404) || ('statusCode' in error && String(error.statusCode) === '404')) return false;
      throw error;
    },
    async readLocal(uri) {
      // No HTTP fetch: untrusted URLs must never become imported photographs.
      if (!/^(?:file|content|ph|assets-library):\/\//i.test(uri)) throw new Error('La foto debe estar guardada en tu dispositivo.');
      const { File } = await import('expo-file-system');
      const bytes = await new File(uri).arrayBuffer();
      const contentType = /\.png(?:\?|$)/i.test(uri) ? 'image/png' : /\.webp(?:\?|$)/i.test(uri) ? 'image/webp' : 'image/jpeg';
      return { bytes, contentType };
    },
    async getUploadId(photo, ownerId, requestId) {
      if (photo.uploadId) return photo.uploadId;
      // Legacy callers without uploadId also get a persisted retry token. The fingerprint
      // is only a local cache key, never a credential or integrity proof.
      const key = `@karma-house/photo-upload/${ownerId}/${requestId}/${uriFingerprint(photo.uri)}`;
      const previous = await storage.getItem(key);
      if (previous && /^[A-Za-z0-9_-]{1,100}$/.test(previous)) return previous;
      const id = `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await storage.setItem(key, id);
      return id;
    },
  };

  const resolveRows = createRowSigner(client);
  const readProperties = (filters: { ownerId?: string; publicOnly?: boolean; pendingOnly?: boolean }, checkpoint: () => void) => collectPages<RemotePropertyRow>(async (from, to) => {
    checkpoint();
    let query = client.from('properties').select(PROPERTY_COLUMNS);
    if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
    if (filters.publicOnly) query = query.eq('moderation', 'approved').eq('availability', 'active');
    if (filters.pendingOnly) query = query.eq('moderation', 'pending');
    const { data, error } = await query.order('created_at', { ascending: false }).order('id').range(from, to);
    checkpoint();
    if (error) throw error;
    return (data ?? []) as RemotePropertyRow[];
  });

  return {
    // The public catalogue is no longer walked here: src/catalog pages it on demand. A
    // session load now costs only the account's own listings and favourite ids.
    async load(ownerId, checkpoint) {
      const [ownRows, favorites] = await Promise.all([
        ownerId ? readProperties({ ownerId }, checkpoint) : Promise.resolve([]),
        ownerId ? collectPages<{ property_id: string }>(async (from, to) => {
          checkpoint();
          const { data, error } = await client.from('favorites').select('property_id').eq('user_id', ownerId).order('property_id').range(from, to);
          checkpoint();
          if (error) throw error;
          return data ?? [];
        }) : Promise.resolve([]),
      ]);
      checkpoint();
      const ownListings = await resolveRows(ownRows, checkpoint);
      return { ownListings, favoriteIds: favorites.map((row) => row.property_id) };
    },
    async save(draft, ownerId, current, moderation, checkpoint) {
      const requestId = draft.clientRequestId;
      if (!requestId) throw new Error('Falta el identificador del borrador.');
      if (current && current.clientRequestId !== requestId) throw new Error('El borrador no corresponde a este anuncio.');
      const photos: PhotoDraft[] = draft.photos ?? (draft.photoUri ? [{ uri: draft.photoUri }] : []);
      if (moderation === 'pending' && photos.length === 0) throw new Error('Añade al menos una fotografía para enviar el anuncio a revisión.');
      const photoPaths = await uploadDraftPhotos(photos, ownerId, requestId, photoPort, checkpoint, current ? { propertyId: current.id, reusablePaths: current.photos?.flatMap(photo => photo.storagePath ? [photo.storagePath] : []) ?? [] } : undefined);
      const coverThumbPath = await uploadCoverThumb(photos[0], photoPaths, photoPort, checkpoint);
      checkpoint();
      const payload = propertyPayload(draft, ownerId, photoPaths, moderation, current, coverThumbPath);
      const { data, error } = await client.rpc('kh_save_property', { p_payload: payload });
      checkpoint();
      if (error) throw error;
      return (await resolveRows([data as RemotePropertyRow], checkpoint))[0];
    },
    async setFavorite(ownerId, listingId, favorite, checkpoint) {
      checkpoint();
      const result = favorite ? await client.from('favorites').insert({ user_id: ownerId, property_id: listingId }) :
        await client.from('favorites').delete().eq('user_id', ownerId).eq('property_id', listingId);
      checkpoint();
      // A retry after a lost insert response may encounter the existing favorite.
      if (result.error && !(favorite && result.error.code === '23505')) throw result.error;
    },
    async setStatus(id, status, checkpoint) {
      checkpoint();
      const { error } = await client.rpc('kh_set_property_status', { p_id: id, p_status: status });
      checkpoint(); if (error) throw error;
    },
    async submit(id, checkpoint) {
      checkpoint();
      const { error } = await client.rpc('kh_submit_property', { p_id: id });
      checkpoint(); if (error) throw error;
    },
    async loadModerationQueue(checkpoint) {
      return resolveRows(await readProperties({ pendingOnly: true }, checkpoint), checkpoint);
    },
    async review(id, decision, note, version, checkpoint) {
      checkpoint();
      const { error } = await client.rpc('kh_review_property', { p_id: id, p_decision: decision, p_note: note, p_expected_version: version });
      checkpoint(); if (error) throw error;
    },
  };
}

function uriFingerprint(value: string): string {
  let first = 2166136261; let second = 5381;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `${value.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
