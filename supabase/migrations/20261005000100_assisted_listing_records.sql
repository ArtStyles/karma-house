-- Private provenance, immutable publication identity and property-scoped media.
-- No production activation. Identity comes exclusively from protected platform_owner.
create table kh_private.assisted_listing_settings(singleton boolean primary key default true check(singleton), official_publisher_id uuid references auth.users(id) on delete restrict, transfers_enabled boolean not null default false);
insert into kh_private.assisted_listing_settings(singleton,official_publisher_id) values(true,(select user_id from kh_private.platform_owner));
create table kh_private.account_deletions(user_id uuid primary key references auth.users(id) on delete cascade, begun_at timestamptz not null default clock_timestamp());
create table kh_private.assisted_collaborators(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in('owner','manager','agency')),
 private_name text not null check(char_length(private_name) between 2 and 120),private_contact text not null check(char_length(private_contact) between 1 and 200),contact_channel text not null check(char_length(contact_channel) between 1 and 40),
 account_id uuid references auth.users(id) on delete set null,link_evidence_reference text,link_confirmed_at timestamptz,link_confirmed_by uuid,
 state text not null default 'active' check(state in('active','withdrawn')),version integer not null default 1,created_at timestamptz not null default clock_timestamp()
);
create table kh_private.assisted_listing_records(
 property_id uuid primary key references public.properties(id) on delete cascade,collaborator_id uuid not null references kh_private.assisted_collaborators(id),version integer not null default 1,
 collaborator_reference text not null check(char_length(collaborator_reference) between 1 and 100),source_channel text not null,source_reference text,
 received_at timestamptz,consent_text text,consent_version text,consent_at timestamptz,evidence_reference text,
 recorded_by uuid,recorded_at timestamptz not null default clock_timestamp(),consent_revoked_at timestamptz,last_confirmed_at timestamptz,confirmed_price numeric,confirmed_availability text,
 unique(collaborator_id,collaborator_reference)
);
create table kh_private.assisted_write_receipts(actor_id uuid not null,request_id text not null,kind text not null,payload jsonb not null,result jsonb not null,primary key(actor_id,request_id,kind));
create table kh_private.property_publication_keys(origin_actor_id uuid not null,client_request_id text not null,property_id uuid unique references public.properties(id) on delete set null,created_at timestamptz not null default clock_timestamp(),primary key(origin_actor_id,client_request_id));
insert into kh_private.property_publication_keys(origin_actor_id,client_request_id,property_id) select owner_id,client_request_id,id from public.properties;
alter table public.properties drop constraint properties_owner_id_client_request_id_key;
create index properties_current_request on public.properties(owner_id,client_request_id);
create table kh_private.property_media_assets(path text primary key,property_id uuid not null,kind text not null check(kind in('photo','cover_thumb')),uploader_id uuid,state text not null default 'attached' check(state in('attached','retired','deleting','deleted')),created_at timestamptz not null default clock_timestamp(),retired_at timestamptz);
create index property_media_by_property on kh_private.property_media_assets(property_id,state);
create table kh_private.media_cleanup_jobs(path text primary key,reason text not null,state text not null default 'pending' check(state in('pending','processing','done')),attempts integer not null default 0,next_attempt_at timestamptz not null default clock_timestamp(),lease_id uuid,lease_until timestamptz,last_error text);
insert into kh_private.property_media_assets(path,property_id,kind,uploader_id)
 select x.path,p.id,x.kind,p.owner_id from public.properties p cross join lateral (
 select unnest(p.photo_paths) path,'photo' kind union all select p.cover_thumb_path,'cover_thumb' where p.cover_thumb_path is not null) x;
-- Duplicate paths across properties fail the backfill rather than granting a folder.
do $$ begin if exists(select 1 from kh_private.property_media_assets a where not exists(select 1 from storage.objects o where o.bucket_id='property-photos' and o.name=a.path)) then raise exception 'KH_ASSISTED_BACKFILL_MISSING_MEDIA'; end if; end $$;
alter table public.properties drop constraint properties_cover_thumb_path;
alter table public.properties add constraint properties_cover_thumb_path check(cover_thumb_path is null or cover_thumb_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_-]{1,100}\.jpg$');
do $$ declare n text; begin foreach n in array array['assisted_listing_settings','account_deletions','assisted_collaborators','assisted_listing_records','assisted_write_receipts','property_publication_keys','property_media_assets','media_cleanup_jobs'] loop execute format('alter table kh_private.%I enable row level security',n);execute format('revoke all on kh_private.%I from public,anon,authenticated',n);execute format('grant all on kh_private.%I to service_role',n);end loop; end $$;

