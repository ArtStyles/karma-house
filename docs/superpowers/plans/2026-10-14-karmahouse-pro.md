# KarmaHouse Pro — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro por cuenta personal o inmobiliaria, activado por el propietario directamente o con un código de un solo uso, con sello Pro, subida semanal del anuncio, historial de precios y un informe de mercado manual.

**Architecture:** Una migración (`20261014000100_karmahouse_pro.sql`) crea el estado Pro, los códigos, la subida y el historial en `kh_private`, y expone RPC con `p_actor_id` como el resto del proyecto. El cliente añade `src/pro/` (dominio, repositorio y hooks), una pantalla `/pro`, una pantalla de administración `/admin-pro`, el sello y el botón «Subir anuncio». El informe es un script de solo lectura que escribe HTML.

**Tech Stack:** PostgreSQL 17 (Supabase), TypeScript, React Native / Expo Router (SDK 57), `node --test`.

Spec: `docs/superpowers/specs/2026-10-14-karmahouse-pro-design.md`. Léela entera antes de empezar.

**Contexto:**

- `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`. Los tests no pasan por `tsc` (`tsconfig.json` los excluye).
- Antes de tocar código de la app, lee la documentación de Expo 57 que use cada tarea: https://docs.expo.dev/versions/v57.0.0/ (`AGENTS.md` lo exige). Para `Share` y `Linking` mira también la de React Native 0.86.
- Código en inglés; interfaz, documentos y commits en español o inglés como en el historial. Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca ejecutes nada contra producción (`scripts/apply-pro.mjs`, `scripts/market-report.mjs`) sin permiso expreso del usuario en el chat.
- **Orden de despliegue:** primero la migración en producción, después cualquier cliente nuevo. El cliente nuevo pide el campo calculado `kh_is_pro`; contra un servidor sin la migración no podría leer anuncios.
- Las RPC del proyecto reciben `p_actor_id` y lo comparan con `auth.uid()`. `useAdminApi()` (`src/admin/useAdminApi.ts`) lo añade solo. El patrón de repositorio con identidad fija está en `src/data/propertyReports.ts`.
- Referencias SQL: `supabase/migrations/20261003000100_owner_administration.sql` (`admin_actor`, `audit_action`, `require_active`), `20260921000100_catalog_pagination.sql` (`kh_search_properties`), `20261007000300_agency_property_origins.sql` (`owner_publication_alerts`, `bind_property_media`, permisos de escritura), `supabase/tests/owner_administration.sql` (estilo de suite).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261014000100_karmahouse_pro.sql` | Toda la parte de servidor |
| `supabase/tests/pro.sql` | Estado, códigos, canje y administración |
| `supabase/tests/pro_bump.sql` | Subida, catálogo, alertas e historial |
| `scripts/apply-pro.mjs` | Ensayo y aplicación en producción, con permiso |
| `src/pro/domain.ts` | Código, fechas, mensajes y decodificadores |
| `src/pro/repository.ts` | RPC de la persona y sello público |
| `src/pro/usePro.ts`, `src/pro/useProBadge.ts` | Hooks de estado y sello |
| `src/components/ProBadge.tsx` | Píldora «Pro» |
| `src/screens/ProScreen.tsx`, `src/app/pro.tsx` | Pantalla `/pro` |
| `src/screens/AdminProScreen.tsx`, `src/app/admin-pro.tsx` | Administración de Pro |
| `scripts/market-report-lib.mjs`, `scripts/market-report.mjs` | Informe de mercado |
| `tests/pro.test.ts`, `tests/market-report.test.ts` | Pruebas de cliente e informe |
| Modificados | `src/data/remoteMapping.ts`, `src/data/supabaseMarketplace.ts`, `src/domain/listings.ts`, `src/components/PropertyCard.tsx`, `src/screens/DetailScreen.tsx`, `src/screens/PublicProfileScreen.tsx`, `src/screens/ProfileScreen.tsx`, `src/screens/AccountSettingsScreen.tsx`, `src/screens/MyListingsScreen.tsx`, `src/screens/AgencyPortfolioScreen.tsx`, `src/screens/AdministrationScreen.tsx`, `src/screens/AdminManagementScreen.tsx`, `src/screens/AgencyReviewsScreen.tsx`, `src/admin/domain.ts` |

---

### Task 1: Base PostgreSQL local para las suites

Sin commit. Prepara un clúster desechable fuera del repositorio. Los scripts `scripts/local-sql/*.mjs` solo aceptan bases en loopback cuyo nombre empiece por `kh_assisted_test`.

- [ ] **Step 1: Crear y arrancar el clúster**

```powershell
& "C:\Program Files\PostgreSQL\17\bin\initdb.exe" -D "$env:LOCALAPPDATA\kh-pro-pg" -U kh_test --auth=trust -E UTF8 --locale=C
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\kh-pro-pg" -o "-p 56440 -c listen_addresses=127.0.0.1" -l "$env:LOCALAPPDATA\kh-pro-pg\server.log" start
```

Expected: `server started`.

- [ ] **Step 2: Comprobar que las migraciones actuales cargan**

`setup.mjs` crea siempre una base nueva y se niega a reutilizarla, así que cada ejecución lleva un nombre con la hora.

```powershell
$env:KH_LOCAL_DATABASE_URL = "postgresql://kh_test@127.0.0.1:56440/kh_assisted_test_pro_$(Get-Date -Format 'MMddHHmmss')"
node scripts/local-sql/setup.mjs
node scripts/local-sql/run-suite.mjs catalog_pagination owner_administration
```

Expected: una línea `applied locally: <archivo>` por migración y después `PASS catalog_pagination (rollback)` y `PASS owner_administration (rollback)`. Si falla aquí, el problema es del entorno, no de Pro: corrígelo antes de seguir.

En adelante, «**base nueva**» significa repetir las dos primeras líneas de este paso (variable con hora nueva y `setup.mjs`).

---

### Task 2: Estado Pro, códigos y administración (servidor)

**Files:**
- Create: `supabase/tests/pro.sql`
- Create: `supabase/migrations/20261014000100_karmahouse_pro.sql`

- [ ] **Step 1: Escribir la suite**

`supabase/tests/pro.sql`:

```sql
-- KarmaHouse Pro: status, codes, redemption and owner administration. Everything rolls back.
-- O owner (…01), D admin (…02), A member (…03), B member (…04), R rate-limited (…05),
-- G agency admin (…06), M agency manager (…07). Agency a1 is approved, a2 is pending.
begin;
create function pg_temp.pro_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'PRO ASSERTION: %',label; end if; end $$;
create function pg_temp.pro_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'PRO ASSERTION: missing error %',expected;
end $$;
create function pg_temp.pro_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data)
 select ('43000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pro-'||n||'@example.invalid',jsonb_build_object('display_name','Persona Pro '||n)
 from generate_series(1,7) n;
insert into kh_private.platform_owner(singleton,user_id) values(true,'43000000-0000-4000-8000-000000000001')
 on conflict(singleton) do update set user_id=excluded.user_id;
insert into public.kh_admins(user_id) values('43000000-0000-4000-8000-000000000002');
insert into kh_private.agencies(id,trade_name,state) values
 ('43000000-0000-4000-8000-0000000000a1','Casas Pro Ficticias','approved'),
 ('43000000-0000-4000-8000-0000000000a2','Agencia Pendiente Ficticia','pending');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('43000000-0000-4000-8000-0000000000a1','43000000-0000-4000-8000-000000000006','admin'),
 ('43000000-0000-4000-8000-0000000000a1','43000000-0000-4000-8000-000000000007','manager');
create temporary table pro_ctx(free_code text,bound_code text,agency_code text,agency_bound text,expired_code text,cancel_code text,first_until timestamptz);
insert into pro_ctx default values;
grant all on pro_ctx to authenticated;

set local role authenticated;
-- Only the protected owner creates codes, with valid days, a note and at most one recipient.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000003',30,'Pago de prueba')$q$,'KH_ADMIN_REQUIRED');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000002',30,'Pago de prueba')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',0,'Pago de prueba')$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'no')$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago de prueba','43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-0000000000a1')$q$,'KH_PRO_INVALID');
update pro_ctx set
 free_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago libre de prueba')->>'code',
 bound_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',90,'Pago atado de prueba','43000000-0000-4000-8000-000000000004')->>'code',
 agency_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago inmobiliaria libre')->>'code',
 agency_bound=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',365,'Pago inmobiliaria atada',null,'43000000-0000-4000-8000-0000000000a1')->>'code',
 expired_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código que caducará')->>'code',
 cancel_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código que se anulará')->>'code';
select pg_temp.pro_assert(free_code ~ '^KH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$','codes use the unambiguous alphabet') from pro_ctx;

reset role;
select pg_temp.pro_assert((select count(*)=1 from kh_private.pro_codes c,pro_ctx x where c.code_hash=sha256(convert_to(replace(substr(x.free_code,4),'-',''),'UTF8'))),'only the hash of the code body is stored');
update kh_private.pro_codes set expires_at=now()-interval '1 second' where code_hash=kh_private.pro_code_hash((select expired_code from pro_ctx));
set local role authenticated;

-- Redemption: lower case and spaces are fine, a retry adds nothing, a used code is refused.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',lower(replace(free_code,'-',' ')))->>'ok')::boolean,'a free code redeems in lower case and with spaces') from pro_ctx;
update pro_ctx set first_until=(public.kh_pro_status('43000000-0000-4000-8000-000000000003')->>'personalUntil')::timestamptz;
select pg_temp.pro_assert(first_until=now()+interval '30 days','thirty days of Pro') from pro_ctx;
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',free_code)->>'until')::timestamptz=first_until,'a retry by the same person succeeds without adding days') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',free_code)->>'error'='KH_PRO_CODE_INVALID','a used code fails for someone else') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',bound_code)->>'error'='KH_PRO_CODE_INVALID','a code bound to B fails for A') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',bound_code,'43000000-0000-4000-8000-0000000000a1')->>'kind'='user','the bound account wins over a chosen agency') from pro_ctx;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',expired_code)->>'error'='KH_PRO_CODE_INVALID','an expired code fails') from pro_ctx;

-- Cancelling: only unused codes, and the list states every code.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',
 (select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Código que se anulará'),'Cliente desistió');
select pg_temp.pro_error($q$select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',(select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Código que se anulará'),'Otra vez')$q$,'KH_PRO_CODE_STATE');
select pg_temp.pro_error($q$select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',(select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Pago libre de prueba'),'Ya usado')$q$,'KH_PRO_CODE_STATE');
select pg_temp.pro_assert((select jsonb_object_agg(i->>'note',i->>'state') from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i)
 @> '{"Pago libre de prueba":"redeemed","Código que caducará":"expired","Código que se anulará":"cancelled","Pago inmobiliaria libre":"unused"}','the list states every code');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',cancel_code)->>'error'='KH_PRO_CODE_INVALID','a cancelled code fails') from pro_ctx;

-- Agency codes: only an admin of an approved agency redeems them; days add up.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000007');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000007',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'error'='KH_PRO_CODE_INVALID','a manager cannot redeem for the agency') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000006');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'kind'='agency','the agency admin redeems for the agency') from pro_ctx;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_bound)->>'kind'='agency','an agency-bound code needs no agency choice') from pro_ctx;
select pg_temp.pro_assert((select (a->>'until')::timestamptz=now()+interval '395 days' from jsonb_array_elements(public.kh_pro_status('43000000-0000-4000-8000-000000000006')->'agencies') a where a->>'id'='43000000-0000-4000-8000-0000000000a1'),'agency days add up: 30 + 365');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000007');
select pg_temp.pro_assert(jsonb_array_length(public.kh_pro_status('43000000-0000-4000-8000-000000000007')->'agencies')=1
 and public.kh_pro_status('43000000-0000-4000-8000-000000000007')->>'personalUntil' is null,'a manager sees the agency Pro, not a personal one');

reset role;
insert into kh_private.pro_status(agency_id,pro_until) values('43000000-0000-4000-8000-0000000000a2',now()+interval '30 days');
select pg_temp.pro_assert(kh_private.agency_pro_until('43000000-0000-4000-8000-0000000000a2') is null,'an agency that is not approved has no effective Pro');
set local role authenticated;

-- Five failures within an hour block the sixth try before the code is even read.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000005');
select public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000005','KH-2222-2222-222'||n) from generate_series(2,6) n;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000005',agency_code)->>'error'='KH_PRO_CODE_RATE','the sixth try within an hour is refused') from pro_ctx;

-- Direct grants add days; the list runs by expiry; revoking ends Pro once.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_assert((public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000001',90,'Renovación pagada','43000000-0000-4000-8000-000000000003')->>'until')::timestamptz=first_until+interval '90 days','a direct grant adds days to the current Pro') from pro_ctx;
select pg_temp.pro_error($q$select public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000001',30,'Sin destinatario')$q$,'KH_PRO_INVALID');
select pg_temp.pro_assert((select array_agg(i->>'id' order by o) from jsonb_array_elements(public.kh_admin_list_pro_accounts('43000000-0000-4000-8000-000000000001')->'items') with ordinality x(i,o))
 =array['43000000-0000-4000-8000-0000000000a2','43000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-0000000000a1'],'Pro accounts are listed by expiry');
select public.kh_admin_revoke_pro('43000000-0000-4000-8000-000000000001','Devolución del pago','43000000-0000-4000-8000-000000000004');
select pg_temp.pro_error($q$select public.kh_admin_revoke_pro('43000000-0000-4000-8000-000000000001','Devolución del pago','43000000-0000-4000-8000-000000000004')$q$,'KH_PRO_NOT_ACTIVE');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert((public.kh_pro_status('43000000-0000-4000-8000-000000000004')->>'personalUntil')::timestamptz<=now(),'a revoked Pro has ended');

reset role;
-- 6 created, 1 cancelled, 4 redeemed, 1 granted, 1 revoked; retries are not audited.
select pg_temp.pro_assert((select count(*) from kh_private.admin_audit where action in('pro_code_created','pro_code_cancelled','pro_code_redeemed','pro_granted','pro_revoked'))=13,'every Pro action is in the history');

-- The public badge needs a public listing; private tables and someone else's status stay closed.
set local role anon;
select pg_temp.pro_as(null);
select pg_temp.pro_assert(public.kh_pro_badge('43000000-0000-4000-8000-000000000003') is false,'no badge without a public listing');
select pg_temp.pro_error($q$select public.kh_pro_status('43000000-0000-4000-8000-000000000003')$q$,'permission denied');
set local role authenticated;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select * from kh_private.pro_codes$q$,'permission denied');
select pg_temp.pro_error($q$select * from kh_private.pro_status$q$,'permission denied');
select pg_temp.pro_error($q$select public.kh_pro_status('43000000-0000-4000-8000-000000000004')$q$,'KH_ACCOUNT_CHANGED');
rollback;
```

- [ ] **Step 2: Ejecutarla sin migración y ver que falla**

Base nueva, y después:

```powershell
node scripts/local-sql/run-suite.mjs pro
```

Expected: FAIL con `function public.kh_admin_create_pro_code(...) does not exist`.

- [ ] **Step 3: Escribir la primera parte de la migración**

`supabase/migrations/20261014000100_karmahouse_pro.sql`:

```sql
-- KarmaHouse Pro v1 (docs/superpowers/specs/2026-10-14-karmahouse-pro-design.md).
-- Pro per account or agency, single-use codes, weekly bump and price history.
-- Payment happens outside the app; nothing here charges anyone.

-- 1. Pro status and codes ---------------------------------------------------------------
create table kh_private.pro_status(
 user_id uuid unique references auth.users(id) on delete cascade,
 agency_id uuid unique references kh_private.agencies(id) on delete cascade,
 pro_until timestamptz not null,
 updated_at timestamptz not null default now(),
 check(num_nonnulls(user_id,agency_id)=1)
);
create table kh_private.pro_codes(
 id uuid primary key default gen_random_uuid(),
 code_hash bytea not null unique,
 days integer not null check(days between 1 and 365),
 note text not null check(char_length(note) between 3 and 500),
 bound_user_id uuid references auth.users(id) on delete cascade,
 bound_agency_id uuid references kh_private.agencies(id) on delete cascade,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 cancelled_at timestamptz,
 redeemed_by uuid references auth.users(id) on delete set null,
 redeemed_user_id uuid references auth.users(id) on delete set null,
 redeemed_agency_id uuid references kh_private.agencies(id) on delete set null,
 redeemed_at timestamptz,
 check(num_nonnulls(bound_user_id,bound_agency_id)<=1)
);
-- ponytail: failed attempts are never purged; one row per failure is tiny. Purge rows older
-- than a day from a scheduled job if the table ever grows.
create table kh_private.pro_code_attempts(
 user_id uuid not null references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default clock_timestamp()
);
create index pro_code_attempts_recent on kh_private.pro_code_attempts(user_id,attempted_at);
do $$ declare t text; begin
 foreach t in array array['pro_status','pro_codes','pro_code_attempts'] loop
  execute format('alter table kh_private.%I enable row level security',t);
  execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
  execute format('grant all on kh_private.%I to service_role',t);
 end loop;
end $$;

-- Only a 14-symbol input carries the KH prefix: a 12-symbol body may itself start with KH.
create function kh_private.pro_code_hash(p_code text) returns bytea language sql immutable set search_path='' as $$
 select pg_catalog.sha256(convert_to(case when char_length(c)=14 and left(c,2)='KH' then substr(c,3) else c end,'UTF8'))
 from (select regexp_replace(upper(coalesce(p_code,'')),'[^0-9A-Z]','','g') c) n
$$;
-- 12 symbols from a 32-symbol alphabet without 0, O, 1 or I: 60 random bits. The first byte of a
-- v4 UUID is fully random and 256 is a multiple of 32, so every symbol is uniform.
create function kh_private.pro_new_code() returns text language sql volatile set search_path='' as $$
 select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',get_byte(uuid_send(gen_random_uuid()),0)%32+1,1),'' order by i)
 from generate_series(1,12) i
$$;
create function kh_private.user_pro_until(p_user uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select pro_until from kh_private.pro_status where user_id=p_user
$$;
-- A suspended or pending agency keeps its date but has no effective Pro until approved again.
create function kh_private.agency_pro_until(p_agency uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select s.pro_until from kh_private.pro_status s join kh_private.agencies a on a.id=s.agency_id
 where s.agency_id=p_agency and a.state='approved'
$$;
-- Agency Pro covers what that agency published; personal Pro covers the owner's other listings.
create function kh_private.property_pro_active(p_property uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(case when o.origin_agency_id is null then kh_private.user_pro_until(p_owner)
  else kh_private.agency_pro_until(o.origin_agency_id) end>now(),false)
 from (select (select origin_agency_id from kh_private.agency_property_origins where property_id=p_property) origin_agency_id) o
$$;
create function kh_private.extend_pro(p_user uuid,p_agency uuid,p_days integer) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v timestamptz;
begin
 if num_nonnulls(p_user,p_agency)<>1 or p_days is null or p_days not between 1 and 365 then raise exception 'KH_PRO_INVALID'; end if;
 if p_user is not null then
  insert into kh_private.pro_status as s(user_id,pro_until) values(p_user,now()+make_interval(days=>p_days))
  on conflict(user_id) do update set pro_until=greatest(now(),s.pro_until)+make_interval(days=>p_days),updated_at=now()
  returning s.pro_until into v;
 else
  insert into kh_private.pro_status as s(agency_id,pro_until) values(p_agency,now()+make_interval(days=>p_days))
  on conflict(agency_id) do update set pro_until=greatest(now(),s.pro_until)+make_interval(days=>p_days),updated_at=now()
  returning s.pro_until into v;
 end if;
 return v;
end $$;
create function kh_private.pro_subject_name(p_user uuid,p_agency uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select display_name from public.profiles where id=p_user),(select trade_name from kh_private.agencies where id=p_agency),'Código libre')
$$;
create function kh_private.pro_require_subject(p_user uuid,p_agency uuid,p_optional boolean) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if num_nonnulls(p_user,p_agency)>1 or (not p_optional and num_nonnulls(p_user,p_agency)=0) then raise exception 'KH_PRO_INVALID'; end if;
 if p_user is not null and not exists(select 1 from public.profiles where id=p_user) then raise exception 'KH_PRO_INVALID'; end if;
 if p_agency is not null and not exists(select 1 from kh_private.agencies where id=p_agency) then raise exception 'KH_PRO_INVALID'; end if;
end $$;

-- 2. Public reads -----------------------------------------------------------------------
-- PostgREST computed field: select 'is_pro:kh_is_pro' next to the property columns.
create function public.kh_is_pro(p public.properties) returns boolean language sql stable security definer set search_path='' as $$
 select kh_private.property_pro_active(p.id,p.owner_id)
$$;
-- A profile badge exists only where the profile is public: at least one live listing.
create function public.kh_pro_badge(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(kh_private.user_pro_until(p_user_id)>now(),false)
  and exists(select 1 from public.properties where owner_id=p_user_id and moderation='approved' and availability='active')
$$;

-- 3. The person's own Pro -----------------------------------------------------------------
create function public.kh_pro_status(p_actor_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
 return jsonb_build_object('personalUntil',kh_private.user_pro_until(p_actor_id),'agencies',coalesce((
  select jsonb_agg(jsonb_build_object('id',a.id,'tradeName',a.trade_name,'role',m.role,'until',kh_private.agency_pro_until(a.id)) order by a.trade_name,a.id)
  from kh_private.agency_memberships m join kh_private.agencies a on a.id=m.agency_id
  where m.user_id=p_actor_id and m.state='active' and a.state='approved'),'[]'::jsonb));
end $$;

-- Failures return instead of raising: an exception would also roll back the attempt row and
-- the hourly limit would never count.
create function public.kh_redeem_pro_code(p_actor_id uuid,p_code text,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kh_private.pro_codes%rowtype; v_user uuid; v_agency uuid; v_until timestamptz;
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
 perform kh_private.require_active();
 perform pg_advisory_xact_lock(hashtextextended('kh:pro:redeem:'||p_actor_id::text,0));
 if (select count(*) from kh_private.pro_code_attempts where user_id=p_actor_id and attempted_at>clock_timestamp()-interval '1 hour')>=5 then
  return jsonb_build_object('ok',false,'error','KH_PRO_CODE_RATE');
 end if;
 select * into c from kh_private.pro_codes where code_hash=kh_private.pro_code_hash(p_code) for update;
 if found then
  -- A bound code decides its recipient; a free one goes to the chosen agency or to the person.
  v_user:=case when c.bound_user_id is not null then c.bound_user_id when c.bound_agency_id is null and p_agency_id is null then p_actor_id end;
  v_agency:=coalesce(c.bound_agency_id,case when c.bound_user_id is null then p_agency_id end);
  if c.redeemed_at is not null and c.redeemed_by=p_actor_id and c.redeemed_user_id is not distinct from v_user and c.redeemed_agency_id is not distinct from v_agency then
   return jsonb_build_object('ok',true,'kind',case when v_user is null then 'agency' else 'user' end,'id',coalesce(v_user,v_agency),
    'until',case when v_user is null then kh_private.agency_pro_until(v_agency) else kh_private.user_pro_until(v_user) end);
  end if;
 end if;
 if not found or c.cancelled_at is not null or c.redeemed_at is not null or c.expires_at<=now()
  or (v_user is not null and v_user<>p_actor_id)
  or (v_agency is not null and not exists(select 1 from kh_private.agency_memberships m join kh_private.agencies a on a.id=m.agency_id
      where m.agency_id=v_agency and m.user_id=p_actor_id and m.state='active' and m.role='admin' and a.state='approved')) then
  insert into kh_private.pro_code_attempts(user_id) values(p_actor_id);
  return jsonb_build_object('ok',false,'error','KH_PRO_CODE_INVALID');
 end if;
 update kh_private.pro_codes set redeemed_by=p_actor_id,redeemed_user_id=v_user,redeemed_agency_id=v_agency,redeemed_at=now() where id=c.id;
 v_until:=kh_private.extend_pro(v_user,v_agency,c.days);
 perform kh_private.audit_action('pro_code_redeemed',c.id,kh_private.pro_subject_name(v_user,v_agency),null);
 return jsonb_build_object('ok',true,'kind',case when v_user is null then 'agency' else 'user' end,'id',coalesce(v_user,v_agency),'until',v_until);
end $$;

-- 4. Owner administration -------------------------------------------------------------------
create function public.kh_admin_create_pro_code(p_actor_id uuid,p_days integer,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); v_code text; v_id uuid; v_expires timestamptz:=now()+interval '30 days';
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_days is null or p_days not between 1 and 365 or char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,true);
 loop
  v_code:=kh_private.pro_new_code();
  begin
   insert into kh_private.pro_codes(code_hash,days,note,bound_user_id,bound_agency_id,created_by,expires_at)
   values(kh_private.pro_code_hash(v_code),p_days,v_note,p_user_id,p_agency_id,p_actor_id,v_expires) returning id into v_id;
   exit;
  exception when unique_violation then null; -- 60 bits make a repeat practically impossible; the loop only guards it.
  end;
 end loop;
 perform kh_private.audit_action('pro_code_created',v_id,kh_private.pro_subject_name(p_user_id,p_agency_id),v_note);
 return jsonb_build_object('id',v_id,'code','KH-'||substr(v_code,1,4)||'-'||substr(v_code,5,4)||'-'||substr(v_code,9,4),'expiresAt',v_expires);
end $$;

-- 31 rows answer "is there more"; the client keeps 30, like kh_admin_accounts keeps 50.
create function public.kh_admin_list_pro_codes(p_actor_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_PRO_INVALID'; end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(t.item order by t.created_at desc,t.id),'[]'::jsonb),'hasMore',count(*)>30) from (
  select c.id,c.created_at,jsonb_build_object('id',c.id,'days',c.days,'note',c.note,
   'boundName',case when num_nonnulls(c.bound_user_id,c.bound_agency_id)=0 then null else kh_private.pro_subject_name(c.bound_user_id,c.bound_agency_id) end,
   'state',case when c.cancelled_at is not null then 'cancelled' when c.redeemed_at is not null then 'redeemed' when c.expires_at<=now() then 'expired' else 'unused' end,
   'createdAt',c.created_at,'expiresAt',c.expires_at,'redeemedAt',c.redeemed_at,
   'redeemedFor',case when c.redeemed_at is null then null else kh_private.pro_subject_name(c.redeemed_user_id,c.redeemed_agency_id) end) item
  from kh_private.pro_codes c order by c.created_at desc,c.id offset p_offset limit 31) t);
end $$;

create function public.kh_admin_cancel_pro_code(p_actor_id uuid,p_code_id uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); c kh_private.pro_codes%rowtype;
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 select * into c from kh_private.pro_codes where id=p_code_id for update;
 if not found or c.cancelled_at is not null or c.redeemed_at is not null then raise exception 'KH_PRO_CODE_STATE'; end if;
 update kh_private.pro_codes set cancelled_at=now() where id=c.id;
 perform kh_private.audit_action('pro_code_cancelled',c.id,kh_private.pro_subject_name(c.bound_user_id,c.bound_agency_id),v_note);
end $$;

create function public.kh_admin_grant_pro(p_actor_id uuid,p_days integer,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); v_until timestamptz;
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,false);
 v_until:=kh_private.extend_pro(p_user_id,p_agency_id,p_days);
 perform kh_private.audit_action('pro_granted',coalesce(p_user_id,p_agency_id),kh_private.pro_subject_name(p_user_id,p_agency_id),v_note);
 return jsonb_build_object('until',v_until);
end $$;

create function public.kh_admin_revoke_pro(p_actor_id uuid,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,''));
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,false);
 update kh_private.pro_status set pro_until=now(),updated_at=now() where (user_id=p_user_id or agency_id=p_agency_id) and pro_until>now();
 if not found then raise exception 'KH_PRO_NOT_ACTIVE'; end if;
 perform kh_private.audit_action('pro_revoked',coalesce(p_user_id,p_agency_id),kh_private.pro_subject_name(p_user_id,p_agency_id),v_note);
end $$;

create function public.kh_admin_list_pro_accounts(p_actor_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_PRO_INVALID'; end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(t.item order by t.pro_until,t.sid),'[]'::jsonb),'hasMore',count(*)>30) from (
  select s.pro_until,coalesce(s.user_id,s.agency_id) sid,jsonb_build_object('kind',case when s.user_id is null then 'agency' else 'user' end,
   'id',coalesce(s.user_id,s.agency_id),'name',kh_private.pro_subject_name(s.user_id,s.agency_id),'until',s.pro_until) item
  from kh_private.pro_status s where s.pro_until>now() order by s.pro_until,coalesce(s.user_id,s.agency_id) offset p_offset limit 31) t);
end $$;

-- 5. Privileges ---------------------------------------------------------------------------------
revoke all on function kh_private.pro_code_hash(text),kh_private.pro_new_code(),kh_private.user_pro_until(uuid),
 kh_private.agency_pro_until(uuid),kh_private.extend_pro(uuid,uuid,integer),kh_private.pro_subject_name(uuid,uuid),
 kh_private.pro_require_subject(uuid,uuid,boolean) from public,anon,authenticated;
-- kh_search_properties is security invoker, so anon needs this one to mark catalogue rows.
revoke all on function kh_private.property_pro_active(uuid,uuid) from public;
grant execute on function kh_private.property_pro_active(uuid,uuid) to anon,authenticated;
revoke all on function public.kh_is_pro(public.properties),public.kh_pro_badge(uuid) from public;
grant execute on function public.kh_is_pro(public.properties),public.kh_pro_badge(uuid) to anon,authenticated;
revoke all on function public.kh_pro_status(uuid),public.kh_redeem_pro_code(uuid,text,uuid),
 public.kh_admin_create_pro_code(uuid,integer,text,uuid,uuid),public.kh_admin_list_pro_codes(uuid,integer),
 public.kh_admin_cancel_pro_code(uuid,uuid,text),public.kh_admin_grant_pro(uuid,integer,text,uuid,uuid),
 public.kh_admin_revoke_pro(uuid,text,uuid,uuid),public.kh_admin_list_pro_accounts(uuid,integer) from public,anon;
grant execute on function public.kh_pro_status(uuid),public.kh_redeem_pro_code(uuid,text,uuid),
 public.kh_admin_create_pro_code(uuid,integer,text,uuid,uuid),public.kh_admin_list_pro_codes(uuid,integer),
 public.kh_admin_cancel_pro_code(uuid,uuid,text),public.kh_admin_grant_pro(uuid,integer,text,uuid,uuid),
 public.kh_admin_revoke_pro(uuid,text,uuid,uuid),public.kh_admin_list_pro_accounts(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Ejecutar la suite con la migración**

Base nueva, y después `node scripts/local-sql/run-suite.mjs pro`.

Expected: `PASS pro (rollback)`. Si una aserción falla, el mensaje `PRO ASSERTION: <texto>` dice cuál. Corrige la migración, no la suite, salvo que la suite contradiga la spec.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014000100_karmahouse_pro.sql supabase/tests/pro.sql
git commit -m "feat(pro): add Pro status, single-use codes and owner administration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Subida semanal, catálogo e historial de precios (servidor)

**Files:**
- Create: `supabase/tests/pro_bump.sql`
- Modify: `supabase/migrations/20261014000100_karmahouse_pro.sql` (se añade antes de la línea final `notify pgrst, 'reload schema';`)

- [ ] **Step 1: Escribir la suite**

`supabase/tests/pro_bump.sql`:

```sql
-- KarmaHouse Pro: weekly bump, catalogue order, alerts and price history. Everything rolls back.
-- O owner (…01), S seller (…02), X stranger (…03), G agency admin (…04), M agency manager (…05),
-- W watcher with a saved search (…06). Listings b1-b4 sit in a province no real listing uses.
begin;
create function pg_temp.pro_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'BUMP ASSERTION: %',label; end if; end $$;
create function pg_temp.pro_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'BUMP ASSERTION: missing error %',expected;
end $$;
create function pg_temp.pro_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data)
 select ('44000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'bump-'||n||'@example.invalid',jsonb_build_object('display_name','Persona Bump '||n)
 from generate_series(1,6) n;
insert into kh_private.platform_owner(singleton,user_id) values(true,'44000000-0000-4000-8000-000000000001')
 on conflict(singleton) do update set user_id=excluded.user_id;
insert into kh_private.agencies(id,trade_name,state) values('44000000-0000-4000-8000-0000000000a1','Casas Bump Ficticias','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000004','admin'),
 ('44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000005','manager');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,created_at) values
 ('44000000-0000-4000-8000-0000000000b1','44000000-0000-4000-8000-000000000002','pro-b1','Casa antigua para subir','Vedado','Zona Pro Prueba','Casa','Vivienda ficticia para probar la subida semanal.',50000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b1/photo.jpg'],'approved',now()-interval '8 days'),
 ('44000000-0000-4000-8000-0000000000b2','44000000-0000-4000-8000-000000000002','pro-b2','Casa reciente','Playa','Zona Pro Prueba','Casa','Vivienda ficticia publicada ayer para la prueba.',60000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b2/photo.jpg'],'approved',now()-interval '1 day'),
 ('44000000-0000-4000-8000-0000000000b3','44000000-0000-4000-8000-000000000002','pro-b3','Casa en revisión','Cerro','Zona Pro Prueba','Casa','Vivienda ficticia que todavía espera revisión.',70000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b3/photo.jpg'],'pending',now()-interval '8 days'),
 ('44000000-0000-4000-8000-0000000000b4','44000000-0000-4000-8000-000000000004','pro-b4','Casa de la inmobiliaria','Centro','Zona Pro Prueba','Casa','Vivienda ficticia publicada por la inmobiliaria.',80000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000004/pro-b4/photo.jpg'],'approved',now()-interval '9 days');
insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)
 values('44000000-0000-4000-8000-0000000000b4','44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000004','ref-b4','consent-b4');
create temporary table bump_ctx(page jsonb,before_alerts bigint,owner_ad uuid);
insert into bump_ctx default values;
grant all on bump_ctx to authenticated;
create function pg_temp.bump_page(p_cursor text default null) returns jsonb language sql as $$
 select public.kh_search_properties(jsonb_build_object('sort','recent','query','','min_bedrooms',0,'amenities','[]'::jsonb,
  'with_total',true,'limit',2,'province','Zona Pro Prueba')||case when p_cursor is null then '{}'::jsonb else jsonb_build_object('cursor',p_cursor) end)
$$;

set local role authenticated;
-- Personal Pro: required, once a week, only for live listings of one's own.
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_PRO_REQUIRED');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Pago de prueba','44000000-0000-4000-8000-000000000002');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_assert((public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')->>'nextBumpAt')::timestamptz=now()+interval '7 days','a bump allows the next one in a week');
select pg_temp.pro_assert((select bumped_at=now() and version=1 and created_at=now()-interval '8 days' from public.properties where id='44000000-0000-4000-8000-0000000000b1'),'a bump moves only bumped_at');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_BUMP_TOO_SOON');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b2')$q$,'KH_BUMP_TOO_SOON');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b3')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b4')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-0000000000b1')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_ACCOUNT_CHANGED');

-- «Más recientes» puts the bumped listing first, marks Pro rows and pages by the same key.
update bump_ctx set page=pg_temp.bump_page();
select pg_temp.pro_assert((select array_agg(r->>'id' order by o) from bump_ctx,jsonb_array_elements(page->'rows') with ordinality t(r,o))
 =array['44000000-0000-4000-8000-0000000000b1','44000000-0000-4000-8000-0000000000b2'],'the bumped listing leads «Más recientes»');
select pg_temp.pro_assert((select bool_and((r->>'is_pro')::boolean) from bump_ctx,jsonb_array_elements(page->'rows') r),'personal Pro marks both listings of the seller');
select pg_temp.pro_assert((select split_part(page->>'next_cursor','|',4)::timestamptz=now()-interval '1 day' from bump_ctx),'the cursor carries the ordering key');
update bump_ctx set page=pg_temp.bump_page(page->>'next_cursor');
select pg_temp.pro_assert((select page->'rows'->0->>'id'='44000000-0000-4000-8000-0000000000b4' and (page->'rows'->0->>'is_pro')::boolean is false
 and jsonb_array_length(page->'rows')=1 from bump_ctx),'the next page brings the agency listing, without Pro');

-- Agency Pro: any active member bumps what the agency published; no write permit is left behind.
select pg_temp.pro_as('44000000-0000-4000-8000-000000000005');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4')$q$,'KH_PRO_REQUIRED');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Pago inmobiliaria',null,'44000000-0000-4000-8000-0000000000a1');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000005');
select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4');
reset role;
select pg_temp.pro_assert((select bumped_at=now() from public.properties where id='44000000-0000-4000-8000-0000000000b4')
 and not exists(select 1 from kh_private.agency_property_write_permits where property_id='44000000-0000-4000-8000-0000000000b4'),'a manager bumps an agency listing and no permit remains');

-- The official account's own listing alerts once when published and never again when bumped.
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000006');
select public.kh_save_search('44000000-0000-4000-8000-000000000006','{"name":"Todo La Habana","filters":{"province":"La Habana"},"enabled":true}');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
update bump_ctx set owner_ad=(public.kh_save_property(jsonb_build_object('clientRequestId','pro-owner','title','Casa de la cuenta oficial','location','Vedado',
 'province','La Habana','type','Casa','description','Casa ficticia de la cuenta oficial para probar alertas.','price',70000,'area',90,'bedrooms',2,'bathrooms',1,
 'photoPaths',jsonb_build_array('44000000-0000-4000-8000-000000000001/pro-owner/photo.jpg'),'operation','sale'))->>'id')::uuid;
reset role;
select pg_temp.pro_as(null);
update public.properties set created_at=now()-interval '8 days' where id=(select owner_ad from bump_ctx);
update bump_ctx set before_alerts=(select count(*) from kh_private.notifications where recipient_id='44000000-0000-4000-8000-000000000006' and category='alert');
select pg_temp.pro_assert((select before_alerts>=1 from bump_ctx),'publishing alerted the watcher');
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Cuenta oficial','44000000-0000-4000-8000-000000000001');
select public.kh_bump_property('44000000-0000-4000-8000-000000000001',(select owner_ad from bump_ctx));
reset role;
select pg_temp.pro_assert((select count(*) from kh_private.notifications where recipient_id='44000000-0000-4000-8000-000000000006' and category='alert')
 =(select before_alerts from bump_ctx),'a bump never alerts again');

-- Price history: inserts and price or availability changes, nothing else.
select pg_temp.pro_as(null);
select pg_temp.pro_assert((select count(*) from kh_private.property_price_history where property_id='44000000-0000-4000-8000-0000000000b2')=1,'an insert records the first price');
update public.properties set price=58000 where id='44000000-0000-4000-8000-0000000000b2';
update public.properties set description='Vivienda ficticia con otra descripción para la prueba.' where id='44000000-0000-4000-8000-0000000000b2';
update public.properties set availability='sold' where id='44000000-0000-4000-8000-0000000000b2';
select pg_temp.pro_assert((select array_agg(price::int||':'||availability order by id) from kh_private.property_price_history where property_id='44000000-0000-4000-8000-0000000000b2')
 =array['60000:active','58000:active','58000:sold'],'only price and availability changes are recorded');
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select * from kh_private.property_price_history$q$,'permission denied');
rollback;
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Base nueva (con la migración de la Task 2), y después `node scripts/local-sql/run-suite.mjs pro_bump`.

Expected: FAIL con `function public.kh_bump_property(uuid, uuid) does not exist`.

- [ ] **Step 3: Añadir la segunda parte de la migración**

Inserta este bloque en `supabase/migrations/20261014000100_karmahouse_pro.sql` justo **antes** de la línea final `notify pgrst, 'reload schema';`. Las funciones `owner_publication_alerts`, `bind_property_media`, `kh_catalog_after` y `kh_search_properties` repiten su última versión (`20261007000300_agency_property_origins.sql` y `20260921000100_catalog_pagination.sql`) con los cambios marcados en comentarios. Comprueba con `git grep -n "function kh_private.bind_property_media\|function kh_private.owner_publication_alerts\|function public.kh_search_properties\|function kh_private.kh_catalog_after" supabase/migrations` que ninguna migración posterior las redefine.

```sql
-- 6. Weekly bump ---------------------------------------------------------------------------------
-- Null until the first bump: «Más recientes» orders by coalesce(bumped_at, created_at), so no row
-- needs a backfill and inserts that set created_at keep their place.
alter table public.properties add column bumped_at timestamptz;
create index properties_catalog_listed on public.properties((coalesce(bumped_at,created_at)) desc,id desc)
 where moderation='approved' and availability='active';

create function kh_private.only_bump_changed(o public.properties,n public.properties) returns boolean language sql stable set search_path='' as $$
 select o.bumped_at is distinct from n.bumped_at
  and (to_jsonb(o)-array['bumped_at','search_text','search_vector'])=(to_jsonb(n)-array['bumped_at','search_text','search_vector'])
$$;

-- Same as 20261007000300, plus the first line: a bump is not a new publication.
create or replace function kh_private.owner_publication_alerts() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and kh_private.only_bump_changed(old,new) then return new; end if;
  if not exists(select 1 from kh_private.agency_property_origins where property_id=new.id) and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id) and new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='approved' and new.availability='active' then
    perform kh_private.alert_on_approval(new);
  end if;
  return new;
end $$;

-- Same as 20261007000300, plus the first line: a bump touches no media, so it skips the
-- revalidation (which would refuse legacy photo paths under the bump write permit).
create or replace function kh_private.bind_property_media() returns trigger language plpgsql security definer set search_path='' as $$
declare v_path text; active_paths text[];prop uuid;
begin
 if tg_op='UPDATE' and kh_private.only_bump_changed(old,new) then return new;end if;
 prop:=case when tg_op='DELETE' then old.id else new.id end;
 if tg_op='INSERT' then insert into kh_private.property_publication_keys(origin_actor_id,client_request_id,property_id) values(coalesce((select actor_id from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id),new.owner_id),new.client_request_id,new.id);end if;
 active_paths:=case when tg_op='DELETE' then '{}'::text[] else new.photo_paths||case when new.cover_thumb_path is null then '{}'::text[] else array[new.cover_thumb_path] end end;
 for v_path in select a.path from kh_private.property_media_assets a where a.property_id=prop and a.state='attached' and not(a.path=any(active_paths)) order by a.path loop
  perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
  update kh_private.property_media_assets set state='retired',retired_at=clock_timestamp() where property_media_assets.path=v_path;
  insert into kh_private.media_cleanup_jobs(path,reason) values(v_path,case when tg_op='DELETE' then 'property_deleted' else 'media_removed' end) on conflict do nothing;
 end loop;
 if tg_op<>'DELETE' then
  for v_path in select x from unnest(active_paths) x order by x loop
   perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
   if exists(select 1 from kh_private.property_media_assets a where a.path=v_path and (a.property_id<>prop or a.state<>'attached')) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
   if not exists(select 1 from kh_private.property_media_assets a where a.path=v_path) and not (starts_with(v_path,new.owner_id::text||'/'||new.client_request_id||'/') and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=prop) or exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=prop and actor_id=auth.uid() and purpose='save' and starts_with(v_path,actor_id::text||'/'||request_id||'/'))) then raise exception 'KH_INVALID_PHOTO_PATH';end if;
   insert into kh_private.property_media_assets(path,property_id,kind,uploader_id) values(v_path,prop,case when v_path=new.cover_thumb_path then 'cover_thumb' else 'photo' end,split_part(v_path,'/',1)::uuid) on conflict(path) do update set kind=excluded.kind;
  end loop;
 end if;
 return coalesce(new,old);
end $$;

-- Same as 20260921000100, with 'recent' keyed on the bump.
create or replace function kh_private.kh_catalog_after(v_sort text)
returns text language sql immutable parallel safe as $fn$
  select case v_sort
    when 'recent'     then '(coalesce(p.bumped_at, p.created_at), p.id) < (($1->>''ck'')::timestamptz, ($1->>''ci'')::uuid)'
    when 'price-asc'  then '(p.price, p.id) > (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
    when 'price-desc' then '(p.price, p.id) < (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
    else                   '(p.area, p.id) < (($1->>''ck'')::numeric, ($1->>''ci'')::uuid)'
  end
$fn$;

-- Same as 20260921000100 with three changes, each marked «Pro»: 'recent' orders and pages by
-- coalesce(bumped_at, created_at), and every row carries is_pro.
create or replace function public.kh_search_properties(p_payload jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = public, kh_private, pg_catalog
as $fn$
declare
  v_query text := coalesce(p_payload->>'query', '');
  v_sort text := coalesce(p_payload->>'sort', 'recent');
  v_limit int := least(greatest(coalesce((p_payload->>'limit')::int, 24), 1), 48);
  v_cursor text := p_payload->>'cursor';
  v_mode text := 'none';
  v_total bigint := 0;
  v_terms text[];
  v_tsquery tsquery;
  v_where text;
  v_order text;
  v_key_col text;
  v_agg_order text;
  v_match text;
  v_args jsonb;
  v_rows jsonb;
  v_last jsonb;
  v_next text;
begin
  if v_sort not in ('recent','price-asc','price-desc','area-desc') then
    raise exception 'KH_INVALID_SORT';
  end if;

  v_args := p_payload;
  if v_cursor is not null then
    if array_length(string_to_array(v_cursor, '|'), 1) <> 4
       or split_part(v_cursor, '|', 1) <> v_sort
       or split_part(v_cursor, '|', 2) not in ('fts','trgm','none')
       or split_part(v_cursor, '|', 3) = ''
       or split_part(v_cursor, '|', 4) = '' then
      raise exception 'KH_INVALID_CURSOR';
    end if;
    v_mode := split_part(v_cursor, '|', 2);
    v_args := v_args || jsonb_build_object('ci', split_part(v_cursor, '|', 3), 'ck', split_part(v_cursor, '|', 4));
  end if;

  if v_query <> '' then
    v_terms := array_remove(regexp_split_to_array(btrim(regexp_replace(v_query, '[^a-z0-9 ]', ' ', 'g')), '\s+'), '');
  end if;
  if v_terms is not null and cardinality(v_terms) > 0 then
    v_tsquery := to_tsquery('spanish', array_to_string(v_terms, ':* & ') || ':*');
  else
    v_terms := null;
  end if;

  v_where := kh_private.kh_catalog_where(p_payload);

  if v_cursor is null then
    if v_terms is null then
      v_mode := 'none';
      execute 'select count(*) from public.properties p where ' || v_where into v_total using v_args;
    else
      execute 'select count(*) from public.properties p where ' || v_where || ' and p.search_vector @@ ($1->>''q'')::tsquery'
        into v_total using v_args || jsonb_build_object('q', v_tsquery::text);
      if v_total > 0 then
        v_mode := 'fts';
      elsif char_length(v_query) >= 3 then
        v_mode := 'trgm';
        execute 'select count(*) from public.properties p where ' || v_where || ' and p.search_text like ''%'' || ($1->>''query'') || ''%'''
          into v_total using v_args;
      else
        v_mode := 'fts';
      end if;
    end if;
  end if;

  v_match := case v_mode
    when 'fts'  then ' and p.search_vector @@ ($1->>''q'')::tsquery'
    when 'trgm' then ' and p.search_text like ''%'' || ($1->>''query'') || ''%'''
    else ''
  end;
  if v_mode = 'fts' and v_tsquery is not null then
    v_args := v_args || jsonb_build_object('q', v_tsquery::text);
  elsif v_mode = 'fts' then
    v_match := '';
  end if;

  -- Pro: the literal ORDER BY must match properties_catalog_listed.
  v_order := case v_sort
    when 'recent'     then 'coalesce(p.bumped_at, p.created_at) desc, p.id desc'
    when 'price-asc'  then 'p.price asc, p.id asc'
    when 'price-desc' then 'p.price desc, p.id desc'
    else                   'p.area desc, p.id desc'
  end;
  v_key_col := case v_sort when 'recent' then 'coalesce(p.bumped_at, p.created_at)' when 'area-desc' then 'p.area' else 'p.price' end;
  v_agg_order := case v_sort when 'price-asc' then 'ord_key asc, ord_id asc' else 'ord_key desc, ord_id desc' end;

  -- Pro: every row carries is_pro next to the property columns.
  execute format(
    'select coalesce(jsonb_agg(row_json order by %1$s), ''[]''::jsonb) from ('
    || ' select (to_jsonb(p) - ''search_text'' - ''search_vector'') || jsonb_build_object(''is_pro'', kh_private.property_pro_active(p.id, p.owner_id)) as row_json,'
    || ' %2$s as ord_key, p.id as ord_id'
    || ' from public.properties p where %3$s%4$s%5$s order by %6$s limit %7$s) t',
    v_agg_order,
    v_key_col,
    v_where,
    v_match,
    case when v_cursor is null then '' else ' and ' || kh_private.kh_catalog_after(v_sort) end,
    v_order,
    v_limit)
  into v_rows using v_args;

  if jsonb_array_length(v_rows) = v_limit then
    v_last := v_rows -> (v_limit - 1);
    -- Pro: the cursor key is the same coalesce the order uses.
    v_next := concat_ws('|', v_sort, v_mode, v_last->>'id',
      case v_sort
        when 'recent' then coalesce(v_last->>'bumped_at', v_last->>'created_at')
        when 'area-desc' then v_last->>'area'
        else v_last->>'price'
      end);
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'next_cursor', v_next, 'search_mode', v_mode);
end $fn$;

-- Write path: the eight update triggers on properties are reviewed in the spec, section 6.
create function public.kh_bump_property(p_actor_id uuid,p_property_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.properties%rowtype; v_origin uuid; v_now timestamptz:=now();
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
 perform kh_private.require_active();
 select * into p from public.properties where id=p_property_id for update;
 if not found or exists(select 1 from kh_private.property_aliases where property_id=p.id) then raise exception 'KH_BUMP_NOT_ELIGIBLE'; end if;
 select origin_agency_id into v_origin from kh_private.agency_property_origins where property_id=p.id;
 if (v_origin is null and p.owner_id<>p_actor_id)
  or (v_origin is not null and not exists(select 1 from kh_private.agency_memberships where agency_id=v_origin and user_id=p_actor_id and state='active'))
  or p.moderation<>'approved' or p.availability<>'active' then raise exception 'KH_BUMP_NOT_ELIGIBLE'; end if;
 if not kh_private.property_pro_active(p.id,p.owner_id) then raise exception 'KH_PRO_REQUIRED'; end if;
 if coalesce(p.bumped_at,p.created_at)>v_now-interval '7 days' then raise exception 'KH_BUMP_TOO_SOON'; end if;
 if v_origin is not null then
  insert into kh_private.agency_property_write_permits(transaction_id,property_id,actor_id,request_id,purpose) values(txid_current(),p.id,p_actor_id,p.client_request_id,'bump');
 end if;
 update public.properties set bumped_at=v_now where id=p.id;
 if v_origin is not null then
  delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=p.id;
 end if;
 return jsonb_build_object('bumpedAt',v_now,'nextBumpAt',v_now+interval '7 days');
end $$;

-- 7. Price history -------------------------------------------------------------------------------
-- Raw material for the manual market report; no client reads it.
create table kh_private.property_price_history(
 id bigint generated always as identity primary key,
 property_id uuid not null references public.properties(id) on delete cascade,
 price numeric not null, operation text not null, rent_period text, availability text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index property_price_history_property on kh_private.property_price_history(property_id,recorded_at);
alter table kh_private.property_price_history enable row level security;
revoke all on kh_private.property_price_history from public,anon,authenticated;
grant all on kh_private.property_price_history to service_role;
create function kh_private.record_property_price() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (new.price,new.operation,new.rent_period,new.availability) is distinct from (old.price,old.operation,old.rent_period,old.availability) then
  insert into kh_private.property_price_history(property_id,price,operation,rent_period,availability) values(new.id,new.price,new.operation,new.rent_period,new.availability);
 end if;
 return new;
end $$;
create trigger kh_property_price_history after insert or update of price,operation,rent_period,availability on public.properties
 for each row execute function kh_private.record_property_price();
-- The current state is the first point; updated_at is the best date known for it.
insert into kh_private.property_price_history(property_id,price,operation,rent_period,availability,recorded_at)
 select id,price,operation,rent_period,availability,updated_at from public.properties;

revoke all on function kh_private.only_bump_changed(public.properties,public.properties),kh_private.record_property_price() from public,anon,authenticated;
revoke all on function public.kh_bump_property(uuid,uuid) from public,anon;
grant execute on function public.kh_bump_property(uuid,uuid) to authenticated;
```

- [ ] **Step 4: Ejecutar las dos suites y las que tocan anuncios**

Base nueva, y después:

```powershell
node scripts/local-sql/run-suite.mjs pro pro_bump catalog_pagination owner_administration search_alerts operations rent optional_area listing_media_assets agency_property_origins agency_property_media agency_legacy_guards agency_final
```

Expected: una línea `PASS <suite> (rollback)` por suite. `catalog_pagination` debe seguir en verde sin cambios: sus anuncios no tienen `bumped_at` y conservan el orden por `created_at`. Si una suite de inmobiliarias necesita su ayudante, el propio `run-suite.mjs` lo antepone.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014000100_karmahouse_pro.sql supabase/tests/pro_bump.sql
git commit -m "feat(pro): bump listings weekly and keep a price history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Script de aplicación

**Files:**
- Create: `scripts/apply-pro.mjs`

No se ejecuta en esta tarea: tocar producción necesita permiso del usuario (Task 11).

- [ ] **Step 1: Escribir el script**

`scripts/apply-pro.mjs`:

```js
// KarmaHouse Pro (supabase/migrations/20261014000100_karmahouse_pro.sql).
// Without --commit each suite runs on top of the migration inside its own transaction, and both roll
// back: nothing stays. With --commit the migration is committed once and the suites run after it.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20261014000100_karmahouse_pro.sql', root), 'utf8');
const suites = ['pro', 'pro_bump'].map(name => readFileSync(new URL(`supabase/tests/${name}.sql`, root), 'utf8'));
const commit = process.argv.includes('--commit');
const db = createDatabaseClient();
const inventory = async () => (await db.query(
  "select (select count(*) from auth.users)::int as users, (select count(*) from public.properties)::int as properties, (select count(*) from kh_private.notifications)::int as notifications, (select count(*) from kh_private.admin_audit)::int as audit",
)).rows[0];

try {
  await db.connect();
  const before = await inventory();
  if (commit) {
    await db.query('begin'); await db.query(migration); await db.query('commit'); console.log('migración aplicada');
    for (const suite of suites) await db.query(suite);
  } else {
    // A suite's own begin only warns inside this transaction; its rollback undoes the migration too.
    for (const suite of suites) { await db.query('begin'); await db.query(migration); await db.query(suite); }
  }
  const after = await inventory();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  console.log(JSON.stringify({ commit, before, after, inventoryUnchanged: unchanged }));
  if (!unchanged) throw new Error('KH_LEFTOVER: una suite dejó filas sintéticas');
  console.log(commit ? 'suites superadas sobre el esquema aplicado' : 'suites superadas; nada se aplicó (usa --commit para aplicar)');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error('falló:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
```

- [ ] **Step 2: Comprobar la sintaxis sin conectar**

Run: `node --check scripts/apply-pro.mjs`
Expected: sin salida y código 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/apply-pro.mjs
git commit -m "build(pro): add the guarded apply script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dominio, repositorio y lectura de anuncios (cliente)

**Files:**
- Create: `src/pro/domain.ts`, `src/pro/repository.ts`, `tests/pro.test.ts`
- Modify: `src/data/remoteMapping.ts`, `src/domain/listings.ts`, `src/data/supabaseMarketplace.ts:19`

- [ ] **Step 1: Escribir los tests**

`tests/pro.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bumpErrorMessage, canBumpNow, decodeProAccounts, decodeProCodes, decodeProStatus, decodeRedeem, formatProDate, isProActive, isProCodeShape, nextBumpAt, normalizeProCode, proContactMailto, proErrorMessage } from '../src/pro/domain.ts';
import { createProRepository } from '../src/pro/repository.ts';
import { mapRemoteListing, type RemotePropertyRow } from '../src/data/remoteMapping.ts';

const id = '43000000-0000-4000-8000-000000000003';

test('a code reads the same with or without prefix, spaces or case', () => {
  assert.equal(normalizeProCode('kh-7q4m x9tr-2plw'), '7Q4MX9TR2PLW');
  assert.equal(normalizeProCode('7Q4M-X9TR-2PLW'), '7Q4MX9TR2PLW');
  // Only a 14-symbol input carries the prefix: a 12-symbol body may start with KH.
  assert.equal(normalizeProCode('KHQ4-X9TR-2PLW'), 'KHQ4X9TR2PLW');
  assert.ok(isProCodeShape('KH-7Q4M-X9TR-2PLW'));
  assert.ok(!isProCodeShape('KH-7Q4M-X9TR-2PL0'), '0 is not in the alphabet');
  assert.ok(!isProCodeShape('KH-7Q4M-X9TR'));
});

test('the next bump is a week after the last one, or after publication', () => {
  const createdAt = '2026-10-01T10:00:00.000Z';
  assert.equal(nextBumpAt({ createdAt }).toISOString(), '2026-10-08T10:00:00.000Z');
  assert.equal(nextBumpAt({ createdAt, bumpedAt: '2026-10-10T08:00:00.000Z' }).toISOString(), '2026-10-17T08:00:00.000Z');
  assert.ok(canBumpNow({ createdAt }, Date.parse('2026-10-08T10:00:00.000Z')));
  assert.ok(!canBumpNow({ createdAt }, Date.parse('2026-10-08T09:59:59.000Z')));
  assert.ok(isProActive('2026-10-20T00:00:00Z', Date.parse('2026-10-14T00:00:00Z')));
  assert.ok(!isProActive('2026-10-13T00:00:00Z', Date.parse('2026-10-14T00:00:00Z')));
  assert.ok(!isProActive(null));
});

test('server codes become guidance; unknown failures ask to retry', () => {
  assert.match(proErrorMessage(new Error('KH_PRO_CODE_RATE')), /dentro de una hora/);
  assert.match(proErrorMessage({ message: 'KH_PRO_REQUIRED' }), /parte de KarmaHouse Pro/);
  assert.match(proErrorMessage(new Error('fetch failed')), /Comprueba la conexión/);
  assert.equal(bumpErrorMessage(new Error('KH_BUMP_TOO_SOON'), { createdAt: '2026-10-01T10:00:00.000Z' }),
    `Podrás subir este anuncio el ${formatProDate('2026-10-08T10:00:00.000Z')}.`);
  assert.match(proContactMailto(), /^mailto:.+\?subject=Quiero%20KarmaHouse%20Pro$/);
});

test('status and redemption decode strictly', () => {
  const status = decodeProStatus({ personalUntil: null, agencies: [{ id, tradeName: 'Casas', role: 'admin', until: '2026-11-01T00:00:00Z' }] });
  assert.equal(status.agencies[0].role, 'admin');
  assert.throws(() => decodeProStatus({ personalUntil: 'mañana', agencies: [] }));
  assert.throws(() => decodeProStatus({ personalUntil: null, agencies: [{ id, tradeName: 'Casas', role: 'owner', until: null }] }));
  assert.deepEqual(decodeRedeem({ ok: true, kind: 'user', id, until: '2026-11-13T00:00:00Z' }), { kind: 'user', id, until: '2026-11-13T00:00:00Z' });
  assert.throws(() => decodeRedeem({ ok: false, error: 'KH_PRO_CODE_RATE' }), /KH_PRO_CODE_RATE/);
});

test('owner lists keep one page and refuse unknown states', () => {
  const row = { id, days: 30, note: 'Pago', boundName: null, state: 'unused', createdAt: '2026-10-14T00:00:00Z', expiresAt: '2026-11-13T00:00:00Z', redeemedAt: null, redeemedFor: null };
  const page = decodeProCodes({ items: Array.from({ length: 31 }, () => row), hasMore: true });
  assert.equal(page.items.length, 30);
  assert.throws(() => decodeProCodes({ items: [{ ...row, state: 'lost' }], hasMore: false }));
  assert.equal(decodeProAccounts({ items: [{ kind: 'agency', id, name: 'Casas', until: '2026-11-13T00:00:00Z' }], hasMore: false }).items[0].kind, 'agency');
});

test('the repository pins the actor and sends only the normalized code', async () => {
  const calls: { name: string; args: Record<string, unknown>; header?: string }[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      const entry: { name: string; args: Record<string, unknown>; header?: string } = { name, args };
      calls.push(entry);
      const builder = {
        setHeader(_key: string, value: string) { entry.header = value; return builder; },
        abortSignal() { return builder; },
        then(resolve: (value: unknown) => void) { resolve({ data: { ok: true, kind: 'user', id, until: '2026-11-13T00:00:00Z' }, error: null }); },
      };
      return builder;
    },
  };
  const repository = createProRepository(client as never, { actorId: id, accessToken: 'token' });
  assert.equal((await repository.redeem('kh-7q4m-x9tr-2plw', null)).kind, 'user');
  assert.deepEqual(calls[0], { name: 'kh_redeem_pro_code', args: { p_actor_id: id, p_code: '7Q4MX9TR2PLW', p_agency_id: null }, header: 'Bearer token' });
});

test('listings carry the bump date and the Pro mark when the server sends them', () => {
  const row: RemotePropertyRow = { id, owner_id: id, client_request_id: 'pro-row', title: 'Casa Pro', location: 'Vedado', province: 'La Habana', price: 50000,
    bedrooms: 2, bathrooms: 1, area: 100, type: 'Casa', description: 'Casa ficticia para la prueba de Pro.', amenities: [], photo_paths: [],
    availability: 'active', moderation: 'approved', review_note: null, created_at: '2026-10-01T10:00:00Z', version: 1 };
  const plain = mapRemoteListing(row, new Map());
  assert.equal(plain.isPro, undefined); assert.equal(plain.bumpedAt, undefined);
  const mapped = mapRemoteListing({ ...row, bumped_at: '2026-10-10T08:00:00Z', is_pro: true }, new Map());
  assert.equal(mapped.bumpedAt, '2026-10-10T08:00:00Z'); assert.equal(mapped.isPro, true);
  assert.throws(() => mapRemoteListing({ ...row, is_pro: 'yes' as never }, new Map()));
  assert.throws(() => mapRemoteListing({ ...row, bumped_at: 'ayer' }, new Map()));
  // supabaseMarketplace.ts pulls React Native in, so read the column list from the source text.
  const source = readFileSync(new URL('../src/data/supabaseMarketplace.ts', import.meta.url), 'utf8');
  const columns = /PROPERTY_COLUMNS = '([^']+)'/.exec(source)![1].split(',');
  assert.ok(columns.includes('bumped_at') && columns.includes('is_pro:kh_is_pro'));
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `node --experimental-strip-types --test tests/pro.test.ts`
Expected: FAIL con `Cannot find module '.../src/pro/domain.ts'`.

- [ ] **Step 3: Escribir el dominio**

`src/pro/domain.ts`:

```ts
import { isUuid } from '../messaging/domain.ts';
import { ASSISTED_PUBLICATION_EMAIL } from '../lib/assistedPublication.ts';

export const PRO_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const BUMP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export type ProRole = 'manager' | 'coordinator' | 'admin';
export interface ProAgency { id: string; tradeName: string; role: ProRole; until: string | null }
export interface ProStatus { personalUntil: string | null; agencies: ProAgency[] }
export interface ProRedeemResult { kind: 'user' | 'agency'; id: string; until: string }
export interface ProBumpResult { bumpedAt: string; nextBumpAt: string }
export type ProCodeState = 'unused' | 'redeemed' | 'expired' | 'cancelled';
export interface ProCodeRow { id: string; days: number; note: string; boundName: string | null; state: ProCodeState; createdAt: string; expiresAt: string; redeemedAt: string | null; redeemedFor: string | null }
export interface ProAccountRow { kind: 'user' | 'agency'; id: string; name: string; until: string }
export interface ProPage<T> { items: T[]; hasMore: boolean }
interface Bumpable { createdAt: string; bumpedAt?: string }

/** Mirrors kh_private.pro_code_hash: the 12-symbol body counts; a 14-symbol input carries the KH prefix. */
export function normalizeProCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return compact.length === 14 && compact.startsWith('KH') ? compact.slice(2) : compact;
}
export function isProCodeShape(input: string): boolean {
  const body = normalizeProCode(input);
  return body.length === 12 && [...body].every(symbol => PRO_CODE_ALPHABET.includes(symbol));
}
export const isProActive = (until: string | null | undefined, now = Date.now()): boolean => !!until && Date.parse(until) > now;
/** A listing can be bumped a week after its last bump, or after publication if it never was. */
export const nextBumpAt = (listing: Bumpable): Date => new Date(Date.parse(listing.bumpedAt ?? listing.createdAt) + BUMP_INTERVAL_MS);
export const canBumpNow = (listing: Bumpable, now = Date.now()): boolean => nextBumpAt(listing).getTime() <= now;
export const formatProDate = (value: string | Date): string => new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
export const proContactMailto = (): string => `mailto:${ASSISTED_PUBLICATION_EMAIL}?subject=${encodeURIComponent('Quiero KarmaHouse Pro')}`;

