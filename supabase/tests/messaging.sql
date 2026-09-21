-- All fixtures stay inside a rollback/savepoint; no email or real-user messages.
begin;
create or replace function pg_temp.chat_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'CHAT ASSERTION FAILED: %',label; end if; end $$;
create or replace function pg_temp.chat_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected chat error (%): %',expected,sqlerrm;
  end;
  raise exception 'CHAT ASSERTION FAILED: expected %',expected;
end $$;
create or replace function pg_temp.chat_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('33000000-0000-4000-8000-000000000001','chat-seller@example.invalid','{"display_name":"Vendedor temporal"}'),
 ('33000000-0000-4000-8000-000000000002','chat-buyer@example.invalid','{"display_name":"Comprador temporal"}'),
 ('33000000-0000-4000-8000-000000000003','chat-outsider@example.invalid','{"display_name":"Tercero temporal"}'),
 ('33000000-0000-4000-8000-000000000004','chat-admin@example.invalid','{"display_name":"Revisor temporal"}');
insert into public.kh_admins(user_id) values('33000000-0000-4000-8000-000000000004');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values
 ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','chat-test-property','Casa de prueba de chat','Vedado','La Habana','Casa','Vivienda temporal usada en pruebas aisladas.',50000,80,2,1,array['synthetic/photo.jpg'],'approved');
