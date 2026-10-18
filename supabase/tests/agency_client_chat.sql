-- The team answers a client together. Everything rolls back.
-- A admin (…01), G1 manager and responsable (…02), G2 manager added later (…03), K coordinator (…04),
-- B client (…05), G3 manager not involved (…06), B2 second client (…07), O owner of the home (…08).
-- Agency a1 is approved and has the home b1 under an active mandate.
begin;
create function pg_temp.cc_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'CLIENT CHAT ASSERTION: %',label; end if; end $$;
create function pg_temp.cc_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'CLIENT CHAT ASSERTION: missing error %',expected;
end $$;
create function pg_temp.cc_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
create function pg_temp.cc_u(n integer) returns uuid language sql immutable as $$select ('62000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.cc_id(n integer) returns uuid language sql immutable as $$select ('62000000-0000-4000-8000-0000001'||lpad(n::text,5,'0'))::uuid$$;
create function pg_temp.cc_c() returns uuid language sql stable as $$select current_setting('cc.conversation')::uuid$$;
create function pg_temp.cc_send(actor uuid,agency uuid,conversation uuid,n integer,body text) returns jsonb language sql as $$
 select public.kh_send_agency_message(actor,agency,jsonb_build_object('conversationId',conversation,'clientMessageId',pg_temp.cc_id(n),'clientRequestId',pg_temp.cc_id(n),'body',body))
$$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select pg_temp.cc_u(n),'clientchat-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Chat '||n) from generate_series(1,8) n;
insert into kh_private.agencies(id,trade_name,state) values('62000000-0000-4000-8000-0000000000a1','Casas Chat Ficticias','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('62000000-0000-4000-8000-0000000000a1',pg_temp.cc_u(1),'admin'),
 ('62000000-0000-4000-8000-0000000000a1',pg_temp.cc_u(2),'manager'),
 ('62000000-0000-4000-8000-0000000000a1',pg_temp.cc_u(3),'manager'),
 ('62000000-0000-4000-8000-0000000000a1',pg_temp.cc_u(4),'coordinator'),
 ('62000000-0000-4000-8000-0000000000a1',pg_temp.cc_u(6),'manager');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability,operation,rent_period) values
 ('62000000-0000-4000-8000-0000000000b1',pg_temp.cc_u(8),'clientchat-b1','Casa del chat','Vedado','Zona Chat','Casa','Vivienda ficticia para el chat de inmobiliaria.',50000,100,2,1,'{}',array['62000000-0000-4000-8000-000000000008/clientchat-b1/photo.jpg'],'approved','active','sale',null);
insert into kh_private.agency_mandates(property_id,agency_id,reference) values('62000000-0000-4000-8000-0000000000b1','62000000-0000-4000-8000-0000000000a1','Chat');

set local role authenticated;
-- The client writes through G1's link: G1 is the responsable, the client sees no team names.
select pg_temp.cc_as(pg_temp.cc_u(5));
select set_config('cc.conversation',public.kh_start_agency_conversation(pg_temp.cc_u(5),'62000000-0000-4000-8000-0000000000a1',
 jsonb_build_object('propertyId','62000000-0000-4000-8000-0000000000b1','preferredManagerId',pg_temp.cc_u(2),'clientRequestId',pg_temp.cc_id(1)))->>'id',true);
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->>'assigneeId')::uuid=pg_temp.cc_u(2)),'the link names the responsable');
select pg_temp.cc_assert((select public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->>'role'='client'),'client role');
select pg_temp.cc_assert((select public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->'attendants'='[]'::jsonb),'the client sees no team list');
select pg_temp.cc_assert((select public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->'buyerName'='null'::jsonb),'the client view has no buyer name');
select pg_temp.cc_assert((select not (pg_temp.cc_send(pg_temp.cc_u(5),null,pg_temp.cc_c(),2,'Hola, ¿sigue disponible?')->>'fromAgency')::boolean),'client message is not from the agency');

