import type { Listing, ListingDraft } from '../domain/listings.ts';
import { normalizeMapLocation } from '../domain/geo.ts';

export function propertyPayload(draft: ListingDraft, ownerId: string, photoPaths: string[], moderation: 'draft' | 'pending', current?: Listing) {
  return {
    ownerId, clientRequestId: draft.clientRequestId, title: draft.title.trim(), location: draft.location.trim(),
    province: draft.province.trim(), type: draft.type, description: draft.description.trim(),
    ...(draft.condition !== undefined ? { condition: draft.condition || null } : {}),
    ...(draft.floor !== undefined ? { floor: draft.floor.trim() ? Number(draft.floor) : null } : {}),
    ...(draft.priceNegotiable !== undefined ? { priceNegotiable: draft.priceNegotiable } : {}),
    price: Number(draft.price), area: Number(draft.area), bedrooms: Number(draft.bedrooms), bathrooms: Number(draft.bathrooms),
    amenities: [...new Set(draft.amenities.map((item) => item.trim()).filter(Boolean))], photoPaths, moderation,
    // Explicit null removes a previously published point; legacy clients omit this field.
    mapLocation: draft.mapLocation ? normalizeMapLocation(draft.mapLocation) : null,
    ...(current ? { id: current.id, expectedVersion: draft.expectedVersion ?? current.version } : {}),
  };
}
