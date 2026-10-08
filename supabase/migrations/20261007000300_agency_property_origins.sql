-- Stable business identity and private, transaction-scoped authority. No activation.
create table kh_private.agency_property_origins(
 property_id uuid primary key references public.properties(id) on delete restrict,
 origin_agency_id uuid not null references kh_private.agencies(id) on delete restrict,
 publisher_id uuid not null, source_reference text not null, consent_reference text not null,
 authority_version integer not null default 1 check(authority_version>0),created_at timestamptz not null default now(),
 unique(origin_agency_id,source_reference)
);
create table kh_private.agency_mandates(
 property_id uuid not null references public.properties(id) on delete restrict,
 agency_id uuid not null references kh_private.agencies(id) on delete restrict,
 state text not null default 'active' check(state in('active','withdrawn')),version integer not null default 1 check(version>0),
 reference text not null,created_at timestamptz not null default now(),primary key(property_id,agency_id),unique(agency_id,reference)
);
create table kh_private.commercial_cycles(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id) on delete restrict,
 state text not null default 'open' check(state in('open','closed')),version integer not null default 1,created_at timestamptz not null default now()
);
create unique index agency_open_cycle on kh_private.commercial_cycles(property_id) where state='open';
create table kh_private.agency_property_moderation_holds(
 property_id uuid primary key references public.properties(id) on delete restrict,active boolean not null default true,
 actor_id uuid not null,reason text not null,version integer not null default 1,created_at timestamptz not null default now(),cleared_by uuid,cleared_at timestamptz
);
create table kh_private.assisted_agency_links(
 collaborator_id uuid primary key references kh_private.assisted_collaborators(id),agency_id uuid not null references kh_private.agencies(id),
 version integer not null default 1,evidence_reference text not null,confirmed_by uuid not null,confirmed_at timestamptz not null default now()
);
-- These rows are issued only inside validated RPCs and removed before returning.
-- Clients cannot manufacture authority through session settings or Auth metadata.
create table kh_private.agency_property_write_permits(
 transaction_id bigint not null,property_id uuid not null,actor_id uuid not null,request_id text not null,purpose text not null,
 primary key(transaction_id,property_id)
);
do $$ declare t text;begin foreach t in array array['agency_property_origins','agency_mandates','commercial_cycles','agency_property_moderation_holds','assisted_agency_links','agency_property_write_permits'] loop
 execute format('alter table kh_private.%I enable row level security',t);
 execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
 execute format('grant all on kh_private.%I to service_role',t);
end loop;end $$;

