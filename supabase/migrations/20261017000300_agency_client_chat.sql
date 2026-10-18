-- The agency answers a client as a team. Admins and coordinators write in every client conversation of
-- their agency; the case's responsable and the people added to a conversation write in theirs. The client
-- talks to «la inmobiliaria» and may block it. Conversation RPCs move to their own access rule:
-- agency_deal_visible, and with it the case file, does not change.
create table kh_private.agency_conversation_members(
 conversation_id uuid not null references kh_private.agency_conversations(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 added_by uuid,created_at timestamptz not null default clock_timestamp(),primary key(conversation_id,user_id)
);
create index agency_conversation_members_user on kh_private.agency_conversation_members(user_id);
create table kh_private.agency_client_blocks(
 agency_id uuid not null references kh_private.agencies(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),primary key(agency_id,user_id)
);
do $$declare t text;begin
 foreach t in array array['agency_conversation_members','agency_client_blocks'] loop
  execute format('alter table kh_private.%I enable row level security',t);
  execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
  execute format('grant all on kh_private.%I to service_role',t);
 end loop;
end $$;
-- The inbox orders by activity; a message says which side wrote it, so the client sees «la inmobiliaria».
alter table kh_private.agency_conversations add column last_message_at timestamptz;
update kh_private.agency_conversations c set last_message_at=(select max(m.created_at) from kh_private.agency_messages m where m.conversation_id=c.id);
create index agency_conversations_activity on kh_private.agency_conversations((coalesce(last_message_at,created_at)) desc,id);
alter table kh_private.agency_messages add column from_agency boolean not null default false;
update kh_private.agency_messages m set from_agency=true from kh_private.agency_conversations c join kh_private.agency_deals d on d.id=c.deal_id
 where c.id=m.conversation_id and m.author_id is distinct from d.buyer_id
 and (d.buyer_id is not null or exists(select 1 from kh_private.agency_memberships x where x.agency_id=d.agency_id and x.user_id=m.author_id));

-- Leaving the team takes a person out of every conversation of that agency.
create function kh_private.agency_conversation_member_exit() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.state='removed' and old.state<>'removed' then
  delete from kh_private.agency_conversation_members x using kh_private.agency_conversations c,kh_private.agency_deals d
   where x.conversation_id=c.id and d.id=c.deal_id and d.agency_id=new.agency_id and x.user_id=new.user_id;
 end if;return new;
end $$;
create trigger kh_agency_conversation_member_exit after update of state on kh_private.agency_memberships for each row execute function kh_private.agency_conversation_member_exit();

-- client, supervisor (admin or coordinator), lead (the responsable), attendant, or null.
create function kh_private.agency_conversation_role(actor uuid,agency uuid,d kh_private.agency_deals,conversation uuid) returns text language sql stable security definer set search_path='' as $$
 select case when agency is null then case when d.contact_kind='account' and d.buyer_id=actor then 'client' end
 when d.agency_id is distinct from agency then null
 else (select case when m.role in('coordinator','admin') then 'supervisor' when d.assignee_id=actor then 'lead'
  when exists(select 1 from kh_private.agency_conversation_members x where x.conversation_id=conversation and x.user_id=actor) then 'attendant' end
  from kh_private.agency_memberships m where m.agency_id=agency and m.user_id=actor and m.state='active') end
$$;
create function kh_private.agency_conversation_deal(actor uuid,agency uuid,conversation uuid) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals;begin
 select x.* into d from kh_private.agency_deals x join kh_private.agency_conversations c on c.deal_id=x.id where c.id=conversation;
 if d.id is null or kh_private.agency_conversation_role(actor,agency,d,conversation) is null then raise exception 'KH_AGENCY_DEAL_NOT_FOUND' using errcode='42501';end if;
 return d;end $$;
-- The same split as agency_prepare_deal and agency_deal_access: prepare before the locks, re-read after them.
create function kh_private.agency_conversation_prepare(actor uuid,agency uuid,conversation uuid) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 begin perform kh_private.agency_prepare_account(actor);return kh_private.agency_conversation_deal(actor,agency,conversation);end $$;
create function kh_private.agency_conversation_access(actor uuid,agency uuid,conversation uuid) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 begin perform kh_private.agency_account(actor);return kh_private.agency_conversation_deal(actor,agency,conversation);end $$;
create function kh_private.agency_client_blocked(agency uuid,client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agency_client_blocks where agency_id=agency and user_id=client)
$$;
-- Each team member is checked alone: a block between one of them and the client stops only that person.
create function kh_private.agency_conversation_can_send(actor uuid,agency uuid,d kh_private.agency_deals,conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select d.closed_reason is null and d.buyer_id is not null and not kh_private.is_suspended(d.buyer_id) and not kh_private.is_deleting(d.buyer_id)
 and kh_private.agency_flow_live(d.agency_id,d.property_id) and not kh_private.agency_client_blocked(d.agency_id,d.buyer_id)
 and (agency is null or (kh_private.agency_conversation_role(actor,agency,d,conversation) is not null
  and kh_private.agency_contact_member(d.agency_id,actor) and not kh_private.agency_pair_blocked(actor,d.buyer_id)))
$$;
create function kh_private.agency_buyer_name(d kh_private.agency_deals) returns text language sql stable security definer set search_path='' as $$
 select coalesce(d.private_contact->>'name',(select nullif(btrim(p.display_name),'') from public.profiles p where p.id=d.buyer_id),case when d.buyer_id is null then 'Cuenta eliminada' else 'Cliente' end)
$$;
create or replace function kh_private.agency_message_json(m kh_private.agency_messages) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'seq',m.seq,'clientMessageId',m.client_message_id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at,'fromAgency',m.from_agency)
$$;
-- The team sees who wrote each message; the client sees no team names, only which side wrote.
create function kh_private.agency_message_view(m kh_private.agency_messages,d kh_private.agency_deals,team boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select kh_private.agency_message_json(m)||jsonb_build_object(
  'senderName',case when not team then null when m.sender_id is null then 'Cuenta eliminada' when not m.from_agency then kh_private.agency_buyer_name(d)
   else coalesce((select nullif(btrim(p.display_name),'') from public.profiles p where p.id=m.sender_id),'Persona del equipo') end,
  'senderRole',case when team and m.from_agency then (select r.role from kh_private.agency_memberships r where r.agency_id=d.agency_id and r.user_id=m.sender_id and r.state='active') end)
$$;
create or replace function kh_private.agency_conversation_json(actor uuid,agency uuid,c kh_private.agency_conversations) returns jsonb language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals:=kh_private.agency_conversation_access(actor,agency,c.id);v_role text;v_last kh_private.agency_messages;v_team boolean:=agency is not null;begin
 v_role:=kh_private.agency_conversation_role(actor,agency,d,c.id);
 select * into v_last from kh_private.agency_messages where conversation_id=c.id and seq=c.last_seq;
 return jsonb_build_object('id',c.id,'agencyId',d.agency_id,'dealId',d.id,'propertyId',d.property_id,'buyerId',d.buyer_id,'assigneeId',d.assignee_id,'dealVersion',d.version,
 'agencyName',(select trade_name from kh_private.agencies where id=d.agency_id),'propertyTitle',coalesce((select title from public.properties where id=d.property_id),(select title from kh_private.agency_property_identities where property_id=d.property_id),'Vivienda'),
 'canSend',kh_private.agency_conversation_can_send(actor,agency,d,c.id),
 'closedReason',d.closed_reason,'lastSeq',c.last_seq,'unreadCount',greatest(0,c.last_seq-coalesce((select last_seq from kh_private.agency_message_reads where conversation_id=c.id and user_id=actor),0)),
 'blockedUserIds',(select coalesce(jsonb_agg(b.blocked_id order by b.blocked_id),'[]'::jsonb) from public.kh_user_blocks b where b.blocker_id=actor and kh_private.agency_retained_block(actor,d.agency_id,c.id,b.blocked_id)),
 'role',v_role,'canManage',v_role='supervisor','canSeeDeal',v_role in('supervisor','lead'),'agencyBlocked',kh_private.agency_client_blocked(d.agency_id,d.buyer_id),
 'clientBlockedByMe',v_team and exists(select 1 from public.kh_user_blocks b where b.blocker_id=actor and b.blocked_id=d.buyer_id),
 'buyerName',case when v_team then kh_private.agency_buyer_name(d) end,
 'attendants',case when v_team then (select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'displayName',coalesce((select nullif(btrim(p.display_name),'') from public.profiles p where p.id=x.user_id),'Persona del equipo'),'role',m.role,'lead',x.lead) order by x.lead desc,x.created_at,x.user_id),'[]'::jsonb)
   from(select d.assignee_id user_id,true lead,null::timestamptz created_at where d.assignee_id is not null
    union all select y.user_id,false,y.created_at from kh_private.agency_conversation_members y where y.conversation_id=c.id and y.user_id is distinct from d.assignee_id)x
   join kh_private.agency_memberships m on m.agency_id=d.agency_id and m.user_id=x.user_id and m.state='active') else '[]'::jsonb end,
 'lastMessageAt',c.last_message_at,
 'lastMessage',case when v_last.id is null then null else jsonb_build_object('body',v_last.body,'createdAt',v_last.created_at,'fromAgency',v_last.from_agency) end);
