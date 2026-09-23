-- Google Play requires two things this schema lacked: reporting a listing, and deleting an
-- account from inside the app. Both are additive; nothing existing changes shape.

create table public.kh_property_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  property_title text not null,
  reporter_id uuid not null,
  owner_id uuid not null,
  client_report_id uuid not null,
  reason text not null check(reason in ('fraud','misleading','unavailable','inappropriate','other')),
  details text not null default '' check(char_length(details)<=1000),
  status text not null default 'open' check(status in ('open','reviewed')),
  unpublished boolean not null default false,
  review_note text check(review_note is null or char_length(review_note)<=1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reporter_id,client_report_id)
);
-- Like chat reports, evidence has no cascading FK: it outlives the listing and both accounts.
create index kh_property_reports_queue on public.kh_property_reports(status,created_at desc,id);
create index kh_property_reports_rate on public.kh_property_reports(reporter_id,created_at desc);
create index kh_property_reports_property on public.kh_property_reports(property_id) where status='open';
alter table public.kh_property_reports enable row level security;
revoke all on public.kh_property_reports from public,anon,authenticated;
grant all on public.kh_property_reports to service_role;

create function public.kh_report_property(p_property_id uuid,p_client_report_id uuid,p_reason text,p_details text,p_actor_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_property public.properties%rowtype;
  v_existing public.kh_property_reports%rowtype; v_details text:=btrim(coalesce(p_details,'')); v_id uuid;
begin
  if p_property_id is null or p_client_report_id is null or p_reason is null
    or p_reason not in ('fraud','misleading','unavailable','inappropriate','other') or char_length(v_details)>1000 then
    raise exception 'KH_REPORT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:report:actor:'||v_actor::text,0));
  -- A retry is answered before the visibility check: the listing may have been withdrawn meanwhile.
  select * into v_existing from public.kh_property_reports where reporter_id=v_actor and client_report_id=p_client_report_id;
  if found then
    if v_existing.property_id<>p_property_id or v_existing.reason<>p_reason or v_existing.details<>v_details then raise exception 'KH_REPORT_CONFLICT'; end if;
    return v_existing.id;
  end if;
  select * into v_property from public.properties where id=p_property_id and moderation='approved' and availability='active';
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.owner_id=v_actor then raise exception 'KH_REPORT_OWN_PROPERTY'; end if;
  if (select count(*) from public.kh_property_reports where reporter_id=v_actor and created_at>=clock_timestamp()-interval '24 hours')>=10 then
    raise exception 'KH_REPORT_LIMIT';
  end if;
  insert into public.kh_property_reports(property_id,property_title,reporter_id,owner_id,client_report_id,reason,details)
    values(p_property_id,v_property.title,v_actor,v_property.owner_id,p_client_report_id,p_reason,v_details)
    returning id into v_id;
  return v_id;
end $$;

create function public.kh_list_property_reports(p_actor_id uuid,p_status text default 'open',p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('open','reviewed') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'KH_REPORT_INVALID_PAGE';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'propertyId',r.property_id,'propertyTitle',r.property_title,'reporterId',r.reporter_id,'ownerId',r.owner_id,
    'reason',r.reason,'details',r.details,'status',r.status,'unpublished',r.unpublished,'reviewNote',r.review_note,'createdAt',r.created_at,
    'propertyLive',exists(select 1 from public.properties p where p.id=r.property_id and p.moderation='approved' and p.availability='active')
  ) order by r.created_at desc,r.id desc),'[]'::jsonb) into v_result
  from (select * from public.kh_property_reports where status=p_status order by created_at desc,id desc offset p_offset limit p_limit) r;
  return v_result;
end $$;

create function public.kh_review_property_report(p_report_id uuid,p_note text,p_unpublish boolean,p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_report public.kh_property_reports%rowtype; v_note text:=btrim(coalesce(p_note,''));
begin
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_unpublish is null or char_length(v_note)>1000 then raise exception 'KH_REPORT_INVALID'; end if;
  select * into v_report from public.kh_property_reports where id=p_report_id for update;
  if not found then raise exception 'KH_REPORT_NOT_FOUND'; end if;
  if v_actor in (v_report.reporter_id,v_report.owner_id) then raise exception 'KH_CANNOT_REVIEW_OWN_REPORT'; end if;
  if v_report.status='reviewed' then
    if v_report.review_note is not distinct from v_note and v_report.unpublished=p_unpublish then return; end if;
    raise exception 'KH_REPORT_ALREADY_REVIEWED';
  end if;
  if p_unpublish then
    -- The owner reads this note as the reason, exactly as after a rejected review, and can fix and resubmit.
    if v_note='' then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
    update public.properties set moderation='rejected',review_note=v_note,updated_at=now(),version=version+1
      where id=v_report.property_id and moderation='approved';
    -- One decision settles every open report about the same listing.
    update public.kh_property_reports set status='reviewed',unpublished=true,review_note=v_note,reviewed_by=v_actor,reviewed_at=clock_timestamp()
      where property_id=v_report.property_id and status='open';
  else
    update public.kh_property_reports set status='reviewed',review_note=v_note,reviewed_by=v_actor,reviewed_at=clock_timestamp() where id=p_report_id;
  end if;
end $$;

-- Account deletion runs in two calls because storage.objects refuses SQL deletes: the first removes
-- the listings and avatar reference so the owner's storage policies allow deleting those files
-- through the Storage API, and returns their names; the second deletes the account once they are gone.
create function public.kh_begin_account_deletion(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  delete from public.properties where owner_id=v_actor;
  delete from kh_private.account_avatars where owner_id=v_actor;
  return jsonb_build_object(
    'property-photos',coalesce((select jsonb_agg(name order by name) from storage.objects where bucket_id='property-photos' and name like v_actor::text||'/%'),'[]'::jsonb),
    'account-avatars',coalesce((select jsonb_agg(name order by name) from storage.objects where bucket_id='account-avatars' and name like v_actor::text||'/%'),'[]'::jsonb)
  );
end $$;

create function public.kh_delete_account(p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  if exists(select 1 from public.properties where owner_id=v_actor)
    or exists(select 1 from storage.objects where bucket_id in ('property-photos','account-avatars') and name like v_actor::text||'/%') then
    raise exception 'KH_ACCOUNT_FILES_REMAIN';
  end if;
  -- Cascades remove the profile, favourites, conversations, messages, negotiations, notifications and
  -- push registrations. Report evidence is not keyed to the account and stays for moderation.
  delete from auth.users where id=v_actor;
end $$;

revoke all on function public.kh_report_property(uuid,uuid,text,text,uuid),public.kh_list_property_reports(uuid,text,integer,integer),
  public.kh_review_property_report(uuid,text,boolean,uuid),public.kh_begin_account_deletion(uuid),public.kh_delete_account(uuid) from public,anon,authenticated;
grant execute on function public.kh_report_property(uuid,uuid,text,text,uuid),public.kh_list_property_reports(uuid,text,integer,integer),
  public.kh_review_property_report(uuid,text,boolean,uuid),public.kh_begin_account_deletion(uuid),public.kh_delete_account(uuid) to authenticated;
notify pgrst, 'reload schema';
