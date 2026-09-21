-- Optional facts remain unknown for every existing listing; no data is inferred.
alter table public.properties
  add column condition text,
  add column floor integer,
  add column price_negotiable boolean,
  add constraint properties_condition_valid check (condition in ('new','good','needs-renovation')),
  add constraint properties_floor_valid check (floor between 0 and 99);

-- Legacy canonical receipts represent unspecified details. Keep retries comparable.
update kh_private.property_save_requests set
  initial_payload = '{"condition":null,"floor":null,"priceNegotiable":null}'::jsonb || initial_payload,
  last_payload = '{"condition":null,"floor":null,"priceNegotiable":null}'::jsonb || last_payload;

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
  v_condition text;
  v_floor numeric;
  v_negotiable boolean;
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
  -- Omission from an old APK preserves current values. Explicit JSON null clears them.
  if p_payload ? 'condition' then
    if p_payload->'condition' <> 'null'::jsonb and
      (jsonb_typeof(p_payload->'condition') <> 'string' or p_payload->>'condition' not in ('new','good','needs-renovation')) then
      raise exception 'KH_INVALID_PROPERTY_DETAILS';
    end if;
    v_condition := p_payload->>'condition';
  elsif v_id is not null then v_condition := v_existing.condition;
  end if;
  if p_payload ? 'floor' then
    if p_payload->'floor' <> 'null'::jsonb then
      if jsonb_typeof(p_payload->'floor') <> 'number' then raise exception 'KH_INVALID_PROPERTY_DETAILS'; end if;
      v_floor := (p_payload->>'floor')::numeric;
      if not(v_floor between 0 and 99 and v_floor=trunc(v_floor)) then raise exception 'KH_INVALID_PROPERTY_DETAILS'; end if;
    end if;
  elsif v_id is not null then v_floor := v_existing.floor;
  end if;
  if p_payload ? 'priceNegotiable' then
    if p_payload->'priceNegotiable' <> 'null'::jsonb and jsonb_typeof(p_payload->'priceNegotiable') <> 'boolean' then
      raise exception 'KH_INVALID_PROPERTY_DETAILS';
    end if;
    v_negotiable := (p_payload->>'priceNegotiable')::boolean;
  elsif v_id is not null then v_negotiable := v_existing.price_negotiable;
  end if;
  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',p_payload->>'type',
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode,'mapLocation',v_map_location,
    'condition',v_condition,'floor',v_floor,'priceNegotiable',v_negotiable
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
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision,condition,floor,price_negotiable)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_canonical->>'type',v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
      (v_map_location->>'latitude')::numeric,(v_map_location->>'longitude')::numeric,v_map_location->>'precision',v_condition,v_floor::integer,v_negotiable)
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_canonical->>'type',description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1,
      latitude=(v_map_location->>'latitude')::numeric,longitude=(v_map_location->>'longitude')::numeric,location_precision=v_map_location->>'precision',
      condition=v_condition,floor=v_floor::integer,price_negotiable=v_negotiable
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.
notify pgrst, 'reload schema';
