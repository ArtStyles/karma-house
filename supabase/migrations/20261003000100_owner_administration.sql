-- Account authority is private and bound to Auth UUIDs, never to client metadata.
create table kh_private.platform_owner (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
create table kh_private.account_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check(char_length(reason) between 3 and 1000),
  suspended_by uuid not null, suspended_at timestamptz not null default now()
);
create table kh_private.suspended_properties (
  property_id uuid primary key references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  paused_version integer not null
);
create table kh_private.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid, actor_name text not null, action text not null,
  target_id uuid not null, target_name text not null, reason text,
  created_at timestamptz not null default clock_timestamp()
);
alter table kh_private.platform_owner enable row level security;
alter table kh_private.account_suspensions enable row level security;
alter table kh_private.suspended_properties enable row level security;
alter table kh_private.admin_audit enable row level security;
revoke all on kh_private.platform_owner,kh_private.account_suspensions,kh_private.suspended_properties,kh_private.admin_audit from public,anon,authenticated;
grant all on kh_private.platform_owner,kh_private.account_suspensions,kh_private.suspended_properties,kh_private.admin_audit to service_role;

create function kh_private.is_owner(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from kh_private.platform_owner where user_id=p_user);
$$;
create function kh_private.is_suspended(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from kh_private.account_suspensions where user_id=p_user);
$$;
create or replace function public.kh_is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select not kh_private.is_suspended(auth.uid()) and (kh_private.is_owner(auth.uid()) or exists(select 1 from public.kh_admins where user_id=auth.uid()));
$$;
create function public.kh_account_access() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role',case when kh_private.is_owner(auth.uid()) then 'owner' when public.kh_is_admin() then 'admin' else 'member' end,
    'suspended',kh_private.is_suspended(auth.uid()),'reason',(select reason from kh_private.account_suspensions where user_id=auth.uid()));
$$;
create function kh_private.require_active() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  -- Serializes a write with suspension; owner cannot be suspended.
  if not kh_private.is_owner(auth.uid()) then
    perform pg_advisory_xact_lock(hashtextextended('kh:account:'||auth.uid()::text,0));
    if kh_private.is_suspended(auth.uid()) then raise exception 'KH_ACCOUNT_SUSPENDED' using errcode='42501'; end if;
  end if;
