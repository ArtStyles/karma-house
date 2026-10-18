# Chat interno del equipo (parte 1): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada inmobiliaria tiene un chat interno que ven todos los miembros activos, donde todos pueden escribir.

**Architecture:**
- **Base de datos:** tres tablas privadas en `kh_private` (chat, mensajes y lecturas) y cuatro RPC `security definer`. Siguen el patrón de `kh_send_agency_message`: el lector con `agency_reader`, el escritor con `agency_actor` y el límite de ritmo compartido con un trigger.
- **App:**
  - Un módulo `src/agencies/messaging/teamChat.ts` con tipos, decodificación y repositorio.
  - Una pantalla `AgencyTeamChatScreen` en Mediopunto.
  - Una fila reutilizable `TeamChatRow` para Mi inmobiliaria y para la bandeja.

**Tech Stack:** Postgres/Supabase (plpgsql), Expo Router + React Native (TypeScript), `node:test` y suites SQL con rollback.

**Spec:** `docs/superpowers/specs/2026-10-17-agency-chat-design.md`, sección 4. Las partes 2 (chat con el cliente) y 3 (avisos) tendrán su propio plan cuando termine esta.

**Reglas para quien ejecute:**
- **No se aplica nada en la base de datos de producción.** La única ejecución contra la nube es la prueba en seco de la tarea 2: corre en una transacción que se deshace.
- No se hace push ni se publica.
- Commits solo cuando el usuario lo autorice. Mientras tanto, los cambios se quedan en el árbol de trabajo. Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Node:** si `node` del sistema da `EACCES` contra Supabase, usa `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- No se usan APIs de Expo nuevas.
- **No toques archivos de comisiones:** `docs/superpowers/*/2026-10-15-agency-commissions*` y la lista `links` de `AgencyWorkspaceScreen`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20261017000200_agency_team_chat.sql` | Crear | Tablas, límite de ritmo y RPC |
| `supabase/tests/agency_team_chat.sql` | Crear | Suite SQL con rollback (ids `61…`) |
| `scripts/apply-reviewed-migration.mjs` | Modificar | Detectar filas sintéticas `61…` sobrantes |
| `src/agencies/messaging/teamChat.ts` | Crear | Tipos, decodificación y repositorio |
| `src/agencies/messaging/repository.ts` | Modificar (`mergeAgencyMessages`) | Hacerla genérica |
| `src/agencies/messaging/live.ts` | Modificar (`readIncomingAgencyMessages`) | Hacerla genérica |
| `src/agencies/domain.ts` | Modificar (`agencyError`) | Mensajes de ritmo y de mensaje inválido |
| `tests/agency-team-chat.test.ts` | Crear | Pruebas de decodificación, repositorio y errores |
| `src/components/messaging/MessageBubble.tsx` | Modificar | Prop `author` para chats de grupo |
| `src/screens/AgencyTeamChatScreen.tsx` | Crear | Pantalla del chat |
| `src/app/agency-team-chat.tsx` | Crear | Ruta de una línea |
| `src/components/agencies/TeamChatRow.tsx` | Crear | Fila con último mensaje y no leídos |
| `src/screens/AgencyWorkspaceScreen.tsx` | Modificar (una línea tras `AgencyStats`) | Entrada en Mi inmobiliaria |
| `src/screens/InboxScreen.tsx` | Modificar (`AgencyInbox`) | Entrada fijada en la bandeja del equipo |

---

### Task 1: Suite SQL (falla sin la migración)

**Files:**
- Create: `supabase/tests/agency_team_chat.sql`
- Modify: `scripts/apply-reviewed-migration.mjs` (comentario de cabecera y lista de prefijos)

- [ ] **Step 1: Escribir la suite**

```sql
-- Internal team chat. Everything rolls back.
-- A admin (…01), M manager (…02), C coordinator (…03), O outsider (…04), X admin of another agency (…05). Agencies a1 and a2 are approved.
begin;
create function pg_temp.team_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'TEAM ASSERTION: %',label; end if; end $$;
create function pg_temp.team_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'TEAM ASSERTION: missing error %',expected;
end $$;
create function pg_temp.team_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
create function pg_temp.team_send(actor uuid,agency uuid,client uuid,body text) returns jsonb language sql as $$
 select public.kh_send_agency_team_message(actor,agency,jsonb_build_object('clientMessageId',client,'body',body))
$$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'team-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Equipo '||n)
 from generate_series(1,5) n;
insert into kh_private.agencies(id,trade_name,state) values
 ('61000000-0000-4000-8000-0000000000a1','Casas Equipo Ficticias','approved'),
 ('61000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Ficticia','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000001','admin'),
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000002','manager'),
 ('61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000003','coordinator'),
 ('61000000-0000-4000-8000-0000000000a2','61000000-0000-4000-8000-000000000005','admin');

set local role authenticated;
-- Before the first message the chat is empty and nobody has unread messages.
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'lastSeq')::int=0,'empty chat');
select pg_temp.team_assert(public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->'lastMessage'='null'::jsonb,'no last message');
select pg_temp.team_assert(jsonb_array_length(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->'items')=0,'no messages');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":0}');

-- The manager writes; a retry with the same id returns the same message, other text with that id is refused.
select pg_temp.team_as('61000000-0000-4000-8000-000000000002');
select pg_temp.team_assert((pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','  Hola, equipo  ')->>'seq')::int=1,'first message');
select pg_temp.team_assert((pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','Hola, equipo')->>'seq')::int=1,'retry returns the same message');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d1','Otro texto')$q$,'KH_CHAT_MESSAGE_CONFLICT');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d2',E' \n\t ')$q$,'KH_CHAT_INVALID_MESSAGE');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d3',repeat('a',2001))$q$,'KH_CHAT_INVALID_MESSAGE');
select pg_temp.team_error($q$select public.kh_send_agency_team_message('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1','{"clientMessageId":"x","body":"Hola"}')$q$,'KH_CHAT_INVALID_MESSAGE');
-- The sender has nothing unread; nobody writes for someone else.
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=0,'own message is read');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d4','Suplantado')$q$,'KH_ACCOUNT_CHANGED');

-- The admin sees the message with its author and role, then reads it.
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=1,'admin has one unread');
select pg_temp.team_assert(public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{lastMessage,senderName}'='Persona Equipo 2','last message author');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'memberCount')::int=3,'three members');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'canSend')::boolean,'admin can send');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{items,0,body}'='Hola, equipo','stored body is trimmed');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')#>>'{items,0,senderRole}'='manager','sender role');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":1}');
select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":0}');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'unreadCount')::int=0,'read only moves forward');
select pg_temp.team_error($q$select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','{"lastSeq":5}')$q$,'KH_CHAT_INVALID_CURSOR');

-- Pages go newest first and say when there is more.
select pg_temp.team_as('61000000-0000-4000-8000-000000000003');
select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',('61000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'Mensaje '||n) from generate_series(1,19) n;
select pg_temp.team_assert(jsonb_array_length(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)->'items')=5,'page of five');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)->>'hasMore')::boolean,'more pages');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',null,5)#>>'{items,0,seq}')::int=20,'newest first');
select pg_temp.team_assert((public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1',3,50)->>'hasMore')::boolean=false,'before seq 3 has two');
-- The coordinator wrote 19; with the shared limit the 21st within a minute is refused.
select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000120','Mensaje 20');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-000000000121','Mensaje 21')$q$,'KH_CHAT_RATE_LIMIT');

-- Outsiders and other agencies can neither read nor write.
select pg_temp.team_as('61000000-0000-4000-8000-000000000004');
select pg_temp.team_error($q$select public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d5','Hola')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_as('61000000-0000-4000-8000-000000000005');
select pg_temp.team_error($q$select public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_error($q$select public.kh_read_agency_team_chat('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a1','{"lastSeq":1}')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_assert((public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-0000000000a2')->>'lastSeq')::int=0,'chats are separate per agency');

-- A suspended agency keeps its history readable but takes no messages.
reset role;
update kh_private.agencies set state='suspended' where id='61000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert(not (public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1')->>'canSend')::boolean,'suspended agency cannot send');
select pg_temp.team_error($q$select pg_temp.team_send('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1','61000000-0000-4000-8000-0000000000d6','Hola')$q$,'KH_AGENCY_NOT_APPROVED');
reset role;
update kh_private.agencies set state='approved' where id='61000000-0000-4000-8000-0000000000a1';

-- A member who leaves loses the chat; their messages keep their name, without a role.
update kh_private.agency_memberships set state='removed',version=version+1 where agency_id='61000000-0000-4000-8000-0000000000a1' and user_id='61000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.team_as('61000000-0000-4000-8000-000000000002');
select pg_temp.team_error($q$select public.kh_get_agency_team_chat('61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.team_as('61000000-0000-4000-8000-000000000001');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1',2,50)#>>'{items,0,senderName}'='Persona Equipo 2','former member keeps the name');
select pg_temp.team_assert(public.kh_list_agency_team_messages('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-0000000000a1',2,50)#>'{items,0,senderRole}'='null'::jsonb,'former member has no role');
reset role;

-- Private tables and anonymous callers stay closed.
select pg_temp.team_assert(not has_table_privilege('authenticated','kh_private.agency_team_messages','select'),'authenticated cannot read the table');
select pg_temp.team_assert(not has_function_privilege('anon','public.kh_send_agency_team_message(uuid,uuid,jsonb)','execute') and not has_function_privilege('anon','public.kh_get_agency_team_chat(uuid,uuid)','execute'),'anon cannot execute');
rollback;
```

- [ ] **Step 2: Añadir el prefijo `61…` al script**

En `scripts/apply-reviewed-migration.mjs`:
- Añade `and 20261017000200_agency_team_chat` a la lista de migraciones del comentario de cabecera.
- Añade `agency_team_chat 61…` al comentario de prefijos.
- Añade `'61000000-0000-4000-8000-%'` al array de `leftovers`.

- [ ] **Step 3: Comprobar que la suite falla sin la migración**

No hay base de datos local. La migración aún no existe, así que el script falla al leerla:

Run: `node scripts/apply-reviewed-migration.mjs 20261017000200_agency_team_chat`
Expected: error `ENOENT` en `supabase/migrations/20261017000200_agency_team_chat.sql`.

### Task 2: Migración y prueba en seco

**Files:**
- Create: `supabase/migrations/20261017000200_agency_team_chat.sql`

- [ ] **Step 1: Escribir la migración**

```sql
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
```

- [ ] **Step 2: Prueba en seco**

Run: `node scripts/apply-reviewed-migration.mjs 20261017000200_agency_team_chat`
Expected: `suite superada; nada se aplicó (usa --commit para aplicar)`.

Si falla, corrige la migración o la suite y repite. **Nunca** uses `--commit` sin el «sí» del usuario.

### Task 3: Repositorio del chat del equipo

**Files:**
- Create: `src/agencies/messaging/teamChat.ts`
- Modify: `src/agencies/messaging/repository.ts` (`mergeAgencyMessages`)
- Modify: `src/agencies/messaging/live.ts` (`readIncomingAgencyMessages`)
- Modify: `src/agencies/domain.ts` (`agencyError`)
- Test: `tests/agency-team-chat.test.ts`

- [ ] **Step 1: Escribir las pruebas**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyTeamChatRepository, decodeAgencyTeamChat, decodeAgencyTeamMessage } from '../src/agencies/messaging/teamChat.ts';
import { readIncomingAgencyMessages } from '../src/agencies/messaging/live.ts';
import { agencyError } from '../src/agencies/domain.ts';

const id = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const agencyId = id(100);
const context = { userId: id(1), accessToken: 'token', signal: new AbortController().signal, checkpoint() { }, agencyId, generation: 1 };
const message = (seq: number, extra: Record<string, unknown> = {}) => ({ id: id(200 + seq), agencyId, seq, clientMessageId: id(300 + seq), senderId: id(2), senderName: 'Ana', senderRole: 'manager', body: `Mensaje ${seq}`, createdAt: '2026-10-17T12:00:00Z', ...extra });
const summary = { agencyId, agencyName: 'Casas', lastSeq: 2, unreadCount: 1, canSend: true, memberCount: 3, lastMessage: { body: 'Hola', senderName: 'Ana', createdAt: '2026-10-17T12:00:00Z' } };
function fakeClient(reply: (name: string, args: any) => unknown) {
  const calls: { name: string; args: any }[] = [];
  const client = { rpc(name: string, args: any) { calls.push({ name, args }); return { setHeader(key: string, value: string) { assert.equal(key, 'Authorization'); assert.equal(value, 'Bearer token'); return this; }, async abortSignal() { return { data: reply(name, args), error: null }; } }; } };
  return { calls, repo: createAgencyTeamChatRepository(client as any) };
}

test('team chat summary decodes only its own agency', () => {
  assert.deepEqual(decodeAgencyTeamChat(summary, agencyId).lastMessage, summary.lastMessage);
  assert.equal(decodeAgencyTeamChat({ ...summary, lastMessage: null }, agencyId).lastMessage, null);
  assert.throws(() => decodeAgencyTeamChat({ ...summary, agencyId: id(101) }, agencyId));
  assert.throws(() => decodeAgencyTeamChat({ ...summary, canSend: 'yes' }, agencyId));
  assert.throws(() => decodeAgencyTeamChat({ ...summary, lastMessage: { ...summary.lastMessage, createdAt: 'ayer' } }, agencyId));
});
test('team messages keep former members and deleted accounts, never an unknown role', () => {
  assert.equal(decodeAgencyTeamMessage(message(1, { senderRole: null }), agencyId).senderRole, null);
  assert.equal(decodeAgencyTeamMessage(message(1, { senderId: null, senderName: 'Cuenta eliminada' }), agencyId).senderId, null);
  assert.throws(() => decodeAgencyTeamMessage(message(1, { senderRole: 'owner' }), agencyId));
  assert.throws(() => decodeAgencyTeamMessage(message(1, { agencyId: id(101) }), agencyId));
  assert.throws(() => decodeAgencyTeamMessage(message(0), agencyId));
});
test('repository pins the actor and the agency and orders history', async () => {
  const { calls, repo } = fakeClient(name => name === 'kh_get_agency_team_chat' ? summary : { items: [message(2), message(1)], hasMore: true });
  assert.equal((await repo.get(context)).unreadCount, 1);
  const page = await repo.history(agencyId, 3, context);
  assert.deepEqual(page.items.map(m => m.seq), [1, 2]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(calls.map(c => c.name), ['kh_get_agency_team_chat', 'kh_list_agency_team_messages']);
  assert.ok(calls.every(c => c.args.p_actor_id === id(1) && c.args.p_agency_id === agencyId));
  assert.deepEqual([calls[1].args.p_before_seq, calls[1].args.p_limit], [3, 30]);
  await assert.rejects(repo.history(id(101), null, context));
});
test('history refuses repeated sequence numbers', async () => {
  const { repo } = fakeClient(() => ({ items: [message(1), message(1)], hasMore: false }));
  await assert.rejects(repo.history(agencyId, null, context));
});
test('send trims, checks the echo and refuses empty text without calling the server', async () => {
  const { calls, repo } = fakeClient((_, args) => ({ ...message(3), senderId: id(1), clientMessageId: args.p_payload.clientMessageId, body: args.p_payload.body }));
  const sent = await repo.send({ clientMessageId: id(400), body: '  Hola  ' }, context);
  assert.equal(sent.body, 'Hola');
  assert.deepEqual(calls[0].args.p_payload, { clientMessageId: id(400), body: 'Hola' });
  await assert.rejects(repo.send({ clientMessageId: id(401), body: '   ' }, context));
  assert.equal(calls.length, 1);
  const other = fakeClient(() => ({ ...message(3), senderId: id(1), clientMessageId: id(402), body: 'Otro' }));
  await assert.rejects(other.repo.send({ clientMessageId: id(402), body: 'Hola' }, context));
});
test('markRead sends the cursor and an account change stops the call', async () => {
  const { calls, repo } = fakeClient(() => null);
  await repo.markRead(7, context);
  assert.deepEqual(calls[0].args, { p_agency_id: agencyId, p_payload: { lastSeq: 7 }, p_actor_id: id(1) });
  await assert.rejects(repo.markRead(8, { ...context, checkpoint() { throw Error('KH_ACCOUNT_CHANGED'); } }));
  assert.equal(calls.length, 1);
});
test('the incoming reader fills a gap in the team chat too', async () => {
  const pages: Record<string, { items: any[]; hasMore: boolean }> = { null: { items: [message(4), message(5)].map(m => decodeAgencyTeamMessage(m, agencyId)), hasMore: true }, 4: { items: [message(2), message(3)].map(m => decodeAgencyTeamMessage(m, agencyId)), hasMore: true } };
  const repo = { async history(_id: string, before: number | null) { return pages[String(before)]; } };
  const previous = [decodeAgencyTeamMessage(message(1), agencyId)];
  const result = await readIncomingAgencyMessages(repo, agencyId, previous, false, context);
  assert.deepEqual(result.items.map(m => m.seq), [1, 2, 3, 4, 5]);
});
test('chat limits read as Spanish messages', () => {
  assert.match(agencyError(Error('KH_CHAT_RATE_LIMIT')), /muchos mensajes/);
  assert.match(agencyError(Error('KH_CHAT_INVALID_MESSAGE')), /mensaje/);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `node --experimental-strip-types --test tests/agency-team-chat.test.ts`
Expected: FAIL. No se encuentra `src/agencies/messaging/teamChat.ts`.

- [ ] **Step 3: Volver genéricas las dos funciones de mezcla**

En `src/agencies/messaging/repository.ts`, sustituye la firma de `mergeAgencyMessages` y deja el cuerpo igual:

```ts
export function mergeAgencyMessages<T extends { id: string; seq: number }>(previous: T[], incoming: T[]): T[] { const byId = new Map(previous.map(m => [m.id, m])); for (const m of incoming)
    byId.set(m.id, m); return [...byId.values()].sort((a, b) => a.seq - b.seq); }
```

En `src/agencies/messaging/live.ts`, sustituye la función:

```ts
/** Fill any incoming gap before merging; keep the user's already loaded pages. */
export async function readIncomingAgencyMessages<T extends {id:string;seq:number},C extends {checkpoint():void}>(repo:{history(id:string,before:number|null,context:C):Promise<{items:T[];hasMore:boolean}>},id:string,previous:T[],hadMore:boolean,context:C){
 const newest=previous.at(-1)?.seq??0;let before:number|null=null,items:T[]=[],hasMore=false;
 do{
  context.checkpoint();const page=await repo.history(id,before,context);context.checkpoint();items=mergeAgencyMessages(items,page.items);hasMore=page.hasMore;
  const earliest=page.items[0]?.seq;
  if(!newest||!hasMore||earliest===undefined||earliest<=newest+1)break;
  before=earliest;
 }while(true);
 return {items:mergeAgencyMessages(previous,items),hasMore:previous.length?hadMore:hasMore};
}
```

y cambia su import de tipos por:

```ts
import type {AgencyConversationContext,AgencyMessage,AgencyMessagingRepository} from './types.ts';
```

Quita del import los tipos que dejen de usarse. `isAgencyReadAccessFailure` y `startAgencyPoll` no cambian. Si `AgencyConversationContext`, `AgencyMessage` y `AgencyMessagingRepository` ya no se usan en `live.ts`, borra la línea entera.

- [ ] **Step 4: Escribir `teamChat.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createScopedRpc } from '../../transfers/repository.ts';
import { decodeAgencyPage } from '../repository.ts';
import { object, uuid, integer, text, nullableUuid, invalidAgencyData } from '../deals/domain.ts';
import type { AgencyRequestContext, AgencyRole, Page } from '../types.ts';

