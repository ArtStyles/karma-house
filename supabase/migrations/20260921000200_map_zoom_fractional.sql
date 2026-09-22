-- The map RPC rejected every real request: MapLibre reports a fractional zoom and the
-- function cast the text straight to int, which raises
--   invalid input syntax for type integer: "4.6"
-- Every local test had used whole-number zooms, so it only surfaced against the live app.

create or replace function public.kh_map_clusters(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $fn$
declare
  v_w numeric := (p_payload->>'west')::numeric;
  v_s numeric := (p_payload->>'south')::numeric;
  v_e numeric := (p_payload->>'east')::numeric;
  v_n numeric := (p_payload->>'north')::numeric;
  -- MapLibre reports a fractional zoom, so ::int on the text would raise
  -- invalid input syntax for type integer. Round down through numeric first.
  v_zoom int := least(greatest(coalesce(floor((p_payload->>'zoom')::numeric)::int, 6), 0), 20);
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

revoke all on function public.kh_map_clusters(jsonb) from public;
grant execute on function public.kh_map_clusters(jsonb) to anon, authenticated;