end $$;

create or replace function public.kh_list_agency_conversations(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare v_items jsonb;begin perform kh_private.agency_account(p_actor_id);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_conversation_json(p_actor_id,p_agency_id,x) order by coalesce(x.last_message_at,x.created_at) desc,x.id),'[]') into v_items from(
  select c.* from kh_private.agency_conversations c join kh_private.agency_deals d on d.id=c.deal_id
  where case when p_agency_id is null then d.contact_kind='account' and d.buyer_id=p_actor_id else d.agency_id=p_agency_id and kh_private.agency_conversation_role(p_actor_id,p_agency_id,d,c.id) is not null end
  order by coalesce(c.last_message_at,c.created_at) desc,c.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(v_items)>p_limit then v_items-p_limit else v_items end,'hasMore',jsonb_array_length(v_items)>p_limit);end $$;
create or replace function public.kh_list_agency_messages(p_actor_id uuid,p_agency_id uuid,p_conversation_id uuid,p_before_seq integer default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare v_items jsonb;d kh_private.agency_deals;begin d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,p_conversation_id);
 if p_limit is null or p_limit not between 1 and 50 or p_before_seq<1 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_message_view(x,d,p_agency_id is not null) order by x.seq desc),'[]') into v_items from(select * from kh_private.agency_messages where conversation_id=p_conversation_id and (p_before_seq is null or seq<p_before_seq) order by seq desc limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(v_items)>p_limit then v_items-p_limit else v_items end,'hasMore',jsonb_array_length(v_items)>p_limit);end $$;