create function kh_private.is_official(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from kh_private.assisted_listing_settings s join kh_private.platform_owner o on o.user_id=s.official_publisher_id where s.singleton and s.official_publisher_id=p_user);
$$;
create function kh_private.is_deleting(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from kh_private.account_deletions where user_id=p_user) $$;
create function kh_private.assisted_actor(p_actor uuid,p_official boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501';end if;
 perform kh_private.push_current_session(p_actor);
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'KH_SESSION_REQUIRED' using errcode='42501';end if;
 perform kh_private.require_active();
 if kh_private.is_deleting(p_actor) then raise exception 'KH_ACCOUNT_DELETING';end if;
 if p_official and not kh_private.is_official(p_actor) then raise exception 'KH_OFFICIAL_ACCOUNT_REQUIRED' using errcode='42501';end if;
 return p_actor;
end $$;
create function kh_private.require_recipient(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||p_user::text,0));
 if p_user is null or kh_private.is_official(p_user) or kh_private.is_suspended(p_user) or kh_private.is_deleting(p_user) or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_user and u.email_confirmed_at is not null) then raise exception 'KH_TRANSFER_RECIPIENT_INVALID';end if;
end $$;
create function public.kh_assisted_capabilities(p_actor_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('canPrepare',auth.uid()=p_actor_id and kh_private.is_official(p_actor_id) and not kh_private.is_suspended(p_actor_id) and not kh_private.is_deleting(p_actor_id),'canOffer',auth.uid()=p_actor_id and kh_private.is_official(p_actor_id) and not kh_private.is_suspended(p_actor_id) and not kh_private.is_deleting(p_actor_id) and coalesce((select transfers_enabled from kh_private.assisted_listing_settings),false),'transfersEnabled',coalesce((select transfers_enabled from kh_private.assisted_listing_settings),false));
$$;
create function public.kh_admin_save_assisted_collaborator(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.assisted_actor(p_actor_id,true); r text:=p_payload->>'clientRequestId'; i uuid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid()); target uuid:=nullif(p_payload->>'accountId','')::uuid; old kh_private.assisted_collaborators%rowtype;receipt kh_private.assisted_write_receipts%rowtype;outcome jsonb;
begin
 if r is null or r !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or p_payload->>'kind' not in('owner','manager','agency') or coalesce(char_length(btrim(p_payload->>'privateName')),0) not between 2 and 120 or coalesce(char_length(btrim(p_payload->>'privateContact')),0) not between 1 and 200 or coalesce(char_length(btrim(p_payload->>'contactChannel')),0) not between 1 and 40 then raise exception 'KH_ASSISTED_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:assisted:'||a::text||':'||r,0));
 select * into receipt from kh_private.assisted_write_receipts where actor_id=a and request_id=r and kind='collaborator';
 if found then if receipt.payload<>p_payload then raise exception 'KH_ASSISTED_CONFLICT';end if;return receipt.result;end if;
 -- Lock both old/new linked accounts before the collaborator, compatible with deletion.
 for target in select distinct x from (select nullif(p_payload->>'accountId','')::uuid x union all select account_id from kh_private.assisted_collaborators where id=i) t where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended('kh:account:'||target::text,0));
 end loop;
 target:=nullif(p_payload->>'accountId','')::uuid;
 if target is not null then perform kh_private.require_recipient(target);if coalesce(char_length(btrim(p_payload->>'linkEvidenceReference')),0) not between 1 and 500 then raise exception 'KH_ASSISTED_LINK_REQUIRED';end if;end if;
 select * into old from kh_private.assisted_collaborators where id=i for update;
 if found then
  if (p_payload->>'expectedVersion')::integer is distinct from old.version then raise exception 'KH_VERSION_CONFLICT';end if;
  update kh_private.assisted_collaborators set kind=p_payload->>'kind',private_name=btrim(p_payload->>'privateName'),private_contact=btrim(p_payload->>'privateContact'),contact_channel=btrim(p_payload->>'contactChannel'),account_id=target,link_evidence_reference=case when target is not null then btrim(p_payload->>'linkEvidenceReference') end,link_confirmed_at=case when target is not null then clock_timestamp() end,link_confirmed_by=case when target is not null then a end,state=coalesce(p_payload->>'state','active'),version=version+1 where id=i;
 else
  if p_payload ? 'id' then raise exception 'KH_ASSISTED_NOT_FOUND';end if;
  insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel,account_id,link_evidence_reference,link_confirmed_at,link_confirmed_by) values(i,p_payload->>'kind',btrim(p_payload->>'privateName'),btrim(p_payload->>'privateContact'),btrim(p_payload->>'contactChannel'),target,case when target is not null then btrim(p_payload->>'linkEvidenceReference') end,case when target is not null then clock_timestamp() end,case when target is not null then a end);
 end if;
 select jsonb_build_object('id',id,'kind',kind,'privateName',private_name,'privateContact',private_contact,'contactChannel',contact_channel,'accountId',account_id,'linkEvidenceReference',link_evidence_reference,'version',version,'state',state) into outcome from kh_private.assisted_collaborators where id=i;
 insert into kh_private.assisted_write_receipts values(a,r,'collaborator',p_payload,outcome);return outcome;
