# Búsquedas guardadas y alertas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar una búsqueda desde Explorar y recibir un aviso (campana y push) cuando se apruebe una vivienda que encaje; los «busco» avisan solos a su autor y avisan a los vendedores cuyo anuncio encaja.

**Architecture:** Tabla `kh_private.saved_searches` con filtros en la misma forma que el payload de Explorar. Al aprobar en `kh_review_property`, `kh_private.alert_on_approval` evalúa cada búsqueda con `kh_catalog_where(filtros) and p.id = <nueva>` y crea avisos de categoría `alert` (sin conversación, con `property_id`). El cliente añade el módulo `src/searches/`, la pantalla «Mis alertas», el botón «Guardar búsqueda» y la categoría `alert` en avisos y push.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React Native / Expo Router, `node --test`.

Spec: `docs/superpowers/specs/2026-09-28-search-alerts-design.md`.

**Contexto para quien no conoce el repo**

- `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`. Tests importan `.ts` con extensión; módulos de dominio sin React Native. `tests/` fuera del typecheck.
- Node del sistema sin red: scripts contra Supabase con `N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/...` (Git Bash). `scripts/apply-*.mjs` sin `--commit` aplican migración y suite en una transacción que se revierte. Nunca `--commit` sin permiso del usuario.
- Código y comentarios en inglés; interfaz y documentos en español; commits `feat:`/`fix:`/`docs:` en inglés con última línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Avisos: `src/notifications/{types,domain,repository,controller,NotificationsProvider,useNotificationCenter}.ts(x)`, tarjeta `src/components/notifications/NotificationCard.tsx`, pantallas `NotificationsScreen.tsx` y `NotificationSettingsScreen.tsx`. El repositorio llama RPC con `p_actor_id` desde el contexto (`MessagingRequestContext { userId, accessToken, signal, checkpoint() }`) y cabecera `Authorization`. Push: `src/push/{controller,repository}.ts`, `PushProvider.native.tsx`.
- Servidor: avisos en `supabase/migrations/20260920000400_notifications.sql` (tabla, `notification_from_message`, `kh_list_notifications`, `kh_notification_summary`, preferencias), push en `20260920000500_android_push.sql` (`push_eligible`, `kh_resolve_push_notification`), catálogo en `20260921000100_catalog_pagination.sql` (`kh_catalog_where`, `kh_search_properties`), operaciones en `20260926000100_operations.sql` (`kh_review_property`). PostgREST no distingue sobrecargas con parámetros por defecto: para cambiar la firma de una función hay que `drop function` y volver a crearla con sus `grant`.
- Filtros de Explorar: `ListingFilters` en `src/domain/listings.ts`; su traducción al servidor en `searchPayload` (`src/catalog/query.ts`), que produce `{ query, type, province, condition, min_price, max_price, min_area, max_area, min_bedrooms, min_bathrooms, negotiable_only, amenities, operations, sort, cursor, with_total, limit }`.

**Estructura de archivos**

- Create `supabase/migrations/20260928000100_search_alerts.sql`, `supabase/tests/search_alerts.sql`, `scripts/apply-search-alerts.mjs`, `scripts/verify-search-alerts.mjs`.
- Create `src/searches/types.ts`, `src/searches/domain.ts`, `src/searches/repository.ts`, `src/searches/useSavedSearches.ts`, `src/screens/SavedSearchesScreen.tsx`, `src/app/saved-searches.tsx`, `src/components/SaveSearchSheet.tsx`.
- Modify `src/notifications/types.ts`, `src/notifications/repository.ts`, `src/notifications/preferenceDraft.ts`, `src/components/notifications/NotificationCard.tsx`, `src/screens/NotificationsScreen.tsx`, `src/screens/NotificationSettingsScreen.tsx`, `src/push/repository.ts`, `src/push/controller.ts`, `src/push/PushProvider.native.tsx`, `src/screens/ExploreScreen.tsx`, `src/screens/ProfileScreen.tsx`, `src/screens/DetailScreen.tsx`.
- Create `tests/search-alerts.test.ts`; modify `tests/notifications-repository.test.ts`, `tests/push-*.test.ts` si aplica.
- Create `docs/search-alerts-verification.md`; modify `README.md`, `docs/growth-roadmap.md`.

---

### Task 1: Migración, suite SQL y scripts

**Files:** Create `supabase/migrations/20260928000100_search_alerts.sql`, `supabase/tests/search_alerts.sql`, `scripts/apply-search-alerts.mjs`, `scripts/verify-search-alerts.mjs`.

- [ ] **Step 1: Migración**