create function kh_private.agency_publication_policy(p_property_id uuid,p_origin_agency_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 perform kh_private.agency_lock(p_origin_agency_id);
 if p_property_id is not null and not exists(select 1 from kh_private.agency_property_origins where property_id=p_property_id and origin_agency_id=p_origin_agency_id) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 return case when exists(select 1 from kh_private.agencies a join kh_private.agency_verifications v on v.agency_id=a.id where a.id=p_origin_agency_id and a.state='approved' and v.active)
 and not exists(select 1 from kh_private.agency_property_moderation_holds where property_id=p_property_id and active) then 'direct' else 'requires_review' end;
end $$;

create function kh_private.agency_property_access(p_actor uuid,p_agency uuid,p_property uuid,p_edit boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare source uuid;begin
 perform kh_private.agency_account(p_actor);
 select origin_agency_id into source from kh_private.agency_property_origins where property_id=p_property;
 perform kh_private.agency_lock_many(array[p_agency,source]);
 if p_edit then perform kh_private.agency_actor(p_actor,p_agency,'admin');else perform kh_private.agency_reader(p_actor,p_agency,'manager');end if;
 if not exists(select 1 from kh_private.agency_mandates where property_id=p_property and agency_id=p_agency and state='active') then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 if p_edit and source is distinct from p_agency then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 perform 1 from public.properties where id=p_property for update;
end $$;

create function kh_private.agency_property_json(p_actor uuid,p_agency uuid,p_property uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 select jsonb_build_object('property',to_jsonb(p)||jsonb_build_object('review_note',coalesce((select reason from kh_private.agency_property_moderation_holds where property_id=p.id and active),p.review_note)),'originAgencyId',o.origin_agency_id,'authorityVersion',o.authority_version,
 'cycleId',(select c.id from kh_private.commercial_cycles c where c.property_id=p.id order by c.created_at desc,c.id desc limit 1),
 'mandate',jsonb_build_object('agencyId',m.agency_id,'state',m.state,'version',m.version,'reference',m.reference),
 'canEditCommon',o.origin_agency_id=p_agency and member.role='admin' and p.availability<>'sold',
 'canConfirmSale',o.origin_agency_id=p_agency and member.role='admin' and p.availability<>'sold',
 'publicationPolicy',kh_private.agency_publication_policy(p.id,o.origin_agency_id),
 'moderationHold',exists(select 1 from kh_private.agency_property_moderation_holds h where h.property_id=p.id and h.active)) into result
 from public.properties p join kh_private.agency_property_origins o on o.property_id=p.id
 join kh_private.agency_mandates m on m.property_id=p.id and m.agency_id=p_agency and m.state='active'
 join kh_private.agency_memberships member on member.agency_id=p_agency and member.user_id=p_actor and member.state='active'
 where p.id=p_property;
 if result is null then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;return result;
end $$;
create function public.kh_agency_property(p_actor_id uuid,p_agency_id uuid,p_property_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.agency_property_access(p_actor_id,p_agency_id,p_property_id);return kh_private.agency_property_json(p_actor_id,p_agency_id,p_property_id);end $$;
create function public.kh_agency_properties(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];result jsonb:='[]';i uuid;begin
 perform kh_private.agency_account(p_actor_id);
 if p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'KH_AGENCY_INVALID';end if;
 -- All source locks precede row locks, including shared mandates added in phase 2.
 perform kh_private.agency_lock_many(array[p_agency_id]||(select coalesce(array_agg(distinct o.origin_agency_id),'{}') from kh_private.agency_property_origins o join kh_private.agency_mandates m using(property_id) where m.agency_id=p_agency_id and m.state='active'));
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 select array_agg(id) into ids from(select p.id from public.properties p join kh_private.agency_mandates m on m.property_id=p.id where m.agency_id=p_agency_id and m.state='active' order by p.created_at desc,p.id offset p_offset limit p_limit+1) x;
 foreach i in array coalesce(ids[1:p_limit],'{}') loop result:=result||jsonb_build_array(kh_private.agency_property_json(p_actor_id,p_agency_id,i));end loop;
 return jsonb_build_object('items',result,'hasMore',coalesce(cardinality(ids)>p_limit,false));
end $$;

create function kh_private.guard_agency_property_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=old.id)
 and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid()) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger kh_agency_property_guard before update or delete on public.properties for each row execute function kh_private.guard_agency_property_write();

create function public.kh_agency_save_property(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare source uuid;id uuid:=(p_payload->>'propertyId')::uuid;receipt jsonb;result jsonb;custodian uuid;old public.properties%rowtype;draft jsonb;policy text;intent text:=p_payload->>'publicationIntent';begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_account(p_actor_id);
 select origin_agency_id into source from kh_private.agency_property_origins where property_id=id;
 perform kh_private.agency_lock_many(array[p_agency_id,source]);
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 if jsonb_typeof(p_payload) is distinct from 'object' or intent is null or intent not in('draft','submit') or jsonb_typeof(p_payload->'draft') is distinct from 'object'
 or coalesce(char_length(btrim(p_payload->>'sourceReference')),0) not between 1 and 100
 or coalesce(char_length(btrim(p_payload->>'consentReference')),0) not between 1 and 500
 or p_payload ?| array['ownerId','moderation'] or (p_payload->'draft') ?| array['ownerId','moderation','id','expectedVersion'] then raise exception 'KH_AGENCY_INVALID';end if;
 if coalesce(p_payload#>>'{draft,operation}','sale')<>'sale' then raise exception 'KH_AGENCY_OPERATION_UNSUPPORTED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'save_property',p_payload);
 if receipt is not null then
  id:=(receipt->>'propertyId')::uuid;perform kh_private.agency_property_access(p_actor_id,p_agency_id,id,true);
  return kh_private.agency_property_json(p_actor_id,p_agency_id,id);
 end if;
 select user_id into custodian from kh_private.platform_owner where singleton;
 if custodian is null then raise exception 'KH_PLATFORM_OWNER_REQUIRED';end if;
 if id is not null then
  perform kh_private.agency_property_access(p_actor_id,p_agency_id,id,true);
  select * into old from public.properties where properties.id=id;
  if old.availability='sold' then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
  if old.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
  if not exists(select 1 from kh_private.agency_property_origins where property_id=id and source_reference=btrim(p_payload->>'sourceReference')) then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
 else id:=gen_random_uuid();end if;
 policy:=kh_private.agency_publication_policy(case when old.id is not null then id end,p_agency_id);
 insert into kh_private.agency_property_write_permits values(txid_current(),id,p_actor_id,p_payload->>'clientRequestId','save');
 draft:=(p_payload->'draft')||jsonb_build_object('ownerId',custodian,'clientRequestId',coalesce(old.client_request_id,p_payload->>'clientRequestId'),'moderation',case when intent='draft' then 'draft' else 'pending' end)
 ||case when old.id is not null then jsonb_build_object('id',id,'expectedVersion',old.version) else '{}'::jsonb end;
 result:=kh_private.save_property_core(p_actor_id,custodian,id,draft);
 if old.id is null then
  insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference) values(id,p_agency_id,p_actor_id,btrim(p_payload->>'sourceReference'),btrim(p_payload->>'consentReference'));
  insert into kh_private.agency_mandates(property_id,agency_id,reference)values(id,p_agency_id,btrim(p_payload->>'sourceReference'));
  insert into kh_private.commercial_cycles(property_id)values(id);
 end if;
 if intent='submit' and policy='direct' then
  update public.properties set moderation='approved',review_note=null where properties.id=id;
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)
  select p_agency_id,p_actor_id,'property_published_direct',id,jsonb_build_object('verificationVersion',a.verification_version,'grantedAt',v.granted_at,'grantedBy',v.granted_by,'propertyVersion',(result->>'version')::integer)
  from kh_private.agencies a join kh_private.agency_verifications v on v.agency_id=a.id where a.id=p_agency_id;
  if old.moderation is distinct from 'approved' then perform kh_private.alert_on_approval(p) from public.properties p where p.id=id and p.availability='active';end if;
 end if;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,p_actor_id,'property_saved',id,jsonb_build_object('intent',intent,'consentReference',p_payload->>'consentReference'));
 perform kh_private.agency_remember(p_actor_id,p_agency_id,'save_property',p_payload,jsonb_build_object('propertyId',id));
 delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=id;
 return kh_private.agency_property_json(p_actor_id,p_agency_id,id);
end $$;

-- Existing personal validation, extended only by private per-property permits.
create or replace function kh_private.validate_property_media(p_id uuid,p_owner uuid,p_request text,p_paths text[],p_thumb text,p_mode text,p_operation text) returns void language plpgsql security definer set search_path='' as $$
declare v_path text; asset kh_private.property_media_assets%rowtype;
begin
 if cardinality(p_paths)>6 or (p_mode<>'draft' and p_operation<>'wanted' and cardinality(p_paths)<1) or cardinality(p_paths)<>(select count(distinct x) from unnest(p_paths) x) then raise exception 'KH_INVALID_PHOTOS';end if;
 if p_thumb=any(p_paths) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
 for v_path in select x from unnest(p_paths||case when p_thumb is null then '{}'::text[] else array[p_thumb] end) x order by x loop
  if v_path is null or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$' or (v_path=p_thumb and v_path !~ '\.jpg$') then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
  select * into asset from kh_private.property_media_assets where property_media_assets.path=v_path;
  if found then
   if p_id is null or asset.property_id<>p_id or asset.state<>'attached' or not (exists(select 1 from public.properties where id=p_id and owner_id=p_owner and client_request_id=p_request) or exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_id and actor_id=auth.uid())) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  elsif not (starts_with(v_path,p_owner::text||'/'||p_request||'/') and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_id) or exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_id and actor_id=auth.uid() and purpose='save' and starts_with(v_path,actor_id::text||'/'||request_id||'/'))) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  if not exists(select 1 from storage.objects where bucket_id='property-photos' and name=v_path) then raise exception 'KH_PHOTO_NOT_FOUND';end if;
 end loop;
