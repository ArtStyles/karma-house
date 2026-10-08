-- Shared mandates never alter the established origin.
create table kh_private.agency_mandate_requests(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id),agency_id uuid not null references kh_private.agencies(id),
 internal_reference text not null,state text not null default 'pending' check(state in('pending','accepted','rejected','withdrawn')),version integer not null default 1,
 created_by uuid not null,created_at timestamptz not null default now(),decided_by uuid,decided_at timestamptz,termination_reason text
);
create unique index agency_mandate_one_pending on kh_private.agency_mandate_requests(property_id,agency_id) where state='pending';
create table kh_private.agency_property_changes(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.properties(id),agency_id uuid not null references kh_private.agencies(id),kind text not null check(kind in('content','price')),
 proposed_payload jsonb not null,expected_property_version integer not null,state text not null default 'pending' check(state in('pending','accepted','rejected','withdrawn')),version integer not null default 1,
 created_by uuid not null,created_at timestamptz not null default now(),decided_by uuid,decided_at timestamptz,termination_reason text
);
create unique index agency_change_one_pending on kh_private.agency_property_changes(property_id,agency_id,kind) where state='pending';
create table kh_private.property_aliases(
 property_id uuid primary key references public.properties(id) on delete restrict,canonical_id uuid not null references public.properties(id) on delete restrict,
 origin_evidence text not null,reason text not null,reviewed_by uuid not null,created_at timestamptz not null default now(),check(property_id<>canonical_id)
);
do $$ declare t text;begin foreach t in array array['agency_mandate_requests','agency_property_changes','property_aliases'] loop
 execute format('alter table kh_private.%I enable row level security',t);execute format('revoke all on kh_private.%I from public,anon,authenticated',t);execute format('grant all on kh_private.%I to service_role',t);
end loop;end $$;

-- Called after all agency locks and the property row lock, by account or agency context.
create function kh_private.property_source_decider(actor uuid,agency uuid,pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from kh_private.agency_property_origins where property_id=pid)
 then exists(select 1 from kh_private.agency_property_origins o join kh_private.agency_memberships m on m.agency_id=o.origin_agency_id join kh_private.agencies a on a.id=m.agency_id where o.property_id=pid and o.origin_agency_id=agency and a.state='approved' and m.user_id=actor and m.state='active' and m.role='admin')
 else agency is null and exists(select 1 from public.properties where id=pid and owner_id=actor) end
$$;
create function kh_private.mandate_context(actor uuid,agency uuid,pid uuid,requesting uuid) returns void language plpgsql security definer set search_path='' as $$
 declare source uuid;begin
 perform kh_private.agency_account(actor);
 if not(select enabled from kh_private.agency_settings where singleton) then raise exception 'KH_AGENCY_DISABLED';end if;
 select origin_agency_id into source from kh_private.agency_property_origins where property_id=pid;
 perform kh_private.agency_lock_many(array[agency,source,requesting]);
 if agency is not null then perform kh_private.agency_actor(actor,agency,'admin');end if;
 perform 1 from public.properties where id=pid for update;
 if not found or exists(select 1 from kh_private.property_aliases where property_id=pid) then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 if not kh_private.property_source_decider(actor,agency,pid) and agency is distinct from requesting then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
end $$;
create function kh_private.mandate_request_json(actor uuid,agency uuid,r kh_private.agency_mandate_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'propertyId',r.property_id,'agencyId',r.agency_id,'agencyName',(select trade_name from kh_private.agencies where id=r.agency_id),'state',r.state,'version',r.version,
 'mandateVersion',(select version from kh_private.agency_mandates where property_id=r.property_id and agency_id=r.agency_id),'canDecide',r.state='pending' and kh_private.property_source_decider(actor,agency,r.property_id),'canWithdraw',r.state in('pending','accepted') and (agency=r.agency_id or kh_private.property_source_decider(actor,agency,r.property_id)))
 ||case when agency=r.agency_id then jsonb_build_object('internalReference',r.internal_reference) else '{}'::jsonb end