export interface AgencyTeamChat {
  agencyId: string; agencyName: string; lastSeq: number; unreadCount: number; canSend: boolean; memberCount: number;
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
}
export interface AgencyTeamMessage {
  id: string; agencyId: string; seq: number; clientMessageId: string; senderId: string | null;
  senderName: string; senderRole: AgencyRole | null; body: string; createdAt: string;
}
export interface AgencyTeamChatRepository {
  get(context: AgencyRequestContext): Promise<AgencyTeamChat>;
  history(agencyId: string, beforeSeq: number | null, context: AgencyRequestContext): Promise<Page<AgencyTeamMessage>>;
  send(input: { clientMessageId: string; body: string }, context: AgencyRequestContext): Promise<AgencyTeamMessage>;
  markRead(lastSeq: number, context: AgencyRequestContext): Promise<void>;
}

const roles: readonly unknown[] = ['manager', 'coordinator', 'admin'];
const date = (value: unknown) => { const s = text(value); if (!Number.isFinite(Date.parse(s))) throw invalidAgencyData(); return s; };

export function decodeAgencyTeamChat(value: unknown, agencyId: string): AgencyTeamChat {
  const v = object(value);
  if (v.agencyId !== agencyId || typeof v.canSend !== 'boolean') throw invalidAgencyData();
  const last = v.lastMessage === null ? null : object(v.lastMessage);
  return { agencyId, agencyName: text(v.agencyName), lastSeq: integer(v.lastSeq), unreadCount: integer(v.unreadCount), canSend: v.canSend, memberCount: integer(v.memberCount),
    lastMessage: last && { body: text(last.body), senderName: text(last.senderName), createdAt: date(last.createdAt) } };
}
export function decodeAgencyTeamMessage(value: unknown, agencyId: string): AgencyTeamMessage {
  const v = object(value);
  if (v.agencyId !== agencyId || (v.senderRole !== null && !roles.includes(v.senderRole))) throw invalidAgencyData();
  return { id: uuid(v.id), agencyId, seq: integer(v.seq, 1), clientMessageId: uuid(v.clientMessageId), senderId: nullableUuid(v.senderId),
    senderName: text(v.senderName), senderRole: v.senderRole as AgencyRole | null, body: text(v.body), createdAt: date(v.createdAt) };
}

