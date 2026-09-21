-- Participant-only messaging. Public-name/property snapshots contain no email or phone.
create table public.kh_conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  property_title text not null,
  property_location text not null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_seq integer not null default 0 check(last_seq>=0),
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check(buyer_id<>seller_id),
  unique(property_id,buyer_id,seller_id)
);
-- The immutable property UUID/snapshot deliberately survives deletion of the listing.
create index kh_conversations_buyer on public.kh_conversations(buyer_id,created_at desc);
create index kh_conversations_seller on public.kh_conversations(seller_id,created_at desc);
create table public.kh_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kh_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  client_message_id uuid not null,
  seq integer not null check(seq>0),
  body text not null check(char_length(body) between 1 and 2000 and body !~ '^[[:space:]]*$'),
  created_at timestamptz not null default now(),
  unique(sender_id,client_message_id),
  unique(conversation_id,seq)
);
create index kh_messages_sender_time on public.kh_messages(sender_id,created_at desc);
create table public.kh_conversation_reads (
  conversation_id uuid not null references public.kh_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_seq integer not null default 0 check(last_read_seq>=0),
  unread_count integer not null default 0 check(unread_count>=0),
  primary key(conversation_id,user_id)
);
create table public.kh_user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(blocker_id<>blocked_id),
  primary key(blocker_id,blocked_id)
);
create table public.kh_message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  property_title text not null,
  reporter_id uuid not null,
  reported_user_id uuid not null,
  client_report_id uuid not null,
  reason text not null check(reason in ('spam','fraud','harassment','other')),
  details text not null default '' check(char_length(details)<=1000),
  status text not null default 'open' check(status in ('open','reviewed')),
  context jsonb not null check(jsonb_typeof(context)='array' and jsonb_array_length(context)<=20),
  created_at timestamptz not null default now(),
  review_note text check(review_note is null or char_length(review_note)<=1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique(reporter_id,client_report_id)
);
-- Evidence intentionally has no cascading FK to mutable/deletable chat records.
create index kh_message_reports_queue on public.kh_message_reports(status,created_at desc,id);
create index kh_message_reports_rate on public.kh_message_reports(reporter_id,created_at desc);

alter table public.kh_conversations enable row level security;
alter table public.kh_messages enable row level security;
alter table public.kh_conversation_reads enable row level security;
alter table public.kh_user_blocks enable row level security;
alter table public.kh_message_reports enable row level security;
revoke all on public.kh_conversations,public.kh_messages,public.kh_conversation_reads,public.kh_user_blocks,public.kh_message_reports from public,anon,authenticated;
grant select on public.kh_conversations,public.kh_messages,public.kh_conversation_reads,public.kh_user_blocks,public.kh_message_reports to authenticated;
grant all on public.kh_conversations,public.kh_messages,public.kh_conversation_reads,public.kh_user_blocks,public.kh_message_reports to service_role;

create function kh_private.chat_actor(p_actor_id uuid) returns uuid
language plpgsql stable set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_actor_id is null or p_actor_id<>auth.uid() then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
  return p_actor_id;
end $$;
create function kh_private.chat_participant(p_conversation_id uuid,p_actor_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_actor_id is not null and exists(select 1 from public.kh_conversations c where c.id=p_conversation_id and p_actor_id in (c.buyer_id,c.seller_id));
$$;
revoke all on function kh_private.chat_actor(uuid),kh_private.chat_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function kh_private.chat_participant(uuid,uuid) to authenticated;
create policy kh_chat_conversation_read on public.kh_conversations for select to authenticated using((select auth.uid()) in (buyer_id,seller_id));
create policy kh_chat_message_read on public.kh_messages for select to authenticated using(kh_private.chat_participant(conversation_id,(select auth.uid())));
create policy kh_chat_read_cursor on public.kh_conversation_reads for select to authenticated using(user_id=(select auth.uid()));
create policy kh_chat_own_block on public.kh_user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy kh_chat_report_admin on public.kh_message_reports for select to authenticated using((select public.kh_is_admin()));

create function kh_private.chat_pair_lock(p_first uuid,p_second uuid) returns void
language sql volatile set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('kh:chat:pair:'||least(p_first,p_second)::text||':'||greatest(p_first,p_second)::text,0));
$$;
create function kh_private.chat_message_json(p_message public.kh_messages) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_message.id,'conversationId',p_message.conversation_id,'seq',p_message.seq,
    'clientMessageId',p_message.client_message_id,'senderId',p_message.sender_id,'body',p_message.body,'createdAt',p_message.created_at);
