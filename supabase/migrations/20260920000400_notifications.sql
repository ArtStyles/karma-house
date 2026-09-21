-- In-app only. No backfill, worker, push token, or external delivery.
alter table public.kh_messages add column negotiation_event_id uuid
  references kh_private.negotiation_events(id) on delete set null;
create unique index kh_message_negotiation_event on public.kh_messages(negotiation_event_id)
  where negotiation_event_id is not null;

create sequence kh_private.notification_seq as bigint;
create table kh_private.notifications (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null unique check(seq>0),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.kh_conversations(id) on delete cascade,
  message_id uuid not null unique references public.kh_messages(id) on delete cascade,
  negotiation_id uuid references public.kh_negotiations(id) on delete set null,
  category text not null check(category in ('message','visit','offer')),
  actor_name text not null,
  property_title text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  check(recipient_id<>actor_id),
  check(category<>'message' or negotiation_id is null)
);
alter sequence kh_private.notification_seq owned by kh_private.notifications.seq;
create index kh_notifications_recipient_history on kh_private.notifications(recipient_id,seq desc);
create index kh_notifications_recipient_unread on kh_private.notifications(recipient_id,seq desc) where read_at is null;
create table kh_private.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  visits boolean not null default true,
  offers boolean not null default true,
  version integer not null default 0 check(version>=0)
);
alter table kh_private.notifications enable row level security;
alter table kh_private.notification_preferences enable row level security;
revoke all on kh_private.notifications,kh_private.notification_preferences from public,anon,authenticated;
revoke all on sequence kh_private.notification_seq from public,anon,authenticated;

-- Dedicated namespace: never lock another user's chat-actor key while holding a pair lock.
create function kh_private.notification_recipient_lock(p_actor uuid) returns void
language sql set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('kh:notification:recipient:'||p_actor::text,0));
$$;
create function kh_private.notification_visible(p_row kh_private.notifications,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_row.recipient_id=p_actor
    and exists(select 1 from public.kh_conversations c where c.id=p_row.conversation_id
      and p_actor in(c.buyer_id,c.seller_id) and p_row.actor_id in(c.buyer_id,c.seller_id))
    and not exists(select 1 from public.kh_user_blocks b
      where (b.blocker_id=p_actor and b.blocked_id=p_row.actor_id)
        or (b.blocker_id=p_row.actor_id and b.blocked_id=p_actor));
$$;
create function kh_private.notification_json(p_row kh_private.notifications) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_row.id,'seq',p_row.seq::text,'recipientId',p_row.recipient_id,
    'actorId',p_row.actor_id,'actorName',p_row.actor_name,'conversationId',p_row.conversation_id,
    'messageId',p_row.message_id,'negotiationId',p_row.negotiation_id,'category',p_row.category,
    'propertyTitle',p_row.property_title,'title',p_row.title,'body',p_row.body,
    'createdAt',p_row.created_at,'readAt',p_row.read_at);
$$;
create function kh_private.notification_summary(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('unreadCount',count(*) filter(where n.read_at is null),
    'readThrough',coalesce(max(n.seq),0)::text)
  from kh_private.notifications n where n.recipient_id=p_actor and kh_private.notification_visible(n,p_actor);
$$;
create function kh_private.notification_cursor(p_value text,p_allow_zero boolean) returns bigint
language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,18})$'
    or (not p_allow_zero and p_value='0') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  if p_value::numeric>9223372036854775807 then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  return p_value::bigint;
end $$;
create function kh_private.notification_preferences_json(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('messages',p.messages,'visits',p.visits,'offers',p.offers,'version',p.version)
    from kh_private.notification_preferences p where p.user_id=p_actor),
    '{"messages":true,"visits":true,"offers":true,"version":0}'::jsonb);
$$;

