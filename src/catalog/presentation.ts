import { defaultFilters, type ListingFilters } from '../domain/listings.ts';

/** Stable across object order and optional defaults; a count belongs to these exact criteria. */
export function catalogFiltersKey(filters: ListingFilters): string {
  const value = { ...defaultFilters, ...filters };
  return JSON.stringify([
    value.query, value.type, value.minPrice ?? '', value.maxPrice,
    value.minBedrooms, value.minBathrooms ?? 0, value.minArea ?? '', value.maxArea ?? '',
    value.province ?? '', value.condition ?? '', [...(value.amenities ?? [])].sort(),
    value.negotiableOnly ?? false, value.operation ?? 'offers', value.sort,
  ]);
}

export function catalogQueryStatus(state: { ready: boolean; loading: boolean; requestKey: string | null; resultKey: string | null }, filters: ListingFilters) {
  const key = catalogFiltersKey(filters);
  const current = state.resultKey === key;
  return { updating: !state.ready || state.requestKey !== key || (state.loading && !current), current };
}

export function catalogRetryAction(state: { current: boolean; hasMore: boolean }): 'page' | 'first' {
  return state.current && state.hasMore ? 'page' : 'first';
}

export function listingPresentation(state: { ready: boolean; hasData: boolean; error: string | null; offline?: boolean }): 'loading' | 'error' | 'empty' | 'stale' | 'offline' | 'content' {
  if (state.hasData) return state.offline ? 'offline' : state.error ? 'stale' : 'content';
  if (!state.ready) return 'loading';
  return state.error ? 'error' : 'empty';
}

export function unavailableFavoriteCount(saved: number, visible: number, state: { ready: boolean; error: string | null }): number {
  return state.ready && !state.error ? Math.max(0, saved - visible) : 0;
}