end $$;
create function public.kh_admin_assisted_collaborators(p_actor_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.assisted_actor(p_actor_id,true);if p_offset<0 then raise exception 'KH_ASSISTED_INVALID';end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)-'n') filter(where n<=p_offset+50),'[]'),'hasMore',count(*)>50) from (select id,kind,private_name as "privateName",private_contact as "privateContact",contact_channel as "contactChannel",account_id as "accountId",link_evidence_reference as "linkEvidenceReference",version,state,row_number() over(order by created_at desc,id) n from kh_private.assisted_collaborators order by created_at desc,id offset p_offset limit 51) x);
end $$;

create function kh_private.validate_property_media(p_id uuid,p_owner uuid,p_request text,p_paths text[],p_thumb text,p_mode text,p_operation text) returns void language plpgsql security definer set search_path='' as $$
declare v_path text; asset kh_private.property_media_assets%rowtype;
begin
 if cardinality(p_paths)>6 or (p_mode<>'draft' and p_operation<>'wanted' and cardinality(p_paths)<1) or cardinality(p_paths)<>(select count(distinct x) from unnest(p_paths) x) then raise exception 'KH_INVALID_PHOTOS';end if;
 if p_thumb=any(p_paths) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
 for v_path in select x from unnest(p_paths||case when p_thumb is null then '{}'::text[] else array[p_thumb] end) x order by x loop
  if v_path is null or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$' or (v_path=p_thumb and v_path !~ '\.jpg$') then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
  select * into asset from kh_private.property_media_assets where property_media_assets.path=v_path;
  if found then
   if p_id is null or asset.property_id<>p_id or asset.state<>'attached' or not exists(select 1 from public.properties where id=p_id and owner_id=p_owner and client_request_id=p_request) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  elsif not starts_with(v_path,p_owner::text||'/'||p_request||'/') then raise exception 'KH_INVALID_PHOTO_PATH';end if;
  if not exists(select 1 from storage.objects where bucket_id='property-photos' and name=v_path) then raise exception 'KH_PHOTO_NOT_FOUND';end if;
 end loop;
end $$;
create function kh_private.bind_property_media() returns trigger language plpgsql security definer set search_path='' as $$
declare v_path text; active_paths text[];prop uuid;
begin
 prop:=case when tg_op='DELETE' then old.id else new.id end;
 if tg_op='INSERT' then insert into kh_private.property_publication_keys(origin_actor_id,client_request_id,property_id) values(new.owner_id,new.client_request_id,new.id);end if;
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
   if not exists(select 1 from kh_private.property_media_assets a where a.path=v_path) and not starts_with(v_path,new.owner_id::text||'/'||new.client_request_id||'/') then raise exception 'KH_INVALID_PHOTO_PATH';end if;
   insert into kh_private.property_media_assets(path,property_id,kind,uploader_id) values(v_path,prop,case when v_path=new.cover_thumb_path then 'cover_thumb' else 'photo' end,split_part(v_path,'/',1)::uuid) on conflict(path) do update set kind=excluded.kind;
  end loop;
 end if;
 return coalesce(new,old);