$$;
create function kh_private.property_change_json(actor uuid,agency uuid,r kh_private.agency_property_changes) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'propertyId',r.property_id,'agencyId',r.agency_id,'agencyName',(select trade_name from kh_private.agencies where id=r.agency_id),'kind',r.kind,'proposedPayload',r.proposed_payload,'expectedPropertyVersion',r.expected_property_version,'state',r.state,'version',r.version,'canDecide',r.state='pending' and kh_private.property_source_decider(actor,agency,r.property_id))
$$;
create function public.kh_request_agency_mandate(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid:=(p_payload->>'propertyId')::uuid;receipt jsonb;r kh_private.agency_mandate_requests;begin
 pid:=(public.kh_resolve_agency_mandate_property(p_actor_id,pid)->>'propertyId')::uuid;
 perform kh_private.mandate_context(p_actor_id,p_agency_id,pid,p_agency_id);
 if p_agency_id is null then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'request_mandate',p_payload);if receipt is not null then
 select * into r from kh_private.agency_mandate_requests where id=(receipt->>'id')::uuid;return kh_private.mandate_request_json(p_actor_id,p_agency_id,r);end if;
 if not exists(select 1 from public.properties where id=pid and operation='sale' and availability='active' and moderation='approved') then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 if exists(select 1 from kh_private.agency_mandates where property_id=pid and agency_id=p_agency_id and state='active') then raise exception 'KH_AGENCY_MANDATE_EXISTS';end if;
 if coalesce(char_length(btrim(p_payload->>'internalReference')),0) not between 1 and 100 then raise exception 'KH_AGENCY_INVALID';end if;
 insert into kh_private.agency_mandate_requests(property_id,agency_id,internal_reference,created_by)values(pid,p_agency_id,btrim(p_payload->>'internalReference'),p_actor_id) returning * into r;
 perform kh_private.agency_remember(p_actor_id,p_agency_id,'request_mandate',p_payload,jsonb_build_object('id',r.id));return kh_private.mandate_request_json(p_actor_id,p_agency_id,r);
end $$;
create function public.kh_decide_agency_mandate(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r kh_private.agency_mandate_requests;receipt jsonb;begin
 select * into r from kh_private.agency_mandate_requests where id=(p_payload->>'requestId')::uuid;
 perform kh_private.mandate_context(p_actor_id,p_agency_id,r.property_id,r.agency_id);
 if not kh_private.property_source_decider(p_actor_id,p_agency_id,r.property_id) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,coalesce(p_agency_id,p_actor_id),'decide_mandate',p_payload);
 select * into r from kh_private.agency_mandate_requests where id=r.id for update;
 if receipt is not null then return kh_private.mandate_request_json(p_actor_id,p_agency_id,r);end if;
 if r.version is distinct from (p_payload->>'expectedVersion')::integer or r.state<>'pending' then raise exception 'KH_VERSION_CONFLICT';end if;
 if p_payload->>'decision' is null or p_payload->>'decision' not in('accept','reject') then raise exception 'KH_AGENCY_INVALID';end if;
 if p_payload->>'decision'='accept' then
  if not exists(select 1 from public.properties where id=r.property_id and operation='sale' and availability<>'sold') or not exists(select 1 from kh_private.agencies where id=r.agency_id and state='approved') then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
  insert into kh_private.agency_mandates(property_id,agency_id,reference)values(r.property_id,r.agency_id,r.internal_reference)
  on conflict(property_id,agency_id) do update set state='active',version=agency_mandates.version+1,reference=excluded.reference;
  insert into kh_private.commercial_cycles(property_id)select r.property_id where not exists(select 1 from kh_private.commercial_cycles where property_id=r.property_id and state='open');
 end if;
 update kh_private.agency_mandate_requests set state=case when p_payload->>'decision'='accept' then 'accepted' else 'rejected' end,version=version+1,decided_by=p_actor_id,decided_at=now() where id=r.id returning * into r;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(r.agency_id,p_actor_id,'mandate_'||r.state,r.property_id);
 perform kh_private.agency_remember(p_actor_id,coalesce(p_agency_id,p_actor_id),'decide_mandate',p_payload,jsonb_build_object('id',r.id));return kh_private.mandate_request_json(p_actor_id,p_agency_id,r);
