-- Swap and wanted listings share the properties table, so chat, favourites, reports,
-- moderation and the public page keep working off property_id. `operation` defaults to
-- 'sale' for every existing row; nulls in type/area/bathrooms are legal only for wanted ads.
alter table public.properties
  add column operation text not null default 'sale',
  add column swap_wants text,
  add column swap_provinces text[],
  add column swap_balance text,
  add column swap_amount numeric;
alter table public.properties
  alter column type drop not null,
  alter column area drop not null,
  alter column bathrooms drop not null;

create function kh_private.valid_provinces(p_values text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_values is null or (
    cardinality(p_values) <= 16
    and cardinality(p_values) = (select count(distinct value) from unnest(p_values) value)
    and not exists (select 1 from unnest(p_values) value where value not in (
      'Pinar del Río','Artemisa','La Habana','Mayabeque','Matanzas','Villa Clara','Cienfuegos','Sancti Spíritus',
      'Ciego de Ávila','Camagüey','Las Tunas','Holguín','Granma','Santiago de Cuba','Guantánamo','Isla de la Juventud')))
$$;
revoke all on function kh_private.valid_provinces(text[]) from public, anon, authenticated;

alter table public.properties
  add constraint properties_operation_valid check (operation in ('sale','swap','wanted')),
  add constraint properties_swap_fields check (
    (operation = 'swap'
      and swap_wants is not null and char_length(btrim(swap_wants)) between 20 and 500
      and swap_balance in ('none','pay','receive')
      and (swap_amount is null or (swap_balance <> 'none' and swap_amount > 0 and swap_amount <= 100000000))
      and kh_private.valid_provinces(swap_provinces))
    or (operation <> 'swap' and swap_wants is null and swap_provinces is null and swap_balance is null and swap_amount is null)),
  add constraint properties_offer_fields check (operation = 'wanted' or (type is not null and area is not null and bathrooms is not null)),
  add constraint properties_wanted_fields check (operation <> 'wanted' or (
    area is null and bathrooms is null and latitude is null and longitude is null and location_precision is null
    and condition is null and floor is null and price_negotiable is null and amenities = '{}'));

-- The original photo rule was an unnamed table check; wanted ads are the one case without photos.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid = 'public.properties'::regclass and pg_get_constraintdef(oid) like '%cardinality(photo_paths) >= 1%';
  if v_name is not null then execute format('alter table public.properties drop constraint %I', v_name); end if;
end $$;
alter table public.properties add constraint properties_photos_required
  check (moderation = 'draft' or operation = 'wanted' or cardinality(photo_paths) >= 1);

create or replace function public.kh_save_property(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_request text;
  v_expected integer;
  v_mode text;
  v_operation text;
  v_type text;
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
  v_swap_wants text;
  v_swap_provinces text[];
  v_swap_balance text;
  v_swap_amount numeric;
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
  if p_payload ? 'operation' and p_payload->'operation' <> 'null'::jsonb then
    v_operation := p_payload->>'operation';
    if v_operation not in ('sale','swap','wanted') then raise exception 'KH_INVALID_OPERATION'; end if;
  end if;
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
  v_type := nullif(p_payload->>'type','');
  if v_price is null or not(v_price>0 and v_price<=100000000)
    or v_bedrooms is null or not(v_bedrooms between 1 and 20 and v_bedrooms=trunc(v_bedrooms))
    or not kh_private.valid_amenities(v_amenities) then raise exception 'KH_INVALID_PROPERTY'; end if;
  if coalesce(char_length(btrim(p_payload->>'title')),0) not between 3 and 100
    or coalesce(char_length(btrim(p_payload->>'location')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'province')),0) not between 2 and 80
    or coalesce(char_length(btrim(p_payload->>'description')),0) not between 20 and 2000
    or (v_type is not null and v_type not in ('Casa','Apartamento')) then raise exception 'KH_INVALID_PROPERTY'; end if;

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
  -- An older APK sends no operation: it keeps whatever the row is, or publishes a sale.
  if v_operation is null then v_operation := coalesce(v_existing.operation,'sale'); end if;
  if v_id is not null and v_existing.operation <> v_operation then raise exception 'KH_OPERATION_LOCKED'; end if;

  if v_operation = 'wanted' then
    -- A wanted ad has no home to describe: only what is being looked for.
    v_area := null; v_bathrooms := null; v_amenities := '{}'; v_map_location := 'null'::jsonb;
    v_condition := null; v_floor := null; v_negotiable := null;
  else
    if v_area is null or not(v_area>0 and v_area<=10000)
      or v_bathrooms is null or not(v_bathrooms between 1 and 20 and v_bathrooms=trunc(v_bathrooms))
      or v_type is null then raise exception 'KH_INVALID_PROPERTY'; end if;
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
  end if;

  if v_operation = 'swap' then
    v_swap_wants := btrim(p_payload->>'swapWants');
    v_swap_balance := p_payload->>'swapBalance';
    v_swap_amount := nullif(p_payload->>'swapAmount','')::numeric;
    if jsonb_typeof(coalesce(p_payload->'swapProvinces','[]'::jsonb)) <> 'array'
      or exists (select 1 from jsonb_array_elements(coalesce(p_payload->'swapProvinces','[]'::jsonb)) value where jsonb_typeof(value)<>'string') then
      raise exception 'KH_INVALID_SWAP';
    end if;
    select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_swap_provinces
      from jsonb_array_elements_text(coalesce(p_payload->'swapProvinces','[]'::jsonb)) with ordinality items(value,ordinal);
    if v_swap_wants is null or char_length(v_swap_wants) not between 20 and 500
      or v_swap_balance is null or v_swap_balance not in ('none','pay','receive')
      or not kh_private.valid_provinces(v_swap_provinces)
      or (v_swap_amount is not null and (v_swap_balance='none' or not(v_swap_amount>0 and v_swap_amount<=100000000))) then
      raise exception 'KH_INVALID_SWAP';
    end if;
  end if;

  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',v_type,
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode,'mapLocation',v_map_location,
    'condition',v_condition,'floor',v_floor,'priceNegotiable',v_negotiable,
    'operation',v_operation,'swapWants',v_swap_wants,'swapProvinces',to_jsonb(v_swap_provinces),'swapBalance',v_swap_balance,'swapAmount',v_swap_amount
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
  -- validate_photos only waives the minimum for drafts; a wanted ad is the other case without photos.
  perform kh_private.validate_photos(v_user,v_request,v_photos,case when v_operation='wanted' then 'draft' else v_mode end);
  if v_id is null then
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision,condition,floor,price_negotiable,operation,swap_wants,swap_provinces,swap_balance,swap_amount)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_type,v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
      (v_map_location->>'latitude')::numeric,(v_map_location->>'longitude')::numeric,v_map_location->>'precision',v_condition,v_floor::integer,v_negotiable,
      v_operation,v_swap_wants,v_swap_provinces,v_swap_balance,v_swap_amount)
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_type,description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1,
      latitude=(v_map_location->>'latitude')::numeric,longitude=(v_map_location->>'longitude')::numeric,location_precision=v_map_location->>'precision',
      condition=v_condition,floor=v_floor::integer,price_negotiable=v_negotiable,
      swap_wants=v_swap_wants,swap_provinces=v_swap_provinces,swap_balance=v_swap_balance,swap_amount=v_swap_amount
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;

