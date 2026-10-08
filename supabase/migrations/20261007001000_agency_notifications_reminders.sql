-- Delivery is asynchronous. These rows never contain verification proof, price or buyer data.
alter table kh_private.agency_events add column delivery_state text not null default 'pending' check(delivery_state in('pending','delivered','cancelled')),add column delivered_at timestamptz;
create index agency_events_delivery_pending on kh_private.agency_events(created_at,id) where delivery_state='pending';
create index agency_reminders_delivery_due on kh_private.agency_reminders(due_at,id) where state in('pending','failed');
alter table kh_private.notifications
 add column agency_event_id uuid references kh_private.agency_events(id),
 add column agency_id uuid,add column deal_id uuid,add column sale_request_id uuid,add column verification_request_id uuid,
 add column event_kind text,add column agency_target jsonb,
 drop constraint notifications_category_check,drop constraint notifications_alert_shape;
alter table kh_private.notifications add constraint notifications_category_check check(category in('message','visit','offer','alert','agency')),
 add constraint notifications_agency_shape check(
 (category='agency' and agency_event_id is not null and event_kind in('agency_review','agency_verification','team_invitation','deal_assignment','sale_request','property_sold','visit_reminder','task_reminder','manual_cancellation_notice') and message_id is null and negotiation_id is null and property_id is null and saved_search_id is null and agency_target is not null)
 or (category='alert' and conversation_id is null and message_id is null and property_id is not null and agency_event_id is null)
 or (category in('message','visit','offer') and conversation_id is not null and message_id is not null and property_id is null and saved_search_id is null and agency_event_id is null));
create unique index agency_notification_recipient_once on kh_private.notifications(agency_event_id,recipient_id) where category='agency';
alter table kh_private.notification_preferences add column agencies boolean not null default true;
alter table kh_private.push_devices add column supports_agency_notifications boolean not null default false;
-- Event recording has no notification-recipient, device or transport side effects.
create function kh_private.agency_delivery_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='agency_deals' then
  if new.assignee_id is not null and (tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id) then
   insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(new.agency_id,auth.uid(),'deal_assignment',new.id);end if;
 elsif tg_table_name='agency_sale_requests' then
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(new.executing_agency_id,auth.uid(),'sale_request',new.id);
 elsif tg_table_name='commercial_termination_events' then
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(new.agency_id,auth.uid(),'property_sold',new.id);
 elsif tg_table_name='agency_tasks' and new.kind='external_notification' and new.state='open' then
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)select d.agency_id,auth.uid(),'manual_cancellation_notice',new.id from kh_private.agency_deals d where d.id=new.deal_id;
 end if;return new;
end $$;
create trigger kh_agency_delivery_deal after insert or update of assignee_id on kh_private.agency_deals for each row execute function kh_private.agency_delivery_record();
create trigger kh_agency_delivery_sale after insert or update of state on kh_private.agency_sale_requests for each row execute function kh_private.agency_delivery_record();
create trigger kh_agency_delivery_termination after insert on kh_private.commercial_termination_events for each row execute function kh_private.agency_delivery_record();
create trigger kh_agency_delivery_manual after insert on kh_private.agency_tasks for each row execute function kh_private.agency_delivery_record();
-- Stable dedup IDs link previously committed closure events and due reminders to the same delivery path.
create function kh_private.agency_reminder_tick() returns jsonb language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into kh_private.agency_events(id,agency_id,kind,subject_id)
 select r.id,d.agency_id,case r.kind when 'task_due' then 'task_reminder' else 'visit_reminder' end,r.id
 from kh_private.agency_reminders r join kh_private.agency_deals d on d.id=r.deal_id
 where r.state in('pending','failed') and r.due_at<=clock_timestamp() order by r.due_at,r.id limit 20 on conflict(id)do nothing;
 get diagnostics n=row_count;return jsonb_build_object('recorded',n);
end $$;
insert into kh_private.agency_events(id,agency_id,kind,subject_id)
 select id,agency_id,'property_sold',id from kh_private.commercial_termination_events where state in('pending','failed') on conflict(id)do nothing;