const messages: Record<string, string> = {
  KH_PRO_CODE_INVALID: 'Código no válido o ya usado. Revisa que esté bien escrito o escríbenos.',
  KH_PRO_CODE_RATE: 'Demasiados intentos. Vuelve a probar dentro de una hora.',
  KH_PRO_REQUIRED: 'Subir anuncio es parte de KarmaHouse Pro.',
  KH_BUMP_TOO_SOON: 'Este anuncio ya se subió esta semana.',
  KH_BUMP_NOT_ELIGIBLE: 'Solo se pueden subir anuncios publicados y activos.',
  KH_PRO_CODE_STATE: 'Ese código ya se usó o ya estaba anulado.',
  KH_PRO_NOT_ACTIVE: 'Esa cuenta ya no tiene Pro activo.',
  KH_PRO_INVALID: 'Revisa los días (de 1 a 365) y escribe una nota de entre 3 y 500 caracteres.',
  KH_ACCOUNT_SUSPENDED: 'Esta cuenta está suspendida.',
  KH_ACCOUNT_CHANGED: 'La sesión cambió. Vuelve a abrir esta pantalla.',
  KH_OWNER_REQUIRED: 'Solo el propietario de KarmaHouse puede gestionar Pro.',
};
const messageOf = (error: unknown): string => typeof error === 'string' ? error
  : error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
