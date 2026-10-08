-- One transaction closes the complete canonical alias group. Delivery is deferred.
create table kh_private.agency_sale_requests(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references kh_private.agency_property_identities(property_id),cycle_id uuid not null references kh_private.commercial_cycles(id),
 origin_agency_id uuid references kh_private.agencies(id),personal_source_id uuid,authority_version integer not null,property_version integer not null,
 executing_agency_id uuid not null references kh_private.agencies(id),executing_manager_id uuid not null,winning_deal_id uuid not null references kh_private.agency_deals(id),
 deal_version integer not null,mandate_version integer not null,winning_proposal_id uuid references kh_private.agency_proposals(id),winning_proposal_version integer,
 amount_usd numeric not null check(amount_usd>0 and amount_usd<=1000000000 and amount_usd=round(amount_usd,2)),occurred_at timestamptz not null,
 state text not null default 'pending' check(state in('pending','confirmed','rejected','cancelled')),version integer not null default 1,
 requested_by uuid not null,buyer_label text not null,evidence_summary text not null,created_at timestamptz not null default clock_timestamp(),decided_by uuid,decided_at timestamptz,note text
);
create index agency_sale_request_page on kh_private.agency_sale_requests(origin_agency_id,executing_agency_id,created_at desc,id);
create table kh_private.property_sale_closures(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references kh_private.agency_property_identities(property_id),cycle_id uuid not null unique references kh_private.commercial_cycles(id),
 request_id uuid unique references kh_private.agency_sale_requests(id),origin_agency_id uuid references kh_private.agencies(id),executing_agency_id uuid references kh_private.agencies(id),executing_manager_id uuid,
 confirmed_by uuid not null,confirmed_at timestamptz not null default clock_timestamp(),amount_usd numeric,occurred_at timestamptz,
 check((request_id is null and executing_agency_id is null and executing_manager_id is null and amount_usd is null) or (request_id is not null and executing_agency_id is not null and executing_manager_id is not null and amount_usd is not null))
);
-- Minimal per-subject outbox evidence, never the winning buyer/amount/foreign notes.
create table kh_private.commercial_termination_events(
 id uuid primary key default gen_random_uuid(),closure_id uuid not null references kh_private.property_sale_closures(id),property_id uuid not null references kh_private.agency_property_identities(property_id),
 subject_kind text not null check(subject_kind in('agency_deal','personal_conversation')),subject_id uuid not null,agency_id uuid,recipient_id uuid,
 reason text not null default 'property_sold',state text not null default 'pending' check(state in('pending','delivered','failed','cancelled')),attempts integer not null default 0,created_at timestamptz not null default clock_timestamp(),delivered_at timestamptz,
 unique(closure_id,subject_kind,subject_id,recipient_id)
);
alter table public.kh_negotiations add column termination_reason text;
do $$declare t text;begin foreach t in array array['agency_sale_requests','property_sale_closures','commercial_termination_events'] loop execute format('alter table kh_private.%I enable row level security',t);execute format('revoke all on kh_private.%I from public,anon,authenticated',t);execute format('grant all on kh_private.%I to service_role',t);end loop;end $$;

create function kh_private.sale_group_people(pid uuid) returns uuid[] language sql stable set search_path='' as $$
 with group_ids as(select property_id id from kh_private.agency_property_identities where kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(pid)),people as(
 select owner_id id from public.properties where id in(select id from group_ids)
 union select buyer_id from kh_private.agency_deals where property_id in(select id from group_ids)
 union select assignee_id from kh_private.agency_deals where property_id in(select id from group_ids)
 union select buyer_id from public.kh_conversations where property_id in(select id from group_ids)
 union select seller_id from public.kh_conversations where property_id in(select id from group_ids)
 union select assignee_id from kh_private.property_visit_slots where property_id in(select id from group_ids)
 union select t.assignee_id from kh_private.agency_tasks t join kh_private.agency_deals d on d.id=t.deal_id where d.property_id in(select id from group_ids)
 )select coalesce(array_agg(id order by id)filter(where id is not null),'{}') from people
