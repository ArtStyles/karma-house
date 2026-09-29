import type { Listing, ListingDraft } from '../domain/listings.ts';
import { normalizeMapLocation } from '../domain/geo.ts';
import { parseDecimal } from '../domain/numericInput.ts';

export function propertyPayload(draft: ListingDraft, ownerId: string, photoPaths: string[], moderation: 'draft' | 'pending', current?: Listing) {
  const operation = draft.operation ?? 'sale';
  const wanted = operation === 'wanted';
  const balance = draft.swapBalance || null;
  return {
    ownerId, clientRequestId: draft.clientRequestId, title: draft.title.trim(), location: draft.location.trim(),
    province: draft.province.trim(), type: draft.type || null, description: draft.description.trim(), operation,
    ...(operation === 'swap' ? {
      swapWants: (draft.swapWants ?? '').trim(), swapProvinces: [...(draft.swapProvinces ?? [])], swapBalance: balance,
      swapAmount: balance && balance !== 'none' && draft.swapAmount?.trim() ? parseDecimal(draft.swapAmount) : null,
    } : {}),
    ...(operation === 'rent' ? { rentPeriod: draft.rentPeriod || null, rentMinStay: draft.rentMinStay?.trim() ? Number(draft.rentMinStay) : null } : {}),
    // Left out, the server keeps the saved list on an edit or defaults to buying or swapping.
    ...(wanted && draft.wantedOperations ? { wantedOperations: [...draft.wantedOperations] } : {}),
    ...(!wanted && draft.condition !== undefined ? { condition: draft.condition || null } : {}),
    ...(!wanted && draft.floor !== undefined ? { floor: draft.floor.trim() ? Number(draft.floor) : null } : {}),
    ...(!wanted && draft.priceNegotiable !== undefined ? { priceNegotiable: draft.priceNegotiable } : {}),
    price: parseDecimal(draft.price), area: wanted || !draft.area.trim() ? null : parseDecimal(draft.area), bedrooms: Number(draft.bedrooms), bathrooms: wanted ? null : Number(draft.bathrooms),
    amenities: wanted ? [] : [...new Set(draft.amenities.map((item) => item.trim()).filter(Boolean))], photoPaths, moderation,
    // Explicit null removes a previously published point; legacy clients omit this field.
    mapLocation: !wanted && draft.mapLocation ? normalizeMapLocation(draft.mapLocation) : null,
    ...(current ? { id: current.id, expectedVersion: draft.expectedVersion ?? current.version } : {}),
  };
}