end $$;
create or replace function kh_private.bind_property_media() returns trigger language plpgsql security definer set search_path='' as $$
declare v_path text; active_paths text[];prop uuid;
begin
 prop:=case when tg_op='DELETE' then old.id else new.id end;
 if tg_op='INSERT' then insert into kh_private.property_publication_keys(origin_actor_id,client_request_id,property_id) values(coalesce((select actor_id from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id),new.owner_id),new.client_request_id,new.id);end if;
 active_paths:=case when tg_op='DELETE' then '{}'::text[] else new.photo_paths||case when new.cover_thumb_path is null then '{}'::text[] else array[new.cover_thumb_path] end end;
 for v_path in select a.path from kh_private.property_media_assets a where a.property_id=prop and a.state='attached' and not(a.path=any(active_paths)) order by a.path loop
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
  update kh_private.property_media_assets set state='retired',retired_at=clock_timestamp() where property_media_assets.path=v_path;
  insert into kh_private.media_cleanup_jobs(path,reason) values(v_path,case when tg_op='DELETE' then 'property_deleted' else 'media_removed' end) on conflict do nothing;
 end loop;
 if tg_op<>'DELETE' then
  for v_path in select x from unnest(active_paths) x order by x loop
   perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
   if exists(select 1 from kh_private.property_media_assets a where a.path=v_path and (a.property_id<>prop or a.state<>'attached')) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
   if not exists(select 1 from kh_private.property_media_assets a where a.path=v_path) and not (starts_with(v_path,new.owner_id::text||'/'||new.client_request_id||'/') and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=prop) or exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=prop and actor_id=auth.uid() and purpose='save' and starts_with(v_path,actor_id::text||'/'||request_id||'/'))) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
   insert into kh_private.property_media_assets(path,property_id,kind,uploader_id) values(v_path,prop,case when v_path=new.cover_thumb_path then 'cover_thumb' else 'photo' end,split_part(v_path,'/',1)::uuid) on conflict(path) do update set kind=excluded.kind;
  end loop;
 end if;
 return coalesce(new,old);
end $$;

