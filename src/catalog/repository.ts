import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemotePropertyRow } from '../data/remoteMapping.ts';
import { PROPERTY_COLUMNS, type SignRows } from '../data/supabaseMarketplace.ts';
import { searchPayload } from './query.ts';
import type { CatalogPage, CatalogRepository, MapView, SearchMode } from './types.ts';

export function createCatalogRepository(client: SupabaseClient, signRows: SignRows): CatalogRepository {
  const call = async (fn: string, payload: unknown, checkpoint: () => void): Promise<Record<string, unknown>> => {
    checkpoint();
    const { data, error } = await client.rpc(fn, { p_payload: payload });
    checkpoint();
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('El servidor devolvió una respuesta de catálogo no válida.');
    return data as Record<string, unknown>;
  };

  // A by-id read goes through PostgREST rather than the search RPC: kh_property_read already
  // authorises it, and an owner must still reach their own paused or pending listing to edit it.
  const readByIds = async (ids: string[], checkpoint: () => void) => {
    checkpoint();
    const { data, error } = await client.from('properties').select(PROPERTY_COLUMNS).in('id', ids);
    checkpoint();
    if (error) throw error;
    return signRows((data ?? []) as RemotePropertyRow[], checkpoint, 'all');
  };

  return {
    async search(filters, cursor, withTotal, checkpoint) {
      const data = await call('kh_search_properties', searchPayload(filters, cursor, withTotal), checkpoint);
      if (!Array.isArray(data.rows)) throw new Error('El servidor devolvió una página de catálogo no válida.');
      return {
        rows: await signRows(data.rows as RemotePropertyRow[], checkpoint, 'cover'),
        total: Number(data.total ?? 0),
        nextCursor: typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null,
        searchMode: (data.search_mode as SearchMode) ?? 'none',
      } satisfies CatalogPage;
    },
    async mapView(bbox, zoom, filters, checkpoint) {
      const data = await call('kh_map_clusters', { ...searchPayload(filters, null, false), ...bbox, zoom }, checkpoint);
      if ((data.mode !== 'points' && data.mode !== 'clusters') || !Array.isArray(data.items)) {
        throw new Error('El servidor devolvió una vista de mapa no válida.');
      }
      return { mode: data.mode, items: data.items } as MapView;
    },
    async byId(id, checkpoint) {
      const rows = await readByIds([id], checkpoint);
      return rows[0] ?? null;
    },
    async byIds(ids, checkpoint) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];
      // PostgREST caps the URL length, so favourites are read in batches.
      const result = [];
      for (let start = 0; start < unique.length; start += 50) {
        result.push(...await readByIds(unique.slice(start, start + 50), checkpoint));
      }
      return result;
    },
  };
}