```sql
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
  v_query text := btrim(coalesce(p->>'query',''));
  v_num numeric;
  v_ops jsonb;
  v_amen jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or p - array['query','type','province','condition','min_price','max_price','min_area','max_area','min_bedrooms','min_bathrooms','negotiable_only','amenities','operations'] <> '{}'::jsonb then
    raise exception 'KH_SEARCH_INVALID';
  end if;
  if char_length(v_query) > 80 then raise exception 'KH_SEARCH_INVALID'; end if;
  v := v || jsonb_build_object('query', lower(kh_private.kh_unaccent(v_query)));
  if p->'type' is not null and p->'type' <> 'null'::jsonb then
    if p->>'type' not in ('Casa','Apartamento') then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('type', p->>'type');
  else v := v || '{"type":null}'::jsonb; end if;
  if p->'province' is not null and p->'province' <> 'null'::jsonb then
    if not kh_private.valid_provinces(array[p->>'province']) then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('province', p->>'province');
  else v := v || '{"province":null}'::jsonb; end if;
  if p->'condition' is not null and p->'condition' <> 'null'::jsonb then
    if p->>'condition' not in ('new','good','needs-renovation') then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('condition', p->>'condition');
  else v := v || '{"condition":null}'::jsonb; end if;
  foreach v_num in array array[0] loop null; end loop; -- placeholder to keep plpgsql happy with the numeric loop below
  for i in 1..4 loop
    declare k text := (array['min_price','max_price','min_area','max_area'])[i]; begin
      if p->k is not null and p->k <> 'null'::jsonb then
        if jsonb_typeof(p->k) <> 'number' or (p->>k)::numeric < 0 or (p->>k)::numeric > 100000000 then raise exception 'KH_SEARCH_INVALID'; end if;
        v := v || jsonb_build_object(k, (p->>k)::numeric);
      else v := v || jsonb_build_object(k, null); end if;
    end;
  end loop;
  if (v->>'min_price') is not null and (v->>'max_price') is not null and (v->>'min_price')::numeric > (v->>'max_price')::numeric then raise exception 'KH_SEARCH_INVALID'; end if;
  if (v->>'min_area') is not null and (v->>'max_area') is not null and (v->>'min_area')::numeric > (v->>'max_area')::numeric then raise exception 'KH_SEARCH_INVALID'; end if;
  if p->'min_bedrooms' is not null and p->'min_bedrooms' <> 'null'::jsonb then
    if jsonb_typeof(p->'min_bedrooms') <> 'number' or (p->>'min_bedrooms')::numeric not between 0 and 20 or (p->>'min_bedrooms')::numeric <> trunc((p->>'min_bedrooms')::numeric) then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('min_bedrooms', (p->>'min_bedrooms')::int);
  else v := v || '{"min_bedrooms":0}'::jsonb; end if;
  if p->'min_bathrooms' is not null and p->'min_bathrooms' <> 'null'::jsonb then
    if jsonb_typeof(p->'min_bathrooms') <> 'number' or (p->>'min_bathrooms')::numeric not between 0 and 20 or (p->>'min_bathrooms')::numeric <> trunc((p->>'min_bathrooms')::numeric) then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || jsonb_build_object('min_bathrooms', case when (p->>'min_bathrooms')::int > 0 then (p->>'min_bathrooms')::int end);
  else v := v || '{"min_bathrooms":null}'::jsonb; end if;
  if p->'negotiable_only' is not null and p->'negotiable_only' <> 'null'::jsonb then
    if p->'negotiable_only' <> 'true'::jsonb then raise exception 'KH_SEARCH_INVALID'; end if;
    v := v || '{"negotiable_only":true}'::jsonb;
  else v := v || '{"negotiable_only":null}'::jsonb; end if;
  v_amen := coalesce(p->'amenities', '[]'::jsonb);
  if jsonb_typeof(v_amen) <> 'array' or jsonb_array_length(v_amen) > 20
    or exists (select 1 from jsonb_array_elements(v_amen) a where jsonb_typeof(a) <> 'string' or char_length(a #>> '{}') > 60) then raise exception 'KH_SEARCH_INVALID'; end if;
  select coalesce(jsonb_agg(distinct lower(kh_private.kh_unaccent(btrim(a)))), '[]'::jsonb) into v_amen
    from jsonb_array_elements_text(v_amen) a where btrim(a) <> '';
  v := v || jsonb_build_object('amenities', v_amen);
  v_ops := coalesce(p->'operations', '["sale","swap"]'::jsonb);
  if jsonb_typeof(v_ops) <> 'array' or jsonb_array_length(v_ops) = 0
    or exists (select 1 from jsonb_array_elements_text(v_ops) o where o not in ('sale','swap','wanted')) then raise exception 'KH_SEARCH_INVALID'; end if;
  select jsonb_agg(distinct o order by o) into v_ops from jsonb_array_elements_text(v_ops) o;
  v := v || jsonb_build_object('operations', v_ops);
  return v;
end $$;
revoke all on function kh_private.normalize_search_filters(jsonb) from public, anon, authenticated;

create function kh_private.saved_search_json(s kh_private.saved_searches) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'filters', s.filters, 'enabled', s.enabled,
    'version', s.version, 'createdAt', s.created_at, 'updatedAt', s.updated_at);
$$;
revoke all on function kh_private.saved_search_json(kh_private.saved_searches) from public, anon, authenticated;

create function public.kh_list_saved_searches(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(kh_private.saved_search_json(s) order by s.created_at desc), '[]'::jsonb)
  from kh_private.saved_searches s where s.user_id = kh_private.chat_actor(p_actor_id);
$$;

create function public.kh_save_search(p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kh_private.chat_actor(p_actor_id);
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_name text := btrim(p_payload->>'name');
  v_filters jsonb;
  v_enabled boolean;
  v_expected integer;
  v_row kh_private.saved_searches%rowtype;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or v_name is null or char_length(v_name) not between 1 and 60
    or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'KH_SEARCH_INVALID'; end if;
  v_filters := kh_private.normalize_search_filters(coalesce(p_payload->'filters', '{}'::jsonb));
  v_enabled := (p_payload->>'enabled')::boolean;
  perform pg_advisory_xact_lock(hashtextextended('kh:search:'||v_actor::text, 0));
  if v_id is null then
    if (select count(*) from kh_private.saved_searches where user_id = v_actor) >= 10 then raise exception 'KH_SEARCH_LIMIT'; end if;
    insert into kh_private.saved_searches(user_id, name, filters, enabled) values (v_actor, v_name, v_filters, v_enabled) returning * into v_row;
  else
    v_expected := nullif(p_payload->>'expectedVersion','')::integer;
    select * into v_row from kh_private.saved_searches where id = v_id and user_id = v_actor for update;
    if not found then raise exception 'KH_SEARCH_NOT_FOUND'; end if;
    if v_expected is null or v_expected <> v_row.version then raise exception 'KH_SEARCH_CONFLICT'; end if;
    update kh_private.saved_searches set name = v_name, filters = v_filters, enabled = v_enabled,
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
alter table kh_private.notifications
  alter column conversation_id drop not null,
  alter column message_id drop not null,
  add column property_id uuid references public.properties(id) on delete cascade,
  add column saved_search_id uuid references kh_private.saved_searches(id) on delete cascade;
alter table kh_private.notifications drop constraint notifications_category_check;
alter table kh_private.notifications
  add constraint notifications_category_check check (category in ('message','visit','offer','alert')),
  add constraint notifications_alert_shape check (
    (category = 'alert' and conversation_id is null and message_id is null and property_id is not null)
    or (category <> 'alert' and conversation_id is not null and message_id is not null and property_id is null and saved_search_id is null));
-- message_id used to be a plain unique column; nulls are fine in a unique index anyway, but the
-- original constraint name is unknown: recreate it explicitly as a partial index.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint where conrelid = 'kh_private.notifications'::regclass and contype = 'u'
    and pg_get_constraintdef(oid) like '%(message_id)%';
  if v_name is not null then execute format('alter table kh_private.notifications drop constraint %I', v_name); end if;
end $$;
create unique index kh_notifications_message on kh_private.notifications(message_id) where message_id is not null;
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
-- PostgREST cannot tell overloads with defaults apart, so the old signatures go away.
drop function public.kh_notification_summary(uuid);
drop function public.kh_list_notifications(uuid, text, boolean, text, integer);
create function kh_private.notification_summary(p_actor uuid, p_include_alerts boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('unreadCount', count(*) filter (where n.read_at is null),
    'readThrough', coalesce(max(n.seq), 0)::text)
  from kh_private.notifications n where n.recipient_id = p_actor and (p_include_alerts or n.category <> 'alert')
    and kh_private.notification_visible(n, p_actor);
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
    or p_category is not null and p_category not in ('message','visit','offer','alert') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  if p_category = 'alert' then v_alerts := true; end if;
  with page as (
    select n.* from kh_private.notifications n where n.recipient_id = v_actor
      and (v_alerts or n.category <> 'alert')
      and kh_private.notification_visible(n, v_actor) and (v_before is null or n.seq < v_before)
      and (not p_unread_only or n.read_at is null) and (p_category is null or n.category = p_category)
    order by n.seq desc limit p_limit + 1
  ), numbered as (select p.*, row_number() over (order by p.seq desc) as position from page p)
  select coalesce(jsonb_agg(kh_private.notification_json(n) order by n.seq desc) filter (where x.position <= p_limit), '[]'::jsonb), count(*) > p_limit
    into v_rows, v_more from numbered x join kh_private.notifications n on n.id = x.id;
  return kh_private.notification_summary(v_actor, v_alerts) || jsonb_build_object('items', v_rows, 'nextCursor', case when v_more then v_rows->(p_limit - 1)->>'seq' else null end);
end $$;
revoke all on function public.kh_notification_summary(uuid, boolean), public.kh_list_notifications(uuid, text, boolean, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.kh_notification_summary(uuid, boolean), public.kh_list_notifications(uuid, text, boolean, text, integer, boolean) to authenticated;

-- Push: the alert preference gates delivery, and a tap resolves to a property.
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
create or replace function public.kh_resolve_push_notification(p_actor_id uuid, p_notification_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := kh_private.chat_actor(p_actor_id); v_notice kh_private.notifications%rowtype;
begin
  select * into v_notice from kh_private.notifications n where n.id = p_notification_id and n.recipient_id = v_actor and kh_private.notification_visible(n, v_actor);
  if not found then raise exception 'KH_PUSH_NOT_FOUND'; end if;
  return jsonb_build_object('notificationId', v_notice.id, 'recipientId', v_actor, 'conversationId', v_notice.conversation_id, 'propertyId', v_notice.property_id);
end $$;

-- Matching. The prefix tsquery is the one kh_search_properties builds; extracted so both agree.
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
declare v_where text := kh_private.kh_catalog_where(p_filters); v_tsquery tsquery := kh_private.kh_catalog_tsquery(p_filters->>'query'); v_found boolean;
begin
  if v_tsquery is null then
    execute 'select exists (select 1 from public.properties p where ' || v_where || ' and p.id = $2)' into v_found using p_filters, p_id;
  else
    execute 'select exists (select 1 from public.properties p where ' || v_where || ' and p.id = $2 and p.search_vector @@ $3)' into v_found using p_filters, p_id, v_tsquery;
  end if;
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
declare v_price text := trim(to_char(p.price, 'FM999,999,999')); s record; w record; o record;
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
    for o in select * from public.properties where operation in ('sale', 'swap') and moderation = 'approved' and availability = 'active' and owner_id <> p.owner_id order by created_at loop
      if kh_private.property_matches(kh_private.wanted_filters(p), o.id) then
        perform kh_private.alert_insert(o.owner_id, p.owner_id, p, null, 'Alguien busca lo que publicas', p.title || ', hasta ' || v_price || ' USD, ' || p.location);
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

notify pgrst, 'reload schema';
```

