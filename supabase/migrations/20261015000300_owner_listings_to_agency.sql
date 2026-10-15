-- The platform owner moves their own sales into an agency they administer, as its sole origin, so its gestores work
-- them. It writes the same rows as kh_admin_link_assisted_agency (origin, mandate, commercial cycle, event) without an
-- assisted collaborator: the owner publishes and consents for themself. Irreversible on purpose: origin rows never
-- change (guard_agency_origin_identity). Private: an operator runs it acting as the owner, never a client.
create function kh_private.adopt_owner_listing(p_actor uuid,p_agency uuid,p_property uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.properties%rowtype;v_reference text:='kh-'||p_property::text;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_account(p_actor);
 if not kh_private.is_owner(p_actor) then raise exception 'KH_OWNER_REQUIRED';end if;
 -- Agency before property, as every mandate and origin write does.
 perform kh_private.agency_actor(p_actor,p_agency,'admin');
 select * into p from public.properties where id=p_property for update;
 if p.id is null or p.owner_id<>p_actor or p.operation<>'sale' or p.availability='sold' or p.moderation<>'approved'
  or exists(select 1 from kh_private.property_aliases where property_id=p_property) then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 if p.version is distinct from p_expected_version then raise exception 'KH_VERSION_CONFLICT';end if;
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_property) then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
 insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)
  values(p_property,p_agency,p_actor,v_reference,'La cuenta propietaria traslada su propio anuncio a su inmobiliaria.');
 -- A mandate may already exist («Cartera autorizada»); it stays active and now follows the origin.
 insert into kh_private.agency_mandates(property_id,agency_id,reference)values(p_property,p_agency,v_reference)
  on conflict(property_id,agency_id) do update set state='active',version=kh_private.agency_mandates.version+1,reference=excluded.reference;
 insert into kh_private.commercial_cycles(property_id)select p_property where not exists(select 1 from kh_private.commercial_cycles where property_id=p_property and state='open');
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency,p_actor,'owner_origin_adopted',p_property);
 return jsonb_build_object('propertyId',p_property,'agencyId',p_agency);
end $$;
revoke all on function kh_private.adopt_owner_listing(uuid,uuid,uuid,integer) from public,anon,authenticated;

-- PostgREST computed field (select 'agency_id:kh_listing_agency'): the agency a listing belongs to, told only to its
-- owner and to that agency's active members, so «Mis anuncios» can send agency listings to the agency screens.
create function public.kh_listing_agency(p public.properties) returns uuid language sql stable security definer set search_path='' as $$
 select o.origin_agency_id from public.properties x join kh_private.agency_property_origins o on o.property_id=x.id
 where x.id=p.id and auth.uid() is not null and (x.owner_id=auth.uid()
  or exists(select 1 from kh_private.agency_memberships m where m.agency_id=o.origin_agency_id and m.user_id=auth.uid() and m.state='active'))
$$;
revoke all on function public.kh_listing_agency(public.properties) from public;
grant execute on function public.kh_listing_agency(public.properties) to anon,authenticated;