end $$;
create trigger kh_bind_property_media after insert or update or delete on public.properties for each row execute function kh_private.bind_property_media();
create or replace function kh_private.photo_delete_allowed(p_name text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or split_part(p_name,'/',1)<>auth.uid()::text then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||p_name,0));
 return not exists(select 1 from kh_private.property_media_assets where path=p_name) and not exists(select 1 from public.properties where p_name=any(photo_paths) or cover_thumb_path=p_name);
end $$;
-- Policies must not require exposing the private registry itself.
create function kh_private.media_unassigned(p_path text) returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from kh_private.property_media_assets where path=p_path) $$;
drop policy kh_photo_read on storage.objects;
create policy kh_photo_read on storage.objects for select to anon,authenticated using(bucket_id='property-photos' and (
 (select public.kh_is_admin()) or exists(select 1 from public.properties p where (p.moderation='approved' and p.availability='active' or p.owner_id=(select auth.uid())) and (objects.name=any(p.photo_paths) or objects.name=p.cover_thumb_path))
 or (split_part(name,'/',1)=(select auth.uid())::text and kh_private.media_unassigned(name))));
create policy kh_not_deleting_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id not in('property-photos','account-avatars') or not kh_private.is_deleting((select auth.uid())));
-- INSERT checks alone can observe a pre-deletion snapshot. Serialize before the
-- policy check so an in-flight upload completes before the deletion manifest.
create function kh_private.guard_media_account_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and new.bucket_id in('property-photos','account-avatars') then
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
 end if;return new;
end $$;
create trigger kh_media_account_write before insert on storage.objects for each row execute function kh_private.guard_media_account_write();
revoke all on function kh_private.guard_media_account_write() from public,anon,authenticated;

-- Consent cannot be bypassed by an older APK submitting an assisted draft directly.
create function kh_private.assisted_record_complete(r kh_private.assisted_listing_records) returns boolean language sql immutable set search_path='' as $$
 select coalesce(char_length(btrim(r.source_channel)) between 1 and 40 and char_length(btrim(r.consent_text)) between 20 and 2000 and char_length(btrim(r.consent_version)) between 1 and 100 and char_length(btrim(r.evidence_reference)) between 1 and 500 and r.received_at is not null and r.consent_at is not null and r.last_confirmed_at is not null,false);
$$;
revoke all on function kh_private.assisted_record_complete(kh_private.assisted_listing_records) from public,anon,authenticated;
create function kh_private.guard_assisted_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
 if new.moderation<>'draft' and exists(select 1 from kh_private.assisted_listing_records r join kh_private.assisted_collaborators c on c.id=r.collaborator_id where r.property_id=new.id and (not kh_private.assisted_record_complete(r) or new.availability='active' and (r.consent_revoked_at is not null or c.state<>'active'))) then raise exception 'KH_ASSISTED_CONSENT_REQUIRED';end if;
 return new;
end $$;
create trigger kh_assisted_consent_write before insert or update on public.properties for each row execute function kh_private.guard_assisted_consent();
create function kh_private.withdraw_assisted_collaborator() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='withdrawn' and old.state<>'withdrawn' then
  perform 1 from public.properties p join kh_private.assisted_listing_records r on r.property_id=p.id where r.collaborator_id=old.id order by p.id for update of p;
  update public.properties p set availability='paused',version=p.version+1 from kh_private.assisted_listing_records r where r.property_id=p.id and r.collaborator_id=old.id and p.availability='active';
 end if;return new;
end $$;
create trigger kh_collaborator_withdrawal before update on kh_private.assisted_collaborators for each row execute function kh_private.withdraw_assisted_collaborator();
revoke all on function kh_private.withdraw_assisted_collaborator() from public,anon,authenticated;

