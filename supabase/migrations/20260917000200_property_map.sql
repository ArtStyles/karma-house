-- Add only the position chosen for publication; no private exact coordinates are stored.
alter table public.properties
  add column latitude numeric,
  add column longitude numeric,
  add column location_precision text;

create function kh_private.normalize_map_location(p_location jsonb) returns jsonb
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
  return jsonb_build_object('latitude',floor(v_lat*v_factor+0.5)/v_factor,
    'longitude',floor(v_lng*v_factor+0.5)/v_factor,'precision',v_precision);
end;
$$;
revoke all on function kh_private.normalize_map_location(jsonb) from public, anon, authenticated;

create function kh_private.normalize_property_map() returns trigger
language plpgsql set search_path = '' as $$
declare v_location jsonb;
begin
  if new.latitude is null and new.longitude is null and new.location_precision is null then return new; end if;
  v_location := kh_private.normalize_map_location(jsonb_build_object(
    'latitude',new.latitude,'longitude',new.longitude,'precision',new.location_precision));
  new.latitude := (v_location->>'latitude')::numeric;
  new.longitude := (v_location->>'longitude')::numeric;
  new.location_precision := v_location->>'precision';
  return new;
end;
$$;
revoke all on function kh_private.normalize_property_map() from public, anon, authenticated;
create trigger kh_properties_normalize_map before insert or update of latitude,longitude,location_precision
  on public.properties for each row execute function kh_private.normalize_property_map();

alter table public.properties add constraint properties_map_location_valid check (
  (latitude is null and longitude is null and location_precision is null)
  or (latitude is not null and longitude is not null and location_precision is not null
    and latitude between -90 and 90 and longitude between -180 and 180
    and location_precision in ('exact','approximate')
    and latitude = floor(latitude*(case when location_precision='approximate' then 100 else 1000000 end)+0.5)/(case when location_precision='approximate' then 100 else 1000000 end)
    and longitude = floor(longitude*(case when location_precision='approximate' then 100 else 1000000 end)+0.5)/(case when location_precision='approximate' then 100 else 1000000 end))
);

-- Legacy receipts describe a property with no map point. Keep old retries comparable.
update kh_private.property_save_requests set
  initial_payload = case when initial_payload ? 'mapLocation' then initial_payload else initial_payload || '{"mapLocation":null}'::jsonb end,
  last_payload = case when last_payload ? 'mapLocation' then last_payload else last_payload || '{"mapLocation":null}'::jsonb end;