create or replace function public.kh_send_agency_message(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;prior uuid;r jsonb;m kh_private.agency_messages;v_body text:=btrim(p_payload->>'body');begin
 perform kh_private.agency_require_enabled();
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;
 d:=kh_private.agency_conversation_prepare(p_actor_id,p_agency_id,c.id);prior:=d.assignee_id;
 if v_body is null or char_length(v_body) not between 1 and 2000 or v_body~'^[[:space:]]*$' or (p_payload->>'clientMessageId')::uuid is null then raise exception 'KH_CHAT_INVALID_MESSAGE';end if;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id]);
 d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,c.id);if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 select * into c from kh_private.agency_conversations where id=c.id for update;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'send_agency_message',p_payload);
 if r is not null then select * into m from kh_private.agency_messages where id=(r->>'id')::uuid;return kh_private.agency_message_json(m);end if;
 select * into m from kh_private.agency_messages where author_id=p_actor_id and client_message_id=(p_payload->>'clientMessageId')::uuid;
 if m.id is not null then
  if m.conversation_id<>c.id or m.body<>v_body then raise exception 'KH_CHAT_MESSAGE_CONFLICT';end if;
  return kh_private.agency_remember(p_actor_id,d.agency_id,'send_agency_message',p_payload,kh_private.agency_message_json(m));
 end if;
 if kh_private.agency_client_blocked(d.agency_id,d.buyer_id) then raise exception 'KH_AGENCY_BLOCKED';end if;
 if p_agency_id is not null and kh_private.agency_pair_blocked(p_actor_id,d.buyer_id) then raise exception 'KH_CHAT_BLOCKED';end if;
 if not kh_private.agency_conversation_can_send(p_actor_id,p_agency_id,d,c.id) then raise exception 'KH_AGENCY_CONVERSATION_CLOSED';end if;
 -- The shared trigger enforces the message rate across personal, client and team chats.
 insert into kh_private.agency_messages(conversation_id,seq,client_message_id,sender_id,author_id,body,created_at,from_agency)
  values(c.id,c.last_seq+1,(p_payload->>'clientMessageId')::uuid,p_actor_id,p_actor_id,v_body,clock_timestamp(),p_agency_id is not null)returning * into m;
 update kh_private.agency_conversations set last_seq=m.seq,last_message_at=m.created_at where id=c.id;
 insert into kh_private.agency_message_reads(conversation_id,user_id,last_seq)values(c.id,p_actor_id,m.seq)
  on conflict(conversation_id,user_id)do update set last_seq=greatest(kh_private.agency_message_reads.last_seq,excluded.last_seq);
 return kh_private.agency_remember(p_actor_id,d.agency_id,'send_agency_message',p_payload,kh_private.agency_message_json(m));end $$;
