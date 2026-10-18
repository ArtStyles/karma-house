-- Messages in agency chats reach the phone. Like personal messages they stay out of the bell: each one is a
-- push whose tag names its chat, so the phone replaces the previous notice of that chat instead of stacking.
-- Reading a chat marks its notices read, so a pending push is not sent. Only phones registered with
-- supportsAgencyChat receive them; 0.1.29 and older ones do not know these routes.
alter table kh_private.notifications add column agency_chat text,add column agency_message_seq integer,
 drop constraint notifications_category_check,drop constraint notifications_agency_shape;
alter table kh_private.notifications add constraint notifications_category_check check(category in('message','visit','offer','alert','agency','agency_message')),
 add constraint notifications_agency_shape check(
 (category='agency' and agency_event_id is not null and event_kind in('agency_review','agency_verification','team_invitation','deal_assignment','sale_request','property_sold','visit_reminder','task_reminder','manual_cancellation_notice') and message_id is null and negotiation_id is null and property_id is null and saved_search_id is null and agency_target is not null)
 or (category='agency_message' and agency_chat is not null and agency_message_seq is not null and agency_target is not null and agency_id is not null and conversation_id is null and message_id is null and negotiation_id is null and property_id is null and saved_search_id is null and agency_event_id is null)
 or (category='alert' and conversation_id is null and message_id is null and property_id is not null and agency_event_id is null)
 or (category in('message','visit','offer') and conversation_id is not null and message_id is not null and property_id is null and saved_search_id is null and agency_event_id is null));
create index kh_notifications_agency_chat_unread on kh_private.notifications(recipient_id,agency_chat) where category='agency_message' and read_at is null;
alter table kh_private.push_devices add column supports_agency_chat boolean not null default false;

-- PRECONDITION: the sender's RPC holds the chat's locks. This takes only recipient locks, in id order,
-- after them, as notification_from_message does for personal chats.
create function kh_private.agency_chat_notify(p_recipients uuid[],p_actor uuid,p_agency uuid,p_chat text,p_seq integer,p_target jsonb,p_actor_name text,p_property_title text,p_title text) returns void language plpgsql security definer set search_path='' as $$
declare r uuid;begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor) then return;end if;
 for r in select distinct x from unnest(coalesce(p_recipients,'{}'::uuid[])) x where x is not null and x<>p_actor order by 1 loop
  if not exists(select 1 from public.profiles where id=r) or kh_private.is_suspended(r) or kh_private.is_deleting(r)
   or not exists(select 1 from auth.users where id=r and email_confirmed_at is not null) or kh_private.agency_pair_blocked(r,p_actor) then continue;end if;
  perform kh_private.notification_recipient_lock(r);
  if not (kh_private.notification_preferences_json(r)->>'messages')::boolean then continue;end if;
  insert into kh_private.notifications(seq,recipient_id,actor_id,category,actor_name,property_title,title,body,agency_id,agency_target,agency_chat,agency_message_seq)
  values(nextval('kh_private.notification_seq'),r,p_actor,'agency_message',coalesce(p_actor_name,''),coalesce(p_property_title,''),coalesce(p_title,'Nuevo mensaje'),'Tienes un nuevo mensaje.',p_agency,p_target,p_chat,p_seq);
 end loop;
