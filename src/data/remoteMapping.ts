import type { Listing, ListingStatus, ListingType, ModerationStatus } from '../domain/listings.ts';
import { isMapLocation, normalizeMapLocation } from '../domain/geo.ts';
import { isListingCondition, type ListingCondition } from '../domain/listingOptions.ts';

export interface RemotePropertyRow {
  id: string;
  owner_id: string;
  client_request_id: string;
  title: string;
  location: string;
  province: string;
  condition?: ListingCondition | null;
  floor?: number | null;
  price_negotiable?: boolean | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location_precision?: string | null;
  price: number | string;
  bedrooms: number;
  bathrooms: number;
  area: number | string;
  type: ListingType;
  description: string;
  amenities: string[];
  photo_paths: string[];
  availability: ListingStatus;
  moderation: ModerationStatus;
  review_note: string | null;
  created_at: string;
  version: number;
}

/**
 * `photos: 'cover'` keeps only the first storage path, which is all a catalogue card
 * shows. A list page then signs one URL per listing instead of six.
 */
export function mapRemoteListing(row: RemotePropertyRow, signedUrls: ReadonlyMap<string, string>, photos: 'cover' | 'all' = 'all'): Listing {
  if (!row || !row.id || !row.owner_id || !row.client_request_id ||
    (row.condition != null && !isListingCondition(row.condition)) ||
    (row.floor != null && (!Number.isInteger(row.floor) || row.floor < 0 || row.floor > 99)) ||
    (row.price_negotiable != null && typeof row.price_negotiable !== 'boolean') ||
    !Number.isFinite(Number(row.price)) || Number(row.price) <= 0 ||
    !Number.isFinite(Number(row.area)) || Number(row.area) <= 0 ||
    !Number.isInteger(row.bedrooms) || !Number.isInteger(row.bathrooms) ||
    !Number.isInteger(row.version) || row.version < 1 ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    !['Casa', 'Apartamento'].includes(row.type) ||
    !['active', 'paused', 'sold'].includes(row.availability) ||
    !['draft', 'pending', 'approved', 'rejected'].includes(row.moderation) ||
    !Array.isArray(row.photo_paths) || !Array.isArray(row.amenities)) {
    throw new Error('El servidor devolvió datos de propiedad no válidos.');
  }
  const wanted = photos === 'cover' ? row.photo_paths.slice(0, 1) : row.photo_paths;
  const mapped = wanted.map((storagePath) => ({ uri: signedUrls.get(storagePath) ?? '', storagePath }));
  const hasPoint = row.latitude != null || row.longitude != null || row.location_precision != null;
  let mapLocation;
  if (hasPoint) {
    const numeric = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    const candidate = { latitude: numeric(row.latitude), longitude: numeric(row.longitude), precision: row.location_precision };
    if (!isMapLocation(candidate)) throw new Error('El servidor devolvió una ubicación de propiedad no válida.');
    mapLocation = normalizeMapLocation(candidate);
  }
  return {
    id: row.id, owner: 'remote', ownerId: row.owner_id, clientRequestId: row.client_request_id,
    title: row.title, location: row.location, province: row.province, price: Number(row.price),
    ...(row.condition != null ? { condition: row.condition } : {}),
    ...(row.floor != null ? { floor: row.floor } : {}),
    ...(row.price_negotiable != null ? { priceNegotiable: row.price_negotiable } : {}),
    ...(mapLocation ? { mapLocation } : {}),
    bedrooms: row.bedrooms, bathrooms: row.bathrooms, area: Number(row.area), type: row.type,
    description: row.description, amenities: [...row.amenities], imageKey: 'vedado',
    photos: mapped, ...(mapped[0]?.uri ? { photoUri: mapped[0].uri } : {}),
    status: row.availability, moderationStatus: row.moderation,
    ...(row.review_note ? { reviewNote: row.review_note } : {}), version: row.version, createdAt: row.created_at,
  };
}

/** Continue until empty: a server-side row cap may be smaller than the requested range. */
export async function collectPages<T>(read: (from: number, to: number) => Promise<T[]>, pageSize = 200): Promise<T[]> {
  const result: T[] = [];
  for (;;) {
    const page = await read(result.length, result.length + pageSize - 1);
    if (page.length === 0) return result;
    result.push(...page);
  }
}

export function mergeListings(publicListings: Listing[], ownListings: Listing[]): Listing[] {
  const result = new Map(publicListings.map((listing) => [listing.id, listing]));
  ownListings.forEach((listing) => result.set(listing.id, listing));
  return [...result.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