-- Private core retains the established field and photo validation.
create function kh_private.save_property_core(p_actor uuid,p_custodian uuid,p_target uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := p_custodian;
  v_id uuid;
  v_request text;
  v_expected integer;
  v_mode text;
  v_operation text;
  v_type text;
  v_amenities text[];
  v_photos text[];
  v_thumb text;
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
  v_rent_period text;
  v_rent_min_stay numeric;
  v_wanted_operations text[] := '{sale,swap}';
  v_canonical jsonb;
  v_exists boolean;
  v_existing public.properties%rowtype;
  v_saved public.properties%rowtype;
  v_receipt kh_private.property_save_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501';end if;
  if p_actor is distinct from auth.uid() or p_custodian is null or (p_target is null and p_custodian is distinct from p_actor) or (p_target is not null and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_target and actor_id=p_actor and purpose='save')) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
  if v_user is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  perform kh_private.require_active();
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
    if v_operation not in ('sale','swap','wanted','rent') then raise exception 'KH_INVALID_OPERATION'; end if;
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
    select p.* into v_existing from kh_private.property_publication_keys k join public.properties p on p.id=k.property_id where k.origin_actor_id=v_user and k.client_request_id=v_request for update of p;
    if found and v_existing.owner_id<>v_user then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED'; end if;
    if not found and exists(select 1 from kh_private.property_publication_keys where origin_actor_id=v_user and client_request_id=v_request) then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED'; end if;
    v_exists := found;
  else
    select * into v_existing from public.properties where id=v_id and owner_id=v_user for update;
    if not found then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED'; end if;
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
    -- Area is optional; when present it keeps the old range.
    if (v_area is not null and not(v_area>0 and v_area<=10000))
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

  if v_operation = 'rent' then
    v_rent_period := p_payload->>'rentPeriod';
    if jsonb_typeof(p_payload->'rentPeriod') is distinct from 'string' or v_rent_period not in ('month','day')
      or coalesce(jsonb_typeof(p_payload->'rentMinStay'),'null') not in ('number','null') then
      raise exception 'KH_INVALID_RENT';
    end if;
    v_rent_min_stay := (p_payload->>'rentMinStay')::numeric;
    if v_rent_min_stay is not null and not(v_rent_min_stay between 1 and 365 and v_rent_min_stay=trunc(v_rent_min_stay)) then
      raise exception 'KH_INVALID_RENT';
    end if;
  elsif v_operation = 'wanted' then
    -- An older client omits wantedOperations: an edit keeps what the row says, a new ad buys or swaps.
    if p_payload ? 'wantedOperations' and p_payload->'wantedOperations' <> 'null'::jsonb then
      if jsonb_typeof(p_payload->'wantedOperations') <> 'array'
        or exists (select 1 from jsonb_array_elements(p_payload->'wantedOperations') value where jsonb_typeof(value)<>'string') then
        raise exception 'KH_INVALID_WANTED';
      end if;
      select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_wanted_operations
        from jsonb_array_elements_text(p_payload->'wantedOperations') with ordinality items(value,ordinal);
      if not kh_private.valid_wanted_operations(v_wanted_operations) then raise exception 'KH_INVALID_WANTED'; end if;
    elsif v_exists then
      v_wanted_operations := v_existing.wanted_operations;
    end if;
  end if;

  -- Cover thumbnail: only with a cover photo. Omitted (or null), an edit keeps the stored one
  -- while the cover photo is the same file; a new cover without its thumbnail stores null.
  if v_operation <> 'wanted' and cardinality(v_photos) > 0 then
    if p_payload ? 'coverThumbPath' and p_payload->'coverThumbPath' <> 'null'::jsonb then
      if jsonb_typeof(p_payload->'coverThumbPath') <> 'string' then raise exception 'KH_INVALID_PHOTO_PATH'; end if;
      v_thumb := p_payload->>'coverThumbPath';
    elsif v_id is not null and v_existing.photo_paths[1] = v_photos[1] then
      v_thumb := v_existing.cover_thumb_path;
    end if;
  end if;

  v_canonical := jsonb_build_object(
    'clientRequestId',v_request,'title',btrim(p_payload->>'title'),'location',btrim(p_payload->>'location'),
    'province',btrim(p_payload->>'province'),'description',btrim(p_payload->>'description'),'type',v_type,
    'price',v_price,'area',v_area,'bedrooms',v_bedrooms,'bathrooms',v_bathrooms,
    'amenities',to_jsonb(v_amenities),'photoPaths',to_jsonb(v_photos),'moderation',v_mode,'mapLocation',v_map_location,
    'condition',v_condition,'floor',v_floor,'priceNegotiable',v_negotiable,
    'operation',v_operation,'swapWants',v_swap_wants,'swapProvinces',to_jsonb(v_swap_provinces),'swapBalance',v_swap_balance,'swapAmount',v_swap_amount,
    'rentPeriod',v_rent_period,'rentMinStay',v_rent_min_stay,'wantedOperations',to_jsonb(v_wanted_operations),
    'coverThumbPath',v_thumb
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
    if p_target is null and v_existing.moderation<>'draft' then v_mode:='pending';end if;

  end if;
  perform kh_private.validate_property_media(coalesce(v_id,v_existing.id,p_target),v_user,v_request,v_photos,v_thumb,v_mode,v_operation);
  if v_id is null then
    insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision,condition,floor,price_negotiable,operation,swap_wants,swap_provinces,swap_balance,swap_amount,rent_period,rent_min_stay,wanted_operations,cover_thumb_path)
    values(coalesce(p_target,gen_random_uuid()),v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_type,v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
      (v_map_location->>'latitude')::numeric,(v_map_location->>'longitude')::numeric,v_map_location->>'precision',v_condition,v_floor::integer,v_negotiable,
      v_operation,v_swap_wants,v_swap_provinces,v_swap_balance,v_swap_amount,v_rent_period,v_rent_min_stay::integer,v_wanted_operations,v_thumb)
    returning * into v_saved;
    insert into kh_private.property_save_requests(property_id,initial_payload,last_payload,last_expected_version,last_result_version)
    values(v_saved.id,v_canonical,v_canonical,null,v_saved.version);
  else
    update public.properties set title=v_canonical->>'title',location=v_canonical->>'location',province=v_canonical->>'province',
      type=v_type,description=v_canonical->>'description',price=v_price,area=v_area,bedrooms=v_bedrooms::integer,bathrooms=v_bathrooms::integer,
      amenities=v_amenities,photo_paths=v_photos,moderation=v_mode,review_note=null,updated_at=now(),version=version+1,
      latitude=(v_map_location->>'latitude')::numeric,longitude=(v_map_location->>'longitude')::numeric,location_precision=v_map_location->>'precision',
      condition=v_condition,floor=v_floor::integer,price_negotiable=v_negotiable,
      swap_wants=v_swap_wants,swap_provinces=v_swap_provinces,swap_balance=v_swap_balance,swap_amount=v_swap_amount,
      rent_period=v_rent_period,rent_min_stay=v_rent_min_stay::integer,wanted_operations=v_wanted_operations,cover_thumb_path=v_thumb
      where id=v_id returning * into v_saved;
    update kh_private.property_save_requests set last_payload=v_canonical,last_expected_version=v_expected,last_result_version=v_saved.version where property_id=v_id;
  end if;
  return to_jsonb(v_saved);