end $$;
-- A client's message reaches the responsable and the people attending; with nobody, the admins and coordinators.
-- A team answer reaches the client, who sees the agency's name.
create function kh_private.agency_message_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare d kh_private.agency_deals;v_people uuid[];v_agency text;v_home text;v_client text;begin
 select x.* into d from kh_private.agency_deals x join kh_private.agency_conversations c on c.deal_id=x.id where c.id=new.conversation_id;
 if d.id is null or new.sender_id is null then return new;end if;
 select trade_name into v_agency from kh_private.agencies where id=d.agency_id;
 v_home:=coalesce((select title from public.properties where id=d.property_id),'Vivienda');
 if new.from_agency then
  if d.contact_kind='account' and d.buyer_id is not null and not kh_private.agency_client_blocked(d.agency_id,d.buyer_id) then
   perform kh_private.agency_chat_notify(array[d.buyer_id],new.sender_id,d.agency_id,'c:'||new.conversation_id,new.seq,
    jsonb_build_object('route','buyer_conversation','agencyId',null,'dealId',new.conversation_id),v_agency,v_home,v_agency);
  end if;
 else
  select array_agg(x.u) into v_people from(select d.assignee_id u where d.assignee_id is not null
   union select m.user_id from kh_private.agency_conversation_members m where m.conversation_id=new.conversation_id)x
   where kh_private.agency_contact_member(d.agency_id,x.u);
  if v_people is null then
   select array_agg(m.user_id) into v_people from kh_private.agency_memberships m
    where m.agency_id=d.agency_id and m.state='active' and m.role in('coordinator','admin') and kh_private.agency_contact_member(d.agency_id,m.user_id);
  end if;
  v_client:=kh_private.agency_buyer_name(d);
  perform kh_private.agency_chat_notify(v_people,new.sender_id,d.agency_id,'c:'||new.conversation_id,new.seq,
   jsonb_build_object('route','agency_conversation','agencyId',d.agency_id,'dealId',new.conversation_id),v_client,v_home,v_client);
 end if;
 return new;
end $$;
create trigger kh_agency_message_notice after insert on kh_private.agency_messages for each row execute function kh_private.agency_message_notice();
create function kh_private.agency_team_message_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare v_people uuid[];begin
 if new.sender_id is null then return new;end if;
 select array_agg(m.user_id) into v_people from kh_private.agency_memberships m
  where m.agency_id=new.agency_id and m.state='active' and m.user_id<>new.sender_id and kh_private.agency_contact_member(new.agency_id,m.user_id);
 perform kh_private.agency_chat_notify(v_people,new.sender_id,new.agency_id,'t:'||new.agency_id,new.seq,
  jsonb_build_object('route','team_chat','agencyId',new.agency_id,'dealId',null),
  coalesce((select nullif(btrim(p.display_name),'') from public.profiles p where p.id=new.sender_id),'Persona del equipo'),'',
  coalesce((select trade_name from kh_private.agencies where id=new.agency_id),'Chat del equipo'));
 return new;
end $$;
create trigger kh_agency_team_message_notice after insert on kh_private.agency_team_messages for each row execute function kh_private.agency_team_message_notice();
-- Moving a read cursor marks that chat's notices read up to it.
create function kh_private.agency_chat_read_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare v_chat text:=case when tg_table_name='agency_message_reads' then 'c:'||(to_jsonb(new)->>'conversation_id') else 't:'||(to_jsonb(new)->>'agency_id') end;begin
 perform kh_private.notification_recipient_lock(new.user_id);
 update kh_private.notifications set read_at=clock_timestamp()
  where recipient_id=new.user_id and category='agency_message' and read_at is null and agency_chat=v_chat and agency_message_seq<=new.last_seq;
 return new;
end $$;
create trigger kh_agency_chat_read_notices after insert or update of last_seq on kh_private.agency_message_reads for each row execute function kh_private.agency_chat_read_notices();
create trigger kh_agency_chat_read_notices after insert or update of last_seq on kh_private.agency_team_reads for each row execute function kh_private.agency_chat_read_notices();

-- A notice stays visible only while its recipient can still open that chat.
create function kh_private.agency_chat_notice_current(n kh_private.notifications) returns boolean language sql stable security definer set search_path='' as $$
 select case n.agency_target->>'route'
 when 'team_chat' then kh_private.agency_contact_member(n.agency_id,n.recipient_id)
 when 'buyer_conversation' then exists(select 1 from kh_private.agency_conversations c join kh_private.agency_deals d on d.id=c.deal_id
  where c.id=(n.agency_target->>'dealId')::uuid and d.buyer_id=n.recipient_id and d.contact_kind='account')
 when 'agency_conversation' then exists(select 1 from kh_private.agency_conversations c join kh_private.agency_deals d on d.id=c.deal_id
  where c.id=(n.agency_target->>'dealId')::uuid and d.agency_id=n.agency_id and kh_private.agency_contact_member(n.agency_id,n.recipient_id)
  and kh_private.agency_conversation_role(n.recipient_id,n.agency_id,d,c.id) is not null)
 else false end