Nota sobre el bucle `for i in 1..4` con `declare` anidado: es PL/pgSQL válido (bloque interno). Elimina la línea `foreach v_num ... -- placeholder` si el compilador se queja; solo sirve de recordatorio y no aporta nada.

Comprueba antes de ejecutar: el nombre real del `check` de categoría (`notifications_category_check` es el nombre automático de `category text not null check(...)`; verifica con `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='kh_private.notifications'::regclass`) y si el `check(category<>'message' or negotiation_id is null)` sigue válido (sí). Verifica también que `kh_private.kh_unaccent` existe (lo usa `kh_catalog_where`).

- [ ] **Step 2: Suite `supabase/tests/search_alerts.sql`**

Sigue `supabase/tests/operations.sql` (helpers `ops_assert`, `ops_error`, `ops_as`, actores sintéticos `28000000-...`, admin en `kh_admins`, `set local role authenticated`). Escenario:

1. Usuarios: vendedor A (`…0001`), comprador B (`…0002`), admin C (`…0003`, en `kh_admins`), vendedor D (`…0004`) con bloqueo mutuo con A. Foto en `storage.objects` para A (`…0001/alert-sale/photo.jpg`) y para D.
2. Como B: `kh_save_search` con `{name:'Casas en La Habana', filters:{province:'La Habana', max_price:100000, type:'Casa'}, enabled:true}` → id `s1`; segunda `{name:'Matanzas', filters:{province:'Matanzas'}}` → `s2`; filtros inválidos (`{foo:1}`, `{min_price:5,max_price:1}`, `{operations:[]}`) → `KH_SEARCH_INVALID`; editar `s2` con `expectedVersion` erróneo → `KH_SEARCH_CONFLICT`; correcto → `version=2`; crear 9 más y la undécima → `KH_SEARCH_LIMIT`; `kh_list_saved_searches` devuelve 10 con `s1` incluida; borrar una de relleno → `KH_SEARCH_NOT_FOUND` al borrarla de nuevo.
3. Como B: `kh_save_property` de un busco (`wanted`, La Habana, tipo nulo, precio 90000, 2 hab). Como C: `kh_review_property` aprobado.
4. Como D: `kh_save_property` venta pendiente (La Habana, Casa, 80000, 3 hab, foto). Como C: aprobar. Asserts: B tiene aviso `alert` con `savedSearchId = s1` (venta encaja con s1), ningún aviso con `s2`; B tiene aviso por su busco (`savedSearchId` nulo) — mismo `property_id`, dos filas; nada para A (bloqueo con D no aplica aquí, A no tiene búsquedas). `kh_list_notifications(B)` sin `p_include_alerts` → 0 ítems; con `true` → 2; `kh_notification_summary(B, true).unreadCount = 2`, sin flag = 0.
5. Como A: venta aprobada por C (La Habana, Casa, 70000, 2 hab). Como B guarda búsqueda `s3` idéntica a `s1`. Aprobación posterior de otra venta de A → B recibe avisos para `s1` y `s3` y busco; volver a insertar (llamar `kh_private.alert_on_approval` directamente como postgres con la misma fila) no duplica (conteo igual).
6. Preferencia: B guarda `alerts=false` (`kh_save_notification_preferences` con `alerts`); nueva venta aprobada de A → sin aviso nuevo para B. Cliente viejo: `kh_save_notification_preferences` sin `alerts` conserva `false`.
7. Aviso al vendedor: como B (alerts=true de nuevo) publica otro busco que encaja con la venta de A (La Habana, ≤ 100000, ≥ 2 hab) y C lo aprueba → A recibe «Alguien busca lo que publicas» con `property_id` = busco; D (bloqueado con… no, D no está bloqueado con B) también recibe uno si su venta encaja; el dueño del busco (B) no recibe nada por su propio busco.
8. Bloqueo: A bloquea a B (`kh_set_user_block`); nuevo busco de B aprobado que encaja → A sin aviso nuevo.
9. `kh_resolve_push_notification(B, <alert id>)` devuelve `propertyId` no nulo y `conversationId` nulo.

