-- Structured proposals and shared occupancy. Private history retains original UUIDs.
-- Shared validation-free mutex; each entry point retains its own account rules.
create function kh_private.agency_common_flow_mutex(actor uuid,agency uuid,pid uuid,people uuid[]) returns void language plpgsql security definer set search_path='' as $$
 declare u uuid;pair record;canonical uuid;begin

 for u in select distinct unnest(array_append(people,actor)) order by 1 loop if u is not null then perform pg_advisory_xact_lock(hashtextextended('kh:account:'||u::text,0));end if;end loop;

 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||actor::text,0));
 -- At most the actor, buyer, current assignee and explicit target. Include
 -- every pair from this prepared set so later checks cannot add a late lock.
 for pair in with participants as(select distinct unnest(array_append(people,actor)) id)
 select a.id a,b.id b from participants a join participants b on a.id<b.id order by a.id,b.id loop
  perform kh_private.chat_pair_lock(pair.a,pair.b);
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('kh:property-aliases',0));canonical:=kh_private.agency_effective_property(pid);
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(array[agency],array[pid,canonical]));
 perform 1 from public.properties where id=canonical or id=pid or id in(select property_id from kh_private.property_aliases where canonical_id=canonical) order by id for update;
end $$;
create or replace function kh_private.agency_flow_locks(actor uuid,agency uuid,pid uuid,people uuid[]) returns void language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_prepare_account(actor);
 perform kh_private.agency_common_flow_mutex(actor,agency,pid,people);
 perform kh_private.agency_account(actor);
end $$;
create table kh_private.agency_proposals(
 id uuid primary key default gen_random_uuid(),deal_id uuid not null references kh_private.agency_deals(id),
 kind text not null check(kind in('visit','offer')),status text not null default 'pending' check(status in('pending','accepted','declined','cancelled','superseded','expired')),
 version integer not null default 1,created_by uuid not null,created_party text not null check(created_party in('team','buyer')),
 amount_usd numeric,visit_at timestamptz,duration_minutes integer,note text not null check(char_length(note)<=500),parent_id uuid references kh_private.agency_proposals(id),
 expires_at timestamptz not null,closed_reason text,created_at timestamptz not null default clock_timestamp(),
 check((kind='offer' and amount_usd is not null and amount_usd>0 and amount_usd<=1000000000 and amount_usd=round(amount_usd,2) and visit_at is null and duration_minutes is null)
 or(kind='visit' and amount_usd is null and visit_at is not null and duration_minutes is not null and duration_minutes in(30,60,90,120) and expires_at=visit_at))
);
create unique index agency_one_pending_proposal on kh_private.agency_proposals(deal_id,kind) where status='pending';
create table kh_private.agency_proposal_events(
 id uuid primary key default gen_random_uuid(),proposal_id uuid not null references kh_private.agency_proposals(id),actor_id uuid,party text not null check(party in('team','buyer','system')),
 action text not null,response_source text not null check(response_source in('digital','manual','system')),external_response jsonb,snapshot jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table kh_private.property_visit_slots(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references kh_private.agency_property_identities(property_id),agency_id uuid references kh_private.agencies(id),
 proposal_id uuid unique references kh_private.agency_proposals(id),personal_negotiation_id uuid unique,assignee_id uuid,
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),outcome text not null default 'unrecorded' check(outcome in('unrecorded','performed','no_show','cancelled')),
 version integer not null default 1,closed_reason text,joint_token uuid unique,joint_slot_id uuid references kh_private.property_visit_slots(id),existing_conflict boolean not null default false,
 check(num_nonnulls(proposal_id,personal_negotiation_id,joint_token)=1)
);
create index property_visit_times on kh_private.property_visit_slots(property_id,starts_at,ends_at);
create index manager_visit_times on kh_private.property_visit_slots(assignee_id,starts_at,ends_at);
create table kh_private.property_reservations(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references kh_private.agency_property_identities(property_id),agency_id uuid not null references kh_private.agencies(id),
 created_by uuid not null,expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),released_at timestamptz,closed_reason text,version integer not null default 1
);
-- Import all accepted visits, including past unresolved history. No exclusion
-- constraint can erase or reject historically overlapping commitments.
insert into kh_private.property_visit_slots(property_id,personal_negotiation_id,assignee_id,starts_at,ends_at)
 select c.property_id,n.id,c.seller_id,n.visit_at,n.visit_at+interval '60 minutes' from public.kh_negotiations n join public.kh_conversations c on c.id=n.conversation_id
 join kh_private.agency_property_identities i on i.property_id=c.property_id where n.kind='visit' and n.status='accepted';