end;
$$;

create or replace function public.kh_review_property(p_id uuid, p_decision text, p_note text, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype; source uuid; v_note text := nullif(btrim(p_note), '');
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if auth.uid() is null or not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'KH_INVALID_DECISION'; end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) > 1000) then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
  select origin_agency_id into source from kh_private.agency_property_origins where property_id=p_id;
  if source is not null then perform kh_private.agency_lock(source);end if;
  select * into v_property from public.properties where id = p_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if (source is null and v_property.owner_id=auth.uid()) or (source is not null and (exists(select 1 from kh_private.agency_property_origins where property_id=p_id and publisher_id=auth.uid()) or exists(select 1 from kh_private.agency_memberships where agency_id=source and user_id=auth.uid() and state='active'))) then raise exception 'KH_CANNOT_REVIEW_OWN_PROPERTY'; end if;
  if p_expected_version is null or v_property.version <> p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_property.moderation <> 'pending' then raise exception 'KH_NOT_PENDING'; end if;
  if source is not null then insert into kh_private.agency_property_write_permits values(txid_current(),p_id,auth.uid(),v_property.client_request_id,'review');end if;
  if p_decision = 'approved' then
    perform kh_private.validate_property_media(v_property.id,v_property.owner_id,v_property.client_request_id,v_property.photo_paths,v_property.cover_thumb_path,'pending',v_property.operation);
    v_note := null;
  end if;
  update public.properties set moderation = p_decision, review_note = v_note, updated_at = now(), version = version + 1 where id = p_id returning * into v_property;
  if source is not null then
   if p_decision='rejected' then
    insert into kh_private.agency_property_moderation_holds(property_id,actor_id,reason)values(p_id,auth.uid(),v_note) on conflict(property_id) do update set active=true,actor_id=excluded.actor_id,reason=excluded.reason,created_at=now(),version=agency_property_moderation_holds.version+1,cleared_by=null,cleared_at=null;
   else update kh_private.agency_property_moderation_holds set active=false,cleared_by=auth.uid(),cleared_at=now(),version=version+1 where property_id=p_id and active;end if;
   delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_id;
  end if;
  -- ponytail: every saved search and wanted ad is evaluated on each approval; add a cap or a
  -- queue if one approval starts producing hundreds of alerts.
  if p_decision = 'approved' and v_property.availability = 'active' then perform kh_private.alert_on_approval(v_property); end if;
end $$;

