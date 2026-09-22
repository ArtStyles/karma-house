-- exp.host answers 403 to the networks this app ships to, so the phone can no longer fetch its own
-- Expo token. The device now registers its FCM token and this worker — which is not blocked — trades
-- it for the Expo token the transport already knows how to send to.
alter table kh_private.push_devices add column fcm_token text unique;
alter table kh_private.push_devices add column exchange_request_id bigint;
alter table kh_private.push_devices add column exchange_attempts integer not null default 0 check(exchange_attempts>=0);
alter table kh_private.push_devices add column exchange_next_at timestamptz;
alter table kh_private.push_devices add column exchange_deadline_at timestamptz;
create index kh_push_devices_exchange on kh_private.push_devices(exchange_next_at)
  where enabled and fcm_token is not null and expo_push_token is null;

-- token_hash now identifies the device by the token it reported, so an exchange never invalidates
-- an outbox generation: only a genuine re-registration does.
create or replace function public.kh_register_push_device(p_actor_id uuid,p_payload jsonb) returns jsonb
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
    or coalesce(p_payload->>'fcmToken','') !~ '^[A-Za-z0-9_\-:.%]{64,255}$'
    or p_payload->>'platform' is distinct from 'android'
    or p_payload->>'projectId' is distinct from 'e054aea9-38b4-4211-826b-521b3cc0be9f'
    or p_payload-ARRAY['installationId','installationSecret','revision','fcmToken','platform','projectId']<>'{}'::jsonb then raise exception 'KH_PUSH_INVALID'; end if;
  v_id:=(p_payload->>'installationId')::uuid; v_revision:=(p_payload->>'revision')::integer;
  v_secret:=extensions.digest(p_payload->>'installationSecret','sha256'); v_token:=p_payload->>'fcmToken';
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
  select * into v_conflict from kh_private.push_devices where fcm_token=v_token and installation_id<>v_id for update;
  if found then
    if v_conflict.enabled and v_conflict.expires_at>clock_timestamp() and kh_private.push_session_live(v_conflict.session_id,v_conflict.owner_id) then raise exception 'KH_PUSH_TOKEN_IN_USE'; end if;
    perform kh_private.push_cancel_generation(v_conflict.installation_id);
    update kh_private.push_devices set enabled=false,fcm_token=null,expo_push_token=null,invalid_reason='TOKEN_REASSIGNED',
      exchange_request_id=null,exchange_next_at=null,exchange_deadline_at=null,updated_at=clock_timestamp()
      where installation_id=v_conflict.installation_id;
  end if;
  if v_existing.installation_id is not null and v_revision>v_existing.revision then perform kh_private.push_cancel_generation(v_id); end if;
  insert into kh_private.push_devices(installation_id,secret_hash,revision,last_operation,operation_hash,owner_id,session_id,
    fcm_token,expo_push_token,token_hash,enabled,expires_at,exchange_attempts,exchange_next_at)
  values(v_id,v_secret,v_revision,'register',v_operation,v_actor,v_session,v_token,null,extensions.digest(v_token,'sha256'),
    true,clock_timestamp()+interval '30 days',0,clock_timestamp())
  on conflict(installation_id) do update set revision=excluded.revision,last_operation=excluded.last_operation,operation_hash=excluded.operation_hash,
    owner_id=excluded.owner_id,session_id=excluded.session_id,fcm_token=excluded.fcm_token,token_hash=excluded.token_hash,
    expo_push_token=case when kh_private.push_devices.fcm_token=excluded.fcm_token then kh_private.push_devices.expo_push_token else null end,
    enabled=true,expires_at=excluded.expires_at,invalid_reason=null,
    exchange_request_id=null,exchange_attempts=0,exchange_next_at=clock_timestamp(),exchange_deadline_at=null,
    updated_at=clock_timestamp();
  return jsonb_build_object('enabled',true,'revision',v_revision,'platform','android');
end $$;

create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;
begin
  if p_kind='send' then v_url:='https://exp.host/--/api/v2/push/send';
  elsif p_kind='receipt' then v_url:='https://exp.host/--/api/v2/push/getReceipts';
  elsif p_kind='exchange' then v_url:='https://exp.host/--/api/v2/push/getExpoPushToken';
  else raise exception 'KH_PUSH_INVALID_TRANSPORT'; end if;
  return net.http_post(url:=v_url,body:=p_payload,headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,timeout_milliseconds:=10000);
end $$;