update kh_private.property_visit_slots s set existing_conflict=true where exists(select 1 from kh_private.property_visit_slots other where s.id<>other.id and
 (kh_private.agency_effective_property(s.property_id)=kh_private.agency_effective_property(other.property_id) or s.assignee_id=other.assignee_id) and s.starts_at<other.ends_at and other.starts_at<s.ends_at);

create function kh_private.agency_proposal_json(p kh_private.agency_proposals) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'dealId',p.deal_id,'kind',p.kind,'status',case when p.status='pending' and p.expires_at<=statement_timestamp() then 'expired' else p.status end,'version',p.version,'createdBy',p.created_by,'amountUsd',p.amount_usd,'visitAt',p.visit_at,'durationMinutes',p.duration_minutes,'note',p.note,'parentId',p.parent_id,'expiresAt',p.expires_at,'closedReason',p.closed_reason)
$$;
create function kh_private.agency_visit_json(s kh_private.property_visit_slots) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('proposalId',s.proposal_id,'propertyId',s.property_id,'assigneeId',s.assignee_id,'startsAt',s.starts_at,'endsAt',s.ends_at,'outcome',s.outcome,'version',s.version)$$;
create function kh_private.agency_proposal_event(p kh_private.agency_proposals,actor uuid,party text,action text,external_response jsonb default null) returns void language sql set search_path='' as $$
 insert into kh_private.agency_proposal_events(proposal_id,actor_id,party,action,response_source,external_response,snapshot)values(p.id,actor,party,action,case when party='system' then 'system' when external_response is not null then 'manual' else 'digital' end,external_response,kh_private.agency_proposal_json(p))
$$;
create function kh_private.agency_scheduling_deal(actor uuid,agency uuid,deal uuid) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 declare before kh_private.agency_deals:=kh_private.agency_prepare_deal(actor,agency,deal);d kh_private.agency_deals;begin
 perform kh_private.agency_flow_locks(actor,before.agency_id,before.property_id,array[before.buyer_id,before.assignee_id]);
 d:=kh_private.agency_deal_access(actor,agency,deal);
 if d.assignee_id is distinct from before.assignee_id or d.buyer_id is distinct from before.buyer_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 perform 1 from kh_private.agency_deals where id=deal for update;return d;end $$;
create function kh_private.agency_scheduling_live(actor uuid,agency uuid,d kh_private.agency_deals) returns void language plpgsql security definer set search_path='' as $$begin
 if agency is not null then perform kh_private.agency_actor(actor,agency,'manager');end if;
 if d.closed_reason is not null or d.stage in('won','lost') or not kh_private.agency_flow_live(d.agency_id,d.property_id) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 if d.contact_kind='account' and (d.buyer_id is null or kh_private.is_suspended(d.buyer_id) or kh_private.is_deleting(d.buyer_id)) then raise exception 'KH_AGENCY_RECIPIENT_INVALID';end if;
 if kh_private.agency_pair_blocked(d.buyer_id,d.assignee_id) or kh_private.agency_pair_blocked(actor,d.buyer_id) then raise exception 'KH_CHAT_BLOCKED';end if;
end $$;
create function kh_private.agency_response_party(agency uuid,d kh_private.agency_deals,payload jsonb) returns text language plpgsql set search_path='' as $$
 declare e jsonb:=payload->'externalResponse';begin
 if e is not null then
  if agency is null or d.contact_kind<>'external' or jsonb_typeof(e)<>'object' or e-array['channel','reference']<>'{}'::jsonb or coalesce(e->>'channel','') not in('phone','in_person','whatsapp','other') then raise exception 'KH_AGENCY_INVALID_EXTERNAL_RESPONSE';end if;
  perform kh_private.agency_text(e->'reference',2,500);return 'buyer';
 end if;return case when agency is null then 'buyer' else 'team' end;end $$;
create function kh_private.agency_slot_live(s kh_private.property_visit_slots) returns boolean language sql stable set search_path='' as $$
 select s.outcome<>'cancelled' and (s.personal_negotiation_id is null or exists(select 1 from public.kh_negotiations where id=s.personal_negotiation_id and status='accepted'))
$$;
-- Caller holds sorted participant account locks and the common property group.
-- An assignee account lock serializes the same manager across different homes.
create function kh_private.agency_check_occupancy(pid uuid,manager uuid,starts timestamptz,ends timestamptz,joint uuid default null) returns void language plpgsql set search_path='' as $$begin
 if exists(select 1 from kh_private.property_reservations r where kh_private.agency_effective_property(r.property_id)=kh_private.agency_effective_property(pid) and r.released_at is null and r.expires_at>clock_timestamp()) then raise exception 'KH_AGENCY_PROPERTY_RESERVED';end if;
 if exists(select 1 from kh_private.property_visit_slots s where kh_private.agency_slot_live(s) and s.starts_at<ends and starts<s.ends_at and
 (kh_private.agency_effective_property(s.property_id)=kh_private.agency_effective_property(pid) or s.assignee_id=manager) and
 (joint is null or (s.id<>joint and s.joint_slot_id is distinct from joint))) then raise exception 'KH_AGENCY_VISIT_CONFLICT';end if;