export function createAgencyTeamChatRepository(client: SupabaseClient): AgencyTeamChatRepository {
  const rpc = createScopedRpc(client);
  return {
    async get(context) {
      return decodeAgencyTeamChat(await rpc('kh_get_agency_team_chat', { p_agency_id: uuid(context.agencyId) }, context), context.agencyId);
    },
    async history(agencyId, beforeSeq, context) {
      if (agencyId !== context.agencyId) throw invalidAgencyData();
      const page = decodeAgencyPage(await rpc('kh_list_agency_team_messages', { p_agency_id: uuid(agencyId), p_before_seq: beforeSeq === null ? null : integer(beforeSeq, 1), p_limit: 30 }, context), v => decodeAgencyTeamMessage(v, agencyId));
      if (new Set(page.items.map(m => m.seq)).size !== page.items.length) throw invalidAgencyData();
      return { ...page, items: page.items.sort((a, b) => a.seq - b.seq) };
    },
    async send(input, context) {
      uuid(input.clientMessageId);
      const body = input.body.trim();
      if (!body || body.length > 2000) throw invalidAgencyData();
      const m = decodeAgencyTeamMessage(await rpc('kh_send_agency_team_message', { p_agency_id: uuid(context.agencyId), p_payload: { clientMessageId: input.clientMessageId, body } }, context), context.agencyId);
      if (m.clientMessageId !== input.clientMessageId || m.senderId !== context.userId || m.body !== body) throw invalidAgencyData();
      return m;
    },
    async markRead(lastSeq, context) {
      await rpc('kh_read_agency_team_chat', { p_agency_id: uuid(context.agencyId), p_payload: { lastSeq: integer(lastSeq) } }, context);
    },
  };
}
```

- [ ] **Step 5: Mensajes de error**

En `src/agencies/domain.ts`, dentro de `agencyError`, justo después de la línea de `KH_AGENCY_NOT_APPROVED`:

```ts
 if(/KH_CHAT_RATE_LIMIT/.test(message))return 'Has enviado muchos mensajes seguidos. Espera un momento antes de volver a escribir.';
 if(/KH_CHAT_INVALID_MESSAGE/.test(message))return 'Escribe un mensaje de hasta 2000 caracteres.';
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `node --experimental-strip-types --test tests/agency-team-chat.test.ts tests/agency-live.test.ts tests/agency-messaging.test.ts tests/agency-final-contracts.test.ts`
Expected: PASS.