/** Known server codes become guidance; anything else is a connection problem worth retrying. */
export function proErrorMessage(error: unknown): string {
  const text = messageOf(error);
  const code = Object.keys(messages).find(key => text.includes(key));
  return code ? messages[code] : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';
}
export function bumpErrorMessage(error: unknown, listing: Bumpable): string {
  return messageOf(error).includes('KH_BUMP_TOO_SOON') ? `Podrás subir este anuncio el ${formatProDate(nextBumpAt(listing))}.` : proErrorMessage(error);
}

const invalid = () => new Error('No se pudieron interpretar los datos de KarmaHouse Pro.');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const instant = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableInstant = (v: unknown): v is string | null => v === null || instant(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const nullableText = (v: unknown, max: number): v is string | null => v === null || text(v, max);
/** The server sends one extra row to answer «is there more»; keep 30. */
function page<T>(value: unknown, decode: (item: unknown) => T): ProPage<T> {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 31 || typeof value.hasMore !== 'boolean') throw invalid();
  return { items: value.items.slice(0, 30).map(decode), hasMore: value.hasMore };
}
export function decodeProStatus(value: unknown): ProStatus {
  if (!record(value) || !nullableInstant(value.personalUntil) || !Array.isArray(value.agencies) || value.agencies.length > 100) throw invalid();
  return {
    personalUntil: value.personalUntil as string | null,
    agencies: value.agencies.map(item => {
      if (!record(item) || !isUuid(item.id) || !text(item.tradeName, 120) || !['manager', 'coordinator', 'admin'].includes(String(item.role)) || !nullableInstant(item.until)) throw invalid();
      return { id: item.id as string, tradeName: item.tradeName as string, role: item.role as ProRole, until: item.until as string | null };
    }),
  };
}
/** A refused code arrives as data, not as an exception, so the server can count the attempt. */
export function decodeRedeem(value: unknown): ProRedeemResult {
  if (!record(value) || typeof value.ok !== 'boolean') throw invalid();
  if (!value.ok) throw new Error(typeof value.error === 'string' ? value.error : 'KH_PRO_CODE_INVALID');
  if (!['user', 'agency'].includes(String(value.kind)) || !isUuid(value.id) || !instant(value.until)) throw invalid();
  return { kind: value.kind as 'user' | 'agency', id: value.id as string, until: value.until as string };
}
export function decodeBump(value: unknown): ProBumpResult {
  if (!record(value) || !instant(value.bumpedAt) || !instant(value.nextBumpAt)) throw invalid();
  return { bumpedAt: value.bumpedAt as string, nextBumpAt: value.nextBumpAt as string };
}
export function decodeCreatedCode(value: unknown): { id: string; code: string; expiresAt: string } {
  if (!record(value) || !isUuid(value.id) || typeof value.code !== 'string' || !/^KH-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(value.code) || !instant(value.expiresAt)) throw invalid();
  return { id: value.id as string, code: value.code, expiresAt: value.expiresAt as string };
}
export function decodeGrant(value: unknown): { until: string } {
  if (!record(value) || !instant(value.until)) throw invalid();
  return { until: value.until as string };
}
export function decodeProCodes(value: unknown): ProPage<ProCodeRow> {
  return page(value, item => {
    if (!record(item) || !isUuid(item.id) || !Number.isSafeInteger(item.days) || !text(item.note, 500) || !nullableText(item.boundName, 120)
      || !['unused', 'redeemed', 'expired', 'cancelled'].includes(String(item.state)) || !instant(item.createdAt) || !instant(item.expiresAt)
      || !nullableInstant(item.redeemedAt) || !nullableText(item.redeemedFor, 120)) throw invalid();
    return item as unknown as ProCodeRow;
  });
}
export function decodeProAccounts(value: unknown): ProPage<ProAccountRow> {
  return page(value, item => {
    if (!record(item) || !['user', 'agency'].includes(String(item.kind)) || !isUuid(item.id) || !text(item.name, 120) || !instant(item.until)) throw invalid();
    return item as unknown as ProAccountRow;
  });
}
```

- [ ] **Step 4: Escribir el repositorio**

`src/pro/repository.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeBump, decodeProStatus, decodeRedeem, normalizeProCode, type ProBumpResult, type ProRedeemResult, type ProStatus } from './domain.ts';

