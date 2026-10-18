-- Chat messages reach the phone without entering the bell. Everything rolls back; no push leaves.
-- A admin (…01), G1 manager and responsable (…02), G2 manager on an old phone (…03), K coordinator (…04),
-- B client (…05), B2 second client (…06), O owner of the home (…07). Agency a1 has the home b1 under mandate.
begin;
create function pg_temp.n_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'CHAT NOTICE ASSERTION: %',label; end if; end $$;
create function pg_temp.n_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'CHAT NOTICE ASSERTION: missing error %',expected;
end $$;
create function pg_temp.n_u(n integer) returns uuid language sql immutable as $$select ('63000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.n_session(n integer) returns uuid language sql immutable as $$select ('63000000-0000-4000-8000-0000001'||lpad(n::text,5,'0'))::uuid$$;
create function pg_temp.n_id(n integer) returns uuid language sql immutable as $$select ('63000000-0000-4000-8000-0000002'||lpad(n::text,5,'0'))::uuid$$;
create function pg_temp.n_as(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.n_u(n)::text,true);
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.n_u(n),'session_id',pg_temp.n_session(n),'role','authenticated')::text,true);
$$;
create function pg_temp.n_device(n integer,chat boolean) returns jsonb language sql as $$
 select jsonb_build_object('installationId',pg_temp.n_id(100+n),'installationSecret',repeat('b',64),'revision',1,
  'fcmToken','kh-synthetic-fcm-chat-'||n||':AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','platform','android','projectId','e054aea9-38b4-4211-826b-521b3cc0be9f',
  'supportsAgencyNotifications',true)||case when chat then jsonb_build_object('supportsAgencyChat',true) else '{}'::jsonb end
$$;
create function pg_temp.n_exchange_done(n integer) returns void language sql security definer as $$
 update kh_private.push_devices set expo_push_token='ExponentPushToken[chat-'||n||']',exchange_request_id=null,exchange_attempts=0,exchange_next_at=null,exchange_deadline_at=null where installation_id=pg_temp.n_id(100+n);
$$;
create function pg_temp.n_c(key text) returns uuid language sql stable as $$select current_setting('nc.'||key)::uuid$$;
create function pg_temp.n_notices(n integer,chat text) returns bigint language sql stable security definer as $$
 select count(*) from kh_private.notifications where recipient_id=pg_temp.n_u(n) and category='agency_message' and agency_chat=chat
$$;
create function pg_temp.n_unread(n integer,chat text) returns bigint language sql stable security definer as $$
 select count(*) from kh_private.notifications where recipient_id=pg_temp.n_u(n) and category='agency_message' and agency_chat=chat and read_at is null
$$;
create function pg_temp.n_notice(n integer,chat text) returns uuid language sql stable security definer as $$
 select id from kh_private.notifications where recipient_id=pg_temp.n_u(n) and category='agency_message' and agency_chat like chat order by seq limit 1
$$;
create function pg_temp.n_jobs(n integer) returns bigint language sql stable security definer as $$
 select count(*) from kh_private.push_outbox o join kh_private.notifications x on x.id=o.notification_id where o.recipient_id=pg_temp.n_u(n) and x.category='agency_message'
$$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select pg_temp.n_u(n),'chatnotice-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Aviso '||n) from generate_series(1,7) n;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
 select pg_temp.n_session(n),pg_temp.n_u(n),now(),now(),now()+interval '1 day' from generate_series(1,7) n;
insert into kh_private.agencies(id,trade_name,state) values('63000000-0000-4000-8000-0000000000a1','Casas Aviso Ficticias','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('63000000-0000-4000-8000-0000000000a1',pg_temp.n_u(1),'admin'),
 ('63000000-0000-4000-8000-0000000000a1',pg_temp.n_u(2),'manager'),
 ('63000000-0000-4000-8000-0000000000a1',pg_temp.n_u(3),'manager'),
 ('63000000-0000-4000-8000-0000000000a1',pg_temp.n_u(4),'coordinator');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability,operation,rent_period) values
 ('63000000-0000-4000-8000-0000000000b1',pg_temp.n_u(7),'chatnotice-b1','Casa de los avisos','Vedado','Zona Aviso','Casa','Vivienda ficticia para los avisos del chat.',50000,100,2,1,'{}',array['63000000-0000-4000-8000-000000000007/chatnotice-b1/photo.jpg'],'approved','active','sale',null);