-- A single authority projection serves materialization, list visibility and push-tap resolution.
-- It reads current rows only; it acquires no locks, so callers can use it after the worker lock prefix.
create function kh_private.agency_notice_candidates(e kh_private.agency_events)
returns table(recipient uuid,agency uuid,deal uuid,sale uuid,verification uuid,event_kind text,target jsonb)
language plpgsql stable security definer set search_path='' as $$
declare d kh_private.agency_deals;r kh_private.agency_sale_requests;t kh_private.commercial_termination_events;m kh_private.agency_reminders;task kh_private.agency_tasks;k text;begin
 if e.kind in('agency_verification_requested','agency_application_submitted') then
  return query select o.user_id,e.agency_id,null::uuid,null::uuid,case when e.kind='agency_verification_requested' then e.subject_id end,
   case when e.kind='agency_verification_requested' then 'agency_verification' else 'agency_review' end,
   jsonb_build_object('route',case when e.kind='agency_verification_requested' then 'verification_reviews' else 'reviews' end,'agencyId',null,'dealId',null) from kh_private.platform_owner o where o.singleton;
 elsif e.kind='agency_review' then
  return query select application.responsible_id,e.agency_id,null::uuid,null::uuid,null::uuid,'agency_review'::text,
   jsonb_build_object('route','application','agencyId',null,'dealId',null) from kh_private.agency_applications application where application.agency_id=e.agency_id and application.responsible_id is not null;
 elsif e.kind='agency_verification_decision' then
  return query select x.user_id,e.agency_id,null::uuid,null::uuid,case when e.kind='agency_verification_decision' then e.subject_id end,
   case when e.kind='agency_review' then 'agency_review' else 'agency_verification' end,
   jsonb_build_object('route',case when e.kind='agency_review' then 'application' else 'verification' end,'agencyId',case when e.kind='agency_review' then null else e.agency_id end,'dealId',null)
   from kh_private.agency_memberships x where x.agency_id=e.agency_id and x.role='admin' and kh_private.agency_contact_member(x.agency_id,x.user_id);
 elsif e.kind='team_invitation' then
  return query select i.recipient_id,i.agency_id,null::uuid,null::uuid,null::uuid,'team_invitation'::text,jsonb_build_object('route','team','agencyId',null,'dealId',null)
   from kh_private.agency_invitations i join kh_private.agencies a on a.id=i.agency_id and a.state='approved'
   where i.id=e.subject_id and i.state='pending' and i.expires_at>statement_timestamp();
 elsif e.kind='sale_request' then
  select * into r from kh_private.agency_sale_requests where id=e.subject_id;
  return query select x.user_id,x.agency_id,null::uuid,r.id,null::uuid,'sale_request'::text,jsonb_build_object('route','closures','agencyId',x.agency_id,'dealId',null)
   from kh_private.agency_memberships x where x.agency_id in(r.origin_agency_id,r.executing_agency_id) and kh_private.agency_contact_member(x.agency_id,x.user_id) and kh_private.sale_request_visible(x.user_id,x.agency_id,r);
  if r.personal_source_id is not null and kh_private.sale_request_visible(r.personal_source_id,null,r) then
   return query select r.personal_source_id,null::uuid,null::uuid,r.id,null::uuid,'sale_request'::text,jsonb_build_object('route','closures','agencyId',null,'dealId',null);end if;
 elsif e.kind='property_sold' then
  select * into t from kh_private.commercial_termination_events where id=e.subject_id;
  if t.subject_kind='personal_conversation' then
   return query select t.recipient_id,null::uuid,null::uuid,null::uuid,null::uuid,'property_sold'::text,jsonb_build_object('route','personal_conversation','agencyId',null,'dealId',c.id)
    from public.kh_conversations c where c.id=t.subject_id and t.recipient_id in(c.buyer_id,c.seller_id) and not kh_private.agency_pair_blocked(c.buyer_id,c.seller_id);
   return;
  end if;
  select * into d from kh_private.agency_deals where id=t.subject_id;
  if t.recipient_id=d.buyer_id and d.contact_kind='account' then
   return query select t.recipient_id,d.agency_id,d.id,null::uuid,null::uuid,'property_sold'::text,jsonb_build_object('route',case when c.id is null then 'account_notice' else 'buyer_conversation' end,'agencyId',null,'dealId',c.id) from (select 1)one left join kh_private.agency_conversations c on c.deal_id=d.id;return;
  end if;
  if kh_private.agency_contact_member(d.agency_id,t.recipient_id) and kh_private.agency_deal_visible(t.recipient_id,d.agency_id,d) then
   return query select t.recipient_id,d.agency_id,d.id,null::uuid,null::uuid,'property_sold'::text,jsonb_build_object('route','deal','agencyId',d.agency_id,'dealId',d.id);end if;
 elsif e.kind in('deal_assignment','task_reminder','visit_reminder','manual_cancellation_notice') then
  if e.kind='deal_assignment' then select * into d from kh_private.agency_deals where id=e.subject_id;
  elsif e.kind='manual_cancellation_notice' then
   select * into task from kh_private.agency_tasks where id=e.subject_id and kind='external_notification' and state='open';
   select * into d from kh_private.agency_deals where id=task.deal_id;
  else
   select * into m from kh_private.agency_reminders where id=e.subject_id and state in('pending','failed','delivered');
   select * into d from kh_private.agency_deals where id=m.deal_id;
   if d.closed_reason is not null or not coalesce(kh_private.agency_flow_live(d.agency_id,d.property_id),false) or m.recipient_id is distinct from d.assignee_id then return;end if;
   if e.kind='task_reminder' and not exists(select 1 from kh_private.agency_tasks x where x.id=m.subject_id and x.state='open' and x.assignee_id=m.recipient_id and x.due_at=m.due_at) then return;end if;
   if e.kind='visit_reminder' and not exists(select 1 from kh_private.property_visit_slots s join kh_private.agency_proposals p on p.id=s.proposal_id where p.id=m.subject_id and p.status='accepted' and s.outcome='unrecorded' and s.starts_at>statement_timestamp() and s.assignee_id=m.recipient_id and m.due_at=s.starts_at-case m.kind when 'visit_24h' then interval '24 hours' else interval '2 hours' end)then return;end if;
  end if;
  if not exists(select 1 from kh_private.agencies where id=d.agency_id and state='approved') then return;end if;
  if e.kind='manual_cancellation_notice' and task.assignee_id is null then
   return query select x.user_id,d.agency_id,d.id,null::uuid,null::uuid,e.kind,jsonb_build_object('route','deal','agencyId',d.agency_id,'dealId',d.id) from kh_private.agency_memberships x where x.agency_id=d.agency_id and x.role in('admin','coordinator') and kh_private.agency_contact_member(x.agency_id,x.user_id);
  elsif kh_private.agency_contact_member(d.agency_id,d.assignee_id) and not kh_private.agency_pair_blocked(d.buyer_id,d.assignee_id) then
   return query select d.assignee_id,d.agency_id,d.id,null::uuid,null::uuid,e.kind,jsonb_build_object('route','deal','agencyId',d.agency_id,'dealId',d.id);
  end if;
 end if;