-- Another manager and an outsider do not see it.
select pg_temp.cc_as(pg_temp.cc_u(3));
select pg_temp.cc_error($q$select public.kh_get_agency_conversation(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c())$q$,'KH_AGENCY_DEAL_NOT_FOUND');
select pg_temp.cc_assert(jsonb_array_length(public.kh_list_agency_conversations(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1')->'items')=0,'G2 lists nothing yet');
select pg_temp.cc_as(pg_temp.cc_u(6));
select pg_temp.cc_error($q$select pg_temp.cc_send(pg_temp.cc_u(6),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),3,'No debería poder')$q$,'KH_AGENCY_DEAL_NOT_FOUND');

-- The admin sees it, answers without taking the case, and the coordinator answers too.
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_assert(jsonb_array_length(public.kh_list_agency_conversations(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1')->'items')=1,'admin lists it');
select pg_temp.cc_assert((select x->>'role'='supervisor' and (x->>'canManage')::boolean and (x->>'canSeeDeal')::boolean and (x->>'canSend')::boolean and x->>'buyerName'='Persona Chat 5'
 and x#>>'{attendants,0,userId}'=pg_temp.cc_u(2)::text and (x#>>'{attendants,0,lead}')::boolean and not (x#>>'{lastMessage,fromAgency}')::boolean
 from (select public.kh_get_agency_conversation(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c()) x)y),'admin view');
select pg_temp.cc_assert((select (pg_temp.cc_send(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),4,'Sí, sigue disponible.')->>'fromAgency')::boolean),'admin answers');
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c())->>'assigneeId')::uuid=pg_temp.cc_u(2)),'the responsable does not change');
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c())->>'unreadCount')::int=0),'own answer is read');
select pg_temp.cc_as(pg_temp.cc_u(4));
select pg_temp.cc_assert((select (pg_temp.cc_send(pg_temp.cc_u(4),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),5,'Le escribe también la coordinación.')->>'seq')::int=3),'coordinator answers');

-- The responsable cannot choose who attends; the admin adds G2, who then writes but has no case file.
select pg_temp.cc_as(pg_temp.cc_u(2));
select pg_temp.cc_error($q$select public.kh_set_agency_conversation_attendant(pg_temp.cc_u(2),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('conversationId',pg_temp.cc_c(),'userId',pg_temp.cc_u(3),'attending',true,'clientRequestId',pg_temp.cc_id(6)))$q$,'KH_AGENCY_ROLE_REQUIRED');
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_assert((select jsonb_array_length(public.kh_set_agency_conversation_attendant(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',
 jsonb_build_object('conversationId',pg_temp.cc_c(),'userId',pg_temp.cc_u(3),'attending',true,'clientRequestId',pg_temp.cc_id(7)))->'attendants')=2),'G2 attends');
select pg_temp.cc_error($q$select public.kh_set_agency_conversation_attendant(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('conversationId',pg_temp.cc_c(),'userId',pg_temp.cc_u(5),'attending',true,'clientRequestId',pg_temp.cc_id(8)))$q$,'KH_AGENCY_MANAGER_CHANGED');
select pg_temp.cc_as(pg_temp.cc_u(3));
select pg_temp.cc_assert((select x->>'role'='attendant' and not (x->>'canSeeDeal')::boolean and (x->>'canSend')::boolean
 from (select public.kh_get_agency_conversation(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c()) x)y),'attendant view');