$$;
create or replace function kh_private.notification_visible(p_row kh_private.notifications, p_actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_row.recipient_id = p_actor
    and (case when p_row.category='agency' then kh_private.agency_notice_current(p_row)
      when p_row.category='agency_message' then kh_private.agency_chat_notice_current(p_row)
      else (p_row.category = 'alert' or exists (select 1 from public.kh_conversations c where c.id = p_row.conversation_id
      and p_actor in (c.buyer_id, c.seller_id) and p_row.actor_id in (c.buyer_id, c.seller_id))) end)
    and not exists (select 1 from public.kh_user_blocks b
      where (b.blocker_id = p_actor and b.blocked_id = p_row.actor_id)
        or (b.blocker_id = p_row.actor_id and b.blocked_id = p_actor));
$$;
-- Chat messages reach the phone and the chat itself, never the bell.
create or replace function kh_private.notification_in_bell(p_row kh_private.notifications,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_row.category not in('message','agency_message') and kh_private.notification_visible(p_row,p_actor);
$$;
create or replace function kh_private.push_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into kh_private.push_outbox(notification_id,installation_id,recipient_id,session_id,device_revision,token_hash,expires_at)
  select new.id,d.installation_id,new.recipient_id,d.session_id,d.revision,d.token_hash,new.created_at+interval '1 hour'
  from kh_private.push_devices d where d.owner_id=new.recipient_id and d.enabled and d.expo_push_token is not null
    and (new.category<>'agency' or d.supports_agency_notifications) and (new.category<>'agency_message' or d.supports_agency_chat)
    and d.expires_at>clock_timestamp() and kh_private.push_session_live(d.session_id,d.owner_id)
  on conflict(notification_id,installation_id,device_revision) do nothing;
  return new;
end $$;
create or replace function kh_private.push_eligible(p_job kh_private.push_outbox) returns boolean
language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id
    where d.installation_id = p_job.installation_id and d.enabled and d.owner_id = p_job.recipient_id
      and d.session_id = p_job.session_id and d.revision = p_job.device_revision and d.token_hash = p_job.token_hash
      and d.expo_push_token is not null and d.expires_at > clock_timestamp()
      and kh_private.push_session_live(d.session_id, d.owner_id) and n.recipient_id = p_job.recipient_id
      and (n.category<>'agency' or d.supports_agency_notifications and kh_private.agency_notice_deliverable(n))
      and (n.category<>'agency_message' or d.supports_agency_chat)
      and n.read_at is null and kh_private.notification_visible(n, p_job.recipient_id)
      and (kh_private.notification_preferences_json(p_job.recipient_id)->>case n.category when 'message' then 'messages' when 'agency_message' then 'messages' when 'visit' then 'visits' when 'offer' then 'offers' when 'agency' then 'agencies' else 'alerts' end)::boolean);
$$;
create or replace function kh_private.push_payload(p_job kh_private.push_outbox) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('to', d.expo_push_token, 'title', 'KarmaHouse',
    'body', case n.category when 'message' then 'Tienes un nuevo mensaje.' when 'agency_message' then 'Tienes un nuevo mensaje.' when 'visit' then 'Tienes una actualización de visita.'
      when 'offer' then 'Tienes una actualización de oferta.' when 'agency' then 'Tienes una actualización de agencia.' else n.title || '.' end,
    'data', jsonb_build_object('kind', 'karmahouse.notification', 'notificationId', n.id, 'recipientId', n.recipient_id),
    'ttl', 3600, 'channelId', 'karmahouse-updates',
    'tag', case when n.category='agency_message' then 'kh-chat-' || n.agency_chat else 'kh-' || n.id::text end,
    'collapseId', case when n.category='agency_message' then 'kh-chat-' || n.agency_chat else 'kh-' || n.id::text end)
  from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id where d.installation_id = p_job.installation_id;
$$;
create or replace function public.kh_resolve_push_notification(p_actor_id uuid, p_notification_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_notice kh_private.notifications%rowtype;
begin
  select * into v_notice from kh_private.notifications n where n.id = p_notification_id and n.recipient_id = v_actor and kh_private.notification_visible(n, v_actor);
  if not found then raise exception 'KH_PUSH_NOT_FOUND'; end if;
  return jsonb_build_object('notificationId', v_notice.id, 'recipientId', v_actor, 'conversationId', v_notice.conversation_id, 'propertyId', v_notice.property_id)||case when v_notice.category in('agency','agency_message') then jsonb_build_object('agencyTarget',v_notice.agency_target) else '{}'::jsonb end;
end $$;
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
    or (p_payload?'supportsAgencyNotifications' and jsonb_typeof(p_payload->'supportsAgencyNotifications') is distinct from 'boolean')
    or (p_payload?'supportsAgencyChat' and jsonb_typeof(p_payload->'supportsAgencyChat') is distinct from 'boolean')
    or p_payload-ARRAY['installationId','installationSecret','revision','fcmToken','platform','projectId','supportsAgencyNotifications','supportsAgencyChat']<>'{}'::jsonb then raise exception 'KH_PUSH_INVALID'; end if;
  v_id:=(p_payload->>'installationId')::uuid; v_revision:=(p_payload->>'revision')::integer;
  v_secret:=extensions.digest(p_payload->>'installationSecret','sha256'); v_token:=p_payload->>'fcmToken';
  v_operation:=extensions.digest(jsonb_build_object('operation','register','owner',v_actor,'session',v_session,
    'installation',v_id,'revision',v_revision,'token',v_token,'platform','android','project','e054aea9-38b4-4211-826b-521b3cc0be9f')::text,'sha256');
  if coalesce((p_payload->>'supportsAgencyNotifications')::boolean,false) then v_operation:=extensions.digest(encode(v_operation,'hex')||':agency:true','sha256');end if;
  if coalesce((p_payload->>'supportsAgencyChat')::boolean,false) then v_operation:=extensions.digest(encode(v_operation,'hex')||':chat:true','sha256');end if;
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
    fcm_token,expo_push_token,token_hash,enabled,expires_at,exchange_attempts,exchange_next_at,supports_agency_notifications,supports_agency_chat)
  values(v_id,v_secret,v_revision,'register',v_operation,v_actor,v_session,v_token,null,extensions.digest(v_token,'sha256'),
    true,clock_timestamp()+interval '30 days',0,clock_timestamp(),coalesce((p_payload->>'supportsAgencyNotifications')::boolean,false),coalesce((p_payload->>'supportsAgencyChat')::boolean,false))
  on conflict(installation_id) do update set revision=excluded.revision,last_operation=excluded.last_operation,operation_hash=excluded.operation_hash,
    owner_id=excluded.owner_id,session_id=excluded.session_id,fcm_token=excluded.fcm_token,token_hash=excluded.token_hash,
    expo_push_token=case when kh_private.push_devices.fcm_token=excluded.fcm_token then kh_private.push_devices.expo_push_token else null end,
    supports_agency_notifications=excluded.supports_agency_notifications,supports_agency_chat=excluded.supports_agency_chat,enabled=true,expires_at=excluded.expires_at,invalid_reason=null,
    exchange_request_id=null,exchange_attempts=0,exchange_next_at=clock_timestamp(),exchange_deadline_at=null,
    updated_at=clock_timestamp();
  return jsonb_build_object('enabled',true,'revision',v_revision,'platform','android');
end $$;

revoke all on function kh_private.agency_chat_notify(uuid[],uuid,uuid,text,integer,jsonb,text,text,text),kh_private.agency_message_notice(),kh_private.agency_team_message_notice(),
 kh_private.agency_chat_read_notices(),kh_private.agency_chat_notice_current(kh_private.notifications) from public,anon,authenticated;
notify pgrst,'reload schema';