/** The supplied identity is pinned for every call, as in src/data/propertyReports.ts. */
export function createProRepository(client: SupabaseClient, credentials: { actorId: string; accessToken: string }) {
  const { actorId, accessToken } = credentials;
  async function call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const request = client.rpc(name, { p_actor_id: actorId, ...args }).setHeader('Authorization', `Bearer ${accessToken}`);
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    return data;
  }
  return {
    status: async (signal?: AbortSignal): Promise<ProStatus> => decodeProStatus(await call('kh_pro_status', {}, signal)),
    redeem: async (code: string, agencyId: string | null): Promise<ProRedeemResult> =>
      decodeRedeem(await call('kh_redeem_pro_code', { p_code: normalizeProCode(code), p_agency_id: agencyId })),
    bump: async (propertyId: string): Promise<ProBumpResult> => decodeBump(await call('kh_bump_property', { p_property_id: propertyId })),
  };
}
export type ProRepository = ReturnType<typeof createProRepository>;

/** Public badge: works signed out, so it never sends a session. */
export async function readProBadge(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<boolean> {
  const { data, error } = await client.rpc('kh_pro_badge', { p_user_id: userId }).abortSignal(signal);
  if (error) throw error;
  return data === true;
}
```

- [ ] **Step 5: Llevar `bumped_at` e `is_pro` a los anuncios**

En `src/domain/listings.ts`, dentro de `interface Listing`, después de `createdAt: string;`:

```ts
  /** Last bump by a Pro account; absent means never bumped. «Nueva» still reads createdAt. */
  bumpedAt?: string;
  /** Covered by an active Pro (personal or of the publishing agency). */
  isPro?: boolean;
```

En `src/data/remoteMapping.ts`, dentro de `interface RemotePropertyRow`, después de `created_at: string;`:

```ts
  /** Absent on rows read before Pro existed. */
  bumped_at?: string | null;
  /** Catalogue rows carry it; PostgREST reads get it from the computed field kh_is_pro. */
  is_pro?: boolean | null;
```

En la misma función `mapRemoteListing`, sustituye la línea de validación

```ts
    !Number.isFinite(Date.parse(row.created_at)) ||
```

por

```ts
    !Number.isFinite(Date.parse(row.created_at)) ||
    (row.bumped_at != null && !Number.isFinite(Date.parse(row.bumped_at))) ||
    (row.is_pro != null && typeof row.is_pro !== 'boolean') ||
```

y en el objeto devuelto sustituye

```ts
    ...(row.review_note ? { reviewNote: row.review_note } : {}), version: row.version, createdAt: row.created_at,
```

por

```ts
    ...(row.review_note ? { reviewNote: row.review_note } : {}), version: row.version, createdAt: row.created_at,
    ...(row.bumped_at ? { bumpedAt: row.bumped_at } : {}), ...(row.is_pro ? { isPro: true } : {}),
```

En `src/data/supabaseMarketplace.ts:19`, añade `,bumped_at,is_pro:kh_is_pro` al final de la cadena `PROPERTY_COLUMNS` (después de `cover_thumb_path`). No toques `ADMIN_REVIEW_COLUMNS` de `src/admin/queries.ts`: el servidor construye esas filas columna a columna y no cambian.

- [ ] **Step 6: Ejecutar los tests**

Run: `npm run check`
Expected: `tsc` sin errores y todos los tests en verde, incluidos los 7 de `tests/pro.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/pro/domain.ts src/pro/repository.ts tests/pro.test.ts src/domain/listings.ts src/data/remoteMapping.ts src/data/supabaseMarketplace.ts
git commit -m "feat(pro): read Pro status, redeem codes and map bumped listings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sello Pro en la tarjeta, el detalle y el perfil

**Files:**
- Create: `src/components/ProBadge.tsx`, `src/pro/useProBadge.ts`
- Modify: `src/components/PropertyCard.tsx`, `src/screens/DetailScreen.tsx`, `src/screens/PublicProfileScreen.tsx`

- [ ] **Step 1: Componente**

`src/components/ProBadge.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme';

/** Paid service mark, never a verification: no check icon and no green (BRAND.md). */
export function ProBadge() {
  const { styles } = useStyles();
  return <View accessible accessibilityLabel="Cuenta Pro de KarmaHouse" style={styles.badge}><Text style={styles.text}>Pro</Text></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '600' },
}));
```

- [ ] **Step 2: Hook del perfil**

`src/pro/useProBadge.ts`:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readProBadge } from './repository';