create or replace function public.kh_read_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare c jsonb;d kh_private.agency_deals;prior uuid;v_seq integer:=(p_payload->>'lastSeq')::integer;r jsonb;v_id uuid:=(p_payload->>'conversationId')::uuid;begin
 d:=kh_private.agency_conversation_prepare(p_actor_id,p_agency_id,v_id);prior:=d.assignee_id;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id]);
 d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,v_id);if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 c:=public.kh_get_agency_conversation(p_actor_id,p_agency_id,v_id);
 if v_seq is null or v_seq<0 or v_seq>(c->>'lastSeq')::integer then raise exception 'KH_CHAT_INVALID_CURSOR';end if;
 r:=kh_private.agency_receipt(p_actor_id,(c->>'agencyId')::uuid,'read_agency_conversation',p_payload);if r is not null then return;end if;
 insert into kh_private.agency_message_reads(conversation_id,user_id,last_seq)values(v_id,p_actor_id,v_seq)
  on conflict(conversation_id,user_id)do update set last_seq=greatest(kh_private.agency_message_reads.last_seq,excluded.last_seq);
 perform kh_private.agency_remember(p_actor_id,(c->>'agencyId')::uuid,'read_agency_conversation',p_payload,'{}');end $$;
create or replace function public.kh_report_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;prior uuid;r jsonb;rid uuid;target uuid:=(p_payload->>'reportedUserId')::uuid;ctx jsonb;reason text:=p_payload->>'reason';details text:=btrim(coalesce(p_payload->>'details',''));begin
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;d:=kh_private.agency_conversation_prepare(p_actor_id,p_agency_id,c.id);prior:=d.assignee_id;
 -- A client reports «la inmobiliaria»: the report names the last team member who wrote.
 if target is null and p_agency_id is null then select m.author_id into target from kh_private.agency_messages m where m.conversation_id=c.id and m.from_agency order by m.seq desc limit 1;end if;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id,target]);d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,c.id);
 if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 if target is null or target=p_actor_id or reason is null or reason not in('spam','fraud','harassment','other') or char_length(details)>1000 then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 if not exists(select 1 from kh_private.agency_messages where conversation_id=c.id and author_id=target) then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 if (p_agency_id is null and target=d.buyer_id) or (p_agency_id is not null and target is distinct from d.buyer_id) then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'report_agency_conversation',p_payload);if r is not null then return r;end if;
 -- The shared trigger enforces the daily report limit.
 select coalesce(jsonb_agg(kh_private.agency_message_json(x) order by x.seq),'[]') into ctx from(select * from kh_private.agency_messages where conversation_id=c.id order by seq desc limit 30)x;
 insert into kh_private.agency_message_reports(agency_id,conversation_id,reporter_id,reported_user_id,reason,details,context,property_title)values(d.agency_id,c.id,p_actor_id,target,reason,details,ctx,kh_private.agency_conversation_json(p_actor_id,p_agency_id,c)->>'propertyTitle')returning id into rid;
 return kh_private.agency_remember(p_actor_id,d.agency_id,'report_agency_conversation',p_payload,jsonb_build_object('id',rid));end $$;
