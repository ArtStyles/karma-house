# Perfil público con confianza — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perfil público de quien publica, con verificación manual, tiempo de respuesta, visitas concertadas y nivel de karma, visible desde el detalle, el chat y la ficha web.

**Architecture:** Una RPC `kh_public_profile` calcula todo en el servidor con reglas de visibilidad; el cliente añade el módulo `src/profiles/` y la pantalla `/user/[id]`; la función de Vercel añade una línea del vendedor.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React Native / Expo Router, `node --test`, Vercel function.

Spec: `docs/superpowers/specs/2026-10-01-trust-profile-design.md` (léela entera).

**Contexto**: `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`. Node del sistema sin red: `N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/...`. Nunca `--commit` sin permiso del usuario. Código en inglés, interfaz y docs en español, commits con última línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Referencias: `supabase/migrations/20260918000100_messaging.sql` (`kh_conversations`, `kh_messages`, `chat_actor`, bloqueos), `20260920000300_negotiations.sql` (`kh_negotiations`), `20260923000100_play_compliance.sql` (`kh_property_reports`), `20260920000100_account_profile.sql` (avatares), `20260928000100_search_alerts.sql` y `supabase/tests/search_alerts.sql` (estilo de RPC y de suite), `src/searches/` (módulo cliente de referencia: tipos, dominio, repositorio, hook), `src/auth/accountProfile.ts` y `src/components/account/UserAvatar.tsx` (avatar), `src/catalog/repository.ts` (carga por ids), `web/api/p.ts`.

### Task 1: Servidor

**Files:** Create `supabase/migrations/20261001000100_trust_profile.sql`, `supabase/tests/trust_profile.sql`, `scripts/apply-trust-profile.mjs`, `scripts/verify-trust-profile.mjs`.

- [ ] Migración según la spec: tabla `verified_users`; funciones privadas `kh_private.profile_response_stats(uuid)`, `kh_private.profile_visits_agreed(uuid)`, `kh_private.profile_confirmed_reports(uuid, interval)`, `kh_private.karma_level(...)`, `kh_private.profile_visible(p_user uuid, p_viewer uuid)`, `kh_private.avatar_is_public(text)`; RPC `kh_public_profile(uuid)` (usa `auth.uid()` como espectador, nulo si `anon`) y `kh_set_user_verified(uuid, uuid, boolean, text)`; política `kh_avatar_public_read`; permisos (`kh_public_profile` a `anon, authenticated`; `kh_set_user_verified` a `authenticated`; privadas revocadas); `notify pgrst`.
- [ ] Suite con los escenarios de la spec, asserts por id, `rollback`.
- [ ] Scripts como `apply-rent.mjs` / `verify-rent.mjs`. Ensayo en verde; suites anteriores (`search_alerts`, `rent`, `operations`, `optional_area`, `notifications`) siguen pasando sobre la migración.
- [ ] Commit `feat: compute a public profile with trust signals`.

### Task 2: Módulo cliente y pantalla

**Files:** Create `src/profiles/{types,domain,repository,usePublicProfile}.ts`, `src/screens/PublicProfileScreen.tsx`, `src/app/user/[id].tsx`, `tests/trust-profile.test.ts`; modify `src/screens/DetailScreen.tsx`, `src/screens/ConversationScreen.tsx`, `src/screens/ProfileScreen.tsx`.

- [ ] Tests primero: `levelLabel`/`levelDescription` para los cuatro niveles; `responseText` (30 → «Suele responder en menos de una hora», 200 → «Suele responder en unas 3 horas», 1500 → «Suele responder en un día», 5000 → «Suele responder en unos 3 días», nulo → `''`); `memberSinceText('2026-03-10…')` → «En KarmaHouse desde marzo de 2026»; `decodePublicProfile` estricto (uuid, nivel válido, enteros no negativos, `activeListings` uuids ≤ 24, `avatarUrlPath` con el patrón del bucket o nulo; rechaza claves como `email`); repositorio: sin sesión llama `kh_public_profile` sin cabecera `Authorization`, con sesión la envía; `setVerified` exige sesión.
- [ ] Implementación del módulo (patrón de `src/searches/`). Avatar: URL firmada con `supabase.storage.from('account-avatars').createSignedUrl(path, 3600)`; si falla, iniciales.
- [ ] Pantalla y ruta; entradas en detalle, chat y Mi espacio según la spec. El bloque del vendedor del detalle deja de consultar `profiles` directamente y usa el hook.
- [ ] `npm run check`; navegador en modo demo: el detalle de una vivienda de muestra no ofrece perfil (sin vendedor real) y nada rompe. Commit `feat: show who publishes and why they can be trusted`.

### Task 3: Ficha pública web

**Files:** `web/api/p.ts`, `tests/public-listing.test.ts`.

- [ ] Tests primero: con perfil → «Publicado por Ana · Confiable» y «Verificado por KarmaHouse»; nombre escapado; RPC caída o 404 → ficha sin línea y `200`; `owner_id` nunca aparece en el HTML.
- [ ] Implementación; `npm run check`. Commit `feat: name the seller and their level on the public page`.

### Task 4: Aplicar, verificar y documentar

- [ ] Con permiso: `apply-trust-profile.mjs --commit`, verificaciones, push. Proyecto real: perfil de la cuenta del usuario por SQL y por la ficha de Vercel; teléfono: abrir perfil desde un detalle y verificar como administrador.
- [ ] `docs/trust-profile-verification.md`, README, roadmap. Commit `docs: verify the public profile` y push.
