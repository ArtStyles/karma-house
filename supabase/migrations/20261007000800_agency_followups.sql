-- Private followups share the Task 9 participant/property mutex and historical dwelling identity.
create table kh_private.agency_tasks(
 id uuid primary key default gen_random_uuid(),deal_id uuid not null references kh_private.agency_deals(id) on delete restrict,
 title text not null check(char_length(title) between 2 and 200),kind text not null default 'followup' check(kind in('followup','external_notification')),
 assignee_id uuid references auth.users(id) on delete set null,due_at timestamptz,state text not null default 'open' check(state in('open','done','cancelled')),
 version integer not null default 1,reason text,created_at timestamptz not null default clock_timestamp()
);
create index agency_tasks_deal_queue on kh_private.agency_tasks(deal_id,state,created_at,id);
create table kh_private.agency_followup_events(
 id uuid primary key default gen_random_uuid(),deal_id uuid not null references kh_private.agency_deals(id) on delete restrict,
 task_id uuid references kh_private.agency_tasks(id) on delete restrict,actor_id uuid,kind text not null,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table kh_private.agency_reminders(
 id uuid primary key default gen_random_uuid(),subject_id uuid not null,deal_id uuid not null references kh_private.agency_deals(id) on delete restrict,
 kind text not null check(kind in('task_due','visit_24h','visit_2h')),due_at timestamptz not null,
 recipient_id uuid references auth.users(id) on delete set null,state text not null default 'pending' check(state in('pending','delivered','cancelled','failed')),
 delivered_at timestamptz,attempts integer not null default 0,reason text,unique(subject_id,kind,due_at)
);
alter table kh_private.agency_tasks enable row level security;
alter table kh_private.agency_followup_events enable row level security;
alter table kh_private.agency_reminders enable row level security;
revoke all on kh_private.agency_tasks,kh_private.agency_followup_events,kh_private.agency_reminders from public,anon,authenticated;
create function kh_private.agency_task_json(t kh_private.agency_tasks) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',t.id,'dealId',t.deal_id,'title',t.title,'kind',t.kind,'assigneeId',t.assignee_id,'dueAt',t.due_at,'state',t.state,'version',t.version,'reason',t.reason)
$$;
create function kh_private.agency_followup_event(deal uuid,task uuid,actor uuid,kind text,details jsonb) returns void language sql set search_path='' as $$
 insert into kh_private.agency_followup_events(deal_id,task_id,actor_id,kind,details)values(deal,task,actor,kind,details)
$$;
create function kh_private.agency_remind(subject uuid,deal uuid,p_kind text,due timestamptz,recipient uuid) returns void language plpgsql set search_path='' as $$begin
 if due>clock_timestamp() and recipient is not null then
 insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id)values(subject,deal,p_kind,due,recipient)
 on conflict(subject_id,kind,due_at)do update set recipient_id=excluded.recipient_id,state='pending',reason=null where agency_reminders.state<>'delivered';end if;
end $$;
create function kh_private.agency_task_reminders() returns trigger language plpgsql security definer set search_path='' as $$begin
 update kh_private.agency_reminders set state='cancelled',reason=coalesce(new.reason,'task_changed') where subject_id=new.id and state in('pending','failed');
 if new.state='open' then perform kh_private.agency_remind(new.id,new.deal_id,'task_due',new.due_at,new.assignee_id);end if;return new;
end $$;
create trigger kh_agency_task_reminders after insert or update on kh_private.agency_tasks for each row execute function kh_private.agency_task_reminders();
create function kh_private.agency_refresh_visit_reminders(s kh_private.property_visit_slots) returns void language plpgsql security definer set search_path='' as $$declare d kh_private.agency_deals;begin
 if s.proposal_id is null then return;end if;
 select x.* into d from kh_private.agency_deals x join kh_private.agency_proposals p on p.deal_id=x.id where p.id=s.proposal_id;
 update kh_private.agency_reminders set state='cancelled',reason=coalesce(s.closed_reason,'visit_changed') where subject_id=s.proposal_id and state in('pending','failed');
 if s.outcome='unrecorded' and s.starts_at>clock_timestamp() and d.closed_reason is null and kh_private.agency_contact_member(d.agency_id,s.assignee_id) then
  perform kh_private.agency_remind(s.proposal_id,d.id,'visit_24h',s.starts_at-interval '24 hours',s.assignee_id);
  perform kh_private.agency_remind(s.proposal_id,d.id,'visit_2h',s.starts_at-interval '2 hours',s.assignee_id);
 end if;
