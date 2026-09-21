-- Android delivery extends immutable notification events. No historical enqueue or sends on install.
create extension if not exists pg_cron;
create extension if not exists pg_net;
revoke all on schema net,cron from public,anon,authenticated;
revoke all on all tables in schema net,cron from public,anon,authenticated;
revoke all on all functions in schema net,cron from public,anon,authenticated;

create table kh_private.push_config (
  singleton boolean primary key default true check(singleton),
  transport_enabled boolean not null default false
);
insert into kh_private.push_config(singleton,transport_enabled) values(true,false);
create table kh_private.push_devices (
  installation_id uuid primary key,
  secret_hash bytea not null check(octet_length(secret_hash)=32),
  revision integer not null check(revision>0),
  last_operation text not null check(last_operation in('register','disable')),
  operation_hash bytea not null,
  owner_id uuid references public.profiles(id) on delete set null,
  session_id uuid references auth.sessions(id) on delete set null,
  expo_push_token text unique,
  token_hash bytea,
  platform text not null default 'android' check(platform='android'),
  project_id uuid not null default 'e054aea9-38b4-4211-826b-521b3cc0be9f'
    check(project_id='e054aea9-38b4-4211-826b-521b3cc0be9f'),
  enabled boolean not null default false,
  expires_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index kh_push_devices_owner on kh_private.push_devices(owner_id) where enabled;
create table kh_private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references kh_private.notifications(id) on delete cascade,
  -- Generation snapshot, deliberately no FK lock on devices during chat's enqueue transaction.
  -- Tombstones persist; dispatch verifies the current row and cancels any missing generation.
  installation_id uuid not null,
  recipient_id uuid not null,
  session_id uuid not null,
  device_revision integer not null,
  token_hash bytea not null,
  state text not null default 'pending' check(state in('pending','sending','retry','ticketed','checking_receipt','provider_accepted','cancelled','failed')),
  send_attempts integer not null default 0,
  receipt_attempts integer not null default 0,
  active_attempt_id uuid,
  ticket_id text,
  ticket_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(notification_id,installation_id,device_revision)
);
create index kh_push_outbox_ready on kh_private.push_outbox(next_attempt_at)
  where state in('pending','retry','ticketed');
create table kh_private.push_http_attempts (
  id uuid primary key,
  outbox_id uuid not null references kh_private.push_outbox(id) on delete cascade,
  kind text not null check(kind in('send','receipt')),
  request_id bigint not null unique,
  created_at timestamptz not null default clock_timestamp(),
  deadline_at timestamptz not null default clock_timestamp()+interval '2 minutes',
  completed_at timestamptz,
  result_code text
);
create index kh_push_http_pending on kh_private.push_http_attempts(created_at) where completed_at is null;
alter table kh_private.push_config enable row level security;
alter table kh_private.push_devices enable row level security;
alter table kh_private.push_outbox enable row level security;
alter table kh_private.push_http_attempts enable row level security;
revoke all on kh_private.push_config,kh_private.push_devices,kh_private.push_outbox,kh_private.push_http_attempts from public,anon,authenticated,service_role;

-- Registry -> outbox is the common mutation order. Enqueue only takes a snapshot and no registry lock.
create function kh_private.push_registry_lock() returns void language sql set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('kh:push:registry',0));
$$;
create function kh_private.push_session_live(p_session uuid,p_user uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select p_session is not null and p_user is not null and exists(select 1 from auth.sessions s
    where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>clock_timestamp()));
