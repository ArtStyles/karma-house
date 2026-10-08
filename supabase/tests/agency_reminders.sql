create temp table agency_test_transport(kind text,payload jsonb);
create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$begin insert into pg_temp.agency_test_transport values(p_kind,p_payload);return 920000+(select count(*) from pg_temp.agency_test_transport);end$$;
do $$declare f jsonb:=pg_temp.schedule_fixture(91);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;d uuid:=(f->>'deal')::uuid;t uuid:=gen_random_uuid();r uuid;n uuid;begin
 insert into kh_private.agency_tasks(id,deal_id,title,assignee_id,due_at)values(t,d,'PRIVATE task buyer price',u,clock_timestamp()-interval '1 minute');
 insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id)select id,deal_id,'task_due',due_at,assignee_id from kh_private.agency_tasks where id=t returning id into r;
 perform kh_private.push_tick();
 perform pg_temp.kh_assert((select state='delivered' from kh_private.agency_reminders where id=r),'due_reminder_materializes');
 select id into n from kh_private.notifications where agency_event_id=r;
 perform pg_temp.kh_assert(n is not null,'reminder_notice_exists');
 update kh_private.agency_settings set enabled=false;
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(u,n)#>>'{agencyTarget,route}'='deal','module_off_keeps_authorized_reminder_history');
 update kh_private.agency_settings set enabled=true;
 perform kh_private.push_tick();
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.notifications where agency_event_id=r),'reminder_replay_dedup');
 update kh_private.agency_tasks set state='done' where id=t;
 perform pg_temp.kh_assert(not(select kh_private.agency_notice_deliverable(x) from kh_private.notifications x where id=n),'finished_task_invalidates_queued_delivery');
 t:=gen_random_uuid();insert into kh_private.agency_tasks(id,deal_id,title,assignee_id,due_at)values(t,d,'Pendiente',u,clock_timestamp()-interval '1 minute');
 insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id)select id,deal_id,'task_due',due_at,assignee_id from kh_private.agency_tasks where id=t returning id into r;
 update kh_private.agency_mandates set state='withdrawn' where property_id=(f->>'property')::uuid and agency_id=a;
 perform kh_private.push_tick();
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.notifications where agency_event_id=r),'reminder_rechecks_current_mandate');
 perform pg_temp.kh_assert((select state='cancelled' from kh_private.agency_reminders where id=r),'stale_reminder_cancelled');
 perform pg_temp.kh_assert(not exists(select 1 from pg_temp.agency_test_transport),'stub_only_no_real_calls');
end$$;