create or replace function public.kh_admin_unpublish(p_actor_id uuid,p_property_id uuid,p_expected_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_row public.properties%rowtype; source uuid; v_reason text:=btrim(coalesce(p_reason,''));
begin
  perform kh_private.admin_actor(p_actor_id);
  if char_length(v_reason) not between 3 and 1000 then raise exception 'KH_ADMIN_INVALID'; end if;
  select origin_agency_id into source from kh_private.agency_property_origins where property_id=p_property_id;
  if source is not null then perform kh_private.agency_lock(source);end if;
  select * into v_row from public.properties where id=p_property_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_row.version is distinct from p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_row.moderation<>'approved' then raise exception 'KH_ADMIN_STATE_CHANGED'; end if;
  if source is not null then insert into kh_private.agency_property_write_permits values(txid_current(),p_property_id,p_actor_id,v_row.client_request_id,'unpublish');end if;
  update public.properties set moderation='rejected',review_note=v_reason,updated_at=now(),version=version+1 where id=p_property_id;
  if source is not null then
   insert into kh_private.agency_property_moderation_holds(property_id,actor_id,reason)values(p_property_id,p_actor_id,v_reason) on conflict(property_id) do update set active=true,actor_id=excluded.actor_id,reason=excluded.reason,created_at=now(),version=agency_property_moderation_holds.version+1,cleared_by=null,cleared_at=null;
   delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p_property_id;
  end if;
end $$;
create or replace function kh_private.full_public_profile(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_verified boolean;
  v_months integer;
  v_approved integer;
  v_active integer;
  v_ids jsonb;
  v_answered integer;
  v_received integer;
  v_median integer;
  v_minutes integer;
  v_rate integer;
  v_visits integer;
  v_level text;
  v_avatar text;
  v_reasons text[] := '{}';
begin
  -- The same error for a person who does not exist and one who is not visible.
  if p_user_id is null or kh_private.profile_visible(p_user_id, v_viewer) is not true then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id = p_user_id;
  v_verified := exists (select 1 from kh_private.verified_users where user_id = p_user_id);
  v_months := (extract(year from age(now(), v_profile.created_at)) * 12 + extract(month from age(now(), v_profile.created_at)))::integer;
  select count(*) into v_approved from public.properties p join kh_private.property_publication_keys k on k.property_id=p.id where p.owner_id=p_user_id and k.origin_actor_id=p_user_id and p.moderation='approved' and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id);
  select count(*) into v_active from public.properties p where owner_id=p_user_id and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id) and moderation='approved' and availability='active';
  select coalesce(jsonb_agg(id order by created_at desc, id desc), '[]'::jsonb) into v_ids from (
    select id, created_at from public.properties p where owner_id = p_user_id and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id) and moderation = 'approved' and availability = 'active'
    order by created_at desc, id desc limit 24) recent;
  select answered, received, median_minutes into v_answered, v_received, v_median from kh_private.profile_response_stats(p_user_id);
  if v_answered >= 3 then
    v_minutes := v_median;
    v_rate := round(100.0 * v_answered / v_received)::integer;
  end if;
  v_visits := kh_private.profile_visits_agreed(p_user_id);
  v_level := kh_private.karma_level(v_months, v_approved, v_answered, v_visits, v_verified,
    kh_private.profile_confirmed_reports(p_user_id, null), kh_private.profile_confirmed_reports(p_user_id, interval '90 days') > 0);
  select avatar_path into v_avatar from kh_private.account_avatars where owner_id = p_user_id;
  if v_avatar is not null and v_viewer is distinct from p_user_id and not kh_private.avatar_is_public(v_avatar) then v_avatar := null; end if;

  if v_verified then v_reasons := array_append(v_reasons, 'Verificado por KarmaHouse'); end if;
  if v_approved > 0 then
    v_reasons := array_append(v_reasons, (v_approved || case when v_approved = 1 then ' anuncio propio publicado y aprobado' else ' anuncios propios publicados y aprobados' end));
  end if;
  if round(v_rate / 10.0) > 0 then v_reasons := array_append(v_reasons, ('Responde a ' || round(v_rate / 10.0) || ' de cada 10 mensajes')); end if;
  if v_visits > 0 then
    v_reasons := array_append(v_reasons, (v_visits || case when v_visits = 1 then ' visita concertada' else ' visitas concertadas' end));
  end if;
  if v_months > 0 then
    v_reasons := array_append(v_reasons, ('En KarmaHouse desde hace ' || v_months || case when v_months = 1 then ' mes' else ' meses' end));
  end if;

  return jsonb_build_object('id', v_profile.id, 'displayName', v_profile.display_name, 'memberSince', v_profile.created_at,
    'verified', v_verified, 'level', v_level, 'levelReasons', to_jsonb(v_reasons), 'activeListings', v_ids,
    'activeListingCount', v_active, 'approvedListingCount', v_approved, 'responseMinutes', v_minutes,
    'responseRate', v_rate, 'visitsAgreed', v_visits, 'avatarUrlPath', v_avatar);
end $$;

alter function public.kh_save_property(jsonb) set schema kh_private;
alter function kh_private.kh_save_property(jsonb) rename to personal_kh_save_property;
revoke all on function kh_private.personal_kh_save_property(jsonb) from public,anon,authenticated;
create function public.kh_save_property(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=nullif(p_payload->>'id','')::uuid) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 return kh_private.personal_kh_save_property(p_payload);
end $$;
grant execute on function public.kh_save_property(jsonb) to authenticated;
revoke all on function public.kh_save_property(jsonb) from public,anon;
alter function public.kh_submit_property(uuid) set schema kh_private;
alter function kh_private.kh_submit_property(uuid) rename to personal_kh_submit_property;
revoke all on function kh_private.personal_kh_submit_property(uuid) from public,anon,authenticated;
create function public.kh_submit_property(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 perform kh_private.personal_kh_submit_property(p_id);
end $$;
grant execute on function public.kh_submit_property(uuid) to authenticated;
revoke all on function public.kh_submit_property(uuid) from public,anon;
alter function public.kh_set_property_status(uuid,text) set schema kh_private;
alter function kh_private.kh_set_property_status(uuid,text) rename to personal_kh_set_property_status;
revoke all on function kh_private.personal_kh_set_property_status(uuid,text) from public,anon,authenticated;
create function public.kh_set_property_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 perform kh_private.personal_kh_set_property_status(p_id,p_status);
end $$;
grant execute on function public.kh_set_property_status(uuid,text) to authenticated;
revoke all on function public.kh_set_property_status(uuid,text) from public,anon;

create or replace function kh_private.guard_account_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then perform kh_private.require_active(); end if;
  if tg_table_name='properties' then
    if not exists(select 1 from kh_private.agency_property_origins where property_id=new.id) and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id) and new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='pending' then
      new.moderation:='approved'; new.review_note:=null;
    end if;
  end if;
  return new;
end $$;
create or replace function kh_private.owner_publication_alerts() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from kh_private.agency_property_origins where property_id=new.id) and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id) and new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='approved' and new.availability='active' then
    perform kh_private.alert_on_approval(new);
  end if;
  return new;