### Task 4: Burbuja con autor

**Files:**
- Modify: `src/components/messaging/MessageBubble.tsx`

- [ ] **Step 1: Aceptar filas mínimas y un autor**

`MessageBubble` solo usa `body` y `createdAt` del mensaje. Su `row` acepta esa forma mínima, y `MessageRow` sigue siendo compatible:

```ts
type BubbleRow = { key: string; message: Pick<ChatMessage, 'body' | 'createdAt'>; pending?: never } | { key: string; pending: PendingMessage; message?: never };

/** `showStatus` marks the latest own message; pending and failed ones always show their state. `author` names who wrote it in a group chat. */
export function MessageBubble({ row, own, author, showStatus = false, canRetry, busy, onRetry, onDiscard }: { row: BubbleRow; own: boolean; author?: string; showStatus?: boolean; canRetry: boolean; busy: boolean; onRetry: () => void; onDiscard: () => void }) {
```

Dentro de la burbuja, antes del texto:

```tsx
      {!!author && !own && <Text numberOfLines={1} style={styles.author}>{author}</Text>}
```

Y en los estilos:

```ts
  author: { ...typography.label, color: colors.body, marginBottom: 2 },
```

Importa `typography` desde `'../../theme'` junto a `createThemedStyles` y `rounded`.

