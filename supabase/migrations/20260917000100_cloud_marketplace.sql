-- Additive first schema for KarmaHouse. Apply once through the migration ledger.
-- No auth email, admin invite, or internal retry receipt is exposed to clients.
create schema if not exists kh_private;
revoke all on schema kh_private from public, anon, authenticated;
grant usage on schema kh_private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kh_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table kh_private.admin_invites (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  created_at timestamptz not null default now()
);
alter table kh_private.admin_invites enable row level security;
revoke all on kh_private.admin_invites from public, anon, authenticated;

create function kh_private.valid_amenities(p_values text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_values) <= 20
    and not exists (select 1 from unnest(p_values) value
      where value is null or char_length(value) not between 1 and 60 or value <> btrim(value));
$$;
revoke all on function kh_private.valid_amenities(text[]) from public, anon, authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  title text not null check (char_length(btrim(title)) between 3 and 100),
  location text not null check (char_length(btrim(location)) between 2 and 80),
  province text not null check (char_length(btrim(province)) between 2 and 80),
  type text not null check (type in ('Casa', 'Apartamento')),
  description text not null check (char_length(btrim(description)) between 20 and 2000),
  price numeric not null check (price > 0 and price <= 100000000),
  area numeric not null check (area > 0 and area <= 10000),
  bedrooms integer not null check (bedrooms between 1 and 20),
  bathrooms integer not null check (bathrooms between 1 and 20),
  amenities text[] not null default '{}' check (kh_private.valid_amenities(amenities)),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  availability text not null default 'active' check (availability in ('active','paused','sold')),
  moderation text not null default 'pending' check (moderation in ('draft','pending','approved','rejected')),
  review_note text check (review_note is null or char_length(review_note) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique(owner_id, client_request_id),
  check (moderation = 'draft' or cardinality(photo_paths) >= 1),
  check ((moderation = 'rejected' and review_note is not null) or (moderation <> 'rejected' and review_note is null))
);
create index properties_public_catalog on public.properties(created_at desc) where moderation='approved' and availability='active';
create index properties_owner on public.properties(owner_id, updated_at desc);
create index properties_moderation on public.properties(moderation, updated_at);
create index properties_photo_paths on public.properties using gin(photo_paths);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, property_id)
);
create index favorites_property on public.favorites(property_id);

-- Keep operation receipts out of public properties and out of PostgREST schemas.
create table kh_private.property_save_requests (
  property_id uuid primary key references public.properties(id) on delete cascade,
  initial_payload jsonb not null,
  last_payload jsonb not null,
  last_expected_version integer,
  last_result_version integer not null
);
alter table kh_private.property_save_requests enable row level security;
revoke all on kh_private.property_save_requests from public, anon, authenticated;

create function public.kh_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.kh_admins where user_id = auth.uid()
  );
$$;
revoke all on function public.kh_is_admin() from public, anon, authenticated;
grant execute on function public.kh_is_admin() to anon, authenticated;

