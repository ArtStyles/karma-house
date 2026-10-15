-- Pro only matters to whoever has it. Other viewers, signed in or not, always read false; the catalogue
-- order (bumped_at) is unchanged. CREATE OR REPLACE keeps both functions' grants.
-- Who sees a listing's Pro is who may bump it (kh_bump_property): the owner of a personal listing, or an
-- active member of the agency that published it.
create or replace function public.kh_is_pro(p public.properties) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select kh_private.property_pro_active(x.id,x.owner_id) from public.properties x
  left join kh_private.agency_property_origins o on o.property_id=x.id
  where x.id=p.id and auth.uid() is not null
   and case when o.origin_agency_id is null then x.owner_id=auth.uid()
    else exists(select 1 from kh_private.agency_memberships m where m.agency_id=o.origin_agency_id and m.user_id=auth.uid() and m.state='active') end),false)
$$;
create or replace function public.kh_pro_badge(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_user_id=auth.uid() and kh_private.user_pro_until(p_user_id)>now(),false)
$$;