- [ ] **Step 2: Comprobar tipos**

Run: `npm run typecheck`
Expected: sin errores.

### Task 5: Pantalla del chat del equipo

**Files:**
- Create: `src/screens/AgencyTeamChatScreen.tsx`
- Create: `src/app/agency-team-chat.tsx`

- [ ] **Step 1: Ruta**

```ts
export {default} from '../screens/AgencyTeamChatScreen';
```

- [ ] **Step 2: Pantalla**

Antes, lee la skill `karma-app-design` y `DESIGN.md` §6 y §9. No hay artboard para esta pantalla: se compone con las piezas del chat personal (`ConversationBody`).

```tsx
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../agencies/controller';
import { agencyError } from '../agencies/domain';
import { mergeAgencyMessages } from '../agencies/messaging/repository';
import { isAgencyReadAccessFailure, readIncomingAgencyMessages, startAgencyPoll } from '../agencies/messaging/live';
import { createAgencyTeamChatRepository, type AgencyTeamChat, type AgencyTeamMessage } from '../agencies/messaging/teamChat';
import { createMessageId } from '../messaging/domain';
import { supabase } from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { AgencyMark } from '../components/agencies/AgencyMark';
import { MessageBubble } from '../components/messaging/MessageBubble';
import { useMessagingActivity } from '../components/messaging/useMessagingActivity';
import { Button, EmptyState, goBack, Icon, IconButton, PageTitle } from '../components/ui';
import { agencyRoleLabel } from './AgencyWorkspaceScreen';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

const repo = supabase ? createAgencyTeamChatRepository(supabase) : null;
type Feed = { chat: AgencyTeamChat | null; messages: AgencyTeamMessage[]; hasMore: boolean; error: string; loading: boolean };
const day = (value: string) => new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'long' });

export default function AgencyTeamChatScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth(), w = useAgencyWorkspace();
  const gate = !auth.user ? <AccountPrompt returnTo="/agency-team-chat" />
    : !w.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} />
    : !w.activeAgencyId || !w.membership || !w.activeAgency ? <EmptyState plain title="Elige una inmobiliaria" description="El chat del equipo es el de la inmobiliaria que tengas abierta en Mi inmobiliaria." action={<Button label="Ir a Mi inmobiliaria" onPress={() => router.push('/agency-workspace')} />} />
    : !repo ? <EmptyState plain title="Chat no disponible" description="El chat del equipo necesita conexión con el servicio." /> : null;
  if (gate || !auth.user || !w.activeAgencyId) return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><View style={[styles.shell, styles.padding]}><PageTitle compact title="Chat del equipo" back fallback="/agency-workspace" />{gate}</View></SafeAreaView>;
  return <TeamChatBody key={`${auth.user.id}:${w.activeAgencyId}:${w.generation}`} userId={auth.user.id} agencyId={w.activeAgencyId} />;
}

function TeamChatBody({ userId, agencyId }: { userId: string; agencyId: string }) {
  const { colors, styles } = useStyles();
  const w = useAgencyWorkspace();
  const active = useMessagingActivity();
  const [feed, setFeed] = useState<Feed>({ chat: null, messages: [], hasMore: false, error: '', loading: true });
  // A new id for every edit; a retry of the same text reuses it, so a lost reply is not sent twice.
  const [draft, setDraft] = useState({ text: '', id: createMessageId() });
  const [sending, setSending] = useState(false), [sendError, setSendError] = useState(''), [older, setOlder] = useState(false);
  const feedRef = useRef(feed); feedRef.current = feed;
  const mounted = useRef(true), reading = useRef(false), markedSeq = useRef(0);
  const list = useRef<FlatList<AgencyTeamMessage>>(null), follow = useRef(true);
  const anchor = useRef<{ offset: number; content: number } | null>(null), metrics = useRef({ offset: 0, content: 0 });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!repo || reading.current) return;
    reading.current = true;
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyReadContext();
      if (ctx.agencyId !== agencyId) throw Error('KH_AGENCY_CONTEXT_CHANGED');
      const chat = await repo.get(ctx);
      const previous = feedRef.current;
      const page = await readIncomingAgencyMessages(repo, agencyId, previous.messages, previous.hasMore, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      setFeed(old => ({ chat, messages: mergeAgencyMessages(old.messages, page.items), hasMore: old.messages.length ? old.hasMore : page.hasMore, error: '', loading: false }));
      if (chat.unreadCount > 0 && chat.lastSeq > markedSeq.current) {
        markedSeq.current = chat.lastSeq;
        await repo.markRead(chat.lastSeq, ctx).catch(() => { markedSeq.current = 0; });
      }
    } catch (error) {
      if (mounted.current) setFeed(old => isAgencyReadAccessFailure(error)
        ? { chat: null, messages: [], hasMore: false, error: agencyError(error), loading: false }
        : { ...old, error: agencyError(error), loading: false });
    } finally { ctx?.release(); reading.current = false; }
  }, [agencyId, w.captureAgencyReadContext]);
  // Every 3 s while the screen is in front and the app is active, like the other agency chats.
  useFocusEffect(useCallback(() => active ? startAgencyPoll(load) : undefined, [active, load]));

  async function loadOlder() {
    const first = feed.messages[0];
    if (!repo || older || !first) return;
    setOlder(true);
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyReadContext();
      const page = await repo.history(agencyId, first.seq, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      anchor.current = { ...metrics.current };
      setFeed(old => ({ ...old, messages: mergeAgencyMessages(old.messages, page.items), hasMore: page.hasMore }));
    } catch (error) { if (mounted.current) setFeed(old => ({ ...old, error: agencyError(error) })); }
    finally { ctx?.release(); if (mounted.current) setOlder(false); }
  }
  async function send() {
    const body = draft.text.trim();
    if (!repo || sending || !body || !feed.chat?.canSend) return;
    setSending(true); setSendError('');
    let ctx: CapturedAgencyContext | undefined;
    try {
      ctx = w.captureAgencyContext();
      if (ctx.agencyId !== agencyId) throw Error('KH_AGENCY_CONTEXT_CHANGED');
      const message = await repo.send({ clientMessageId: draft.id, body }, ctx);
      ctx.checkpoint();
      if (!mounted.current) return;
      follow.current = true;
      markedSeq.current = Math.max(markedSeq.current, message.seq);
      setDraft({ text: '', id: createMessageId() });
      setFeed(old => ({ ...old, messages: mergeAgencyMessages(old.messages, [message]) }));
    } catch (error) { if (mounted.current) setSendError(agencyError(error)); }
    finally { ctx?.release(); if (mounted.current) setSending(false); }
  }

  const { chat, messages } = feed;
  const agency = w.activeAgency;
  const name = agency?.tradeName ?? 'tu inmobiliaria';
  const canSubmit = !!chat?.canSend && !sending && !!draft.text.trim();
  const blocked = !w.enabled ? 'La gestión de inmobiliarias está en pausa. Puedes leer el historial.'
    : agency?.state !== 'approved' ? 'La inmobiliaria no está aprobada ahora mismo. Puedes leer el historial.'
    : 'Tu cuenta no puede escribir en este chat ahora.';
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.shell}>
        <View style={styles.header}>
          <IconButton name="chevron-back" label="Volver" onPress={() => goBack('/agency-workspace')} />
          <AgencyMark agencyId={agencyId} name={agency?.tradeName ?? ''} logoPath={agency?.logoPath} width={40} height={46} bottom={12} />
          <View style={styles.titleBox}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>Chat del equipo</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{agency?.tradeName}{chat ? ` · ${chat.memberCount === 1 ? '1 persona' : `${chat.memberCount} personas`}` : ''}</Text>
          </View>
        </View>
        <View style={styles.privacy}><Icon name="lock-closed-outline" size={14} color={colors.muted} /><Text style={styles.privacyText}>Solo lo ve el equipo de {name}.</Text></View>
        {!!feed.error && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{feed.error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryLink}><Text style={styles.link}>Reintentar</Text></Pressable></View>}
        <FlatList ref={list} data={messages} keyExtractor={m => m.id} style={styles.flex} contentContainerStyle={styles.messages} alwaysBounceVertical
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            metrics.current = { offset: contentOffset.y, content: contentSize.height };
            follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
          }} scrollEventThrottle={100}
          onContentSizeChange={(_, content) => {
            const mark = anchor.current;
            if (mark && content > mark.content) { list.current?.scrollToOffset({ offset: mark.offset + content - mark.content, animated: false }); anchor.current = null; }
            else if (follow.current) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
            metrics.current.content = content;
          }}
          ListHeaderComponent={feed.hasMore ? <Button label="Ver mensajes anteriores" secondary loading={older} onPress={() => void loadOlder()} style={styles.older} /> : null}
          ListEmptyComponent={feed.loading ? <ActivityIndicator accessibilityLabel="Consultando el chat del equipo" color={colors.primary} style={styles.loading} />
            : chat ? <EmptyState plain title="Todavía no hay mensajes" description={`Escribe al equipo de ${name}. Lo verán todas las personas del equipo.`} />
            : <EmptyState plain title="Chat no disponible" description="No se pudo abrir el chat de esta inmobiliaria." action={<Button label="Reintentar" secondary onPress={() => void load()} />} />}
          renderItem={({ item, index }) => {
            const previous = index > 0 ? messages[index - 1] : undefined;
            const date = day(item.createdAt), newDay = !previous || day(previous.createdAt) !== date;
            const own = item.senderId === userId;
            const author = own || (!newDay && previous?.senderId === item.senderId) ? undefined : `${item.senderName} · ${item.senderRole ? agencyRoleLabel[item.senderRole] : 'Ya no está en el equipo'}`;
            return <View>{newDay && <Text style={styles.day}>{date}</Text>}<MessageBubble row={{ key: item.id, message: item }} own={own} author={author} canRetry={false} busy={false} onRetry={() => undefined} onDiscard={() => undefined} /></View>;
          }}
        />
        {!!sendError && <View style={styles.sync}><Text accessibilityRole="alert" style={styles.syncText}>{sendError}</Text></View>}
        {chat && !chat.canSend ? <Text style={styles.reason}>{blocked}</Text> : <View style={styles.composer}>
          <View style={styles.inputField}><TextInput accessibilityLabel="Mensaje para el equipo" placeholder="Escribe al equipo…" placeholderTextColor={colors.muted} value={draft.text}
            onChangeText={text => { setDraft({ text, id: createMessageId() }); setSendError(''); }} multiline maxLength={2000} editable={!!chat && !sending} style={[styles.input, (!chat || sending) && styles.mutedInput]} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensaje" accessibilityState={{ disabled: !canSubmit, busy: sending }} disabled={!canSubmit} onPress={() => void send()} style={({ pressed }) => [styles.send, !canSubmit && styles.sendDisabled, pressed && styles.pressed]}>
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="paper-plane" size={21} color={colors.onPrimary} />}
          </Pressable>
        </View>}
        {draft.text.length > 1800 && <Text style={styles.count}>{draft.text.length}/2000</Text>}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, shell: { flex: 1, width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center' }, padding: { paddingHorizontal: 16 }, loading: { padding: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  titleBox: { flex: 1, minWidth: 0 }, title: { ...typography.body, fontWeight: '600', color: colors.ink }, subtitle: { ...typography.label, fontWeight: '400', color: colors.muted },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }, privacyText: { ...typography.caption, color: colors.muted },
  messages: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 }, older: { alignSelf: 'center', marginBottom: 12 },
  day: { ...typography.caption, fontWeight: '600', color: colors.muted, textAlign: 'center', marginTop: 14, marginBottom: 10 },
  sync: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.softDanger, borderRadius: rounded.thumb, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  syncText: { ...typography.caption, flex: 1, color: colors.danger }, retryLink: { minHeight: 44, justifyContent: 'center' }, link: { ...typography.label, color: colors.primary },
  reason: { ...typography.bodySm, color: colors.body, textAlign: 'center', marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: rounded.card, backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.paper },
  inputField: { flex: 1, minWidth: 0 }, input: { ...typography.body, minHeight: 52, maxHeight: 152, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: rounded.pill, borderWidth: 1, borderColor: colors.border, color: colors.ink }, mutedInput: { opacity: 0.6 },
  send: { width: 48, height: 48, marginBottom: 2, borderRadius: rounded.pill, backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
  count: { ...typography.caption, color: colors.muted, textAlign: 'right', paddingHorizontal: 20, paddingBottom: 6 },
}));
```