create function public.kh_save_assisted_property(p_actor_id uuid,p_listing_payload jsonb,p_provenance_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.assisted_actor(p_actor_id,true);c uuid:=(p_provenance_payload->>'collaboratorId')::uuid;r text:=p_listing_payload->>'clientRequestId';k text:=case when nullif(p_listing_payload->>'id','') is null then 'publication' else 'publication:'||(p_listing_payload->>'id')||':'||coalesce(p_listing_payload->>'expectedVersion','0') end;saved jsonb;receipt kh_private.assisted_write_receipts%rowtype;old kh_private.assisted_listing_records%rowtype;existing_id uuid;is_draft boolean:=p_listing_payload->>'moderation'='draft';field_name text;field_limit integer;full_proof boolean;
begin
 if coalesce(char_length(btrim(p_provenance_payload->>'collaboratorReference')),0) not between 1 and 100 then raise exception 'KH_ASSISTED_INVALID';end if;
 for field_name,field_limit in select * from (values('sourceChannel',40),('sourceReference',500),('consentText',2000),('consentVersion',100),('evidenceReference',500)) t loop
  if char_length(p_provenance_payload->>field_name)>field_limit then raise exception 'KH_ASSISTED_INVALID';end if;
 end loop;
 foreach field_name in array array['receivedAt','consentAt','lastConfirmedAt'] loop
  if nullif(p_provenance_payload->>field_name,'') is not null and (p_provenance_payload->>field_name)::timestamptz>clock_timestamp() then raise exception 'KH_ASSISTED_INVALID';end if;
 end loop;
 full_proof:=coalesce(char_length(btrim(p_provenance_payload->>'consentText')) between 20 and 2000 and char_length(btrim(p_provenance_payload->>'consentVersion')) between 1 and 100 and char_length(btrim(p_provenance_payload->>'evidenceReference')) between 1 and 500 and char_length(btrim(p_provenance_payload->>'sourceChannel')) between 1 and 40 and nullif(p_provenance_payload->>'receivedAt','') is not null and nullif(p_provenance_payload->>'consentAt','') is not null and nullif(p_provenance_payload->>'lastConfirmedAt','') is not null,false);
 if not is_draft and not full_proof then raise exception 'KH_ASSISTED_CONSENT_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:assisted:'||a::text||':'||r,0));
  select * into receipt from kh_private.assisted_write_receipts where actor_id=a and request_id=r and kind=k;
  if found then
   if receipt.payload<>jsonb_build_object('listing',p_listing_payload,'provenance',p_provenance_payload) then raise exception 'KH_ASSISTED_CONFLICT';end if;
   if not exists(select 1 from public.properties where id=(receipt.result->>'id')::uuid and owner_id=a) then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED';end if;
   return to_jsonb(p) from public.properties p where id=(receipt.result->>'id')::uuid;
  end if;
 perform 1 from kh_private.assisted_collaborators where id=c and state='active' for update;if not found then raise exception 'KH_ASSISTED_INVALID';end if;
 select property_id into existing_id from kh_private.assisted_listing_records where collaborator_id=c and collaborator_reference=btrim(p_provenance_payload->>'collaboratorReference');
 if existing_id is not null and existing_id is distinct from nullif(p_listing_payload->>'id','')::uuid then raise exception 'KH_ASSISTED_DUPLICATE_REFERENCE';end if;
 if p_listing_payload ? 'id' then
  perform 1 from public.properties where id=(p_listing_payload->>'id')::uuid and owner_id=a for update;if not found then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED';end if;
  select * into old from kh_private.assisted_listing_records where property_id=(p_listing_payload->>'id')::uuid for update;
  if found and (p_provenance_payload->>'expectedVersion')::integer is distinct from old.version then raise exception 'KH_VERSION_CONFLICT';end if;
  if old.consent_revoked_at is not null and not is_draft and (p_provenance_payload->>'consentAt')::timestamptz<=old.consent_revoked_at then raise exception 'KH_ASSISTED_CONSENT_REQUIRED';end if;
  -- Stage the new evidence under the property/provenance locks so its write guard sees
  -- the same authorization. Any property failure rolls back this private update.
  update kh_private.assisted_listing_records set source_channel=coalesce(p_provenance_payload->>'sourceChannel',''),received_at=nullif(p_provenance_payload->>'receivedAt','')::timestamptz,consent_text=p_provenance_payload->>'consentText',consent_version=p_provenance_payload->>'consentVersion',consent_at=nullif(p_provenance_payload->>'consentAt','')::timestamptz,evidence_reference=p_provenance_payload->>'evidenceReference',last_confirmed_at=nullif(p_provenance_payload->>'lastConfirmedAt','')::timestamptz,consent_revoked_at=case when full_proof and nullif(p_provenance_payload->>'consentAt','')::timestamptz>consent_revoked_at then null else consent_revoked_at end where property_id=old.property_id;
 end if;
 saved:=public.kh_save_property(p_listing_payload);
 insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,source_reference,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at,confirmed_price,confirmed_availability)
 values((saved->>'id')::uuid,c,btrim(p_provenance_payload->>'collaboratorReference'),coalesce(p_provenance_payload->>'sourceChannel',''),p_provenance_payload->>'sourceReference',nullif(p_provenance_payload->>'receivedAt','')::timestamptz,p_provenance_payload->>'consentText',p_provenance_payload->>'consentVersion',nullif(p_provenance_payload->>'consentAt','')::timestamptz,p_provenance_payload->>'evidenceReference',a,nullif(p_provenance_payload->>'lastConfirmedAt','')::timestamptz,(saved->>'price')::numeric,saved->>'availability')
 on conflict(property_id) do update set collaborator_id=excluded.collaborator_id,collaborator_reference=excluded.collaborator_reference,source_channel=excluded.source_channel,source_reference=excluded.source_reference,received_at=excluded.received_at,consent_text=excluded.consent_text,consent_version=excluded.consent_version,consent_at=excluded.consent_at,evidence_reference=excluded.evidence_reference,recorded_by=a,recorded_at=clock_timestamp(),last_confirmed_at=excluded.last_confirmed_at,confirmed_price=excluded.confirmed_price,confirmed_availability=excluded.confirmed_availability,version=kh_private.assisted_listing_records.version+1;
 insert into kh_private.assisted_write_receipts values(a,r,k,jsonb_build_object('listing',p_listing_payload,'provenance',p_provenance_payload),saved);
 return saved;