end $$;
-- History authorization is independent of commercial liveness and the module switch.
create function kh_private.agency_notice_current(n kh_private.notifications) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=n.recipient_id and u.email_confirmed_at is not null)
 and not kh_private.is_suspended(n.recipient_id) and not kh_private.is_deleting(n.recipient_id)
 and case n.agency_target->>'route'
 when 'reviews' then exists(select 1 from kh_private.platform_owner where singleton and user_id=n.recipient_id)
 when 'verification_reviews' then exists(select 1 from kh_private.platform_owner where singleton and user_id=n.recipient_id)
 when 'application' then exists(select 1 from kh_private.agency_applications where agency_id=n.agency_id and responsible_id=n.recipient_id)
 when 'team' then exists(select 1 from kh_private.agency_invitations i join kh_private.agency_events e on e.subject_id=i.id where e.id=n.agency_event_id and i.recipient_id=n.recipient_id)
 when 'verification' then exists(select 1 from kh_private.agency_memberships m where m.agency_id=n.agency_id and m.user_id=n.recipient_id and m.role='admin' and kh_private.agency_contact_member(m.agency_id,m.user_id))
 when 'closures' then exists(select 1 from kh_private.agency_sale_requests r where r.id=n.sale_request_id and kh_private.sale_request_visible(n.recipient_id,(n.agency_target->>'agencyId')::uuid,r))
 when 'deal' then exists(select 1 from kh_private.agency_deals d where d.id=n.deal_id and kh_private.agency_contact_member(d.agency_id,n.recipient_id) and kh_private.agency_deal_visible(n.recipient_id,d.agency_id,d))
 when 'account_notice' then exists(select 1 from kh_private.agency_deals d where d.id=n.deal_id and d.buyer_id=n.recipient_id and d.contact_kind='account')
 when 'buyer_conversation' then exists(select 1 from kh_private.agency_deals d join kh_private.agency_conversations c on c.deal_id=d.id where d.id=n.deal_id and d.buyer_id=n.recipient_id and d.contact_kind='account' and c.id=(n.agency_target->>'dealId')::uuid)
 when 'personal_conversation' then exists(select 1 from public.kh_conversations c where c.id=(n.agency_target->>'dealId')::uuid and n.recipient_id in(c.buyer_id,c.seller_id) and not kh_private.agency_pair_blocked(c.buyer_id,c.seller_id))
 else false end
$$;
create function kh_private.agency_notice_deliverable(n kh_private.notifications) returns boolean language sql stable security definer set search_path='' as $$
 select (select enabled from kh_private.agency_settings where singleton) and kh_private.agency_notice_current(n)
 and (n.event_kind='agency_review' or n.agency_id is null or exists(select 1 from kh_private.agencies where id=n.agency_id and state='approved'))
 and exists(select 1 from kh_private.agency_events e cross join lateral kh_private.agency_notice_candidates(e)c where e.id=n.agency_event_id and c.recipient=n.recipient_id and c.target=n.agency_target)