Usa `select pg_temp.ops_assert(...)` para cada punto. Todo dentro de `begin; … rollback;`.

- [ ] **Step 3: Scripts**

`scripts/apply-search-alerts.mjs`: copia de `scripts/apply-operations.mjs` con las rutas nuevas y el inventario `users, properties, (select count(*) from kh_private.notifications) as notifications, (select count(*) from kh_private.saved_searches) as searches`. Cabecera: la migración se aplica una vez (drop/create de funciones y columnas nuevas).

`scripts/verify-search-alerts.mjs`: comprueba que existen `kh_private.saved_searches`, las columnas `property_id`/`saved_search_id`/`alerts`, las funciones `kh_save_search`, `kh_list_saved_searches`, `kh_delete_saved_search`, `kh_private.alert_on_approval`, y que `kh_list_notifications` tiene 6 parámetros (`pg_proc.pronargs`); luego ejecuta la suite.

- [ ] **Step 4: Ensayo**

`"$N" scripts/apply-search-alerts.mjs` → `suite superada; nada se aplicó` e `inventoryUnchanged: true`. Itera hasta que pase. Sin `--commit`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000100_search_alerts.sql supabase/tests/search_alerts.sql scripts/apply-search-alerts.mjs scripts/verify-search-alerts.mjs
git commit -m "feat: save searches and raise alerts when a listing is approved