- [ ] **Step 3: Comprobar tipos**

Run: `npm run typecheck`
Expected: sin errores.

### Task 6: Entradas en Mi inmobiliaria y en la bandeja

**Files:**
- Create: `src/components/agencies/TeamChatRow.tsx`
- Modify: `src/screens/AgencyWorkspaceScreen.tsx` (una línea tras `<AgencyStats …/>`)
- Modify: `src/screens/InboxScreen.tsx` (`AgencyInbox`)

- [ ] **Step 1: Fila del chat del equipo**

```tsx
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAgencyWorkspace } from '../../agencies/AgencyProvider';
import type { CapturedAgencyContext } from '../../agencies/controller';
import { createAgencyTeamChatRepository, type AgencyTeamChat } from '../../agencies/messaging/teamChat';
import { supabase } from '../../lib/supabase';
import { createThemedStyles, rounded, typography } from '../../theme';
import { Icon } from '../ui';

const repo = supabase ? createAgencyTeamChatRepository(supabase) : null;

/** The agency's internal chat as one row, with its last message and unread count, read each time the screen gains focus. */
export function TeamChatRow() {
  const w = useAgencyWorkspace();
  const { colors, styles } = useStyles();
  const key = `${w.activeAgencyId}:${w.generation}`;
  const [chat, setChat] = useState<{ key: string; value: AgencyTeamChat } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!repo) return;
    let active = true, context: CapturedAgencyContext;
    try { context = w.captureAgencyReadContext(); } catch { return; }
    void repo.get(context).then(value => { context.checkpoint(); if (active) setChat({ key, value }); }).catch(() => undefined).finally(() => context.release());
    return () => { active = false; };
  }, [key, w.captureAgencyReadContext]));
  const shown = chat?.key === key ? chat.value : null;
  const unread = shown?.unreadCount ?? 0;
  const preview = shown?.lastMessage ? `${shown.lastMessage.senderName}: ${shown.lastMessage.body}` : 'Habla con todo el equipo.';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Chat del equipo. ${unread ? `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : 'Sin mensajes nuevos'}`} onPress={() => router.push('/agency-team-chat')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon name="chatbubbles-outline" size={20} color={colors.primary} /></View>
    <View style={styles.copy}>
      <Text style={[styles.title, unread > 0 && styles.unread]}>Chat del equipo</Text>
      <Text numberOfLines={1} style={[styles.preview, unread > 0 && styles.unreadPreview]}>{preview}</Text>
    </View>
    {unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
    <Icon name="chevron-forward" size={17} color={colors.body} />
  </Pressable>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: rounded.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: rounded.pill, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 }, title: { ...typography.body, color: colors.ink }, unread: { fontWeight: '700' },
  preview: { ...typography.label, fontWeight: '400', color: colors.body }, unreadPreview: { color: colors.ink, fontWeight: '600' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryFill, borderRadius: rounded.pill },
  badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
}));
```