end $$;
create or replace function kh_private.start_conversation_for_manager(p_property_id uuid,p_actor_id uuid,p_expected_manager_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.chat_actor(p_actor_id);p public.properties%rowtype;manager_id uuid;conversation_id uuid;
begin
 perform kh_private.require_active();
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_property_id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 if kh_private.is_deleting(a) then raise exception 'KH_ACCOUNT_DELETING';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||a::text,0));
 select * into p from public.properties where id=p_property_id;
 if not found or p.moderation<>'approved' or p.availability<>'active' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE';end if;
 manager_id:=p.owner_id;
 if p_expected_manager_id is not null and p_expected_manager_id<>manager_id then raise exception 'KH_CHAT_MANAGER_CHANGED';end if;
 if manager_id=a then raise exception 'KH_CHAT_SELF_CONTACT';end if;
 perform kh_private.chat_pair_lock(a,manager_id);
 select * into p from public.properties where id=p_property_id for share;
 if not found or p.moderation<>'approved' or p.availability<>'active' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE';end if;
 -- Assisted attribution takes this row FOR UPDATE without changing custody or availability.
 -- Re-evaluate origin after that writer commits, before returning or creating a personal chat.
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_property_id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 if p.owner_id<>manager_id then raise exception 'KH_CHAT_MANAGER_CHANGED';end if;
 select id into conversation_id from public.kh_conversations where property_id=p_property_id and buyer_id=a and seller_id=manager_id;
 if found then return kh_private.chat_conversation_json(conversation_id,a);end if;
 if exists(select 1 from public.kh_user_blocks where blocker_id=a and blocked_id=manager_id or blocker_id=manager_id and blocked_id=a) then raise exception 'KH_CHAT_BLOCKED';end if;
 if (select count(*) from public.kh_conversations where buyer_id=a and created_at>=clock_timestamp()-interval '24 hours')>=20 then raise exception 'KH_CHAT_CONVERSATION_LIMIT';end if;
 insert into public.kh_conversations(property_id,property_title,property_location,buyer_id,seller_id) values(p.id,p.title,concat_ws(', ',p.location,p.province),a,manager_id) returning id into conversation_id;
 insert into public.kh_conversation_reads(conversation_id,user_id) values(conversation_id,a),(conversation_id,manager_id);
 return kh_private.chat_conversation_json(conversation_id,a);
end $$;
create or replace function public.kh_get_listing_management(p_property_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('propertyId',p.id,'managerId',p.owner_id,'assistedByKarmaHouse',exists(select 1 from kh_private.assisted_listing_records r where r.property_id=p.id),
 'contactAvailable',p.moderation='approved' and p.availability='active' and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id))
 from public.properties p where p.id=p_property_id and (p.moderation='approved' and p.availability='active' or p.owner_id=auth.uid() or public.kh_is_admin());
$$;
-- Private material remains available only to active members of authorized agencies.
create function kh_private.agency_media_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not kh_private.is_suspended(auth.uid()) and not kh_private.is_deleting(auth.uid())
 and exists(select 1 from kh_private.property_media_assets asset join kh_private.agency_mandates m on m.property_id=asset.property_id and m.state='active'
 join kh_private.agencies a on a.id=m.agency_id
 join kh_private.agency_memberships member on member.agency_id=a.id and member.user_id=auth.uid() and member.state='active'
 where asset.path=p_path and asset.state='attached');
