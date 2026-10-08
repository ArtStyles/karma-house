-- Local baseline lacks pgcrypto; exact SHA256 shim only in the rollback fixture.
do $fixture$begin if to_regprocedure('extensions.digest(text,text)') is null then execute $definition$create function extensions.digest(value text,algorithm text) returns bytea language sql immutable as 'select sha256(convert_to(value,''UTF8''))'$definition$;end if;end$fixture$;
-- All transport is transaction-local and synthetic. No pg_net/FCM calls.
create temp table agency_test_transport(kind text,payload jsonb);
create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$begin insert into pg_temp.agency_test_transport values(p_kind,p_payload);return 910000+(select count(*) from pg_temp.agency_test_transport);end$$;
create function pg_temp.agency_device(actor uuid,support boolean) returns uuid language plpgsql as $$declare id uuid:=gen_random_uuid();begin
 perform pg_temp.kh_as(actor);
 perform public.kh_register_push_device(actor,jsonb_build_object('installationId',id,'installationSecret',repeat('a',64),'revision',1,'fcmToken',repeat(replace(id::text,'-',''),3),'platform','android','projectId','e054aea9-38b4-4211-826b-521b3cc0be9f')||case when support then '{"supportsAgencyNotifications":true}'::jsonb else '{}'::jsonb end);
 update kh_private.push_devices set expo_push_token='ExpoPushToken['||replace(id::text,'-','')||']',exchange_next_at=null where installation_id=id;return id;
end$$;
do $$declare f jsonb:=pg_temp.schedule_fixture(90);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;owner uuid:='45000000-0000-4000-8000-000000000001';v jsonb;e uuid;n uuid;cut text;device uuid;old_device uuid;before_count integer;begin
 device:=pg_temp.agency_device(owner,true);old_device:=pg_temp.agency_device(owner,false);
 perform pg_temp.kh_assert(not(select supports_agency_notifications from kh_private.push_devices where installation_id=old_device),'old_device_defaults_to_no_agency_support');
 perform pg_temp.kh_as(u);
 v:=public.kh_request_agency_verification(u,a,jsonb_build_object('input',jsonb_build_object('message','PRIVATE EVIDENCE buyer price commission secret','evidenceReferences',jsonb_build_array('private-proof')),'clientRequestId',gen_random_uuid()));
 select id into e from kh_private.agency_events where kind='agency_verification_requested' and subject_id=(v->>'id')::uuid;
 perform kh_private.push_tick();
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.notifications where agency_event_id=e and recipient_id=owner),'verification_request_notifies_owner_only');
 select id,seq::text into n,cut from kh_private.notifications where agency_event_id=e;
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.notifications where agency_event_id=e and (body||title||actor_name||property_title)~*'PRIVATE|price|commission|buyer'),'verification_push_contains_no_private_evidence');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.push_outbox where notification_id=n),'only_capable_device_enqueued');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.push_outbox o where notification_id=n and kh_private.push_payload(o)::text~*'PRIVATE|buyer|commission|proof'),'verification_push_contains_no_private_evidence');
 perform pg_temp.kh_error(format('select public.kh_read_notification(%L,%L)',owner,n),'KH_ACCOUNT_CHANGED');
 before_count:=(select count(*) from kh_private.push_outbox);
 perform kh_private.enqueue_agency_event(e);
 perform pg_temp.kh_assert((select count(*) from kh_private.push_outbox)=before_count,'notification_replay_does_not_duplicate_outbox');
 perform pg_temp.kh_as(owner);
 perform pg_temp.kh_assert((public.kh_notification_summary(owner)->>'unreadCount')::integer=0,'old_notification_client_excludes_agency_category');
 perform pg_temp.kh_assert(jsonb_array_length(public.kh_list_notifications(owner)->'items')=0,'old_list_excludes_agency_category');
 perform public.kh_read_notifications_through(owner,cut);
 perform pg_temp.kh_assert((select read_at is null from kh_private.notifications where id=n),'old_mark_all_read_preserves_agency_notices');
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(owner,n)#>>'{agencyTarget,route}'='verification_reviews','owner_route_has_no_staff_context');
 update kh_private.agency_settings set enabled=false;
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(owner,n)#>>'{agencyTarget,route}'='verification_reviews','module_off_preserves_authorized_history');
 perform pg_temp.kh_assert(not(select kh_private.push_eligible(o) from kh_private.push_outbox o where notification_id=n),'module_off_blocks_delivery');
 update kh_private.agency_settings set enabled=true;
 perform public.kh_save_notification_preferences(owner,'{"messages":true,"visits":true,"offers":true,"alerts":true,"agencies":false,"expectedVersion":0}');
 perform public.kh_save_notification_preferences(owner,'{"messages":false,"visits":true,"offers":true,"expectedVersion":1}');
 perform pg_temp.kh_assert(not(public.kh_get_notification_preferences(owner)->>'agencies')::boolean,'old_preferences_preserve_agencies');
 perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'requestId',v->>'id','decision','grant','note','PRIVATE decision evidence','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where id=a),'expectedRequestVersion',1,'clientRequestId',gen_random_uuid()));
 perform kh_private.push_tick();
 select n2.id into n from kh_private.notifications n2 where n2.event_kind='agency_verification' and recipient_id=u;
 perform pg_temp.kh_assert(n is not null,'verification_decision_notifies_current_agency_admins');
 perform pg_temp.kh_as(u);
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(u,n)#>>'{agencyTarget,route}'='verification','admin_verification_route');
 update kh_private.agency_memberships set role='manager' where agency_id=a and user_id=u;
 perform pg_temp.kh_error(format('select public.kh_resolve_push_notification(%L,%L)',u,n),'KH_PUSH_NOT_FOUND');
 perform pg_temp.kh_assert(not exists(select 1 from pg_temp.agency_test_transport),'no_transport_while_disabled');
 perform pg_temp.kh_assert((select count(*)=1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='kh_list_notifications'),'no_postgrest_overload_ambiguity');
