import { restoreDraft } from './draftPersistence.ts';
import { isListingOperation, type ListingOperation } from './listingOptions.ts';
import type { ListingDraft } from './listings.ts';

export type PublicationEntry = { operation?: ListingOperation; import: boolean };

export function readPublicationEntry(params: { operation?: unknown; import?: unknown }): PublicationEntry {
  return { ...(isListingOperation(params.operation) ? { operation: params.operation } : {}), import: params.import === '1' };
}

export function publicationReturnTo(entry: PublicationEntry): string {
  const query = [isListingOperation(entry.operation) ? `operation=${entry.operation}` : '', entry.import ? 'import=1' : ''].filter(Boolean).join('&');
  return `/publish${query ? `?${query}` : ''}`;
}

/** A persisted choice wins: entering through another operation never converts an existing draft. */
export function restorePublicationDraft(raw: string | null, fallback: ListingDraft, operation?: ListingOperation): ListingDraft {
  const restored = restoreDraft(raw, fallback);
  if (restored.operation !== undefined || !isListingOperation(operation)) return restored;
  return {
    ...restored, operation,
    ...(operation === 'wanted' ? { type: restored === fallback ? '' as const : restored.type, wantedOperations: restored.wantedOperations ?? ['sale', 'swap'] } : {}),
    ...(operation === 'rent' && !restored.rentPeriod ? { rentPeriod: 'month' as const } : {}),
  };
}