end $$;
create function kh_private.agency_visit_reminders() returns trigger language plpgsql security definer set search_path='' as $$declare d kh_private.agency_deals;t kh_private.agency_tasks;begin
 if new.proposal_id is null then return new;end if;
 select x.* into d from kh_private.agency_deals x join kh_private.agency_proposals p on p.deal_id=x.id where p.id=new.proposal_id;
 perform kh_private.agency_refresh_visit_reminders(new);
 if tg_op='UPDATE' and old.outcome='unrecorded' and new.outcome='cancelled' and old.starts_at>clock_timestamp() and d.contact_kind='external' then
  insert into kh_private.agency_tasks(deal_id,title,kind,assignee_id,reason)values(d.id,'Comunicar cancelación de visita','external_notification',d.assignee_id,coalesce(new.closed_reason,'visit_cancelled'))returning * into t;
  perform kh_private.agency_followup_event(d.id,t.id,auth.uid(),'external_notification_created',jsonb_build_object('title',t.title,'reason',t.reason,'assigneeId',t.assignee_id));
 end if;return new;
end $$;
create trigger kh_agency_visit_reminders after insert or update on kh_private.property_visit_slots for each row execute function kh_private.agency_visit_reminders();
-- Appointments confirmed before this migration participate too. Expired reminders
-- are never synthesized, and completed/cancelled slots remain historical.
do $$declare s kh_private.property_visit_slots;begin for s in select v.* from kh_private.property_visit_slots v join kh_private.agency_proposals p on p.id=v.proposal_id where p.status='accepted' and v.outcome='unrecorded' and v.starts_at>clock_timestamp() loop perform kh_private.agency_refresh_visit_reminders(s);end loop;end $$;
-- Numeric list callers remain compatible; optional filters are evaluated before offset/limit.
drop function public.kh_list_agency_deals(uuid,uuid,integer,integer);
create function public.kh_list_agency_deals(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30,p_filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;begin
 perform kh_private.agency_account(p_actor_id);
 if p_agency_id is null or not kh_private.agency_contact_member(p_agency_id,p_actor_id) then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 or jsonb_typeof(p_filters) is distinct from 'object' or p_filters-array['propertyId','assigneeId']<>'{}'::jsonb then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_deal_json(x) order by x.created_at desc,x.id),'[]') into items from(select d.* from kh_private.agency_deals d where kh_private.agency_deal_visible(p_actor_id,p_agency_id,d)
 and (not(p_filters?'propertyId') or kh_private.agency_effective_property(d.property_id)=kh_private.agency_effective_property((p_filters->>'propertyId')::uuid))
 and (not(p_filters?'assigneeId') or d.assignee_id is not distinct from (p_filters->>'assigneeId')::uuid) order by d.created_at desc,d.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function kh_private.agency_followup_staff(actor uuid,agency uuid,d kh_private.agency_deals) returns void language plpgsql security definer set search_path='' as $$begin
 if agency is null or d.agency_id is distinct from agency or not kh_private.agency_contact_member(agency,actor) then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
end $$;
create function public.kh_list_agency_tasks(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid default null,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;checked kh_private.agency_deals;begin
 perform kh_private.agency_account(p_actor_id);
 if not kh_private.agency_contact_member(p_agency_id,p_actor_id) then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
 if p_deal_id is not null then checked:=kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_task_json(x) order by x.created_at desc,x.id),'[]') into items from(select t.* from kh_private.agency_tasks t join kh_private.agency_deals d on d.id=t.deal_id where kh_private.agency_deal_visible(p_actor_id,p_agency_id,d) and (p_deal_id is null or t.deal_id=p_deal_id)
 order by t.created_at desc,t.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_list_agency_followup_events(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;checked kh_private.agency_deals;begin
 checked:=kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,checked);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'dealId',x.deal_id,'taskId',x.task_id,'actorId',case when exists(select 1 from auth.users where id=x.actor_id) then x.actor_id end,'kind',x.kind,'details',x.details,'createdAt',x.created_at) order by x.created_at desc,x.id),'[]') into items from(select * from kh_private.agency_followup_events where deal_id=p_deal_id order by created_at desc,id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_list_agency_deal_visits(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;d kh_private.agency_deals;begin
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,d);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_visit_json(x) order by x.starts_at desc,x.id),'[]') into items from(select s.* from kh_private.property_visit_slots s join kh_private.agency_proposals p on p.id=s.proposal_id where p.deal_id=p_deal_id order by s.starts_at desc,s.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_get_agency_deal_conversation_id(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare d kh_private.agency_deals;begin
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,d);
 return (select id from kh_private.agency_conversations where deal_id=d.id);end $$;
create function public.kh_save_agency_task(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare before kh_private.agency_deals;d kh_private.agency_deals;t kh_private.agency_tasks;r jsonb;target uuid:=(p_payload->>'assigneeId')::uuid;due timestamptz:=(p_payload->>'dueAt')::timestamptz;begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['id','dealId','assigneeId','dueAt','title','expectedVersion','clientRequestId']<>'{}'::jsonb or not(p_payload?'assigneeId') or not(p_payload?'dueAt') then raise exception 'KH_AGENCY_INVALID_TASK';end if;
 before:=kh_private.agency_prepare_deal(p_actor_id,p_agency_id,(p_payload->>'dealId')::uuid);
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,before.property_id,array[before.buyer_id,before.assignee_id,target]);
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,before.id);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,d);
 if d.assignee_id is distinct from before.assignee_id or d.buyer_id is distinct from before.buyer_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 if exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and role='manager') and target is distinct from p_actor_id then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'save_task',p_payload);
 if r is not null then select * into t from kh_private.agency_tasks where id=(r->>'id')::uuid;return kh_private.agency_task_json(t);end if;
 if target is not null and (not kh_private.agency_contact_member(p_agency_id,target) or target=d.buyer_id or kh_private.agency_pair_blocked(d.buyer_id,target)) then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
 if target is not null and target is distinct from d.assignee_id then raise exception 'KH_AGENCY_TASK_ASSIGNEE_MISMATCH';end if;
 if p_payload?'id' then
  select * into t from kh_private.agency_tasks where id=(p_payload->>'id')::uuid and deal_id=d.id for update;
  if t.id is null or t.state<>'open' then raise exception 'KH_AGENCY_INVALID_TASK';end if;
  if t.kind='followup' then perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
  elsif not exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and state='active' and role in('coordinator','admin')) then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;
  if t.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
  if t.assignee_id is distinct from p_actor_id and exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and role='manager') then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;
  update kh_private.agency_tasks set title=kh_private.agency_text(p_payload->'title',2,200),assignee_id=target,due_at=due,version=version+1 where id=t.id returning * into t;
 else
  perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
  if p_payload?'expectedVersion' then raise exception 'KH_AGENCY_INVALID_TASK';end if;
  insert into kh_private.agency_tasks(deal_id,title,assignee_id,due_at)values(d.id,kh_private.agency_text(p_payload->'title',2,200),target,due)returning * into t;
 end if;
 perform kh_private.agency_followup_event(d.id,t.id,p_actor_id,'task_saved',jsonb_build_object('title',t.title,'assigneeId',target,'state',t.state));
 return kh_private.agency_remember(p_actor_id,p_agency_id,'save_task',p_payload,kh_private.agency_task_json(t));end $$;