/** kh_public_profile cannot grow a key (current APKs refuse it), so the badge is a separate read. */
export function useProBadge(userId: string | undefined): boolean {
  const [pro, setPro] = useState(false);
  useEffect(() => {
    setPro(false);
    if (!supabase || !userId) return;
    const controller = new AbortController();
    readProBadge(supabase, userId, controller.signal).then(value => { if (!controller.signal.aborted) setPro(value); }).catch(() => {});
    return () => controller.abort();
  }, [userId]);
  return pro;
}
```

- [ ] **Step 3: Tarjeta**

En `src/components/PropertyCard.tsx` añade `import { ProBadge } from './ProBadge';` junto a los demás imports y sustituye

```tsx
          {listing.priceNegotiable && <Text style={styles.negotiable}>Negociable</Text>}
```

por

```tsx
          {listing.priceNegotiable && <Text style={styles.negotiable}>Negociable</Text>}
          {listing.isPro && <ProBadge />}
```

- [ ] **Step 4: Detalle**

En `src/screens/DetailScreen.tsx` añade `import { ProBadge } from '../components/ProBadge';` y sustituye

```tsx
          <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
```

por

```tsx
          <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
          {listing.isPro && <ProBadge />}
```

- [ ] **Step 5: Perfil público**

En `src/screens/PublicProfileScreen.tsx` añade `import { ProBadge } from '../components/ProBadge';` y `import { useProBadge } from '../pro/useProBadge';`. Justo después de la línea `const { profile, avatarUrl, listings, loading, notFound, error, saving, saveError, retry, setVerified } = usePublicProfile(id, { withListings: true });` añade:

```tsx
  const pro = useProBadge(profile && !profile.identityOnly ? profile.id : undefined);