-- One exchange in flight per installation. A device with no Expo token yet simply enqueues nothing,
-- so a notice arriving in that window is skipped rather than queued against a token we cannot send to.
create function kh_private.push_exchange_dispatch() returns integer
language plpgsql security definer set search_path='' as $$
declare v_device kh_private.push_devices%rowtype; v_request bigint; v_dispatched integer:=0;
begin
  for v_device in select * from kh_private.push_devices
    where enabled and fcm_token is not null and expo_push_token is null
      and exchange_request_id is null and coalesce(exchange_next_at,clock_timestamp())<=clock_timestamp()
    order by exchange_next_at,installation_id limit 10 for update skip locked loop
    if v_device.expires_at<=clock_timestamp() or not kh_private.push_session_live(v_device.session_id,v_device.owner_id) then
      update kh_private.push_devices set enabled=false,fcm_token=null,invalid_reason='SESSION_OR_LEASE_ENDED',
        exchange_next_at=null,updated_at=clock_timestamp() where installation_id=v_device.installation_id;
      continue;
    end if;
    if v_device.exchange_attempts>=6 then
      update kh_private.push_devices set enabled=false,fcm_token=null,invalid_reason='EXCHANGE_FAILED',
        exchange_next_at=null,updated_at=clock_timestamp() where installation_id=v_device.installation_id;
      continue;
    end if;
    v_request:=kh_private.push_http_post('exchange',jsonb_build_object('type','fcm','deviceToken',v_device.fcm_token,
      'projectId',v_device.project_id,'appId','com.karmahouse.karmahouse','deviceId',v_device.installation_id,'development',false));
    update kh_private.push_devices set exchange_request_id=v_request,exchange_attempts=exchange_attempts+1,
      exchange_deadline_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
      where installation_id=v_device.installation_id;
    v_dispatched:=v_dispatched+1;
  end loop;
  return v_dispatched;
end $$;

create function kh_private.push_exchange_collect() returns integer
language plpgsql security definer set search_path='' as $$
declare v_device kh_private.push_devices%rowtype; v_response net._http_response%rowtype;
  v_body jsonb; v_token text; v_collected integer:=0; v_failed boolean;
begin
  for v_device in select * from kh_private.push_devices where exchange_request_id is not null
    order by exchange_deadline_at limit 20 for update skip locked loop
    v_token:=null; v_failed:=false;
    select * into v_response from net._http_response where id=v_device.exchange_request_id;
    if found then
      begin v_body:=v_response.content::jsonb; exception when invalid_text_representation then v_body:=null; end;
      delete from net._http_response where id=v_device.exchange_request_id;
      if coalesce(v_response.timed_out,false) or v_response.error_msg is not null or v_response.status_code is null
        or v_response.status_code<200 or v_response.status_code>=300 then v_failed:=true;
      else
        v_token:=v_body->'data'->>'expoPushToken';
        if v_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then v_token:=null; v_failed:=true; end if;
      end if;
    elsif v_device.exchange_deadline_at<clock_timestamp() then v_failed:=true;
    else continue; end if;
    v_collected:=v_collected+1;
    if v_token is not null then
      update kh_private.push_devices set expo_push_token=v_token,exchange_request_id=null,exchange_attempts=0,
        exchange_next_at=null,exchange_deadline_at=null,invalid_reason=null,updated_at=clock_timestamp()
        where installation_id=v_device.installation_id;
    elsif v_failed then
      update kh_private.push_devices set exchange_request_id=null,exchange_deadline_at=null,
        exchange_next_at=clock_timestamp()+make_interval(secs=>least(900,30*power(2,greatest(v_device.exchange_attempts,1)))::integer),
        updated_at=clock_timestamp() where installation_id=v_device.installation_id;
    end if;
  end loop;
  return v_collected;
end $$;

create or replace function kh_private.push_tick() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_attempt kh_private.push_http_attempts%rowtype; v_response net._http_response%rowtype;
  v_job kh_private.push_outbox%rowtype; v_body jsonb; v_kind text; v_id uuid; v_request bigint;
  v_job_ids uuid[]; v_pair record; v_recipient uuid;
  v_collected integer:=0; v_dispatched integer:=0; v_exchanged integer:=0;
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
  update kh_private.push_devices set enabled=false,expo_push_token=null,fcm_token=null,invalid_reason='SESSION_OR_LEASE_ENDED',
    exchange_request_id=null,exchange_next_at=null,exchange_deadline_at=null,updated_at=clock_timestamp()
    where enabled and (expires_at<=clock_timestamp() or not kh_private.push_session_live(session_id,owner_id));
  v_exchanged:=kh_private.push_exchange_collect()+kh_private.push_exchange_dispatch();
  delete from kh_private.push_outbox where id in(select id from kh_private.push_outbox
    where state in('provider_accepted','cancelled','failed') and updated_at<clock_timestamp()-interval '7 days' order by updated_at limit 200);
  return jsonb_build_object('enabled',true,'collected',v_collected,'dispatched',v_dispatched,'exchanged',v_exchanged);
end $$;

create or replace function public.kh_disable_push_device(p_installation_id uuid,p_installation_secret text,p_revision integer) returns jsonb
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
    operation_hash=excluded.operation_hash,enabled=false,expo_push_token=null,fcm_token=null,invalid_reason='DISABLED',
    exchange_request_id=null,exchange_attempts=0,exchange_next_at=null,exchange_deadline_at=null,updated_at=clock_timestamp();
  return jsonb_build_object('enabled',false,'revision',p_revision);
end $$;

do $$ declare v_signature regprocedure;
begin
  for v_signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='kh_private' and p.proname like 'push\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_signature);
  end loop;
end $$;

notify pgrst,'reload schema';