$$;
-- PRECONDITION: worker owns its complete account/pair/agency/property/subject prefix.
create function kh_private.enqueue_agency_event(p_event_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e kh_private.agency_events;c record;actor uuid;counted integer:=0;begin
 if not coalesce((select enabled from kh_private.agency_settings where singleton),false) then return;end if;
 select * into e from kh_private.agency_events where id=p_event_id;
 for c in select distinct * from kh_private.agency_notice_candidates(e) order by recipient loop
  if (c.event_kind<>'agency_review' and c.agency is not null and not exists(select 1 from kh_private.agencies where id=c.agency and state='approved')) then continue;end if;
  if not (kh_private.notification_preferences_json(c.recipient)->>'agencies')::boolean then continue;end if;
  if kh_private.is_suspended(c.recipient) or kh_private.is_deleting(c.recipient) or not exists(select 1 from auth.users where id=c.recipient and email_confirmed_at is not null) then continue;end if;
  -- actor is an attribution key only; every display field is generic. Self-originated reminders are valid.
  actor:=c.recipient;
  if not exists(select 1 from public.profiles where id=actor) then actor:=c.recipient;end if;
  insert into kh_private.notifications(seq,recipient_id,actor_id,category,actor_name,property_title,title,body,agency_event_id,agency_id,deal_id,sale_request_id,verification_request_id,event_kind,agency_target)
  values(nextval('kh_private.notification_seq'),c.recipient,actor,'agency','KarmaHouse','',case c.event_kind when 'property_sold' then 'Vivienda vendida' when 'visit_reminder' then 'Recordatorio de visita' when 'task_reminder' then 'Recordatorio de tarea' when 'manual_cancellation_notice' then 'Comunicación de cancelación pendiente' when 'team_invitation' then 'Invitación al equipo' when 'deal_assignment' then 'Expediente asignado' when 'sale_request' then 'Solicitud de cierre actualizada' when 'agency_verification' then 'Actualización de verificación' else 'Actualización de agencia' end,case when c.event_kind='property_sold' then 'La vivienda relacionada con tu expediente se ha vendido.' else 'Tienes una actualización de agencia.' end,e.id,c.agency,c.deal,c.sale,c.verification,c.event_kind,c.target)
  on conflict(agency_event_id,recipient_id) where category='agency' do nothing;
  counted:=counted+1;
 end loop;
 update kh_private.agency_events set delivery_state=case when counted>0 then 'delivered' else 'cancelled' end,delivered_at=clock_timestamp() where id=e.id;
 if e.kind in('task_reminder','visit_reminder') then update kh_private.agency_reminders set state=case when counted>0 then 'delivered' else 'cancelled' end,attempts=attempts+1,delivered_at=case when counted>0 then clock_timestamp() end,reason=case when counted=0 then 'ineligible' end where id=e.subject_id and state in('pending','failed');end if;
 if e.kind='property_sold' then update kh_private.commercial_termination_events set state=case when counted>0 then 'delivered' else 'cancelled' end,attempts=attempts+1,delivered_at=case when counted>0 then clock_timestamp() end where id=e.subject_id and state in('pending','failed');end if;
end $$;
-- Self-originated reminder notices remain generic; the legacy actor distinction is preserved otherwise.
alter table kh_private.notifications drop constraint notifications_check;
alter table kh_private.notifications add constraint notifications_distinct_actor check(category='agency' or recipient_id<>actor_id);
-- Freeze a bounded work set. Its complete participant/property/agency projection is rechecked
-- after waiting for locks; a changed set is retried next tick, never silently consumed.
create function kh_private.agency_delivery_plan(events uuid[],jobs uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 with es as(select * from kh_private.agency_events where id=any(events) or id in(select n.agency_event_id from kh_private.notifications n join kh_private.push_outbox o on o.notification_id=n.id where o.id=any(jobs))),
 cs as(select e.id event_id,c.* from es e cross join lateral kh_private.agency_notice_candidates(e)c),
 ds as(select d.* from kh_private.agency_deals d where d.id in(select deal from cs) or d.id in(select r.deal_id from kh_private.agency_reminders r join es on es.subject_id=r.id) or d.id in(select t.subject_id from kh_private.commercial_termination_events t join es on es.subject_id=t.id where t.subject_kind='agency_deal')),
 base_ps as(select property_id id from ds union select t.property_id from kh_private.commercial_termination_events t join es on es.subject_id=t.id union select r.property_id from kh_private.agency_sale_requests r join es on es.subject_id=r.id),
 ps as(select id from base_ps union select kh_private.agency_effective_property(id) from base_ps union select property_id from kh_private.property_aliases where canonical_id in(select kh_private.agency_effective_property(id) from base_ps)),
 people as(select recipient id from cs union select buyer_id from ds union select assignee_id from ds union select actor_id from es union select c.buyer_id from public.kh_conversations c join kh_private.commercial_termination_events t on t.subject_kind='personal_conversation' and t.subject_id=c.id join es on es.subject_id=t.id union select c.seller_id from public.kh_conversations c join kh_private.commercial_termination_events t on t.subject_kind='personal_conversation' and t.subject_id=c.id join es on es.subject_id=t.id union select c.buyer_id from public.kh_conversations c join kh_private.notifications n on n.conversation_id=c.id join kh_private.push_outbox o on o.notification_id=n.id where o.id=any(jobs) union select c.seller_id from public.kh_conversations c join kh_private.notifications n on n.conversation_id=c.id join kh_private.push_outbox o on o.notification_id=n.id where o.id=any(jobs) union select recipient_id from kh_private.push_outbox where id=any(jobs)),
 agencies as(select agency_id id from es union select agency from cs union select agency_id from ds)
 select jsonb_build_object('events',coalesce((select jsonb_agg(id order by id) from es),'[]'),'candidates',coalesce((select jsonb_agg(to_jsonb(cs) order by event_id,recipient,agency) from cs),'[]'),
 'people',coalesce((select jsonb_agg(id order by id)from people where id is not null),'[]'),
 'properties',coalesce((select jsonb_agg(id order by id)from ps where id is not null),'[]'),
 'agencies',coalesce((select jsonb_agg(id order by id)from agencies where id is not null),'[]'))
$$;
create function kh_private.agency_delivery_lock(plan jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid;pair record;agencies uuid[];properties uuid[];begin
 for u in select value::uuid from jsonb_array_elements_text(plan->'people') order by 1 loop perform pg_advisory_xact_lock(hashtextextended('kh:account:'||u::text,0));end loop;
 for pair in select a.value::uuid a,b.value::uuid b from jsonb_array_elements_text(plan->'people')a cross join jsonb_array_elements_text(plan->'people')b where a.value<b.value order by a.value,b.value loop perform kh_private.chat_pair_lock(pair.a,pair.b);end loop;
 perform pg_advisory_xact_lock(hashtextextended('kh:property-aliases',0));
 select coalesce(array_agg(value::uuid),'{}')into agencies from jsonb_array_elements_text(plan->'agencies');
 select coalesce(array_agg(value::uuid),'{}')into properties from jsonb_array_elements_text(plan->'properties');
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(agencies,properties));
 perform 1 from public.properties p where p.id=any(properties) or p.id in(select kh_private.agency_effective_property(unnest(properties))) order by p.id for update;
 perform 1 from kh_private.commercial_cycles where property_id=any(properties) order by id for update;
 perform 1 from kh_private.agency_deals where property_id=any(properties) order by id for update;
 perform 1 from kh_private.agency_proposals where deal_id in(select id from kh_private.agency_deals where property_id=any(properties)) order by id for update;
 perform 1 from kh_private.property_visit_slots where property_id=any(properties) order by id for update;
 perform 1 from kh_private.agency_sale_requests where property_id=any(properties) order by id for update;
 perform 1 from kh_private.agency_tasks where deal_id in(select id from kh_private.agency_deals where property_id=any(properties)) order by id for update;
 perform 1 from kh_private.agency_reminders where id in(select e.subject_id from kh_private.agency_events e where e.id in(select value::uuid from jsonb_array_elements_text(plan->'events'))) order by id for update;
 perform 1 from kh_private.commercial_termination_events where id in(select e.subject_id from kh_private.agency_events e where e.id in(select value::uuid from jsonb_array_elements_text(plan->'events'))) order by id for update;
 perform 1 from kh_private.agency_events where id in(select value::uuid from jsonb_array_elements_text(plan->'events')) order by id for update;
end $$;

create or replace function kh_private.notification_visible(p_row kh_private.notifications, p_actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_row.recipient_id = p_actor
    and (case when p_row.category='agency' then kh_private.agency_notice_current(p_row) else (p_row.category = 'alert' or exists (select 1 from public.kh_conversations c where c.id = p_row.conversation_id
      and p_actor in (c.buyer_id, c.seller_id) and p_row.actor_id in (c.buyer_id, c.seller_id))) end)
    and not exists (select 1 from public.kh_user_blocks b
      where (b.blocker_id = p_actor and b.blocked_id = p_row.actor_id)
        or (b.blocker_id = p_row.actor_id and b.blocked_id = p_actor));
$$;
create or replace function kh_private.notification_json(p_row kh_private.notifications) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_row.id, 'seq', p_row.seq::text, 'recipientId', p_row.recipient_id,
    'actorId', p_row.actor_id, 'actorName', p_row.actor_name, 'conversationId', p_row.conversation_id,
    'messageId', p_row.message_id, 'negotiationId', p_row.negotiation_id, 'category', p_row.category,
    'agencyId',p_row.agency_id,'dealId',p_row.deal_id,'saleRequestId',p_row.sale_request_id,'verificationRequestId',p_row.verification_request_id,'eventKind',p_row.event_kind,'propertyId', p_row.property_id, 'savedSearchId', p_row.saved_search_id,
    'propertyTitle', p_row.property_title, 'title', p_row.title, 'body', p_row.body,
    'createdAt', p_row.created_at, 'readAt', p_row.read_at);
$$;
create or replace function kh_private.notification_preferences_json(p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('messages', p.messages, 'visits', p.visits, 'offers', p.offers, 'alerts', p.alerts,'agencies',p.agencies, 'version', p.version)
    from kh_private.notification_preferences p where p.user_id = p_actor),
    '{"messages":true,"visits":true,"offers":true,"alerts":true,"agencies":true,"version":0}'::jsonb);
$$;
create or replace function public.kh_save_notification_preferences(p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_current jsonb; v_expected integer; v_alerts boolean; v_agencies boolean;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'messages') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'visits') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'offers') is distinct from 'boolean'
    or (p_payload ? 'agencies' and jsonb_typeof(p_payload->'agencies') is distinct from 'boolean')
    or (p_payload ? 'alerts' and jsonb_typeof(p_payload->'alerts') is distinct from 'boolean')
    or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number'
    or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
    or p_payload - array['messages','visits','offers','alerts','agencies','expectedVersion'] <> '{}'::jsonb then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  v_expected := (p_payload->>'expectedVersion')::integer;
  perform kh_private.notification_recipient_lock(v_actor);
  v_current := kh_private.notification_preferences_json(v_actor);
  v_alerts := coalesce((p_payload->>'alerts')::boolean, (v_current->>'alerts')::boolean);
  v_agencies:=coalesce((p_payload->>'agencies')::boolean,(v_current->>'agencies')::boolean);
  if v_current - 'version' = (p_payload - 'expectedVersion') || jsonb_build_object('alerts', v_alerts,'agencies',v_agencies) then return v_current; end if;
  if (v_current->>'version')::integer <> v_expected then raise exception 'KH_NOTIFICATION_PREFERENCES_CONFLICT'; end if;
  insert into kh_private.notification_preferences(user_id, messages, visits, offers, alerts, agencies, version)
  values (v_actor, (p_payload->>'messages')::boolean, (p_payload->>'visits')::boolean, (p_payload->>'offers')::boolean, v_alerts, v_agencies, v_expected + 1)
  on conflict (user_id) do update set messages = excluded.messages, visits = excluded.visits, offers = excluded.offers, alerts = excluded.alerts, agencies=excluded.agencies, version = excluded.version;
  return kh_private.notification_preferences_json(v_actor);
