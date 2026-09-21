-- Synthetic identities and a transaction-local transport replacement: never a real push.
begin;
create function pg_temp.push_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'PUSH ASSERTION: %',label; end if; end $$;
create function pg_temp.push_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, got %',expected,sqlerrm;
  end;
  raise exception 'PUSH ASSERTION: expected %',expected;
end $$;
select pg_temp.push_assert(to_regprocedure('public.kh_register_push_device(uuid,jsonb)') is not null,'registration RPC must exist');
create function pg_temp.push_actor(actor uuid,session uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
$$;
insert into auth.users(id,email,raw_user_meta_data) values
('88000000-0000-4000-8000-000000000001','kh-push-seller@example.invalid','{}'),
('88000000-0000-4000-8000-000000000002','kh-push-buyer@example.invalid','{}'),
('88000000-0000-4000-8000-000000000003','kh-push-outsider@example.invalid','{}');
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values
('88000000-0000-4000-8000-000000000101','88000000-0000-4000-8000-000000000001',now(),now(),now()+interval '1 day'),
('88000000-0000-4000-8000-000000000102','88000000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 day'),
('88000000-0000-4000-8000-000000000103','88000000-0000-4000-8000-000000000003',now(),now(),now()+interval '1 day');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation)
values('88000000-0000-4000-8000-000000000010','88000000-0000-4000-8000-000000000001','push-sql','Título privado de prueba','Vedado','La Habana','Casa','Vivienda ficticia de pruebas de entrega Android.',50000,100,2,1,ARRAY['synthetic/push.jpg'],'approved');
create temporary table push_context(conversation_id uuid,payload jsonb,notice_id uuid,job_id uuid,attempt_id uuid,old_expiry timestamptz);
insert into push_context(payload) values(jsonb_build_object('installationId','88000000-0000-4000-8000-000000000201','installationSecret',repeat('a',64),'revision',1,'expoPushToken','ExponentPushToken[kh_synthetic_token_A]','platform','android','projectId','e054aea9-38b4-4211-826b-521b3cc0be9f'));
grant all on push_context to authenticated,anon;
set local role authenticated;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000102');
update push_context set conversation_id=(public.kh_start_conversation('88000000-0000-4000-8000-000000000010','88000000-0000-4000-8000-000000000002')->>'id')::uuid;
select public.kh_send_message(conversation_id,gen_random_uuid(),'Mensaje anterior a la activación','88000000-0000-4000-8000-000000000002') from push_context;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001',null);
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload) from push_context','KH_PUSH_SESSION_REQUIRED');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000102');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload) from push_context','KH_PUSH_SESSION_REQUIRED');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select pg_temp.push_assert((select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload)='{"enabled":true,"revision":1,"platform":"android"}' from push_context),'register bound to live session');
select pg_temp.push_assert((select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload)->>'revision'='1' from push_context),'same request is idempotent');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload||''{"expoPushToken":"ExponentPushToken[kh_synthetic_changed]"}'') from push_context','KH_PUSH_CONFLICT');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload||''{"installationSecret":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'') from push_context','KH_PUSH_FORBIDDEN');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload||''{"projectId":"88000000-0000-4000-8000-000000000201"}'') from push_context','KH_PUSH_INVALID');
select pg_temp.push_error('select * from kh_private.push_devices','permission denied');
reset role;
select pg_temp.push_assert(not exists(select 1 from kh_private.push_outbox where recipient_id='88000000-0000-4000-8000-000000000001'),'registration never backfills');
select pg_temp.push_assert((select secret_hash=extensions.digest(repeat('a',64),'sha256') from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201'),'only secret digest stored');
update kh_private.push_devices set expires_at=now()+interval '1 hour' where installation_id='88000000-0000-4000-8000-000000000201';
set local role authenticated;
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
reset role;
select pg_temp.push_assert((select expires_at>now()+interval '29 days' and revision=1 from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201'),'same-generation foreground renewal extends expiry');
set local role authenticated;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000103');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000003'',payload||''{"installationId":"88000000-0000-4000-8000-000000000203"}'') from push_context','KH_PUSH_TOKEN_IN_USE');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000102');
select public.kh_send_message(conversation_id,gen_random_uuid(),'CONTENIDO_PRIVADO_NO_PUSH','88000000-0000-4000-8000-000000000002') from push_context;
reset role;
update push_context set notice_id=(select id from kh_private.notifications where conversation_id=push_context.conversation_id order by seq desc limit 1);
update push_context set job_id=(select id from kh_private.push_outbox where notification_id=push_context.notice_id);
select pg_temp.push_assert((select job_id is not null from push_context),'new notification queues one device');
select pg_temp.push_assert((select count(*)=1 from kh_private.push_outbox where notification_id=(select notice_id from push_context)),'enqueue deduplication');
set local role authenticated;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select pg_temp.push_assert((select public.kh_resolve_push_notification('88000000-0000-4000-8000-000000000001',notice_id)->>'conversationId'=conversation_id::text from push_context),'tap resolves authorized conversation');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000103');
select pg_temp.push_error('select public.kh_resolve_push_notification(''88000000-0000-4000-8000-000000000003'',notice_id) from push_context','KH_PUSH_NOT_FOUND');
reset role;
select pg_temp.push_assert((select read_at is null from kh_private.notifications where id=(select notice_id from push_context)),'tap never marks read');
-- Replace transport only in this rollback transaction. Requests are inspected without leaving DB.
create temporary table push_mock_http(id bigint generated always as identity,kind text,payload jsonb);
create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_id bigint; begin insert into pg_temp.push_mock_http(kind,payload) values(p_kind,p_payload) returning id into v_id; return -v_id; end $$;
select kh_private.push_tick();
select pg_temp.push_assert(not exists(select 1 from push_mock_http),'disabled transport emits nothing');
update kh_private.push_config set transport_enabled=true where singleton;
select kh_private.push_tick();
select pg_temp.push_assert((select count(*)=1 from push_mock_http),'one send prepared');
select pg_temp.push_assert((select m.payload->>'title'='KarmaHouse' and m.payload->>'channelId'='karmahouse-updates' and m.payload->>'ttl'='3600'
  and m.payload->'data'=jsonb_build_object('kind','karmahouse.notification','notificationId',c.notice_id,'recipientId','88000000-0000-4000-8000-000000000001')
  and m.payload::text not like '%CONTENIDO_PRIVADO%' and m.payload::text not like '%Título privado%' from push_mock_http m cross join push_context c where kind='send'),'generic payload and exact routing metadata');
update push_context set attempt_id=(select active_attempt_id from kh_private.push_outbox where id=push_context.job_id);
select kh_private.push_apply_response(attempt_id,200,'{"data":{"status":"ok","id":"88000000-0000-4000-8000-000000000301"}}',false) from push_context;
select pg_temp.push_assert((select state='ticketed' and next_attempt_at>=now()+interval '14 minutes' from kh_private.push_outbox where id=(select job_id from push_context)),'receipt waits fifteen minutes');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select public.kh_read_notification('88000000-0000-4000-8000-000000000001',notice_id) from push_context;
select public.kh_save_notification_preferences('88000000-0000-4000-8000-000000000001','{"messages":false,"visits":true,"offers":true,"expectedVersion":0}');
select public.kh_set_user_block('88000000-0000-4000-8000-000000000002',true,'88000000-0000-4000-8000-000000000001');
update kh_private.push_outbox set next_attempt_at=now()-interval '1 second' where id=(select job_id from push_context);
select kh_private.push_tick();
select pg_temp.push_assert((select count(*)=1 from push_mock_http where kind='receipt'),'receipt query survives read, preference change and block');
update push_context set attempt_id=(select active_attempt_id from kh_private.push_outbox where id=push_context.job_id);
select kh_private.push_apply_response(attempt_id,200,'{"data":{"88000000-0000-4000-8000-000000000301":{"status":"ok"}}}',false) from push_context;
select pg_temp.push_assert((select state='provider_accepted' from kh_private.push_outbox where id=(select job_id from push_context)),'receipt indicates provider acceptance');
select public.kh_set_user_block('88000000-0000-4000-8000-000000000002',false,'88000000-0000-4000-8000-000000000001');
select public.kh_save_notification_preferences('88000000-0000-4000-8000-000000000001','{"messages":true,"visits":true,"offers":true,"expectedVersion":1}');
-- Anonymous possession permits revocation only; a tombstone defeats a delayed registration.
set local role anon;
select pg_temp.push_actor(null,null);
select pg_temp.push_assert(public.kh_disable_push_device('88000000-0000-4000-8000-000000000201',repeat('a',64),2)='{"enabled":false,"revision":2}','anonymous disable with secret');
select pg_temp.push_assert(public.kh_disable_push_device('88000000-0000-4000-8000-000000000201',repeat('a',64),2)->>'revision'='2','disable retry idempotent');
select pg_temp.push_error('select public.kh_disable_push_device(''88000000-0000-4000-8000-000000000201'',repeat(''b'',64),3)','KH_PUSH_FORBIDDEN');
select pg_temp.push_assert(public.kh_disable_push_device('88000000-0000-4000-8000-000000000202',repeat('b',64),3)->>'revision'='3','disable-before-register creates tombstone');
set local role authenticated;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload) from push_context','KH_PUSH_STALE');
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload||''{"revision":2}'') from push_context','KH_PUSH_CONFLICT');
update push_context set payload=payload||'{"revision":3}';
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000102');
select public.kh_send_message(conversation_id,gen_random_uuid(),'Aviso antes de bloqueo','88000000-0000-4000-8000-000000000002') from push_context;
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select public.kh_set_user_block('88000000-0000-4000-8000-000000000002',true,'88000000-0000-4000-8000-000000000001');
select pg_temp.push_error('select public.kh_resolve_push_notification(''88000000-0000-4000-8000-000000000001'',notice_id) from push_context','KH_PUSH_NOT_FOUND');
reset role;
select kh_private.push_tick();
select pg_temp.push_assert((select count(*)=2 from push_mock_http),'block suppresses queued send');
select pg_temp.push_assert(not exists(select 1 from kh_private.push_outbox where recipient_id='88000000-0000-4000-8000-000000000001' and state in('pending','sending','retry')),'blocked jobs cancelled');
set local role authenticated;
select public.kh_set_user_block('88000000-0000-4000-8000-000000000002',false,'88000000-0000-4000-8000-000000000001');
reset role;
create function pg_temp.push_new_job() returns uuid language plpgsql as $$
declare v_conversation uuid; v_id uuid; v_notice uuid;
begin
  perform pg_temp.push_actor('88000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000102');
  select conversation_id into v_conversation from pg_temp.push_context;
  perform public.kh_send_message(v_conversation,gen_random_uuid(),'Otro mensaje sintético','88000000-0000-4000-8000-000000000002');
  select id into v_notice from kh_private.notifications where conversation_id=v_conversation order by seq desc limit 1;
  select id into v_id from kh_private.push_outbox where notification_id=v_notice;
  if v_id is null then raise exception 'PUSH ASSERTION: expected fresh queued job'; end if;
  update pg_temp.push_context set job_id=v_id,notice_id=v_notice;
  return v_id;
end $$;
-- Reading or changing a category after enqueue cancels the pending send.
select pg_temp.push_new_job();
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select public.kh_read_notification('88000000-0000-4000-8000-000000000001',notice_id) from push_context;
select kh_private.push_tick();
select pg_temp.push_assert((select state='cancelled' from kh_private.push_outbox where id=(select job_id from push_context)),'read notification not pushed');
select pg_temp.push_new_job();
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select public.kh_save_notification_preferences('88000000-0000-4000-8000-000000000001','{"messages":false,"visits":true,"offers":true,"expectedVersion":2}');
select kh_private.push_tick();
select pg_temp.push_assert((select state='cancelled' from kh_private.push_outbox where id=(select job_id from push_context)),'disabled category not pushed');
select public.kh_save_notification_preferences('88000000-0000-4000-8000-000000000001','{"messages":true,"visits":true,"offers":true,"expectedVersion":3}');
select pg_temp.push_new_job();
select public.kh_disable_push_device('88000000-0000-4000-8000-000000000201',repeat('a',64),4);
select pg_temp.push_assert((select state='cancelled' from kh_private.push_outbox where id=(select job_id from push_context)),'disable cancels queued generation');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
update push_context set payload=payload||'{"revision":5}';
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
-- Retry transient failures at most six sends, never persist raw provider text.
select pg_temp.push_new_job();
do $$ declare v_job uuid; v_attempt uuid; v_count integer; begin
  select job_id into v_job from pg_temp.push_context;
  for v_count in 1..6 loop
    update kh_private.push_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=v_job;
    perform kh_private.push_tick();
    select active_attempt_id into v_attempt from kh_private.push_outbox where id=v_job;
    perform kh_private.push_apply_response(v_attempt,503,'{"message":"DO_NOT_PERSIST_PROVIDER_TOKEN"}',false);
  end loop;
end $$;
select pg_temp.push_assert((select state='failed' and send_attempts=6 and last_error='HTTP_SERVER_ERROR' from kh_private.push_outbox where id=(select job_id from push_context)),'six transient attempts terminate');
select pg_temp.push_assert(not exists(select 1 from kh_private.push_http_attempts where result_code like '%DO_NOT_PERSIST%'),'provider body not persisted');
select kh_private.push_tick();
select pg_temp.push_assert((select send_attempts=6 from kh_private.push_outbox where id=(select job_id from push_context)),'terminal failure never sends a seventh time');
select pg_temp.push_new_job();
select kh_private.push_tick();
select kh_private.push_apply_response(active_attempt_id,200,'{"unexpected":true}',false) from kh_private.push_outbox where id=(select job_id from push_context);
select pg_temp.push_assert((select state='retry' and last_error='MALFORMED_RESPONSE' from kh_private.push_outbox where id=(select job_id from push_context)),'malformed ticket retried with cap');
update kh_private.push_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select job_id from push_context);
select kh_private.push_tick();
update kh_private.push_http_attempts set deadline_at=clock_timestamp()-interval '1 second' where id=(select active_attempt_id from kh_private.push_outbox where id=(select job_id from push_context));
select kh_private.push_tick();
select pg_temp.push_assert((select state='retry' and last_error='HTTP_UNKNOWN' from kh_private.push_outbox where id=(select job_id from push_context)),'lost HTTP response recovered from durable lease');
update kh_private.push_outbox set state='cancelled' where id=(select job_id from push_context);
-- An old DeviceNotRegistered receipt cannot deactivate a token replacement.
select pg_temp.push_new_job();
select kh_private.push_tick();
select kh_private.push_apply_response(active_attempt_id,200,'{"data":{"status":"ok","id":"88000000-0000-4000-8000-000000000302"}}',false) from kh_private.push_outbox where id=(select job_id from push_context);
update kh_private.push_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select job_id from push_context);
select kh_private.push_tick();
update push_context set attempt_id=(select active_attempt_id from kh_private.push_outbox where id=push_context.job_id);
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
update push_context set payload=payload||'{"revision":6,"expoPushToken":"ExponentPushToken[kh_synthetic_token_B]"}';
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
select kh_private.push_apply_response(attempt_id,200,'{"data":{"88000000-0000-4000-8000-000000000302":{"status":"error","details":{"error":"DeviceNotRegistered"}}}}',false) from push_context;
select pg_temp.push_assert((select enabled and revision=6 from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201'),'old receipt cannot disable replacement');
select pg_temp.push_new_job();
select kh_private.push_tick();
select kh_private.push_apply_response(active_attempt_id,200,'{"data":{"status":"ok","id":"88000000-0000-4000-8000-000000000303"}}',false) from kh_private.push_outbox where id=(select job_id from push_context);
update kh_private.push_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select job_id from push_context);
select kh_private.push_tick();
select kh_private.push_apply_response(active_attempt_id,200,'{"data":{"88000000-0000-4000-8000-000000000303":{"status":"error","details":{"error":"MessageRateExceeded"}}}}',false) from kh_private.push_outbox where id=(select job_id from push_context);
select pg_temp.push_assert((select state='retry' from kh_private.push_outbox where id=(select job_id from push_context)),'provider rate failure retries delivery, not the same failed receipt');
update kh_private.push_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select job_id from push_context);
select kh_private.push_tick();
select kh_private.push_apply_response(active_attempt_id,200,'{"data":{"status":"error","details":{"error":"DeviceNotRegistered"}}}',false) from kh_private.push_outbox where id=(select job_id from push_context);
select pg_temp.push_assert((select not enabled and invalid_reason='DeviceNotRegistered' from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201'),'dead current token disabled');
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
update push_context set payload=payload||'{"revision":7}';
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
select pg_temp.push_new_job();
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='88000000-0000-4000-8000-000000000101';
select kh_private.push_tick();
select pg_temp.push_assert((select state='cancelled' from kh_private.push_outbox where id=(select job_id from push_context)),'expired auth session cancels queued send');
update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id='88000000-0000-4000-8000-000000000101';
select pg_temp.push_actor('88000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000101');
select public.kh_register_push_device('88000000-0000-4000-8000-000000000001',payload) from push_context;
-- A revoked Auth session cannot be renewed with its still-unexpired access token.
do $$ declare v_payload jsonb; begin
  select payload into v_payload from pg_temp.push_context;
  update auth.sessions set not_after=clock_timestamp()+interval '50 milliseconds' where id='88000000-0000-4000-8000-000000000101';
  perform pg_sleep(0.1);
  begin
    perform public.kh_register_push_device('88000000-0000-4000-8000-000000000001',v_payload);
    raise exception 'PUSH ASSERTION: elapsed session expiry must be checked with current clock';
  exception when others then if position('KH_PUSH_SESSION_REQUIRED' in sqlerrm)=0 then raise; end if; end;
  update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id='88000000-0000-4000-8000-000000000101';
end $$;
delete from auth.sessions where id='88000000-0000-4000-8000-000000000101';
set local role authenticated;
select pg_temp.push_error('select public.kh_register_push_device(''88000000-0000-4000-8000-000000000001'',payload) from push_context','KH_PUSH_SESSION_REQUIRED');
reset role;
select pg_temp.push_assert(exists(select 1 from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201' and revision=7),'device revision survives session deletion');
delete from auth.users where id='88000000-0000-4000-8000-000000000001';
select pg_temp.push_assert(exists(select 1 from kh_private.push_devices where installation_id='88000000-0000-4000-8000-000000000201' and owner_id is null),'tombstone survives account deletion');
select pg_temp.push_assert(not has_function_privilege('anon','public.kh_register_push_device(uuid,jsonb)','EXECUTE'),'anonymous cannot register');
select pg_temp.push_assert(not has_function_privilege('authenticated','kh_private.push_tick()','EXECUTE'),'worker private');
select pg_temp.push_assert(not has_table_privilege('authenticated','kh_private.push_outbox','SELECT'),'outbox private');
rollback;