create function public.kh_finish_agency_task(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare before kh_private.agency_tasks;t kh_private.agency_tasks;prepared kh_private.agency_deals;d kh_private.agency_deals;r jsonb;v_state text:=p_payload->>'state';begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['taskId','state','expectedVersion','clientRequestId']<>'{}'::jsonb or coalesce(v_state,'') not in('done','cancelled') then raise exception 'KH_AGENCY_INVALID_TASK';end if;
 select * into before from kh_private.agency_tasks where id=(p_payload->>'taskId')::uuid;if before.id is null then raise exception 'KH_AGENCY_INVALID_TASK';end if;
 d:=kh_private.agency_prepare_deal(p_actor_id,p_agency_id,before.deal_id);
 prepared:=d;
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,d.property_id,array[d.buyer_id,d.assignee_id,before.assignee_id]);d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,d.id);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,d);
 if prepared.assignee_id is distinct from d.assignee_id or prepared.buyer_id is distinct from d.buyer_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 select * into t from kh_private.agency_tasks where id=before.id for update;
 if t.assignee_id is distinct from before.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 if t.assignee_id is distinct from p_actor_id and exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and role='manager') then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'finish_task',p_payload);if r is not null then return kh_private.agency_task_json(t);end if;
 if t.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
 if t.state<>'open' then raise exception 'KH_AGENCY_INVALID_TASK';end if;
 if t.kind='followup' then perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);end if;
 update kh_private.agency_tasks set state=v_state,version=version+1 where id=t.id returning * into t;
 perform kh_private.agency_followup_event(d.id,t.id,p_actor_id,'task_finished',jsonb_build_object('title',t.title,'state',t.state));return kh_private.agency_remember(p_actor_id,p_agency_id,'finish_task',p_payload,kh_private.agency_task_json(t));end $$;