`fontSize: 11` copia la insignia de `InboxScreen`, para que se vean iguales.

- [ ] **Step 2: Mi inmobiliaria**

En `src/screens/AgencyWorkspaceScreen.tsx`:
- Importa `import {TeamChatRow} from '../components/agencies/TeamChatRow';`.
- Justo después de `<AgencyStats key={`${w.activeAgencyId}:${w.generation}`}/>`, añade:

```tsx
  <TeamChatRow/>
```

- [ ] **Step 3: Bandeja del equipo**

En `src/screens/InboxScreen.tsx`:
- Importa `TeamChatRow`.
- En `AgencyInbox`, justo después del `View` de píldoras (`s.agencyFilters`), añade:

```tsx
  {staff&&<TeamChatRow/>}
```

- [ ] **Step 4: Comprobar**

Run: `npm run check`
Expected:
- Las pruebas nuevas pasan.
- Los únicos fallos permitidos son los 2 conocidos de `android-private-reference`, que necesitan `pwsh`.

### Task 7: Mirar en la web

- [ ] **Step 1:** Abre la configuración `web` de `.claude/launch.json`, entra con una cuenta que pertenezca a una inmobiliaria y abre Mi inmobiliaria.
  - Sin la migración aplicada, la fila muestra «Habla con todo el equipo.».
  - La pantalla muestra «Chat no disponible» con «Reintentar» (`PGRST202`). Es el estado de error esperado.