create temporary table chat_context(conversation_id uuid, second_id uuid, report_id uuid);
insert into chat_context default values;
grant select,update on chat_context to authenticated,anon;
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$select public.kh_start_conversation('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001')$s$,'KH_ACCOUNT_CHANGED');
update chat_context set conversation_id=(public.kh_start_conversation('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000002')->>'id')::uuid;
select pg_temp.chat_assert((select public.kh_start_conversation('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000002')->>'id'=conversation_id::text from chat_context),'conversation start retry is unique');
select pg_temp.chat_assert(jsonb_array_length(public.kh_list_conversations('33000000-0000-4000-8000-000000000002'))=1,'buyer sees empty conversation');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select pg_temp.chat_assert(jsonb_array_length(public.kh_list_conversations('33000000-0000-4000-8000-000000000001'))=0,'seller inbox excludes empty conversation');
select pg_temp.chat_error($s$select public.kh_start_conversation('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001')$s$,'KH_CHAT_SELF_CONTACT');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body) select conversation_id,auth.uid(),gen_random_uuid(),1,'Direct write' from chat_context$s$,'permission denied');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),repeat('a',2001),auth.uid()) from chat_context$s$,'KH_CHAT_INVALID_MESSAGE');
select pg_temp.chat_assert((select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Hola, me interesa la vivienda.',auth.uid())->>'seq'='1' from chat_context),'first message gets seq one');
select pg_temp.chat_assert((select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Hola, me interesa la vivienda.',auth.uid())->>'seq'='1' from chat_context),'message retry preserves seq');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Changed body',auth.uid()) from chat_context$s$,'KH_CHAT_MESSAGE_CONFLICT');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'unreadCount'='1' from chat_context),'recipient has one unread');
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'otherName'='Comprador temporal' from chat_context),'seller gets participant name safely');
select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000022','Hola, podemos conversar.',auth.uid()) from chat_context;
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'unreadCount'='1' from chat_context),'own send does not increase or clear unread');
select public.kh_mark_conversation_read(conversation_id,1,auth.uid()) from chat_context;
select public.kh_mark_conversation_read(conversation_id,0,auth.uid()) from chat_context;
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'unreadCount'='0' from chat_context),'read cursor is monotonic');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000003');
select pg_temp.chat_assert(not exists(select 1 from public.kh_conversations where id=(select conversation_id from chat_context)),'outsider RLS hides conversation');
select pg_temp.chat_assert(not exists(select 1 from public.kh_messages where conversation_id=(select conversation_id from chat_context)),'outsider RLS hides messages');
select pg_temp.chat_error($s$select public.kh_get_conversation(conversation_id,auth.uid()) from chat_context$s$,'KH_CHAT_NOT_FOUND');
select pg_temp.chat_error($s$select public.kh_list_messages(conversation_id,auth.uid()) from chat_context$s$,'KH_CHAT_NOT_FOUND');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Intrusion',auth.uid()) from chat_context$s$,'KH_CHAT_NOT_FOUND');
select pg_temp.chat_error($s$select public.kh_set_user_block('33000000-0000-4000-8000-000000000001',true,auth.uid())$s$,'KH_CHAT_NOT_FOUND');
select pg_temp.chat_assert(jsonb_array_length(public.kh_find_sent_messages(array['33000000-0000-4000-8000-000000000021']::uuid[],auth.uid()))=0,'ACK reconciliation cannot expose another sender');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000004');
select pg_temp.chat_assert(not exists(select 1 from public.kh_messages where conversation_id=(select conversation_id from chat_context)),'admin has no blanket message read');
select pg_temp.chat_error($s$select public.kh_get_conversation(conversation_id,auth.uid()) from chat_context$s$,'KH_CHAT_NOT_FOUND');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select public.kh_set_user_block('33000000-0000-4000-8000-000000000001',true,auth.uid());
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'blockedByMe'='true' from chat_context),'own block visible');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Blocked',auth.uid()) from chat_context$s$,'KH_CHAT_BLOCKED');
select pg_temp.chat_assert((select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Hola, me interesa la vivienda.',auth.uid())->>'seq'='1' from chat_context),'accepted retry still returns ACK after block');
select pg_temp.chat_assert(jsonb_array_length(public.kh_find_sent_messages(array['33000000-0000-4000-8000-000000000021']::uuid[],auth.uid()))=1,'ACK reconciliation works while blocked');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select public.kh_set_user_block('33000000-0000-4000-8000-000000000002',false,auth.uid());
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Cannot remove other block',auth.uid()) from chat_context$s$,'KH_CHAT_BLOCKED');
select pg_temp.chat_assert((select jsonb_array_length(public.kh_list_messages(conversation_id,auth.uid()))=2 from chat_context),'history remains readable after block');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select public.kh_set_user_block('33000000-0000-4000-8000-000000000001',false,auth.uid());
select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000023','Se puede volver a enviar.',auth.uid()) from chat_context;
reset role;
update public.properties set availability='paused' where id='33000000-0000-4000-8000-000000000011';
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Unavailable',auth.uid()) from chat_context$s$,'KH_CHAT_PROPERTY_UNAVAILABLE');
select pg_temp.chat_assert((select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Hola, me interesa la vivienda.',auth.uid())->>'seq'='1' from chat_context),'accepted retry survives property pause');
select pg_temp.chat_assert((select jsonb_array_length(public.kh_list_messages(conversation_id,auth.uid()))=3 from chat_context),'paused property history stays available');
select pg_temp.chat_error($s$select public.kh_start_conversation('33000000-0000-4000-8000-000000000011',auth.uid())$s$,'KH_CHAT_PROPERTY_UNAVAILABLE');
reset role;
update public.properties set availability='active',title='Título privado posterior',moderation='pending' where id='33000000-0000-4000-8000-000000000011';
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'propertyTitle'='Casa de prueba de chat' from chat_context),'chat keeps public title snapshot, not later private edit');
reset role;
update public.properties set moderation='approved' where id='33000000-0000-4000-8000-000000000011';
-- Seed older messages as database owner to exercise paging and snapshot bounds, without rate-limit sleeps.
insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at)
select conversation_id,'33000000-0000-4000-8000-000000000002',gen_random_uuid(),n,'Mensaje histórico '||n,now()-interval '2 hours'+n*interval '1 second' from chat_context cross join generate_series(4,65) n;
update public.kh_conversations set last_seq=65 where id=(select conversation_id from chat_context);
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_assert((select jsonb_array_length(public.kh_list_messages(conversation_id,auth.uid()))=50 and public.kh_list_messages(conversation_id,auth.uid())->0->>'seq'='16' from chat_context),'recent page returns fifty ascending messages');
select pg_temp.chat_assert((select jsonb_array_length(public.kh_list_messages(conversation_id,auth.uid(),16,50))=15 from chat_context),'exclusive older cursor has no overlap');
select pg_temp.chat_assert(public.kh_find_sent_messages(array['33000000-0000-4000-8000-000000000021']::uuid[],auth.uid())->0->>'seq'='1','find ACK outside latest fifty');
update chat_context set report_id=public.kh_report_conversation(conversation_id,'33000000-0000-4000-8000-000000000031','spam','Comentario de prueba',auth.uid());
select pg_temp.chat_assert((select public.kh_report_conversation(conversation_id,'33000000-0000-4000-8000-000000000031','spam','Comentario de prueba',auth.uid())=report_id from chat_context),'report retry is idempotent');
select pg_temp.chat_error($s$select public.kh_report_conversation(conversation_id,'33000000-0000-4000-8000-000000000031','fraud','Comentario de prueba',auth.uid()) from chat_context$s$,'KH_CHAT_REPORT_CONFLICT');
select pg_temp.chat_error($s$select public.kh_list_message_reports(auth.uid())$s$,'KH_ADMIN_REQUIRED');
select pg_temp.chat_assert(not exists(select 1 from public.kh_message_reports where id=(select report_id from chat_context)),'report evidence is not directly readable by client');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000004');
select pg_temp.chat_assert((select jsonb_array_length(context)=20 and context->0->>'seq'='46' and context->19->>'seq'='65' from public.kh_message_reports where id=(select report_id from chat_context)),'report snapshots last twenty server messages ascending');
select public.kh_review_message_report(report_id,'Revisado en prueba aislada',auth.uid()) from chat_context;
select public.kh_review_message_report(report_id,'Revisado en prueba aislada',auth.uid()) from chat_context;
select pg_temp.chat_assert((select status='reviewed' and jsonb_array_length(context)=20 from public.kh_message_reports where id=(select report_id from chat_context)),'review is idempotent and keeps evidence');
reset role;
insert into public.kh_admins(user_id) values('33000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$select public.kh_review_message_report(report_id,'Own case',auth.uid()) from chat_context$s$,'KH_CHAT_CANNOT_REVIEW_OWN_REPORT');
reset role;
-- Sliding-window limits are checked under actor locks. Retried existing IDs are exempt.
update public.kh_messages set created_at=now()-interval '2 hours' where conversation_id=(select conversation_id from chat_context);
insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at)
select conversation_id,'33000000-0000-4000-8000-000000000002',gen_random_uuid(),n,'Límite minuto',now() from chat_context cross join generate_series(66,85) n;
update public.kh_conversations set last_seq=85 where id=(select conversation_id from chat_context);
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Too many',auth.uid()) from chat_context$s$,'KH_CHAT_RATE_LIMIT');
select pg_temp.chat_assert((select public.kh_send_message(conversation_id,'33000000-0000-4000-8000-000000000021','Hola, me interesa la vivienda.',auth.uid())->>'seq'='1' from chat_context),'retry does not consume message quota');
reset role;
update public.kh_messages set created_at=now()-interval '2 hours' where conversation_id=(select conversation_id from chat_context);
insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at)
select conversation_id,'33000000-0000-4000-8000-000000000002',gen_random_uuid(),n,'Límite hora',now()-interval '5 minutes' from chat_context cross join generate_series(86,385) n;
update public.kh_conversations set last_seq=385 where id=(select conversation_id from chat_context);
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select pg_temp.chat_error($s$select public.kh_send_message(conversation_id,gen_random_uuid(),'Hourly limit',auth.uid()) from chat_context$s$,'KH_CHAT_RATE_LIMIT');
reset role;
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation)
select ('33000000-0000-4000-9000-'||lpad(n::text,12,'0'))::uuid,'33000000-0000-4000-8000-000000000001','chat-limit-'||n,'Casa de límite '||n,'Vedado','La Habana','Casa','Vivienda temporal para límites diarios.',50000,80,2,1,array['synthetic/photo.jpg'],'approved' from generate_series(1,20)n;
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
do $$ begin for n in 1..19 loop perform public.kh_start_conversation(('33000000-0000-4000-9000-'||lpad(n::text,12,'0'))::uuid,auth.uid()); end loop; end $$;
select pg_temp.chat_error($s$select public.kh_start_conversation('33000000-0000-4000-9000-000000000020',auth.uid())$s$,'KH_CHAT_CONVERSATION_LIMIT');
select pg_temp.chat_assert((select public.kh_start_conversation('33000000-0000-4000-8000-000000000011',auth.uid())->>'id'=conversation_id::text from chat_context),'conversation retry does not consume daily quota');
update chat_context set second_id=(public.kh_start_conversation('33000000-0000-4000-9000-000000000001',auth.uid())->>'id')::uuid;
select public.kh_set_user_block('33000000-0000-4000-8000-000000000001',true,auth.uid());
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select pg_temp.chat_error($s$select public.kh_send_message(second_id,gen_random_uuid(),'Another property',auth.uid()) from chat_context$s$,'KH_CHAT_BLOCKED');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select public.kh_set_user_block('33000000-0000-4000-8000-000000000001',false,auth.uid());
do $$ declare v_id uuid; begin select conversation_id into v_id from chat_context; for n in 1..9 loop perform public.kh_report_conversation(v_id,gen_random_uuid(),'other','Quota test',auth.uid()); end loop; end $$;
select pg_temp.chat_error($s$select public.kh_report_conversation(conversation_id,gen_random_uuid(),'other','Above quota',auth.uid()) from chat_context$s$,'KH_CHAT_REPORT_LIMIT');
select pg_temp.chat_assert((select public.kh_report_conversation(conversation_id,'33000000-0000-4000-8000-000000000031','spam','Comentario de prueba',auth.uid())=report_id from chat_context),'report retry does not consume daily quota');
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select public.kh_mark_conversation_read(conversation_id,999999,auth.uid()) from chat_context;
select pg_temp.chat_assert((select last_read_seq=385 and unread_count=0 from public.kh_conversation_reads where conversation_id=(select conversation_id from chat_context) and user_id=auth.uid()),'future read cursor clamps to real sequence');
reset role;
update public.kh_messages set created_at=now()-interval '2 hours' where conversation_id=(select conversation_id from chat_context);
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000002');
select public.kh_send_message(conversation_id,gen_random_uuid(),'Mensaje posterior a lectura',auth.uid()) from chat_context;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000001');
select pg_temp.chat_assert((select public.kh_get_conversation(conversation_id,auth.uid())->>'unreadCount'='1' from chat_context),'later message remains unread after clamped read');
reset role;
delete from public.kh_conversations where id=(select conversation_id from chat_context);
set local role authenticated;
select pg_temp.chat_as('33000000-0000-4000-8000-000000000004');
select pg_temp.chat_assert((select status='reviewed' and jsonb_array_length(context)=20 and context->19->>'seq'='65' from public.kh_message_reports where id=(select report_id from chat_context)),'report snapshot survives conversation deletion');
reset role;
set local role anon;
select pg_temp.chat_as(null);
select pg_temp.chat_error($s$select * from public.kh_messages$s$,'permission denied');
select pg_temp.chat_error($s$select public.kh_list_conversations('33000000-0000-4000-8000-000000000002')$s$,'permission denied');
rollback;