insert into kh_private.agency_mandates(property_id,agency_id,reference) values('63000000-0000-4000-8000-0000000000b1','63000000-0000-4000-8000-0000000000a1','Aviso');

set local role authenticated;
-- Phones: A and G1 run the new app, G2 an old one without agency chats, the client the new app.
select pg_temp.n_as(1);select public.kh_register_push_device(pg_temp.n_u(1),pg_temp.n_device(1,true));
select pg_temp.n_as(2);select public.kh_register_push_device(pg_temp.n_u(2),pg_temp.n_device(2,true));
select pg_temp.n_as(3);select public.kh_register_push_device(pg_temp.n_u(3),pg_temp.n_device(3,false));
select pg_temp.n_as(5);select public.kh_register_push_device(pg_temp.n_u(5),pg_temp.n_device(5,true));
select pg_temp.n_error($q$select public.kh_register_push_device(pg_temp.n_u(5),pg_temp.n_device(5,true)||'{"supportsAgencyChat":"yes"}')$q$,'KH_PUSH_INVALID');
reset role;
select pg_temp.n_exchange_done(n) from (values(1),(2),(3),(5)) x(n);
select pg_temp.n_assert((select supports_agency_chat from kh_private.push_devices where installation_id=pg_temp.n_id(101)) and not (select supports_agency_chat from kh_private.push_devices where installation_id=pg_temp.n_id(103)),'chat support stored per phone');
set local role authenticated;

-- The client writes through G1's link: only G1 hears it, and not in the bell.
select pg_temp.n_as(5);
select set_config('nc.one',public.kh_start_agency_conversation(pg_temp.n_u(5),'63000000-0000-4000-8000-0000000000a1',
 jsonb_build_object('propertyId','63000000-0000-4000-8000-0000000000b1','preferredManagerId',pg_temp.n_u(2),'clientRequestId',pg_temp.n_id(1)))->>'id',true);
select public.kh_send_agency_message(pg_temp.n_u(5),null,jsonb_build_object('conversationId',pg_temp.n_c('one'),'clientMessageId',pg_temp.n_id(2),'clientRequestId',pg_temp.n_id(2),'body','Hola, ¿sigue disponible?'));
select pg_temp.n_assert(pg_temp.n_notices(2,'c:'||pg_temp.n_c('one'))=1 and pg_temp.n_notices(1,'c:'||pg_temp.n_c('one'))=0 and pg_temp.n_notices(3,'c:'||pg_temp.n_c('one'))=0,'only the responsable hears the client');
select pg_temp.n_assert(pg_temp.n_jobs(2)=1,'the responsable''s phone gets a push');
select pg_temp.n_as(2);
select pg_temp.n_assert((public.kh_notification_summary(pg_temp.n_u(2),true,true)->>'unreadCount')::int=0,'chat notices stay out of the bell');
select pg_temp.n_assert((select public.kh_resolve_push_notification(pg_temp.n_u(2),pg_temp.n_notice(2,'c:%'))->'agencyTarget')
 =jsonb_build_object('route','agency_conversation','agencyId','63000000-0000-4000-8000-0000000000a1','dealId',pg_temp.n_c('one')),'a tap opens the staff conversation');

-- The admin answers: the client hears the agency; the admin hears nothing of its own.
select pg_temp.n_as(1);
select public.kh_send_agency_message(pg_temp.n_u(1),'63000000-0000-4000-8000-0000000000a1',jsonb_build_object('conversationId',pg_temp.n_c('one'),'clientMessageId',pg_temp.n_id(3),'clientRequestId',pg_temp.n_id(3),'body','Sí, sigue disponible.'));
reset role;
select pg_temp.n_assert((select agency_target=jsonb_build_object('route','buyer_conversation','agencyId',null,'dealId',pg_temp.n_c('one')) and actor_name='Casas Aviso Ficticias'
 from kh_private.notifications where recipient_id=pg_temp.n_u(5) and category='agency_message'),'the client hears the agency');