end $$;
create function public.kh_admin_list_assisted_listings(p_actor_id uuid,p_collaborator_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.assisted_actor(p_actor_id,true);if p_offset<0 then raise exception 'KH_ASSISTED_INVALID';end if;
 return(select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)-'n') filter(where n<=p_offset+50),'[]'),'hasMore',count(*)>50) from (select p.id,p.title,p.owner_id as "ownerId",p.version,r.version as "provenanceVersion",p.moderation,p.availability,r.collaborator_id as "collaboratorId",r.collaborator_reference as "collaboratorReference",r.last_confirmed_at as "lastConfirmedAt",(p.owner_id=p_actor_id and p.moderation='approved' and p.availability in('active','paused') and r.consent_revoked_at is null and kh_private.assisted_record_complete(r) and exists(select 1 from kh_private.assisted_collaborators c join auth.users u on u.id=c.account_id join public.profiles pr on pr.id=u.id where c.id=r.collaborator_id and c.state='active' and c.link_confirmed_at is not null and u.email_confirmed_at is not null and not kh_private.is_suspended(u.id) and not kh_private.is_deleting(u.id))) eligible,row_number() over(order by p.created_at desc,p.id) n from public.properties p join kh_private.assisted_listing_records r on r.property_id=p.id where r.collaborator_id=p_collaborator_id order by p.created_at desc,p.id offset p_offset limit 51) x);