Saved searches keep the catalogue filter shape, so a match is evaluated
with kh_catalog_where and agrees with Explorar. Approval fans out alerts
to matching searches, to wanted ads that the listing fits, and to sellers
whose active listing fits a new wanted ad. Alerts are notifications
without a conversation; older clients never see them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Avisos en el cliente — tipos, decodificación, tarjeta, preferencias, push

**Files:** Modify `src/notifications/types.ts`, `src/notifications/repository.ts`, `src/notifications/preferenceDraft.ts`, `src/components/notifications/NotificationCard.tsx`, `src/screens/NotificationsScreen.tsx`, `src/screens/NotificationSettingsScreen.tsx`, `src/push/repository.ts`, `src/push/controller.ts`, `src/push/PushProvider.native.tsx`; tests `tests/notifications-repository.test.ts`, `tests/push-repository.test.ts` (o el que cubra `resolve`), `tests/search-alerts.test.ts`.

- [ ] **Step 1: Tests primero**

En `tests/notifications-repository.test.ts` añade:
```ts
test('alerts decode without a conversation, list with the flag and preferences carry alerts', async () => {
  const alert = { ...row, id: '77000000-0000-4000-8000-000000000009', seq: '9007199254740999', conversationId: null, messageId: null, negotiationId: null, category: 'alert', propertyId: id, savedSearchId: null, title: 'Nueva vivienda para tu búsqueda', body: 'Casas: Casa, 50,000 USD, Vedado' };
  assert.equal(decodeNotification(alert).propertyId, id);
  assert.throws(() => decodeNotification({ ...alert, propertyId: null }));
  assert.throws(() => decodeNotification({ ...row, propertyId: id }), 'a message never carries a property');
  const f = fixture({ ...page, items: [alert], readThrough: alert.seq });
  await f.repo.list({ category: 'alert' }, f.context);
  assert.equal(f.calls[0].args.p_include_alerts, true); assert.equal(f.calls[0].args.p_category, 'alert');
  const g = fixture({ unreadCount: 0, readThrough: '0' }); await g.repo.summary(g.context); assert.equal(g.calls[0].args.p_include_alerts, true);
  const h = fixture({ messages: true, visits: true, offers: true, alerts: false, version: 3 });
  assert.deepEqual(await h.repo.preferences(h.context), { messages: true, visits: true, offers: true, alerts: false, version: 3 });
});
```
Ajusta `decodeNotification` en `row` existente: los ítems existentes deben seguir decodificando (añade `propertyId: null, savedSearchId: null` a `row` si la decodificación los exige; mejor que la decodificación los trate como opcionales nulos por defecto).

En el test de push que cubre `resolve` (busca `kh_resolve_push_notification` en `tests/push-*.test.ts`): añade un caso en que la respuesta trae `conversationId: null, propertyId: <uuid>` y `resolve` devuelve `{ notificationId, recipientId, conversationId: null, propertyId }`; y en el test del controlador (si existe uno para la navegación) que `navigate` recibe `{ propertyId }`.

- [ ] **Step 2: Tipos y decodificación**

- `types.ts`: `NotificationCategory = 'message' | 'visit' | 'offer' | 'alert'`; `AppNotification.conversationId: string | null; messageId: string | null; propertyId: string | null; savedSearchId: string | null;` `NotificationPreferences.alerts: boolean`; `SaveNotificationPreferencesInput.alerts: boolean`.
- `repository.ts` `decodeNotification`:
```ts
  const alert = item.category === 'alert';
  const propertyId = (item as { propertyId?: unknown }).propertyId ?? null;
  const savedSearchId = (item as { savedSearchId?: unknown }).savedSearchId ?? null;
  if (![item.id, item.recipientId, item.actorId].every(isUuid) || item.actorId === item.recipientId || !isNotificationSequence(item.seq)
    || !['message', 'visit', 'offer', 'alert'].includes(item.category)
    || (alert ? item.conversationId !== null || item.messageId !== null || item.negotiationId !== null || !isUuid(propertyId) || (savedSearchId !== null && !isUuid(savedSearchId))
      : ![item.conversationId, item.messageId].every(isUuid) || propertyId !== null || savedSearchId !== null)
    || (item.negotiationId !== null && !isUuid(item.negotiationId))
    || (item.category === 'message' && item.negotiationId !== null)
    || … (texto, fechas como hoy)) throw invalid();
  return { …, propertyId: propertyId as string | null, savedSearchId: savedSearchId as string | null };
```
- `list`: acepta `category: 'alert'`; envía `p_include_alerts: true` siempre. `summary`: `rpc('kh_notification_summary', { p_include_alerts: true }, context)`.
- `decodePreferences`: exige `alerts` booleano; `savePreferences` envía `alerts`.
- `preferenceDraft.ts`: compara también `alerts`.

