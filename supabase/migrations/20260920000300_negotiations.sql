-- Structured facts are independent of ordinary chat text. No administrator-wide access.
create table public.kh_negotiations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kh_conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('visit','offer')),
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','superseded','expired')),
  version integer not null default 1 check(version>0),
  amount_usd numeric,
  visit_date date,
  visit_time time,
  visit_at timestamptz,
  note text not null default '' check(char_length(note)<=500),
  parent_id uuid references public.kh_negotiations(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check((kind='offer' and amount_usd>0 and amount_usd<=1000000000 and amount_usd=round(amount_usd,2)
      and amount_usd is not null and visit_date is null and visit_time is null and visit_at is null)
    or (kind='visit' and amount_usd is null and visit_date is not null and visit_time is not null and visit_at is not null
      and date_trunc('minute',visit_at)=visit_at and (visit_date+visit_time) at time zone 'America/Havana'=visit_at and expires_at=visit_at))
);
create unique index kh_negotiation_one_pending on public.kh_negotiations(conversation_id,kind) where status='pending';
create index kh_negotiations_history on public.kh_negotiations(conversation_id,created_at desc,id desc);
create index kh_negotiations_pending on public.kh_negotiations(conversation_id,expires_at) where status='pending';
alter table public.kh_negotiations enable row level security;
revoke all on public.kh_negotiations from public,anon,authenticated;
grant select on public.kh_negotiations to authenticated;
grant all on public.kh_negotiations to service_role;
create policy kh_negotiation_participant on public.kh_negotiations for select to authenticated using(kh_private.chat_participant(conversation_id,(select auth.uid())));

create table kh_private.negotiation_requests (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  conversation_id uuid not null references public.kh_conversations(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,client_request_id)
);
create table kh_private.negotiation_events (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.kh_negotiations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  action text not null check(action in ('created','accepted','declined','cancelled','superseded','expired')),
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table kh_private.negotiation_requests enable row level security;
alter table kh_private.negotiation_events enable row level security;
revoke all on kh_private.negotiation_requests,kh_private.negotiation_events from public,anon,authenticated;

create function kh_private.negotiation_visit(p_date text,p_time text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare v_wall timestamp; v_instant timestamptz;
begin
  if p_date is null or p_time is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'KH_NEG_INVALID_VISIT'; end if;
  begin v_wall:=p_date::date+p_time::time;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'KH_NEG_INVALID_VISIT'; end;
  v_instant:=v_wall at time zone 'America/Havana';
  if to_char(v_instant at time zone 'America/Havana','YYYY-MM-DD HH24:MI')<>p_date||' '||p_time then raise exception 'KH_NEG_INVALID_VISIT'; end if;
  return v_instant;
end $$;

-- Same acquisition order as kh_send_message: actor -> pair -> conversation -> property.
create function kh_private.negotiation_lock(p_id uuid,p_actor uuid) returns public.kh_conversations
language plpgsql set search_path='' as $$
declare v_conversation public.kh_conversations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||p_actor::text,0));
  select * into v_conversation from public.kh_conversations where id=p_id and p_actor in (buyer_id,seller_id);
  if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
  perform kh_private.chat_pair_lock(v_conversation.buyer_id,v_conversation.seller_id);
  select * into v_conversation from public.kh_conversations where id=p_id and p_actor in (buyer_id,seller_id) for update;
  if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
  return v_conversation;
end $$;

create function kh_private.negotiation_json(p_row public.kh_negotiations,p_actor uuid,p_now timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_row.id,'conversationId',c.id,'propertyId',c.property_id,
    'propertyTitle',c.property_title,'propertyLocation',c.property_location,'buyerId',c.buyer_id,'sellerId',c.seller_id,
    'createdBy',p_row.created_by,'kind',p_row.kind,'status',case when p_row.status='pending' and p_row.expires_at<=p_now then 'expired' else p_row.status end,
    'version',p_row.version,'amountUsd',p_row.amount_usd,'visitDate',to_char(p_row.visit_date,'YYYY-MM-DD'),'visitTime',to_char(p_row.visit_time,'HH24:MI'),
    'visitAt',p_row.visit_at,'note',p_row.note,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at,'parentId',p_row.parent_id,'expiresAt',p_row.expires_at,
    'canAct',exists(select 1 from public.properties p where p.id=c.property_id and p.owner_id=c.seller_id and p.availability='active' and p.moderation='approved')
      and not exists(select 1 from public.kh_user_blocks b where (b.blocker_id=c.buyer_id and b.blocked_id=c.seller_id) or (b.blocker_id=c.seller_id and b.blocked_id=c.buyer_id)))
  from public.kh_conversations c where c.id=p_row.conversation_id and p_actor in(c.buyer_id,c.seller_id);
