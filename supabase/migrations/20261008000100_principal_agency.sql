-- One real business identity, independently protected from personal and system roles.
-- The current owner comes exclusively from platform_owner; Auth metadata is irrelevant.
create table kh_private.principal_agency(
 singleton boolean primary key default true check(singleton),
 agency_id uuid not null unique references kh_private.agencies(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table kh_private.principal_agency enable row level security;
revoke all on kh_private.principal_agency from public,anon,authenticated,service_role;
grant select on kh_private.principal_agency to service_role;

create function kh_private.is_principal_agency(p_agency uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.principal_agency where singleton and agency_id=p_agency)
$$;
revoke all on function kh_private.is_principal_agency(uuid) from public,anon,authenticated;

create function kh_private.guard_principal_agency_identity() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' or (tg_op='UPDATE' and new.agency_id is distinct from old.agency_id) then
  raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';
 end if;
 if not exists(select 1 from kh_private.agencies a join kh_private.agency_verifications v on v.agency_id=a.id
  join kh_private.platform_owner o on o.singleton join kh_private.agency_memberships m on m.agency_id=a.id and m.user_id=o.user_id
  where a.id=new.agency_id and a.state='approved' and v.active and m.state='active' and m.role='admin') then
  raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';
 end if;
 return new;
end $$;
create trigger kh_principal_identity_guard before insert or update or delete on kh_private.principal_agency
for each row execute function kh_private.guard_principal_agency_identity();

create function kh_private.guard_principal_agency_entity() returns trigger
language plpgsql security definer set search_path='' as $$declare a uuid;begin
 if tg_table_name='agencies' then
  a:=old.id;
  if kh_private.is_principal_agency(a) and (tg_op='DELETE' or new.id is distinct from old.id or new.state<>'approved') then
   raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';
  end if;
 elsif tg_table_name='agency_verifications' then
  a:=old.agency_id;
  if kh_private.is_principal_agency(a) and (tg_op='DELETE' or new.agency_id is distinct from old.agency_id or not new.active) then
   raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';
  end if;
 elsif tg_table_name='agency_memberships' then
  a:=old.agency_id;
  if kh_private.is_principal_agency(a) and kh_private.is_owner(old.user_id)
   and (tg_op='DELETE' or new.agency_id is distinct from old.agency_id or new.user_id is distinct from old.user_id or new.role<>'admin' or new.state<>'active') then
   raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger kh_principal_agency_guard before update or delete on kh_private.agencies for each row execute function kh_private.guard_principal_agency_entity();
create trigger kh_principal_verification_guard before update or delete on kh_private.agency_verifications for each row execute function kh_private.guard_principal_agency_entity();
create trigger kh_principal_owner_membership_guard before update or delete on kh_private.agency_memberships for each row execute function kh_private.guard_principal_agency_entity();
revoke all on function kh_private.guard_principal_agency_identity(),kh_private.guard_principal_agency_entity() from public,anon,authenticated;

create or replace function kh_private.agency_summary(p_agency uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'tradeName',a.trade_name,'state',a.state,'version',a.version,'logoPath',a.logo_path,
 'verified',a.state='approved' and coalesce(v.active,false),'verificationVersion',a.verification_version,'isPrincipal',kh_private.is_principal_agency(a.id))
 from kh_private.agencies a left join kh_private.agency_verifications v on v.agency_id=a.id where a.id=p_agency
$$;

create function public.kh_ensure_principal_agency(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare a uuid;current_owner uuid;begin
 perform kh_private.agency_account(p_actor_id);
 -- Shared row lock prevents bootstrap racing a protected ownership transfer.
 select user_id into current_owner from kh_private.platform_owner where singleton for share;
 if current_owner is distinct from p_actor_id then raise exception 'KH_OWNER_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:principal-agency',0));
 select agency_id into a from kh_private.principal_agency where singleton;
 if a is null then
  insert into kh_private.agencies(trade_name,state) values('KarmaHouse','approved') returning id into a;
  -- No responsible name, phone, province, office or personal application is fabricated.
  insert into kh_private.agency_applications(agency_id,input) values(a,'{}'::jsonb);
  insert into kh_private.agency_memberships(agency_id,user_id,role) values(a,current_owner,'admin');
  insert into kh_private.agency_verifications(agency_id,active,granted_by,granted_at,reason)
   values(a,true,current_owner,now(),'Inmobiliaria principal de KarmaHouse');
  insert into kh_private.principal_agency(singleton,agency_id) values(true,a);
  insert into kh_private.agency_events(agency_id,actor_id,kind) values(a,current_owner,'principal_agency_created');
 else
  perform kh_private.agency_lock(a);
  insert into kh_private.agency_memberships(agency_id,user_id,role) values(a,current_owner,'admin')
   on conflict(agency_id,user_id) do update set role='admin',state='active',version=agency_memberships.version+1
   where agency_memberships.role<>'admin' or agency_memberships.state<>'active';
 end if;
 return kh_private.agency_summary(a);
end $$;
revoke all on function public.kh_ensure_principal_agency(uuid) from public,anon,authenticated,service_role;
grant execute on function public.kh_ensure_principal_agency(uuid) to authenticated;

-- Preserve the module switch: bootstrap creates a readable workspace without activation.
create or replace function public.kh_list_my_agencies(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_account(p_actor_id);
 if kh_private.is_owner(p_actor_id) then perform public.kh_ensure_principal_agency(p_actor_id);end if;
 return coalesce((select jsonb_agg(kh_private.agency_summary(a.id) order by kh_private.is_principal_agency(a.id) desc,a.trade_name,a.id)
  from kh_private.agencies a where exists(select 1 from kh_private.agency_memberships m where m.agency_id=a.id and m.user_id=p_actor_id and m.state='active')),'[]'::jsonb);
end $$;

-- Ownership stays private; a protected transfer retains the same commercial identity.
create function kh_private.principal_agency_owner_changed() returns trigger
language plpgsql security definer set search_path='' as $$declare a uuid;begin
 if tg_op='DELETE' then
  if exists(select 1 from kh_private.principal_agency) then raise exception 'KH_PRINCIPAL_AGENCY_PROTECTED' using errcode='42501';end if;
  return old;
 end if;
 select agency_id into a from kh_private.principal_agency where singleton;
 if a is not null then
  perform pg_advisory_xact_lock(hashtextextended('kh:principal-agency',0));perform kh_private.agency_lock(a);
  insert into kh_private.agency_memberships(agency_id,user_id,role) values(a,new.user_id,'admin')
   on conflict(agency_id,user_id) do update set role='admin',state='active',version=agency_memberships.version+1
   where agency_memberships.role<>'admin' or agency_memberships.state<>'active';
 end if;
 return new;
end $$;
create trigger kh_principal_platform_owner_delete before delete on kh_private.platform_owner for each row execute function kh_private.principal_agency_owner_changed();
create trigger kh_principal_platform_owner_transfer after insert or update of user_id on kh_private.platform_owner for each row execute function kh_private.principal_agency_owner_changed();
revoke all on function kh_private.principal_agency_owner_changed() from public,anon,authenticated;

create or replace function kh_private.agency_profile_input(a uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when kh_private.is_principal_agency(q.id) and q.commercial_profile is null then
  jsonb_build_object('tradeName',q.trade_name,'businessPhone','','province','','municipality','','serviceAreas','[]'::jsonb,'description','','officeAddress',null,'publishOfficeAddress',false)
  else coalesce(q.commercial_profile,r.input-array['responsibleFullName','evidenceReferences']) end
 from kh_private.agencies q left join kh_private.agency_applications r on r.agency_id=q.id where q.id=a
$$;
create or replace function public.kh_get_agency_profile(p_actor_id uuid,p_agency_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'admin');
 return (select jsonb_build_object('agencyId',id,'version',version,'logoPath',logo_path,'input',kh_private.agency_profile_input(id),
  'isPrincipal',kh_private.is_principal_agency(id),'commercialProfileComplete',not(kh_private.is_principal_agency(id) and commercial_profile is null))
  from kh_private.agencies where id=p_agency_id);
end $$;
create or replace function public.kh_public_agency_profile(p_agency_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('agencyId',a.id,'tradeName',a.trade_name,'logoPath',a.logo_path,'verified',coalesce(v.active,false),'isPrincipal',kh_private.is_principal_agency(a.id))
 ||case when kh_private.is_principal_agency(a.id) and (a.commercial_profile is null or not(select enabled from kh_private.agency_settings where singleton)) then jsonb_build_object('identityOnly',true)
 else jsonb_build_object('businessPhone',q.input->>'businessPhone','province',q.input->>'province','municipality',q.input->>'municipality','serviceAreas',q.input->'serviceAreas','description',q.input->>'description')
 ||case when (q.input->>'publishOfficeAddress')::boolean then jsonb_build_object('officeAddress',q.input->>'officeAddress') else '{}'::jsonb end end
 from kh_private.agencies a left join kh_private.agency_verifications v on v.agency_id=a.id
 cross join lateral(select kh_private.agency_profile_input(a.id) input) q
 where a.id=p_agency_id and a.state='approved' and ((select enabled from kh_private.agency_settings where singleton) or kh_private.is_principal_agency(a.id))
$$;

create or replace function public.kh_public_agency_context(p_property_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if cardinality(p_property_ids)>100 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('propertyId',p.id,'agencyId',a.id,'tradeName',a.trade_name,'logoPath',a.logo_path,
  'serviceAreas',coalesce(kh_private.agency_profile_input(a.id)->'serviceAreas','[]'::jsonb),
  'contactAvailable',exists(select 1 from kh_private.agency_memberships m where m.agency_id=a.id and m.state='active' and not kh_private.is_suspended(m.user_id) and not kh_private.is_deleting(m.user_id)),
  'verified',coalesce(v.active,false),'isPrincipal',kh_private.is_principal_agency(a.id)) order by p.id,a.id),'[]'::jsonb) into result
 from public.properties p join kh_private.agency_mandates m on m.property_id=p.id and m.state='active'
 join kh_private.agencies a on a.id=m.agency_id and a.state='approved' left join kh_private.agency_verifications v on v.agency_id=a.id
 where (select enabled from kh_private.agency_settings where singleton) and p.id=any(p_property_ids) and p.availability='active' and p.moderation='approved'
 and not exists(select 1 from kh_private.property_aliases where property_id=p.id);
 return result;
end $$;

-- Exact ACLs also remove explicit hosted default grants, not only PUBLIC grants.
revoke all on function kh_private.agency_summary(uuid),kh_private.agency_profile_input(uuid) from public,anon,authenticated;
revoke all on function public.kh_list_my_agencies(uuid),public.kh_get_agency_profile(uuid,uuid),public.kh_public_agency_profile(uuid),public.kh_public_agency_context(uuid[]) from public,anon,authenticated;
grant execute on function public.kh_list_my_agencies(uuid),public.kh_get_agency_profile(uuid,uuid) to authenticated;
grant execute on function public.kh_public_agency_profile(uuid),public.kh_public_agency_context(uuid[]) to anon,authenticated;