end $$;
create function public.kh_get_listing_management(p_property_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('propertyId',p.id,'managerId',p.owner_id,'assistedByKarmaHouse',exists(select 1 from kh_private.assisted_listing_records r where r.property_id=p.id),'contactAvailable',p.moderation='approved' and p.availability='active') from public.properties p where p.id=p_property_id and (p.moderation='approved' and p.availability='active' or p.owner_id=auth.uid() or public.kh_is_admin());
$$;
create function public.kh_get_assisted_record(p_actor_id uuid,p_property_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform kh_private.assisted_actor(p_actor_id,true);
 return(select jsonb_build_object('collaboratorId',collaborator_id,'collaboratorReference',collaborator_reference,'sourceChannel',source_channel,'sourceReference',source_reference,'receivedAt',received_at,'consentText',consent_text,'consentVersion',consent_version,'consentAt',consent_at,'evidenceReference',evidence_reference,'lastConfirmedAt',last_confirmed_at,'confirmedPrice',confirmed_price,'confirmedAvailability',confirmed_availability,'expectedVersion',version,'revoked',consent_revoked_at is not null) from kh_private.assisted_listing_records where property_id=p_property_id);
end $$;
revoke all on function public.kh_get_assisted_record(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kh_get_assisted_record(uuid,uuid) to authenticated;

-- Auth deletion is blocked before any destructive work for the protected principal.
create or replace function public.kh_begin_account_deletion(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED';end if;
 if kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_PROTECTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||p_actor_id::text,0));
 insert into kh_private.account_deletions(user_id) values(p_actor_id) on conflict do nothing;
 return kh_private.begin_account_deletion(p_actor_id);
end $$;
create or replace function kh_private.begin_account_deletion(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.chat_actor(p_actor_id);
begin
 perform 1 from public.properties where owner_id=a order by id for update;
 delete from public.properties where owner_id=a;
 delete from kh_private.account_avatars where owner_id=a;
 return jsonb_build_object(
 'property-photos',coalesce((select jsonb_agg(o.name order by o.name) from storage.objects o where o.bucket_id='property-photos' and starts_with(o.name,a::text||'/') and kh_private.media_unassigned(o.name)),'[]'::jsonb),
 'account-avatars',coalesce((select jsonb_agg(name order by name) from storage.objects where bucket_id='account-avatars' and starts_with(name,a::text||'/')),'[]'::jsonb));
end $$;
create or replace function public.kh_delete_account(p_actor_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.chat_actor(p_actor_id);
begin
 if kh_private.is_owner(a) then raise exception 'KH_OWNER_PROTECTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||a::text,0));
 if not kh_private.is_deleting(a) or exists(select 1 from public.properties where owner_id=a) or exists(select 1 from storage.objects where starts_with(name,a::text||'/') and (bucket_id='account-avatars' or bucket_id='property-photos' and kh_private.media_unassigned(name))) then raise exception 'KH_ACCOUNT_FILES_REMAIN';end if;
 delete from auth.users where id=a;
end $$;
create function public.kh_pending_media_cleanup() returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('pending',count(*) filter(where state='pending'),'processing',count(*) filter(where state='processing'),'done',count(*) filter(where state='done')) from kh_private.media_cleanup_jobs $$;
create function public.kh_revoke_assisted_permission(p_actor_id uuid,p_property_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.assisted_actor(p_actor_id,true);c uuid;
begin
 select collaborator_id into c from kh_private.assisted_listing_records where property_id=p_property_id;
 perform 1 from kh_private.assisted_collaborators where id=c for update;
 perform 1 from public.properties where id=p_property_id for update;
 perform 1 from kh_private.assisted_listing_records where property_id=p_property_id and version=p_expected_version and consent_revoked_at is null for update;
 if not found then raise exception 'KH_VERSION_CONFLICT';end if;
 update kh_private.assisted_listing_records set consent_revoked_at=clock_timestamp(),version=version+1 where property_id=p_property_id;
 update public.properties set availability='paused',version=version+1 where id=p_property_id;
end $$;
revoke all on function public.kh_pending_media_cleanup(),public.kh_revoke_assisted_permission(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.kh_pending_media_cleanup() to service_role;
grant execute on function public.kh_revoke_assisted_permission(uuid,uuid,integer) to authenticated;
create function public.kh_claim_media_cleanup(p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare j kh_private.media_cleanup_jobs%rowtype;outcome jsonb:='[]';lease uuid;
begin
 for j in select * from kh_private.media_cleanup_jobs where (state='pending' and next_attempt_at<=clock_timestamp()) or (state='processing' and lease_until<clock_timestamp()) order by next_attempt_at,path limit least(greatest(p_limit,1),100) for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||j.path,0));
  if exists(select 1 from public.properties where j.path=any(photo_paths) or cover_thumb_path=j.path) then continue;end if;
  lease:=gen_random_uuid();update kh_private.property_media_assets set state='deleting' where path=j.path and state in('retired','deleting');
  update kh_private.media_cleanup_jobs set state='processing',attempts=attempts+1,lease_id=lease,lease_until=clock_timestamp()+interval '5 minutes' where path=j.path;
  outcome:=outcome||jsonb_build_array(jsonb_build_object('path',j.path,'leaseId',lease));
 end loop;return outcome;
end $$;
create function public.kh_finish_media_cleanup(p_path text,p_lease_id uuid,p_success boolean,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update kh_private.media_cleanup_jobs set state=case when p_success then 'done' else 'pending' end,next_attempt_at=clock_timestamp()+interval '1 minute',last_error=case when p_success then null else left(coalesce(p_error,'STORAGE_FAILED'),120) end,lease_id=null,lease_until=null where path=p_path and lease_id=p_lease_id and state='processing';
 if found and p_success then update kh_private.property_media_assets set state='deleted' where path=p_path;end if;
end $$;
revoke all on function kh_private.is_official(uuid),kh_private.is_deleting(uuid),kh_private.assisted_actor(uuid,boolean),kh_private.require_recipient(uuid),kh_private.validate_property_media(uuid,uuid,text,text[],text,text,text),kh_private.bind_property_media(),kh_private.guard_assisted_consent(),kh_private.media_unassigned(text) from public,anon,authenticated;
grant execute on function kh_private.is_deleting(uuid),kh_private.media_unassigned(text) to authenticated;
grant execute on function kh_private.media_unassigned(text) to anon;
revoke all on function public.kh_assisted_capabilities(uuid),public.kh_admin_save_assisted_collaborator(uuid,jsonb),public.kh_admin_assisted_collaborators(uuid,integer),public.kh_save_assisted_property(uuid,jsonb,jsonb),public.kh_admin_list_assisted_listings(uuid,uuid,integer),public.kh_get_listing_management(uuid),public.kh_claim_media_cleanup(integer),public.kh_finish_media_cleanup(text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.kh_assisted_capabilities(uuid),public.kh_admin_save_assisted_collaborator(uuid,jsonb),public.kh_admin_assisted_collaborators(uuid,integer),public.kh_save_assisted_property(uuid,jsonb,jsonb),public.kh_admin_list_assisted_listings(uuid,uuid,integer) to authenticated;
grant execute on function public.kh_get_listing_management(uuid) to anon,authenticated;
grant execute on function public.kh_claim_media_cleanup(integer),public.kh_finish_media_cleanup(text,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';

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
    if v_existing.moderation<>'draft' then v_mode := 'pending'; end if;
  end if;
  perform kh_private.validate_property_media(coalesce(v_id,v_existing.id),v_user,v_request,v_photos,v_thumb,v_mode,v_operation);
  if v_id is null then
    insert into public.properties(owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,latitude,longitude,location_precision,condition,floor,price_negotiable,operation,swap_wants,swap_provinces,swap_balance,swap_amount,rent_period,rent_min_stay,wanted_operations,cover_thumb_path)
    values(v_user,v_request,v_canonical->>'title',v_canonical->>'location',v_canonical->>'province',v_type,v_canonical->>'description',v_price,v_area,v_bedrooms::integer,v_bathrooms::integer,v_amenities,v_photos,v_mode,
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
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.


create or replace function public.kh_submit_property(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.moderation in ('pending','approved') then return; end if;
  perform kh_private.validate_property_media(v_property.id,v_property.owner_id,v_property.client_request_id,v_property.photo_paths,v_property.cover_thumb_path,'pending',v_property.operation);
  update public.properties set moderation='pending',review_note=null,updated_at=now(),version=version+1 where id=p_id;
end;
$$;


create or replace function public.kh_review_property(p_id uuid, p_decision text, p_note text, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype; v_note text := nullif(btrim(p_note), '');
begin
  if auth.uid() is null or not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'KH_INVALID_DECISION'; end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) > 1000) then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
  select * into v_property from public.properties where id = p_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.owner_id = auth.uid() then raise exception 'KH_CANNOT_REVIEW_OWN_PROPERTY'; end if;
  if p_expected_version is null or v_property.version <> p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_property.moderation <> 'pending' then raise exception 'KH_NOT_PENDING'; end if;
  if p_decision = 'approved' then
    perform kh_private.validate_property_media(v_property.id,v_property.owner_id,v_property.client_request_id,v_property.photo_paths,v_property.cover_thumb_path,'pending',v_property.operation);
    v_note := null;
  end if;
  update public.properties set moderation = p_decision, review_note = v_note, updated_at = now(), version = version + 1 where id = p_id returning * into v_property;
  -- ponytail: every saved search and wanted ad is evaluated on each approval; add a cap or a
  -- queue if one approval starts producing hundreds of alerts.
  if p_decision = 'approved' and v_property.availability = 'active' then perform kh_private.alert_on_approval(v_property); end if;
end $$;
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.

notify pgrst, 'reload schema';