create or replace function public.kh_save_property(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_request text;
  v_expected integer;
  v_mode text;
  v_amenities text[];
  v_photos text[];
  v_price numeric;
  v_area numeric;
  v_bedrooms numeric;
  v_bathrooms numeric;
  v_map_location jsonb;
  v_canonical jsonb;
  v_exists boolean;
  v_existing public.properties%rowtype;
  v_saved public.properties%rowtype;
  v_receipt kh_private.property_save_requests%rowtype;
begin
  if v_user is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'KH_INVALID_PAYLOAD'; end if;
  if p_payload ? 'ownerId' and p_payload->>'ownerId' is distinct from v_user::text then
    raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501';
  end if;
  v_request := p_payload->>'clientRequestId';
  if v_request is null or v_request !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'KH_INVALID_REQUEST_ID'; end if;
  v_id := nullif(p_payload->>'id','')::uuid;
  v_expected := nullif(p_payload->>'expectedVersion','')::integer;
  v_mode := coalesce(p_payload->>'moderation','pending');
  if v_mode not in ('draft','pending') then raise exception 'KH_INVALID_MODERATION'; end if;
  if jsonb_typeof(coalesce(p_payload->'amenities','[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload->'photoPaths','[]'::jsonb)) is distinct from 'array' then
    raise exception 'KH_INVALID_ARRAY';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_payload->'amenities','[]'::jsonb)) value where jsonb_typeof(value)<>'string')
    or exists (select 1 from jsonb_array_elements(coalesce(p_payload->'photoPaths','[]'::jsonb)) value where jsonb_typeof(value)<>'string') then
    raise exception 'KH_INVALID_ARRAY';
  end if;
  select coalesce(array_agg(value order by value),'{}'::text[]) into v_amenities from (
    select distinct btrim(value) as value from jsonb_array_elements_text(coalesce(p_payload->'amenities','[]'::jsonb)) value where btrim(value)<>''
  ) clean;
  select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_photos
    from jsonb_array_elements_text(coalesce(p_payload->'photoPaths','[]'::jsonb)) with ordinality paths(value,ordinal);
  v_price := (p_payload->>'price')::numeric;
  v_area := (p_payload->>'area')::numeric;
  v_bedrooms := (p_payload->>'bedrooms')::numeric;
  v_bathrooms := (p_payload->>'bathrooms')::numeric;
  if v_price is null or not(v_price>0 and v_price<=100000000)
    or v_area is null or not(v_area>0 and v_area<=10000)
    or v_bedrooms is null or not(v_bedrooms between 1 and 20 and v_bedrooms=trunc(v_bedrooms))
    or v_bathrooms is null or not(v_bathrooms between 1 and 20 and v_bathrooms=trunc(v_bathrooms))
    or not kh_private.valid_amenities(v_amenities) then raise exception 'KH_INVALID_PROPERTY'; end if;
  if coalesce(char_length(btrim(p_payload->>'title')),0) not between 3 and 100
    or coalesce(char_length(btrim(p_payload->>'location')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'province')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'description')),0) not between 20 and 2000
    or coalesce(p_payload->>'type','') not in ('Casa','Apartamento') then raise exception 'KH_INVALID_PROPERTY'; end if;

  -- Lock before resolving omission: an older client must preserve the current public point.
  perform pg_advisory_xact_lock(hashtextextended('kh:save:'||v_user::text||':'||v_request,0));
  if v_id is null then
    select * into v_existing from public.properties where owner_id=v_user and client_request_id=v_request for update;
    v_exists := found;
  else
    select * into v_existing from public.properties where id=v_id and owner_id=v_user for update;
    if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
    if v_existing.client_request_id<>v_request then raise exception 'KH_REQUEST_CONFLICT'; end if;
    if v_expected is null or v_expected<1 then raise exception 'KH_EXPECTED_VERSION_REQUIRED'; end if;
    v_exists := true;
  end if;
  if p_payload ? 'mapLocation' then
    v_map_location := kh_private.normalize_map_location(p_payload->'mapLocation');
  elsif v_id is not null and v_existing.latitude is not null then
    v_map_location := jsonb_build_object('latitude',v_existing.latitude,'longitude',v_existing.longitude,'precision',v_existing.location_precision);
  else
    v_map_location := 'null'::jsonb;
  end if;
  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',p_payload->>'type',
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode,'mapLocation',v_map_location
  );
  if v_id is null and v_exists then
    select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
    if v_receipt.initial_payload=v_canonical then return to_jsonb(v_existing); end if;
    raise exception 'KH_REQUEST_CONFLICT';
  elsif v_id is not null then
    select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
    if v_receipt.last_expected_version=v_expected and v_receipt.last_payload=v_canonical and v_existing.version=v_receipt.last_result_version then
      return to_jsonb(v_existing);
    end if;
    if v_existing.version<>v_expected then raise exception 'KH_VERSION_CONFLICT'; end if;
    if v_existing.moderation<>'draft' then v_mode := 'pending'; end if;
  end if;
  perform kh_private.validate_photos(v_user,v_request,v_photos,v_mode);

  if v_id is null then
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_canonical->>'type',v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
      (v_map_location->>'latitude')::numeric,(v_map_location->>'longitude')::numeric,v_map_location->>'precision')
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_canonical->>'type',description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1,
      latitude=(v_map_location->>'latitude')::numeric,longitude=(v_map_location->>'longitude')::numeric,location_precision=v_map_location->>'precision'
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.
notify pgrst, 'reload schema';
