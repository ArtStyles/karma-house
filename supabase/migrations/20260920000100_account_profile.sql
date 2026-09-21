-- Private avatar reference. Public profiles keep their existing display-name contract.
create table kh_private.account_avatars (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  avatar_path text not null,
  updated_at timestamptz not null default now(),
  constraint kh_avatar_owned_path check (avatar_path ~ ('^' || owner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'))
);
alter table kh_private.account_avatars enable row level security;
revoke all on kh_private.account_avatars from public, anon, authenticated;
grant all on kh_private.account_avatars to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('account-avatars','account-avatars',false,1048576,array['image/jpeg']);

create function kh_private.avatar_delete_allowed(p_path text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$') then return false; end if;
  -- Share the actor lock with attachment so a concurrent delete cannot leave a dangling reference.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('karmahouse:avatar:' || auth.uid()::text,0));
  return not exists (select 1 from kh_private.account_avatars where avatar_path=p_path);
end;
$$;
revoke all on function kh_private.avatar_delete_allowed(text) from public, anon, authenticated;
grant execute on function kh_private.avatar_delete_allowed(text) to authenticated;

create policy kh_avatar_read on storage.objects for select to authenticated using (
  bucket_id='account-avatars' and (select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy kh_avatar_insert on storage.objects for insert to authenticated with check (
  bucket_id='account-avatars' and (select auth.uid()) is not null
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$')
);
create policy kh_avatar_delete on storage.objects for delete to authenticated using (
  bucket_id='account-avatars' and kh_private.avatar_delete_allowed(name)
);

create function public.kh_get_account_profile(p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or p_actor_id is distinct from auth.uid() then raise exception 'KH_ACCOUNT_CHANGED'; end if;
  select jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarPath',a.avatar_path) into v_result
    from public.profiles p left join kh_private.account_avatars a on a.owner_id=p.id where p.id=p_actor_id;
  if v_result is null then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create function public.kh_update_account_profile(p_actor_id uuid,p_display_name text,p_avatar_path text default null,p_replace_avatar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text:=btrim(p_display_name);
begin
  if auth.uid() is null or p_actor_id is distinct from auth.uid() then raise exception 'KH_ACCOUNT_CHANGED'; end if;
  if v_name is null or char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]' then raise exception 'KH_PROFILE_NAME'; end if;
  if p_replace_avatar is null then raise exception 'KH_PROFILE_AVATAR'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('karmahouse:avatar:' || p_actor_id::text,0));
  perform 1 from public.profiles where id=p_actor_id for update;
  if not found then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  if p_replace_avatar then
    if p_avatar_path is null then delete from kh_private.account_avatars where owner_id=p_actor_id;
    else
      if p_avatar_path !~ ('^' || p_actor_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$')
        or not exists(select 1 from storage.objects where bucket_id='account-avatars' and name=p_avatar_path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 4 and 1048576)
      then raise exception 'KH_PROFILE_AVATAR'; end if;
      insert into kh_private.account_avatars(owner_id,avatar_path) values(p_actor_id,p_avatar_path)
        on conflict(owner_id) do update set avatar_path=excluded.avatar_path,updated_at=now();
    end if;
  elsif p_avatar_path is not null then raise exception 'KH_PROFILE_AVATAR';
  end if;
  update public.profiles set display_name=v_name where id=p_actor_id;
  return public.kh_get_account_profile(p_actor_id);
end;
$$;
revoke all on function public.kh_get_account_profile(uuid),public.kh_update_account_profile(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.kh_get_account_profile(uuid),public.kh_update_account_profile(uuid,text,text,boolean) to authenticated;

-- Name changes use the actor-pinned RPC. Read permissions and administrator membership stay unchanged.
revoke insert(id,display_name),update(display_name) on public.profiles from authenticated;