- [ ] **Step 3: Tarjeta y pantallas**

- `NotificationCard`: `categoryIcons.alert = 'search-outline'`, `categoryLabels.alert = 'Alerta'`; botón `item.category === 'alert' ? 'Ver vivienda' : 'Abrir conversación'`.
- `NotificationsScreen`: `onOpen={() => item.category === 'alert' ? router.push(`/property/${item.propertyId}`) : router.push(`/messages/${item.conversationId}`)}`. Texto vacío: «Cuando recibas novedades sobre visitas, ofertas o alertas de búsqueda, las encontrarás aquí…».
- `NotificationSettingsScreen`: fila «Alertas de búsqueda» («Cuando se publique una vivienda que encaje con tus búsquedas guardadas o tu busco, y cuando alguien busque lo que publicas.», icono `search-outline`) tras Ofertas (`last` pasa a esta); `change` admite `'alerts'`; `savePreferences` envía `alerts: draft.alerts`.

- [ ] **Step 4: Push**

- `push/repository.ts` `resolve`: acepta `conversationId` uuid o nulo y `propertyId` uuid o nulo, exactamente uno de los dos no nulo; devuelve ambos.
- `push/controller.ts`: `navigate(target: { conversationId: string } | { propertyId: string })`; tras `resolve`, si `isUuid(resolved.conversationId)` navega con conversación, si no y `isUuid(resolved.propertyId)` con vivienda.
- `PushProvider.native.tsx`: `navigate: target => 'conversationId' in target ? router.push({ pathname: '/messages/[id]', params: { id: target.conversationId } }) : router.push({ pathname: '/property/[id]', params: { id: target.propertyId } })`.
- Actualiza tipos y tests del push (`tests/push-*.test.ts`) donde `navigate` recibía un string.

- [ ] **Step 5: Verify**: `npm run check` verde. Commit:

```bash
git commit -m "feat: show search alerts in the inbox, the settings and the push tap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Módulo de búsquedas guardadas (dominio, repositorio, hook)

**Files:** Create `src/searches/types.ts`, `src/searches/domain.ts`, `src/searches/repository.ts`, `src/searches/useSavedSearches.ts`; test `tests/search-alerts.test.ts`.

- [ ] **Step 1: Tests**

```ts
// tests/search-alerts.test.ts
// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultFilters } from '../src/domain/listings.ts';
import { toSavedFilters, fromSavedFilters, searchName, describeSearch, decodeSavedSearch } from '../src/searches/domain.ts';
import { createSupabaseSavedSearchRepository } from '../src/searches/repository.ts';