end $$;
-- Tasks 8-10 extend this same helper for their new business subjects.
create function kh_private.terminate_mandate_flows(p_property_id uuid,p_agency_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 update kh_private.agency_property_changes set state='withdrawn',termination_reason=p_reason,version=version+1,decided_at=now() where property_id=p_property_id and agency_id=p_agency_id and state='pending';
 update kh_private.agency_mandate_requests set state='withdrawn',termination_reason=p_reason,version=version+1,decided_at=now() where property_id=p_property_id and agency_id=p_agency_id and state in('pending','accepted');
end $$;
create function public.kh_withdraw_agency_mandate(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid:=(p_payload->>'propertyId')::uuid;agency uuid:=(p_payload->>'requestingAgencyId')::uuid;m kh_private.agency_mandates;receipt jsonb;begin
 perform kh_private.mandate_context(p_actor_id,p_agency_id,pid,agency);
 if exists(select 1 from kh_private.agency_property_origins where property_id=pid and origin_agency_id=agency) then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,coalesce(p_agency_id,p_actor_id),'withdraw_mandate',p_payload);if receipt is not null then return receipt;end if;
 if p_payload ? 'requestId' then
  update kh_private.agency_mandate_requests set state='withdrawn',version=version+1,decided_by=p_actor_id,decided_at=now(),termination_reason='request_withdrawn'
  where id=(p_payload->>'requestId')::uuid and property_id=pid and agency_id=agency and state='pending' and version=(p_payload->>'expectedVersion')::integer;
  if not found then raise exception 'KH_VERSION_CONFLICT';end if;
  return kh_private.agency_remember(p_actor_id,coalesce(p_agency_id,p_actor_id),'withdraw_mandate',p_payload,jsonb_build_object('propertyId',pid,'agencyId',agency,'state','withdrawn'));
 end if;
 select * into m from kh_private.agency_mandates where property_id=pid and agency_id=agency for update;
 if m.property_id is null or m.state<>'active' or m.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
 update kh_private.agency_mandates set state='withdrawn',version=version+1 where property_id=pid and agency_id=agency;
 perform kh_private.terminate_mandate_flows(pid,agency,'authorization_withdrawn');
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(agency,p_actor_id,'mandate_withdrawn',pid);
 return kh_private.agency_remember(p_actor_id,coalesce(p_agency_id,p_actor_id),'withdraw_mandate',p_payload,jsonb_build_object('propertyId',pid,'agencyId',agency,'state','withdrawn','version',m.version+1));
end $$;
create function public.kh_propose_agency_property_change(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid:=(p_payload->>'propertyId')::uuid;r kh_private.agency_property_changes;receipt jsonb;proposal jsonb:=p_payload->'proposedPayload';kind text:=p_payload->>'kind';begin
 perform kh_private.agency_property_access(p_actor_id,p_agency_id,pid);perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 if exists(select 1 from kh_private.property_aliases where property_id=pid) or not exists(select 1 from public.properties where id=pid and availability<>'sold' and operation='sale') then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'propose_change',p_payload);if receipt is not null then select * into r from kh_private.agency_property_changes where id=(receipt->>'id')::uuid;return kh_private.property_change_json(p_actor_id,p_agency_id,r);end if;
 if kind is null or kind not in('price','content') or jsonb_typeof(proposal) is distinct from 'object' or proposal='{}'::jsonb
 or exists(select 1 from jsonb_object_keys(proposal) k where not(k=any(case when kind='price' then array['price','priceNegotiable'] else array['title','description','location','province','type','area','bedrooms','bathrooms','amenities','condition','floor','mapLocation'] end))) then raise exception 'KH_AGENCY_INVALID';end if;
 if (p_payload->>'expectedPropertyVersion')::integer is distinct from (select version from public.properties where id=pid) then raise exception 'KH_VERSION_CONFLICT';end if;
 insert into kh_private.agency_property_changes(property_id,agency_id,kind,proposed_payload,expected_property_version,created_by)values(pid,p_agency_id,kind,proposal,(p_payload->>'expectedPropertyVersion')::integer,p_actor_id) returning * into r;
 perform kh_private.agency_remember(p_actor_id,p_agency_id,'propose_change',p_payload,jsonb_build_object('id',r.id));return kh_private.property_change_json(p_actor_id,p_agency_id,r);
end $$;
create function public.kh_decide_agency_property_change(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r kh_private.agency_property_changes;p public.properties;source uuid;receipt jsonb;draft jsonb;policy text;begin
 select * into r from kh_private.agency_property_changes where id=(p_payload->>'requestId')::uuid;
 perform kh_private.mandate_context(p_actor_id,p_agency_id,r.property_id,r.agency_id);
 if not kh_private.property_source_decider(p_actor_id,p_agency_id,r.property_id) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 receipt:=kh_private.agency_receipt(p_actor_id,coalesce(p_agency_id,p_actor_id),'decide_change',p_payload);
 select * into r from kh_private.agency_property_changes where id=r.id for update;
 if receipt is not null then return kh_private.property_change_json(p_actor_id,p_agency_id,r);end if;
 if r.version is distinct from (p_payload->>'expectedVersion')::integer or r.state<>'pending' then raise exception 'KH_VERSION_CONFLICT';end if;
 if p_payload->>'decision' is null or p_payload->>'decision' not in('accept','reject') then raise exception 'KH_AGENCY_INVALID';end if;
 if p_payload->>'decision'='accept' then
  select * into p from public.properties where id=r.property_id;
  if p.version<>r.expected_property_version then raise exception 'KH_VERSION_CONFLICT';end if;
  if p.availability='sold' or not exists(select 1 from kh_private.agency_mandates m join kh_private.agencies a on a.id=m.agency_id where m.property_id=p.id and m.agency_id=r.agency_id and m.state='active' and a.state='approved') then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
  select origin_agency_id into source from kh_private.agency_property_origins where property_id=p.id;
  policy:=case when source is null then 'requires_review' else kh_private.agency_publication_policy(p.id,source) end;
  draft:=jsonb_build_object('title',p.title,'location',p.location,'province',p.province,'type',p.type,'description',p.description,'price',p.price,'area',p.area,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'amenities',to_jsonb(p.amenities),'photoPaths',to_jsonb(p.photo_paths),'operation','sale')||r.proposed_payload||jsonb_build_object('id',p.id,'expectedVersion',p.version,'clientRequestId',p.client_request_id,'ownerId',p.owner_id,'moderation','pending');
  insert into kh_private.agency_property_write_permits values(txid_current(),p.id,p_actor_id,p_payload->>'clientRequestId','save');
  perform kh_private.save_property_core(p_actor_id,p.owner_id,p.id,draft);
  if policy='direct' then update public.properties set moderation='approved',review_note=null where id=p.id; if p.moderation<>'approved' then perform kh_private.alert_on_approval(updated) from public.properties updated where updated.id=p.id and updated.availability='active';end if;end if;
  delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p.id;
 end if;
 update kh_private.agency_property_changes set state=case when p_payload->>'decision'='accept' then 'accepted' else 'rejected' end,version=version+1,decided_by=p_actor_id,decided_at=now() where id=r.id returning * into r;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(r.agency_id,p_actor_id,'property_change_'||r.state,r.property_id,jsonb_build_object('requestId',r.id));
 perform kh_private.agency_remember(p_actor_id,coalesce(p_agency_id,p_actor_id),'decide_change',p_payload,jsonb_build_object('id',r.id));return kh_private.property_change_json(p_actor_id,p_agency_id,r);
end $$;
create function public.kh_list_agency_mandate_requests(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin
 perform kh_private.agency_account(p_actor_id);if p_agency_id is not null then perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(v),'[]') into items from(select kh_private.mandate_request_json(p_actor_id,p_agency_id,r) v from kh_private.agency_mandate_requests r where r.agency_id=p_agency_id or kh_private.property_source_decider(p_actor_id,p_agency_id,r.property_id) order by r.created_at desc,r.id offset p_offset limit 31)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>30 then items-30 else items end,'hasMore',jsonb_array_length(items)>30);
end $$;
create function public.kh_list_agency_property_changes(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin
 perform kh_private.agency_account(p_actor_id);if p_agency_id is not null then perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(v),'[]') into items from(select kh_private.property_change_json(p_actor_id,p_agency_id,r) v from kh_private.agency_property_changes r where r.agency_id=p_agency_id or kh_private.property_source_decider(p_actor_id,p_agency_id,r.property_id) order by r.created_at desc,r.id offset p_offset limit 31)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>30 then items-30 else items end,'hasMore',jsonb_array_length(items)>30);
