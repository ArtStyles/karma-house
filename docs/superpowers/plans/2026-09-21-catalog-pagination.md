# Catalogue Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move KarmaHouse catalogue reads to Supabase so filters, sort, search, the exact count and the map all work on a catalogue of one to twenty thousand listings.

**Architecture:** Two `security invoker` RPCs (`kh_search_properties`, `kh_map_clusters`) resolve the thirteen existing filters, four sort orders, keyset pagination and grid clustering. On the client a new `src/catalog` module owns pages, single listings, favourites and map views; `listings` leaves `MarketplaceContextValue` so every stale consumer becomes a compile error.

**Tech Stack:** PostgreSQL 15 with `unaccent` and `pg_trgm`, Supabase PostgREST, TypeScript 6, React 19.2, Expo SDK 57, `node --test`.

**Design:** `docs/superpowers/specs/2026-09-21-catalog-pagination-design.md`

**Branch:** `feat/catalog-pagination`. Do not merge to `main` and do not apply the migration to the live Supabase project until the user confirms — the client calls RPCs that do not exist until the migration runs.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/catalog/types.ts` | Page, cursor, cluster and repository types. No logic. |
| `src/catalog/query.ts` | `ListingFilters` → RPC payload, cursor encode/decode. Pure, no imports from Supabase. |
| `src/catalog/repository.ts` | Calls the two RPCs and the by-id reads, maps rows to `Listing`. |
| `src/catalog/controller.ts` | Page accumulation, epoch/sequence invalidation, `loadMore`, error retention. |
| `src/catalog/useCatalog.ts` | `useCatalogPage`, `useListing`, `useFavoriteListings`, `useMapClusters`. Dispatches demo vs cloud. |
| `supabase/migrations/20260921000100_catalog_pagination.sql` | Extensions, generated columns, indexes, both RPCs. |
| `supabase/tests/catalog_pagination.sql` | Keyset stability, search fallback, count, RLS, clustering. |
| `scripts/apply-catalog-pagination.mjs` | Applies the migration, resolves extension schemas. |
| `scripts/verify-catalog-pagination.mjs` | Runs the SQL suite against the applied schema. |

Modified: `src/data/remoteMapping.ts` (cover-only photos), `src/data/supabaseMarketplace.ts` (`resolveRows` options), `src/state/MarketplaceProvider.tsx` and `src/state/remoteMarketplaceStore.ts` (drop `listings`), `src/screens/ExploreScreen.tsx`, `src/screens/DetailScreen.tsx`, `src/screens/EditScreen.tsx`, `src/screens/FavoritesScreen.tsx`, `src/screens/ProfileScreen.tsx`, `src/components/CatalogFilters.tsx`, `src/components/ExploreMap.tsx`.

---

## Task 1: Shared types

**Files:**
- Create: `src/catalog/types.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Coordinates, MapLocation } from '../domain/geo.ts';
import type { Listing, ListingFilters } from '../domain/listings.ts';

/** Which index answered the text search. Carried in the cursor so later pages keep one criterion. */
export type SearchMode = 'fts' | 'trgm' | 'none';

export const CATALOG_PAGE_SIZE = 24;
/** Above this many located listings in the box the map returns grid clusters instead of pins. */
export const MAP_POINT_LIMIT = 200;
/** Debounce before the filter sheet asks the server for an exact count. */
export const COUNT_DEBOUNCE_MS = 300;

export interface CatalogPage {
  rows: Listing[];
  total: number;
  nextCursor: string | null;
  searchMode: SearchMode;
}

export interface CatalogCursor {
  sort: ListingFilters['sort'];
  mode: SearchMode;
  id: string;
  /** created_at for 'recent', price for the price orders, area for 'area-desc'. */
  key: string;
}

export interface BoundingBox { west: number; south: number; east: number; north: number }
export interface MapCluster extends Coordinates { key: string; count: number }
export interface MapPoint extends MapLocation { id: string; price: number }
export type MapView =
  | { mode: 'points'; items: MapPoint[] }
  | { mode: 'clusters'; items: MapCluster[] };

export interface CatalogRepository {
  search(filters: ListingFilters, cursor: string | null, withTotal: boolean, checkpoint: () => void): Promise<CatalogPage>;
  mapView(bbox: BoundingBox, zoom: number, filters: ListingFilters, checkpoint: () => void): Promise<MapView>;
  byId(id: string, checkpoint: () => void): Promise<Listing | null>;
  byIds(ids: string[], checkpoint: () => void): Promise<Listing[]>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/types.ts
git commit -m "feat: add catalogue pagination types"
```

---

## Task 2: Payload and cursor codec

`query.ts` is the only place that knows the wire format. Keeping it pure means the whole contract is testable with `node --test` and no Supabase client.

**Files:**
- Create: `src/catalog/query.ts`
- Test: `tests/catalog-query.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @ts-nocheck -- Executed directly by Node; no DOM or native runtime needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCursor, encodeCursor, searchPayload } from '../src/catalog/query.ts';
import { defaultFilters } from '../src/domain/listings.ts';

