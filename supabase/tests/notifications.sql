-- Isolated recipients only. This suite is always rolled back by the runner.
begin;
create function pg_temp.notice_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'NOTIFICATION ASSERTION: %',label; end if; end $$;
create function pg_temp.notice_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, got %',expected,sqlerrm;
  end;
  raise exception 'NOTIFICATION ASSERTION: expected %',expected;
end $$;
create function pg_temp.notice_actor(actor uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',actor::text,true);
  select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
$$;
insert into auth.users(id,email,raw_user_meta_data) values
('77000000-0000-4000-8000-000000000001','kh-notice-buyer@example.invalid','{"display_name":"Comprador de prueba"}'),
('77000000-0000-4000-8000-000000000002','kh-notice-seller@example.invalid','{"display_name":"Vendedor de prueba"}'),
('77000000-0000-4000-8000-000000000003','kh-notice-outsider@example.invalid','{}');
insert into public.kh_admins(user_id) values('77000000-0000-4000-8000-000000000003');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation)
values('77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000002','notice-sql','Casa de avisos','Vedado','La Habana','Casa','Vivienda ficticia de pruebas de notificaciones.',50000,100,2,1,ARRAY['synthetic/notice.jpg'],'approved');
create temporary table notice_context(conversation_id uuid, message jsonb, offer jsonb, alternate jsonb, visit jsonb, payload jsonb, page jsonb, cutoff text, total integer);
insert into notice_context default values;
grant all on notice_context to authenticated;
set local role authenticated;
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
update notice_context set conversation_id=(public.kh_start_conversation('77000000-0000-4000-8000-000000000004','77000000-0000-4000-8000-000000000001')->>'id')::uuid;
select pg_temp.notice_assert(public.kh_notification_summary('77000000-0000-4000-8000-000000000001')='{"unreadCount":0,"readThrough":"0"}', 'initial empty summary');
update notice_context set message=public.kh_send_message(conversation_id,'77000000-0000-4000-8000-000000000010','Oferta propuesta: 1234 USD. NOTA_PRIVADA','77000000-0000-4000-8000-000000000001');
select pg_temp.notice_assert((select public.kh_send_message(conversation_id,'77000000-0000-4000-8000-000000000010','Oferta propuesta: 1234 USD. NOTA_PRIVADA','77000000-0000-4000-8000-000000000001')=message from notice_context),'lost chat ACK unchanged');
select pg_temp.notice_assert((public.kh_notification_summary('77000000-0000-4000-8000-000000000001')->>'unreadCount')::int=0,'sender receives no self notice');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
update notice_context set page=public.kh_list_notifications('77000000-0000-4000-8000-000000000002');
select pg_temp.notice_assert((select page->>'unreadCount'='1' and page->'items'->0->>'category'='message' and page->'items'->0->'negotiationId'='null' from notice_context),'imitation text stays ordinary message and retry one notice');
select pg_temp.notice_assert((select page::text not like '%NOTA_PRIVADA%' and page::text not like '%1234%' from notice_context),'notification excludes message contents');
select pg_temp.notice_assert(public.kh_get_notification_preferences('77000000-0000-4000-8000-000000000002')='{"messages":true,"visits":true,"offers":true,"version":0}','default preferences');
select pg_temp.notice_assert(public.kh_save_notification_preferences('77000000-0000-4000-8000-000000000002','{"messages":false,"visits":true,"offers":true,"expectedVersion":0}')->>'version'='1','save preferences');
select pg_temp.notice_assert(public.kh_save_notification_preferences('77000000-0000-4000-8000-000000000002','{"messages":false,"visits":true,"offers":true,"expectedVersion":0}')->>'version'='1','same desired stale retry accepted');
select pg_temp.notice_error('select public.kh_save_notification_preferences(''77000000-0000-4000-8000-000000000002'',''{"messages":true,"visits":true,"offers":true,"expectedVersion":0}'')','KH_NOTIFICATION_PREFERENCES_CONFLICT');
select pg_temp.notice_error('select public.kh_save_notification_preferences(''77000000-0000-4000-8000-000000000002'',''{"messages":false,"visits":true,"offers":true,"expectedVersion":1,"owner":"other"}'')','KH_NOTIFICATION_INVALID');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select public.kh_send_message(conversation_id,'77000000-0000-4000-8000-000000000011','Segundo mensaje privado','77000000-0000-4000-8000-000000000001') from notice_context;
update notice_context set payload=jsonb_build_object('conversationId',conversation_id,'kind','offer','clientRequestId','77000000-0000-4000-8000-000000000012','amountUsd','44000','note','NOTA_OFERTA_PRIVADA');
update notice_context set offer=public.kh_create_negotiation('77000000-0000-4000-8000-000000000001',payload);
select pg_temp.notice_assert((select public.kh_create_negotiation('77000000-0000-4000-8000-000000000001',payload)=offer from notice_context),'offer replay exact');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
update notice_context set page=public.kh_list_notifications('77000000-0000-4000-8000-000000000002',null,false,'offer',30);
select pg_temp.notice_assert((select page->>'unreadCount'='2' and jsonb_array_length(page->'items')=1 and page->'items'->0->>'negotiationId'=offer->>'id' and page::text not like '%44000%' and page::text not like '%NOTA_OFERTA_PRIVADA%' from notice_context),'preferences suppress only future messages; filtered count global and generic structured offer');
update notice_context set payload=payload||jsonb_build_object('clientRequestId','77000000-0000-4000-8000-000000000013','replacesId',offer->>'id','expectedVersion',1,'amountUsd','46000');
update notice_context set alternate=public.kh_create_negotiation('77000000-0000-4000-8000-000000000002',payload);
select pg_temp.notice_assert((select public.kh_create_negotiation('77000000-0000-4000-8000-000000000002',payload)=alternate from notice_context),'counter retry exact');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select pg_temp.notice_assert((public.kh_notification_summary('77000000-0000-4000-8000-000000000001')->>'unreadCount')::int=1,'counter creates exactly one notice');
update notice_context set alternate=public.kh_respond_negotiation('77000000-0000-4000-8000-000000000001',jsonb_build_object('id',alternate->>'id','action','accept','expectedVersion',1,'clientRequestId','77000000-0000-4000-8000-000000000014'));
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
update notice_context set cutoff=public.kh_notification_summary('77000000-0000-4000-8000-000000000002')->>'readThrough';
select public.kh_save_notification_preferences('77000000-0000-4000-8000-000000000002','{"messages":true,"visits":true,"offers":true,"expectedVersion":1}');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select public.kh_send_message(conversation_id,'77000000-0000-4000-8000-000000000015','Llegó después del corte','77000000-0000-4000-8000-000000000001') from notice_context;
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
select pg_temp.notice_assert((select public.kh_read_notifications_through('77000000-0000-4000-8000-000000000002',cutoff)->>'unreadCount'='1' from notice_context),'mark all does not swallow newer notice');
select pg_temp.notice_assert((select public.kh_read_notifications_through('77000000-0000-4000-8000-000000000002',cutoff)->>'unreadCount'='1' from notice_context),'read all idempotent');
update notice_context set page=public.kh_list_notifications('77000000-0000-4000-8000-000000000002',null,true,null,30);
select pg_temp.notice_assert((select jsonb_array_length(page->'items')=1 from notice_context),'unread filter server side');
select pg_temp.notice_assert((select public.kh_read_notification('77000000-0000-4000-8000-000000000002',(page->'items'->0->>'id')::uuid)->>'unreadCount'='0' from notice_context),'single read');
select pg_temp.notice_assert((select public.kh_read_notification('77000000-0000-4000-8000-000000000002',(page->'items'->0->>'id')::uuid)->>'unreadCount'='0' from notice_context),'single read idempotent');
select pg_temp.notice_assert((select unread_count=5 from public.kh_conversation_reads where conversation_id=(select conversation_id from notice_context) and user_id='77000000-0000-4000-8000-000000000002'),'notification reads do not mark chat');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000003');
select pg_temp.notice_assert(public.kh_notification_summary('77000000-0000-4000-8000-000000000003')='{"unreadCount":0,"readThrough":"0"}','admin has no global notifications');
select pg_temp.notice_error('select * from kh_private.notifications','permission denied');
select pg_temp.notice_error('select * from kh_private.notification_preferences','permission denied');
select pg_temp.notice_error('select public.kh_notification_summary(''77000000-0000-4000-8000-000000000002'')','KH_ACCOUNT_CHANGED');
select pg_temp.notice_error('select public.kh_read_notification(''77000000-0000-4000-8000-000000000003'',(page->''items''->0->>''id'')::uuid) from notice_context','KH_NOTIFICATION_NOT_FOUND');
select pg_temp.notice_error('select kh_private.chat_store_message(conversation_id,gen_random_uuid(),''Forged'',''77000000-0000-4000-8000-000000000003'',null) from notice_context','permission denied');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
select public.kh_set_user_block('77000000-0000-4000-8000-000000000001',true,'77000000-0000-4000-8000-000000000002');
select pg_temp.notice_assert(public.kh_notification_summary('77000000-0000-4000-8000-000000000002')='{"unreadCount":0,"readThrough":"0"}','blocked summary hidden');
select pg_temp.notice_assert(public.kh_list_notifications('77000000-0000-4000-8000-000000000002')->'items'='[]','blocked page hidden');
select pg_temp.notice_error('select public.kh_read_notification(''77000000-0000-4000-8000-000000000002'',(page->''items''->0->>''id'')::uuid) from notice_context','KH_NOTIFICATION_NOT_FOUND');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select pg_temp.notice_assert(public.kh_read_notifications_through('77000000-0000-4000-8000-000000000001','9223372036854775807')->>'unreadCount'='0','read-all excludes hidden blocked notices');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
reset role;
update notice_context set total=(select count(*) from kh_private.notifications);
set local role authenticated;
update notice_context set alternate=public.kh_respond_negotiation('77000000-0000-4000-8000-000000000002',jsonb_build_object('id',alternate->>'id','action','cancel','expectedVersion',2,'clientRequestId','77000000-0000-4000-8000-000000000016'));
select public.kh_set_user_block('77000000-0000-4000-8000-000000000001',false,'77000000-0000-4000-8000-000000000002');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select pg_temp.notice_assert(public.kh_notification_summary('77000000-0000-4000-8000-000000000001')->>'unreadCount'='1','unblock restores unread history untouched by read-all');
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.notice_assert((select total=(select count(*) from kh_private.notifications) from notice_context),'silent blocked cancellation creates no notice');
set local role authenticated;
update notice_context set visit=public.kh_create_negotiation('77000000-0000-4000-8000-000000000002',jsonb_build_object('conversationId',conversation_id,'kind','visit','clientRequestId','77000000-0000-4000-8000-000000000017','note','NOTA_VISITA','visitDate',to_char((clock_timestamp() at time zone 'America/Havana')+interval '2 days','YYYY-MM-DD'),'visitTime','10:00'));
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select pg_temp.notice_assert(public.kh_list_notifications('77000000-0000-4000-8000-000000000001',null,false,'visit',30)->'items'->0->>'category'='visit','visit category');
reset role;
update notice_context set total=(select count(*) from kh_private.notifications);
update public.properties set availability='paused' where id='77000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
update notice_context set visit=public.kh_respond_negotiation('77000000-0000-4000-8000-000000000002',jsonb_build_object('id',visit->>'id','action','cancel','expectedVersion',1,'clientRequestId','77000000-0000-4000-8000-000000000018'));
reset role;
select pg_temp.notice_assert((select total=(select count(*) from kh_private.notifications) from notice_context),'silent unavailable cancellation creates no notice');
-- Failure inside notification creation rolls back the proposal, event, chat and receipt.
update public.properties set availability='active' where id='77000000-0000-4000-8000-000000000004';
create function pg_temp.notice_fail() returns trigger language plpgsql as $$ begin raise exception 'NOTICE_FORCED_FAILURE'; end $$;
create trigger notice_forced_failure before insert on kh_private.notifications for each row execute function pg_temp.notice_fail();
update notice_context set total=(select count(*) from kh_private.notifications);
set local role authenticated;
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000001');
select pg_temp.notice_error('select public.kh_create_negotiation(''77000000-0000-4000-8000-000000000001'',jsonb_build_object(''conversationId'',conversation_id,''kind'',''offer'',''clientRequestId'',''77000000-0000-4000-8000-000000000019'',''amountUsd'',''30000'',''note'','''')) from notice_context','NOTICE_FORCED_FAILURE');
reset role;
select pg_temp.notice_assert((select total=(select count(*) from kh_private.notifications) from notice_context),'failed notification leaves no partial notice');
select pg_temp.notice_assert(not exists(select 1 from kh_private.negotiation_requests where client_request_id='77000000-0000-4000-8000-000000000019'),'failed notification leaves no receipt');
select pg_temp.notice_assert(not exists(select 1 from public.kh_negotiations where conversation_id=(select conversation_id from notice_context) and status='pending'),'failed notification leaves no proposal');
drop trigger notice_forced_failure on kh_private.notifications;
-- Direct fixture inserts exercise trigger pagination without bypassing public RPC rate limits.
insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body)
select conversation_id,'77000000-0000-4000-8000-000000000001',gen_random_uuid(),100+g,'Mensaje sintético' from notice_context cross join generate_series(1,35) g;
set local role authenticated;
select pg_temp.notice_actor('77000000-0000-4000-8000-000000000002');
update notice_context set page=public.kh_list_notifications('77000000-0000-4000-8000-000000000002');
select pg_temp.notice_assert((select jsonb_array_length(page->'items')=30 and page->>'nextCursor'=page->'items'->29->>'seq' from notice_context),'seek page boundary and cursor');
select pg_temp.notice_assert((select jsonb_array_length(public.kh_list_notifications('77000000-0000-4000-8000-000000000002',page->>'nextCursor')->'items')=9 from notice_context),'remaining seek page');
select pg_temp.notice_error('select public.kh_list_notifications(''77000000-0000-4000-8000-000000000002'',''01'')','KH_NOTIFICATION_INVALID');
select pg_temp.notice_error('select public.kh_read_notifications_through(''77000000-0000-4000-8000-000000000002'',''9223372036854775808'')','KH_NOTIFICATION_INVALID');
reset role;
select pg_temp.notice_assert(not has_function_privilege('anon','public.kh_notification_summary(uuid)','EXECUTE'),'anonymous RPC denied');
select pg_temp.notice_assert(not has_function_privilege('authenticated','kh_private.notification_from_message()','EXECUTE'),'trigger helper private');
rollback;