```

y sustituye

```tsx
              <Text accessibilityRole="header" style={styles.name}>{profile.displayName}</Text>
```

por

```tsx
              <Text accessibilityRole="header" style={styles.name}>{profile.displayName}</Text>
              {pro && <ProBadge />}
```

- [ ] **Step 6: Comprobar**

Run: `npm run check`
Expected: en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProBadge.tsx src/pro/useProBadge.ts src/components/PropertyCard.tsx src/screens/DetailScreen.tsx src/screens/PublicProfileScreen.tsx
git commit -m "feat(pro): show the Pro badge on cards, details and public profiles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pantalla `/pro` y sus accesos

**Files:**
- Create: `src/pro/usePro.ts`, `src/screens/ProScreen.tsx`, `src/app/pro.tsx`
- Modify: `src/screens/ProfileScreen.tsx`, `src/screens/AccountSettingsScreen.tsx`

- [ ] **Step 1: Hook de estado**

`src/pro/usePro.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { proErrorMessage, type ProStatus } from './domain';
import { createProRepository } from './repository';

/** Pro of the signed-in account; an account or token change discards older answers. */
export function usePro() {
  const { user, session } = useAuth();
  const actorId = user?.id, token = session?.access_token;
  const repository = useMemo(() => supabase && actorId && token ? createProRepository(supabase, { actorId, accessToken: token }) : null, [actorId, token]);
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    if (!repository) { setStatus(null); setLoading(false); return; }
    setLoading(true); setError('');
    try { const next = await repository.status(); if (mine === generation.current) setStatus(next); }
    catch (failure) { if (mine === generation.current) setError(proErrorMessage(failure)); }
    finally { if (mine === generation.current) setLoading(false); }
  }, [repository]);
  useEffect(() => { setStatus(null); void reload(); return () => { generation.current++; }; }, [reload]);
  return { repository, status, error, loading, reload };
}
```

- [ ] **Step 2: Pantalla**

`src/screens/ProScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, Notice, PageTitle, Pill } from '../components/ui';
import { formatProDate, isProActive, isProCodeShape, proContactMailto, proErrorMessage } from '../pro/domain';
import { usePro } from '../pro/usePro';
import { createThemedStyles, internalLayout } from '../theme';