end $$;
create function public.kh_list_agency_proposals(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_proposal_json(x) order by x.created_at desc,x.id),'[]') into items from(select * from kh_private.agency_proposals where deal_id=p_deal_id order by created_at desc,id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_create_agency_proposal(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals;p kh_private.agency_proposals;parent kh_private.agency_proposals;e kh_private.agency_proposals;r jsonb;party text;stamp timestamptz;visit timestamptz;amount numeric;duration integer;v_kind text:=p_payload->>'kind';note text;begin
 perform kh_private.agency_require_enabled();
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['dealId','kind','note','amountUsd','visitDate','visitTime','durationMinutes','replacesId','expectedVersion','externalResponse','clientRequestId']<>'{}'::jsonb or coalesce(v_kind,'') not in('visit','offer') then raise exception 'KH_NEG_INVALID_PAYLOAD';end if;
 d:=kh_private.agency_scheduling_deal(p_actor_id,p_agency_id,(p_payload->>'dealId')::uuid);
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'create_proposal',p_payload);if r is not null then select * into p from kh_private.agency_proposals where id=(r->>'id')::uuid;return kh_private.agency_proposal_json(p);end if;
 perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);party:=kh_private.agency_response_party(p_agency_id,d,p_payload);stamp:=clock_timestamp();
 note:=kh_private.agency_text(p_payload->'note',0,500);
 if v_kind='offer' then
  if coalesce(p_payload->>'amountUsd','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or p_payload ?| array['visitDate','visitTime','durationMinutes'] then raise exception 'KH_NEG_INVALID_AMOUNT';end if;
  amount:=(p_payload->>'amountUsd')::numeric;if amount<=0 or amount>1000000000 then raise exception 'KH_NEG_INVALID_AMOUNT';end if;
 else
  if p_payload?'amountUsd' then raise exception 'KH_NEG_INVALID_PAYLOAD';end if;
  visit:=kh_private.negotiation_visit(p_payload->>'visitDate',p_payload->>'visitTime');duration:=coalesce((p_payload->>'durationMinutes')::integer,60);
  if visit<=stamp or visit>stamp+interval '180 days' or duration not in(30,60,90,120) then raise exception 'KH_NEG_INVALID_VISIT';end if;
 end if;
 if p_payload?'replacesId' then
  select * into parent from kh_private.agency_proposals where id=(p_payload->>'replacesId')::uuid and deal_id=d.id for update;
  if parent.id is null or parent.kind<>v_kind or parent.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_NEG_VERSION_CONFLICT';end if;
  if parent.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE';end if;
  if parent.expires_at<=stamp then raise exception 'KH_NEG_EXPIRED';end if;
  if parent.created_party=party then raise exception 'KH_NEG_NOT_YOUR_TURN';end if;
  update kh_private.agency_proposals set status='superseded',version=version+1 where id=parent.id returning * into parent;
  perform kh_private.agency_proposal_event(parent,p_actor_id,party,'superseded',p_payload->'externalResponse');
 elsif p_payload?'expectedVersion' then raise exception 'KH_NEG_INVALID_PAYLOAD';end if;
 for e in update kh_private.agency_proposals set status='expired',version=version+1 where deal_id=d.id and status='pending' and expires_at<=stamp returning * loop perform kh_private.agency_proposal_event(e,p_actor_id,'system','expired');end loop;
 if exists(select 1 from kh_private.agency_proposals where deal_id=d.id and kind=v_kind and status='pending') then raise exception 'KH_NEG_PENDING_EXISTS';end if;
 insert into kh_private.agency_proposals(deal_id,kind,created_by,created_party,amount_usd,visit_at,duration_minutes,note,parent_id,expires_at)
 values(d.id,v_kind,p_actor_id,party,amount,visit,duration,note,parent.id,coalesce(visit,stamp+interval '7 days'))returning * into p;
 perform kh_private.agency_proposal_event(p,p_actor_id,party,'created',p_payload->'externalResponse');
 update kh_private.agency_deals set stage=case when v_kind='offer' then 'offer' else 'visit_proposed' end,version=version+1 where id=d.id;
 return kh_private.agency_remember(p_actor_id,d.agency_id,'create_proposal',p_payload,kh_private.agency_proposal_json(p));end $$;
create function public.kh_respond_agency_proposal(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals;p kh_private.agency_proposals;r jsonb;party text;action text:=p_payload->>'action';joint kh_private.property_visit_slots;stamp timestamptz;begin
 perform kh_private.agency_require_enabled();
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['proposalId','action','expectedVersion','clientRequestId','externalResponse','jointVisitToken']<>'{}'::jsonb or coalesce(action,'') not in('accept','decline','cancel') then raise exception 'KH_NEG_INVALID_PAYLOAD';end if;
 select * into p from kh_private.agency_proposals where id=(p_payload->>'proposalId')::uuid;if p.id is null then raise exception 'KH_NEG_NOT_FOUND';end if;
 d:=kh_private.agency_scheduling_deal(p_actor_id,p_agency_id,p.deal_id);
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'respond_proposal',p_payload);if r is not null then select * into p from kh_private.agency_proposals where id=p.id;return kh_private.agency_proposal_json(p);end if;
 select * into p from kh_private.agency_proposals where id=p.id for update;stamp:=clock_timestamp();party:=kh_private.agency_response_party(p_agency_id,d,p_payload);
 if p.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_NEG_VERSION_CONFLICT';end if;
 if action='cancel' then
  if p.status not in('pending','accepted') then raise exception 'KH_NEG_INVALID_STATE';end if;
  if p.status='pending' and p.created_party<>party then raise exception 'KH_NEG_NOT_YOUR_TURN';end if;
 else
  perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
  if p.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE';end if;
  if p.created_party=party then raise exception 'KH_NEG_NOT_YOUR_TURN';end if;
 end if;
 if p.status='pending' and p.expires_at<=stamp then raise exception 'KH_NEG_EXPIRED';end if;
 if action='accept' and p.kind='visit' then
  if d.assignee_id is null or not kh_private.agency_contact_member(d.agency_id,d.assignee_id) then raise exception 'KH_AGENCY_ASSIGNEE_REQUIRED';end if;
  if p_payload?'jointVisitToken' then
   select * into joint from kh_private.property_visit_slots where joint_token=(p_payload->>'jointVisitToken')::uuid;
   if joint.id is null or joint.outcome='cancelled' or not kh_private.agency_flow_live(joint.agency_id,joint.property_id) or joint.starts_at<>p.visit_at or joint.ends_at<>p.visit_at+make_interval(mins=>p.duration_minutes) or kh_private.agency_effective_property(joint.property_id)<>kh_private.agency_effective_property(d.property_id) then raise exception 'KH_AGENCY_JOINT_PERMISSION_REQUIRED';end if;
  end if;
  perform kh_private.agency_check_occupancy(d.property_id,d.assignee_id,p.visit_at,p.visit_at+make_interval(mins=>p.duration_minutes),joint.id);
  insert into kh_private.property_visit_slots(property_id,agency_id,proposal_id,assignee_id,starts_at,ends_at,joint_slot_id)values(d.property_id,d.agency_id,p.id,d.assignee_id,p.visit_at,p.visit_at+make_interval(mins=>p.duration_minutes),joint.id);
  update kh_private.agency_deals set stage='visit_confirmed',version=version+1 where id=d.id;
 end if;
 if action='cancel' then
  if exists(select 1 from kh_private.property_visit_slots where proposal_id=p.id and outcome in('performed','no_show')) then raise exception 'KH_AGENCY_OUTCOME_RECORDED';end if;
  update kh_private.property_visit_slots set outcome='cancelled',version=version+1,closed_reason='cancelled' where proposal_id=p.id and outcome='unrecorded';
 end if;
 update kh_private.agency_proposals set status=case action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,version=version+1 where id=p.id returning * into p;
 perform kh_private.agency_proposal_event(p,p_actor_id,party,p.status,p_payload->'externalResponse');
 return kh_private.agency_remember(p_actor_id,d.agency_id,'respond_proposal',p_payload,kh_private.agency_proposal_json(p));end $$;
create function public.kh_record_agency_visit_outcome(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare p kh_private.agency_proposals;d kh_private.agency_deals;s kh_private.property_visit_slots;r jsonb;v_outcome text:=p_payload->>'outcome';begin
 perform kh_private.agency_require_enabled();
 if p_agency_id is null or coalesce(v_outcome,'') not in('performed','no_show','cancelled') or p_payload-array['proposalId','outcome','expectedVersion','clientRequestId']<>'{}'::jsonb then raise exception 'KH_AGENCY_INVALID';end if;
 select * into p from kh_private.agency_proposals where id=(p_payload->>'proposalId')::uuid;d:=kh_private.agency_scheduling_deal(p_actor_id,p_agency_id,p.deal_id);
 -- Historical visibility is not permission to add a fact while suspended.
 -- The scheduling helper has already taken the common ordered locks.
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'manager');
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'visit_outcome',p_payload);if r is not null then select * into s from kh_private.property_visit_slots where proposal_id=p.id;return kh_private.agency_visit_json(s);end if;
 select * into s from kh_private.property_visit_slots where proposal_id=p.id for update;
 if s.id is null or s.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_NEG_VERSION_CONFLICT';end if;
 if s.outcome<>'unrecorded' then raise exception 'KH_AGENCY_OUTCOME_RECORDED';end if;
 if v_outcome<>'cancelled' and s.starts_at>clock_timestamp() then raise exception 'KH_AGENCY_VISIT_NOT_STARTED';end if;
 update kh_private.property_visit_slots set outcome=v_outcome,version=version+1 where id=s.id returning * into s;
 if v_outcome='performed' and d.closed_reason is null then update kh_private.agency_deals set stage='visited',version=version+1 where id=d.id;end if;
 if v_outcome='cancelled' then update kh_private.agency_proposals set status='cancelled',version=version+1 where id=p.id returning * into p;end if;
 perform kh_private.agency_proposal_event(p,p_actor_id,'team','visit_'||v_outcome);
 return kh_private.agency_remember(p_actor_id,d.agency_id,'visit_outcome',p_payload,kh_private.agency_visit_json(s));end $$;
