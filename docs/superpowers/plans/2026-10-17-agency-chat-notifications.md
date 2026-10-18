# Avisos de los chats de inmobiliaria (parte 3): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada mensaje de un chat de inmobiliaria (con un cliente o interno) llega al teléfono como push.
- No entra en la campana.
- Hay un aviso por chat: el teléfono reemplaza el anterior.
- Se marca leído al abrir el chat.

**Architecture:**
- Hay una categoría nueva `agency_message` en `kh_private.notifications`, con `agency_chat` (`c:<conversación>` o `t:<inmobiliaria>`) y `agency_message_seq`.
- Triggers `after insert` en `agency_messages` y `agency_team_messages` crean los avisos con `kh_private.agency_chat_notify`. Esa función toma solo los bloqueos de destinatario, ordenados.
- Triggers en `agency_message_reads` y `agency_team_reads` marcan leídos los avisos hasta el cursor.
- Push:
  - `push_enqueue` y `push_eligible` exigen `push_devices.supports_agency_chat`.
  - `push_payload` usa `tag` y `collapseId` `kh-chat-<chat>`.
  - `kh_register_push_device` acepta `supportsAgencyChat`.
- En la app hay dos rutas nuevas de push y el registro es tolerante si el servidor todavía no tiene la migración.

**Tech Stack:** Postgres/Supabase (plpgsql), Expo Router + React Native (TypeScript), `node:test` y suites SQL con rollback.

**Spec:** `docs/superpowers/specs/2026-10-17-agency-chat-design.md`, sección 6.

**Orden de despliegue:**
- Las migraciones 0200, 0300 y 0400 se aplican antes de publicar la APK, y cada una necesita el «sí» del usuario.
- Si una APK nueva llega antes que la migración 0400, su registro push reintenta sin `supportsAgencyChat` (el servidor responde `KH_PUSH_INVALID`). Ese teléfono sigue recibiendo los demás avisos.
- Cuando la migración llegue, la siguiente apertura de la app registra el teléfono con avisos de chat.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20261017000400_agency_chat_notifications.sql` | Crear | Categoría, triggers, visibilidad, push y registro |
| `supabase/tests/agency_chat_notifications.sql` | Crear | Suite con rollback (ids `63…`) |
| `scripts/apply-reviewed-migration.mjs` | Modificar | `--after=<migración>,…` para probar en seco encima de migraciones aún sin aplicar; prefijo `63…` |
| `src/push/types.ts`, `src/push/domain.ts` | Modificar | Rutas `agency_conversation` (con inmobiliaria y conversación) y `team_chat` (con inmobiliaria, sin conversación) |
| `src/notifications/agencyNavigation.ts` | Modificar | `/agency-conversation/<id>?agencyId=…` y `/agency-team-chat` |
| `src/push/repository.ts` | Modificar | Reintento sin el indicador ante `KH_PUSH_INVALID`; devuelve `agencyChat` |
| `src/push/controller.ts`, `src/push/installationStore.ts` | Modificar | Intención `supportsAgencyChat`: se vuelve a registrar mientras no esté aceptada |
| `tests/agency-chat-push.test.ts` | Crear | Rutas, navegación y registro tolerante |

### Task 1: Suite SQL y migración

- [x] **Suite.** Cubre:
  - Cada teléfono guarda si admite avisos de chat.
  - El mensaje del cliente llega solo al responsable y no a la campana. Al tocar el aviso se abre la conversación del equipo.
  - La respuesta del equipo llega al cliente con el nombre de la inmobiliaria y una etiqueta por chat. Quien responde no recibe aviso de lo suyo.
  - Leer la conversación marca leído el aviso.
  - La cola avisa a coordinadores y administradores, no a los gestores.
  - Con «Mensajes» apagado no hay aviso.
  - El chat interno avisa al resto del equipo. Un teléfono antiguo no recibe push. Al tocar el aviso se abre el chat del equipo, y leerlo lo marca leído.
  - Quien sale del equipo deja de ver el aviso.
  - Las funciones auxiliares son privadas.
- [x] **Migración.** Contratos en la cabecera del archivo.
- [x] **Prueba en seco.** `node scripts/apply-reviewed-migration.mjs 20261017000400_agency_chat_notifications --after=20261017000200_agency_team_chat,20261017000300_agency_client_chat` → «suite superada; nada se aplicó».

### Task 2: App

- [x] Rutas, navegación, intención y registro tolerante.
- [x] **Pruebas.** `tests/agency-chat-push.test.ts` pasa 4/4. Las pruebas de `push-controller` y `agency-notifications` siguen en verde.

### Task 3: Comprobar

- [x] **`npm run check`.** Todo en verde menos los 2 fallos conocidos de `pwsh`.
- [ ] **Push real en Android.** Necesita las tres migraciones aplicadas y dos teléfonos o cuentas.