create function kh_private.agency_terminate_followups(deals uuid[],p_reason text) returns void language plpgsql set search_path='' as $$declare t kh_private.agency_tasks;begin
 for t in update kh_private.agency_tasks set state='cancelled',reason=p_reason,version=version+1 where deal_id=any(deals) and kind='followup' and state='open' returning * loop
 perform kh_private.agency_followup_event(t.deal_id,t.id,auth.uid(),'task_terminated',jsonb_build_object('title',t.title,'state',t.state,'reason',p_reason));end loop;
 update kh_private.agency_reminders set state='cancelled',reason=p_reason where deal_id=any(deals) and state in('pending','failed');end $$;
alter function kh_private.terminate_mandate_flows(uuid,uuid,text) rename to terminate_mandate_flows_pre_followups;
create function kh_private.terminate_mandate_flows(p_property_id uuid,p_agency_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform kh_private.terminate_mandate_flows_pre_followups(p_property_id,p_agency_id,p_reason);
 perform kh_private.agency_terminate_followups((select array_agg(id) from kh_private.agency_deals where agency_id=p_agency_id and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id)),p_reason);end $$;
alter function kh_private.terminate_agency_member_flows(uuid,uuid,text) rename to terminate_agency_member_flows_pre_followups;
create function kh_private.terminate_agency_member_flows(p_agency_id uuid,p_user_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare t kh_private.agency_tasks;begin
 perform kh_private.terminate_agency_member_flows_pre_followups(p_agency_id,p_user_id,p_reason);
 for t in update kh_private.agency_tasks set assignee_id=null,version=version+1 where deal_id in(select id from kh_private.agency_deals where agency_id=p_agency_id) and assignee_id=p_user_id and state='open' returning * loop
 perform kh_private.agency_followup_event(t.deal_id,t.id,auth.uid(),'task_unassigned',jsonb_build_object('title',t.title,'previousAssigneeId',p_user_id,'assigneeId',null,'reason',p_reason));end loop;
 update kh_private.agency_reminders set state='cancelled',reason=p_reason where recipient_id=p_user_id and deal_id in(select id from kh_private.agency_deals where agency_id=p_agency_id) and state in('pending','failed');end $$;
create function public.kh_set_agency_deal_stage(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare d kh_private.agency_deals;r jsonb;v_stage text:=p_payload->>'stage';begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['dealId','stage','expectedVersion','clientRequestId']<>'{}'::jsonb or coalesce(v_stage,'') not in('inquiry','visit_proposed','visit_confirmed','visited','offer','won','lost') then raise exception 'KH_AGENCY_INVALID';end if;
 d:=kh_private.agency_scheduling_deal(p_actor_id,p_agency_id,(p_payload->>'dealId')::uuid);perform kh_private.agency_followup_staff(p_actor_id,p_agency_id,d);
 if v_stage='won' then raise exception 'KH_AGENCY_CLOSURE_REQUIRED';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'set_deal_stage',p_payload);if r is not null then return kh_private.agency_deal_json(d);end if;
 perform kh_private.agency_scheduling_live(p_actor_id,p_agency_id,d);
 if d.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
 if v_stage='lost' then perform kh_private.agency_terminate_scheduling(array[d.id],'deal_lost');perform kh_private.agency_terminate_followups(array[d.id],'deal_lost');end if;
 update kh_private.agency_deals set stage=v_stage,closed_reason=case when v_stage='lost' then 'deal_lost' else closed_reason end,version=version+1 where id=d.id returning * into d;
 perform kh_private.agency_followup_event(d.id,null,p_actor_id,'stage_changed',jsonb_build_object('stage',v_stage));return kh_private.agency_remember(p_actor_id,p_agency_id,'set_deal_stage',p_payload,kh_private.agency_deal_json(d));end $$;
alter function public.kh_assign_agency_deal(uuid,uuid,jsonb) rename to kh_assign_agency_deal_pre_followups;
create function public.kh_assign_agency_deal(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare before kh_private.agency_deals;d kh_private.agency_deals;s kh_private.property_visit_slots;t kh_private.agency_tasks;target uuid:=(p_payload->>'userId')::uuid;r jsonb;begin
 before:=kh_private.agency_prepare_deal(p_actor_id,p_agency_id,(p_payload->>'dealId')::uuid);
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,before.property_id,array[before.buyer_id,before.assignee_id,target]);perform kh_private.agency_actor(p_actor_id,p_agency_id,'coordinator');d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,before.id);
 if before.assignee_id is distinct from d.assignee_id or before.buyer_id is distinct from d.buyer_id then raise exception 'KH_VERSION_CONFLICT';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'assign_deal',p_payload);if r is not null then return kh_private.agency_deal_json(d);end if;
 for s in select v.* from kh_private.property_visit_slots v join kh_private.agency_proposals p on p.id=v.proposal_id where p.deal_id=d.id and v.outcome='unrecorded' and v.starts_at>clock_timestamp() loop
  if exists(select 1 from kh_private.property_visit_slots other where other.id<>s.id and other.assignee_id=target and kh_private.agency_slot_live(other) and other.starts_at<s.ends_at and s.starts_at<other.ends_at and (s.joint_slot_id is null or (other.id<>s.joint_slot_id and other.joint_slot_id is distinct from s.joint_slot_id))) then raise exception 'KH_AGENCY_VISIT_CONFLICT';end if;
 end loop;
 r:=public.kh_assign_agency_deal_pre_followups(p_actor_id,p_agency_id,p_payload);
 update kh_private.property_visit_slots v set assignee_id=target,version=v.version+1 where v.proposal_id in(select id from kh_private.agency_proposals where deal_id=d.id) and v.outcome='unrecorded' and v.starts_at>clock_timestamp();
 for t in update kh_private.agency_tasks set assignee_id=target,version=version+1 where deal_id=d.id and state='open' and assignee_id=before.assignee_id returning * loop
  perform kh_private.agency_followup_event(d.id,t.id,p_actor_id,'task_assigned',jsonb_build_object('title',t.title,'assigneeId',target,'previousAssigneeId',before.assignee_id));end loop;
 perform kh_private.agency_followup_event(d.id,null,p_actor_id,'deal_assigned',jsonb_build_object('assigneeId',target,'previousAssigneeId',before.assignee_id));return r;end $$;
-- All new helper and predecessor functions are server-only; expose only scoped public RPCs.
do $$declare f record;begin for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='kh_private' and p.proname=any(array['agency_task_json','agency_followup_event','agency_remind','agency_task_reminders','agency_refresh_visit_reminders','agency_visit_reminders','agency_followup_staff','agency_terminate_followups','terminate_mandate_flows','terminate_mandate_flows_pre_followups','terminate_agency_member_flows','terminate_agency_member_flows_pre_followups'])) or
 (n.nspname='public' and p.proname=any(array['kh_list_agency_deals','kh_list_agency_tasks','kh_list_agency_followup_events','kh_list_agency_deal_visits','kh_get_agency_deal_conversation_id','kh_save_agency_task','kh_finish_agency_task','kh_set_agency_deal_stage','kh_assign_agency_deal','kh_assign_agency_deal_pre_followups'])) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);if f.nspname='public' and f.proname<>'kh_assign_agency_deal_pre_followups' then execute format('grant execute on function %s to authenticated',f.signature);end if;end loop;end $$;