$$;
create function kh_private.sale_group_lock(actor uuid,agency uuid,pid uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare people uuid[]:=kh_private.sale_group_people(pid);canonical uuid:=kh_private.agency_effective_property(pid);begin
 perform kh_private.agency_prepare_account(actor);perform kh_private.agency_common_flow_mutex(actor,agency,pid,people);
 if canonical<>kh_private.agency_effective_property(pid) or people is distinct from kh_private.sale_group_people(pid) then raise exception 'KH_AGENCY_SALE_STALE';end if;
 if not exists(select 1 from public.properties where id=canonical) then raise exception 'KH_AGENCY_PROPERTY_NOT_FOUND';end if;
 -- Subjects follow sorted agency/property locks. Other flow writers use this prefix.
 perform 1 from kh_private.commercial_cycles where kh_private.agency_effective_property(property_id)=canonical order by id for update;
 perform 1 from kh_private.agency_deals where kh_private.agency_effective_property(property_id)=canonical order by id for update;
 perform 1 from kh_private.agency_proposals where deal_id in(select id from kh_private.agency_deals where kh_private.agency_effective_property(property_id)=canonical) order by id for update;
 perform 1 from kh_private.property_visit_slots where kh_private.agency_effective_property(property_id)=canonical order by id for update;
 perform 1 from kh_private.agency_sale_requests where property_id=canonical order by id for update;
 return canonical;
end $$;
create function kh_private.sale_latest_offer(deal uuid) returns uuid language sql stable set search_path='' as $$
 select p.id from kh_private.agency_proposals p join kh_private.agency_proposal_events e on e.proposal_id=p.id and e.action='accepted'
 where p.deal_id=deal and p.kind='offer' and p.status='accepted' and p.closed_reason is null order by e.created_at desc,e.id desc,p.id desc limit 1
$$;
create function kh_private.sale_closure_json(c kh_private.property_sale_closures) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',c.id,'propertyId',c.property_id,'cycleId',c.cycle_id,'requestId',c.request_id,'originAgencyId',c.origin_agency_id,'executingAgencyId',c.executing_agency_id,'executingManagerId',c.executing_manager_id,'confirmedBy',c.confirmed_by,'confirmedAt',c.confirmed_at,'amountUsd',c.amount_usd)$$;
create function kh_private.sale_request_visible(actor uuid,agency uuid,r kh_private.agency_sale_requests) returns boolean language sql stable security definer set search_path='' as $$
 select kh_private.property_source_decider(actor,agency,r.property_id) or agency=r.executing_agency_id and exists(select 1 from kh_private.agency_deals d where d.id=r.winning_deal_id and kh_private.agency_deal_visible(actor,agency,d))
$$;
create function kh_private.sale_request_json(actor uuid,agency uuid,r kh_private.agency_sale_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'propertyId',r.property_id,'cycleId',r.cycle_id,'originAgencyId',r.origin_agency_id,'executingAgencyId',r.executing_agency_id,'executingManagerId',r.executing_manager_id,'winningDealId',r.winning_deal_id,'amountUsd',r.amount_usd,'occurredAt',r.occurred_at,'state',r.state,'version',r.version,
 'propertyTitle',coalesce((select title from public.properties where id=r.property_id),(select title from kh_private.agency_property_identities where property_id=r.property_id)),'executingAgencyName',(select trade_name from kh_private.agencies where id=r.executing_agency_id),'executingManagerName',coalesce((select display_name from public.profiles where id=r.executing_manager_id),'Cuenta eliminada'),'buyerLabel',r.buyer_label,'evidenceSummary',r.evidence_summary,
 'expectedPropertyVersion',coalesce((select version from public.properties where id=r.property_id),r.property_version),'expectedAuthorityVersion',coalesce((select authority_version from kh_private.agency_property_origins where property_id=r.property_id),1),
 'affectedVisits',(select count(*) from kh_private.property_visit_slots where kh_private.agency_effective_property(property_id)=r.property_id and outcome='unrecorded' and starts_at>statement_timestamp()),
 'affectedDeals',(select count(*) from kh_private.agency_deals where kh_private.agency_effective_property(property_id)=r.property_id and closed_reason is null and stage not in('won','lost')),
 'canDecide',r.state='pending' and kh_private.property_source_decider(actor,agency,r.property_id),'canCancel',r.state='pending' and agency=r.executing_agency_id and kh_private.sale_request_visible(actor,agency,r),
 'closure',(select kh_private.sale_closure_json(c) from kh_private.property_sale_closures c where request_id=r.id))
$$;
create function public.kh_request_agency_sale(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare before kh_private.agency_deals;d kh_private.agency_deals;pid uuid;p public.properties;o kh_private.agency_property_origins;r kh_private.agency_sale_requests;receipt jsonb;offer uuid;begin
 before:=kh_private.agency_prepare_deal(p_actor_id,p_agency_id,(p_payload->>'winningDealId')::uuid);
 pid:=kh_private.sale_group_lock(p_actor_id,p_agency_id,before.property_id);perform kh_private.agency_actor(p_actor_id,p_agency_id,'manager');d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,before.id);
 receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'request_agency_sale',p_payload);if receipt is not null then return receipt;end if;
 perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
 if d.assignee_id is distinct from before.assignee_id or d.buyer_id is distinct from before.buyer_id then raise exception 'KH_AGENCY_SALE_STALE';end if;
 if p_payload-array['winningDealId','executingManagerId','amountUsd','occurredAt','expectedPropertyVersion','expectedAuthorityVersion','clientRequestId']<>'{}'::jsonb then raise exception 'KH_AGENCY_SALE_INVALID';end if;
 if d.assignee_id is null or d.assignee_id is distinct from (p_payload->>'executingManagerId')::uuid or not kh_private.agency_contact_member(d.agency_id,d.assignee_id) then raise exception 'KH_AGENCY_SALE_EXECUTOR';end if;
 select * into p from public.properties where id=pid;select * into o from kh_private.agency_property_origins where property_id=pid;
 if p.version is distinct from (p_payload->>'expectedPropertyVersion')::integer or coalesce(o.authority_version,1) is distinct from (p_payload->>'expectedAuthorityVersion')::integer then raise exception 'KH_AGENCY_SALE_STALE';end if;
 if jsonb_typeof(p_payload->'occurredAt') is distinct from 'string' or (p_payload->>'occurredAt') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'KH_AGENCY_SALE_INVALID';end if;
 if jsonb_typeof(p_payload->'amountUsd') is distinct from 'number' or (p_payload->>'amountUsd')::numeric<=0 or (p_payload->>'amountUsd')::numeric>1000000000 or round((p_payload->>'amountUsd')::numeric,2)<>(p_payload->>'amountUsd')::numeric or (p_payload->>'occurredAt') is null or not isfinite((p_payload->>'occurredAt')::timestamptz) or (p_payload->>'occurredAt')::timestamptz>clock_timestamp() then raise exception 'KH_AGENCY_SALE_INVALID';end if;
 offer:=kh_private.sale_latest_offer(d.id);
 insert into kh_private.agency_sale_requests(property_id,cycle_id,origin_agency_id,personal_source_id,authority_version,property_version,executing_agency_id,executing_manager_id,winning_deal_id,deal_version,mandate_version,winning_proposal_id,winning_proposal_version,amount_usd,occurred_at,requested_by,buyer_label,evidence_summary)
 values(pid,(select id from kh_private.commercial_cycles where property_id=pid and state='open'),o.origin_agency_id,case when o.origin_agency_id is null then p.owner_id end,coalesce(o.authority_version,1),p.version,d.agency_id,d.assignee_id,d.id,d.version,(select version from kh_private.agency_mandates where property_id=pid and agency_id=d.agency_id and state='active'),offer,(select version from kh_private.agency_proposals where id=offer),(p_payload->>'amountUsd')::numeric,(p_payload->>'occurredAt')::timestamptz,p_actor_id,left(coalesce(d.private_contact->>'name',(select display_name from public.profiles where id=d.buyer_id),'Cuenta eliminada'),120),case when offer is null then 'Venta comunicada manualmente; sin oferta aceptada asociada.' else 'Oferta aceptada asociada: '||offer::text||'. El importe final se declara por separado.' end) returning * into r;
 return kh_private.agency_remember(p_actor_id,p_agency_id,'request_agency_sale',p_payload,kh_private.sale_request_json(p_actor_id,p_agency_id,r));