create function kh_private.agency_origin_schedule(actor uuid,agency uuid,pid uuid,require_live boolean default true) returns void language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_flow_locks(actor,agency,pid,'{}');
 perform kh_private.agency_actor(actor,agency,'admin');
 if not exists(select 1 from kh_private.agency_property_origins where property_id=kh_private.agency_effective_property(pid) and origin_agency_id=agency) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 if require_live and not kh_private.agency_flow_live(agency,pid) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;end $$;
create function kh_private.agency_reservation_json(r kh_private.property_reservations) returns jsonb language sql volatile set search_path='' as $$select jsonb_build_object('id',r.id,'propertyId',r.property_id,'agencyId',r.agency_id,'expiresAt',r.expires_at,'releasedAt',r.released_at,'version',r.version,'active',r.released_at is null and r.expires_at>clock_timestamp())$$;
create function public.kh_set_agency_reservation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid:=(p_payload->>'propertyId')::uuid;expires timestamptz;reservation kh_private.property_reservations;r jsonb;begin
 perform kh_private.agency_require_enabled();
 if p_payload-array['propertyId','expiresAt','clientRequestId']<>'{}'::jsonb then raise exception 'KH_AGENCY_INVALID';end if;
 perform kh_private.agency_origin_schedule(p_actor_id,p_agency_id,pid);
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'reserve_property',p_payload);if r is not null then select * into reservation from kh_private.property_reservations where id=(r->>'id')::uuid;return kh_private.agency_reservation_json(reservation);end if;
 expires:=(p_payload->>'expiresAt')::timestamptz;
 if expires is null or expires<=clock_timestamp() or expires>clock_timestamp()+interval '7 days' then raise exception 'KH_AGENCY_INVALID_EXPIRY';end if;
 if exists(select 1 from kh_private.property_reservations where kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(pid) and released_at is null and expires_at>clock_timestamp()) then raise exception 'KH_AGENCY_PROPERTY_RESERVED';end if;
 insert into kh_private.property_reservations(property_id,agency_id,created_by,expires_at)values(pid,p_agency_id,p_actor_id,expires)returning * into reservation;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency_id,p_actor_id,'property_reserved',reservation.id);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'reserve_property',p_payload,kh_private.agency_reservation_json(reservation));end $$;
