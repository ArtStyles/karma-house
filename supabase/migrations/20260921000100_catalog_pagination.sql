-- Catalogue pagination: server-side filters, sort, search, exact count and map clustering.
-- The client stops loading every approved listing and every signed photo on each refresh.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent(text) is stable and cannot appear in a generated column.
-- unaccent(regdictionary, text) is immutable, so wrap that form. No earlier migration in
-- this project declares an extension, so the install schema is resolved rather than assumed.
do $do$
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
end $do$;

-- Matches normalizeSearch in src/domain/listings.ts: NFD, drop combining marks, lowercase.
-- unaccent maps n-tilde to n exactly as the NFD path does, so both sides agree.
--
-- array_to_string is stable, not immutable, because a generic element output function may
-- not be immutable; for text[] it is. Wrapping the whole concatenation in one immutable
-- helper both satisfies the generated-column requirement and keeps the two columns from
-- drifting apart, since they share a single definition of the searchable text.
create or replace function kh_private.kh_search_source(
  p_title text, p_location text, p_province text, p_description text, p_amenities text[]
) returns text language sql immutable parallel safe as $fn$
  select kh_private.kh_unaccent(lower(
    p_title || ' ' || p_location || ' ' || p_province || ' ' || p_description || ' ' ||
    coalesce(array_to_string(p_amenities, ' '), '')))
$fn$;

alter table public.properties
  add column search_text text generated always as (
    kh_private.kh_search_source(title, location, province, description, amenities)
  ) stored,
  add column search_vector tsvector generated always as (
    to_tsvector('spanish', kh_private.kh_search_source(title, location, province, description, amenities))
  ) stored;

-- The old index orders by created_at with no tiebreaker; a keyset cursor is not stable
-- without id, because two listings can share a creation instant.
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