create function kh_private.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    v_name := left(btrim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '')),80);
    if char_length(v_name) < 2 then v_name := 'Usuario de KarmaHouse'; end if;
    insert into public.profiles(id,display_name) values (new.id,v_name) on conflict (id) do nothing;
  end if;
  if new.email_confirmed_at is not null and new.email is not null then
    -- DELETE RETURNING consumes a trusted invitation atomically. Metadata cannot grant roles.
    with invitation as (
      delete from kh_private.admin_invites where email=lower(btrim(new.email)) returning email
    )
    insert into public.kh_admins(user_id)
      select new.id from invitation on conflict(user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function kh_private.handle_auth_user() from public, anon, authenticated;
create trigger kh_auth_user_created after insert on auth.users
  for each row execute function kh_private.handle_auth_user();
create trigger kh_auth_user_verified after update of email, email_confirmed_at on auth.users
  for each row execute function kh_private.handle_auth_user();

-- Existing accounts receive a public name only. Never derive a name from their email.
insert into public.profiles(id,display_name)
select id, case
  when char_length(btrim(coalesce(raw_user_meta_data->>'display_name',raw_user_meta_data->>'name',''))) >= 2
  then left(btrim(coalesce(raw_user_meta_data->>'display_name',raw_user_meta_data->>'name')),80)
  else 'Usuario de KarmaHouse' end
from auth.users on conflict(id) do nothing;

create function kh_private.touch_profile() returns trigger
language plpgsql set search_path = '' as $$ begin
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  return new;
end $$;
revoke all on function kh_private.touch_profile() from public, anon, authenticated;
create trigger kh_profiles_updated before update on public.profiles
  for each row execute function kh_private.touch_profile();

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.favorites enable row level security;
alter table public.kh_admins enable row level security;
revoke all on public.profiles, public.properties, public.favorites, public.kh_admins from public, anon, authenticated;
grant select on public.profiles, public.properties to anon, authenticated;
grant insert(id,display_name), update(display_name) on public.profiles to authenticated;
grant select, delete on public.favorites to authenticated;
grant insert(user_id,property_id) on public.favorites to authenticated;
grant all on public.profiles, public.properties, public.favorites, public.kh_admins to service_role;

create policy kh_property_read on public.properties for select to anon, authenticated using (
  (moderation='approved' and availability='active') or owner_id=(select auth.uid()) or (select public.kh_is_admin())
);
create policy kh_profile_read on public.profiles for select to anon, authenticated using (
  id=(select auth.uid()) or (select public.kh_is_admin()) or exists (
    select 1 from public.properties p where p.owner_id=profiles.id and p.moderation='approved' and p.availability='active'
  )
);
create policy kh_profile_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy kh_profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy kh_favorite_read on public.favorites for select to authenticated using(user_id=(select auth.uid()));
create policy kh_favorite_insert on public.favorites for insert to authenticated with check (
  user_id=(select auth.uid()) and exists (
    select 1 from public.properties p where p.id=favorites.property_id and p.moderation='approved' and p.availability='active'
  )
);
create policy kh_favorite_delete on public.favorites for delete to authenticated using(user_id=(select auth.uid()));

create function kh_private.validate_photos(p_owner uuid,p_request text,p_paths text[],p_moderation text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if cardinality(p_paths) > 6 or (p_moderation <> 'draft' and cardinality(p_paths) < 1)
    or cardinality(p_paths) <> (select count(distinct value) from unnest(p_paths) value) then
    raise exception 'KH_INVALID_PHOTOS';
  end if;
  -- Consistent order avoids deadlocks when two requests refer to multiple photos.
  for v_path in select value from unnest(p_paths) value order by value loop
    if v_path is null or v_path !~ ('^'||p_owner::text||'/'||p_request||'/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$') then
      raise exception 'KH_INVALID_PHOTO_PATH';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
    if not exists (select 1 from storage.objects where bucket_id='property-photos' and name=v_path) then
      raise exception 'KH_PHOTO_NOT_FOUND';
    end if;
  end loop;
end;
$$;
revoke all on function kh_private.validate_photos(uuid,text,text[],text) from public, anon, authenticated;

create function public.kh_save_property(p_payload jsonb) returns jsonb
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
  v_canonical jsonb;
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

  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',p_payload->>'type',
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode
  );
  -- Serialize creation retries before the unique key exists. The key is scoped to this account.
  perform pg_advisory_xact_lock(hashtextextended('kh:save:'||v_user::text||':'||v_request,0));
  if v_id is null then
    select * into v_existing from public.properties where owner_id=v_user and client_request_id=v_request for update;
    if found then
      select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
      if v_receipt.initial_payload=v_canonical then return to_jsonb(v_existing); end if;
      raise exception 'KH_REQUEST_CONFLICT';
    end if;
  else
    select * into v_existing from public.properties where id=v_id and owner_id=v_user for update;
    if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
    if v_existing.client_request_id<>v_request then raise exception 'KH_REQUEST_CONFLICT'; end if;
    if v_expected is null or v_expected<1 then raise exception 'KH_EXPECTED_VERSION_REQUIRED'; end if;
    select * into v_receipt from kh_private.property_save_requests where property_id=v_existing.id;
    if v_receipt.last_expected_version=v_expected and v_receipt.last_payload=v_canonical and v_existing.version=v_receipt.last_result_version then
      return to_jsonb(v_existing);
    end if;
    if v_existing.version<>v_expected then raise exception 'KH_VERSION_CONFLICT'; end if;
    -- Once submitted, every content edit requires a new review; availability is preserved.
    if v_existing.moderation<>'draft' then v_mode := 'pending'; end if;
  end if;
  perform kh_private.validate_photos(v_user,v_request,v_photos,v_mode);

  if v_id is null then
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_canonical->>'type',v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode)
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_canonical->>'type',description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;
revoke all on function public.kh_save_property(jsonb) from public, anon, authenticated;
grant execute on function public.kh_save_property(jsonb) to authenticated;