$$;
create function kh_private.push_current_session(p_actor uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_session text:=auth.jwt()->>'session_id'; v_id uuid;
begin
  if v_session is null or v_session !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'KH_PUSH_SESSION_REQUIRED'; end if;
  v_id:=v_session::uuid;
  if not kh_private.push_session_live(v_id,p_actor) then raise exception 'KH_PUSH_SESSION_REQUIRED'; end if;
  return v_id;
end $$;
create function kh_private.push_cancel_generation(p_installation uuid) returns void
language sql set search_path='' as $$
  update kh_private.push_outbox set state='cancelled',last_error='DEVICE_CHANGED',active_attempt_id=null,updated_at=clock_timestamp()
    where installation_id=p_installation and state not in('provider_accepted','cancelled','failed');
$$;

create function public.kh_register_push_device(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=kh_private.chat_actor(p_actor_id);
  v_session uuid:=kh_private.push_current_session(v_actor);
  v_id uuid; v_revision integer; v_secret bytea; v_token text; v_operation bytea;
  v_existing kh_private.push_devices%rowtype; v_conflict kh_private.push_devices%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'installationId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'installationSecret','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or coalesce(p_payload->>'revision','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(p_payload->>'expoPushToken','') !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
    or p_payload->>'platform' is distinct from 'android'
    or p_payload->>'projectId' is distinct from 'e054aea9-38b4-4211-826b-521b3cc0be9f'
    or p_payload-ARRAY['installationId','installationSecret','revision','expoPushToken','platform','projectId']<>'{}'::jsonb then raise exception 'KH_PUSH_INVALID'; end if;
  v_id:=(p_payload->>'installationId')::uuid; v_revision:=(p_payload->>'revision')::integer;
  v_secret:=extensions.digest(p_payload->>'installationSecret','sha256'); v_token:=p_payload->>'expoPushToken';
  v_operation:=extensions.digest(jsonb_build_object('operation','register','owner',v_actor,'session',v_session,
    'installation',v_id,'revision',v_revision,'token',v_token,'platform','android','project','e054aea9-38b4-4211-826b-521b3cc0be9f')::text,'sha256');
  perform kh_private.push_registry_lock();
  select * into v_existing from kh_private.push_devices where installation_id=v_id for update;
  if found then
    if v_existing.secret_hash<>v_secret then raise exception 'KH_PUSH_FORBIDDEN'; end if;
    if v_revision<v_existing.revision then raise exception 'KH_PUSH_STALE'; end if;
    if v_revision=v_existing.revision and (v_existing.last_operation<>'register' or v_existing.operation_hash<>v_operation) then raise exception 'KH_PUSH_CONFLICT'; end if;
  end if;
  -- Validate again after waiting for the registry: a logout may have removed the Auth row.
  if not kh_private.push_session_live(v_session,v_actor) then raise exception 'KH_PUSH_SESSION_REQUIRED'; end if;
  select * into v_conflict from kh_private.push_devices where expo_push_token=v_token and installation_id<>v_id for update;
  if found then
    if v_conflict.enabled and v_conflict.expires_at>clock_timestamp() and kh_private.push_session_live(v_conflict.session_id,v_conflict.owner_id) then raise exception 'KH_PUSH_TOKEN_IN_USE'; end if;
    perform kh_private.push_cancel_generation(v_conflict.installation_id);
    update kh_private.push_devices set enabled=false,expo_push_token=null,invalid_reason='TOKEN_REASSIGNED',updated_at=clock_timestamp() where installation_id=v_conflict.installation_id;
  end if;
  if v_existing.installation_id is not null and v_revision>v_existing.revision then perform kh_private.push_cancel_generation(v_id); end if;
  insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,expo_push_token,token_hash,enabled,expires_at)
  values(v_id,v_secret,v_revision,'register',v_operation,v_actor,v_session,v_token,extensions.digest(v_token,'sha256'),true,clock_timestamp()+interval '30 days')
  on conflict(installation_id) do update set revision=excluded.revision,last_operation=excluded.last_operation,operation_hash=excluded.operation_hash,
    owner_id=excluded.owner_id,session_id=excluded.session_id,expo_push_token=excluded.expo_push_token,token_hash=excluded.token_hash,
    enabled=true,expires_at=excluded.expires_at,invalid_reason=null,updated_at=clock_timestamp();
  return jsonb_build_object('enabled',true,'revision',v_revision,'platform','android');
end $$;

create function public.kh_disable_push_device(p_installation_id uuid,p_installation_secret text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_secret bytea; v_operation bytea; v_existing kh_private.push_devices%rowtype;
begin
  if p_installation_id is null or p_installation_secret is null or p_installation_secret !~ '^[0-9a-f]{64}$'
    or p_revision is null or p_revision not between 1 and 999999999 then raise exception 'KH_PUSH_INVALID'; end if;
  v_secret:=extensions.digest(p_installation_secret,'sha256');
  v_operation:=extensions.digest(jsonb_build_object('operation','disable','installation',p_installation_id,'revision',p_revision)::text,'sha256');
  perform kh_private.push_registry_lock();
  select * into v_existing from kh_private.push_devices where installation_id=p_installation_id for update;
  if found then
    if v_existing.secret_hash<>v_secret then raise exception 'KH_PUSH_FORBIDDEN'; end if;
    if p_revision<v_existing.revision then raise exception 'KH_PUSH_STALE'; end if;
    if p_revision=v_existing.revision and (v_existing.last_operation<>'disable' or v_existing.operation_hash<>v_operation) then raise exception 'KH_PUSH_CONFLICT'; end if;
  end if;
  perform kh_private.push_cancel_generation(p_installation_id);
  insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash)
  values(p_installation_id,v_secret,p_revision,'disable',v_operation)
  on conflict(installation_id) do update set revision=excluded.revision,last_operation=excluded.last_operation,
    operation_hash=excluded.operation_hash,enabled=false,expo_push_token=null,invalid_reason='DISABLED',updated_at=clock_timestamp();
  return jsonb_build_object('enabled',false,'revision',p_revision);
end $$;
create function public.kh_resolve_push_notification(p_actor_id uuid,p_notification_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_notice kh_private.notifications%rowtype;
begin
  select * into v_notice from kh_private.notifications n where n.id=p_notification_id and n.recipient_id=v_actor and kh_private.notification_visible(n,v_actor);
  if not found then raise exception 'KH_PUSH_NOT_FOUND'; end if;
  return jsonb_build_object('notificationId',v_notice.id,'recipientId',v_actor,'conversationId',v_notice.conversation_id);
end $$;

create function kh_private.push_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into kh_private.push_outbox(notification_id,installation_id,recipient_id,session_id,device_revision,token_hash,expires_at)
  select new.id,d.installation_id,new.recipient_id,d.session_id,d.revision,d.token_hash,new.created_at+interval '1 hour'
  from kh_private.push_devices d where d.owner_id=new.recipient_id and d.enabled and d.expo_push_token is not null
    and d.expires_at>clock_timestamp() and kh_private.push_session_live(d.session_id,d.owner_id)
  on conflict(notification_id,installation_id,device_revision) do nothing;
  return new;
end $$;
create trigger kh_notification_push after insert on kh_private.notifications for each row execute function kh_private.push_enqueue();

create function kh_private.push_eligible(p_job kh_private.push_outbox) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from kh_private.push_devices d join kh_private.notifications n on n.id=p_job.notification_id
    where d.installation_id=p_job.installation_id and d.enabled and d.owner_id=p_job.recipient_id
      and d.session_id=p_job.session_id and d.revision=p_job.device_revision and d.token_hash=p_job.token_hash
      and d.expo_push_token is not null and d.expires_at>clock_timestamp()
      and kh_private.push_session_live(d.session_id,d.owner_id) and n.recipient_id=p_job.recipient_id
      and n.read_at is null and kh_private.notification_visible(n,p_job.recipient_id)
      and (kh_private.notification_preferences_json(p_job.recipient_id)->>case n.category when 'message' then 'messages' when 'visit' then 'visits' else 'offers' end)::boolean);
$$;
-- Receipt reconciliation never creates a new notification: reading/muting/blocking must not skip it.
create function kh_private.push_generation_current(p_job kh_private.push_outbox) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from kh_private.push_devices d where d.installation_id=p_job.installation_id
    and d.owner_id=p_job.recipient_id and d.session_id=p_job.session_id and d.revision=p_job.device_revision
    and d.token_hash=p_job.token_hash and d.expo_push_token is not null);
$$;
create function kh_private.push_payload(p_job kh_private.push_outbox) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('to',d.expo_push_token,'title','KarmaHouse',
    'body',case n.category when 'message' then 'Tienes un nuevo mensaje.' when 'visit' then 'Tienes una actualización de visita.' else 'Tienes una actualización de oferta.' end,
    'data',jsonb_build_object('kind','karmahouse.notification','notificationId',n.id,'recipientId',n.recipient_id),
    'ttl',3600,'channelId','karmahouse-updates','tag','kh-'||n.id::text,'collapseId','kh-'||n.id::text)
  from kh_private.push_devices d join kh_private.notifications n on n.id=p_job.notification_id where d.installation_id=p_job.installation_id;
$$;
-- Only this function touches HTTP. URLs are fixed and no request/response bodies are logged.
create function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;
begin
  if p_kind='send' then v_url:='https://exp.host/--/api/v2/push/send';
  elsif p_kind='receipt' then v_url:='https://exp.host/--/api/v2/push/getReceipts';
  else raise exception 'KH_PUSH_INVALID_TRANSPORT'; end if;
  return net.http_post(url:=v_url,body:=p_payload,headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,timeout_milliseconds:=10000);
end $$;

create function kh_private.push_retry(p_job_id uuid,p_kind text,p_reason text) returns void
language plpgsql set search_path='' as $$
declare v_job kh_private.push_outbox%rowtype; v_count integer; v_done boolean;
begin
  select * into strict v_job from kh_private.push_outbox where id=p_job_id for update;
  v_count:=case when p_kind='send' then v_job.send_attempts else v_job.receipt_attempts end;
  v_done:=v_count>=6 or (p_kind='send' and v_job.expires_at<=clock_timestamp())
    or (p_kind='receipt' and v_job.ticket_at<=clock_timestamp()-interval '23 hours');
  update kh_private.push_outbox set state=case when v_done then 'failed' when p_kind='send' then 'retry' else 'ticketed' end,
    last_error=p_reason,active_attempt_id=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(900,30*power(2,greatest(v_count,1)))::integer),updated_at=clock_timestamp()
    where id=p_job_id;