-- Catalogue: an explicit `operations` array filters; without it only offers show, so an
-- older APK never receives a wanted ad (whose type/area/bathrooms it cannot parse).
create or replace function kh_private.kh_catalog_where(f jsonb)
returns text language plpgsql immutable parallel safe as $fn$
declare v text := 'p.moderation=''approved'' and p.availability=''active''';
begin
  if jsonb_typeof(f->'operations') = 'array' and jsonb_array_length(f->'operations') > 0 then
    if exists (select 1 from jsonb_array_elements_text(f->'operations') o where o not in ('sale','swap','wanted')) then
      raise exception 'KH_INVALID_OPERATION';
    end if;
    v := v || ' and p.operation = any(array(select jsonb_array_elements_text($1->''operations'')))';
  else
    v := v || ' and p.operation in (''sale'',''swap'')';
  end if;
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

-- Wanted ads never carry a point, so kh_map_clusters already skips them through `latitude is not null`.
-- Submit and review re-check photos as a published ad; a wanted ad has none to check.
create or replace function public.kh_submit_property(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.moderation in ('pending','approved') then return; end if;
  perform kh_private.validate_photos(v_property.owner_id,v_property.client_request_id,v_property.photo_paths,
    case when v_property.operation='wanted' then 'draft' else 'pending' end);
  update public.properties set moderation='pending',review_note=null,updated_at=now(),version=version+1 where id=p_id;
end;
$$;

create or replace function public.kh_review_property(p_id uuid,p_decision text,p_note text,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype; v_note text := nullif(btrim(p_note),'');
begin
  if auth.uid() is null or not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'KH_INVALID_DECISION'; end if;
  if p_decision='rejected' and (v_note is null or char_length(v_note)>1000) then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
  select * into v_property from public.properties where id=p_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.owner_id=auth.uid() then raise exception 'KH_CANNOT_REVIEW_OWN_PROPERTY'; end if;
  if p_expected_version is null or v_property.version<>p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_property.moderation<>'pending' then raise exception 'KH_NOT_PENDING'; end if;
  if p_decision='approved' then
    perform kh_private.validate_photos(v_property.owner_id,v_property.client_request_id,v_property.photo_paths,
      case when v_property.operation='wanted' then 'draft' else 'pending' end);
    v_note := null;
  end if;
  update public.properties set moderation=p_decision,review_note=v_note,updated_at=now(),version=version+1 where id=p_id;
end;
$$;
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.

notify pgrst, 'reload schema';