create function public.kh_set_property_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('active','paused','sold') then raise exception 'KH_INVALID_STATUS'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.availability=p_status then return; end if;
  update public.properties set availability=p_status,updated_at=now(),version=version+1 where id=p_id;
end;
$$;
revoke all on function public.kh_set_property_status(uuid,text) from public, anon, authenticated;
grant execute on function public.kh_set_property_status(uuid,text) to authenticated;

create function public.kh_submit_property(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.moderation in ('pending','approved') then return; end if;
  perform kh_private.validate_photos(v_property.owner_id,v_property.client_request_id,v_property.photo_paths,'pending');
  update public.properties set moderation='pending',review_note=null,updated_at=now(),version=version+1 where id=p_id;
end;
$$;
revoke all on function public.kh_submit_property(uuid) from public, anon, authenticated;
grant execute on function public.kh_submit_property(uuid) to authenticated;

create function public.kh_review_property(p_id uuid,p_decision text,p_note text,p_expected_version integer) returns void
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
    perform kh_private.validate_photos(v_property.owner_id,v_property.client_request_id,v_property.photo_paths,'pending');
    v_note := null;
  end if;
  update public.properties set moderation=p_decision,review_note=v_note,updated_at=now(),version=version+1 where id=p_id;
end;
$$;
revoke all on function public.kh_review_property(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.kh_review_property(uuid,text,text,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-photos','property-photos',false,4194304,array['image/jpeg','image/png','image/webp']);

-- This volatile function serializes deletion with saves using the same photo locks.
-- It rechecks references after obtaining the lock, avoiding save/delete races.
create function kh_private.photo_delete_allowed(p_name text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or split_part(p_name,'/',1)<>auth.uid()::text then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||p_name,0));
  return not exists (select 1 from public.properties where photo_paths @> array[p_name]);
end;
$$;
revoke all on function kh_private.photo_delete_allowed(text) from public, anon, authenticated;
grant execute on function kh_private.photo_delete_allowed(text) to authenticated;

create policy kh_photo_read on storage.objects for select to anon, authenticated using (
  bucket_id='property-photos' and (
    split_part(name,'/',1)=(select auth.uid())::text or (select public.kh_is_admin()) or exists (
      select 1 from public.properties p where p.moderation='approved' and p.availability='active' and p.photo_paths @> array[objects.name]
    )
  )
);
create policy kh_photo_insert on storage.objects for insert to authenticated with check (
  bucket_id='property-photos' and (select auth.uid()) is not null
  and name ~ ('^'||(select auth.uid())::text||'/[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$')
);
create policy kh_photo_delete on storage.objects for delete to authenticated using (
  bucket_id='property-photos' and kh_private.photo_delete_allowed(name)
);
-- Deliberately no UPDATE policy: uploaded object paths are immutable (upsert=false).

notify pgrst, 'reload schema';
