-- One internal chat per agency: every active member reads it and writes in it.
-- Reading needs only membership, so history stays readable while the module or the agency is paused.
-- Writing needs an approved agency and the module on (agency_actor).
create table kh_private.agency_team_chats(
 agency_id uuid primary key references kh_private.agencies(id),
 last_seq integer not null default 0 check(last_seq>=0)
);
create table kh_private.agency_team_messages(
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null references kh_private.agency_team_chats(agency_id),
 seq integer not null check(seq>0),client_message_id uuid not null,author_id uuid not null,
 sender_id uuid references auth.users(id) on delete set null,
 body text not null check(char_length(body) between 1 and 2000),created_at timestamptz not null default clock_timestamp(),
 unique(agency_id,seq),unique(author_id,client_message_id)
);
create index agency_team_messages_rate on kh_private.agency_team_messages(author_id,created_at);
create table kh_private.agency_team_reads(
 agency_id uuid not null references kh_private.agency_team_chats(agency_id),
 user_id uuid not null references auth.users(id) on delete cascade,
 last_seq integer not null default 0 check(last_seq>=0),primary key(agency_id,user_id)
);
do $$declare t text;begin
 foreach t in array array['agency_team_chats','agency_team_messages','agency_team_reads'] loop
  execute format('alter table kh_private.%I enable row level security',t);
  execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
  execute format('grant all on kh_private.%I to service_role',t);
 end loop;
end $$;

-- The shared limit (20 a minute, 300 an hour) now also counts team messages.
create or replace function kh_private.agency_shared_chat_rate() returns trigger language plpgsql security definer set search_path='' as $$
 declare actor uuid;stamp timestamptz:=clock_timestamp();begin
 actor:=coalesce((to_jsonb(new)->>'author_id')::uuid,(to_jsonb(new)->>'sender_id')::uuid,(to_jsonb(new)->>'reporter_id')::uuid);
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||actor::text,0));
 if tg_table_name in('kh_messages','agency_messages','agency_team_messages') then
  if (select count(*) from(select created_at from public.kh_messages where sender_id=actor union all select created_at from kh_private.agency_messages where author_id=actor union all select created_at from kh_private.agency_team_messages where author_id=actor)x where created_at>=stamp-interval '1 minute')>=20 or
   (select count(*) from(select created_at from public.kh_messages where sender_id=actor union all select created_at from kh_private.agency_messages where author_id=actor union all select created_at from kh_private.agency_team_messages where author_id=actor)x where created_at>=stamp-interval '1 hour')>=300 then raise exception 'KH_CHAT_RATE_LIMIT';end if;
 else
  if (select count(*) from(select created_at from public.kh_message_reports where reporter_id=actor union all select created_at from kh_private.agency_message_reports where reporter_id=actor)x where created_at>=stamp-interval '24 hours')>=10 then raise exception 'KH_CHAT_REPORT_LIMIT';end if;
 end if;return new;
end $$;
create trigger kh_agency_shared_message_rate before insert on kh_private.agency_team_messages for each row execute function kh_private.agency_shared_chat_rate();

create function kh_private.agency_team_message_json(m kh_private.agency_team_messages) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'agencyId',m.agency_id,'seq',m.seq,'clientMessageId',m.client_message_id,'senderId',m.sender_id,
 'senderName',case when m.sender_id is null then 'Cuenta eliminada' else coalesce((select nullif(btrim(p.display_name),'') from public.profiles p where p.id=m.sender_id),'Persona del equipo') end,
 'senderRole',(select r.role from kh_private.agency_memberships r where r.agency_id=m.agency_id and r.user_id=m.sender_id and r.state='active'),
 'body',m.body,'createdAt',m.created_at)
$$;
create function kh_private.agency_team_can_send(actor uuid,agency uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from kh_private.agency_settings where singleton),false)
 and exists(select 1 from kh_private.agencies where id=agency and state='approved')
 and kh_private.agency_contact_member(agency,actor)
$$;

