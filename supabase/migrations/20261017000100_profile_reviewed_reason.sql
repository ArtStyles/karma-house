-- BRAND.md forbids «verificado»: the trust-level reason for a profile KarmaHouse reviewed now reads «Perfil revisado
-- por KarmaHouse», the same words as the app's badge. Only that string changes; the body is the one from
-- 20261007000300_agency_property_origins.sql, and create or replace keeps the function's privileges.
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

  if v_verified then v_reasons := array_append(v_reasons, 'Perfil revisado por KarmaHouse'); end if;
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