- [ ] **Step 2:** Captura a 390 × 844, 320 × 740 y 1280 × 800, de noche y de día. Comprueba que nada se corta y que solo el botón de enviar va en azul relleno.
- [ ] **Step 3:** Deja pendiente para Android real:
  - El teclado sobre el campo de escribir.
  - Calistoga nativa.
  - Las áreas seguras.
  - El chat con datos reales, después de aplicar la migración con el «sí» del usuario.

### Task 8: Commit (solo con permiso)

- [ ] Pregunta al usuario si quiere commit, y en qué rama. Con su «sí»:

```bash
git add supabase/migrations/20261017000200_agency_team_chat.sql supabase/tests/agency_team_chat.sql scripts/apply-reviewed-migration.mjs src/agencies/messaging/teamChat.ts src/agencies/messaging/repository.ts src/agencies/messaging/live.ts src/agencies/domain.ts tests/agency-team-chat.test.ts src/components/messaging/MessageBubble.tsx src/screens/AgencyTeamChatScreen.tsx src/app/agency-team-chat.tsx src/components/agencies/TeamChatRow.tsx src/screens/AgencyWorkspaceScreen.tsx src/screens/InboxScreen.tsx docs/superpowers/specs/2026-10-17-agency-chat-design.md docs/superpowers/plans/2026-10-17-agency-team-chat.md
git commit -m "feat(agencies): internal team chat for every agency"
```