end $$;

create or replace function kh_private.agency_property_json(p_actor uuid,p_agency uuid,p_property uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;begin
 select jsonb_build_object('property',to_jsonb(p)||jsonb_build_object('review_note',coalesce((select reason from kh_private.agency_property_moderation_holds where property_id=p.id and active),p.review_note)),'originAgencyId',o.origin_agency_id,'authorityVersion',coalesce(o.authority_version,1),
 'cycleId',(select c.id from kh_private.commercial_cycles c where c.property_id=p.id order by c.created_at desc,c.id desc limit 1),
 'mandate',jsonb_build_object('agencyId',m.agency_id,'state',m.state,'version',m.version,'reference',m.reference),
 'canEditCommon',coalesce(o.origin_agency_id=p_agency and member.role='admin' and p.availability<>'sold',false),
 'canConfirmSale',coalesce(o.origin_agency_id=p_agency and member.role='admin' and p.availability<>'sold',false),
 'publicationPolicy',case when o.origin_agency_id is null then 'requires_review' else kh_private.agency_publication_policy(p.id,o.origin_agency_id) end,
 'moderationHold',exists(select 1 from kh_private.agency_property_moderation_holds h where h.property_id=p.id and h.active)) into result
 from public.properties p left join kh_private.agency_property_origins o on o.property_id=p.id
 join kh_private.agency_mandates m on m.property_id=p.id and m.agency_id=p_agency and m.state='active'
 join kh_private.agency_memberships member on member.agency_id=p_agency and member.user_id=p_actor and member.state='active'
 where p.id=p_property and not exists(select 1 from kh_private.property_aliases where property_id=p.id);
 if result is null then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;return result;
end $$;
create function public.kh_resolve_property_alias(p_property_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((select a.canonical_id from kh_private.property_aliases a join public.properties p on p.id=a.canonical_id where a.property_id=p_property_id and p.moderation='approved' and p.availability='active'),p_property_id)
$$;
create function public.kh_public_agency_context(p_property_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 if cardinality(p_property_ids)>100 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('propertyId',p.id,'agencyId',a.id,'tradeName',a.trade_name,'logoPath',a.logo_path,'serviceAreas',coalesce(ap.input->'serviceAreas','[]'::jsonb),'contactAvailable',exists(select 1 from kh_private.agency_memberships m where m.agency_id=a.id and m.state='active' and not kh_private.is_suspended(m.user_id) and not kh_private.is_deleting(m.user_id)),'verified',coalesce(v.active,false)) order by p.id,a.id),'[]') into result
 from public.properties p join kh_private.agency_mandates m on m.property_id=p.id and m.state='active' join kh_private.agencies a on a.id=m.agency_id and a.state='approved' join kh_private.agency_applications ap on ap.agency_id=a.id left join kh_private.agency_verifications v on v.agency_id=a.id
 where (select enabled from kh_private.agency_settings where singleton) and p.id=any(p_property_ids) and p.availability='active' and p.moderation='approved' and not exists(select 1 from kh_private.property_aliases where property_id=p.id);
 return result;
end $$;
create function kh_private.guard_property_alias_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.property_aliases where property_id=old.id)
 and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid() and purpose='merge') then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger kh_property_alias_guard before update or delete on public.properties for each row execute function kh_private.guard_property_alias_write();