create function public.kh_release_agency_reservation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare s kh_private.property_reservations;r jsonb;begin
 perform kh_private.agency_require_enabled();
 if p_payload-array['reservationId','expectedVersion','clientRequestId']<>'{}'::jsonb then raise exception 'KH_AGENCY_INVALID';end if;
 select * into s from kh_private.property_reservations where id=(p_payload->>'reservationId')::uuid and agency_id=p_agency_id;if s.id is null then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 perform kh_private.agency_origin_schedule(p_actor_id,p_agency_id,s.property_id,false);
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'release_reservation',p_payload);if r is not null then select * into s from kh_private.property_reservations where id=s.id;return kh_private.agency_reservation_json(s);end if;
 select * into s from kh_private.property_reservations where id=s.id for update;
 if s.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_NEG_VERSION_CONFLICT';end if;
 update kh_private.property_reservations set released_at=clock_timestamp(),closed_reason='released',version=version+1 where id=s.id returning * into s;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency_id,p_actor_id,'reservation_released',s.id);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'release_reservation',p_payload,kh_private.agency_reservation_json(s));end $$;
create function public.kh_create_joint_visit_slot(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid:=(p_payload->>'propertyId')::uuid;starts timestamptz;duration integer:=coalesce((p_payload->>'durationMinutes')::integer,60);s kh_private.property_visit_slots;r jsonb;begin
 perform kh_private.agency_require_enabled();
 if p_payload-array['propertyId','visitDate','visitTime','durationMinutes','clientRequestId']<>'{}'::jsonb then raise exception 'KH_AGENCY_INVALID';end if;
 perform kh_private.agency_origin_schedule(p_actor_id,p_agency_id,pid);
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'joint_visit_slot',p_payload);if r is not null then return r;end if;
 starts:=kh_private.negotiation_visit(p_payload->>'visitDate',p_payload->>'visitTime');
 if starts<=clock_timestamp() or starts>clock_timestamp()+interval '180 days' or duration not in(30,60,90,120) then raise exception 'KH_NEG_INVALID_VISIT';end if;
 perform kh_private.agency_check_occupancy(pid,null,starts,starts+make_interval(mins=>duration));
 insert into kh_private.property_visit_slots(property_id,agency_id,starts_at,ends_at,joint_token)values(pid,p_agency_id,starts,starts+make_interval(mins=>duration),gen_random_uuid())returning * into s;
 return kh_private.agency_remember(p_actor_id,p_agency_id,'joint_visit_slot',p_payload,jsonb_build_object('id',s.id,'propertyId',pid,'token',s.joint_token,'startsAt',s.starts_at,'endsAt',s.ends_at));end $$;