end $$;
create function kh_private.sale_assert_current(r kh_private.agency_sale_requests) returns void language plpgsql set search_path='' as $$
 declare d kh_private.agency_deals;p public.properties;o kh_private.agency_property_origins;begin
 select * into d from kh_private.agency_deals where id=r.winning_deal_id;select * into p from public.properties where id=r.property_id;select * into o from kh_private.agency_property_origins where property_id=r.property_id;
 if p.id is null or p.id<>kh_private.agency_effective_property(d.property_id) or p.version<>r.property_version or p.availability<>'active' or p.moderation<>'approved'
 or o.origin_agency_id is distinct from r.origin_agency_id or coalesce(o.authority_version,1)<>r.authority_version or (o.origin_agency_id is null and p.owner_id is distinct from r.personal_source_id)
 or not exists(select 1 from kh_private.commercial_cycles where id=r.cycle_id and property_id=r.property_id and state='open')
 or not exists(select 1 from kh_private.commercial_cycles where id=d.cycle_id and state='open')
 or d.agency_id<>r.executing_agency_id or d.version<>r.deal_version or d.assignee_id is distinct from r.executing_manager_id or d.closed_reason is not null or d.stage in('won','lost')
 or not kh_private.agency_contact_member(r.executing_agency_id,r.executing_manager_id) or not kh_private.agency_flow_live(r.executing_agency_id,r.property_id)
 or not exists(select 1 from kh_private.agency_mandates where property_id=r.property_id and agency_id=r.executing_agency_id and state='active' and version=r.mandate_version)
 or kh_private.sale_latest_offer(d.id) is distinct from r.winning_proposal_id
 or (r.winning_proposal_id is not null and not exists(select 1 from kh_private.agency_proposals where id=r.winning_proposal_id and version=r.winning_proposal_version and status='accepted')) then raise exception 'KH_AGENCY_SALE_STALE';end if;