$$;
create policy kh_agency_photo_read on storage.objects for select to authenticated using(bucket_id='property-photos' and kh_private.agency_media_read(name));
-- Confirm proven assisted provenance without changing identity, publication or personal ownership.
create function public.kh_admin_link_assisted_agency(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(p_payload->>'agencyId')::uuid;pid uuid:=(p_payload->>'propertyId')::uuid;cid uuid:=(p_payload->>'collaboratorId')::uuid;
 c kh_private.assisted_collaborators%rowtype;p public.properties%rowtype;r kh_private.assisted_listing_records%rowtype;receipt jsonb;v_result jsonb;linked uuid;prior_review kh_private.admin_audit%rowtype;
begin
 perform kh_private.agency_account(p_actor_id);
 if not kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_REQUIRED';end if;
 if not (select enabled from kh_private.agency_settings) then raise exception 'KH_AGENCY_DISABLED';end if;
 if coalesce(char_length(btrim(p_payload->>'evidenceReference')),0) not between 1 and 500 or coalesce(char_length(btrim(p_payload->>'consentReference')),0) not between 1 and 500 or coalesce(char_length(btrim(p_payload->>'sourceReference')),0) not between 1 and 100 then raise exception 'KH_AGENCY_ASSISTED_LINK_REQUIRED';end if;
 -- Linked account is locked before agency/property, so lifecycle checks cannot race.
 select account_id into linked from kh_private.assisted_collaborators where id=cid;
 if linked is not null then perform pg_advisory_xact_lock(hashtextextended('kh:account:'||linked::text,0));end if;
 perform kh_private.agency_lock(a);
 if not exists(select 1 from kh_private.agencies where id=a and state='approved') then raise exception 'KH_AGENCY_NOT_APPROVED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,a,'link_assisted_agency',p_payload);
 select * into c from kh_private.assisted_collaborators where id=cid for update;
 select * into p from public.properties where id=pid for update;
 select * into r from kh_private.assisted_listing_records where property_id=pid for update;
 if c.id is null or c.kind<>'agency' or c.state<>'active' or c.account_id is distinct from linked
 or p.id is null or not kh_private.is_owner(p.owner_id) or not kh_private.is_official(p.owner_id) or p.availability='sold' or p.operation<>'sale'
 or r.property_id is null or r.collaborator_id<>cid or r.consent_revoked_at is not null or not kh_private.assisted_record_complete(r)
 or (linked is not null and (c.link_confirmed_at is null or not exists(select 1 from auth.users u join kh_private.agency_memberships m on m.user_id=u.id where u.id=linked and u.email_confirmed_at is not null and m.agency_id=a and m.role='admin' and m.state='active') or kh_private.is_suspended(linked) or kh_private.is_deleting(linked)))
 or exists(select 1 from kh_private.assisted_agency_links where collaborator_id=cid and agency_id<>a)
 or exists(select 1 from kh_private.agency_property_origins where property_id=pid and origin_agency_id<>a)
 then raise exception 'KH_AGENCY_ASSISTED_LINK_REQUIRED';end if;
 if receipt is not null then return receipt;end if;
 if c.version is distinct from (p_payload->>'expectedCollaboratorVersion')::integer or p.version is distinct from (p_payload->>'expectedPropertyVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
 if exists(select 1 from kh_private.agency_property_origins where property_id=pid) then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
 insert into kh_private.assisted_agency_links(collaborator_id,agency_id,evidence_reference,confirmed_by)values(cid,a,btrim(p_payload->>'evidenceReference'),p_actor_id)
 on conflict(collaborator_id) do update set version=assisted_agency_links.version+1,evidence_reference=excluded.evidence_reference,confirmed_by=excluded.confirmed_by,confirmed_at=now();
 insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)values(pid,a,p_actor_id,btrim(p_payload->>'sourceReference'),btrim(p_payload->>'consentReference'));
 -- Attribution cannot turn an existing KarmaHouse rejection into direct-publication authority.
 -- Keep the original moderation evidence when it exists; otherwise the attributing owner
 -- records the inherited restriction, which still requires a separate authorized review.
 if p.moderation='rejected' then
  select * into prior_review from kh_private.admin_audit
   where target_id=pid and action like 'property_rejected_%' order by id desc limit 1;
  insert into kh_private.agency_property_moderation_holds(property_id,actor_id,reason,created_at)
   values(pid,coalesce(prior_review.actor_id,p_actor_id),coalesce(nullif(p.review_note,''),prior_review.reason,'Rechazo previo a la atribución empresarial; requiere revisión de KarmaHouse.'),coalesce(prior_review.created_at,p.updated_at))
   on conflict(property_id) do nothing;
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)
   values(a,p_actor_id,'property_moderation_hold_inherited',pid,jsonb_build_object('priorAuditId',prior_review.id,'priorActorId',prior_review.actor_id,'priorModeration','rejected','reason',p.review_note));
 end if;
 insert into kh_private.agency_mandates(property_id,agency_id,reference)values(pid,a,btrim(p_payload->>'sourceReference'));
 insert into kh_private.commercial_cycles(property_id)values(pid);
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(a,p_actor_id,'assisted_origin_confirmed',pid,p_payload-'clientRequestId');
 v_result:=jsonb_build_object('propertyId',pid,'agencyId',a,'authorityVersion',1,'linkVersion',(select version from kh_private.assisted_agency_links where collaborator_id=cid));
 return kh_private.agency_remember(p_actor_id,a,'link_assisted_agency',p_payload,v_result);
end $$;
revoke all on function kh_private.agency_publication_policy(uuid,uuid),kh_private.agency_property_access(uuid,uuid,uuid,boolean),kh_private.agency_property_json(uuid,uuid,uuid),kh_private.guard_agency_property_write(),kh_private.save_property_core(uuid,uuid,uuid,jsonb),kh_private.agency_media_read(text) from public,anon,authenticated;
grant execute on function kh_private.agency_media_read(text) to authenticated;
revoke all on function public.kh_agency_property(uuid,uuid,uuid),public.kh_agency_properties(uuid,uuid,integer,integer),public.kh_agency_save_property(uuid,uuid,jsonb),public.kh_admin_link_assisted_agency(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_agency_property(uuid,uuid,uuid),public.kh_agency_properties(uuid,uuid,integer,integer),public.kh_agency_save_property(uuid,uuid,jsonb),public.kh_admin_link_assisted_agency(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Both entry points share exactly one implementation of personal field/media validation.
create or replace function kh_private.personal_kh_save_property(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin return kh_private.save_property_core(auth.uid(),auth.uid(),null,p_payload);end $$;
create function kh_private.guard_agency_origin_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.property_id is distinct from old.property_id or new.origin_agency_id is distinct from old.origin_agency_id or new.publisher_id is distinct from old.publisher_id or new.source_reference is distinct from old.source_reference then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
 return new;
end $$;
create trigger kh_agency_origin_identity before update on kh_private.agency_property_origins for each row execute function kh_private.guard_agency_origin_identity();
revoke all on function kh_private.guard_agency_origin_identity() from public,anon,authenticated;