select pg_temp.cc_assert((select (pg_temp.cc_send(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),9,'Puedo enseñarla el jueves.')->>'seq')::int=4),'G2 answers');
select pg_temp.cc_error($q$select public.kh_get_agency_deal(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',(select (public.kh_get_agency_conversation(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c())->>'dealId')::uuid))$q$,'KH_AGENCY_DEAL_NOT_FOUND');

-- The team sees who wrote each message; the client sees only that the agency did.
select pg_temp.cc_assert((select x#>>'{items,0,senderName}'='Persona Chat 3' and x#>>'{items,1,senderRole}'='coordinator' and x#>>'{items,3,senderName}'='Persona Chat 5'
 from (select public.kh_list_agency_messages(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c()) x)y),'team sees authors');
select pg_temp.cc_as(pg_temp.cc_u(5));
select pg_temp.cc_assert((select x#>'{items,0,senderName}'='null'::jsonb and (x#>>'{items,0,fromAgency}')::boolean
 from (select public.kh_list_agency_messages(pg_temp.cc_u(5),null,pg_temp.cc_c()) x)y),'client sees the agency only');
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->>'unreadCount')::int=3),'three answers unread');

-- A client report without a person names the last team member who wrote.
select public.kh_report_agency_conversation(pg_temp.cc_u(5),null,jsonb_build_object('conversationId',pg_temp.cc_c(),'reason','other','details','Prueba','clientRequestId',pg_temp.cc_id(10)));
reset role;
select pg_temp.cc_assert((select reported_user_id=pg_temp.cc_u(3) from kh_private.agency_message_reports where reporter_id=pg_temp.cc_u(5)),'report names G2');
set local role authenticated;

-- A personal block stops only that team member.
select pg_temp.cc_as(pg_temp.cc_u(3));
select public.kh_set_agency_conversation_block(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('conversationId',pg_temp.cc_c(),'otherUserId',pg_temp.cc_u(5),'blocked',true,'clientRequestId',pg_temp.cc_id(11)));
select pg_temp.cc_assert((select not (x->>'canSend')::boolean and (x->>'clientBlockedByMe')::boolean from (select public.kh_get_agency_conversation(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c()) x)y),'blocked member cannot send and sees the block');
select pg_temp.cc_error($q$select pg_temp.cc_send(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),12,'Bloqueado')$q$,'KH_CHAT_BLOCKED');
select public.kh_set_agency_conversation_block(pg_temp.cc_u(3),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('conversationId',pg_temp.cc_c(),'otherUserId',pg_temp.cc_u(5),'blocked',false,'clientRequestId',pg_temp.cc_id(13)));
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c())->>'canSend')::boolean),'the rest of the team still writes');