do $do$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if v_schema is null then raise exception 'KH_MISSING_PG_TRGM'; end if;
  execute format(
    'create index properties_catalog_trgm on public.properties using gin(search_text %I.gin_trgm_ops)
       where moderation=''approved'' and availability=''active''', v_schema);
end $do$;

-- Builds the shared predicate list as SQL text. Values are never interpolated: every
-- predicate reads the jsonb payload through the $1 parameter, so the planner still uses
-- properties_catalog_price and _area for the range filters, and there is no injection
-- surface because only fixed templates are concatenated.
create or replace function kh_private.kh_catalog_where(f jsonb)
returns text language plpgsql immutable parallel safe as $fn$
declare v text := 'p.moderation=''approved'' and p.availability=''active''';
begin
  if f->>'type' is not null then v := v || ' and p.type = ($1->>''type'')'; end if;
  if f->>'province' is not null then
    v := v || ' and kh_private.kh_unaccent(lower(p.province)) = kh_private.kh_unaccent(lower($1->>''province''))';
  end if;
  if f->>'condition' is not null then v := v || ' and p.condition = ($1->>''condition'')'; end if;
  if f->>'min_price' is not null then v := v || ' and p.price >= ($1->>''min_price'')::numeric'; end if;
  if f->>'max_price' is not null then v := v || ' and p.price <= ($1->>''max_price'')::numeric'; end if;
  if f->>'min_area' is not null then v := v || ' and p.area >= ($1->>''min_area'')::numeric'; end if;
  if f->>'max_area' is not null then v := v || ' and p.area <= ($1->>''max_area'')::numeric'; end if;
  if coalesce((f->>'min_bedrooms')::int, 0) > 0 then v := v || ' and p.bedrooms >= ($1->>''min_bedrooms'')::int'; end if;
  if f->>'min_bathrooms' is not null then v := v || ' and p.bathrooms >= ($1->>''min_bathrooms'')::int'; end if;
  if f->>'negotiable_only' is not null then v := v || ' and p.price_negotiable is true'; end if;
  if jsonb_typeof(f->'amenities') = 'array' and jsonb_array_length(f->'amenities') > 0 then
    -- ponytail: per-row unaccent over the amenities array, no index. Add a generated
    -- unaccented text[] column with a gin index if amenity filters become a hot path.
    v := v || ' and not exists (select 1 from jsonb_array_elements_text($1->''amenities'') a(want)'
           || ' where not exists (select 1 from unnest(p.amenities) have'
           || ' where kh_private.kh_unaccent(lower(have)) = a.want))';
  end if;
  return v;
end $fn$;

-- Keyset comparison for the active sort. Row comparison resolves through the partial index.
create or replace function kh_private.kh_catalog_after(v_sort text)
returns text language sql immutable parallel safe as $fn$
  select case v_sort
    when 'recent'     then '(p.created_at, p.id) < (($1->>''ck'')::timestamptz, ($1->>''ci'')::uuid)'
    when 'price-asc'  then '(p.price, p.id) > (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
    when 'price-desc' then '(p.price, p.id) < (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
    else                   '(p.area, p.id) < (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
  end
$fn$;

-- security invoker, unlike the write RPCs: these read rows that are already public, so
-- kh_property_read stays in force underneath as a second barrier. The explicit moderation
-- and availability predicates keep an owner or admin from seeing their own non-public
-- listings mixed into the public catalogue.
create or replace function public.kh_search_properties(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $fn$
declare
  v_query text := coalesce(p_payload->>'query', '');
  v_sort text := coalesce(p_payload->>'sort', 'recent');
  v_limit int := least(greatest(coalesce((p_payload->>'limit')::int, 24), 1), 48);
  v_cursor text := p_payload->>'cursor';
  v_mode text := 'none';
  v_total bigint := 0;
  v_terms text[];
  v_tsquery tsquery;
  v_where text;
  v_order text;
  v_key_col text;
  v_agg_order text;
  v_match text;
  v_args jsonb;
  v_rows jsonb;
  v_last jsonb;
  v_next text;
begin
  if v_sort not in ('recent','price-asc','price-desc','area-desc') then
    raise exception 'KH_INVALID_SORT';
  end if;

  v_args := p_payload;
  if v_cursor is not null then
    if array_length(string_to_array(v_cursor, '|'), 1) <> 4
       or split_part(v_cursor, '|', 1) <> v_sort
       or split_part(v_cursor, '|', 2) not in ('fts','trgm','none')
       or split_part(v_cursor, '|', 3) = ''
       or split_part(v_cursor, '|', 4) = '' then
      raise exception 'KH_INVALID_CURSOR';
    end if;
    v_mode := split_part(v_cursor, '|', 2);
    v_args := v_args || jsonb_build_object('ci', split_part(v_cursor, '|', 3), 'ck', split_part(v_cursor, '|', 4));
  end if;

  if v_query <> '' then
    v_terms := array_remove(regexp_split_to_array(btrim(regexp_replace(v_query, '[^a-z0-9 ]', ' ', 'g')), '\s+'), '');
  end if;
  if v_terms is not null and cardinality(v_terms) > 0 then
    v_tsquery := to_tsquery('spanish', array_to_string(v_terms, ':* & ') || ':*');
  else
    v_terms := null;
  end if;

  v_where := kh_private.kh_catalog_where(p_payload);

  -- The exact count is requested anyway, so choosing the search mode is free: if the
  -- prefix path matches nothing, count again through the substring path.
  if v_cursor is null then
    if v_terms is null then
      v_mode := 'none';
      execute 'select count(*) from public.properties p where ' || v_where into v_total using v_args;
    else
      execute 'select count(*) from public.properties p where ' || v_where || ' and p.search_vector @@ ($1->>''q'')::tsquery'
        into v_total using v_args || jsonb_build_object('q', v_tsquery::text);
      if v_total > 0 then
        v_mode := 'fts';
      elsif char_length(v_query) >= 3 then
        -- A trigram index cannot serve a needle shorter than three characters; below that
        -- only the prefix path runs, so a seq scan is never reachable from here.
        v_mode := 'trgm';
        execute 'select count(*) from public.properties p where ' || v_where || ' and p.search_text like ''%'' || ($1->>''query'') || ''%'''
          into v_total using v_args;
      else
        v_mode := 'fts';
      end if;
    end if;
  end if;

  v_match := case v_mode
    when 'fts'  then ' and p.search_vector @@ ($1->>''q'')::tsquery'
    when 'trgm' then ' and p.search_text like ''%'' || ($1->>''query'') || ''%'''
    else ''
  end;
  if v_mode = 'fts' and v_tsquery is not null then
    v_args := v_args || jsonb_build_object('q', v_tsquery::text);
  elsif v_mode = 'fts' then
    v_match := '';
  end if;

  -- The ORDER BY must be literal, not a CASE over v_sort: Postgres cannot match a
  -- CASE-based ordering to properties_catalog_recent/_price/_area and would sort the
  -- whole filtered set, which is the cost this migration exists to remove.
  v_order := case v_sort
    when 'recent'     then 'p.created_at desc, p.id desc'
    when 'price-asc'  then 'p.price asc, p.id asc'
    when 'price-desc' then 'p.price desc, p.id desc'
    else                   'p.area desc, p.id desc'
  end;
  v_key_col := case v_sort when 'recent' then 'p.created_at' when 'area-desc' then 'p.area' else 'p.price' end;
  v_agg_order := case v_sort when 'price-asc' then 'ord_key asc, ord_id asc' else 'ord_key desc, ord_id desc' end;

  -- The limit sits in the inner subquery so the partial index stops after v_limit rows.
  -- A window function on the outer level would have been computed over the whole filtered
  -- set before the limit applied. jsonb_agg is ordered explicitly rather than relying on
  -- subquery order, which the planner does not guarantee.
  -- search_text and search_vector are dropped: the tsvector alone would dwarf the row.
  execute format(
    'select coalesce(jsonb_agg(row_json order by %1$s), ''[]''::jsonb) from ('
    || ' select to_jsonb(p) - ''search_text'' - ''search_vector'' as row_json,'
    || ' %2$s as ord_key, p.id as ord_id'
    || ' from public.properties p where %3$s%4$s%5$s order by %6$s limit %7$s) t',
    v_agg_order,
    v_key_col,
    v_where,
    v_match,
    case when v_cursor is null then '' else ' and ' || kh_private.kh_catalog_after(v_sort) end,
    v_order,
    v_limit)
  into v_rows using v_args;

  if jsonb_array_length(v_rows) = v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := concat_ws('|', v_sort, v_mode, v_last->>'id',
      case v_sort
        when 'recent' then v_last->>'created_at'
        when 'area-desc' then v_last->>'area'
        else v_last->>'price'
      end);
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'next_cursor', v_next, 'search_mode', v_mode);
end $fn$;

create or replace function public.kh_map_clusters(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $fn$
declare
  v_w numeric := (p_payload->>'west')::numeric;
  v_s numeric := (p_payload->>'south')::numeric;
  v_e numeric := (p_payload->>'east')::numeric;
  v_n numeric := (p_payload->>'north')::numeric;
  v_zoom int := least(greatest(coalesce((p_payload->>'zoom')::int, 6), 0), 20);
  v_where text;
  v_box text := ' and p.latitude is not null'
             || ' and p.latitude between ($1->>''south'')::numeric and ($1->>''north'')::numeric'
             || ' and p.longitude between ($1->>''west'')::numeric and ($1->>''east'')::numeric';
  v_count bigint;
  v_cell numeric;
  v_items jsonb;
begin
  if v_w is null or v_s is null or v_e is null or v_n is null
     or v_s > v_n or v_w > v_e
     or v_s < -90 or v_n > 90 or v_w < -180 or v_e > 180 then
    raise exception 'KH_INVALID_MAP_BOUNDS';
  end if;

  v_where := kh_private.kh_catalog_where(p_payload) || v_box;
  execute 'select count(*) from public.properties p where ' || v_where into v_count using p_payload;

  if v_count <= 200 then
    execute 'select coalesce(jsonb_agg(jsonb_build_object('
      || '''id'', p.id, ''latitude'', p.latitude, ''longitude'', p.longitude,'
      || '''price'', p.price, ''precision'', coalesce(p.location_precision, ''exact''))), ''[]''::jsonb)'
      || ' from public.properties p where ' || v_where
      into v_items using p_payload;
    return jsonb_build_object('mode', 'points', 'items', v_items);
  end if;

  -- ponytail: degree grid plus a btree bounding box. Good to roughly 100k rows; move to
  -- PostGIS with a spatial index beyond that.
  v_cell := 360.0 / power(2, v_zoom + 3);
  execute 'select coalesce(jsonb_agg(jsonb_build_object('
    || '''key'', g.gx || '':'' || g.gy, ''latitude'', g.lat, ''longitude'', g.lon, ''count'', g.n)), ''[]''::jsonb)'
    || ' from (select floor(p.longitude / ($2)::numeric) gx, floor(p.latitude / ($2)::numeric) gy,'
    || ' avg(p.latitude) lat, avg(p.longitude) lon, count(*) n'
    || ' from public.properties p where ' || v_where || ' group by 1, 2) g'
    into v_items using p_payload, v_cell;
  return jsonb_build_object('mode', 'clusters', 'items', v_items);
end $fn$;

revoke all on function public.kh_search_properties(jsonb) from public;
revoke all on function public.kh_map_clusters(jsonb) from public;
grant execute on function public.kh_search_properties(jsonb) to anon, authenticated;
grant execute on function public.kh_map_clusters(jsonb) to anon, authenticated;