$$;
create function kh_private.chat_conversation_json(p_id uuid,p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'propertyId',c.property_id,'propertyTitle',c.property_title,'propertyLocation',c.property_location,
    'buyerId',c.buyer_id,'sellerId',c.seller_id,'otherUserId',other_profile.id,'otherName',other_profile.display_name,
    'lastMessage',c.last_message,'lastMessageAt',c.last_message_at,'lastSeq',c.last_seq,'unreadCount',coalesce(r.unread_count,0),
    'blockedByMe',b.mine,'blockedByOther',b.theirs,'propertyAvailable',p.available,'canSend',p.available and not b.mine and not b.theirs,'createdAt',c.created_at)
  from public.kh_conversations c
  join public.profiles other_profile on other_profile.id=case when c.buyer_id=p_actor then c.seller_id else c.buyer_id end
  left join public.kh_conversation_reads r on r.conversation_id=c.id and r.user_id=p_actor
  cross join lateral (select
    exists(select 1 from public.kh_user_blocks where blocker_id=p_actor and blocked_id=other_profile.id) as mine,
    exists(select 1 from public.kh_user_blocks where blocker_id=other_profile.id and blocked_id=p_actor) as theirs) b
  cross join lateral (select exists(select 1 from public.properties property where property.id=c.property_id and property.owner_id=c.seller_id and property.moderation='approved' and property.availability='active') as available) p
  where c.id=p_id and p_actor in (c.buyer_id,c.seller_id);
$$;
create function kh_private.chat_report_json(p_report public.kh_message_reports) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_report.id,'conversationId',p_report.conversation_id,'propertyTitle',p_report.property_title,
    'reporterId',p_report.reporter_id,'reportedUserId',p_report.reported_user_id,'reason',p_report.reason,'details',p_report.details,
    'status',p_report.status,'createdAt',p_report.created_at,'reviewNote',p_report.review_note,'context',p_report.context);
$$;
revoke all on function kh_private.chat_pair_lock(uuid,uuid),kh_private.chat_message_json(public.kh_messages),kh_private.chat_conversation_json(uuid,uuid),kh_private.chat_report_json(public.kh_message_reports) from public,anon,authenticated;

create function public.kh_start_conversation(p_property_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_property public.properties%rowtype; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||v_actor::text,0));
  select * into v_property from public.properties where id=p_property_id;
  if not found then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  if v_property.owner_id=v_actor then raise exception 'KH_CHAT_SELF_CONTACT'; end if;
  perform kh_private.chat_pair_lock(v_actor,v_property.owner_id);
  select * into v_property from public.properties where id=p_property_id for share;
  if not found or v_property.moderation<>'approved' or v_property.availability<>'active' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  select id into v_id from public.kh_conversations where property_id=p_property_id and buyer_id=v_actor and seller_id=v_property.owner_id;
  if found then return kh_private.chat_conversation_json(v_id,v_actor); end if;
  if exists(select 1 from public.kh_user_blocks where (blocker_id=v_actor and blocked_id=v_property.owner_id) or (blocked_id=v_actor and blocker_id=v_property.owner_id)) then raise exception 'KH_CHAT_BLOCKED'; end if;
  if (select count(*) from public.kh_conversations where buyer_id=v_actor and created_at>=clock_timestamp()-interval '24 hours')>=20 then raise exception 'KH_CHAT_CONVERSATION_LIMIT'; end if;
  insert into public.kh_conversations(property_id,property_title,property_location,buyer_id,seller_id)
  values(v_property.id,v_property.title,concat_ws(', ',v_property.location,v_property.province),v_actor,v_property.owner_id) returning id into v_id;
  insert into public.kh_conversation_reads(conversation_id,user_id) values(v_id,v_actor),(v_id,v_property.owner_id);
  return kh_private.chat_conversation_json(v_id,v_actor);