test('filters round-trip through the saved shape', () => {
  const filters = { ...defaultFilters, type: 'Casa', province: 'La Habana', maxPrice: '30000', minBedrooms: 3, amenities: ['Balcón'], operation: 'swap', query: 'vedado' };
  const saved = toSavedFilters(filters);
  assert.deepEqual(saved, { query: 'vedado', type: 'Casa', province: 'La Habana', condition: null, min_price: null, max_price: 30000, min_area: null, max_area: null, min_bedrooms: 3, min_bathrooms: null, negotiable_only: null, amenities: ['balcon'], operations: ['swap'] });
  const back = fromSavedFilters(saved);
  assert.equal(back.type, 'Casa'); assert.equal(back.province, 'La Habana'); assert.equal(back.maxPrice, '30000'); assert.equal(back.minBedrooms, 3); assert.equal(back.operation, 'swap'); assert.equal(back.query, 'vedado'); assert.deepEqual(back.amenities, ['balcon']);
  assert.equal(fromSavedFilters(toSavedFilters(defaultFilters)).operation, 'offers');
});
test('a search gets a readable name and summary', () => {
  assert.equal(searchName(defaultFilters), 'Todas las viviendas');
  assert.equal(searchName({ ...defaultFilters, type: 'Casa', province: 'La Habana', maxPrice: '30000' }), 'Casas en La Habana hasta $ 30,000');
  assert.equal(searchName({ ...defaultFilters, type: 'Apartamento', minBedrooms: 3, province: 'Matanzas' }), 'Apartamentos de 3+ hab en Matanzas');
  assert.equal(searchName({ ...defaultFilters, operation: 'swap' }), 'Permutas en toda Cuba');
  assert.equal(searchName({ ...defaultFilters, operation: 'wanted', province: 'La Habana' }), 'Busco en La Habana');
  assert.equal(searchName({ ...defaultFilters, query: 'vedado' }), 'Viviendas «vedado» en toda Cuba');
  assert.equal(describeSearch(toSavedFilters({ ...defaultFilters, minPrice: '10000', maxPrice: '30000', minBathrooms: 2, condition: 'good', negotiableOnly: true })), 'Venta y permuta · Toda Cuba · $ 10,000 – $ 30,000 · 2+ baños · Buen estado · Negociable');
});
test('saved searches decode strictly and the repository binds identity', async () => {
  const saved = { id: '88000000-0000-4000-8000-000000000001', name: 'Casas', filters: toSavedFilters(defaultFilters), enabled: true, version: 1, createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z' };
  assert.deepEqual(decodeSavedSearch(saved), saved);
  for (const bad of [{ ...saved, id: 'x' }, { ...saved, name: '' }, { ...saved, version: 0 }, { ...saved, filters: { ...saved.filters, operations: ['rent'] } }, { ...saved, enabled: 'yes' }]) assert.throws(() => decodeSavedSearch(bad));
  const calls = []; const abort = new AbortController();
  const context = { userId: '88000000-0000-4000-8000-000000000002', accessToken: 'tok', signal: abort.signal, checkpoint() {} };
  const client = { rpc(name, args) { const call = { name, args }; calls.push(call); return { setHeader(k, v) { call.header = [k, v]; return this; }, abortSignal() { return Promise.resolve({ data: name === 'kh_list_saved_searches' ? [saved] : name === 'kh_save_search' ? saved : null, error: null }); } }; } };
  const repo = createSupabaseSavedSearchRepository(client);
  assert.deepEqual(await repo.list(context), [saved]);
  assert.deepEqual(calls[0].args, { p_actor_id: context.userId }); assert.deepEqual(calls[0].header, ['Authorization', 'Bearer tok']);
  await repo.save({ name: 'Casas', filters: saved.filters, enabled: true }, context);
  assert.deepEqual(calls[1].args, { p_actor_id: context.userId, p_payload: { name: 'Casas', filters: saved.filters, enabled: true } });
  await repo.remove(saved.id, context); assert.deepEqual(calls[2].args, { p_actor_id: context.userId, p_id: saved.id });
});
```

- [ ] **Step 2: Implementación**

`types.ts`:
```ts
import type { ListingOperation } from '../domain/listings.ts';
export interface SavedSearchFilters {
  query: string; type: 'Casa' | 'Apartamento' | null; province: string | null; condition: string | null;
  min_price: number | null; max_price: number | null; min_area: number | null; max_area: number | null;
  min_bedrooms: number; min_bathrooms: number | null; negotiable_only: true | null; amenities: string[]; operations: ListingOperation[];
}
export interface SavedSearch { id: string; name: string; filters: SavedSearchFilters; enabled: boolean; version: number; createdAt: string; updatedAt: string }
export interface SaveSearchInput { id?: string; name: string; filters: SavedSearchFilters; enabled: boolean; expectedVersion?: number }
export interface SavedSearchRepository {
  list(context: MessagingRequestContext): Promise<SavedSearch[]>;
  save(input: SaveSearchInput, context: MessagingRequestContext): Promise<SavedSearch>;
  remove(id: string, context: MessagingRequestContext): Promise<void>;
}
```
(importa `MessagingRequestContext` de `../messaging/types.ts`).

`domain.ts`: `toSavedFilters` reutiliza `searchPayload(filters, null, false)` de `src/catalog/query.ts` y quita `sort`, `cursor`, `with_total`, `limit` (así nunca diverge del catálogo). `fromSavedFilters`: inversa sobre `defaultFilters` (`operation`: `['sale','swap']` → `offers`, un solo valor → ese valor; números a cadena; `min_bathrooms` nulo → 0). `searchName(filters: ListingFilters)`: sujeto = `operation === 'wanted' ? 'Busco' : operation === 'swap' ? 'Permutas' : type === 'Casa' ? 'Casas' : type === 'Apartamento' ? 'Apartamentos' : 'Viviendas'`; si `query` → `«query»` tras el sujeto; `de N+ hab` si `minBedrooms > 0`; `en <provincia>` o `en toda Cuba`; `hasta $ X` si `maxPrice`; sin ningún filtro → «Todas las viviendas». `describeSearch(saved)`: partes «Venta y permuta | Venta | Permuta | Busco», provincia o «Toda Cuba», rango de precio, `N+ hab`, `N+ baños`, rango de m², estado (`CONDITIONS`), «Negociable», comodidades, unidas por « · ». Dinero con `Intl.NumberFormat('es-CU')` como en `operations.ts`. `decodeSavedSearch(value)`: valida uuid, nombre 1-60, `enabled` booleano, `version ≥ 1`, fechas, y `filters` con las claves y tipos de `SavedSearchFilters` (`operations` ⊆ `sale|swap|wanted`, no vacío).

`repository.ts`: `createSupabaseSavedSearchRepository(client)` con el mismo `rpc` de `notifications/repository.ts` (cabecera, `p_actor_id`, señal). Errores `KH_SEARCH_LIMIT` → `SavedSearchError('Ya tienes 10 alertas. Borra alguna para guardar otra.')`, `KH_SEARCH_CONFLICT` → «Esta alerta cambió en otro dispositivo. Actualiza la lista.», `KH_SEARCH_NOT_FOUND` → «Esta alerta ya no existe.».

`useSavedSearches.ts`: hook con `useAuth()` + `supabase`; estado `{ items, loading, error, saving }`; métodos `refresh`, `save(input)`, `toggle(search)` (guarda `enabled` invertido con `expectedVersion`), `remove(id)`. Contexto de petición como en `NotificationsProvider` (`userId`, `access_token`, `AbortController`; `checkpoint` lanza si la sesión cambió). Sin sesión → `available: false`.

- [ ] **Step 3: Verify**: `node --experimental-strip-types --test tests/search-alerts.test.ts` PASS (3); `npm run check` verde. Commit `feat: keep saved searches in their own module`.

---

### Task 4: Pantallas — Guardar búsqueda, Mis alertas, Mi espacio, detalle del busco

**Files:** Create `src/components/SaveSearchSheet.tsx`, `src/screens/SavedSearchesScreen.tsx`, `src/app/saved-searches.tsx`; modify `src/screens/ExploreScreen.tsx`, `src/screens/ProfileScreen.tsx`, `src/screens/DetailScreen.tsx`.

- [ ] **Step 1: `SaveSearchSheet`**: modal (patrón de `CatalogFilters`/`ReportConversationSheet`) con título «Guardar búsqueda», campo nombre (prellenado con `searchName(filters)`, máx 60), resumen `describeSearch(toSavedFilters(filters))`, botones «Guardar» y «Cancelar»; al guardar llama `save({ name, filters: toSavedFilters(filters), enabled: true })`, muestra error del hook, y al éxito cierra y muestra `Notice` en Explorar «Te avisaremos cuando aparezca una vivienda que encaje.» con botón «Ver mis alertas» (`/saved-searches`).
- [ ] **Step 2: Explorar**: en `resultMeta`, junto al botón de orden, `IconButton name="bookmark-outline" label="Guardar búsqueda"`; sin sesión en modo nube → `router.push({ pathname: '/auth', params: { returnTo: '/' } })`; en demo → `Notice` «Las alertas necesitan una cuenta de KarmaHouse.». Parámetro `search` (`useLocalSearchParams`): si llega y hay sesión, `useSavedSearches().items.find` (o carga) y `setFilters(fromSavedFilters(found.filters))` una vez; limpia el parámetro con `router.setParams({ search: undefined })`.
- [ ] **Step 3: `SavedSearchesScreen`** («Mis alertas», `PageTitle back fallback="/profile"`): lista de `items` con nombre, `describeSearch`, `Switch` activar/pausar (`toggle`), botón «Ver resultados» (`router.push({ pathname: '/', params: { search: item.id } })`) y «Borrar» con confirmación (`Alert.alert` en nativo / `confirm` en web como haga el resto del código; busca cómo confirma «Eliminar cuenta» y reutiliza). Vacío: `EmptyState` «Guarda una búsqueda desde Explorar y te avisaremos.» con botón «Ir a Explorar». Sin sesión: `AccountPrompt`. Ruta `src/app/saved-searches.tsx`: `export { default } from '../screens/SavedSearchesScreen';`.
- [ ] **Step 4: Mi espacio**: fila «Mis alertas» («Búsquedas guardadas que te avisan», icono `bookmark-outline`, recuento) tras Favoritos, solo en modo nube.
- [ ] **Step 5: Detalle de un busco propio**: bajo el `Notice` de moderación, si `wanted && own && listing.moderationStatus === 'approved'`: `Notice` «Te avisaremos cuando aparezca una vivienda que encaje.».
- [ ] **Step 6: Verify**: `npm run check`. Navegador en modo demo: botón visible, aviso de cuenta; pantalla `/saved-searches` con `AccountPrompt`. Commit `feat: save searches from Explorar and manage them in Mis alertas`.

---

### Task 5: Aplicar, verificar y documentar

- [ ] **Step 1** (con permiso del usuario): `"$N" scripts/apply-search-alerts.mjs --commit && "$N" scripts/verify-search-alerts.mjs`.
- [ ] **Step 2**: push a `main`; navegador contra el proyecto real: con la sesión del usuario si está en el navegador integrado, si no por SQL como usuario sintético: guardar búsqueda, insertar venta pendiente sintética y aprobarla con `kh_review_property` como admin (o `alert_on_approval` directo), ver la alerta con `kh_list_notifications(..., p_include_alerts => true)`, abrir la campana en la web (con sesión) y la vivienda; limpiar filas sintéticas.
- [ ] **Step 3**: `docs/search-alerts-verification.md`; README («Guardar búsquedas y recibir alertas…», migración `20260928000100_search_alerts.sql`); roadmap fila «Alertas» entregada. Commit `docs: verify saved searches and alerts` y push.

## Self-review

- Spec ↔ tareas: servidor completo en T1 (tabla, normalización, RPC, avisos `alert`, preferencias, listado con flag, push, matching, review); cliente avisos/push T2; módulo T3; pantallas T4; compat (flag `p_include_alerts`, `alerts` opcional, push en 0.1.7) T1-T2; verificación T1 suite, T2-T3 unitarias, T5 navegador y docs.
- Tipos: `SavedSearchFilters` = claves del servidor = salida de `searchPayload` menos paginación (T3 lo garantiza reutilizándolo); `AppNotification.propertyId` usado en T2 y T4; `navigate` con objeto en T2.