create function kh_private.guard_alias_origin() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.property_aliases where property_id=new.property_id) then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;return new;
end $$;
create trigger kh_alias_origin_guard before insert on kh_private.agency_property_origins for each row execute function kh_private.guard_alias_origin();
create function public.kh_admin_property_duplicate_candidates(p_actor_id uuid,p_property_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin
 perform kh_private.agency_account(p_actor_id);if not kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_REQUIRED';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(v),'[]') into items from(select jsonb_build_object('id',p.id,'title',p.title,'location',p.location,'version',p.version) v from public.properties p join public.properties target on target.id=p_property_id where p.id<>target.id and p.operation='sale' and target.operation='sale' and p.availability<>'sold' and p.province=target.province and not exists(select 1 from kh_private.property_aliases where property_id=p.id) order by p.created_at desc,p.id offset p_offset limit 31)x;
 return jsonb_build_object('canonical',(select jsonb_build_object('id',p.id,'title',p.title,'location',p.location,'version',p.version) from public.properties p where p.id=p_property_id),'items',case when jsonb_array_length(items)>30 then items-30 else items end,'hasMore',jsonb_array_length(items)>30);
end $$;
create function public.kh_admin_merge_property_duplicates(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare cid uuid:=(p_payload->>'canonicalId')::uuid;ids uuid[];pid uuid;agency uuid;c public.properties;d public.properties;source uuid;other_source uuid;receipt jsonb;begin
 perform kh_private.agency_account(p_actor_id);if not kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_REQUIRED';end if;
 if jsonb_typeof(p_payload->'duplicateIds') is distinct from 'array' or jsonb_array_length(p_payload->'duplicateIds') not between 1 and 20
 or coalesce(char_length(btrim(p_payload->>'originEvidence')),0) not between 10 and 2000 or coalesce(char_length(btrim(p_payload->>'reason')),0) not between 10 and 500 then raise exception 'KH_AGENCY_INVALID';end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_payload->'duplicateIds');
 if cid=any(ids) or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception 'KH_AGENCY_INVALID';end if;
 -- Serialize alias graph edits; reject chains, flatten earlier inbound aliases atomically.
 perform pg_advisory_xact_lock(hashtextextended('kh:property-aliases',0));
 perform kh_private.agency_lock_many((select array_agg(distinct agency_id) from kh_private.agency_mandates where property_id=any(ids||array[cid])));
 perform 1 from public.properties where id=any(ids||array[cid]) order by id for update;
 receipt:=kh_private.agency_receipt(p_actor_id,cid,'merge_duplicates',p_payload);if receipt is not null then return receipt;end if;
 select * into c from public.properties where id=cid;
 if c.id is null or c.operation<>'sale' or c.availability='sold' or exists(select 1 from kh_private.property_aliases where property_id=any(ids||array[cid])) then raise exception 'KH_PROPERTY_ALIAS_INVALID';end if;
 if c.version is distinct from (p_payload->'expectedVersions'->>cid::text)::integer then raise exception 'KH_VERSION_CONFLICT';end if;
 select origin_agency_id into source from kh_private.agency_property_origins where property_id=cid;
 foreach pid in array ids loop
  select * into d from public.properties where id=pid;
  if d.id is null or d.operation<>'sale' or d.availability='sold' then raise exception 'KH_PROPERTY_ALIAS_INVALID';end if;
  if d.version is distinct from (p_payload->'expectedVersions'->>pid::text)::integer then raise exception 'KH_VERSION_CONFLICT';end if;
  if exists(select 1 from kh_private.agency_property_moderation_holds where property_id=pid and active) and not exists(select 1 from kh_private.agency_property_moderation_holds where property_id=cid and active) then raise exception 'KH_PROPERTY_MODERATION_CONFLICT';end if;
  select origin_agency_id into other_source from kh_private.agency_property_origins where property_id=pid;
  if source is distinct from other_source or (source is null and (c.owner_id<>d.owner_id
   or (select collaborator_id from kh_private.assisted_listing_records where property_id=cid) is distinct from (select collaborator_id from kh_private.assisted_listing_records where property_id=pid)
   or (select jsonb_build_array(source_channel,source_reference) from kh_private.assisted_listing_records where property_id=cid) is distinct from (select jsonb_build_array(source_channel,source_reference) from kh_private.assisted_listing_records where property_id=pid)
   or (kh_private.is_owner(c.owner_id) and not exists(select 1 from kh_private.assisted_listing_records where property_id=cid)))) then raise exception 'KH_PROPERTY_ORIGIN_CONFLICT';end if;
 end loop;
 foreach pid in array ids loop
  insert into kh_private.agency_property_write_permits values(txid_current(),pid,p_actor_id,p_payload->>'clientRequestId','merge');
  -- Keep all historical rows, photos, receipts and conversation participant/property IDs.
  update public.properties set availability='paused',version=version+1,updated_at=now() where id=pid;
  insert into kh_private.property_aliases(property_id,canonical_id,origin_evidence,reason,reviewed_by)values(pid,cid,btrim(p_payload->>'originEvidence'),btrim(p_payload->>'reason'),p_actor_id);
  update kh_private.property_aliases set canonical_id=cid where canonical_id=pid;
  insert into public.favorites(user_id,property_id,created_at)select user_id,cid,created_at from public.favorites where property_id=pid on conflict(user_id,property_id)do nothing;
  delete from public.favorites where property_id=pid;
  for agency in select agency_id from kh_private.agency_mandates where property_id=pid and state='active' loop
   insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)
   select agency,p_actor_id,'mandate_consolidated',cid,jsonb_build_object('previousPropertyId',pid,'previousVersion',m.version,'previousReference',m.reference,'previousState',m.state,'carried',not exists(select 1 from kh_private.agency_mandates where property_id=cid and agency_id=agency)) from kh_private.agency_mandates m where m.property_id=pid and m.agency_id=agency;
   if not exists(select 1 from kh_private.agency_mandates where property_id=cid and agency_id=agency) then
    update kh_private.agency_mandates set property_id=cid,version=version+1 where property_id=pid and agency_id=agency;
   elsif exists(select 1 from kh_private.agency_mandates where property_id=cid and agency_id=agency and state='withdrawn') then
    perform kh_private.terminate_mandate_flows(pid,agency,'authorization_withdrawn');
   end if;
   -- Consolidation supersedes draft requests only. Existing commercial commitments
   -- retain their historical UUIDs and resolve the canonical mandate in Tasks 8-11.
   update kh_private.agency_property_changes set state='withdrawn',termination_reason='duplicate_consolidated',version=version+1,decided_at=now() where property_id=pid and agency_id=agency and state='pending';
   update kh_private.agency_mandate_requests set state='withdrawn',termination_reason='duplicate_consolidated',version=version+1,decided_at=now() where property_id=pid and agency_id=agency and state in('pending','accepted');
  end loop;
  update kh_private.agency_mandate_requests set state='withdrawn',termination_reason='duplicate_consolidated',version=version+1,decided_at=now() where property_id=pid and state='pending';
  update kh_private.agency_mandates set state='withdrawn',version=version+1 where property_id=pid and state='active';
  -- Historical cycles and commercial subjects remain intact; no sale is inferred.
  delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=pid;
 end loop;
 insert into kh_private.commercial_cycles(property_id)select cid where exists(select 1 from kh_private.agency_mandates where property_id=cid and state='active') and not exists(select 1 from kh_private.commercial_cycles where property_id=cid and state='open');
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(source,p_actor_id,'duplicates_consolidated',cid,p_payload-'clientRequestId');
 return kh_private.agency_remember(p_actor_id,cid,'merge_duplicates',p_payload,jsonb_build_object('canonicalId',cid,'duplicateIds',to_jsonb(ids)));