create function public.kh_join_joint_visit_slot(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_require_enabled();
 if p_agency_id is null or not(p_payload?'jointVisitToken') or p_payload?'action' then raise exception 'KH_AGENCY_JOINT_PERMISSION_REQUIRED';end if;
 return public.kh_respond_agency_proposal(p_actor_id,p_agency_id,p_payload||jsonb_build_object('action','accept'));end $$;
create function public.kh_agency_calendar(p_actor_id uuid,p_agency_id uuid,p_from timestamptz,p_to timestamptz,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform kh_private.agency_account(p_actor_id);
 if p_agency_id is null or not kh_private.agency_contact_member(p_agency_id,p_actor_id) then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to>p_from+interval '366 days' or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(x.item order by x.starts_at,x.id),'[]') into items from(select s.id,s.starts_at,kh_private.agency_visit_json(s)||jsonb_build_object('dealId',d.id,'agencyId',d.agency_id,'buyerId',d.buyer_id,'contactName',coalesce(d.private_contact->>'name',(select display_name from public.profiles where id=d.buyer_id),'Comprador con cuenta'),'assigneeName',case when s.assignee_id is null then 'Sin asignar' else coalesce((select display_name from public.profiles where id=s.assignee_id),'Cuenta eliminada') end,'propertyTitle',coalesce(p.title,i.title,'Vivienda'),'existingConflict',s.existing_conflict) item
 from kh_private.property_visit_slots s join kh_private.agency_proposals proposal on proposal.id=s.proposal_id join kh_private.agency_deals d on d.id=proposal.deal_id left join public.properties p on p.id=d.property_id join kh_private.agency_property_identities i on i.property_id=d.property_id
 where kh_private.agency_deal_visible(p_actor_id,p_agency_id,d) and s.starts_at<p_to and s.ends_at>p_from order by s.starts_at,s.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_property_visit_occupancy(p_actor_id uuid,p_agency_id uuid,p_property_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;begin perform kh_private.agency_account(p_actor_id);
 if not kh_private.agency_contact_member(p_agency_id,p_actor_id) or not kh_private.agency_flow_live(p_agency_id,p_property_id) then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to>p_from+interval '31 days' then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('startsAt',starts_at,'endsAt',ends_at) order by starts_at,ends_at),'[]') into result from(
 select distinct s.starts_at,s.ends_at from kh_private.property_visit_slots s where kh_private.agency_slot_live(s) and kh_private.agency_effective_property(s.property_id)=kh_private.agency_effective_property(p_property_id) and s.starts_at<p_to and s.ends_at>p_from
 union select greatest(r.created_at,p_from),least(r.expires_at,p_to) from kh_private.property_reservations r where kh_private.agency_effective_property(r.property_id)=kh_private.agency_effective_property(p_property_id) and r.released_at is null and r.expires_at>clock_timestamp() and r.created_at<p_to and r.expires_at>p_from)x;return result;end $$;

-- Extend both lifecycle hooks before the prior implementation clears assignees.
alter function kh_private.terminate_mandate_flows(uuid,uuid,text) rename to terminate_mandate_flows_pre_scheduling;
alter function kh_private.terminate_agency_member_flows(uuid,uuid,text) rename to terminate_agency_member_flows_pre_scheduling;
create function kh_private.agency_terminate_scheduling(deals uuid[],reason text) returns void language plpgsql set search_path='' as $$declare p kh_private.agency_proposals;begin
 for p in update kh_private.agency_proposals target set status='cancelled',closed_reason=reason,version=version+1 where target.deal_id=any(deals) and (target.status='pending' and target.expires_at>clock_timestamp() or target.status='accepted' and target.kind='visit' and exists(select 1 from kh_private.property_visit_slots s where s.proposal_id=target.id and s.outcome='unrecorded' and s.starts_at>clock_timestamp())) returning target.* loop
  perform kh_private.agency_proposal_event(p,auth.uid(),'system',reason);
 end loop;
 update kh_private.property_visit_slots s set outcome='cancelled',closed_reason=reason,version=version+1 where s.proposal_id in(select id from kh_private.agency_proposals where deal_id=any(deals)) and s.outcome='unrecorded' and s.starts_at>clock_timestamp();end $$;
create function kh_private.terminate_mandate_flows(p_property_id uuid,p_agency_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_terminate_scheduling((select array_agg(id) from kh_private.agency_deals where agency_id=p_agency_id and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id)),p_reason);
 update kh_private.property_visit_slots set outcome='cancelled',closed_reason=p_reason,version=version+1 where agency_id=p_agency_id and joint_token is not null and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id) and outcome='unrecorded' and starts_at>clock_timestamp();
 update kh_private.property_reservations set released_at=clock_timestamp(),closed_reason=p_reason,version=version+1 where agency_id=p_agency_id and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id) and released_at is null;
 perform kh_private.terminate_mandate_flows_pre_scheduling(p_property_id,p_agency_id,p_reason);end $$;