end $$;

create function public.kh_list_conversations(p_actor_id uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_CHAT_INVALID_PAGE'; end if;
  select coalesce(jsonb_agg(kh_private.chat_conversation_json(id,v_actor) order by activity desc,id desc),'[]'::jsonb) into v_result from (
    select id,coalesce(last_message_at,created_at) as activity from public.kh_conversations
    where buyer_id=v_actor or (seller_id=v_actor and last_seq>0)
    order by coalesce(last_message_at,created_at) desc,id desc offset p_offset limit p_limit
  ) page;
  return v_result;
end $$;
create function public.kh_get_conversation(p_conversation_id uuid,p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  v_result:=kh_private.chat_conversation_json(p_conversation_id,v_actor);
  if v_result is null then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  return v_result;
end $$;
create function public.kh_list_messages(p_conversation_id uuid,p_actor_id uuid,p_before_seq integer default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  if not kh_private.chat_participant(p_conversation_id,v_actor) then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  if p_limit is null or p_limit not between 1 and 50 or (p_before_seq is not null and p_before_seq<1) then raise exception 'KH_CHAT_INVALID_PAGE'; end if;
  select coalesce(jsonb_agg(kh_private.chat_message_json(page) order by page.seq),'[]'::jsonb) into v_result from (
    select m.* from public.kh_messages m where conversation_id=p_conversation_id and (p_before_seq is null or seq<p_before_seq) order by seq desc limit p_limit
  ) page;
  return v_result;
end $$;
create function public.kh_find_sent_messages(p_client_message_ids uuid[],p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  if p_client_message_ids is null or cardinality(p_client_message_ids)>50 or array_position(p_client_message_ids,null) is not null then raise exception 'KH_CHAT_INVALID_MESSAGE_IDS'; end if;
  select coalesce(jsonb_agg(kh_private.chat_message_json(m) order by created_at,id),'[]'::jsonb) into v_result
    from public.kh_messages m where sender_id=v_actor and client_message_id=any(p_client_message_ids);
  return v_result;
end $$;

create function public.kh_send_message(p_conversation_id uuid,p_client_message_id uuid,p_body text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_conversation public.kh_conversations%rowtype;
  v_existing public.kh_messages%rowtype; v_saved public.kh_messages%rowtype; v_body text:=btrim(p_body); v_other uuid; v_now timestamptz;
begin
  if p_client_message_id is null or v_body is null or char_length(v_body) not between 1 and 2000 or v_body ~ '^[[:space:]]*$' then raise exception 'KH_CHAT_INVALID_MESSAGE'; end if;
  select * into v_conversation from public.kh_conversations where id=p_conversation_id and v_actor in (buyer_id,seller_id);
  if not found then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  v_other:=case when v_actor=v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end;
  perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||v_actor::text,0));
  perform kh_private.chat_pair_lock(v_actor,v_other);
  select * into v_conversation from public.kh_conversations where id=p_conversation_id and v_actor in (buyer_id,seller_id) for update;
  if not found then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  select * into v_existing from public.kh_messages where sender_id=v_actor and client_message_id=p_client_message_id;
  if found then
    if v_existing.conversation_id<>p_conversation_id or v_existing.body<>v_body then raise exception 'KH_CHAT_MESSAGE_CONFLICT'; end if;
    return kh_private.chat_message_json(v_existing);
  end if;
  if exists(select 1 from public.kh_user_blocks where (blocker_id=v_actor and blocked_id=v_other) or (blocker_id=v_other and blocked_id=v_actor)) then raise exception 'KH_CHAT_BLOCKED'; end if;
  -- Freeze new messages for unavailable listings while keeping previous ACKs and history.
  perform 1 from public.properties where id=v_conversation.property_id and owner_id=v_conversation.seller_id and moderation='approved' and availability='active' for share;
  if not found then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  v_now:=clock_timestamp();
  if (select count(*) from public.kh_messages where sender_id=v_actor and created_at>=v_now-interval '1 minute')>=20
    or (select count(*) from public.kh_messages where sender_id=v_actor and created_at>=v_now-interval '1 hour')>=300 then raise exception 'KH_CHAT_RATE_LIMIT'; end if;
  insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at)
    values(p_conversation_id,v_actor,p_client_message_id,v_conversation.last_seq+1,v_body,v_now) returning * into v_saved;
  update public.kh_conversations set last_seq=v_saved.seq,last_message=v_saved.body,last_message_at=v_saved.created_at where id=p_conversation_id;
  update public.kh_conversation_reads set unread_count=unread_count+1 where conversation_id=p_conversation_id and user_id=v_other;
  return kh_private.chat_message_json(v_saved);
end $$;

create function public.kh_mark_conversation_read(p_conversation_id uuid,p_last_seq integer,p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_last integer; v_cursor integer;
begin
  if p_last_seq is null or p_last_seq<0 then raise exception 'KH_CHAT_INVALID_READ'; end if;
  select last_seq into v_last from public.kh_conversations where id=p_conversation_id and v_actor in (buyer_id,seller_id) for update;
  if not found then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  select greatest(last_read_seq,least(p_last_seq,v_last)) into v_cursor from public.kh_conversation_reads where conversation_id=p_conversation_id and user_id=v_actor;
  update public.kh_conversation_reads set last_read_seq=v_cursor,
    unread_count=(select count(*) from public.kh_messages where conversation_id=p_conversation_id and sender_id<>v_actor and seq>v_cursor)
    where conversation_id=p_conversation_id and user_id=v_actor;
end $$;
create function public.kh_set_user_block(p_other_user_id uuid,p_blocked boolean,p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  if p_other_user_id is null or p_other_user_id=v_actor or p_blocked is null then raise exception 'KH_CHAT_INVALID_BLOCK'; end if;
  perform kh_private.chat_pair_lock(v_actor,p_other_user_id);
  if not exists(select 1 from public.kh_conversations where (buyer_id=v_actor and seller_id=p_other_user_id) or (buyer_id=p_other_user_id and seller_id=v_actor)) then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  if p_blocked then
    insert into public.kh_user_blocks(blocker_id,blocked_id) values(v_actor,p_other_user_id) on conflict do nothing;
  else
    delete from public.kh_user_blocks where blocker_id=v_actor and blocked_id=p_other_user_id;
  end if;
end $$;

create function public.kh_report_conversation(p_conversation_id uuid,p_client_report_id uuid,p_reason text,p_details text,p_actor_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_conversation public.kh_conversations%rowtype;
  v_existing public.kh_message_reports%rowtype; v_details text:=btrim(coalesce(p_details,'')); v_context jsonb; v_id uuid;
begin
  if p_client_report_id is null or p_reason is null or p_reason not in ('spam','fraud','harassment','other') or char_length(v_details)>1000 then raise exception 'KH_CHAT_INVALID_REPORT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||v_actor::text,0));
  select * into v_conversation from public.kh_conversations where id=p_conversation_id and v_actor in (buyer_id,seller_id) for update;
  if not found then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  select * into v_existing from public.kh_message_reports where reporter_id=v_actor and client_report_id=p_client_report_id;
  if found then
    if v_existing.conversation_id<>p_conversation_id or v_existing.reason<>p_reason or v_existing.details<>v_details then raise exception 'KH_CHAT_REPORT_CONFLICT'; end if;
    return v_existing.id;
  end if;
  if (select count(*) from public.kh_message_reports where reporter_id=v_actor and created_at>=clock_timestamp()-interval '24 hours')>=10 then raise exception 'KH_CHAT_REPORT_LIMIT'; end if;
  select coalesce(jsonb_agg(kh_private.chat_message_json(page) order by seq),'[]'::jsonb) into v_context from (
    select m.* from public.kh_messages m where conversation_id=p_conversation_id order by seq desc limit 20
  ) page;
  insert into public.kh_message_reports(conversation_id,property_title,reporter_id,reported_user_id,client_report_id,reason,details,context)
    values(p_conversation_id,v_conversation.property_title,v_actor,case when v_actor=v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end,p_client_report_id,p_reason,v_details,v_context)
    returning id into v_id;
  return v_id;
end $$;
create function public.kh_list_message_reports(p_actor_id uuid,p_status text default 'open',p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_result jsonb;
begin
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('open','reviewed') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_CHAT_INVALID_PAGE'; end if;
  select coalesce(jsonb_agg(kh_private.chat_report_json(page) order by page.created_at desc,page.id desc),'[]'::jsonb) into v_result from (
    select r.* from public.kh_message_reports r where status=p_status order by created_at desc,id desc offset p_offset limit p_limit
  ) page;
  return v_result;
end $$;
create function public.kh_review_message_report(p_report_id uuid,p_note text,p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_report public.kh_message_reports%rowtype; v_note text:=btrim(coalesce(p_note,''));
begin
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if char_length(v_note)>1000 then raise exception 'KH_CHAT_INVALID_REPORT'; end if;
  select * into v_report from public.kh_message_reports where id=p_report_id for update;
  if not found then raise exception 'KH_CHAT_REPORT_NOT_FOUND'; end if;
  if v_actor in (v_report.reporter_id,v_report.reported_user_id) then raise exception 'KH_CHAT_CANNOT_REVIEW_OWN_REPORT'; end if;
  if v_report.status='reviewed' then
    if v_report.review_note=v_note then return; end if;
    raise exception 'KH_CHAT_REPORT_ALREADY_REVIEWED';
  end if;
  update public.kh_message_reports set status='reviewed',review_note=v_note,reviewed_by=v_actor,reviewed_at=clock_timestamp() where id=p_report_id;
end $$;

revoke all on function public.kh_start_conversation(uuid,uuid),public.kh_list_conversations(uuid,integer,integer),public.kh_get_conversation(uuid,uuid),
  public.kh_list_messages(uuid,uuid,integer,integer),public.kh_send_message(uuid,uuid,text,uuid),public.kh_find_sent_messages(uuid[],uuid),
  public.kh_mark_conversation_read(uuid,integer,uuid),public.kh_set_user_block(uuid,boolean,uuid),public.kh_report_conversation(uuid,uuid,text,text,uuid),
  public.kh_list_message_reports(uuid,text,integer,integer),public.kh_review_message_report(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.kh_start_conversation(uuid,uuid),public.kh_list_conversations(uuid,integer,integer),public.kh_get_conversation(uuid,uuid),
  public.kh_list_messages(uuid,uuid,integer,integer),public.kh_send_message(uuid,uuid,text,uuid),public.kh_find_sent_messages(uuid[],uuid),
  public.kh_mark_conversation_read(uuid,integer,uuid),public.kh_set_user_block(uuid,boolean,uuid),public.kh_report_conversation(uuid,uuid,text,text,uuid),
  public.kh_list_message_reports(uuid,text,integer,integer),public.kh_review_message_report(uuid,text,uuid) to authenticated;
notify pgrst, 'reload schema';