create function kh_private.notification_from_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_conversation public.kh_conversations%rowtype;
  v_event kh_private.negotiation_events%rowtype;
  v_negotiation public.kh_negotiations%rowtype;
  v_recipient uuid;
  v_category text:='message';
  v_title text:='Nuevo mensaje';
  v_body text:='Tienes un nuevo mensaje en esta conversación.';
  v_preferences jsonb;
  v_actor_name text;
begin
  select * into strict v_conversation from public.kh_conversations where id=new.conversation_id;
  if new.sender_id not in(v_conversation.buyer_id,v_conversation.seller_id) then raise exception 'KH_CHAT_NOT_FOUND'; end if;
  v_recipient:=case when new.sender_id=v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end;
  if new.negotiation_event_id is not null then
    select * into v_event from kh_private.negotiation_events where id=new.negotiation_event_id;
    if not found or v_event.actor_id is distinct from new.sender_id or v_event.action not in('created','accepted','declined','cancelled') then
      raise exception 'KH_NOTIFICATION_INVALID_SOURCE';
    end if;
    select * into v_negotiation from public.kh_negotiations where id=v_event.negotiation_id;
    if not found or v_negotiation.conversation_id<>new.conversation_id then raise exception 'KH_NOTIFICATION_INVALID_SOURCE'; end if;
    v_category:=v_negotiation.kind;
    v_title:=case v_category when 'visit' then 'Actualización de visita' else 'Actualización de oferta' end;
    v_body:=case v_event.action
      when 'created' then case when v_category='visit' then 'Tienes una propuesta de visita para revisar.' else 'Tienes una oferta para revisar.' end
      when 'accepted' then case when v_category='visit' then 'La visita fue aceptada.' else 'La oferta fue aceptada.' end
      when 'declined' then case when v_category='visit' then 'La visita fue rechazada.' else 'La oferta fue rechazada.' end
      else case when v_category='visit' then 'La visita fue cancelada.' else 'La oferta fue cancelada.' end end;
  end if;
  if exists(select 1 from public.kh_user_blocks b
    where (b.blocker_id=new.sender_id and b.blocked_id=v_recipient)
      or (b.blocker_id=v_recipient and b.blocked_id=new.sender_id)) then return new; end if;
  -- Serialize before allocating seq, so a delayed commit cannot appear below a published cutoff.
  -- Preferences use this same lock: a confirmed setting governs subsequent notices.
  perform kh_private.notification_recipient_lock(v_recipient);
  v_preferences:=kh_private.notification_preferences_json(v_recipient);
  if not (v_preferences->>case v_category when 'message' then 'messages' when 'visit' then 'visits' else 'offers' end)::boolean then return new; end if;
  select display_name into strict v_actor_name from public.profiles where id=new.sender_id;
  insert into kh_private.notifications(seq,recipient_id,actor_id,conversation_id,message_id,negotiation_id,
    category,actor_name,property_title,title,body)
  values(nextval('kh_private.notification_seq'::regclass),v_recipient,new.sender_id,new.conversation_id,new.id,
    v_negotiation.id,v_category,v_actor_name,v_conversation.property_title,v_title,v_body);
  return new;
end $$;
create trigger kh_message_notification after insert on public.kh_messages
  for each row execute function kh_private.notification_from_message();