-- A personal block. Anyone on the team who can open the conversation may block or unblock the client;
-- the client keeps the rules it had (the responsable, an author, or the way back from an earlier block).
create or replace function public.kh_set_agency_conversation_block(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;prior uuid;target uuid:=(p_payload->>'otherUserId')::uuid;v_blocked boolean;r jsonb;begin
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;
 d:=kh_private.agency_conversation_prepare(p_actor_id,p_agency_id,c.id);prior:=d.assignee_id;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id,target]);
 d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,c.id);
 if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 if target is null or target=p_actor_id or jsonb_typeof(p_payload->'blocked') is distinct from 'boolean' then raise exception 'KH_CHAT_INVALID_BLOCK';end if;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'set_agency_conversation_block',p_payload);if r is not null then return;end if;
 v_blocked:=(p_payload->>'blocked')::boolean;
 if p_agency_id is null then
  if target is distinct from d.assignee_id and not exists(select 1 from kh_private.agency_messages where conversation_id=c.id and author_id=target and author_id<>p_actor_id)
   and (v_blocked or not kh_private.agency_retained_block(p_actor_id,d.agency_id,c.id,target)) then raise exception 'KH_CHAT_INVALID_BLOCK';end if;
 elsif target is distinct from d.buyer_id then raise exception 'KH_CHAT_INVALID_BLOCK';
 end if;
 if v_blocked then
  if not exists(select 1 from auth.users where id=target) then raise exception 'KH_CHAT_INVALID_BLOCK';end if;
  insert into public.kh_user_blocks(blocker_id,blocked_id)values(p_actor_id,target)on conflict do nothing;
 else delete from public.kh_user_blocks where blocker_id=p_actor_id and blocked_id=target;end if;
 perform kh_private.agency_remember(p_actor_id,d.agency_id,'set_agency_conversation_block',p_payload,'{}');
end $$;

-- Admins and coordinators choose who answers a conversation besides the responsable.
create function public.kh_set_agency_conversation_attendant(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;prior uuid;target uuid;r jsonb;begin
 perform kh_private.agency_require_enabled();
 begin target:=(p_payload->>'userId')::uuid;exception when others then raise exception 'KH_AGENCY_INVALID';end;
 if target is null or jsonb_typeof(p_payload->'attending') is distinct from 'boolean' then raise exception 'KH_AGENCY_INVALID';end if;
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;
 d:=kh_private.agency_conversation_prepare(p_actor_id,p_agency_id,c.id);prior:=d.assignee_id;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id,target]);
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'coordinator');
 d:=kh_private.agency_conversation_access(p_actor_id,p_agency_id,c.id);if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'set_conversation_attendant',p_payload);if r is not null then return kh_private.agency_conversation_json(p_actor_id,p_agency_id,c);end if;
 if (p_payload->>'attending')::boolean then
  if d.closed_reason is not null or not kh_private.agency_flow_live(d.agency_id,d.property_id) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
  if not kh_private.agency_contact_member(p_agency_id,target) or target is not distinct from d.buyer_id then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
  if kh_private.agency_pair_blocked(d.buyer_id,target) then raise exception 'KH_CHAT_BLOCKED';end if;
  insert into kh_private.agency_conversation_members(conversation_id,user_id,added_by)values(c.id,target,p_actor_id)on conflict do nothing;
 else delete from kh_private.agency_conversation_members where conversation_id=c.id and user_id=target;
 end if;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,p_actor_id,
  case when (p_payload->>'attending')::boolean then 'conversation_attendant_added' else 'conversation_attendant_removed' end,c.id,jsonb_build_object('userId',target));
 return kh_private.agency_remember(p_actor_id,p_agency_id,'set_conversation_attendant',p_payload,kh_private.agency_conversation_json(p_actor_id,p_agency_id,c));end $$;
