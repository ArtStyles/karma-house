-- Saved searches and alerts. A search keeps the same filter shape Explorar sends, so a match
-- is evaluated with kh_catalog_where and agrees with what the catalogue would show. Alerts
-- are notifications without a conversation: they open a property instead.

create table kh_private.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null,
  enabled boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index kh_saved_searches_user on kh_private.saved_searches(user_id, created_at desc);
alter table kh_private.saved_searches enable row level security;
revoke all on kh_private.saved_searches from public, anon, authenticated;

-- Canonical filters: only the catalogue keys, validated, so kh_catalog_where can trust them.
create function kh_private.normalize_search_filters(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v jsonb := '{}'::jsonb;
  v_query text;
  v_key text;
  v_ops jsonb;
  v_amen jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or p - array['query','type','province','condition','min_price','max_price','min_area','max_area','min_bedrooms','min_bathrooms','negotiable_only','amenities','operations'] <> '{}'::jsonb
    or coalesce(jsonb_typeof(p->'query'), 'null') not in ('string','null') then
    raise exception 'KH_SEARCH_INVALID';
  end if;
  v_query := btrim(coalesce(p->>'query', ''));
  if char_length(v_query) > 80 then raise exception 'KH_SEARCH_INVALID'; end if;
  v := v || jsonb_build_object('query', lower(kh_private.kh_unaccent(v_query)));
  if coalesce(p->'type', 'null'::jsonb) <> 'null'::jsonb then
    if p->>'type' not in ('Casa','Apartamento') then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('type', p->>'type');
  else v := v || '{"type":null}'::jsonb; end if;
  if coalesce(p->'province', 'null'::jsonb) <> 'null'::jsonb then
    if not kh_private.valid_provinces(array[p->>'province']) then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('province', p->>'province');
  else v := v || '{"province":null}'::jsonb; end if;
  if coalesce(p->'condition', 'null'::jsonb) <> 'null'::jsonb then
    if p->>'condition' not in ('new','good','needs-renovation') then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('condition', p->>'condition');
  else v := v || '{"condition":null}'::jsonb; end if;
  foreach v_key in array array['min_price','max_price','min_area','max_area'] loop
    if coalesce(p->v_key, 'null'::jsonb) <> 'null'::jsonb then
      if jsonb_typeof(p->v_key) <> 'number' then raise exception 'KH_SEARCH_INVALID'; end if;
      if (p->>v_key)::numeric not between 0 and 100000000 then raise exception 'KH_SEARCH_INVALID'; end if;
      v := v || jsonb_build_object(v_key, (p->>v_key)::numeric);
    else v := v || jsonb_build_object(v_key, null); end if;
  end loop;
  if (v->>'min_price')::numeric > (v->>'max_price')::numeric or (v->>'min_area')::numeric > (v->>'max_area')::numeric then
    raise exception 'KH_SEARCH_INVALID';
  end if;
  foreach v_key in array array['min_bedrooms','min_bathrooms'] loop
    if coalesce(p->v_key, 'null'::jsonb) <> 'null'::jsonb then
      if jsonb_typeof(p->v_key) <> 'number' then raise exception 'KH_SEARCH_INVALID'; end if;
      if (p->>v_key)::numeric not between 0 and 20 or (p->>v_key)::numeric <> trunc((p->>v_key)::numeric) then raise exception 'KH_SEARCH_INVALID'; end if;
    end if;
  end loop;
  -- Same shape searchPayload sends: bedrooms default to 0, bathrooms 0 means no filter.
  v := v || jsonb_build_object('min_bedrooms', coalesce((p->>'min_bedrooms')::int, 0),
    'min_bathrooms', nullif((p->>'min_bathrooms')::int, 0));
  if coalesce(p->'negotiable_only', 'null'::jsonb) not in ('null'::jsonb, 'true'::jsonb) then raise exception 'KH_SEARCH_INVALID'; end if;
  v := v || jsonb_build_object('negotiable_only', case when p->'negotiable_only' = 'true'::jsonb then true end);
  v_amen := coalesce(p->'amenities', '[]'::jsonb);
  if jsonb_typeof(v_amen) <> 'array' or jsonb_array_length(v_amen) > 20
    or exists (select 1 from jsonb_array_elements(v_amen) a where jsonb_typeof(a) <> 'string' or char_length(a #>> '{}') > 60) then
    raise exception 'KH_SEARCH_INVALID';
  end if;
  select coalesce(jsonb_agg(distinct lower(kh_private.kh_unaccent(btrim(a)))), '[]'::jsonb) into v_amen
    from jsonb_array_elements_text(v_amen) a where btrim(a) <> '';
  v := v || jsonb_build_object('amenities', v_amen);
  v_ops := coalesce(p->'operations', '["sale","swap"]'::jsonb);
  if jsonb_typeof(v_ops) <> 'array' or jsonb_array_length(v_ops) = 0
    or exists (select 1 from jsonb_array_elements(v_ops) o where jsonb_typeof(o) <> 'string' or o #>> '{}' not in ('sale','swap','wanted')) then
    raise exception 'KH_SEARCH_INVALID';
  end if;
  select jsonb_agg(distinct o order by o) into v_ops from jsonb_array_elements_text(v_ops) o;
  return v || jsonb_build_object('operations', v_ops);
end $$;
revoke all on function kh_private.normalize_search_filters(jsonb) from public, anon, authenticated;

create function kh_private.saved_search_json(s kh_private.saved_searches) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'filters', s.filters, 'enabled', s.enabled,
    'version', s.version, 'createdAt', s.created_at, 'updatedAt', s.updated_at);
$$;
revoke all on function kh_private.saved_search_json(kh_private.saved_searches) from public, anon, authenticated;

create function public.kh_list_saved_searches(p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
-- plpgsql so the actor check runs even when the table has no rows to filter.
declare v_actor uuid := kh_private.chat_actor(p_actor_id);
begin
  return (select coalesce(jsonb_agg(kh_private.saved_search_json(s) order by s.created_at desc, s.id desc), '[]'::jsonb)
    from kh_private.saved_searches s where s.user_id = v_actor);
end $$;

create function public.kh_save_search(p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kh_private.chat_actor(p_actor_id);
  v_id uuid;
  v_name text;
  v_filters jsonb;
  v_expected integer;
  v_row kh_private.saved_searches%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'name') is distinct from 'string'
    or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean'
    or coalesce(p_payload->>'id', '') !~* '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})?$'
    or coalesce(p_payload->>'expectedVersion', '') !~ '^([1-9][0-9]{0,8})?$' then raise exception 'KH_SEARCH_INVALID'; end if;
  v_name := btrim(p_payload->>'name');
  if char_length(v_name) not between 1 and 60 then raise exception 'KH_SEARCH_INVALID'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_filters := kh_private.normalize_search_filters(coalesce(p_payload->'filters', '{}'::jsonb));
  perform pg_advisory_xact_lock(hashtextextended('kh:search:' || v_actor::text, 0));
  if v_id is null then
    if (select count(*) from kh_private.saved_searches where user_id = v_actor) >= 10 then raise exception 'KH_SEARCH_LIMIT'; end if;
    insert into kh_private.saved_searches(user_id, name, filters, enabled)
      values (v_actor, v_name, v_filters, (p_payload->>'enabled')::boolean) returning * into v_row;
  else
    v_expected := nullif(p_payload->>'expectedVersion', '')::integer;
    select * into v_row from kh_private.saved_searches where id = v_id and user_id = v_actor for update;
    if not found then raise exception 'KH_SEARCH_NOT_FOUND'; end if;
    if v_expected is null or v_expected <> v_row.version then raise exception 'KH_SEARCH_CONFLICT'; end if;
    update kh_private.saved_searches set name = v_name, filters = v_filters, enabled = (p_payload->>'enabled')::boolean,
      version = version + 1, updated_at = clock_timestamp() where id = v_id returning * into v_row;
  end if;
  return kh_private.saved_search_json(v_row);
end $$;

create function public.kh_delete_saved_search(p_actor_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id);
begin
  delete from kh_private.saved_searches where id = p_id and user_id = v_actor;
  if not found then raise exception 'KH_SEARCH_NOT_FOUND'; end if;
end $$;

revoke all on function public.kh_list_saved_searches(uuid), public.kh_save_search(uuid, jsonb), public.kh_delete_saved_search(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kh_list_saved_searches(uuid), public.kh_save_search(uuid, jsonb), public.kh_delete_saved_search(uuid, uuid) to authenticated;

-- Notifications: the alert category has no conversation and points at a property.
-- notifications_message_id_key stays: a unique constraint already admits many nulls.
alter table kh_private.notifications
  alter column conversation_id drop not null,
  alter column message_id drop not null,
  add column property_id uuid references public.properties(id) on delete cascade,
  add column saved_search_id uuid references kh_private.saved_searches(id) on delete cascade,
  drop constraint notifications_category_check;
alter table kh_private.notifications
  add constraint notifications_category_check check (category in ('message','visit','offer','alert')),
  add constraint notifications_alert_shape check (
    (category = 'alert' and conversation_id is null and message_id is null and property_id is not null)
    or (category <> 'alert' and conversation_id is not null and message_id is not null and property_id is null and saved_search_id is null));
create unique index kh_notifications_alert_once on kh_private.notifications
  (recipient_id, property_id, coalesce(saved_search_id, '00000000-0000-0000-0000-000000000000'::uuid)) where category = 'alert';

create or replace function kh_private.notification_visible(p_row kh_private.notifications, p_actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_row.recipient_id = p_actor
    and (p_row.category = 'alert' or exists (select 1 from public.kh_conversations c where c.id = p_row.conversation_id
      and p_actor in (c.buyer_id, c.seller_id) and p_row.actor_id in (c.buyer_id, c.seller_id)))
    and not exists (select 1 from public.kh_user_blocks b
      where (b.blocker_id = p_actor and b.blocked_id = p_row.actor_id)
        or (b.blocker_id = p_row.actor_id and b.blocked_id = p_actor));
$$;
create or replace function kh_private.notification_json(p_row kh_private.notifications) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_row.id, 'seq', p_row.seq::text, 'recipientId', p_row.recipient_id,
    'actorId', p_row.actor_id, 'actorName', p_row.actor_name, 'conversationId', p_row.conversation_id,
    'messageId', p_row.message_id, 'negotiationId', p_row.negotiation_id, 'category', p_row.category,
    'propertyId', p_row.property_id, 'savedSearchId', p_row.saved_search_id,
    'propertyTitle', p_row.property_title, 'title', p_row.title, 'body', p_row.body,
    'createdAt', p_row.created_at, 'readAt', p_row.read_at);
$$;

-- Preferences gain `alerts`; an older client that omits it keeps its value.
alter table kh_private.notification_preferences add column alerts boolean not null default true;
create or replace function kh_private.notification_preferences_json(p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('messages', p.messages, 'visits', p.visits, 'offers', p.offers, 'alerts', p.alerts, 'version', p.version)
    from kh_private.notification_preferences p where p.user_id = p_actor),
    '{"messages":true,"visits":true,"offers":true,"alerts":true,"version":0}'::jsonb);
$$;
create or replace function public.kh_save_notification_preferences(p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_current jsonb; v_expected integer; v_alerts boolean;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'messages') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'visits') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'offers') is distinct from 'boolean'
    or (p_payload ? 'alerts' and jsonb_typeof(p_payload->'alerts') is distinct from 'boolean')
    or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number'
    or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
    or p_payload - array['messages','visits','offers','alerts','expectedVersion'] <> '{}'::jsonb then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  v_expected := (p_payload->>'expectedVersion')::integer;
  perform kh_private.notification_recipient_lock(v_actor);
  v_current := kh_private.notification_preferences_json(v_actor);
  v_alerts := coalesce((p_payload->>'alerts')::boolean, (v_current->>'alerts')::boolean);
  if v_current - 'version' = (p_payload - 'expectedVersion') || jsonb_build_object('alerts', v_alerts) then return v_current; end if;
  if (v_current->>'version')::integer <> v_expected then raise exception 'KH_NOTIFICATION_PREFERENCES_CONFLICT'; end if;
  insert into kh_private.notification_preferences(user_id, messages, visits, offers, alerts, version)
  values (v_actor, (p_payload->>'messages')::boolean, (p_payload->>'visits')::boolean, (p_payload->>'offers')::boolean, v_alerts, v_expected + 1)
  on conflict (user_id) do update set messages = excluded.messages, visits = excluded.visits, offers = excluded.offers, alerts = excluded.alerts, version = excluded.version;
  return kh_private.notification_preferences_json(v_actor);
end $$;

-- Listing and summary hide alerts unless the client asks: a 0.1.7 inbox would reject them.
-- The bell keeps excluding messages (notification_in_bell). The one-argument summary, used by
-- kh_read_notification and kh_read_notifications_through, keeps the 0.1.7 count.
-- PostgREST cannot tell overloads with defaults apart, so the old public signatures go away.
drop function public.kh_notification_summary(uuid);
drop function public.kh_list_notifications(uuid, text, boolean, text, integer);
create function kh_private.notification_summary(p_actor uuid, p_include_alerts boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('unreadCount', count(*) filter (where n.read_at is null),
    'readThrough', coalesce(max(n.seq), 0)::text)
  from kh_private.notifications n where n.recipient_id = p_actor and (p_include_alerts or n.category <> 'alert')
    and kh_private.notification_in_bell(n, p_actor);
$$;
create or replace function kh_private.notification_summary(p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select kh_private.notification_summary(p_actor, false);
$$;
revoke all on function kh_private.notification_summary(uuid, boolean) from public, anon, authenticated;
create function public.kh_notification_summary(p_actor_id uuid, p_include_alerts boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select kh_private.notification_summary(kh_private.chat_actor(p_actor_id), coalesce(p_include_alerts, false));
$$;
create function public.kh_list_notifications(p_actor_id uuid, p_before_seq text default null,
  p_unread_only boolean default false, p_category text default null, p_limit integer default 30,
  p_include_alerts boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kh_private.chat_actor(p_actor_id);
  v_alerts boolean := coalesce(p_include_alerts, false);
  v_before bigint;
  v_rows jsonb;
  v_more boolean;
begin
  if p_before_seq is not null then v_before := kh_private.notification_cursor(p_before_seq, false); end if;
  if p_unread_only is null or p_limit is null or p_limit not between 1 and 30
    or p_category is not null and p_category not in ('visit','offer','alert') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  if p_category = 'alert' then v_alerts := true; end if;
  with page as (
    select n.* from kh_private.notifications n where n.recipient_id = v_actor
      and (v_alerts or n.category <> 'alert')
      and kh_private.notification_in_bell(n, v_actor) and (v_before is null or n.seq < v_before)
      and (not p_unread_only or n.read_at is null) and (p_category is null or n.category = p_category)
    order by n.seq desc limit p_limit + 1
  ), numbered as (select p.*, row_number() over (order by p.seq desc) as position from page p)
  select coalesce(jsonb_agg(kh_private.notification_json(n) order by n.seq desc) filter (where x.position <= p_limit), '[]'::jsonb), count(*) > p_limit
    into v_rows, v_more from numbered x join kh_private.notifications n on n.id = x.id;
  return kh_private.notification_summary(v_actor, v_alerts) || jsonb_build_object('items', v_rows, 'nextCursor', case when v_more then v_rows->(p_limit - 1)->>'seq' else null end);
end $$;
revoke all on function public.kh_notification_summary(uuid, boolean), public.kh_list_notifications(uuid, text, boolean, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.kh_notification_summary(uuid, boolean), public.kh_list_notifications(uuid, text, boolean, text, integer, boolean) to authenticated;

-- Push: the alert preference gates delivery, the body names the alert, and a tap resolves to a property.
create or replace function kh_private.push_eligible(p_job kh_private.push_outbox) returns boolean
language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id
    where d.installation_id = p_job.installation_id and d.enabled and d.owner_id = p_job.recipient_id
      and d.session_id = p_job.session_id and d.revision = p_job.device_revision and d.token_hash = p_job.token_hash
      and d.expo_push_token is not null and d.expires_at > clock_timestamp()
      and kh_private.push_session_live(d.session_id, d.owner_id) and n.recipient_id = p_job.recipient_id
      and n.read_at is null and kh_private.notification_visible(n, p_job.recipient_id)
      and (kh_private.notification_preferences_json(p_job.recipient_id)->>case n.category when 'message' then 'messages' when 'visit' then 'visits' when 'offer' then 'offers' else 'alerts' end)::boolean);
$$;
create or replace function kh_private.push_payload(p_job kh_private.push_outbox) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('to', d.expo_push_token, 'title', 'KarmaHouse',
    'body', case n.category when 'message' then 'Tienes un nuevo mensaje.' when 'visit' then 'Tienes una actualización de visita.'
      when 'offer' then 'Tienes una actualización de oferta.' else n.title || '.' end,
    'data', jsonb_build_object('kind', 'karmahouse.notification', 'notificationId', n.id, 'recipientId', n.recipient_id),
    'ttl', 3600, 'channelId', 'karmahouse-updates', 'tag', 'kh-' || n.id::text, 'collapseId', 'kh-' || n.id::text)
  from kh_private.push_devices d join kh_private.notifications n on n.id = p_job.notification_id where d.installation_id = p_job.installation_id;
$$;
create or replace function public.kh_resolve_push_notification(p_actor_id uuid, p_notification_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_notice kh_private.notifications%rowtype;
begin
  select * into v_notice from kh_private.notifications n where n.id = p_notification_id and n.recipient_id = v_actor and kh_private.notification_visible(n, v_actor);
  if not found then raise exception 'KH_PUSH_NOT_FOUND'; end if;
  return jsonb_build_object('notificationId', v_notice.id, 'recipientId', v_actor, 'conversationId', v_notice.conversation_id, 'propertyId', v_notice.property_id);
end $$;

-- Matching. Same prefix tsquery kh_search_properties builds; no substring fallback.
create function kh_private.kh_catalog_tsquery(p_query text) returns tsquery
language plpgsql immutable set search_path = '' as $$
declare v_terms text[];
begin
  if coalesce(p_query, '') = '' then return null; end if;
  v_terms := array_remove(regexp_split_to_array(btrim(regexp_replace(p_query, '[^a-z0-9 ]', ' ', 'g')), '\s+'), '');
  if cardinality(v_terms) = 0 then return null; end if;
  return to_tsquery('spanish', array_to_string(v_terms, ':* & ') || ':*');
end $$;
revoke all on function kh_private.kh_catalog_tsquery(text) from public, anon, authenticated;

create function kh_private.property_matches(p_filters jsonb, p_id uuid) returns boolean
language plpgsql stable set search_path = 'public, kh_private, pg_catalog' as $$
declare v_tsquery tsquery := kh_private.kh_catalog_tsquery(p_filters->>'query'); v_found boolean;
begin
  execute 'select exists (select 1 from public.properties p where ' || kh_private.kh_catalog_where(p_filters)
    || ' and p.id = $2' || case when v_tsquery is null then '' else ' and p.search_vector @@ $3' end || ')'
    into v_found using p_filters, p_id, v_tsquery;
  return v_found;
end $$;
revoke all on function kh_private.property_matches(jsonb, uuid) from public, anon, authenticated;

create function kh_private.wanted_filters(p public.properties) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('province', p.province, 'type', p.type, 'max_price', p.price, 'min_bedrooms', p.bedrooms, 'operations', '["sale","swap"]'::jsonb);
$$;
revoke all on function kh_private.wanted_filters(public.properties) from public, anon, authenticated;

create function kh_private.alert_insert(p_recipient uuid, p_actor uuid, p_property public.properties, p_search_id uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor_name text;
begin
  if p_recipient = p_actor then return; end if;
  if exists (select 1 from public.kh_user_blocks b where (b.blocker_id = p_actor and b.blocked_id = p_recipient) or (b.blocker_id = p_recipient and b.blocked_id = p_actor)) then return; end if;
  -- Serialize before allocating seq, as notification_from_message does.
  perform kh_private.notification_recipient_lock(p_recipient);
  if not (kh_private.notification_preferences_json(p_recipient)->>'alerts')::boolean then return; end if;
  select display_name into v_actor_name from public.profiles where id = p_actor;
  insert into kh_private.notifications(seq, recipient_id, actor_id, property_id, saved_search_id, category, actor_name, property_title, title, body)
  values (nextval('kh_private.notification_seq'::regclass), p_recipient, p_actor, p_property.id, p_search_id, 'alert', coalesce(v_actor_name, 'KarmaHouse'), p_property.title, p_title, p_body)
  on conflict do nothing;
end $$;
revoke all on function kh_private.alert_insert(uuid, uuid, public.properties, uuid, text, text) from public, anon, authenticated;

create function kh_private.alert_on_approval(p public.properties) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_price text := to_char(p.price, 'FM999,999,999');
  s kh_private.saved_searches%rowtype;
  w public.properties%rowtype;
begin
  if p.operation in ('sale', 'swap') then
    for s in select * from kh_private.saved_searches where enabled and user_id <> p.owner_id order by created_at loop
      if kh_private.property_matches(s.filters, p.id) then
        perform kh_private.alert_insert(s.user_id, p.owner_id, p, s.id, 'Nueva vivienda para tu búsqueda', s.name || ': ' || p.title || ', ' || v_price || ' USD, ' || p.location);
      end if;
    end loop;
    for w in select * from public.properties where operation = 'wanted' and moderation = 'approved' and availability = 'active' and owner_id <> p.owner_id order by created_at loop
      if kh_private.property_matches(kh_private.wanted_filters(w), p.id) then
        perform kh_private.alert_insert(w.owner_id, p.owner_id, p, null, 'Una vivienda encaja con lo que buscas', p.title || ', ' || v_price || ' USD, ' || p.location);
      end if;
    end loop;
  elsif p.operation = 'wanted' then
    for w in select * from public.properties where operation in ('sale', 'swap') and moderation = 'approved' and availability = 'active' and owner_id <> p.owner_id order by created_at loop
      if kh_private.property_matches(kh_private.wanted_filters(p), w.id) then
        perform kh_private.alert_insert(w.owner_id, p.owner_id, p, null, 'Alguien busca lo que publicas', p.title || ', hasta ' || v_price || ' USD, ' || p.location);
      end if;
    end loop;
  end if;
end $$;
revoke all on function kh_private.alert_on_approval(public.properties) from public, anon, authenticated;

create or replace function public.kh_review_property(p_id uuid, p_decision text, p_note text, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype; v_note text := nullif(btrim(p_note), '');
begin
  if auth.uid() is null or not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'KH_INVALID_DECISION'; end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) > 1000) then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
  select * into v_property from public.properties where id = p_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.owner_id = auth.uid() then raise exception 'KH_CANNOT_REVIEW_OWN_PROPERTY'; end if;
  if p_expected_version is null or v_property.version <> p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_property.moderation <> 'pending' then raise exception 'KH_NOT_PENDING'; end if;
  if p_decision = 'approved' then
    perform kh_private.validate_photos(v_property.owner_id, v_property.client_request_id, v_property.photo_paths,
      case when v_property.operation = 'wanted' then 'draft' else 'pending' end);
    v_note := null;
  end if;
  update public.properties set moderation = p_decision, review_note = v_note, updated_at = now(), version = version + 1 where id = p_id returning * into v_property;
  -- ponytail: every saved search and wanted ad is evaluated on each approval; add a cap or a
  -- queue if one approval starts producing hundreds of alerts.
  if p_decision = 'approved' and v_property.availability = 'active' then perform kh_private.alert_on_approval(v_property); end if;
end $$;
-- CREATE OR REPLACE preserves the existing restricted EXECUTE grants.

notify pgrst, 'reload schema';