create function kh_private.terminate_agency_member_flows(p_agency_id uuid,p_user_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 -- Membership ends responsibility, not the agency's commitment. Retain the
 -- property booking and proposal history; completed outcomes keep their actor.
 update kh_private.property_visit_slots set assignee_id=null,version=version+1 where agency_id=p_agency_id and assignee_id=p_user_id and outcome='unrecorded';
 perform kh_private.terminate_agency_member_flows_pre_scheduling(p_agency_id,p_user_id,p_reason);end $$;
-- Personal create and respond keep the established validation/receipts/chat
-- events. The wrapper takes common locks BEFORE the legacy conversation lock.
alter function public.kh_create_negotiation(uuid,jsonb) rename to kh_create_negotiation_pre_scheduling;
alter function public.kh_create_negotiation_pre_scheduling(uuid,jsonb) set schema kh_private;
alter function public.kh_respond_negotiation(uuid,jsonb) rename to kh_respond_negotiation_pre_scheduling;
alter function public.kh_respond_negotiation_pre_scheduling(uuid,jsonb) set schema kh_private;
create function kh_private.agency_personal_schedule_lock(actor uuid,conversation uuid) returns public.kh_conversations language plpgsql security definer set search_path='' as $$
 declare c public.kh_conversations;after public.kh_conversations;begin perform kh_private.agency_prepare_account(actor);
 select * into c from public.kh_conversations where id=conversation and actor in(buyer_id,seller_id);if c.id is null then raise exception 'KH_NEG_NOT_FOUND';end if;
 perform kh_private.agency_common_flow_mutex(actor,null,c.property_id,array[c.buyer_id,c.seller_id]);
 perform kh_private.require_active();
 select * into after from public.kh_conversations where id=conversation;
 if after.buyer_id is distinct from c.buyer_id or after.seller_id is distinct from c.seller_id or after.property_id is distinct from c.property_id then raise exception 'KH_NEG_VERSION_CONFLICT';end if;return c;end $$;
create function public.kh_create_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.kh_conversations;begin
 c:=kh_private.agency_personal_schedule_lock(p_actor_id,(p_payload->>'conversationId')::uuid);
 if not exists(select 1 from kh_private.negotiation_requests where actor_id=p_actor_id and client_request_id=(p_payload->>'clientRequestId')::uuid) and exists(select 1 from kh_private.agency_property_origins where property_id=kh_private.agency_effective_property(c.property_id)) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 return kh_private.kh_create_negotiation_pre_scheduling(p_actor_id,p_payload);end $$;
create function public.kh_respond_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare p public.kh_negotiations;c public.kh_conversations;r jsonb;replay boolean;begin
 select * into p from public.kh_negotiations where id=(p_payload->>'id')::uuid;c:=kh_private.agency_personal_schedule_lock(p_actor_id,p.conversation_id);

 select exists(select 1 from kh_private.negotiation_requests where actor_id=p_actor_id and client_request_id=(p_payload->>'clientRequestId')::uuid) into replay;
 if not replay and p_payload->>'action'<>'cancel' and exists(select 1 from kh_private.agency_property_origins where property_id=kh_private.agency_effective_property(c.property_id)) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 -- Run the one legacy validator first. Any occupancy exception rolls back its
 -- status, receipt and chat event together, under the already held common locks.
 r:=kh_private.kh_respond_negotiation_pre_scheduling(p_actor_id,p_payload);
 if not replay and p.kind='visit' and p_payload->>'action'='accept' then
  perform kh_private.agency_check_occupancy(c.property_id,c.seller_id,p.visit_at,p.visit_at+interval '60 minutes');
  insert into kh_private.property_visit_slots(property_id,personal_negotiation_id,assignee_id,starts_at,ends_at)values(c.property_id,p.id,c.seller_id,p.visit_at,p.visit_at+interval '60 minutes');
 elsif not replay and p_payload->>'action'='cancel' then update kh_private.property_visit_slots set outcome='cancelled',version=version+1 where personal_negotiation_id=p.id and outcome='unrecorded';end if;return r;end $$;
-- Personal compatibility rows alone never turn a personal listing into business
-- history. Remove them BEFORE Task7 purges its registry; keep private histories.
create function kh_private.agency_personal_slot_delete() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not kh_private.property_has_business_history(old.id) then
  delete from kh_private.property_visit_slots where property_id=old.id and personal_negotiation_id is not null;
 else
  update kh_private.property_visit_slots set outcome='cancelled',closed_reason='personal_source_deleted',version=version+1 where property_id=old.id and personal_negotiation_id is not null and outcome='unrecorded' and starts_at>clock_timestamp();
 end if;return old;end $$;
create trigger kh_agency_000_personal_slot_delete before delete on public.properties for each row execute function kh_private.agency_personal_slot_delete();
do $$declare t text;f record;begin
 foreach t in array array['agency_proposals','agency_proposal_events','property_visit_slots','property_reservations'] loop execute format('alter table kh_private.%I enable row level security',t);execute format('revoke all on kh_private.%I from public,anon,authenticated',t);execute format('grant all on kh_private.%I to service_role',t);end loop;
 for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='kh_private' and p.proname=any(array['agency_common_flow_mutex','agency_flow_locks','agency_proposal_json','agency_visit_json','agency_proposal_event','agency_scheduling_deal','agency_scheduling_live','agency_response_party','agency_slot_live','agency_check_occupancy','agency_origin_schedule','agency_reservation_json','agency_terminate_scheduling','agency_personal_schedule_lock','agency_personal_slot_delete','terminate_mandate_flows','terminate_agency_member_flows','terminate_mandate_flows_pre_scheduling','terminate_agency_member_flows_pre_scheduling','kh_create_negotiation_pre_scheduling','kh_respond_negotiation_pre_scheduling'])) or
 (n.nspname='public' and p.proname=any(array['kh_list_agency_proposals','kh_create_agency_proposal','kh_respond_agency_proposal','kh_record_agency_visit_outcome','kh_set_agency_reservation','kh_release_agency_reservation','kh_create_joint_visit_slot','kh_join_joint_visit_slot','kh_agency_calendar','kh_property_visit_occupancy','kh_create_negotiation','kh_respond_negotiation'])) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;end loop;end $$;


