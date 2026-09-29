-- Public profile with trust signals. Everything is computed here from data that already exists
-- (listings, conversations, visits, confirmed reports) plus a manual verification by an administrator.
-- The answer never carries an email, a phone or another person's id.

create table kh_private.verified_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  verified_by uuid not null,
  verified_at timestamptz not null default clock_timestamp(),
  note text check (note is null or char_length(note) <= 500)
);
alter table kh_private.verified_users enable row level security;
revoke all on kh_private.verified_users from public, anon, authenticated;

-- Conversations where the person sells and the buyer wrote first. Received counts only those older
-- than 24 hours (from the buyer's first message) or already answered, so a fresh message is no penalty.
create function kh_private.profile_response_stats(p_user uuid)
returns table (answered integer, received integer, median_minutes integer)
language sql stable set search_path = '' as $$
  with asked as (
    select c.id, first_message.created_at as asked_at
    from public.kh_conversations c
    cross join lateral (select m.sender_id, m.created_at from public.kh_messages m
      where m.conversation_id = c.id order by m.seq limit 1) first_message
    where c.seller_id = p_user and first_message.sender_id = c.buyer_id
  ), replied as (
    select a.asked_at, (select min(m.created_at) from public.kh_messages m
      where m.conversation_id = a.id and m.sender_id = p_user) as replied_at
    from asked a
  )
  select count(replied_at)::integer,
    (count(*) filter (where replied_at is not null or asked_at <= now() - interval '24 hours'))::integer,
    round(percentile_cont(0.5) within group (order by extract(epoch from replied_at - asked_at) / 60))::integer
  from replied;
$$;

create function kh_private.profile_visits_agreed(p_user uuid) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer from public.kh_negotiations n
  join public.kh_conversations c on c.id = n.conversation_id
  where n.kind = 'visit' and n.status = 'accepted' and p_user in (c.buyer_id, c.seller_id);
$$;

-- One unpublish decision settles every open report about the listing, so a confirmed report is
-- counted once per listing. A null interval counts all time.
create function kh_private.profile_confirmed_reports(p_user uuid, p_within interval) returns integer
language sql stable set search_path = '' as $$
  select count(distinct r.property_id)::integer from public.kh_property_reports r
  where r.owner_id = p_user and r.unpublished
    and (p_within is null or r.reviewed_at >= now() - p_within);
$$;

create function kh_private.karma_level(p_months integer, p_approved integer, p_answered integer, p_visits integer,
  p_verified boolean, p_reports integer, p_recent_report boolean) returns text
language sql immutable set search_path = '' as $$
  select case when p_recent_report and points >= 25 then 'active'
    when points >= 45 then 'featured' when points >= 25 then 'trusted' when points >= 10 then 'active' else 'new' end
  from (select least(p_months, 12) + least(3 * p_approved, 15) + least(p_answered, 20) + least(2 * p_visits, 20)
    + case when p_verified then 10 else 0 end - 15 * p_reports as points) x;
$$;

create function kh_private.profile_visible(p_user uuid, p_viewer uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user) and (
    exists (select 1 from public.properties p where p.owner_id = p_user and p.moderation = 'approved' and p.availability = 'active')
    or (p_viewer is not null and p_viewer = p_user)
    or exists (select 1 from public.kh_admins a where a.user_id = p_viewer)
    or exists (select 1 from public.kh_conversations c
      where (c.buyer_id = p_viewer and c.seller_id = p_user) or (c.buyer_id = p_user and c.seller_id = p_viewer)));
$$;

-- Storage policies run as the caller, so this one is security definer and callable by anon.
create function kh_private.avatar_is_public(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from kh_private.account_avatars a where a.avatar_path = p_name
    and exists (select 1 from public.properties p where p.owner_id = a.owner_id and p.moderation = 'approved' and p.availability = 'active'));
$$;

revoke all on function kh_private.profile_response_stats(uuid), kh_private.profile_visits_agreed(uuid),
  kh_private.profile_confirmed_reports(uuid, interval), kh_private.karma_level(integer, integer, integer, integer, boolean, integer, boolean),
  kh_private.profile_visible(uuid, uuid), kh_private.avatar_is_public(text) from public, anon, authenticated;
grant execute on function kh_private.avatar_is_public(text) to anon, authenticated;

create policy kh_avatar_public_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'account-avatars' and kh_private.avatar_is_public(name)
);

-- ponytail: every figure is computed on each call; materialize them if a person reaches thousands of conversations.
create function public.kh_public_profile(p_user_id uuid) returns jsonb
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
  select count(*) filter (where moderation = 'approved'), count(*) filter (where moderation = 'approved' and availability = 'active')
    into v_approved, v_active from public.properties where owner_id = p_user_id;
  select coalesce(jsonb_agg(id order by created_at desc, id desc), '[]'::jsonb) into v_ids from (
    select id, created_at from public.properties where owner_id = p_user_id and moderation = 'approved' and availability = 'active'
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
    v_reasons := array_append(v_reasons, (v_approved || case when v_approved = 1 then ' anuncio aprobado' else ' anuncios aprobados' end));
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

create function public.kh_set_user_verified(p_actor_id uuid, p_user_id uuid, p_verified boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_note text := nullif(btrim(p_note), '');
begin
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_user_id is null or p_verified is null or char_length(v_note) > 500 then raise exception 'KH_VERIFY_INVALID'; end if;
  if p_user_id = v_actor then raise exception 'KH_CANNOT_VERIFY_SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  if p_verified then
    insert into kh_private.verified_users(user_id, verified_by, note) values (p_user_id, v_actor, v_note)
      on conflict (user_id) do update set verified_by = excluded.verified_by, verified_at = clock_timestamp(), note = excluded.note;
  else
    delete from kh_private.verified_users where user_id = p_user_id;
  end if;
  return public.kh_public_profile(p_user_id);
end $$;

revoke all on function public.kh_public_profile(uuid), public.kh_set_user_verified(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.kh_public_profile(uuid) to anon, authenticated;
grant execute on function public.kh_set_user_verified(uuid, uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