end $$;
-- Alias rows can only receive the same narrow sale update as the canonical row.
create or replace function kh_private.guard_property_alias_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid() and purpose='sale') then
  if new.availability<>'sold' or new.version<>old.version+1 or (to_jsonb(new)-array['availability','version','updated_at','search_text','search_vector']) is distinct from (to_jsonb(old)-array['availability','version','updated_at','search_text','search_vector']) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;return new;
 end if;
 if exists(select 1 from kh_private.property_aliases where property_id=old.id)
 and not(tg_op='DELETE' and exists(select 1 from kh_private.agency_property_identities where property_id=old.id and withdrawn_at is not null and personal_source_id=old.owner_id))
 and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid() and purpose='merge') then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;return case when tg_op='DELETE' then old else new end;
end $$;
create function kh_private.close_commercial_cycle(p_property_id uuid,p_request_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare pid uuid;req kh_private.agency_sale_requests;closure kh_private.property_sale_closures;cid uuid;ids uuid[];deals uuid[];p kh_private.agency_proposals;n public.kh_negotiations;begin
 pid:=kh_private.sale_group_lock(p_actor,null,p_property_id);
 perform kh_private.require_active();if kh_private.is_deleting(p_actor) then raise exception 'KH_ACCOUNT_DELETING';end if;
 if p_request_id is not null then select * into req from kh_private.agency_sale_requests where id=p_request_id;if req.id is null or req.property_id<>pid then raise exception 'KH_AGENCY_SALE_INVALID';end if;perform kh_private.sale_assert_current(req);cid:=req.cycle_id;
 else
  if not kh_private.property_source_decider(p_actor,null,pid) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
  select id into cid from kh_private.commercial_cycles where property_id=pid and state='open';
  if cid is null and not exists(select 1 from kh_private.commercial_cycles where kh_private.agency_effective_property(property_id)=pid) then insert into kh_private.commercial_cycles(property_id)values(pid)returning id into cid;end if;
  if cid is null then select * into closure from kh_private.property_sale_closures where property_id=pid order by confirmed_at desc limit 1;if closure.id is not null then return kh_private.sale_closure_json(closure);end if;raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 end if;
 select array_agg(property_id order by property_id) into ids from kh_private.agency_property_identities where kh_private.agency_effective_property(property_id)=pid;
 if exists(select 1 from public.properties where id=any(ids) and availability='sold') or exists(select 1 from kh_private.property_sale_closures where property_id=any(ids)) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 insert into kh_private.property_sale_closures(property_id,cycle_id,request_id,origin_agency_id,executing_agency_id,executing_manager_id,confirmed_by,amount_usd,occurred_at)values(pid,cid,req.id,req.origin_agency_id,req.executing_agency_id,req.executing_manager_id,p_actor,req.amount_usd,req.occurred_at)returning * into closure;
 select coalesce(array_agg(id),'{}') into deals from kh_private.agency_deals where property_id=any(ids);
 -- Expired, declined, cancelled, performed and accepted historical facts remain.
 for p in update kh_private.agency_proposals x set status='cancelled',closed_reason='property_sold',version=version+1 where deal_id=any(deals) and id is distinct from req.winning_proposal_id and (status='pending' and expires_at>clock_timestamp() or status='accepted' and kind='visit' and exists(select 1 from kh_private.property_visit_slots s where s.proposal_id=x.id and outcome='unrecorded' and starts_at>clock_timestamp())) returning x.* loop perform kh_private.agency_proposal_event(p,p_actor,'system','property_sold');end loop;
 -- Accepted competitor offers remain accepted facts, with explicit termination.
 for p in update kh_private.agency_proposals x set closed_reason='property_sold',version=version+1 where deal_id=any(deals) and kind='offer' and status='accepted' and closed_reason is null and id is distinct from req.winning_proposal_id returning x.* loop perform kh_private.agency_proposal_event(p,p_actor,'system','property_sold');end loop;
 for n in update public.kh_negotiations x set status='cancelled',termination_reason='property_sold',version=version+1,updated_at=clock_timestamp() where conversation_id in(select id from public.kh_conversations where property_id=any(ids)) and (status='pending' and expires_at>clock_timestamp() or status='accepted' and kind='visit' and exists(select 1 from kh_private.property_visit_slots s where s.personal_negotiation_id=x.id and outcome='unrecorded' and starts_at>clock_timestamp())) returning x.* loop insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot)values(n.id,p_actor,'cancelled',kh_private.negotiation_json(n,p_actor,clock_timestamp())||jsonb_build_object('terminationReason','property_sold'));end loop;
 update public.kh_negotiations set termination_reason='property_sold',version=version+1,updated_at=clock_timestamp() where conversation_id in(select id from public.kh_conversations where property_id=any(ids)) and kind='offer' and status='accepted' and termination_reason is null;
 update kh_private.property_visit_slots set outcome='cancelled',closed_reason='property_sold',version=version+1 where property_id=any(ids) and outcome='unrecorded' and starts_at>clock_timestamp();
 perform kh_private.agency_terminate_followups(deals,'property_sold');
 update kh_private.property_reservations set released_at=clock_timestamp(),closed_reason='property_sold',version=version+1 where property_id=any(ids) and released_at is null;
 insert into kh_private.commercial_termination_events(closure_id,property_id,subject_kind,subject_id,agency_id,recipient_id)
 select closure.id,d.property_id,'agency_deal',d.id,d.agency_id,recipient from kh_private.agency_deals d cross join lateral(select d.buyer_id recipient union select d.assignee_id)x where d.id=any(deals) and d.closed_reason is null and recipient is not null;
 insert into kh_private.commercial_termination_events(closure_id,property_id,subject_kind,subject_id,recipient_id)
 select closure.id,c.property_id,'personal_conversation',c.id,recipient from public.kh_conversations c cross join lateral(select c.buyer_id recipient union select c.seller_id)x where c.property_id=any(ids);
 update kh_private.agency_deals set stage=case when id=req.winning_deal_id then 'won' else stage end,closed_reason='property_sold',version=version+1 where id=any(deals) and closed_reason is null and stage not in('won','lost');
 update kh_private.commercial_cycles set state='closed',termination_reason='property_sold',version=version+1 where property_id=any(ids) and state='open';
 update kh_private.agency_property_changes set state='withdrawn',termination_reason='property_sold',version=version+1,decided_at=clock_timestamp() where property_id=any(ids) and state='pending';
 update kh_private.agency_mandate_requests set state='withdrawn',termination_reason='property_sold',version=version+1,decided_at=clock_timestamp() where property_id=any(ids) and state in('pending','accepted');
 update kh_private.agency_sale_requests set state='cancelled',note='Vivienda vendida',decided_by=p_actor,decided_at=clock_timestamp(),version=version+1 where property_id=any(ids) and state='pending' and id is distinct from p_request_id;
 insert into kh_private.agency_property_write_permits select txid_current(),id,p_actor,closure.id::text,'sale' from public.properties where id=any(ids);
 update public.properties set availability='sold',version=version+1,updated_at=clock_timestamp() where id=any(ids);
 delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=any(ids);
 return kh_private.sale_closure_json(closure);