export default function ProScreen() {
  const { colors, styles } = useStyles();
  const { user } = useAuth();
  const pro = usePro();
  const [code, setCode] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const adminAgencies = pro.status?.agencies.filter(agency => agency.role === 'admin') ?? [];
  useEffect(() => { setCode(''); setTarget(null); setNotice(''); setError(''); }, [user?.id]);

  async function redeem() {
    if (!pro.repository || busy) return;
    if (!isProCodeShape(code)) { setError('Escribe el código completo: KH y 12 letras o números.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await pro.repository.redeem(code, target);
      setCode(''); setNotice(`KarmaHouse Pro activo hasta el ${formatProDate(result.until)}.`);
      await pro.reload();
    } catch (failure) { setError(proErrorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Para quien publica mucho." back fallback="/profile" />
      {!user ? <AccountPrompt returnTo="/pro" /> : <>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Tu estado</Text>
          {pro.loading && !pro.status ? <ActivityIndicator accessibilityLabel="Consultando KarmaHouse Pro" color={colors.primary} /> : <>
            <Text style={styles.body}>{isProActive(pro.status?.personalUntil) ? `Pro activo hasta el ${formatProDate(pro.status!.personalUntil!)}.` : 'No tienes Pro.'}</Text>
            {pro.status?.agencies.map(agency => <Text key={agency.id} style={styles.body}>{agency.tradeName}: {isProActive(agency.until) ? `Pro activo hasta el ${formatProDate(agency.until!)}` : 'sin Pro'}.</Text>)}
          </>}
          {pro.error ? <Notice error>{pro.error}</Notice> : null}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Qué incluye</Text>
          <Text style={styles.body}>El sello Pro en tus anuncios y en tu perfil público.</Text>
          <Text style={styles.body}>Subir anuncio: una vez por semana, cada anuncio activo vuelve arriba en «Más recientes».</Text>
          <Text style={styles.muted}>Publicar, buscar y conversar siguen siendo gratis.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Canjear código</Text>
          {adminAgencies.length > 0 && <View style={styles.choices}>
            <Pill label="Mi cuenta" active={target === null} onPress={() => setTarget(null)} />
            {adminAgencies.map(agency => <Pill key={agency.id} label={agency.tradeName} active={target === agency.id} onPress={() => setTarget(agency.id)} />)}
          </View>}
          <TextInput accessibilityLabel="Código de KarmaHouse Pro" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
            placeholder="KH-XXXX-XXXX-XXXX" placeholderTextColor={colors.muted} editable={!busy} style={styles.input} />
          {error ? <Notice error>{error}</Notice> : null}
          {notice ? <Notice>{notice}</Notice> : null}
          <Button label="Canjear código" onPress={() => void redeem()} loading={busy} disabled={!code.trim()} />
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>¿Quieres Pro?</Text>
          <Text style={styles.body}>Pro se contrata hablando con KarmaHouse. Cuando acordemos el pago, te enviamos tu código.</Text>
          <Button label="Escríbenos" secondary icon="mail-outline" onPress={() => void Linking.openURL(proContactMailto())} />
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 14, fontSize: 16, color: colors.ink, letterSpacing: 1 },
}));
```

- [ ] **Step 3: Ruta y accesos**

`src/app/pro.tsx`:

```tsx
export {default} from '../screens/ProScreen';
```

En `src/screens/ProfileScreen.tsx`, dentro del grupo «Cuenta», sustituye

```tsx
          <AccountRow icon="notifications-outline" title="Preferencias de notificaciones" onPress={() => router.push('/notification-settings')} />
```

por

```tsx
          <AccountRow icon="star-outline" title="KarmaHouse Pro" onPress={() => router.push('/pro')} />
          <AccountRow icon="notifications-outline" title="Preferencias de notificaciones" onPress={() => router.push('/notification-settings')} />
```

En `src/screens/AccountSettingsScreen.tsx` sustituye

```tsx
      <Button label="Preferencias de notificaciones" secondary icon="notifications-outline" onPress={() => router.push('/notification-settings')} />
```

por

```tsx
      <Button label="Preferencias de notificaciones" secondary icon="notifications-outline" onPress={() => router.push('/notification-settings')} />
      <Button label="KarmaHouse Pro" secondary icon="star-outline" onPress={() => router.push('/pro')} />
```

- [ ] **Step 4: Comprobar**

Run: `npm run check`
Expected: en verde. Si `tsc` rechaza `'star-outline'` o `'mail-outline'` como `IconName`, usa el nombre de Ionicons que acepte el tipo (`src/components/ui.tsx`).

- [ ] **Step 5: Ver la pantalla en el navegador**

Arranca la vista previa web del proyecto (`.claude/launch.json`; si no hay entrada para Expo web, añade una con `npm run web` en el puerto que imprima Expo) y abre `/pro`. Sin sesión debe verse el aviso para iniciar sesión. Con la base de demostración no hay sesión real: el estado con Pro se comprueba en la Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/pro/usePro.ts src/screens/ProScreen.tsx src/app/pro.tsx src/screens/ProfileScreen.tsx src/screens/AccountSettingsScreen.tsx
git commit -m "feat(pro): add the KarmaHouse Pro screen with code redemption" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Subir anuncio» en Mis anuncios y en la cartera

**Files:**
- Modify: `src/screens/MyListingsScreen.tsx`, `src/screens/AgencyPortfolioScreen.tsx`

- [ ] **Step 1: Mis anuncios**

En `src/screens/MyListingsScreen.tsx` añade los imports:

```tsx
import { bumpErrorMessage, canBumpNow, formatProDate, isProActive, nextBumpAt } from '../pro/domain';
import { usePro } from '../pro/usePro';
```

Después de `const transfers=useIncomingTransferCount();` añade:

```tsx
  const pro = usePro();
  const personalPro = isProActive(pro.status?.personalUntil);
```

Después de la función `submit` añade:

```tsx
  async function bump(item: Listing) {
    if (locked.current || reload.isRefreshing() || !pro.repository) return;
    locked.current = true;
    setPending(item.id); setError('');
    try { await pro.repository.bump(item.id); await refresh(); }
    catch (failure) { setError(bumpErrorMessage(failure, item)); }
    finally { locked.current = false; setPending(''); }
  }
```

Sustituye

```tsx
            {state === 'live' && <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
```

por

```tsx
            {state === 'live' && <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
            {state === 'live' && personalPro && canBumpNow(item) && <Button label="Subir anuncio" secondary icon="arrow-up-outline" onPress={() => void bump(item)} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
```

y justo después del cierre `</ActionGroup>` de ese mismo bloque añade:

```tsx
          {state === 'live' && personalPro && !canBumpNow(item) && <Text style={styles.location}>Podrás subirlo el {formatProDate(nextBumpAt(item))}.</Text>}
```

- [ ] **Step 2: Cartera de la inmobiliaria**

En `src/screens/AgencyPortfolioScreen.tsx` añade los imports:

```tsx
import {bumpErrorMessage,canBumpNow,formatProDate,isProActive,nextBumpAt} from '../pro/domain';
import {usePro} from '../pro/usePro';
```

Dentro de `function Portfolio()`, después de la línea de `useState` de `items`, añade:

```tsx
 const pro=usePro(),[bumping,setBumping]=useState('');
 const agencyPro=isProActive(pro.status?.agencies.find(agency=>agency.id===w.activeAgencyId)?.until);
 async function bump(item:AgencyProperty){if(!pro.repository||bumping)return;setBumping(item.property.id);setIssue('');try{await pro.repository.bump(item.property.id);await load();}catch(e){setIssue(bumpErrorMessage(e,item.property));}finally{setBumping('');}}
```

Sustituye

```tsx
  {item.property.moderationStatus==='approved'&&item.property.status==='active'&&<AgencyShareButton propertyId={item.property.id} title={item.property.title}/>}
```

por

```tsx
  {item.property.moderationStatus==='approved'&&item.property.status==='active'&&<AgencyShareButton propertyId={item.property.id} title={item.property.title}/>}
  {agencyPro&&item.canEditCommon&&item.property.moderationStatus==='approved'&&item.property.status==='active'&&(canBumpNow(item.property)
   ?<Button secondary label="Subir anuncio" loading={bumping===item.property.id} disabled={!!bumping||busy} onPress={()=>void bump(item)}/>
   :<Text style={s.caption}>Podrás subirla el {formatProDate(nextBumpAt(item.property))}.</Text>)}
```

- [ ] **Step 3: Comprobar**

Run: `npm run check`
Expected: en verde.

- [ ] **Step 4: Commit**

```bash
git add src/screens/MyListingsScreen.tsx src/screens/AgencyPortfolioScreen.tsx
git commit -m "feat(pro): let Pro accounts bump their listings once a week" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Administración de Pro para el propietario

**Files:**
- Create: `src/screens/AdminProScreen.tsx`, `src/app/admin-pro.tsx`
- Modify: `src/screens/AdministrationScreen.tsx:15-23`, `src/screens/AdminManagementScreen.tsx`, `src/screens/AgencyReviewsScreen.tsx`, `src/admin/domain.ts` (`eventLabel`)
- Test: `tests/pro.test.ts`

- [ ] **Step 1: Test de las etiquetas del historial**

Añade al final de `tests/pro.test.ts`:

```ts
import { eventLabel } from '../src/admin/domain.ts';
test('the history names every Pro action', () => {
  assert.deepEqual(['pro_code_created', 'pro_code_cancelled', 'pro_code_redeemed', 'pro_granted', 'pro_revoked'].map(eventLabel),
    ['Código Pro creado', 'Código Pro anulado', 'Código Pro canjeado', 'Pro activado', 'Pro retirado']);
});
```

Mueve el `import` nuevo arriba con los demás.

Run: `node --experimental-strip-types --test tests/pro.test.ts`
Expected: FAIL: `eventLabel` devuelve `Gestión administrativa`.

- [ ] **Step 2: Etiquetas**

En `src/admin/domain.ts`, dentro de `eventLabel`, justo después de `if(action in transfers)return transfers[action];` añade:

```ts
  const pro:Record<string,string>={pro_code_created:'Código Pro creado',pro_code_cancelled:'Código Pro anulado',pro_code_redeemed:'Código Pro canjeado',pro_granted:'Pro activado',pro_revoked:'Pro retirado'};
  if(action in pro)return pro[action];
```

Run: `node --experimental-strip-types --test tests/pro.test.ts`
Expected: PASS.

- [ ] **Step 3: Pantalla**

`src/screens/AdminProScreen.tsx`:

```tsx
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAdminApi } from '../admin/useAdminApi';
import { ActionGroup, Button, EmptyState, Notice, PageTitle, Pill } from '../components/ui';
import { isUuid } from '../messaging/domain';
import { decodeCreatedCode, decodeGrant, decodeProAccounts, decodeProCodes, formatProDate, proErrorMessage, type ProAccountRow, type ProCodeRow } from '../pro/domain';
import { createThemedStyles, internalLayout } from '../theme';

type Subject = { kind: 'user' | 'agency'; id: string; name: string };
type Pending = { kind: 'cancel'; row: ProCodeRow } | { kind: 'revoke'; row: ProAccountRow };
const stateLabel: Record<ProCodeRow['state'], string> = { unused: 'Sin usar', redeemed: 'Canjeado', expired: 'Caducado', cancelled: 'Anulado' };
const subjectArgs = (subject: { kind: 'user' | 'agency'; id: string } | null) => subject ? subject.kind === 'user' ? { p_user_id: subject.id } : { p_agency_id: subject.id } : {};

export default function AdminProScreen() {
  const { colors, styles } = useStyles();
  const { isOwner, user, session } = useAuth();
  const call = useAdminApi();
  const params = useLocalSearchParams<{ userId?: string; agencyId?: string; name?: string }>();
  const target: Subject | null = isUuid(params.userId) ? { kind: 'user', id: params.userId as string, name: params.name || 'Cuenta' }
    : isUuid(params.agencyId) ? { kind: 'agency', id: params.agencyId as string, name: params.name || 'Inmobiliaria' } : null;
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codes, setCodes] = useState<ProCodeRow[]>([]);
  const [accounts, setAccounts] = useState<ProAccountRow[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const validNote = note.trim().length >= 3;

  const load = useCallback(async () => {
    if (!isOwner) return;
    try {
      const [codePage, accountPage] = await Promise.all([call('kh_admin_list_pro_codes', { p_offset: 0 }), call('kh_admin_list_pro_accounts', { p_offset: 0 })]);
      setCodes(decodeProCodes(codePage).items); setAccounts(decodeProAccounts(accountPage).items);
    } catch (failure) { setError(proErrorMessage(failure)); }
  }, [call, isOwner]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { setCreated(null); setPending(null); setNote(''); setError(''); setNotice(''); }, [user?.id, session?.access_token]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); setNote(''); await load(); } catch (failure) { setError(proErrorMessage(failure)); } finally { setBusy(false); }
  }
  const createCode = () => run(async () => {
    setCreated(decodeCreatedCode(await call('kh_admin_create_pro_code', { p_days: days, p_note: note.trim(), ...subjectArgs(target) })));
  });
  const grant = () => run(async () => {
    const result = decodeGrant(await call('kh_admin_grant_pro', { p_days: days, p_note: note.trim(), ...subjectArgs(target) }));
    setNotice(`${target!.name}: Pro activo hasta el ${formatProDate(result.until)}.`);
  });
  const confirm = () => run(async () => {
    if (!pending) return;
    if (pending.kind === 'cancel') await call('kh_admin_cancel_pro_code', { p_code_id: pending.row.id, p_note: note.trim() });
    else await call('kh_admin_revoke_pro', { p_note: note.trim(), ...subjectArgs(pending.row) });
    setNotice(pending.kind === 'cancel' ? 'Código anulado.' : `${pending.row.name} ya no tiene Pro.`);
    setPending(null);
  });

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Códigos, activaciones y cuentas Pro." back fallback="/administration" />
      {!isOwner ? <EmptyState plain title="Acceso reservado" description="Solo el propietario de KarmaHouse gestiona Pro." /> : <>
        {error ? <Notice error>{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {created && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Código creado</Text>
          <Text selectable style={styles.code}>{created.code}</Text>
          <Notice>No se podrá volver a ver. Caduca sin usar el {formatProDate(created.expiresAt)}.</Notice>
          <ActionGroup>
            <Button label="Compartir" icon="share-outline" onPress={() => void Share.share({ message: `Tu código de KarmaHouse Pro: ${created.code}. Canjéalo en Mi espacio › KarmaHouse Pro.` })} />
            <Button label="Listo" secondary onPress={() => setCreated(null)} />
          </ActionGroup>
        </View>}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{target ? `Para ${target.name}` : 'Código libre'}</Text>
          <Text style={styles.muted}>{target ? 'Solo esta cuenta podrá canjear el código.' : 'Lo canjea la primera cuenta que lo escriba. Para atarlo a alguien, ábrelo desde Cuentas o Inmobiliarias.'}</Text>
          <View style={styles.choices}>{([30, 90, 365] as const).map(value => <Pill key={value} label={`${value} días`} active={days === value} onPress={() => setDays(value)} />)}</View>
          <TextInput accessibilityLabel="Nota privada" value={note} onChangeText={setNote} multiline maxLength={500} editable={!busy}
            placeholder="Cliente, zona y forma de pago" placeholderTextColor={colors.muted} style={[styles.input, styles.note]} />
          <ActionGroup>
            <Button label="Crear código" onPress={() => void createCode()} loading={busy && !pending} disabled={!validNote || !!pending} />
            {target && <Button label="Activar ahora" secondary onPress={() => void grant()} disabled={busy || !validNote || !!pending} />}
          </ActionGroup>
        </View>
        {pending && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{pending.kind === 'cancel' ? 'Anular código' : `Quitar Pro a ${pending.row.name}`}</Text>
          <Text style={styles.muted}>Escribe el motivo en la nota de arriba. Queda en el Historial.</Text>
          <ActionGroup>
            <Button label="Confirmar" onPress={() => void confirm()} loading={busy} disabled={!validNote} />
            <Button label="Cancelar" secondary disabled={busy} onPress={() => setPending(null)} />
          </ActionGroup>
        </View>}
        <Text accessibilityRole="header" style={styles.section}>Cuentas Pro</Text>
        {accounts.length === 0 ? <Text style={styles.muted}>Ninguna cuenta tiene Pro activo.</Text> : accounts.map(row => <View key={`${row.kind}:${row.id}`} style={styles.card}>
          <Text style={styles.title}>{row.name}</Text>
          <Text style={styles.muted}>{row.kind === 'agency' ? 'Inmobiliaria' : 'Cuenta personal'} · hasta el {formatProDate(row.until)}</Text>
          <Button label="Quitar Pro" secondary disabled={busy} onPress={() => setPending({ kind: 'revoke', row })} />
        </View>)}
        <Text accessibilityRole="header" style={styles.section}>Códigos recientes</Text>
        {codes.length === 0 ? <Text style={styles.muted}>Todavía no hay códigos.</Text> : codes.map(row => <View key={row.id} style={styles.card}>
          <Text style={styles.title}>{stateLabel[row.state]} · {row.days} días</Text>
          <Text style={styles.body}>{row.note}</Text>
          <Text style={styles.muted}>{row.boundName ? `Para ${row.boundName}` : 'Código libre'} · creado el {formatProDate(row.createdAt)}{row.redeemedAt ? ` · canjeado el ${formatProDate(row.redeemedAt)} para ${row.redeemedFor}` : ''}</Text>
          {row.state === 'unused' && <Button label="Anular" secondary disabled={busy} onPress={() => setPending({ kind: 'cancel', row })} />}
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  section: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.muted },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: 2, color: colors.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 14, fontSize: 16, color: colors.ink },
  note: { minHeight: 96, textAlignVertical: 'top' },
}));
```

`src/app/admin-pro.tsx`:

```tsx
export {default} from '../screens/AdminProScreen';
```

- [ ] **Step 4: Entrada en Administración**

En `src/screens/AdministrationScreen.tsx`:

1. En el tipo de `path` de `entries` añade `|'/admin-pro'` a la unión.
2. Al final del array `entries`, después de la entrada «Publicación asistida», añade:

```tsx
 {title:'KarmaHouse Pro',description:'Códigos y cuentas Pro.',icon:'star-outline',path:'/admin-pro',owner:true},
```

El grupo «Cuenta oficial» usa `entries.slice(6)`, así que la entrada cae ahí sin más cambios.

- [ ] **Step 5: Botones con destinatario**

En `src/screens/AdminManagementScreen.tsx` sustituye

```tsx
onPress={()=>choose({actor:user!.id,kind:'account',row,action})}/>)}</ActionGroup>}
```

por

```tsx
onPress={()=>choose({actor:user!.id,kind:'account',row,action})}/>)}</ActionGroup>}
            {isOwner&&<Button label="KarmaHouse Pro" secondary disabled={loading||busy} onPress={()=>router.push({pathname:'/admin-pro',params:{userId:row.id,name:row.displayName}})}/>}
```

En `src/screens/AgencyReviewsScreen.tsx` cambia `import {useFocusEffect,useLocalSearchParams} from 'expo-router';` por `import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';` y, justo después de la línea del botón `label={expanded===(r?.id??a.id)?'Ocultar detalles':'Detalles y acciones'}`, añade:

```tsx
     {auth.isOwner&&a.state==='approved'&&<Button secondary label="KarmaHouse Pro" disabled={busy} onPress={()=>router.push({pathname:'/admin-pro',params:{agencyId:a.id,name:a.tradeName}})}/>}
```

- [ ] **Step 6: Comprobar**

Run: `npm run check`
Expected: en verde.

- [ ] **Step 7: Commit**

```bash
git add src/screens/AdminProScreen.tsx src/app/admin-pro.tsx src/screens/AdministrationScreen.tsx src/screens/AdminManagementScreen.tsx src/screens/AgencyReviewsScreen.tsx src/admin/domain.ts tests/pro.test.ts
git commit -m "feat(pro): let the owner create codes and grant or revoke Pro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Informe de mercado manual

**Files:**
- Create: `scripts/market-report-lib.mjs`, `scripts/market-report.mjs`, `tests/market-report.test.ts`

- [ ] **Step 1: Tests**

`tests/market-report.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvinceReport, median, normalizeZone, renderReportHtml, slug } from '../scripts/market-report-lib.mjs';

const base = { province: 'La Habana', month: '2026-10', cutoff: '2026-10-14T00:00:00Z' };
const listing = (n: number, extra: Record<string, unknown> = {}) => ({
  province: 'La Habana', location: n % 2 ? 'Vedado' : 'vedado ', type: 'Casa', operation: 'sale', rent_period: null,
  price: 40000 + n * 1000, area: n < 5 ? null : 100, availability: 'active', created_at: new Date('2026-09-01T00:00:00Z'),
  owner_id: `owner-${n}`, sold_at: null, ...extra,
});

test('zones ignore case, accents and spaces', () => {
  assert.equal(normalizeZone('  Playa   Miramar '), 'playa miramar');
  assert.equal(normalizeZone('Habána Vieja'), 'habana vieja');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(slug('Isla de la Juventud'), 'isla-de-la-juventud');
});

test('a group shows a price only with ten comparable listings', () => {
  const nine = buildProvinceReport({ ...base, listings: Array.from({ length: 9 }, (_, n) => listing(n)), searches: [] });
  assert.equal(nine.prices[0].median, null);
  assert.equal(nine.zones.length, 0);
  const ten = buildProvinceReport({ ...base, listings: Array.from({ length: 10 }, (_, n) => listing(n)), searches: [] });
  assert.equal(ten.prices[0].count, 10);
  assert.equal(ten.prices[0].median, 44500);
  assert.equal(ten.prices[0].perM2, null, 'only five listings give their surface');
  assert.equal(ten.zones[0].label, 'Vedado');
});

test('movement and demand respect their thresholds', () => {
  const sold = Array.from({ length: 10 }, (_, n) => listing(n, { availability: 'sold', sold_at: new Date(`2026-10-${String(n + 1).padStart(2, '0')}T00:00:00Z`) }));
  const searches = [...Array.from({ length: 5 }, (_, n) => ({ user_id: `u${n}`, operations: ['sale'] })), { user_id: 'u0', operations: ['sale'] }, { user_id: 'r1', operations: ['rent'] }];
  const report = buildProvinceReport({ ...base, listings: [...sold, listing(20, { created_at: new Date('2026-10-05T00:00:00Z') })], searches });
  assert.equal(report.movement.newListings, 1);
  assert.equal(report.movement.sold, 10);
  assert.equal(report.movement.medianDaysToSale, 34.5);
  assert.deepEqual(report.demand.map(d => [d.label, d.people]), [['Venta', 5], ['Alquiler', null]]);
});

test('the page says what the numbers are and escapes text', () => {
  const html = renderReportHtml(buildProvinceReport({ ...base, province: 'La <Habana>', listings: [], searches: [] }));
  assert.match(html, /Precio pedido, no precio de venta/);
  assert.match(html, /Aún hay pocos datos/);
  assert.ok(html.includes('La &lt;Habana&gt;') && !html.includes('<Habana>'));
});
```

Run: `node --experimental-strip-types --test tests/market-report.test.ts`
Expected: FAIL con `Cannot find module '.../scripts/market-report-lib.mjs'`.

- [ ] **Step 2: Biblioteca**

`scripts/market-report-lib.mjs`:

```js
// Pure pieces of the monthly market report: grouping, thresholds and the HTML page.
// Asking prices only: KarmaHouse never sees the closing price.
export const MIN_LISTINGS = 10;
export const MIN_PEOPLE = 5;
const OPERATIONS = { sale: 'Venta', rent: 'Alquiler', swap: 'Permuta' };
const PERIODS = { month: 'al mes', day: 'por día' };
const DAY = 86_400_000;

export const normalizeZone = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const slug = text => normalizeZone(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const groupLabel = row => `${OPERATIONS[row.operation]}${row.operation === 'rent' ? ` ${PERIODS[row.rent_period] ?? ''}` : ''} · ${row.type}`;

// Swaps count as volume, not as price; wanted ads are demand.
function priceGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.availability !== 'active' || !['sale', 'rent'].includes(row.operation) || !row.type) continue;
    const label = groupLabel(row);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([label, items]) => {
    const prices = items.map(row => row.price), sized = items.filter(row => row.area > 0), enough = items.length >= MIN_LISTINGS;
    return {
      label, count: items.length,
      median: enough ? median(prices) : null, min: enough ? Math.min(...prices) : null, max: enough ? Math.max(...prices) : null,
      perM2: sized.length >= MIN_LISTINGS ? Math.round(median(sized.map(row => row.price / row.area))) : null,
    };
  });
}
// The spelling most listings use; a tie goes to the one that sorts first.
function zoneLabel(rows) {
  const counts = new Map();
  for (const row of rows) { const label = String(row.location).trim(); counts.set(label, (counts.get(label) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

export function buildProvinceReport({ province, month, cutoff, listings, searches }) {
  const zones = new Map();
  for (const row of listings) { const key = normalizeZone(row.location); zones.set(key, [...(zones.get(key) ?? []), row]); }
  const inMonth = date => !!date && new Date(date).toISOString().slice(0, 7) === month;
  const sold = listings.filter(row => inMonth(row.sold_at));
  // An empty operations list means the search covers every operation.
  const people = operation => new Set(searches.filter(s => s.operations.length === 0 || s.operations.includes(operation)).map(s => s.user_id)).size;
  const wanted = new Set(listings.filter(row => row.operation === 'wanted' && row.availability === 'active').map(row => row.owner_id)).size;
  return {
    province, month, cutoff,
    listingCount: listings.filter(row => row.availability === 'active').length,
    prices: priceGroups(listings),
    zones: [...zones.values()].map(rows => ({ label: zoneLabel(rows), groups: priceGroups(rows).filter(group => group.median !== null) }))
      .filter(zone => zone.groups.length).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    movement: {
      newListings: listings.filter(row => inMonth(row.created_at)).length,
      sold: sold.length,
      medianDaysToSale: sold.length >= MIN_LISTINGS ? median(sold.map(row => (new Date(row.sold_at) - new Date(row.created_at)) / DAY)) : null,
    },
    demand: Object.entries(OPERATIONS).map(([operation, label]) => ({ label, people: people(operation) }))
      .filter(entry => entry.people > 0).map(entry => ({ ...entry, people: entry.people >= MIN_PEOPLE ? entry.people : null })),
    wantedPeople: wanted >= MIN_PEOPLE ? wanted : null,
  };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = value => `${new Intl.NumberFormat('es').format(Math.round(value))} USD`;
const FEW = '<p class="few">Aún hay pocos datos en esta zona.</p>';
function table(groups) {
  if (!groups.some(g => g.median !== null)) return FEW;
  const rows = groups.map(g => `<tr><td>${escape(g.label)}</td><td>${g.count}</td><td>${g.median === null ? 'Aún hay pocos datos' : usd(g.median)}</td>`
    + `<td>${g.min === null ? '—' : `${usd(g.min)} – ${usd(g.max)}`}</td><td>${g.perM2 === null ? '—' : usd(g.perM2)}</td></tr>`).join('');
  return `<table><thead><tr><th>Grupo</th><th>Anuncios</th><th>Mediana</th><th>Rango</th><th>USD/m²</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Paths are relative to artifacts/market-reports/<month>/<province>.html, three levels below the repo root.
export function renderReportHtml(report) {
  const date = new Date(report.cutoff).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const days = report.movement.medianDaysToSale;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mercado ${escape(report.province)} ${escape(report.month)}</title><style>
@font-face{font-family:Calistoga;src:url(../../../web/node_modules/@fontsource/calistoga/files/calistoga-latin-400-normal.woff2) format('woff2')}
:root{--cal:#faf6ee;--ink:#1a2b3b;--body:#4d5a66;--blue:#0153a8;--line:#e6dccb;--paper:#fff}
body{margin:0;background:var(--cal);color:var(--body);font:16px/1.55 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 16px}
h1,h2,h3{font-family:Calistoga,serif;font-weight:400;color:var(--ink)}h1 em{color:var(--blue);font-style:normal}
section{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px;margin:20px 0;overflow-x:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}
.note{font-size:14px}.few{font-style:italic}img{height:32px}
@media print{body{background:#fff}section{break-inside:avoid}}
</style></head><body><main>
<img src="../../../assets/karmahouse-logo.png" alt="KarmaHouse">
<h1>Mercado de vivienda en <em>${escape(report.province)}</em></h1>
<p class="note">Precio pedido, no precio de venta. ${report.listingCount} anuncios activos publicados en KarmaHouse, con corte al ${escape(date)}. Cada cifra necesita al menos ${MIN_LISTINGS} anuncios comparables.</p>
<section><h2>Precios por tipo</h2>${table(report.prices)}</section>
<section><h2>Por zona</h2>${report.zones.length ? report.zones.map(z => `<h3>${escape(z.label)}</h3>${table(z.groups)}`).join('') : FEW}</section>
<section><h2>Movimiento de ${escape(report.month)}</h2><p>Anuncios nuevos: ${report.movement.newListings}. Pasaron a vendido: ${report.movement.sold}.</p>
<p>Días hasta la venta (mediana): ${days === null ? 'aún hay pocos datos' : Math.round(days)}.</p></section>
<section><h2>Qué se busca</h2>${report.demand.length ? `<ul>${report.demand.map(d => `<li>${escape(d.label)}: ${d.people === null ? 'aún hay pocos datos' : `${d.people} personas con búsquedas guardadas`}</li>`).join('')}</ul>` : FEW}
<p>Anuncios «busco» activos: ${report.wantedPeople === null ? 'aún hay pocos datos' : `${report.wantedPeople} personas`}.</p>
<p class="note">Las búsquedas se cuentan sumadas, sin identificar a nadie, y solo desde ${MIN_PEOPLE} personas.</p></section>
</main></body></html>`;
}
```

Run: `node --experimental-strip-types --test tests/market-report.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Script de lectura**

`scripts/market-report.mjs`:

```js
// Monthly market report, read-only. Usage: node scripts/market-report.mjs [--month AAAA-MM]
// Writes artifacts/market-reports/<month>/<province>.html (artifacts/ is outside Git). Open each page
// in the browser and save it as PDF. Never uses chats, offers or visits.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';
import { buildProvinceReport, renderReportHtml, slug } from './market-report-lib.mjs';

const flag = process.argv.indexOf('--month');
const month = flag < 0 ? new Date().toISOString().slice(0, 7) : process.argv[flag + 1];
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('Usa --month AAAA-MM');
const db = createDatabaseClient();
await db.connect();
try {
  await db.query('begin transaction read only');
  const { rows: listings } = await db.query(`
    select p.province, p.location, p.type, p.operation, p.rent_period, p.price::float8 as price, p.area::float8 as area,
           p.availability, p.created_at, p.owner_id,
           (select min(h.recorded_at) from kh_private.property_price_history h where h.property_id = p.id and h.availability = 'sold') as sold_at
      from public.properties p
     where p.moderation = 'approved'
       and not exists (select 1 from kh_private.suspended_properties s where s.property_id = p.id)
       and not exists (select 1 from kh_private.property_aliases a where a.property_id = p.id)`);
  const { rows: searches } = await db.query(`
    select s.user_id, s.filters->>'province' as province,
           array(select jsonb_array_elements_text(coalesce(s.filters->'operations', '[]'::jsonb))) as operations
      from kh_private.saved_searches s
     where s.enabled and s.filters->>'province' is not null`);
  await db.query('rollback');
  const cutoff = new Date().toISOString();
  const dir = new URL(`../artifacts/market-reports/${month}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const province of [...new Set(listings.map(row => row.province))].sort()) {
    const report = buildProvinceReport({ province, month, cutoff, listings: listings.filter(row => row.province === province), searches: searches.filter(s => s.province === province) });
    writeFileSync(new URL(`${slug(province)}.html`, dir), renderReportHtml(report));
    console.log(`informe: artifacts/market-reports/${month}/${slug(province)}.html (${report.listingCount} anuncios activos)`);
  }
} finally {
  await db.end();
}
```

Run: `node --check scripts/market-report.mjs`
Expected: sin salida y código 0. No lo ejecutes contra producción en esta tarea.

- [ ] **Step 4: Comprobar y commit**

Run: `npm run check`
Expected: en verde.

```bash
git add scripts/market-report-lib.mjs scripts/market-report.mjs tests/market-report.test.ts
git commit -m "feat(pro): add the read-only monthly market report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificación final y evidencia

**Files:**
- Create: `docs/karmahouse-pro-verification.md`

- [ ] **Step 1: Todo en local**

Base nueva y todas las suites:

```powershell
$suites = (Get-ChildItem supabase/tests -Filter *.sql | ForEach-Object BaseName) -join ' '
node scripts/local-sql/run-suite.mjs $suites.Split(' ')
npm run check
npm run export
```

Expected: `PASS` en cada suite, `npm run check` en verde y la exportación de web, Android e iOS sin errores. Si una suite antigua falla, compárala con `main` en una base nueva sin la migración de Pro antes de culparla: si ya fallaba, anótalo en la evidencia y no la toques.

- [ ] **Step 2: Pedir permiso para el ensayo en producción**

Pregunta al usuario en el chat, con estas palabras o parecidas: «¿Ejecuto `node scripts/apply-pro.mjs` sin `--commit`? Corre la migración y las suites en producción dentro de transacciones que se deshacen; no queda nada aplicado». Sin un sí claro, para aquí y anota en la evidencia que el ensayo queda pendiente.

- [ ] **Step 3: Ensayo y, con un segundo permiso, aplicación**

Con permiso: `node scripts/apply-pro.mjs`. Expected: `suites superadas; nada se aplicó` e `inventoryUnchanged: true`.

Aplicar (`--commit`) es otra decisión: pide permiso aparte. Con permiso: `node scripts/apply-pro.mjs --commit`. Expected: `migración aplicada`, `suites superadas sobre el esquema aplicado` e `inventoryUnchanged: true`.

- [ ] **Step 4: Recorrido real con el propietario**

Solo después de aplicar en producción y con el cliente nuevo en el navegador (app.karmahouse.site o la vista previa local configurada contra producción). El propietario lo hace con sus cuentas; tú lo guías y anotas:

1. Administración › KarmaHouse Pro: crear un código libre de 30 días con nota «Prueba interna».
2. Con una segunda cuenta suya: Mi espacio › KarmaHouse Pro › canjear el código. Ver «Pro activo hasta…».
3. Mis anuncios: si esa cuenta tiene un anuncio activo de más de 7 días, «Subir anuncio» y comprobar que aparece primero en «Más recientes» con el sello Pro.
4. Administración: quitar Pro a esa cuenta con nota «Fin de la prueba». Ver que el sello desaparece.
5. Historial: ver «Código Pro creado», «Código Pro canjeado» y «Pro retirado».

- [ ] **Step 5: Escribir la evidencia**

`docs/karmahouse-pro-verification.md`, con lo que realmente pasó. Estructura:

```markdown
# KarmaHouse Pro — verificación

Fecha: <día real>. Commit: <hash real>.

## Local
- Suites SQL: <lista y resultado>.
- `npm run check`: <número de tests y resultado>.
- `npm run export`: <resultado>.

## Producción
- Ensayo sin `--commit`: <resultado o «pendiente: sin permiso»>.
- Aplicación: <resultado o «pendiente: sin permiso»>.
- Recorrido del propietario: <cada paso con su resultado, o «pendiente»>.

## Límites
- La página web pública de la inmobiliaria no muestra el sello (spec §3).
- Dos canjes simultáneos del mismo código los serializa `for update`; las suites corren en una sola conexión y no lo prueban con dos.
- Las suites no tienen anuncios alias ni anuncios asistidos con el consentimiento retirado: esos dos rechazos de `kh_bump_property` están revisados en código (spec §6), no probados.
- El informe todavía no se ha generado con datos reales: requiere permiso para leer producción.
- Sin prueba en un APK físico: el cliente nuevo va en el próximo APK.
```

No escribas «pasó» en ningún paso que no hayas visto pasar.

- [ ] **Step 6: Commit**

```bash
git add docs/karmahouse-pro-verification.md
git commit -m "docs(pro): record the KarmaHouse Pro verification" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Apagar el clúster local**

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\kh-pro-pg" stop
```

Deja el directorio `kh-pro-pg`: borrarlo es decisión del usuario.

---

## Después de este plan

- Añadir Pro a `BRAND.md` como dato confirmado cuando funcione en producción, y solo entonces mencionarlo en la landing.
- Antes del primer informe con búsquedas guardadas: actualizar la política de privacidad publicada (spec §9).
- Generar el primer informe (`node scripts/market-report.mjs --month AAAA-MM`) solo con permiso del usuario para leer producción.