create function public.kh_get_agency_team_chat(p_actor_id uuid,p_agency_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_chat kh_private.agency_team_chats;v_last kh_private.agency_team_messages;v_read integer;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 select * into v_chat from kh_private.agency_team_chats where agency_id=p_agency_id;
 select * into v_last from kh_private.agency_team_messages where agency_id=p_agency_id and seq=v_chat.last_seq;
 -- Without a read row, what was written before joining does not count as unread.
 v_read:=coalesce((select last_seq from kh_private.agency_team_reads where agency_id=p_agency_id and user_id=p_actor_id),
  (select max(t.seq) from kh_private.agency_team_messages t join kh_private.agency_memberships m on m.agency_id=t.agency_id and m.user_id=p_actor_id where t.agency_id=p_agency_id and t.created_at<m.created_at),0);
 return jsonb_build_object('agencyId',p_agency_id,'agencyName',(select trade_name from kh_private.agencies where id=p_agency_id),
  'lastSeq',coalesce(v_chat.last_seq,0),'unreadCount',greatest(0,coalesce(v_chat.last_seq,0)-v_read),
  'canSend',kh_private.agency_team_can_send(p_actor_id,p_agency_id),
  'memberCount',(select count(*) from kh_private.agency_memberships where agency_id=p_agency_id and state='active'),
  'lastMessage',case when v_last.id is null then null else jsonb_build_object('body',v_last.body,'senderName',kh_private.agency_team_message_json(v_last)->>'senderName','createdAt',v_last.created_at) end);
end $$;
create function public.kh_list_agency_team_messages(p_actor_id uuid,p_agency_id uuid,p_before_seq integer default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 if p_limit is null or p_limit not between 1 and 50 or p_before_seq<1 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_team_message_json(x) order by x.seq desc),'[]') into v_items from(select * from kh_private.agency_team_messages where agency_id=p_agency_id and(p_before_seq is null or seq<p_before_seq) order by seq desc limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(v_items)>p_limit then v_items-p_limit else v_items end,'hasMore',jsonb_array_length(v_items)>p_limit);
end $$;
-- Locks in the order agency_flow_locks uses: module, account, chat actor, agency, then the chat row.
create function public.kh_send_agency_team_message(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_body text:=btrim(p_payload->>'body');v_client uuid;v_chat kh_private.agency_team_chats;v_message kh_private.agency_team_messages;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_lock_accounts(p_actor_id,null);
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||p_actor_id::text,0));
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'manager');
 begin v_client:=(p_payload->>'clientMessageId')::uuid;exception when others then raise exception 'KH_CHAT_INVALID_MESSAGE';end;
 if v_client is null or v_body is null or char_length(v_body) not between 1 and 2000 or v_body~'^[[:space:]]*$' then raise exception 'KH_CHAT_INVALID_MESSAGE';end if;
 if not kh_private.agency_contact_member(p_agency_id,p_actor_id) then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED' using errcode='42501';end if;
 select * into v_message from kh_private.agency_team_messages where author_id=p_actor_id and client_message_id=v_client;
 if v_message.id is not null then
  if v_message.agency_id<>p_agency_id or v_message.body<>v_body then raise exception 'KH_CHAT_MESSAGE_CONFLICT';end if;
  return kh_private.agency_team_message_json(v_message);
 end if;
 insert into kh_private.agency_team_chats(agency_id) values(p_agency_id) on conflict do nothing;
 select * into v_chat from kh_private.agency_team_chats where agency_id=p_agency_id for update;
 insert into kh_private.agency_team_messages(agency_id,seq,client_message_id,author_id,sender_id,body)
  values(p_agency_id,v_chat.last_seq+1,v_client,p_actor_id,p_actor_id,v_body) returning * into v_message;
 update kh_private.agency_team_chats set last_seq=v_message.seq where agency_id=p_agency_id;
 insert into kh_private.agency_team_reads(agency_id,user_id,last_seq) values(p_agency_id,p_actor_id,v_message.seq)
  on conflict(agency_id,user_id) do update set last_seq=greatest(kh_private.agency_team_reads.last_seq,excluded.last_seq);
 return kh_private.agency_team_message_json(v_message);
end $$;
create function public.kh_read_agency_team_chat(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_seq integer;v_last integer;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 begin v_seq:=(p_payload->>'lastSeq')::integer;exception when others then raise exception 'KH_CHAT_INVALID_CURSOR';end;
 select last_seq into v_last from kh_private.agency_team_chats where agency_id=p_agency_id;
 if v_seq is null or v_seq<0 or v_seq>coalesce(v_last,0) then raise exception 'KH_CHAT_INVALID_CURSOR';end if;
 if v_seq=0 then return;end if;
 insert into kh_private.agency_team_reads(agency_id,user_id,last_seq) values(p_agency_id,p_actor_id,v_seq)
  on conflict(agency_id,user_id) do update set last_seq=greatest(kh_private.agency_team_reads.last_seq,excluded.last_seq);
end $$;

revoke all on function kh_private.agency_team_message_json(kh_private.agency_team_messages),kh_private.agency_team_can_send(uuid,uuid) from public,anon,authenticated;
revoke all on function public.kh_get_agency_team_chat(uuid,uuid),public.kh_list_agency_team_messages(uuid,uuid,integer,integer),public.kh_send_agency_team_message(uuid,uuid,jsonb),public.kh_read_agency_team_chat(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_get_agency_team_chat(uuid,uuid),public.kh_list_agency_team_messages(uuid,uuid,integer,integer),public.kh_send_agency_team_message(uuid,uuid,jsonb),public.kh_read_agency_team_chat(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