-- Closure and transport are independent; the synthetic provider cannot undo a sale.
do $$declare f jsonb:=pg_temp.schedule_fixture(93);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;d uuid:=(f->>'deal')::uuid;pid uuid:=(f->>'property')::uuid;visit jsonb;r jsonb;v integer;device uuid:=gen_random_uuid();job kh_private.push_outbox;attempt uuid;buyer uuid:='45000000-0000-4000-8000-000000000002';buyer_deal jsonb;buyer_notice uuid;nochat_buyer uuid:='45000000-0000-4000-8000-000000000004';nochat_deal jsonb;nochat_notice uuid;begin
 perform pg_temp.kh_as(u);
 visit:=pg_temp.visit_proposal(u,a,d,date_trunc('minute',clock_timestamp()+interval '3 days'));perform pg_temp.accept_visit(u,a,visit);
 insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,expo_push_token,token_hash,enabled,expires_at,supports_agency_notifications)
 values(device,decode(repeat('aa',32),'hex'),1,'register',decode('aa','hex'),u,md5(u::text||':session')::uuid,'ExpoPushToken[synthetic-agency-closure]',decode('aa','hex'),true,clock_timestamp()+interval '1 day',true);
 buyer_deal:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'buyerId',buyer,'assigneeId',u,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(buyer);perform public.kh_start_agency_conversation(buyer,a,jsonb_build_object('propertyId',pid,'preferredManagerId',u,'clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(u);
 nochat_deal:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'buyerId',nochat_buyer,'assigneeId',u,'clientRequestId',gen_random_uuid()));
 select version into v from public.properties where id=pid;
 r:=public.kh_request_agency_sale(u,a,jsonb_build_object('winningDealId',d,'executingManagerId',u,'amountUsd',29876,'occurredAt',clock_timestamp()-interval '1 hour','expectedPropertyVersion',v,'expectedAuthorityVersion',1,'clientRequestId',gen_random_uuid()));
 perform public.kh_decide_agency_sale(u,a,jsonb_build_object('requestId',r->>'id','action','confirm','expectedRequestVersion',1,'expectedPropertyVersion',v,'expectedAuthorityVersion',1,'note','PRIVATE buyer commission','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_reminders where deal_id=d and state in('pending','failed')),'sold_property_cancels_queued_reminders');
 perform pg_temp.kh_assert(not exists(select 1 from pg_temp.agency_test_transport),'sale_never_calls_provider');
 perform kh_private.push_tick();
 perform pg_temp.kh_assert(exists(select 1 from kh_private.notifications where deal_id=d and event_kind='property_sold'),'committed_closure_materializes_generic_notice');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.notifications where deal_id=d and event_kind='manual_cancellation_notice'),'external_cancellation_is_staff_task_notice');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.notifications where deal_id=d and (body||title||actor_name||property_title)~*'buyer|29876|commission|Contacto'),'closure_notices_do_not_include_buyer_price_or_commission');
 select id into nochat_notice from kh_private.notifications where recipient_id=nochat_buyer and event_kind='property_sold' and deal_id=(nochat_deal->>'id')::uuid;
 perform pg_temp.kh_as(nochat_buyer);
 perform pg_temp.kh_assert(nochat_notice is not null and public.kh_resolve_push_notification(nochat_buyer,nochat_notice)#>>'{agencyTarget,route}'='account_notice','buyer_without_chat_retains_account_notice');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_conversations where deal_id=(nochat_deal->>'id')::uuid),'delivery_does_not_manufacture_buyer_conversation');
 select id into buyer_notice from kh_private.notifications where recipient_id=buyer and event_kind='property_sold' and deal_id=(buyer_deal->>'id')::uuid;
 perform pg_temp.kh_as(buyer);
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(buyer,buyer_notice)#>>'{agencyTarget,route}'='buyer_conversation' and public.kh_resolve_push_notification(buyer,buyer_notice)#>'{agencyTarget,agencyId}'='null'::jsonb,'buyer_history_routes_only_account_context');
 perform pg_temp.kh_as(u);
 update kh_private.push_config set transport_enabled=true;
 perform kh_private.push_tick();
 perform pg_temp.kh_assert(exists(select 1 from pg_temp.agency_test_transport where kind='send'),'synthetic_transport_dispatched');
 perform pg_temp.kh_assert(not exists(select 1 from pg_temp.agency_test_transport where payload::text~*'buyer|29876|commission|Contacto|PRIVATE'),'generic_transport_contains_no_private_content');
 for attempt in select x.id from kh_private.push_http_attempts x join kh_private.push_outbox o on o.id=x.outbox_id where o.installation_id=device and x.completed_at is null loop
  perform kh_private.push_apply_response(attempt,503,'{}',false);
 end loop;
 perform pg_temp.kh_assert((select availability='sold' from public.properties where id=pid) and (select count(*)=1 from kh_private.property_sale_closures where property_id=pid),'provider_failure_does_not_rollback_sale');
 select o.* into job from kh_private.push_outbox o join kh_private.notifications n on n.id=o.notification_id where n.deal_id=d and n.event_kind='property_sold';
 perform pg_temp.kh_assert(job.state='retry','provider_failure_is_delivery_retry_only');
 -- A removed manager loses even the old historical target. No new Auth recipient is invented.
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,'45000000-0000-4000-8000-000000000008','admin');
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=u;
 perform pg_temp.kh_as(u);
 perform pg_temp.kh_error(format('select public.kh_resolve_push_notification(%L,%L)',u,job.notification_id),'KH_PUSH_NOT_FOUND');
 perform pg_temp.kh_assert(not kh_private.push_eligible(job),'withdrawn_member_cannot_resolve_old_push');
end$$;



-- An overdue queued visit reminder still checks the current booking and assignee.
do $$declare f jsonb:=pg_temp.schedule_fixture(95);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;d uuid:=(f->>'deal')::uuid;p jsonb;r uuid;n kh_private.notifications;begin
 p:=pg_temp.visit_proposal(u,a,d,date_trunc('minute',clock_timestamp()+interval '23 hours'));perform pg_temp.accept_visit(u,a,p);
 insert into kh_private.agency_reminders(subject_id,deal_id,kind,due_at,recipient_id)select proposal_id,d,'visit_24h',starts_at-interval '24 hours',assignee_id from kh_private.property_visit_slots where proposal_id=(p->>'id')::uuid returning id into r;
 update kh_private.agency_settings set enabled=false;perform kh_private.push_tick();
 perform pg_temp.kh_assert((select state='pending' from kh_private.agency_reminders where id=r),'module_off_retains_pending_visit');
 update kh_private.agency_settings set enabled=true;perform kh_private.push_tick();
 select * into n from kh_private.notifications where agency_event_id=r;
 perform pg_temp.kh_assert(n.id is not null and n.event_kind='visit_reminder' and kh_private.agency_notice_deliverable(n),'current_visit_reminder_is_eligible');
 update kh_private.property_visit_slots set assignee_id=null where proposal_id=(p->>'id')::uuid;
 perform pg_temp.kh_assert(not kh_private.agency_notice_deliverable(n),'reassigned_visit_cannot_deliver_stale_reminder');
end$$;