end $$;
create or replace function kh_private.notification_summary(p_actor uuid, p_include_alerts boolean,p_include_agencies boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('unreadCount', count(*) filter (where n.read_at is null),
    'readThrough', coalesce(max(n.seq), 0)::text)
  from kh_private.notifications n where n.recipient_id = p_actor and (p_include_alerts or n.category <> 'alert')
    and (p_include_agencies or n.category<>'agency') and kh_private.notification_in_bell(n, p_actor);
$$;
create or replace function kh_private.notification_summary(p_actor uuid,p_include_alerts boolean) returns jsonb language sql stable security definer set search_path='' as $$select kh_private.notification_summary(p_actor,p_include_alerts,false)$$;
drop function public.kh_notification_summary(uuid,boolean);
drop function public.kh_list_notifications(uuid,text,boolean,text,integer,boolean);
drop function public.kh_read_notification(uuid,uuid);
drop function public.kh_read_notifications_through(uuid,text);
create or replace function public.kh_notification_summary(p_actor_id uuid, p_include_alerts boolean default false,p_include_agencies boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select kh_private.notification_summary(kh_private.chat_actor(p_actor_id), coalesce(p_include_alerts, false),coalesce(p_include_agencies,false));
$$;
create or replace function public.kh_list_notifications(p_actor_id uuid, p_before_seq text default null,
  p_unread_only boolean default false, p_category text default null, p_limit integer default 30,
  p_include_alerts boolean default false,p_include_agencies boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kh_private.chat_actor(p_actor_id);
  v_alerts boolean := coalesce(p_include_alerts, false);
  v_before bigint;
  v_rows jsonb;
  v_more boolean;
begin
  if p_before_seq is not null then v_before := kh_private.notification_cursor(p_before_seq, false); end if;
  if p_unread_only is null or p_limit is null or p_limit not between 1 and 30
    or p_category is not null and p_category not in ('visit','offer','alert','agency') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  if p_category = 'alert' then v_alerts := true; end if;
  with page as (
    select n.* from kh_private.notifications n where n.recipient_id = v_actor
      and (coalesce(p_include_agencies,false) or n.category<>'agency') and (v_alerts or n.category <> 'alert')
      and kh_private.notification_in_bell(n, v_actor) and (v_before is null or n.seq < v_before)
      and (not p_unread_only or n.read_at is null) and (p_category is null or n.category = p_category)
    order by n.seq desc limit p_limit + 1
  ), numbered as (select p.*, row_number() over (order by p.seq desc) as position from page p)
  select coalesce(jsonb_agg(kh_private.notification_json(n) order by n.seq desc) filter (where x.position <= p_limit), '[]'::jsonb), count(*) > p_limit
    into v_rows, v_more from numbered x join kh_private.notifications n on n.id = x.id;
  return kh_private.notification_summary(v_actor, v_alerts,coalesce(p_include_agencies,false)) || jsonb_build_object('items', v_rows, 'nextCursor', case when v_more then v_rows->(p_limit - 1)->>'seq' else null end);
end $$;
create or replace function public.kh_read_notification(p_actor_id uuid,p_id uuid,p_include_agencies boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    where n.id=p_id and n.recipient_id=v_actor and (coalesce(p_include_agencies,false) or n.category<>'agency') and kh_private.notification_in_bell(n,v_actor);
  if not found then raise exception 'KH_NOTIFICATION_NOT_FOUND'; end if;
  return kh_private.notification_summary(v_actor,false,coalesce(p_include_agencies,false))-'readThrough';
end $$;
create or replace function public.kh_read_notifications_through(p_actor_id uuid,p_through_seq text,p_include_agencies boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_through bigint:=kh_private.notification_cursor(p_through_seq,true);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=clock_timestamp()
    where n.recipient_id=v_actor and n.seq<=v_through and n.read_at is null and (coalesce(p_include_agencies,false) or n.category<>'agency') and kh_private.notification_in_bell(n,v_actor);
  return kh_private.notification_summary(v_actor,false,coalesce(p_include_agencies,false))-'readThrough';
end $$;
create or replace function public.kh_register_push_device(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=kh_private.chat_actor(p_actor_id);
  v_session uuid:=kh_private.push_current_session(v_actor);
  v_id uuid; v_revision integer; v_secret bytea; v_token text; v_operation bytea;
  v_existing kh_private.push_devices%rowtype; v_conflict kh_private.push_devices%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'installationId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'installationSecret','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or coalesce(p_payload->>'revision','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(p_payload->>'fcmToken','') !~ '^[A-Za-z0-9_\-:.%]{64,255}$'
    or p_payload->>'platform' is distinct from 'android'
    or p_payload->>'projectId' is distinct from 'e054aea9-38b4-4211-826b-521b3cc0be9f'
    or (p_payload?'supportsAgencyNotifications' and jsonb_typeof(p_payload->'supportsAgencyNotifications') is distinct from 'boolean')
    or p_payload-ARRAY['installationId','installationSecret','revision','fcmToken','platform','projectId','supportsAgencyNotifications']<>'{}'::jsonb then raise exception 'KH_PUSH_INVALID'; end if;
  v_id:=(p_payload->>'installationId')::uuid; v_revision:=(p_payload->>'revision')::integer;
  v_secret:=extensions.digest(p_payload->>'installationSecret','sha256'); v_token:=p_payload->>'fcmToken';
  v_operation:=extensions.digest(jsonb_build_object('operation','register','owner',v_actor,'session',v_session,
    'installation',v_id,'revision',v_revision,'token',v_token,'platform','android','project','e054aea9-38b4-4211-826b-521b3cc0be9f')::text,'sha256');
  if coalesce((p_payload->>'supportsAgencyNotifications')::boolean,false) then v_operation:=extensions.digest(encode(v_operation,'hex')||':agency:true','sha256');end if;
  perform kh_private.push_registry_lock();
  select * into v_existing from kh_private.push_devices where installation_id=v_id for update;
  if found then
    if v_existing.secret_hash<>v_secret then raise exception 'KH_PUSH_FORBIDDEN'; end if;
    if v_revision<v_existing.revision then raise exception 'KH_PUSH_STALE'; end if;
    if v_revision=v_existing.revision and (v_existing.last_operation<>'register' or v_existing.operation_hash<>v_operation) then raise exception 'KH_PUSH_CONFLICT'; end if;
  end if;
  -- Validate again after waiting for the registry: a logout may have removed the Auth row.
  if not kh_private.push_session_live(v_session,v_actor) then raise exception 'KH_PUSH_SESSION_REQUIRED'; end if;
  select * into v_conflict from kh_private.push_devices where fcm_token=v_token and installation_id<>v_id for update;
  if found then
    if v_conflict.enabled and v_conflict.expires_at>clock_timestamp() and kh_private.push_session_live(v_conflict.session_id,v_conflict.owner_id) then raise exception 'KH_PUSH_TOKEN_IN_USE'; end if;
    perform kh_private.push_cancel_generation(v_conflict.installation_id);
    update kh_private.push_devices set enabled=false,fcm_token=null,expo_push_token=null,invalid_reason='TOKEN_REASSIGNED',
      exchange_request_id=null,exchange_next_at=null,exchange_deadline_at=null,updated_at=clock_timestamp()
      where installation_id=v_conflict.installation_id;
  end if;
  if v_existing.installation_id is not null and v_revision>v_existing.revision then perform kh_private.push_cancel_generation(v_id); end if;
  insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,
    fcm_token,expo_push_token,token_hash,enabled,expires_at,exchange_attempts,exchange_next_at,supports_agency_notifications)
  values(v_id,v_secret,v_revision,'register',v_operation,v_actor,v_session,v_token,null,extensions.digest(v_token,'sha256'),
    true,clock_timestamp()+interval '30 days',0,clock_timestamp(),coalesce((p_payload->>'supportsAgencyNotifications')::boolean,false))
  on conflict(installation_id) do update set revision=excluded.revision,last_operation=excluded.last_operation,operation_hash=excluded.operation_hash,
    owner_id=excluded.owner_id,session_id=excluded.session_id,fcm_token=excluded.fcm_token,token_hash=excluded.token_hash,
    expo_push_token=case when kh_private.push_devices.fcm_token=excluded.fcm_token then kh_private.push_devices.expo_push_token else null end,
    supports_agency_notifications=excluded.supports_agency_notifications,enabled=true,expires_at=excluded.expires_at,invalid_reason=null,
    exchange_request_id=null,exchange_attempts=0,exchange_next_at=clock_timestamp(),exchange_deadline_at=null,
    updated_at=clock_timestamp();
  return jsonb_build_object('enabled',true,'revision',v_revision,'platform','android');
end $$;
create or replace function kh_private.push_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into kh_private.push_outbox(notification_id,installation_id,recipient_id,session_id,device_revision,token_hash,expires_at)
  select new.id,d.installation_id,new.recipient_id,d.session_id,d.revision,d.token_hash,new.created_at+interval '1 hour'
  from kh_private.push_devices d where d.owner_id=new.recipient_id and d.enabled and d.expo_push_token is not null
    and (new.category<>'agency' or d.supports_agency_notifications) and d.expires_at>clock_timestamp() and kh_private.push_session_live(d.session_id,d.owner_id)
  on conflict(notification_id,installation_id,device_revision) do nothing;
  return new;
end $$;
create or replace function kh_private.push_eligible(p_job kh_private.push_outbox) returns boolean
language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id
    where d.installation_id = p_job.installation_id and d.enabled and d.owner_id = p_job.recipient_id
      and d.session_id = p_job.session_id and d.revision = p_job.device_revision and d.token_hash = p_job.token_hash
      and d.expo_push_token is not null and d.expires_at > clock_timestamp()
      and kh_private.push_session_live(d.session_id, d.owner_id) and n.recipient_id = p_job.recipient_id
      and (n.category<>'agency' or d.supports_agency_notifications and kh_private.agency_notice_deliverable(n)) and n.read_at is null and kh_private.notification_visible(n, p_job.recipient_id)
      and (kh_private.notification_preferences_json(p_job.recipient_id)->>case n.category when 'message' then 'messages' when 'visit' then 'visits' when 'offer' then 'offers' when 'agency' then 'agencies' else 'alerts' end)::boolean);
$$;
create or replace function kh_private.push_payload(p_job kh_private.push_outbox) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('to', d.expo_push_token, 'title', 'KarmaHouse',
    'body', case n.category when 'message' then 'Tienes un nuevo mensaje.' when 'visit' then 'Tienes una actualización de visita.'
      when 'offer' then 'Tienes una actualización de oferta.' when 'agency' then 'Tienes una actualización de agencia.' else n.title || '.' end,
    'data', jsonb_build_object('kind', 'karmahouse.notification', 'notificationId', n.id, 'recipientId', n.recipient_id),
    'ttl', 3600, 'channelId', 'karmahouse-updates', 'tag', 'kh-' || n.id::text, 'collapseId', 'kh-' || n.id::text)
  from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id where d.installation_id = p_job.installation_id;
$$;
create or replace function public.kh_resolve_push_notification(p_actor_id uuid, p_notification_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_notice kh_private.notifications%rowtype;
begin
  select * into v_notice from kh_private.notifications n where n.id = p_notification_id and n.recipient_id = v_actor and kh_private.notification_visible(n, v_actor);
  if not found then raise exception 'KH_PUSH_NOT_FOUND'; end if;
  return jsonb_build_object('notificationId', v_notice.id, 'recipientId', v_actor, 'conversationId', v_notice.conversation_id, 'propertyId', v_notice.property_id)||case when v_notice.category='agency' then jsonb_build_object('agencyTarget',v_notice.agency_target) else '{}'::jsonb end;
end $$;
create or replace function kh_private.push_tick() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_attempt kh_private.push_http_attempts%rowtype; v_response net._http_response%rowtype;
  v_job kh_private.push_outbox%rowtype; v_body jsonb; v_kind text; v_id uuid; v_request bigint;
  v_job_ids uuid[]; v_events uuid[]; v_plan jsonb; v_event uuid; v_enabled boolean; v_recipient uuid;
  v_collected integer:=0; v_dispatched integer:=0; v_exchanged integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('kh:push:worker',0)) then return '{"busy":true}'::jsonb; end if;
  v_enabled:=exists(select 1 from kh_private.push_config where singleton and transport_enabled);
  perform kh_private.agency_reminder_tick();
  select coalesce(array_agg(id),'{}') into v_events from(select id from kh_private.agency_events where delivery_state='pending' order by created_at,id limit 20)x;
  -- Freeze the bounded candidate set without row locks, then acquire ALL pair locks before
  -- ANY recipient/registry lock. This matches chat pair -> recipient -> enqueue and avoids
  -- acquiring a second pair while retaining a recipient from an earlier job in this tick.
  select coalesce(array_agg(id),'{}'::uuid[]) into v_job_ids from (
    select id from kh_private.push_outbox where state in('pending','retry','ticketed') and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,id limit 20
  ) ready;
  v_plan:=kh_private.agency_delivery_plan(v_events,v_job_ids);
  perform kh_private.agency_delivery_lock(v_plan);
  if v_plan is distinct from kh_private.agency_delivery_plan(v_events,v_job_ids) then return '{"retry":true}'::jsonb;end if;
  for v_recipient in select value::uuid from jsonb_array_elements_text(v_plan->'people') order by 1 loop
    perform kh_private.notification_recipient_lock(v_recipient);
  end loop;
  perform kh_private.push_registry_lock();
  for v_event in select unnest(v_events) loop perform kh_private.enqueue_agency_event(v_event);end loop;
  -- New outbox rows have the same fully locked event projection. No new business locks below.
  select coalesce(array_agg(id),'{}') into v_job_ids from(select id from kh_private.push_outbox where id=any(v_job_ids) or notification_id in(select id from kh_private.notifications where agency_event_id=any(v_events)) order by next_attempt_at,id limit 40)x;
  if not v_enabled then return '{"enabled":false}'::jsonb;end if;
  for v_attempt in select * from kh_private.push_http_attempts where completed_at is null order by created_at limit 100 for update skip locked loop
    select * into v_response from net._http_response where id=v_attempt.request_id;
    if found then
      begin v_body:=v_response.content::jsonb; exception when invalid_text_representation then v_body:=null; end;
      perform kh_private.push_apply_response(v_attempt.id,v_response.status_code,v_body,coalesce(v_response.timed_out,false) or v_response.error_msg is not null);
      delete from net._http_response where id=v_attempt.request_id;
      v_collected:=v_collected+1;
    elsif v_attempt.deadline_at<clock_timestamp() then
      perform kh_private.push_apply_response(v_attempt.id,null,null,true);
      v_collected:=v_collected+1;
    end if;
  end loop;
  -- Recheck before every HTTP enqueue. Once committed to transport, a provider send cannot be recalled.
  for v_job in select * from kh_private.push_outbox where id=any(v_job_ids) and state in('pending','retry','ticketed') and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,id limit 20 for update skip locked loop
    v_kind:=case when v_job.state='ticketed' then 'receipt' else 'send' end;
    if (v_kind='send' and not kh_private.push_eligible(v_job)) or (v_kind='receipt' and not kh_private.push_generation_current(v_job)) then
      update kh_private.push_outbox set state='cancelled',last_error='INELIGIBLE',updated_at=clock_timestamp() where id=v_job.id;
      continue;
    end if;
    if (v_kind='send' and (v_job.expires_at<=clock_timestamp() or v_job.send_attempts>=6))
      or (v_kind='receipt' and (v_job.ticket_at<=clock_timestamp()-interval '23 hours' or v_job.receipt_attempts>=6)) then
      update kh_private.push_outbox set state='failed',last_error='EXPIRED_OR_LIMIT',updated_at=clock_timestamp() where id=v_job.id;
      continue;
    end if;
    v_id:=gen_random_uuid();
    v_body:=case when v_kind='send' then kh_private.push_payload(v_job) else jsonb_build_object('ids',jsonb_build_array(v_job.ticket_id)) end;
    v_request:=kh_private.push_http_post(v_kind,v_body);
    insert into kh_private.push_http_attempts(id,outbox_id,kind,request_id) values(v_id,v_job.id,v_kind,v_request);
    update kh_private.push_outbox set state=case when v_kind='send' then 'sending' else 'checking_receipt' end,
      send_attempts=send_attempts+case when v_kind='send' then 1 else 0 end,
      receipt_attempts=receipt_attempts+case when v_kind='receipt' then 1 else 0 end,
      active_attempt_id=v_id,updated_at=clock_timestamp() where id=v_job.id;
    v_dispatched:=v_dispatched+1;
  end loop;
  -- Keep only minimal installation tombstones; drop transport token once a lease/session ends.
  update kh_private.push_devices set enabled=false,expo_push_token=null,fcm_token=null,invalid_reason='SESSION_OR_LEASE_ENDED',
    exchange_request_id=null,exchange_next_at=null,exchange_deadline_at=null,updated_at=clock_timestamp()
    where enabled and (expires_at<=clock_timestamp() or not kh_private.push_session_live(session_id,owner_id));
  v_exchanged:=kh_private.push_exchange_collect()+kh_private.push_exchange_dispatch();
  delete from kh_private.push_outbox where id in(select id from kh_private.push_outbox
    where state in('provider_accepted','cancelled','failed') and updated_at<clock_timestamp()-interval '7 days' order by updated_at limit 200);
  return jsonb_build_object('enabled',true,'collected',v_collected,'dispatched',v_dispatched,'exchanged',v_exchanged);
end $$;
do $$declare f record;begin for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kh_private' and (p.proname like 'agency_notice_%' or p.proname like 'agency_delivery_%' or p.proname in('agency_reminder_tick','enqueue_agency_event','notification_summary')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;end$$;
revoke all on function public.kh_notification_summary(uuid,boolean,boolean),public.kh_list_notifications(uuid,text,boolean,text,integer,boolean,boolean),public.kh_read_notification(uuid,uuid,boolean),public.kh_read_notifications_through(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.kh_notification_summary(uuid,boolean,boolean),public.kh_list_notifications(uuid,text,boolean,text,integer,boolean,boolean),public.kh_read_notification(uuid,uuid,boolean),public.kh_read_notifications_through(uuid,text,boolean) to authenticated;
notify pgrst,'reload schema';