select pg_temp.n_assert(pg_temp.n_notices(1,'c:'||pg_temp.n_c('one'))=0,'no notice of one''s own answer');
select pg_temp.n_assert((select kh_private.push_payload(o)->>'tag'='kh-chat-c:'||pg_temp.n_c('one') from kh_private.push_outbox o join kh_private.notifications x on x.id=o.notification_id where x.recipient_id=pg_temp.n_u(5)),'one tag per chat');
set local role authenticated;
-- Reading the conversation marks its notices read.
select pg_temp.n_as(5);
select public.kh_read_agency_conversation(pg_temp.n_u(5),null,jsonb_build_object('conversationId',pg_temp.n_c('one'),'lastSeq',2,'clientRequestId',pg_temp.n_id(4)));
select pg_temp.n_assert(pg_temp.n_unread(5,'c:'||pg_temp.n_c('one'))=0,'reading clears the client''s notice');

-- A message in the queue reaches the admins and coordinators, not the managers.
select pg_temp.n_as(6);
select set_config('nc.two',public.kh_start_agency_conversation(pg_temp.n_u(6),'63000000-0000-4000-8000-0000000000a1',
 jsonb_build_object('propertyId','63000000-0000-4000-8000-0000000000b1','clientRequestId',pg_temp.n_id(5)))->>'id',true);
select public.kh_send_agency_message(pg_temp.n_u(6),null,jsonb_build_object('conversationId',pg_temp.n_c('two'),'clientMessageId',pg_temp.n_id(6),'clientRequestId',pg_temp.n_id(6),'body','¿Puedo verla?'));
select pg_temp.n_assert(pg_temp.n_notices(1,'c:'||pg_temp.n_c('two'))=1 and pg_temp.n_notices(4,'c:'||pg_temp.n_c('two'))=1
 and pg_temp.n_notices(2,'c:'||pg_temp.n_c('two'))=0 and pg_temp.n_notices(3,'c:'||pg_temp.n_c('two'))=0,'the queue reaches supervisors');
-- With «Mensajes» off, the coordinator gets nothing more.
reset role;
insert into kh_private.notification_preferences(user_id,messages) values(pg_temp.n_u(4),false);
set local role authenticated;
select pg_temp.n_as(6);
select public.kh_send_agency_message(pg_temp.n_u(6),null,jsonb_build_object('conversationId',pg_temp.n_c('two'),'clientMessageId',pg_temp.n_id(7),'clientRequestId',pg_temp.n_id(7),'body','Mañana por la tarde.'));
select pg_temp.n_assert(pg_temp.n_notices(4,'c:'||pg_temp.n_c('two'))=1 and pg_temp.n_notices(1,'c:'||pg_temp.n_c('two'))=2,'the preference is respected');

-- The team chat reaches everyone else; an old phone gets no push; reading clears it.
select pg_temp.n_as(2);
select public.kh_send_agency_team_message(pg_temp.n_u(2),'63000000-0000-4000-8000-0000000000a1',jsonb_build_object('clientMessageId',pg_temp.n_id(8),'body','¿Quién enseña la casa el jueves?'));
select pg_temp.n_assert(pg_temp.n_notices(1,'t:63000000-0000-4000-8000-0000000000a1')=1 and pg_temp.n_notices(3,'t:63000000-0000-4000-8000-0000000000a1')=1
 and pg_temp.n_notices(2,'t:63000000-0000-4000-8000-0000000000a1')=0,'team chat reaches the others');
select pg_temp.n_assert(pg_temp.n_jobs(3)=0,'an old phone gets no chat push');
select pg_temp.n_as(1);
select pg_temp.n_assert((select public.kh_resolve_push_notification(pg_temp.n_u(1),pg_temp.n_notice(1,'t:%'))#>>'{agencyTarget,route}')='team_chat','a tap opens the team chat');
select public.kh_read_agency_team_chat(pg_temp.n_u(1),'63000000-0000-4000-8000-0000000000a1','{"lastSeq":1}');
select pg_temp.n_assert(pg_temp.n_unread(1,'t:63000000-0000-4000-8000-0000000000a1')=0,'reading clears the team notice');

-- Leaving the team hides its notices.
reset role;
update kh_private.agency_memberships set state='removed',version=version+1 where agency_id='63000000-0000-4000-8000-0000000000a1' and user_id=pg_temp.n_u(3);
select pg_temp.n_assert(not kh_private.notification_visible((select x from kh_private.notifications x where recipient_id=pg_temp.n_u(3) and category='agency_message'),pg_temp.n_u(3)),'a former member no longer sees the notice');
select pg_temp.n_assert(not has_function_privilege('authenticated','kh_private.agency_chat_notify(uuid[],uuid,uuid,text,integer,jsonb,text,text,text)','execute'),'helpers stay private');
rollback;