end$$;

-- Initial decisions target the responsible account before membership exists.
do $$declare a uuid:=pg_temp.kh_agency_signup(92);u uuid:='45000000-0000-4000-8000-000000000092';owner uuid:='45000000-0000-4000-8000-000000000001';begin
 perform pg_temp.kh_as(owner);
 perform public.kh_review_agency(owner,jsonb_build_object('agencyId',a,'decision','needs_changes','note','Corregir solicitud','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform kh_private.push_tick();
 perform pg_temp.kh_assert(exists(select 1 from kh_private.notifications n where recipient_id=u and event_kind='agency_review' and agency_target->>'route'='application'),'initial_review_notifies_responsible_without_membership');
end$$;
-- An invitation belongs to an account before any team membership exists.
do $$declare a uuid:=pg_temp.kh_agency_signup(94);u uuid:='45000000-0000-4000-8000-000000000094';invitee uuid:='45000000-0000-4000-8000-000000000002';r jsonb;n uuid;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(u);
 r:=public.kh_invite_agency_member(u,a,jsonb_build_object('userId',invitee,'role','manager','clientRequestId',gen_random_uuid()));
 perform kh_private.push_tick();
 select id into n from kh_private.notifications where event_kind='team_invitation' and recipient_id=invitee;
 perform pg_temp.kh_as(invitee);
 perform pg_temp.kh_assert(n is not null and public.kh_resolve_push_notification(invitee,n)#>'{agencyTarget,agencyId}'='null'::jsonb,'invitation_routes_account_without_membership');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_memberships where agency_id=a and user_id=invitee),'notice_does_not_grant_membership');
 perform public.kh_save_notification_preferences(invitee,'{"messages":true,"visits":true,"offers":true,"alerts":true,"agencies":false,"expectedVersion":0}');
 insert into kh_private.agency_events(agency_id,kind,subject_id)values(a,'team_invitation',(r->>'id')::uuid);
 perform kh_private.push_tick();
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.notifications where recipient_id=invitee and event_kind='team_invitation'),'agency_category_preference_suppresses_future_notices');
 perform pg_temp.kh_assert(public.kh_resolve_push_notification(invitee,n)#>>'{agencyTarget,route}'='team','preference_does_not_hide_saved_notice');
 perform pg_temp.kh_as(null);perform pg_temp.kh_error(format('select public.kh_resolve_push_notification(%L,%L)',invitee,n),'KH_AUTH_REQUIRED');
end$$;

-- Search-alert compatibility and exact legacy function arities remain intact.
do $$declare f jsonb:=pg_temp.schedule_fixture(96);u uuid:=(f->>'actor')::uuid;owner uuid:='45000000-0000-4000-8000-000000000001';n uuid;cut text;begin
 insert into kh_private.notifications(seq,recipient_id,actor_id,category,actor_name,property_title,title,body,property_id)
 values(nextval('kh_private.notification_seq'),owner,u,'alert','Persona','Casa','Búsqueda guardada','Coincidencia de búsqueda',(f->>'property')::uuid)returning id,seq::text into n,cut;
 perform pg_temp.kh_as(owner);
 perform pg_temp.kh_assert((public.kh_notification_summary(owner,true)->>'unreadCount')::integer=1,'legacy_alert_client_counts_only_its_category');
 perform pg_temp.kh_assert(jsonb_array_length(public.kh_list_notifications(owner,null,false,null,30,true)->'items')=1,'legacy_alert_client_list_preserved');
 perform public.kh_read_notifications_through(owner,cut);
 perform pg_temp.kh_assert((select read_at is not null from kh_private.notifications where id=n),'old_readall_keeps_historical_alert_semantics');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.notifications where recipient_id=owner and category='agency' and read_at is null),'old_readall_never_marks_agencies');
 perform pg_temp.kh_assert(not exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname in('kh_notification_summary','kh_list_notifications','kh_read_notification','kh_read_notifications_through') group by p.proname having count(*)<>1),'public_rpc_names_are_unambiguous');
end$$;