-- A client blocks or unblocks an agency it talks to. Safety tools work while the module is paused.
create function public.kh_set_agency_client_block(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;r jsonb;begin
 if jsonb_typeof(p_payload->'blocked') is distinct from 'boolean' then raise exception 'KH_CHAT_INVALID_BLOCK';end if;
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;
 d:=kh_private.agency_conversation_prepare(p_actor_id,null,c.id);
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id]);
 d:=kh_private.agency_conversation_access(p_actor_id,null,c.id);
 if (p_payload->>'agencyId') is distinct from d.agency_id::text then raise exception 'KH_CHAT_INVALID_BLOCK';end if;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'set_agency_client_block',p_payload);if r is not null then return kh_private.agency_conversation_json(p_actor_id,null,c);end if;
 if (p_payload->>'blocked')::boolean then insert into kh_private.agency_client_blocks(agency_id,user_id)values(d.agency_id,p_actor_id)on conflict do nothing;
 else delete from kh_private.agency_client_blocks where agency_id=d.agency_id and user_id=p_actor_id;end if;
 return kh_private.agency_remember(p_actor_id,d.agency_id,'set_agency_client_block',p_payload,kh_private.agency_conversation_json(p_actor_id,null,c));end $$;

-- A client's open case with this agency for this home is reopened, whoever a shared link names;
-- a blocked agency takes no new case for that client.
create or replace function kh_private.agency_make_deal(actor uuid,agency uuid,payload jsonb,buyer_start boolean) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 declare pid uuid:=kh_private.agency_effective_property((payload->>'propertyId')::uuid);buyer uuid:=case when buyer_start then actor else (payload->>'buyerId')::uuid end;
 manager uuid:=case when buyer_start then (payload->>'preferredManagerId')::uuid else (payload->>'assigneeId')::uuid end;cycle uuid;d kh_private.agency_deals;contact jsonb;phone text;begin
 if not kh_private.agency_flow_live(agency,pid) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 if buyer is not null and (not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) or kh_private.is_suspended(buyer) or kh_private.is_deleting(buyer)) then raise exception 'KH_AGENCY_RECIPIENT_INVALID';end if;
 if buyer is not null and kh_private.agency_client_blocked(agency,buyer) then raise exception 'KH_AGENCY_BLOCKED';end if;
 if buyer_start then
  select x.* into d from kh_private.agency_deals x join kh_private.commercial_cycles y on y.id=x.cycle_id
   where y.property_id=pid and y.state='open' and x.agency_id=agency and x.buyer_id=buyer and x.closed_reason is null and x.stage not in('won','lost');
  if d.id is not null then return d;end if;
 end if;
 if manager is not null and not kh_private.agency_contact_member(agency,manager) then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
 if manager=buyer then raise exception 'KH_AGENCY_INVALID';end if;
 if not buyer_start then
  perform kh_private.agency_actor(actor,agency,'manager');
  if exists(select 1 from kh_private.agency_memberships where agency_id=agency and user_id=actor and role='manager') then
   if manager is not null and manager<>actor then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;manager:=actor;
  end if;
  if (buyer is null)=(payload->'externalContact' is null or payload->'externalContact'='null'::jsonb) then raise exception 'KH_AGENCY_INVALID_CONTACT';end if;
 end if;
 if manager=buyer then raise exception 'KH_AGENCY_INVALID';end if;
 if kh_private.agency_pair_blocked(buyer,manager) then raise exception 'KH_CHAT_BLOCKED';end if;
 if buyer is null then
  phone:=payload#>>'{externalContact,phone}';if phone is not null and phone!~'^\+?[0-9][0-9 ()-]{6,23}$' then raise exception 'KH_AGENCY_INVALID_CONTACT';end if;
  contact:=jsonb_build_object('name',kh_private.agency_text(payload#>'{externalContact,name}',2,120),'phone',phone,'consentReference',kh_private.agency_text(payload#>'{externalContact,consentReference}',2,1000));
 end if;
 select id into cycle from kh_private.commercial_cycles where property_id=pid and state='open';
 if cycle is null then insert into kh_private.commercial_cycles(property_id)values(pid)returning id into cycle;end if;
 select * into d from kh_private.agency_deals where cycle_id=cycle and agency_id=agency and buyer_id=buyer and closed_reason is null and stage not in('won','lost');
 if d.id is not null then
  if manager is not null and d.assignee_id is distinct from manager then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
  if not buyer_start and not kh_private.agency_deal_visible(actor,agency,d) then raise exception 'KH_AGENCY_DEAL_NOT_FOUND';end if;return d;
 end if;
 insert into kh_private.agency_deals(agency_id,property_id,cycle_id,buyer_id,contact_kind,private_contact,assignee_id)values(agency,pid,cycle,buyer,case when buyer is null then 'external' else 'account' end,contact,manager)returning * into d;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(agency,actor,'deal_created',d.id);return d;
end $$;
-- agency_make_deal checks a link's manager after looking for the open case, so the start RPC no longer does.
create or replace function public.kh_start_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r jsonb;d kh_private.agency_deals;c kh_private.agency_conversations;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,(p_payload->>'propertyId')::uuid,array[(p_payload->>'preferredManagerId')::uuid]);
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'start_conversation',p_payload);
 if r is not null then select * into c from kh_private.agency_conversations where id=(r->>'id')::uuid;return kh_private.agency_conversation_json(p_actor_id,null,c);end if;
 d:=kh_private.agency_make_deal(p_actor_id,p_agency_id,p_payload,true);
 if not exists(select 1 from kh_private.agency_conversations where deal_id=d.id) then perform kh_private.agency_check_contact_budget(p_actor_id);end if;
 insert into kh_private.agency_conversations(deal_id)values(d.id)on conflict(deal_id) do nothing;select * into c from kh_private.agency_conversations where deal_id=d.id;
 return kh_private.agency_remember(p_actor_id,p_agency_id,'start_conversation',p_payload,kh_private.agency_conversation_json(p_actor_id,null,c));end $$;

revoke all on function kh_private.agency_conversation_member_exit(),kh_private.agency_conversation_role(uuid,uuid,kh_private.agency_deals,uuid),kh_private.agency_conversation_deal(uuid,uuid,uuid),
 kh_private.agency_conversation_prepare(uuid,uuid,uuid),kh_private.agency_conversation_access(uuid,uuid,uuid),kh_private.agency_client_blocked(uuid,uuid),
 kh_private.agency_conversation_can_send(uuid,uuid,kh_private.agency_deals,uuid),kh_private.agency_buyer_name(kh_private.agency_deals),
 kh_private.agency_message_view(kh_private.agency_messages,kh_private.agency_deals,boolean) from public,anon,authenticated;
revoke all on function public.kh_set_agency_conversation_attendant(uuid,uuid,jsonb),public.kh_set_agency_client_block(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_set_agency_conversation_attendant(uuid,uuid,jsonb),public.kh_set_agency_client_block(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