end $$;
create function kh_private.decide_sale(actor uuid,agency uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r kh_private.agency_sale_requests;receipt jsonb;closure jsonb:=null;action text:=payload->>'action';begin
 perform kh_private.agency_prepare_account(actor);select * into r from kh_private.agency_sale_requests where id=(payload->>'requestId')::uuid;
 if r.id is null or not coalesce(kh_private.sale_request_visible(actor,agency,r),false) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 perform kh_private.sale_group_lock(actor,agency,r.property_id);perform kh_private.agency_account(actor);if not(select enabled from kh_private.agency_settings where singleton) then raise exception 'KH_AGENCY_DISABLED';end if;if agency is not null then perform kh_private.agency_actor(actor,agency,'manager');end if;
 select * into r from kh_private.agency_sale_requests where id=r.id;
 if action in('confirm','reject') then if not kh_private.property_source_decider(actor,agency,r.property_id) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 elsif action='cancel' then if agency is distinct from r.executing_agency_id or not kh_private.sale_request_visible(actor,agency,r) then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;
 else raise exception 'KH_AGENCY_SALE_INVALID';end if;
 receipt:=kh_private.agency_receipt(actor,r.property_id,'decide_agency_sale',payload);if receipt is not null then return receipt;end if;
 if payload-array['requestId','action','expectedRequestVersion','expectedPropertyVersion','expectedAuthorityVersion','note','clientRequestId']<>'{}'::jsonb or jsonb_typeof(payload->'note') is distinct from 'string' or char_length(payload->>'note')>500 then raise exception 'KH_AGENCY_SALE_INVALID';end if;
 if r.state<>'pending' or r.version is distinct from (payload->>'expectedRequestVersion')::integer or (select version from public.properties where id=r.property_id) is distinct from (payload->>'expectedPropertyVersion')::integer or coalesce((select authority_version from kh_private.agency_property_origins where property_id=r.property_id),1) is distinct from (payload->>'expectedAuthorityVersion')::integer then raise exception 'KH_AGENCY_SALE_STALE';end if;
 if action='confirm' then closure:=kh_private.close_commercial_cycle(r.property_id,r.id,actor);end if;
 update kh_private.agency_sale_requests set state=case action when 'confirm' then 'confirmed' when 'reject' then 'rejected' else 'cancelled' end,decided_by=actor,decided_at=clock_timestamp(),note=payload->>'note',version=version+1 where id=r.id returning * into r;
 return kh_private.agency_remember(actor,r.property_id,'decide_agency_sale',payload,jsonb_build_object('request',kh_private.sale_request_json(actor,agency,r),'closure',closure));
end $$;
create function public.kh_decide_agency_sale(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin if p_agency_id is null then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;return kh_private.decide_sale(p_actor_id,p_agency_id,p_payload);end $$;
create function public.kh_decide_personal_sale(p_actor_id uuid,p_payload jsonb) returns jsonb language sql security definer set search_path='' as $$select kh_private.decide_sale(p_actor_id,null,p_payload)$$;
create function kh_private.list_sale_requests(actor uuid,agency uuid,scope text,off integer,lim integer) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;begin
 perform kh_private.agency_account(actor);if not(select enabled from kh_private.agency_settings where singleton) then raise exception 'KH_AGENCY_DISABLED';end if;
 if agency is not null then perform kh_private.agency_actor(actor,agency,'manager');end if;
 if off is null or off<0 or off>100000 or lim is null or lim<1 or lim>50 or scope is null or scope not in('incoming','outgoing') then raise exception 'KH_AGENCY_SALE_INVALID';end if;
 select coalesce(jsonb_agg(v),'[]') into items from(select kh_private.sale_request_json(actor,agency,r)v from kh_private.agency_sale_requests r where kh_private.sale_request_visible(actor,agency,r) and (scope='incoming' and kh_private.property_source_decider(actor,agency,r.property_id) or scope='outgoing' and agency=r.executing_agency_id) order by r.created_at desc,r.id offset off limit lim+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>lim then items-lim else items end,'hasMore',jsonb_array_length(items)>lim);
end $$;
create function public.kh_list_agency_sale_requests(p_actor_id uuid,p_agency_id uuid,p_scope text,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$begin if p_agency_id is null then raise exception 'KH_AGENCY_ORIGIN_REQUIRED';end if;return kh_private.list_sale_requests(p_actor_id,p_agency_id,p_scope,p_offset,p_limit);end $$;
create function public.kh_list_personal_sale_requests(p_actor_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language sql security definer set search_path='' as $$select kh_private.list_sale_requests(p_actor_id,null,'incoming',p_offset,p_limit)$$;
create or replace function public.kh_set_property_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=p_id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 if p_status='sold' and kh_private.property_has_business_history(p_id) then
  if p_id<>kh_private.agency_effective_property(p_id) then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;
  perform kh_private.close_commercial_cycle(p_id,null,auth.uid());
 else perform kh_private.personal_kh_set_property_status(p_id,p_status);end if;
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kh_private' and p.proname in('sale_group_people','sale_group_lock','sale_latest_offer','sale_closure_json','sale_request_visible','sale_request_json','sale_assert_current','close_commercial_cycle','decide_sale','list_sale_requests') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('kh_request_agency_sale','kh_decide_agency_sale','kh_decide_personal_sale','kh_list_agency_sale_requests','kh_list_personal_sale_requests') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;

-- Only a current own-deal team member can prepare the canonical sale facts.
create function public.kh_prepare_agency_sale(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare d kh_private.agency_deals;pid uuid;begin
 d:=kh_private.agency_prepare_deal(p_actor_id,p_agency_id,p_deal_id);pid:=kh_private.sale_group_lock(p_actor_id,p_agency_id,d.property_id);perform kh_private.agency_actor(p_actor_id,p_agency_id,'manager');d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
 return (select jsonb_build_object('dealId',d.id,'propertyId',p.id,'propertyTitle',p.title,'expectedPropertyVersion',p.version,'expectedAuthorityVersion',coalesce(o.authority_version,1),'executingManagerId',case when kh_private.agency_contact_member(d.agency_id,d.assignee_id) then d.assignee_id end,'executingManagerName',case when kh_private.agency_contact_member(d.agency_id,d.assignee_id) then (select display_name from public.profiles where id=d.assignee_id) end) from public.properties p left join kh_private.agency_property_origins o on o.property_id=p.id where p.id=pid);
end $$;
revoke all on function public.kh_prepare_agency_sale(uuid,uuid,uuid) from public,anon;
grant execute on function public.kh_prepare_agency_sale(uuid,uuid,uuid) to authenticated;