end $$;
-- Preserve every Task5 assisted-link check and moderation hold; alias eligibility is checked
-- under the same property lock by the origin insert guard, including a raced consolidation.
alter function public.kh_admin_link_assisted_agency(uuid,jsonb) set schema kh_private;
alter function kh_private.kh_admin_link_assisted_agency(uuid,jsonb) rename to link_assisted_agency_before_aliases;
revoke all on function kh_private.link_assisted_agency_before_aliases(uuid,jsonb) from public,anon,authenticated;
create function public.kh_admin_link_assisted_agency(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_account(p_actor_id);if not kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_REQUIRED';end if;
 if exists(select 1 from kh_private.property_aliases where property_id=(p_payload->>'propertyId')::uuid) then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;
 return kh_private.link_assisted_agency_before_aliases(p_actor_id,p_payload);
end $$;
-- New function privileges are explicit; private helpers are never client callable.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='kh_private' and p.proname=any(array['property_source_decider','mandate_context','mandate_request_json','property_change_json','terminate_mandate_flows','guard_property_alias_write','guard_alias_origin']))
 or(n.nspname='public' and p.proname=any(array['kh_request_agency_mandate','kh_decide_agency_mandate','kh_withdraw_agency_mandate','kh_propose_agency_property_change','kh_decide_agency_property_change','kh_list_agency_mandate_requests','kh_list_agency_property_changes','kh_public_agency_context','kh_resolve_property_alias','kh_admin_property_duplicate_candidates','kh_admin_merge_property_duplicates','kh_admin_link_assisted_agency'])) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 if f.proname in('kh_public_agency_context','kh_resolve_property_alias') then execute format('grant execute on function %s to anon',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';

-- Current authorizations are independent of the historical request that granted them.
create function public.kh_list_current_agency_mandates(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin
 perform kh_private.agency_account(p_actor_id);if p_agency_id is not null then perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(v),'[]') into items from(select jsonb_build_object('propertyId',m.property_id,'agencyId',m.agency_id,'agencyName',a.trade_name,'version',m.version)
 ||case when m.agency_id=p_agency_id then jsonb_build_object('internalReference',m.reference) else '{}'::jsonb end v
 from kh_private.agency_mandates m join kh_private.agencies a on a.id=m.agency_id left join kh_private.agency_property_origins o on o.property_id=m.property_id
 where m.state='active' and m.agency_id is distinct from o.origin_agency_id and not exists(select 1 from kh_private.property_aliases where property_id=m.property_id)
 and (m.agency_id=p_agency_id or kh_private.property_source_decider(p_actor_id,p_agency_id,m.property_id)) order by m.created_at desc,m.property_id,m.agency_id offset p_offset limit 31)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>30 then items-30 else items end,'hasMore',jsonb_array_length(items)>30);
end $$;
create function public.kh_resolve_agency_mandate_property(p_actor_id uuid,p_property_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare canonical uuid;begin
 perform kh_private.agency_account(p_actor_id);
 canonical:=coalesce((select canonical_id from kh_private.property_aliases where property_id=p_property_id),p_property_id);
 if not exists(select 1 from public.properties p where p.id=canonical and p.operation='sale' and p.moderation='approved' and p.availability='active' and not kh_private.is_suspended(p.owner_id) and not kh_private.is_deleting(p.owner_id)) then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 return jsonb_build_object('requestedPropertyId',p_property_id,'propertyId',canonical);
end $$;
revoke all on function public.kh_list_current_agency_mandates(uuid,uuid,integer),public.kh_resolve_agency_mandate_property(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kh_list_current_agency_mandates(uuid,uuid,integer),public.kh_resolve_agency_mandate_property(uuid,uuid) to authenticated;