-- The client blocks the agency: nobody writes, no new case starts; unblocking restores both.
select pg_temp.cc_as(pg_temp.cc_u(5));
select pg_temp.cc_assert((select (public.kh_set_agency_client_block(pg_temp.cc_u(5),jsonb_build_object('agencyId','62000000-0000-4000-8000-0000000000a1','conversationId',pg_temp.cc_c(),'blocked',true,'clientRequestId',pg_temp.cc_id(14)))->>'agencyBlocked')::boolean),'agency blocked');
select pg_temp.cc_error($q$select pg_temp.cc_send(pg_temp.cc_u(5),null,pg_temp.cc_c(),15,'Bloqueada')$q$,'KH_AGENCY_BLOCKED');
select pg_temp.cc_error($q$select public.kh_start_agency_conversation(pg_temp.cc_u(5),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('propertyId','62000000-0000-4000-8000-0000000000b1','clientRequestId',pg_temp.cc_id(16)))$q$,'KH_AGENCY_BLOCKED');
select pg_temp.cc_error($q$select public.kh_set_agency_client_block(pg_temp.cc_u(5),jsonb_build_object('agencyId','62000000-0000-4000-8000-0000000000a2','conversationId',pg_temp.cc_c(),'blocked',false,'clientRequestId',pg_temp.cc_id(17)))$q$,'KH_CHAT_INVALID_BLOCK');
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_error($q$select pg_temp.cc_send(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1',pg_temp.cc_c(),18,'Bloqueada')$q$,'KH_AGENCY_BLOCKED');
select pg_temp.cc_error($q$select public.kh_set_agency_client_block(pg_temp.cc_u(1),jsonb_build_object('agencyId','62000000-0000-4000-8000-0000000000a1','conversationId',pg_temp.cc_c(),'blocked',false,'clientRequestId',pg_temp.cc_id(19)))$q$,'KH_AGENCY_DEAL_NOT_FOUND');
select pg_temp.cc_as(pg_temp.cc_u(5));
select pg_temp.cc_assert((select not (public.kh_set_agency_client_block(pg_temp.cc_u(5),jsonb_build_object('agencyId','62000000-0000-4000-8000-0000000000a1','conversationId',pg_temp.cc_c(),'blocked',false,'clientRequestId',pg_temp.cc_id(20)))->>'agencyBlocked')::boolean),'agency unblocked');

-- A link naming another manager reopens the open conversation instead of failing.
select pg_temp.cc_assert((select (public.kh_start_agency_conversation(pg_temp.cc_u(5),'62000000-0000-4000-8000-0000000000a1',
 jsonb_build_object('propertyId','62000000-0000-4000-8000-0000000000b1','preferredManagerId',pg_temp.cc_u(6),'clientRequestId',pg_temp.cc_id(21)))->>'id')::uuid=pg_temp.cc_c()),'same conversation reopened');
select pg_temp.cc_assert((select (public.kh_get_agency_conversation(pg_temp.cc_u(5),null,pg_temp.cc_c())->>'assigneeId')::uuid=pg_temp.cc_u(2)),'responsable kept');

-- A second client lands in the queue: the admin sees it first, then activity reorders the list.
select pg_temp.cc_as(pg_temp.cc_u(7));
select public.kh_start_agency_conversation(pg_temp.cc_u(7),'62000000-0000-4000-8000-0000000000a1',jsonb_build_object('propertyId','62000000-0000-4000-8000-0000000000b1','clientRequestId',pg_temp.cc_id(22)));
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_assert((select x#>'{items,0,assigneeId}'='null'::jsonb and (x#>>'{items,0,canSend}')::boolean and (x#>>'{items,1,id}')::uuid=pg_temp.cc_c()
 from (select public.kh_list_agency_conversations(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1') x)y),'queue first, admin can answer');
select pg_temp.cc_as(pg_temp.cc_u(2));
select pg_temp.cc_assert(jsonb_array_length(public.kh_list_agency_conversations(pg_temp.cc_u(2),'62000000-0000-4000-8000-0000000000a1')->'items')=1,'the responsable sees only theirs');
select pg_temp.cc_as(pg_temp.cc_u(5));
select pg_temp.cc_send(pg_temp.cc_u(5),null,pg_temp.cc_c(),23,'Gracias, el jueves me viene bien.');
select pg_temp.cc_as(pg_temp.cc_u(1));
select pg_temp.cc_assert((select (public.kh_list_agency_conversations(pg_temp.cc_u(1),'62000000-0000-4000-8000-0000000000a1')#>>'{items,0,id}')::uuid=pg_temp.cc_c()),'latest activity first');

-- Leaving the team removes G2 from the conversation.
reset role;
update kh_private.agency_memberships set state='removed',version=version+1 where agency_id='62000000-0000-4000-8000-0000000000a1' and user_id=pg_temp.cc_u(3);
select pg_temp.cc_assert(not exists(select 1 from kh_private.agency_conversation_members where user_id=pg_temp.cc_u(3)),'G2 left every conversation');

select pg_temp.cc_assert(not has_table_privilege('authenticated','kh_private.agency_conversation_members','select') and not has_table_privilege('authenticated','kh_private.agency_client_blocks','select'),'private tables closed');
select pg_temp.cc_assert(not has_function_privilege('anon','public.kh_set_agency_conversation_attendant(uuid,uuid,jsonb)','execute') and not has_function_privilege('anon','public.kh_set_agency_client_block(uuid,jsonb)','execute'),'anon cannot execute');
rollback;
