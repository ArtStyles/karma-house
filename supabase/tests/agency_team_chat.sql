-- Internal team chat. Everything rolls back.
-- A admin (…01), M manager (…02), C coordinator (…03), O outsider (…04), X admin of another agency (…05). Agencies a1 and a2 are approved.
begin;
create function pg_temp.team_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'TEAM ASSERTION: %',label; end if; end $$;
create function pg_temp.team_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'TEAM ASSERTION: missing error %',expected;
end $$;
create function pg_temp.team_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
create function pg_temp.team_send(actor uuid,agency uuid,client uuid,body text) returns jsonb language sql as $$
 select public.kh_send_agency_team_message(actor,agency,jsonb_build_object('clientMessageId',client,'body',body))
$$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'team-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Equipo '||n)
 from generate_series(1,5) n;
insert into kh_private.agencies(id,trade_name,state) values
 ('61000000-0000-4000-8000-0000000000a1','Casas Equipo Ficticias','approved'),
 ('61000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Ficticia','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000001','admin'),
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000002','manager'),
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000003','coordinator'),
 ('61000000-0000-4000-8000-0000000000a2','61000000-0000-4000-8000-000000000005','admin');

set local role authenticated;
-- Before the first message the chat is empty and nobody has unread messages.
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'lastSeq')::int=0,'empty chat');
select pg_temp.team_assert(public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->'lastMessage'='null'::jsonb,'no last message');
select pg_temp.team_assert(jsonb_array_length(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->'items')=0,'no messages');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":0}');

-- The manager writes; a retry with the same id returns the same message, other text with that id is refused.
select pg_temp.team_as('61000000-0000-4000-8000-000000000002');
select pg_temp.team_assert((pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','  Hola, equipo  ')->>'seq')::int=1,'first message');
select pg_temp.team_assert((pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','Hola, equipo')->>'seq')::int=1,'retry returns the same message');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','Otro texto')$q$,'KH_CHAT_MESSAGE_CONFLICT');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d2',E' \n\t ')$q$,'KH_CHAT_INVALID_MESSAGE');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d3',repeat('a',2001))$q$,'KH_CHAT_INVALID_MESSAGE');
select pg_temp.team_error($q$select public.kh_send_agency_team_message('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','{"clientMessageId":"x","body":"Hola"}')$q$,'KH_CHAT_INVALID_MESSAGE');
-- The sender has nothing unread; nobody writes for someone else.
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=0,'own message is read');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d4','Suplantado')$q$,'KH_ACCOUNT_CHANGED');

-- The admin sees the message with its author and role, then reads it.
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=1,'admin has one unread');
select pg_temp.team_assert(public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{lastMessage,senderName}'='Persona Equipo 2','last message author');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'memberCount')::int=3,'three members');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'canSend')::boolean,'admin can send');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{items,0,body}'='Hola, equipo','stored body is trimmed');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{items,0,senderRole}'='manager','sender role');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":1}');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":0}');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=0,'read only moves forward');
select pg_temp.team_error($q$select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":5}')$q$,'KH_CHAT_INVALID_CURSOR');

-- Pages go newest first and say when there is more.
select pg_temp.team_as('61000000-0000-4000-8000-000000000003');
select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',('61000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'Mensaje '||n) from generate_series(1,19) n;
select pg_temp.team_assert(jsonb_array_length(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)->'items')=5,'page of five');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)->>'hasMore')::boolean,'more pages');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)#>>'{items,0,seq}')::int=20,'newest first');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',3,50)->>'hasMore')::boolean=false,'before seq 3 has two');
-- The coordinator wrote 19; with the shared limit the 21st within a minute is refused.
select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000120','Mensaje 20');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000121','Mensaje 21')$q$,'KH_CHAT_RATE_LIMIT');

-- Outsiders and other agencies can neither read nor write.
select pg_temp.team_as('61000000-0000-4000-8000-000000000004');
select pg_temp.team_error($q$select public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d5','Hola')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_as('61000000-0000-4000-8000-000000000005');
select pg_temp.team_error($q$select public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_error($q$select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a1','{"lastSeq":1}')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a2')->>'lastSeq')::int=0,'chats are separate per agency');

-- A suspended agency keeps its history readable but takes no messages.
reset role;
update kh_private.agencies set state='suspended' where id='61000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert(not (public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'canSend')::boolean,'suspended agency cannot send');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d6','Hola')$q$,'KH_AGENCY_NOT_APPROVED');
reset role;
update kh_private.agencies set state='approved' where id='61000000-0000-4000-8000-0000000000a1';

-- A member who leaves loses the chat; their messages keep their name, without a role.
update kh_private.agency_memberships set state='removed',version=version+1 where agency_id='61000000-0000-4000-8000-0000000000a1' and user_id='61000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.team_as('61000000-0000-4000-8000-000000000002');
select pg_temp.team_error($q$select public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1',2,50)#>>'{items,0,senderName}'='Persona Equipo 2','former member keeps the name');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1',2,50)#>'{items,0,senderRole}'='null'::jsonb,'former member has no role');
reset role;

-- Private tables and anonymous callers stay closed.
select pg_temp.team_assert(not has_table_privilege('authenticated','kh_private.agency_team_messages','select'),'authenticated cannot read the table');
select pg_temp.team_assert(not has_function_privilege('anon','public.kh_send_agency_team_message(uuid,uuid,jsonb)','execute') and not has_function_privilege('anon','public.kh_get_agency_team_chat(uuid,uuid)','execute'),'anon cannot execute');
rollback;