test('a cursor survives a round trip and keeps the sort and search mode', () => {
  const cursor = { sort: 'price-asc', mode: 'fts', id: 'abc', key: '85000' };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test('a corrupt or tampered cursor is rejected rather than paging from an arbitrary row', () => {
  for (const value of ['', 'not-base64!!', btoa('{}'), btoa('{"sort":"nope","mode":"fts","id":"a","key":"1"}'), btoa('[1,2,3]')]) {
    assert.throws(() => decodeCursor(value), /KH_INVALID_CURSOR/, `should reject ${value}`);
  }
});

test('blank filters send no predicates so the server scans the public catalogue index', () => {
  const payload = searchPayload({ ...defaultFilters }, null, true);
  assert.equal(payload.query, '');
  assert.equal(payload.sort, 'recent');
  assert.equal(payload.cursor, null);
  assert.equal(payload.with_total, true);
  assert.equal(payload.limit, 24);
  for (const key of ['type', 'province', 'condition', 'min_price', 'max_price', 'min_area', 'max_area', 'min_bathrooms', 'negotiable_only']) {
    assert.equal(payload[key], null, `${key} should be absent`);
  }
  assert.equal(payload.min_bedrooms, 0);
  assert.deepEqual(payload.amenities, []);
});

test('numeric filters reach the server as numbers and blank or invalid text is dropped', () => {
  const payload = searchPayload({ ...defaultFilters, minPrice: '20000', maxPrice: '  ', minArea: 'abc', maxArea: '180.5', minBathrooms: 2 }, null, false);
  assert.equal(payload.min_price, 20000);
  assert.equal(payload.max_price, null);
  assert.equal(payload.min_area, null);
  assert.equal(payload.max_area, 180.5);
  assert.equal(payload.min_bathrooms, 2);
});

test('the search text is unaccented and lowercased exactly like the local filter', () => {
  assert.equal(searchPayload({ ...defaultFilters, query: '  HabÁna Ñ  ' }, null, false).query, 'habana n');
});

test('type Todas is not a predicate', () => {
  assert.equal(searchPayload({ ...defaultFilters, type: 'Todas' }, null, false).type, null);
  assert.equal(searchPayload({ ...defaultFilters, type: 'Casa' }, null, false).type, 'Casa');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --experimental-strip-types --test tests/catalog-query.test.ts`
Expected: FAIL, cannot find module `../src/catalog/query.ts`.

- [ ] **Step 3: Write the implementation**

`normalizeSearch` is currently private to `src/domain/listings.ts`. Export it there so the payload and the local demo filter cannot drift apart — this is the single most important invariant in the module, because the server column is built with the matching `unaccent` mapping.

In `src/domain/listings.ts`, change `function normalizeSearch` to `export function normalizeSearch`.

```ts
import { normalizeSearch, type ListingFilters } from '../domain/listings.ts';
import { CATALOG_PAGE_SIZE, type CatalogCursor, type SearchMode } from './types.ts';

const SORTS: ReadonlySet<string> = new Set(['recent', 'price-asc', 'price-desc', 'area-desc']);
const MODES: ReadonlySet<string> = new Set(['fts', 'trgm', 'none']);

/** Blank, whitespace and unparseable values are absent predicates, not zeroes. */
function optionalNumber(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function encodeCursor(cursor: CatalogCursor): string {
  return btoa(JSON.stringify([cursor.sort, cursor.mode, cursor.id, cursor.key]));
}

export function decodeCursor(value: string): CatalogCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(value));
  } catch {
    throw new Error('KH_INVALID_CURSOR');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw new Error('KH_INVALID_CURSOR');
  const [sort, mode, id, key] = parsed;
  if (typeof sort !== 'string' || !SORTS.has(sort)) throw new Error('KH_INVALID_CURSOR');
  if (typeof mode !== 'string' || !MODES.has(mode)) throw new Error('KH_INVALID_CURSOR');
  if (typeof id !== 'string' || !id) throw new Error('KH_INVALID_CURSOR');
  if (typeof key !== 'string' || !key) throw new Error('KH_INVALID_CURSOR');
  return { sort: sort as ListingFilters['sort'], mode: mode as SearchMode, id, key };
}

export function searchPayload(filters: ListingFilters, cursor: string | null, withTotal: boolean) {
  return {
    query: normalizeSearch(filters.query ?? ''),
    type: filters.type === 'Todas' ? null : filters.type,
    province: optionalText(filters.province),
    condition: optionalText(filters.condition),
    min_price: optionalNumber(filters.minPrice),
    max_price: optionalNumber(filters.maxPrice),
    min_area: optionalNumber(filters.minArea),
    max_area: optionalNumber(filters.maxArea),
    min_bedrooms: Number.isFinite(filters.minBedrooms) && filters.minBedrooms > 0 ? Math.floor(filters.minBedrooms) : 0,
    min_bathrooms: filters.minBathrooms && filters.minBathrooms > 0 ? Math.floor(filters.minBathrooms) : null,
    negotiable_only: filters.negotiableOnly === true ? true : null,
    amenities: (filters.amenities ?? []).map((value) => normalizeSearch(value)).filter(Boolean),
    sort: filters.sort,
    cursor: cursor === null ? null : encodeCursor(decodeCursor(cursor)),
    with_total: withTotal,
    limit: CATALOG_PAGE_SIZE,
  };
}
```

Note `cursor` is decoded then re-encoded: an invalid cursor fails here, on the client, instead of reaching the server.

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test tests/catalog-query.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/query.ts src/domain/listings.ts tests/catalog-query.test.ts
git commit -m "feat: add catalogue payload and cursor codec"
```

---

## Task 3: Migration

**Files:**
- Create: `supabase/migrations/20260921000100_catalog_pagination.sql`

- [ ] **Step 1: Write the migration**

The extension schema is detected rather than assumed: no earlier migration in this repo declares `create extension`, so the install schema is unknown until it runs.

```sql
-- Catalogue pagination: server-side filters, sort, search, exact count and map clustering.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent(text) is stable and cannot appear in a generated column.
-- unaccent(regdictionary, text) is immutable, so wrap that form.
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'unaccent';
  if v_schema is null then raise exception 'KH_MISSING_UNACCENT'; end if;
  execute format(
    'create or replace function kh_private.kh_unaccent(text) returns text
       language sql immutable parallel safe strict
       as $f$ select %I.unaccent(%L::regdictionary, $1) $f$',
    v_schema, v_schema || '.unaccent');
end $$;

alter table public.properties
  add column search_text text generated always as (
    kh_private.kh_unaccent(lower(
      title || ' ' || location || ' ' || province || ' ' || description || ' ' ||
      coalesce(array_to_string(amenities, ' '), '')
    ))
  ) stored,
  add column search_vector tsvector generated always as (
    to_tsvector('spanish', kh_private.kh_unaccent(lower(
      title || ' ' || location || ' ' || province || ' ' || description || ' ' ||
      coalesce(array_to_string(amenities, ' '), '')
    )))
  ) stored;

-- The old index sorts by created_at with no tiebreaker; a cursor is not stable without id.
drop index if exists public.properties_public_catalog;
create index properties_catalog_recent on public.properties(created_at desc, id desc)
  where moderation='approved' and availability='active';
create index properties_catalog_price on public.properties(price, id)
  where moderation='approved' and availability='active';
create index properties_catalog_area on public.properties(area desc, id desc)
  where moderation='approved' and availability='active';
create index properties_catalog_fts on public.properties using gin(search_vector)
  where moderation='approved' and availability='active';
create index properties_map_points on public.properties(longitude, latitude)
  where moderation='approved' and availability='active' and latitude is not null;

do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_schema is null then raise exception 'KH_MISSING_PG_TRGM'; end if;
  execute format(
    'create index properties_catalog_trgm on public.properties using gin(search_text %I.gin_trgm_ops)
       where moderation=''approved'' and availability=''active''', v_schema);
end $$;
```

- [ ] **Step 2: Add the search RPC to the same file**

`security invoker`, so `kh_property_read` still applies underneath. The explicit `moderation`/`availability` predicates stop an owner or admin seeing their own non-public rows in the public catalogue.

```sql
create or replace function public.kh_search_properties(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $$
declare
  v_query text := coalesce(p_payload->>'query', '');
  v_sort text := coalesce(p_payload->>'sort', 'recent');
  v_limit int := least(greatest(coalesce((p_payload->>'limit')::int, 24), 1), 48);
  v_cursor jsonb;
  v_mode text := 'none';
  v_total bigint := 0;
  v_terms text[];
  v_tsquery tsquery;
  v_rows jsonb;
  v_last jsonb;
  v_next text;
  v_order text;
begin
  if v_sort not in ('recent','price-asc','price-desc','area-desc') then
    raise exception 'KH_INVALID_SORT';
  end if;

  if p_payload->>'cursor' is not null then
    begin
      v_cursor := convert_from(decode(p_payload->>'cursor','base64'),'utf8')::jsonb;
    exception when others then raise exception 'KH_INVALID_CURSOR';
    end;
    if jsonb_typeof(v_cursor) <> 'array' or jsonb_array_length(v_cursor) <> 4
       or v_cursor->>0 <> v_sort then raise exception 'KH_INVALID_CURSOR'; end if;
    v_mode := v_cursor->>1;
  end if;

  if v_query <> '' then
    v_terms := array_remove(regexp_split_to_array(btrim(regexp_replace(v_query,'[^a-z0-9 ]',' ','g')),'\s+'), '');
  end if;

  if v_terms is not null and cardinality(v_terms) > 0 then
    v_tsquery := to_tsquery('spanish', array_to_string(v_terms, ':* & ') || ':*');
    if v_cursor is null then
      select count(*) into v_total from public.properties p
        where p.moderation='approved' and p.availability='active'
          and p.search_vector @@ v_tsquery
          and kh_private.kh_catalog_match(p, p_payload);
      v_mode := case when v_total > 0 then 'fts' else 'trgm' end;
      -- A trigram index needs three characters; below that only the prefix path can be served.
      if v_mode = 'trgm' and char_length(v_query) >= 3 then
        select count(*) into v_total from public.properties p
          where p.moderation='approved' and p.availability='active'
            and p.search_text like '%' || v_query || '%'
            and kh_private.kh_catalog_match(p, p_payload);
      elsif v_mode = 'trgm' then
        v_mode := 'fts';
      end if;
    end if;
  elsif v_cursor is null then
    v_mode := 'none';
    select count(*) into v_total from public.properties p
      where p.moderation='approved' and p.availability='active'
        and kh_private.kh_catalog_match(p, p_payload);
  end if;

  -- The ORDER BY must be a literal, not a CASE over v_sort: Postgres cannot match a
  -- CASE-based ordering to properties_catalog_recent/_price/_area and would sort the
  -- whole filtered set, which is exactly the cost this migration exists to remove.
  v_order := case v_sort
    when 'recent'     then 'p.created_at desc, p.id desc'
    when 'price-asc'  then 'p.price asc, p.id asc'
    when 'price-desc' then 'p.price desc, p.id desc'
    else                   'p.area desc, p.id desc'
  end;

  execute format($q$
    select coalesce(jsonb_agg(t.row_json order by t.rn), '[]'::jsonb)
      from (
        select to_jsonb(p) as row_json, row_number() over (order by %1$s) as rn
          from public.properties p
         where p.moderation='approved' and p.availability='active'
           and kh_private.kh_catalog_match(p, $1)
           and ($2 = 'none'
                or ($2 = 'fts'  and p.search_vector @@ $3)
                or ($2 = 'trgm' and p.search_text like '%%' || $4 || '%%'))
           and ($5 is null or kh_private.kh_catalog_after(p, $6, $5->>3, $5->>2))
         order by %1$s
         limit %2$s
      ) t
  $q$, v_order, v_limit)
  into v_rows
  using p_payload, v_mode, v_tsquery, v_query, v_cursor, v_sort;

  if jsonb_array_length(v_rows) = v_limit then
    v_last := v_rows->(v_limit-1);
    v_next := encode(convert_from(jsonb_build_array(
      v_sort, v_mode, v_last->>'id',
      case v_sort
        when 'recent' then v_last->>'created_at'
        when 'area-desc' then v_last->>'area'
        else v_last->>'price'
      end)::text::bytea, 'utf8'), 'base64');
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'next_cursor', v_next, 'search_mode', v_mode);
end $$;
```

The two helpers keep the predicate list in one place instead of repeating it across three counts and the page query:

```sql
create or replace function kh_private.kh_catalog_match(p public.properties, f jsonb)
returns boolean language sql immutable parallel safe as $$
  select (f->>'type' is null or p.type = f->>'type')
     and (f->>'province' is null or kh_private.kh_unaccent(lower(p.province)) = kh_private.kh_unaccent(lower(f->>'province')))
     and (f->>'condition' is null or p.condition = f->>'condition')
     and (f->>'min_price' is null or p.price >= (f->>'min_price')::numeric)
     and (f->>'max_price' is null or p.price <= (f->>'max_price')::numeric)
     and (f->>'min_area' is null or p.area >= (f->>'min_area')::numeric)
     and (f->>'max_area' is null or p.area <= (f->>'max_area')::numeric)
     and (f->>'min_bedrooms' is null or p.bedrooms >= (f->>'min_bedrooms')::int)
     and (f->>'min_bathrooms' is null or p.bathrooms >= (f->>'min_bathrooms')::int)
     and (f->>'negotiable_only' is null or p.price_negotiable is true)
     and (f->'amenities' is null or jsonb_array_length(f->'amenities') = 0 or not exists (
           select 1 from jsonb_array_elements_text(f->'amenities') a(want)
            where not exists (
              select 1 from unnest(p.amenities) have
               where kh_private.kh_unaccent(lower(have)) = a.want)))
$$;

create or replace function kh_private.kh_catalog_after(p public.properties, v_sort text, v_key text, v_id text)
returns boolean language sql immutable parallel safe as $$
  select case v_sort
    when 'recent'     then (p.created_at, p.id) < (v_key::timestamptz, v_id::uuid)
    when 'price-asc'  then (p.price, p.id) > (v_key::numeric, v_id::uuid)
    when 'price-desc' then (p.price, p.id) < (v_key::numeric, v_id::uuid)
    else                   (p.area, p.id) < (v_key::numeric, v_id::uuid)
  end
$$;
```

- [ ] **Step 3: Add the map RPC to the same file**

```sql
create or replace function public.kh_map_clusters(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $$
declare
  v_w numeric := (p_payload->>'west')::numeric;
  v_s numeric := (p_payload->>'south')::numeric;
  v_e numeric := (p_payload->>'east')::numeric;
  v_n numeric := (p_payload->>'north')::numeric;
  v_zoom int := least(greatest(coalesce((p_payload->>'zoom')::int, 6), 0), 20);
  v_count bigint;
  v_cell numeric;
  v_items jsonb;
begin
  if v_w is null or v_s is null or v_e is null or v_n is null
     or v_s > v_n or v_s < -90 or v_n > 90 or v_w < -180 or v_e > 180 then
    raise exception 'KH_INVALID_MAP_BOUNDS';
  end if;

  select count(*) into v_count from public.properties p
   where p.moderation='approved' and p.availability='active' and p.latitude is not null
     and p.latitude between v_s and v_n and p.longitude between v_w and v_e
     and kh_private.kh_catalog_match(p, p_payload);

  if v_count <= 200 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'latitude', p.latitude, 'longitude', p.longitude,
             'price', p.price, 'precision', coalesce(p.location_precision,'exact'))), '[]'::jsonb)
      into v_items
      from public.properties p
     where p.moderation='approved' and p.availability='active' and p.latitude is not null
       and p.latitude between v_s and v_n and p.longitude between v_w and v_e
       and kh_private.kh_catalog_match(p, p_payload);
    return jsonb_build_object('mode','points','items',v_items);
  end if;

  -- ponytail: degree grid + btree bounding box. Good to ~100k rows; move to PostGIS beyond that.
  v_cell := 360.0 / power(2, v_zoom + 3);
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', gx || ':' || gy, 'latitude', lat, 'longitude', lon, 'count', n)), '[]'::jsonb)
    into v_items
    from (
      select floor(p.longitude/v_cell) gx, floor(p.latitude/v_cell) gy,
             avg(p.latitude) lat, avg(p.longitude) lon, count(*) n
        from public.properties p
       where p.moderation='approved' and p.availability='active' and p.latitude is not null
         and p.latitude between v_s and v_n and p.longitude between v_w and v_e
         and kh_private.kh_catalog_match(p, p_payload)
       group by 1,2
    ) g;
  return jsonb_build_object('mode','clusters','items',v_items);
end $$;

revoke all on function public.kh_search_properties(jsonb) from public;
revoke all on function public.kh_map_clusters(jsonb) from public;
grant execute on function public.kh_search_properties(jsonb) to anon, authenticated;
grant execute on function public.kh_map_clusters(jsonb) to anon, authenticated;
```

- [ ] **Step 4: Check the file parses**

Run: `node --check scripts/apply-catalog-pagination.mjs` is not applicable to SQL. Instead confirm the file has balanced dollar quoting:

Run: `grep -c '^\$\$' supabase/migrations/20260921000100_catalog_pagination.sql`
Expected: an even number.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921000100_catalog_pagination.sql
git commit -m "feat: add catalogue search and map clustering migration"
```

---

## Task 4: Repository

**Files:**
- Create: `src/catalog/repository.ts`
- Modify: `src/data/remoteMapping.ts`, `src/data/supabaseMarketplace.ts`

- [ ] **Step 1: Let the mapper accept cover-only photos**

In `src/data/remoteMapping.ts`, `mapRemoteListing` currently maps every path to a signed URL and `resolveRows` throws when one is missing. Add a second parameter so a list page can sign only the first photo:

```ts
export function mapRemoteListing(row: RemotePropertyRow, signedUrls: ReadonlyMap<string, string>, photos: 'cover' | 'all' = 'all'): Listing {
```

and change the photo line to:

```ts
  const wanted = photos === 'cover' ? row.photo_paths.slice(0, 1) : row.photo_paths;
  const mapped = wanted.map((storagePath) => ({ uri: signedUrls.get(storagePath) ?? '', storagePath }));
```

using `mapped` where `photos` was used below.

- [ ] **Step 2: Thread the option through `resolveRows`**

In `src/data/supabaseMarketplace.ts`, change the signature to
`const resolveRows = async (rows, checkpoint, photos: 'cover' | 'all' = 'all')` and derive `paths` from
`rows.flatMap((row) => photos === 'cover' ? row.photo_paths.slice(0, 1) : row.photo_paths)`.
Export it so the catalogue repository reuses it rather than duplicating the signing loop.

- [ ] **Step 3: Write the repository**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Listing, ListingFilters } from '../domain/listings.ts';
import { mapRemoteListing, type RemotePropertyRow } from '../data/remoteMapping.ts';
import { searchPayload } from './query.ts';
import type { BoundingBox, CatalogPage, CatalogRepository, MapView } from './types.ts';

type SignRows = (rows: RemotePropertyRow[], checkpoint: () => void, photos: 'cover' | 'all') => Promise<Listing[]>;

export function createCatalogRepository(client: SupabaseClient, signRows: SignRows): CatalogRepository {
  const call = async (fn: string, payload: unknown, checkpoint: () => void) => {
    checkpoint();
    const { data, error } = await client.rpc(fn, { p_payload: payload });
    checkpoint();
    if (error) throw error;
    return data as Record<string, unknown>;
  };
  return {
    async search(filters, cursor, withTotal, checkpoint) {
      const data = await call('kh_search_properties', searchPayload(filters, cursor, withTotal), checkpoint);
      const rows = await signRows((data.rows ?? []) as RemotePropertyRow[], checkpoint, 'cover');
      return {
        rows,
        total: Number(data.total ?? 0),
        nextCursor: (data.next_cursor as string | null) ?? null,
        searchMode: (data.search_mode as CatalogPage['searchMode']) ?? 'none',
      };
    },
    async mapView(bbox, zoom, filters, checkpoint) {
      const data = await call('kh_map_clusters', { ...searchPayload(filters, null, false), ...bbox, zoom }, checkpoint);
      return { mode: data.mode, items: data.items } as MapView;
    },
    async byId(id, checkpoint) {
      return (await this.byIds([id], checkpoint))[0] ?? null;
    },
    async byIds(ids, checkpoint) {
      if (ids.length === 0) return [];
      checkpoint();
      const { data, error } = await client.from('properties').select(PROPERTY_COLUMNS).in('id', ids);
      checkpoint();
      if (error) throw error;
      return signRows((data ?? []) as RemotePropertyRow[], checkpoint, 'all');
    },
  };
}
```

`PROPERTY_COLUMNS` is already declared in `src/data/supabaseMarketplace.ts`; export it there and import it here rather than repeating the column list.

- [ ] **Step 4: Verify it compiles**

Run: `npm run check`
Expected: typecheck clean, 213 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/repository.ts src/data/remoteMapping.ts src/data/supabaseMarketplace.ts
git commit -m "feat: add catalogue repository with cover-only list photos"
```

---

## Task 5: Controller

**Files:**
- Create: `src/catalog/controller.ts`
- Test: `tests/catalog-controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @ts-nocheck -- Executed directly by Node; no DOM or native runtime needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogController } from '../src/catalog/controller.ts';
import { defaultFilters } from '../src/domain/listings.ts';

const listing = (id) => ({ id, title: id, price: 1, area: 1, createdAt: '2026-01-01T00:00:00Z' });
function repo(pages) {
  let call = 0;
  const calls = [];
  return {
    calls,
    async search(filters, cursor) { calls.push({ filters, cursor }); const page = pages[call]; call += 1; if (page instanceof Error) throw page; return page; },
    async mapView() { return { mode: 'points', items: [] }; },
    async byId() { return null; }, async byIds() { return []; },
  };
}

test('loadMore appends the next page without repeating the first', async () => {
  const controller = createCatalogController(repo([
    { rows: [listing('a'), listing('b')], total: 3, nextCursor: 'c1', searchMode: 'none' },
    { rows: [listing('c')], total: 3, nextCursor: null, searchMode: 'none' },
  ]));
  await controller.setFilters({ ...defaultFilters });
  await controller.loadMore();
  assert.deepEqual(controller.getState().rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.equal(controller.getState().hasMore, false);
  assert.equal(controller.getState().total, 3);
});

test('a page that arrives after the filters changed never replaces the newer result', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const controller = createCatalogController({
    async search(filters) {
      if (filters.query === 'old') { await slow; return { rows: [listing('stale')], total: 1, nextCursor: null, searchMode: 'none' }; }
      return { rows: [listing('fresh')], total: 1, nextCursor: null, searchMode: 'none' };
    },
    async mapView() { return { mode: 'points', items: [] }; }, async byId() { return null; }, async byIds() { return []; },
  });
  const first = controller.setFilters({ ...defaultFilters, query: 'old' });
  const second = controller.setFilters({ ...defaultFilters, query: 'new' });
  await second;
  release();
  await first.catch(() => {});
  assert.deepEqual(controller.getState().rows.map((r) => r.id), ['fresh']);
});

test('a failed page keeps the rows already visible instead of blanking the list', async () => {
  const controller = createCatalogController(repo([
    { rows: [listing('a')], total: 2, nextCursor: 'c1', searchMode: 'none' },
    new Error('network down'),
  ]));
  await controller.setFilters({ ...defaultFilters });
  await controller.loadMore().catch(() => {});
  assert.deepEqual(controller.getState().rows.map((r) => r.id), ['a']);
  assert.ok(controller.getState().pageError);
  assert.equal(controller.getState().hasMore, true);
});

test('changing account clears the previous account rows before any request resolves', async () => {
  const controller = createCatalogController(repo([{ rows: [listing('a')], total: 1, nextCursor: null, searchMode: 'none' }]));
  await controller.setFilters({ ...defaultFilters });
  controller.setSession('user-2');
  assert.deepEqual(controller.getState().rows, []);
  assert.equal(controller.getState().ready, false);
});

test('an invalid cursor resets to the first page rather than paging from nowhere', async () => {
  const controller = createCatalogController({
    async search(filters, cursor) {
      if (cursor) throw new Error('KH_INVALID_CURSOR');
      return { rows: [listing('a')], total: 1, nextCursor: 'bad', searchMode: 'none' };
    },
    async mapView() { return { mode: 'points', items: [] }; }, async byId() { return null; }, async byIds() { return []; },
  });
  await controller.setFilters({ ...defaultFilters });
  await controller.loadMore().catch(() => {});
  assert.equal(controller.getState().cursor, null);
  assert.deepEqual(controller.getState().rows.map((r) => r.id), ['a']);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --experimental-strip-types --test tests/catalog-controller.test.ts`
Expected: FAIL, cannot find module `../src/catalog/controller.ts`.

- [ ] **Step 3: Write the controller**

Mirror the `generation`/sequence guards in `src/state/remoteMarketplaceStore.ts:41` — they are what stops one account's late response from publishing under another account.

```ts
import type { ListingFilters } from '../domain/listings.ts';
import type { CatalogRepository, SearchMode } from './types.ts';
import type { Listing } from '../domain/listings.ts';

export interface CatalogState {
  rows: Listing[]; total: number; cursor: string | null; hasMore: boolean;
  ready: boolean; loading: boolean; pageError: string | null; searchMode: SearchMode;
}

const empty = (): CatalogState => ({ rows: [], total: 0, cursor: null, hasMore: false, ready: false, loading: false, pageError: null, searchMode: 'none' });

export function createCatalogController(repository: CatalogRepository) {
  let state = empty();
  let filters: ListingFilters | null = null;
  let generation = 0;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const publish = (next: CatalogState) => { state = next; listeners.forEach((l) => l()); };
  const checkpointFor = (epoch: number) => () => { if (epoch !== generation) throw new Error('KH_ACCOUNT_CHANGED'); };

  const fetchPage = async (cursor: string | null, append: boolean): Promise<void> => {
    if (!filters) return;
    const epoch = generation;
    const mine = ++sequence;
    const checkpoint = checkpointFor(epoch);
    publish({ ...state, loading: true, pageError: null });
    try {
      const page = await repository.search(filters, cursor, !append, checkpoint);
      if (epoch !== generation || mine !== sequence) return;
      const rows = append ? [...state.rows, ...page.rows.filter((row) => !state.rows.some((seen) => seen.id === row.id))] : page.rows;
      publish({ rows, total: append ? state.total : page.total, cursor: page.nextCursor, hasMore: page.nextCursor !== null, ready: true, loading: false, pageError: null, searchMode: page.searchMode });
    } catch (error) {
      if (epoch !== generation || mine !== sequence) return;
      const message = error instanceof Error ? error.message : String(error);
      // A rejected cursor means the list moved under us; restart from the first page.
      publish({ ...state, ready: true, loading: false, cursor: /KH_INVALID_CURSOR/.test(message) ? null : state.cursor, pageError: message });
      throw error;
    }
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    setSession(_userId: string | null) { generation += 1; sequence += 1; filters = filters; publish(empty()); },
    setFilters(next: ListingFilters) { filters = next; return fetchPage(null, false); },
    loadMore() { return state.hasMore && !state.loading ? fetchPage(state.cursor, true) : Promise.resolve(); },
    refresh() { return fetchPage(null, false); },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test tests/catalog-controller.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/controller.ts tests/catalog-controller.test.ts
git commit -m "feat: add catalogue page controller"
```

---

## Task 6: Hooks

**Files:**
- Create: `src/catalog/useCatalog.ts`

- [ ] **Step 1: Write the hooks**

The hooks are the only place that knows whether the app is in demo or cloud mode, which keeps every screen mode-agnostic.

`useCatalogPage(filters)` returns `{ rows, total, hasMore, ready, loading, pageError, loadMore, refresh }`. In demo mode it applies `filterListings` to the local catalogue and reports `hasMore: false`. In cloud mode it drives the controller from Task 5, calling `setFilters` inside a `useEffect` debounced by `COUNT_DEBOUNCE_MS`.

`useListing(id)` returns `{ listing, ready, error }`. Demo mode reads from the local catalogue; cloud mode calls `repository.byId`.

`useFavoriteListings()` reads `favoriteIds` from the marketplace context and calls `repository.byIds`, filtering to `status === 'active'` and approved moderation, matching `src/screens/FavoritesScreen.tsx:16`.

`useMapClusters(bbox, zoom, filters)` returns `{ view, ready }` and refetches when the box or zoom settles.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/useCatalog.ts
git commit -m "feat: add catalogue hooks for demo and cloud modes"
```

---

## Task 7: Remove `listings` from the context

This task is expected to break the build. That is the point: every error is a consumer that silently assumed a complete array.

**Files:**
- Modify: `src/state/MarketplaceProvider.tsx`, `src/state/remoteMarketplaceStore.ts`

- [ ] **Step 1: Drop the field**

Remove `listings: Listing[]` from `MarketplaceContextValue`, from `RemoteCatalogSnapshot`, from `RemoteMarketplaceState` and from `emptyRemoteState`. Remove the `mergeListings` call in `repository.load` and in `saveListing`; `ownListings` and `favoriteIds` stay.

- [ ] **Step 2: Collect the breakage**

Run: `npm run typecheck`
Expected: errors in `ExploreScreen.tsx`, `DetailScreen.tsx`, `EditScreen.tsx`, `FavoritesScreen.tsx`, `ProfileScreen.tsx`. Record the list; Task 8 fixes exactly these.

- [ ] **Step 3: Do not commit yet**

The tree does not compile until Task 8 lands. Commit both together.

---

## Task 8: Update the screens

**Files:**
- Modify: `src/screens/ExploreScreen.tsx`, `src/screens/DetailScreen.tsx`, `src/screens/EditScreen.tsx`, `src/screens/FavoritesScreen.tsx`, `src/screens/ProfileScreen.tsx`, `src/components/CatalogFilters.tsx`, `src/components/ExploreMap.tsx`

- [ ] **Step 1: ExploreScreen**

Replace `const { listings, ... } = useMarketplace()` and the `filterListings` memo with `useCatalogPage(filters)`. Feed `result` from the hook. Add `onEndReached={loadMore}` and `onEndReachedThreshold={0.6}` to the `FlatList` from the previous commit, and render a footer spinner while `loading`, or a retry button when `pageError` is set. The existing `ListFooterComponent` gains that block above the shortcuts.

- [ ] **Step 2: CatalogFilters**

Replace the `listings` prop with a `count: number` prop supplied by the parent from `useCatalogPage`, and delete the local `filterListings(listings, draft).length` call. The sheet keeps its own `draft`; the parent debounces before asking the server.

- [ ] **Step 3: ExploreMap**

Replace the `listings` prop with `view: MapView` plus `onRegionChange(bbox, zoom)`. Render `mode: 'points'` exactly as today and `mode: 'clusters'` as a labelled circle per cluster that zooms in on press.

- [ ] **Step 4: DetailScreen and EditScreen**

Replace `listings.find(item => item.id === id)` with `useListing(id)`, and use its `ready` flag where `ready` from the marketplace context was used for the not-found branch.

- [ ] **Step 5: FavoritesScreen and ProfileScreen**

Replace the `listings.filter(...)` with `useFavoriteListings()`. ProfileScreen's counters read `total` from `useCatalogPage` for the catalogue figure and `ownListings.length` as before.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/state src/screens src/components
git commit -m "feat: read the catalogue through paginated hooks"
```

---

## Task 9: SQL suite and apply scripts

**Files:**
- Create: `supabase/tests/catalog_pagination.sql`, `scripts/apply-catalog-pagination.mjs`, `scripts/verify-catalog-pagination.mjs`

- [ ] **Step 1: Write the SQL suite**

Following `supabase/tests/negotiations.sql`, seed two accounts and a set of approved listings inside a transaction that rolls back. Assert:
1. Paging the whole catalogue with `limit 2` returns every id exactly once.
2. Inserting an approved listing between page one and page two neither duplicates nor skips a row.
3. A query matching no lexeme falls back to `trgm` and finds a mid-word substring.
4. A one-character query stays on `fts` and never runs the substring path.
5. `total` equals the number of rows the same predicates return without a limit.
6. As `anon`, a `pending` listing appears in neither the rows nor the total.
7. `kh_map_clusters` returns `points` at or below 200 in the box and `clusters` above it, with cluster counts summing to the total in the box.

- [ ] **Step 2: Copy the apply and verify scripts**

Base both on `scripts/apply-notifications.mjs` and `scripts/verify-notifications.mjs`. The apply script must additionally confirm `unaccent` and `pg_trgm` are installed and report the schema they resolved to, so the run fails loudly rather than creating a function against the wrong schema.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/catalog_pagination.sql scripts/apply-catalog-pagination.mjs scripts/verify-catalog-pagination.mjs
git commit -m "test: add catalogue pagination SQL suite and apply scripts"
```

---

## Task 10: Documentation

**Files:**
- Modify: `README.md`, `docs/growth-roadmap.md`

- [ ] **Step 1: Update the README**

The "Persistencia e imágenes" section claims the catalogue loads in full. Replace with the paginated behaviour, and state the search change: word prefix first, substring as a fallback.

- [ ] **Step 2: Update the roadmap**

Row 3, "Cargar rápido al crecer el catálogo", is delivered by this work apart from the physical measurement. Mark it and link the design.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/growth-roadmap.md
git commit -m "docs: describe the paginated catalogue and its search change"
```

---

## Deployment, not part of implementation

The migration is **not** applied by this plan. When the user is available:

```bash
node scripts/apply-catalog-pagination.mjs
node scripts/verify-catalog-pagination.mjs
```

`add column ... generated always as ... stored` rewrites `public.properties` under `access exclusive`. Only then merge `feat/catalog-pagination` into `main`: the client calls RPCs that do not exist until the migration runs.
