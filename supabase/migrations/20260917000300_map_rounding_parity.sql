-- Match the published JS contract exactly, including binary floating-point ties.
-- Do not rewrite existing published locations: both old/new normalized values are valid.
create or replace function kh_private.normalize_map_location(p_location jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_lat numeric;
  v_lng numeric;
  v_precision text;
  v_factor numeric;
begin
  if p_location is null or p_location = 'null'::jsonb then return 'null'::jsonb; end if;
  if jsonb_typeof(p_location) is distinct from 'object'
    or jsonb_typeof(p_location->'latitude') is distinct from 'number'
    or jsonb_typeof(p_location->'longitude') is distinct from 'number'
    or jsonb_typeof(p_location->'precision') is distinct from 'string' then
    raise exception 'KH_INVALID_MAP_LOCATION';
  end if;
  v_lat := (p_location->>'latitude')::numeric;
  v_lng := (p_location->>'longitude')::numeric;
  v_precision := p_location->>'precision';
  if not(v_lat between -90 and 90) or not(v_lng between -180 and 180)
    or v_precision not in ('exact','approximate') then raise exception 'KH_INVALID_MAP_LOCATION'; end if;
  v_factor := case when v_precision='approximate' then 100 else 1000000 end;
  return jsonb_build_object('latitude',floor(v_lat::double precision*v_factor::double precision+0.5)::numeric/v_factor,
    'longitude',floor(v_lng::double precision*v_factor::double precision+0.5)::numeric/v_factor,'precision',v_precision);
end;
$$;
notify pgrst, 'reload schema';