end $$;
create function kh_private.admin_actor(p_actor uuid, p_owner_only boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
  perform kh_private.require_active();
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_owner_only and not kh_private.is_owner(p_actor) then raise exception 'KH_OWNER_REQUIRED' using errcode='42501'; end if;
  return p_actor;
end $$;
create function kh_private.audit_action(p_action text,p_target uuid,p_name text,p_reason text default null) returns void language sql security definer set search_path='' as $$
  insert into kh_private.admin_audit(actor_id,actor_name,action,target_id,target_name,reason)
  values(auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Sistema'),p_action,p_target,p_name,p_reason);
$$;

-- Guards run even through old APKs and security-definer RPCs. Drafts stay drafts;
-- photo validation and the save receipt are still owned by kh_save_property.
create function kh_private.guard_account_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then perform kh_private.require_active(); end if;
  if tg_table_name='properties' then
    if new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='pending' then
      new.moderation:='approved'; new.review_note:=null;
    end if;
  end if;
  return new;
end $$;
create trigger kh_account_property_write before insert or update on public.properties for each row execute function kh_private.guard_account_write();
create trigger kh_account_message_write before insert or update on public.kh_messages for each row execute function kh_private.guard_account_write();
create trigger kh_account_conversation_write before insert or update on public.kh_conversations for each row execute function kh_private.guard_account_write();
create trigger kh_account_negotiation_write before insert or update on public.kh_negotiations for each row execute function kh_private.guard_account_write();
create trigger kh_account_profile_write before update on public.profiles for each row execute function kh_private.guard_account_write();
-- Restrictive policies compose with existing storage ownership/format policies.
create policy kh_active_upload on storage.objects as restrictive for insert to authenticated
  with check(bucket_id not in ('account-avatars','property-photos') or not kh_private.is_suspended((select auth.uid())));
create policy kh_active_storage_update on storage.objects as restrictive for update to authenticated
  using(bucket_id not in ('account-avatars','property-photos') or not kh_private.is_suspended((select auth.uid())))
  with check(bucket_id not in ('account-avatars','property-photos') or not kh_private.is_suspended((select auth.uid())));

create function kh_private.audit_property_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if public.kh_is_admin() and (tg_op='INSERT' or new.moderation is distinct from old.moderation or new.availability is distinct from old.availability) then
    perform kh_private.audit_action('property_'||new.moderation||'_'||new.availability,new.id,new.title,new.review_note);
  end if;
  return new;
end $$;
create trigger kh_admin_property_audit after insert or update on public.properties for each row execute function kh_private.audit_property_change();

create function kh_private.owner_publication_alerts() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='approved' and new.availability='active' then
    perform kh_private.alert_on_approval(new);
  end if;
  return new;
end $$;
create trigger kh_owner_publication_alerts after insert or update on public.properties for each row execute function kh_private.owner_publication_alerts();
revoke all on function kh_private.owner_publication_alerts() from public,anon,authenticated;

create function kh_private.audit_report_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='reviewed' and old.status is distinct from new.status then
    perform kh_private.audit_action('report_reviewed',new.id,new.property_title,new.review_note);
  end if;
  return new;
end $$;
create trigger kh_admin_message_report_audit after update on public.kh_message_reports for each row execute function kh_private.audit_report_change();
create trigger kh_admin_property_report_audit after update on public.kh_property_reports for each row execute function kh_private.audit_report_change();
revoke all on function kh_private.audit_report_change() from public,anon,authenticated;

create or replace function public.kh_set_user_verified(p_actor_id uuid,p_user_id uuid,p_verified boolean,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.admin_actor(p_actor_id); v_note text:=nullif(btrim(p_note),''); v_name text;
begin
  if p_user_id is null or p_verified is null or char_length(v_note)>500 then raise exception 'KH_VERIFY_INVALID'; end if;
  if p_user_id=v_actor then raise exception 'KH_CANNOT_VERIFY_SELF'; end if;
  select display_name into v_name from public.profiles where id=p_user_id;
  if not found then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  if p_verified then
    insert into kh_private.verified_users(user_id,verified_by,note) values(p_user_id,v_actor,v_note)
    on conflict(user_id) do update set verified_by=excluded.verified_by,verified_at=clock_timestamp(),note=excluded.note;
  else delete from kh_private.verified_users where user_id=p_user_id;
  end if;
  perform kh_private.audit_action(case when p_verified then 'verify' else 'unverify' end,p_user_id,v_name,v_note);
  return public.kh_public_profile(p_user_id);
end $$;

-- Block before the first destructive step, not only at the final Auth FK.
alter function public.kh_begin_account_deletion(uuid) set schema kh_private;
alter function kh_private.kh_begin_account_deletion(uuid) rename to begin_account_deletion;
revoke all on function kh_private.begin_account_deletion(uuid) from public,anon,authenticated;
create function public.kh_begin_account_deletion(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is distinct from p_actor_id or auth.uid() is null then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
  if kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_PROTECTED'; end if;
  return kh_private.begin_account_deletion(p_actor_id);
end $$;
revoke all on function public.kh_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.kh_begin_account_deletion(uuid) to authenticated;

create function public.kh_admin_accounts(p_actor_id uuid,p_query text default '',p_status text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform kh_private.admin_actor(p_actor_id);
  if p_status is null or p_status not in ('all','active','suspended') or p_offset is null or p_offset<0 or p_offset>100000 or char_length(p_query)>80 then raise exception 'KH_ADMIN_INVALID'; end if;
  return (select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb),'hasMore',count(*)>50) from (
    select p.id,p.display_name as "displayName",case when kh_private.is_owner(p.id) then 'owner' when a.user_id is not null then 'admin' else 'member' end as role,
      s.user_id is not null as suspended,s.reason from public.profiles p
    left join public.kh_admins a on a.user_id=p.id left join kh_private.account_suspensions s on s.user_id=p.id
    where strpos(lower(p.display_name),lower(coalesce(btrim(p_query),'')))>0
      and (p_status='all' or (p_status='suspended')=(s.user_id is not null))
    order by p.display_name,p.id offset p_offset limit 51
  ) t);
end $$;

create function public.kh_admin_account_action(p_actor_id uuid,p_user_id uuid,p_action text,p_reason text,p_expected_role text,p_expected_suspended boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_name text; v_role text; v_suspended boolean; v_reason text:=btrim(coalesce(p_reason,''));
begin
  perform kh_private.admin_actor(p_actor_id,true);
  if p_user_id is null or p_action is null or p_action not in ('suspend','reactivate','grant_admin','revoke_admin') or char_length(v_reason) not between 3 and 1000 then raise exception 'KH_ADMIN_INVALID'; end if;
  if kh_private.is_owner(p_user_id) or p_user_id=p_actor_id then raise exception 'KH_OWNER_PROTECTED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:account:'||p_user_id::text,0));
  select display_name into v_name from public.profiles where id=p_user_id for update;
  if not found then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  v_role:=case when exists(select 1 from public.kh_admins where user_id=p_user_id) then 'admin' else 'member' end;
  v_suspended:=kh_private.is_suspended(p_user_id);
  if v_role is distinct from p_expected_role or v_suspended is distinct from p_expected_suspended then raise exception 'KH_ADMIN_STATE_CHANGED'; end if;
  if p_action='suspend' then
    if v_suspended then return; end if;
    insert into kh_private.account_suspensions(user_id,reason,suspended_by) values(p_user_id,v_reason,p_actor_id);
    insert into kh_private.suspended_properties(property_id,user_id,paused_version)
      select id,p_user_id,version+1 from public.properties where owner_id=p_user_id and availability='active' for update;
    update public.properties set availability='paused',version=version+1,updated_at=now() where owner_id=p_user_id and availability='active';
  elsif p_action='reactivate' then
    if not v_suspended then return; end if;
    delete from kh_private.account_suspensions where user_id=p_user_id;
    update public.properties p set availability='active',version=version+1,updated_at=now()
      from kh_private.suspended_properties s where s.user_id=p_user_id and s.property_id=p.id and p.version=s.paused_version and p.availability='paused';
    delete from kh_private.suspended_properties where user_id=p_user_id;
  elsif p_action='grant_admin' then
    if v_suspended then raise exception 'KH_ACCOUNT_SUSPENDED'; end if;
    insert into public.kh_admins(user_id) values(p_user_id) on conflict do nothing;
  else delete from public.kh_admins where user_id=p_user_id;
  end if;
  perform kh_private.audit_action(p_action,p_user_id,v_name,v_reason);
end $$;

create function public.kh_admin_listings(p_actor_id uuid,p_query text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform kh_private.admin_actor(p_actor_id);
  if p_offset is null or p_offset<0 or p_offset>100000 or char_length(p_query)>100 then raise exception 'KH_ADMIN_INVALID'; end if;
  return (select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb),'hasMore',count(*)>50) from (
    select p.id,p.title,p.owner_id as "ownerId",u.display_name as "ownerName",p.moderation,p.availability,p.version
    from public.properties p join public.profiles u on u.id=p.owner_id
    where strpos(lower(p.title),lower(coalesce(btrim(p_query),'')))>0
    order by p.created_at desc,p.id offset p_offset limit 51) t);
end $$;
create function public.kh_admin_unpublish(p_actor_id uuid,p_property_id uuid,p_expected_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_row public.properties%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  perform kh_private.admin_actor(p_actor_id);
  if char_length(v_reason) not between 3 and 1000 then raise exception 'KH_ADMIN_INVALID'; end if;
  select * into v_row from public.properties where id=p_property_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_row.version is distinct from p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_row.moderation<>'approved' then raise exception 'KH_ADMIN_STATE_CHANGED'; end if;
  update public.properties set moderation='rejected',review_note=v_reason,updated_at=now(),version=version+1 where id=p_property_id;
end $$;
create function public.kh_admin_history(p_actor_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform kh_private.admin_actor(p_actor_id);
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_ADMIN_INVALID'; end if;
  return (select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb),'hasMore',count(*)>50) from (
    select id::text,actor_name as "actorName",action,target_name as "targetName",reason,created_at as "createdAt"
    from kh_private.admin_audit order by id desc offset p_offset limit 51) t);
end $$;

-- The owner has an identity-only public profile, even for another administrator.
-- Keep the rich profile implementation private for ordinary profiles.
alter function public.kh_public_profile(uuid) set schema kh_private;
alter function kh_private.kh_public_profile(uuid) rename to full_public_profile;
revoke all on function kh_private.full_public_profile(uuid) from public,anon,authenticated;
create function public.kh_public_profile(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if kh_private.is_owner(p_user_id) then
    return (select jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarUrlPath',a.avatar_path,'identityOnly',true)
      from public.profiles p left join kh_private.account_avatars a on a.owner_id=p.id where p.id=p_user_id);
  end if;
  return kh_private.full_public_profile(p_user_id);
end $$;
-- Public direct table reads only contain identity, not private account dates.
revoke select on public.profiles from anon,authenticated;
grant select(id,display_name) on public.profiles to anon,authenticated;
create function kh_private.owner_avatar_is_public(p_name text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from kh_private.account_avatars a join kh_private.platform_owner o on o.user_id=a.owner_id where a.avatar_path=p_name);
$$;
revoke all on function kh_private.owner_avatar_is_public(text) from public,anon,authenticated;
grant execute on function kh_private.owner_avatar_is_public(text) to anon,authenticated;
create policy kh_owner_avatar_read on storage.objects for select to anon,authenticated using (
  bucket_id='account-avatars' and kh_private.owner_avatar_is_public(name)
);

revoke all on function kh_private.is_owner(uuid),kh_private.is_suspended(uuid),kh_private.require_active(),kh_private.admin_actor(uuid,boolean),kh_private.audit_action(text,uuid,text,text),kh_private.guard_account_write(),kh_private.audit_property_change() from public,anon,authenticated;
grant execute on function kh_private.is_suspended(uuid) to authenticated;
revoke all on function public.kh_account_access(),public.kh_admin_accounts(uuid,text,text,integer),public.kh_admin_account_action(uuid,uuid,text,text,text,boolean),public.kh_admin_listings(uuid,text,integer),public.kh_admin_unpublish(uuid,uuid,integer,text),public.kh_admin_history(uuid,integer),public.kh_public_profile(uuid) from public,anon,authenticated;
grant execute on function public.kh_account_access(),public.kh_admin_accounts(uuid,text,text,integer),public.kh_admin_account_action(uuid,uuid,text,text,text,boolean),public.kh_admin_listings(uuid,text,integer),public.kh_admin_unpublish(uuid,uuid,integer,text),public.kh_admin_history(uuid,integer) to authenticated;
grant execute on function public.kh_public_profile(uuid) to anon,authenticated;
notify pgrst,'reload schema';