create function public.kh_notification_summary(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select kh_private.notification_summary(kh_private.chat_actor(p_actor_id));
$$;
create function public.kh_list_notifications(p_actor_id uuid,p_before_seq text default null,
  p_unread_only boolean default false,p_category text default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=kh_private.chat_actor(p_actor_id);
  v_before bigint;
  v_rows jsonb;
  v_more boolean;
  v_summary jsonb;
begin
  if p_before_seq is not null then v_before:=kh_private.notification_cursor(p_before_seq,false); end if;
  if p_unread_only is null or p_limit is null or p_limit not between 1 and 30
    or p_category is not null and p_category not in('message','visit','offer') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  with page as (
    select n.* from kh_private.notifications n where n.recipient_id=v_actor
      and kh_private.notification_visible(n,v_actor) and (v_before is null or n.seq<v_before)
      and (not p_unread_only or n.read_at is null) and (p_category is null or n.category=p_category)
    order by n.seq desc limit p_limit+1
  ), numbered as (select p.*,row_number() over(order by p.seq desc) as position from page p)
  select coalesce(jsonb_agg(kh_private.notification_json(n) order by n.seq desc) filter(where x.position<=p_limit),'[]'::jsonb),count(*)>p_limit
    into v_rows,v_more from numbered x join kh_private.notifications n on n.id=x.id;
  v_summary:=kh_private.notification_summary(v_actor);
  return v_summary||jsonb_build_object('items',v_rows,'nextCursor',case when v_more then v_rows->(p_limit-1)->>'seq' else null end);
end $$;
create function public.kh_read_notification(p_actor_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    where n.id=p_id and n.recipient_id=v_actor and kh_private.notification_visible(n,v_actor);
  if not found then raise exception 'KH_NOTIFICATION_NOT_FOUND'; end if;
  return kh_private.notification_summary(v_actor)-'readThrough';
end $$;
create function public.kh_read_notifications_through(p_actor_id uuid,p_through_seq text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_through bigint:=kh_private.notification_cursor(p_through_seq,true);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=clock_timestamp()
    where n.recipient_id=v_actor and n.seq<=v_through and n.read_at is null and kh_private.notification_visible(n,v_actor);
  return kh_private.notification_summary(v_actor)-'readThrough';
end $$;
create function public.kh_get_notification_preferences(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select kh_private.notification_preferences_json(kh_private.chat_actor(p_actor_id));
$$;
create function public.kh_save_notification_preferences(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_current jsonb; v_expected integer;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'messages') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'visits') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'offers') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number'
    or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
    or p_payload-ARRAY['messages','visits','offers','expectedVersion']<>'{}'::jsonb then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  v_expected:=(p_payload->>'expectedVersion')::integer;
  perform kh_private.notification_recipient_lock(v_actor);
  v_current:=kh_private.notification_preferences_json(v_actor);
  if v_current-'version'=p_payload-'expectedVersion' then return v_current; end if;
  if (v_current->>'version')::integer<>v_expected then raise exception 'KH_NOTIFICATION_PREFERENCES_CONFLICT'; end if;
  insert into kh_private.notification_preferences(user_id,messages,visits,offers,version)
  values(v_actor,(p_payload->>'messages')::boolean,(p_payload->>'visits')::boolean,(p_payload->>'offers')::boolean,v_expected+1)
  on conflict(user_id) do update set messages=excluded.messages,visits=excluded.visits,offers=excluded.offers,version=excluded.version;
  return kh_private.notification_preferences_json(v_actor);
end $$;

revoke all on function kh_private.notification_recipient_lock(uuid),
  kh_private.notification_visible(kh_private.notifications,uuid),kh_private.notification_json(kh_private.notifications),
  kh_private.notification_summary(uuid),kh_private.notification_cursor(text,boolean),
  kh_private.notification_preferences_json(uuid),kh_private.notification_from_message() from public,anon,authenticated;
revoke all on function public.kh_notification_summary(uuid),public.kh_list_notifications(uuid,text,boolean,text,integer),
  public.kh_read_notification(uuid,uuid),public.kh_read_notifications_through(uuid,text),
  public.kh_get_notification_preferences(uuid),public.kh_save_notification_preferences(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_notification_summary(uuid),public.kh_list_notifications(uuid,text,boolean,text,integer),
  public.kh_read_notification(uuid,uuid),public.kh_read_notifications_through(uuid,text),
  public.kh_get_notification_preferences(uuid),public.kh_save_notification_preferences(uuid,jsonb) to authenticated;

-- Preserve message API, locks, rate limits and receipts; only internal callers supply a structured origin.
create function kh_private.chat_store_message(p_conversation_id uuid,p_client_message_id uuid,p_body text,p_actor_id uuid,p_negotiation_event_id uuid) returns jsonb
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
    if v_existing.conversation_id<>p_conversation_id or v_existing.body<>v_body or v_existing.negotiation_event_id is distinct from p_negotiation_event_id then raise exception 'KH_CHAT_MESSAGE_CONFLICT'; end if;
    return kh_private.chat_message_json(v_existing);
  end if;
  if exists(select 1 from public.kh_user_blocks where (blocker_id=v_actor and blocked_id=v_other) or (blocker_id=v_other and blocked_id=v_actor)) then raise exception 'KH_CHAT_BLOCKED'; end if;
  -- Freeze new messages for unavailable listings while keeping previous ACKs and history.
  perform 1 from public.properties where id=v_conversation.property_id and owner_id=v_conversation.seller_id and moderation='approved' and availability='active' for share;
  if not found then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  v_now:=clock_timestamp();
  if (select count(*) from public.kh_messages where sender_id=v_actor and created_at>=v_now-interval '1 minute')>=20
    or (select count(*) from public.kh_messages where sender_id=v_actor and created_at>=v_now-interval '1 hour')>=300 then raise exception 'KH_CHAT_RATE_LIMIT'; end if;
  insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at,negotiation_event_id)
    values(p_conversation_id,v_actor,p_client_message_id,v_conversation.last_seq+1,v_body,v_now,p_negotiation_event_id) returning * into v_saved;
  update public.kh_conversations set last_seq=v_saved.seq,last_message=v_saved.body,last_message_at=v_saved.created_at where id=p_conversation_id;
  update public.kh_conversation_reads set unread_count=unread_count+1 where conversation_id=p_conversation_id and user_id=v_other;
  return kh_private.chat_message_json(v_saved);
end $$;
create or replace function public.kh_send_message(p_conversation_id uuid,p_client_message_id uuid,p_body text,p_actor_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select kh_private.chat_store_message(p_conversation_id,p_client_message_id,p_body,p_actor_id,null);
$$;
revoke all on function kh_private.chat_store_message(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
create or replace function public.kh_create_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_conversation public.kh_conversations%rowtype;
  v_request uuid; v_conv uuid; v_kind text; v_note text; v_amount numeric; v_at timestamptz; v_date text; v_time text;
  v_parent_id uuid; v_expected integer; v_parent public.kh_negotiations%rowtype; v_saved public.kh_negotiations%rowtype;
  v_expired public.kh_negotiations%rowtype; v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb;
  v_now timestamptz; v_summary text; v_event_id uuid; v_property public.properties%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'note') is distinct from 'string'
    or coalesce(p_payload->>'conversationId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'clientRequestId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  v_request:=(p_payload->>'clientRequestId')::uuid; v_conv:=(p_payload->>'conversationId')::uuid;
  v_kind:=p_payload->>'kind'; v_note:=btrim(p_payload->>'note');
  if v_kind is null or v_kind not in ('offer','visit') or char_length(v_note)>500 then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  if p_payload ? 'replacesId' then
    if coalesce(p_payload->>'replacesId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(p_payload->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
    v_parent_id:=(p_payload->>'replacesId')::uuid; v_expected:=(p_payload->>'expectedVersion')::integer;
  elsif p_payload ? 'expectedVersion' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  if v_kind='offer' then
    if coalesce(p_payload->>'amountUsd','') !~ '^[0-9]+([.,][0-9]{1,2})?$' then raise exception 'KH_NEG_INVALID_AMOUNT'; end if;
    v_amount:=replace(p_payload->>'amountUsd',',','.')::numeric;
    if not(v_amount>0 and v_amount<=1000000000) then raise exception 'KH_NEG_INVALID_AMOUNT'; end if;
  else
    v_date:=p_payload->>'visitDate'; v_time:=p_payload->>'visitTime';
    v_at:=kh_private.negotiation_visit(v_date,v_time);
  end if;
  v_canonical:=jsonb_build_object('operation','create','conversationId',v_conv,'kind',v_kind,'note',v_note,'amountUsd',v_amount,
    'visitDate',v_date,'visitTime',v_time,'replacesId',v_parent_id,'expectedVersion',v_expected);
  v_conversation:=kh_private.negotiation_lock(v_conv,v_actor);
  select * into v_receipt from kh_private.negotiation_requests where actor_id=v_actor and client_request_id=v_request;
  if found then
    if v_receipt.payload<>v_canonical then raise exception 'KH_NEG_REQUEST_CONFLICT'; end if;
    return v_receipt.result;
  end if;
  if exists(select 1 from public.kh_user_blocks where (blocker_id=v_conversation.buyer_id and blocked_id=v_conversation.seller_id) or (blocker_id=v_conversation.seller_id and blocked_id=v_conversation.buyer_id)) then raise exception 'KH_CHAT_BLOCKED'; end if;
  select * into v_property from public.properties where id=v_conversation.property_id for share;
  if not found or v_property.owner_id<>v_conversation.seller_id or v_property.availability<>'active' or v_property.moderation<>'approved' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  v_now:=clock_timestamp();
  if v_kind='visit' and (v_at<=v_now or v_at>v_now+interval '180 days') then raise exception 'KH_NEG_INVALID_VISIT'; end if;
  if v_kind='offer' and v_parent_id is null and v_actor<>v_conversation.buyer_id then raise exception 'KH_NEG_BUYER_REQUIRED'; end if;
  if v_parent_id is not null then
    select * into v_parent from public.kh_negotiations where id=v_parent_id and conversation_id=v_conv and kind=v_kind for update;
    if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
    if v_parent.version<>v_expected then raise exception 'KH_NEG_VERSION_CONFLICT'; end if;
    if v_parent.status='pending' and v_parent.expires_at<=v_now then raise exception 'KH_NEG_EXPIRED'; end if;
    if v_parent.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_parent.created_by=v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
    update public.kh_negotiations set status='superseded',version=version+1,updated_at=v_now where id=v_parent.id returning * into v_parent;
    insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_parent.id,v_actor,'superseded',kh_private.negotiation_json(v_parent,v_actor,v_now));
  end if;
  for v_expired in update public.kh_negotiations set status='expired',version=version+1,updated_at=v_now
    where conversation_id=v_conv and status='pending' and expires_at<=v_now returning * loop
    insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_expired.id,v_actor,'expired',kh_private.negotiation_json(v_expired,v_actor,v_now));
  end loop;
  if exists(select 1 from public.kh_negotiations where conversation_id=v_conv and kind=v_kind and status='pending') then raise exception 'KH_NEG_PENDING_EXISTS'; end if;
  insert into public.kh_negotiations(conversation_id,created_by,kind,amount_usd,visit_date,visit_time,visit_at,note,parent_id,expires_at,created_at,updated_at)
  values(v_conv,v_actor,v_kind,v_amount,v_date::date,v_time::time,v_at,v_note,v_parent_id,case when v_kind='visit' then v_at else v_now+interval '7 days' end,v_now,v_now) returning * into v_saved;
  v_result:=kh_private.negotiation_json(v_saved,v_actor,v_now);
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_saved.id,v_actor,'created',v_result) returning id into v_event_id;
  v_summary:=case when v_kind='offer' then case when v_parent_id is null then 'Oferta propuesta: ' else 'Contraoferta propuesta: ' end||v_amount::text||' USD.'
    else case when v_parent_id is null then 'Visita propuesta: ' else 'Nueva fecha de visita: ' end||v_date||' a las '||v_time||' (hora de Cuba).' end;
  if v_note<>'' then v_summary:=v_summary||E'\n'||v_note; end if;
  perform kh_private.chat_store_message(v_conv,gen_random_uuid(),v_summary,v_actor,v_event_id);
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_conv,v_canonical,v_result);
  return v_result;
end $$;

create or replace function public.kh_respond_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_id uuid; v_request uuid; v_action text; v_expected integer;
  v_saved public.kh_negotiations%rowtype; v_conversation public.kh_conversations%rowtype; v_property public.properties%rowtype;
  v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb; v_now timestamptz; v_blocked boolean; v_available boolean; v_summary text; v_event_id uuid;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'clientRequestId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(p_payload->>'action','') not in ('accept','decline','cancel')
    or p_payload-ARRAY['id','clientRequestId','expectedVersion','action'] <> '{}'::jsonb then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  v_id:=(p_payload->>'id')::uuid; v_request:=(p_payload->>'clientRequestId')::uuid; v_expected:=(p_payload->>'expectedVersion')::integer; v_action:=p_payload->>'action';
  v_canonical:=jsonb_build_object('operation','respond','id',v_id,'action',v_action,'expectedVersion',v_expected);
  select * into v_saved from public.kh_negotiations where id=v_id;
  if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
  v_conversation:=kh_private.negotiation_lock(v_saved.conversation_id,v_actor);
  select * into v_receipt from kh_private.negotiation_requests where actor_id=v_actor and client_request_id=v_request;
  if found then
    if v_receipt.payload<>v_canonical then raise exception 'KH_NEG_REQUEST_CONFLICT'; end if;
    return v_receipt.result;
  end if;
  select * into v_saved from public.kh_negotiations where id=v_id for update;
  if v_saved.version<>v_expected then raise exception 'KH_NEG_VERSION_CONFLICT'; end if;
  if v_action='cancel' then
    if v_saved.status not in ('pending','accepted') then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_saved.status='pending' and v_saved.created_by<>v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
  else
    if v_saved.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_saved.created_by=v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
  end if;
  v_blocked:=exists(select 1 from public.kh_user_blocks where (blocker_id=v_conversation.buyer_id and blocked_id=v_conversation.seller_id) or (blocker_id=v_conversation.seller_id and blocked_id=v_conversation.buyer_id));
  select * into v_property from public.properties where id=v_conversation.property_id for share;
  v_available:=found and v_property.owner_id=v_conversation.seller_id and v_property.availability='active' and v_property.moderation='approved';
  -- A property edit may hold the row lock past expiry. Decide with the clock after waiting.
  v_now:=clock_timestamp();
  if v_saved.status='pending' and v_saved.expires_at<=v_now then raise exception 'KH_NEG_EXPIRED'; end if;
  if v_action<>'cancel' and v_blocked then raise exception 'KH_CHAT_BLOCKED'; end if;
  if v_action<>'cancel' and not v_available then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  update public.kh_negotiations set status=case v_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,version=version+1,updated_at=v_now where id=v_id returning * into v_saved;
  v_result:=kh_private.negotiation_json(v_saved,v_actor,v_now);
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_id,v_actor,v_saved.status,v_result) returning id into v_event_id;
  if not v_blocked and v_available then
    v_summary:=case when v_saved.kind='offer' then 'Oferta de '||v_saved.amount_usd::text||' USD' else 'Visita del '||to_char(v_saved.visit_date,'YYYY-MM-DD')||' a las '||to_char(v_saved.visit_time,'HH24:MI')||' (hora de Cuba)' end
      ||case v_action when 'accept' then ' aceptada.' when 'decline' then ' rechazada.' else ' cancelada.' end;
    perform kh_private.chat_store_message(v_saved.conversation_id,gen_random_uuid(),v_summary,v_actor,v_event_id);
  end if;
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_saved.conversation_id,v_canonical,v_result);
  return v_result;
end $$;


notify pgrst,'reload schema';