$$;

create function public.kh_list_negotiations(p_actor_id uuid,p_conversation_id uuid default null,p_pending_only boolean default false,p_offset integer default 0,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_now timestamptz:=statement_timestamp(); v_result jsonb;
begin
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 or p_pending_only is null then raise exception 'KH_NEG_INVALID_PAGE'; end if;
  if p_conversation_id is not null and not kh_private.chat_participant(p_conversation_id,v_actor) then raise exception 'KH_NEG_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(kh_private.negotiation_json(n,v_actor,v_now) order by n.created_at desc,n.id desc),'[]'::jsonb) into v_result from (
    select n.* from public.kh_negotiations n join public.kh_conversations c on c.id=n.conversation_id
    where v_actor in(c.buyer_id,c.seller_id) and (p_conversation_id is null or n.conversation_id=p_conversation_id)
      and (not p_pending_only or (n.status='pending' and n.expires_at>v_now))
    order by n.created_at desc,n.id desc offset p_offset limit p_limit
  ) n;
  return v_result;
end $$;

create function public.kh_create_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_conversation public.kh_conversations%rowtype;
  v_request uuid; v_conv uuid; v_kind text; v_note text; v_amount numeric; v_at timestamptz; v_date text; v_time text;
  v_parent_id uuid; v_expected integer; v_parent public.kh_negotiations%rowtype; v_saved public.kh_negotiations%rowtype;
  v_expired public.kh_negotiations%rowtype; v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb;
  v_now timestamptz; v_summary text; v_property public.properties%rowtype;
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
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_saved.id,v_actor,'created',v_result);
  v_summary:=case when v_kind='offer' then case when v_parent_id is null then 'Oferta propuesta: ' else 'Contraoferta propuesta: ' end||v_amount::text||' USD.'
    else case when v_parent_id is null then 'Visita propuesta: ' else 'Nueva fecha de visita: ' end||v_date||' a las '||v_time||' (hora de Cuba).' end;
  if v_note<>'' then v_summary:=v_summary||E'\n'||v_note; end if;
  perform public.kh_send_message(v_conv,gen_random_uuid(),v_summary,v_actor);
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_conv,v_canonical,v_result);
  return v_result;
end $$;

create function public.kh_respond_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_id uuid; v_request uuid; v_action text; v_expected integer;
  v_saved public.kh_negotiations%rowtype; v_conversation public.kh_conversations%rowtype; v_property public.properties%rowtype;
  v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb; v_now timestamptz; v_blocked boolean; v_available boolean; v_summary text;
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
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_id,v_actor,v_saved.status,v_result);
  if not v_blocked and v_available then
    v_summary:=case when v_saved.kind='offer' then 'Oferta de '||v_saved.amount_usd::text||' USD' else 'Visita del '||to_char(v_saved.visit_date,'YYYY-MM-DD')||' a las '||to_char(v_saved.visit_time,'HH24:MI')||' (hora de Cuba)' end
      ||case v_action when 'accept' then ' aceptada.' when 'decline' then ' rechazada.' else ' cancelada.' end;
    perform public.kh_send_message(v_saved.conversation_id,gen_random_uuid(),v_summary,v_actor);
  end if;
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_saved.conversation_id,v_canonical,v_result);
  return v_result;
end $$;

revoke all on function kh_private.negotiation_visit(text,text),kh_private.negotiation_lock(uuid,uuid),kh_private.negotiation_json(public.kh_negotiations,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.kh_list_negotiations(uuid,uuid,boolean,integer,integer),public.kh_create_negotiation(uuid,jsonb),public.kh_respond_negotiation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_list_negotiations(uuid,uuid,boolean,integer,integer),public.kh_create_negotiation(uuid,jsonb),public.kh_respond_negotiation(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