end $$;
create function kh_private.push_apply_response(p_attempt_id uuid,p_status integer,p_body jsonb,p_timed_out boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_attempt kh_private.push_http_attempts%rowtype; v_job kh_private.push_outbox%rowtype;
  v_item jsonb; v_error text; v_code text; v_ticket text;
begin
  perform kh_private.push_registry_lock();
  select * into v_attempt from kh_private.push_http_attempts where id=p_attempt_id for update;
  if not found or v_attempt.completed_at is not null then return; end if;
  select * into v_job from kh_private.push_outbox where id=v_attempt.outbox_id for update;
  update kh_private.push_http_attempts set completed_at=clock_timestamp(),result_code='IGNORED' where id=p_attempt_id;
  if not found or v_job.active_attempt_id is distinct from p_attempt_id or v_job.state not in('sending','checking_receipt') then return; end if;
  if not kh_private.push_generation_current(v_job) then
    update kh_private.push_outbox set state='cancelled',active_attempt_id=null,last_error='INELIGIBLE',updated_at=clock_timestamp() where id=v_job.id;
    return;
  end if;
  if p_timed_out or p_status is null or p_status=429 or p_status>=500 then
    v_code:=case when p_status=429 then 'RATE_LIMIT' when p_status>=500 then 'HTTP_SERVER_ERROR' else 'HTTP_UNKNOWN' end;
    perform kh_private.push_retry(v_job.id,v_attempt.kind,v_code);
  elsif p_status<200 or p_status>=300 then
    v_code:=case when p_status in(401,403) then 'TRANSPORT_UNAUTHORIZED' else 'HTTP_REJECTED' end;
    update kh_private.push_outbox set state='failed',last_error=v_code,active_attempt_id=null,updated_at=clock_timestamp() where id=v_job.id;
  else
    if v_attempt.kind='send' then v_item:=p_body->'data'; else v_item:=p_body->'data'->v_job.ticket_id; end if;
    if v_attempt.kind='receipt' and jsonb_typeof(p_body->'data')='object' and v_item is null then
      v_code:='RECEIPT_PENDING'; perform kh_private.push_retry(v_job.id,'receipt',v_code);
    elsif jsonb_typeof(v_item)='object' and v_item->>'status'='ok' then
      if v_attempt.kind='send' then
        v_ticket:=v_item->>'id';
        if v_ticket is null or v_ticket !~ '^[A-Za-z0-9-]{1,200}$' then
          v_code:='MALFORMED_RESPONSE'; perform kh_private.push_retry(v_job.id,'send',v_code);
        else
          v_code:='TICKET_ACCEPTED';
          update kh_private.push_outbox set state='ticketed',ticket_id=v_ticket,ticket_at=clock_timestamp(),receipt_attempts=0,next_attempt_at=clock_timestamp()+interval '15 minutes',
            active_attempt_id=null,last_error=null,updated_at=clock_timestamp() where id=v_job.id;
        end if;
      else
        v_code:='PROVIDER_ACCEPTED';
        update kh_private.push_outbox set state='provider_accepted',active_attempt_id=null,last_error=null,updated_at=clock_timestamp() where id=v_job.id;
      end if;
    elsif jsonb_typeof(v_item)='object' and v_item->>'status'='error' then
      v_error:=v_item->'details'->>'error';
      v_code:=case when v_error in('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials') then v_error else 'PROVIDER_REJECTED' end;
      if v_error='MessageRateExceeded' then perform kh_private.push_retry(v_job.id,'send',v_code);
      else
        update kh_private.push_outbox set state='failed',active_attempt_id=null,last_error=v_code,updated_at=clock_timestamp() where id=v_job.id;
        if v_error='DeviceNotRegistered' then
          update kh_private.push_devices set enabled=false,invalid_reason='DeviceNotRegistered',updated_at=clock_timestamp()
            where installation_id=v_job.installation_id and revision=v_job.device_revision and owner_id=v_job.recipient_id
              and session_id=v_job.session_id and token_hash=v_job.token_hash;
          if found then perform kh_private.push_cancel_generation(v_job.installation_id); end if;
        end if;
      end if;
    else
      v_code:='MALFORMED_RESPONSE'; perform kh_private.push_retry(v_job.id,v_attempt.kind,v_code);
    end if;
  end if;
  update kh_private.push_http_attempts set result_code=v_code where id=p_attempt_id;
end $$;

create function kh_private.push_tick() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_attempt kh_private.push_http_attempts%rowtype; v_response net._http_response%rowtype;
  v_job kh_private.push_outbox%rowtype; v_body jsonb; v_kind text; v_id uuid; v_request bigint;
  v_job_ids uuid[]; v_pair record; v_recipient uuid;
  v_collected integer:=0; v_dispatched integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('kh:push:worker',0)) then return '{"busy":true}'::jsonb; end if;
  if not exists(select 1 from kh_private.push_config where singleton and transport_enabled) then return '{"enabled":false}'::jsonb; end if;
  -- Freeze the bounded candidate set without row locks, then acquire ALL pair locks before
  -- ANY recipient/registry lock. This matches chat pair -> recipient -> enqueue and avoids
  -- acquiring a second pair while retaining a recipient from an earlier job in this tick.
  select coalesce(array_agg(id),'{}'::uuid[]) into v_job_ids from (
    select id from kh_private.push_outbox where state in('pending','retry','ticketed') and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,id limit 20
  ) ready;
  for v_pair in select distinct least(c.buyer_id,c.seller_id) as first_id,greatest(c.buyer_id,c.seller_id) as second_id
    from kh_private.push_outbox o join kh_private.notifications n on n.id=o.notification_id
    join public.kh_conversations c on c.id=n.conversation_id
    where o.id=any(v_job_ids) order by first_id,second_id loop
    perform kh_private.chat_pair_lock(v_pair.first_id,v_pair.second_id);
  end loop;
  for v_recipient in select distinct recipient_id from kh_private.push_outbox
    where id=any(v_job_ids) order by recipient_id loop
    perform kh_private.notification_recipient_lock(v_recipient);
  end loop;
  perform kh_private.push_registry_lock();
  for v_attempt in select * from kh_private.push_http_attempts where completed_at is null order by created_at limit 100 for update skip locked loop
    select * into v_response from net._http_response where id=v_attempt.request_id;
    if found then
      begin v_body:=v_response.content::jsonb; exception when invalid_text_representation then v_body:=null; end;
      perform kh_private.push_apply_response(v_attempt.id,v_response.status_code,v_body,coalesce(v_response.timed_out,false) or v_response.error_msg is not null);
      delete from net._http_response where id=v_attempt.request_id;
      v_collected:=v_collected+1;
    elsif v_attempt.deadline_at<clock_timestamp() then
      perform kh_private.push_apply_response(v_attempt.id,null,null,true);
      v_collected:=v_collected+1;
    end if;
  end loop;
  -- Recheck before every HTTP enqueue. Once committed to transport, a provider send cannot be recalled.
  for v_job in select * from kh_private.push_outbox where id=any(v_job_ids) and state in('pending','retry','ticketed') and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,id limit 20 for update skip locked loop
    v_kind:=case when v_job.state='ticketed' then 'receipt' else 'send' end;
    if (v_kind='send' and not kh_private.push_eligible(v_job)) or (v_kind='receipt' and not kh_private.push_generation_current(v_job)) then
      update kh_private.push_outbox set state='cancelled',last_error='INELIGIBLE',updated_at=clock_timestamp() where id=v_job.id;
      continue;
    end if;
    if (v_kind='send' and (v_job.expires_at<=clock_timestamp() or v_job.send_attempts>=6))
      or (v_kind='receipt' and (v_job.ticket_at<=clock_timestamp()-interval '23 hours' or v_job.receipt_attempts>=6)) then
      update kh_private.push_outbox set state='failed',last_error='EXPIRED_OR_LIMIT',updated_at=clock_timestamp() where id=v_job.id;
      continue;
    end if;
    v_id:=gen_random_uuid();
    v_body:=case when v_kind='send' then kh_private.push_payload(v_job) else jsonb_build_object('ids',jsonb_build_array(v_job.ticket_id)) end;
    v_request:=kh_private.push_http_post(v_kind,v_body);
    insert into kh_private.push_http_attempts(id,outbox_id,kind,request_id) values(v_id,v_job.id,v_kind,v_request);
    update kh_private.push_outbox set state=case when v_kind='send' then 'sending' else 'checking_receipt' end,
      send_attempts=send_attempts+case when v_kind='send' then 1 else 0 end,
      receipt_attempts=receipt_attempts+case when v_kind='receipt' then 1 else 0 end,
      active_attempt_id=v_id,updated_at=clock_timestamp() where id=v_job.id;
    v_dispatched:=v_dispatched+1;
  end loop;
  -- Keep only minimal installation tombstones; drop transport token once a lease/session ends.
  update kh_private.push_devices set enabled=false,expo_push_token=null,invalid_reason='SESSION_OR_LEASE_ENDED',updated_at=clock_timestamp()
    where enabled and (expires_at<=clock_timestamp() or not kh_private.push_session_live(session_id,owner_id));
  delete from kh_private.push_outbox where id in(select id from kh_private.push_outbox
    where state in('provider_accepted','cancelled','failed') and updated_at<clock_timestamp()-interval '7 days' order by updated_at limit 200);
  return jsonb_build_object('enabled',true,'collected',v_collected,'dispatched',v_dispatched);
end $$;

revoke all on function public.kh_register_push_device(uuid,jsonb),public.kh_disable_push_device(uuid,text,integer),public.kh_resolve_push_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kh_register_push_device(uuid,jsonb),public.kh_resolve_push_notification(uuid,uuid) to authenticated;
grant execute on function public.kh_disable_push_device(uuid,text,integer) to anon,authenticated;
do $$ declare v_signature regprocedure;
begin
  for v_signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='kh_private' and p.proname like 'push\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_signature);
  end loop;
end $$;

-- Scheduling by name replaces its existing definition. The one job is harmless until explicitly enabled.
select cron.schedule('karmahouse-push-delivery','30 seconds','select kh_private.push_tick();');
notify pgrst,'reload schema';