-- Event history is scoped by the current deal access contract, never a receipt dump.
create function public.kh_list_agency_proposal_events(p_actor_id uuid,p_agency_id uuid,p_proposal_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare p kh_private.agency_proposals;items jsonb;begin
 select * into p from kh_private.agency_proposals where id=p_proposal_id;if p.id is null then raise exception 'KH_NEG_NOT_FOUND';end if;
 perform kh_private.agency_deal_access(p_actor_id,p_agency_id,p.deal_id);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'proposalId',e.proposal_id,'actorId',u.id,'party',e.party,'action',e.action,'responseSource',e.response_source,'externalResponse',e.external_response,'createdAt',e.created_at) order by e.created_at desc,e.id),'[]') into items
 from(select * from kh_private.agency_proposal_events where proposal_id=p_proposal_id order by created_at desc,id offset p_offset limit p_limit+1)e left join auth.users u on u.id=e.actor_id;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
revoke all on function public.kh_list_agency_proposal_events(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.kh_list_agency_proposal_events(uuid,uuid,uuid,integer,integer) to authenticated;
create function public.kh_get_agency_reservation(p_actor_id uuid,p_agency_id uuid,p_property_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r kh_private.property_reservations;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'admin');
 if not exists(select 1 from kh_private.agency_property_origins where property_id=kh_private.agency_effective_property(p_property_id) and origin_agency_id=p_agency_id) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 select * into r from kh_private.property_reservations where agency_id=p_agency_id and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id) and released_at is null and expires_at>clock_timestamp() order by created_at desc,id limit 1;
 return case when r.id is null then null else kh_private.agency_reservation_json(r) end;end $$;
revoke all on function public.kh_get_agency_reservation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kh_get_agency_reservation(uuid,uuid,uuid) to authenticated;
