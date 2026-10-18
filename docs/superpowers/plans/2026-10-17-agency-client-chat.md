# Chat con el cliente atendido por el equipo (parte 2): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Varias personas autorizadas responden a un cliente en la misma conversación, a nombre de la inmobiliaria.
- Administradores y coordinadores escriben en todas las conversaciones.
- El responsable y las personas añadidas escriben en las suyas.
- El cliente ve «la inmobiliaria» y puede bloquearla.

**Architecture:**
- **Base de datos:** las conversaciones con clientes pasan a una regla de acceso propia, `kh_private.agency_conversation_role`.
  - `agency_deal_visible` no cambia, así que quien atiende no recibe el expediente.
  - Hay dos tablas privadas nuevas: personas que atienden y bloqueos de cliente.
  - Hay dos columnas nuevas: `agency_conversations.last_message_at` y `agency_messages.from_agency`.
  - Se redefinen las RPC de conversación y hay dos nuevas.
- **App:**
  - El decodificador acepta los campos nuevos y también su ausencia (servidor antiguo).
  - La pantalla de conversación pasa a ser un chat con piezas del chat personal y conserva su lógica de lectura, envío y refresco.
  - La bandeja muestra el último mensaje.
  - La ficha abre el chat directamente cuando solo hay una inmobiliaria.

**Tech Stack:** Postgres/Supabase (plpgsql), Expo Router + React Native (TypeScript), `node:test` y suites SQL con rollback.

**Spec:** `docs/superpowers/specs/2026-10-17-agency-chat-design.md`, sección 5.

**Reglas para quien ejecute:**
- No se aplica nada en producción. La prueba en seco corre en una transacción que se deshace.
- No se hace push ni se publica. Commits solo con permiso del usuario.
- **Node:** si el node del sistema falla contra Supabase (`EACCES` o un error vacío), usa `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- **Coexistencia con comisiones:** no redefinas `terminate_agency_member_flows`. La salida del equipo usa su propio trigger.

**Diferencias con la spec (deliberadas):**
- Un cliente con la app 0.1.29 puede seguir bloqueando o reportando a una persona concreta, como antes, para no romperle la pantalla. La app nueva solo ofrece «Bloquear a la inmobiliaria» y «Reportar conversación».
- El número de no leídos de la pestaña «Inmobiliarias» cuenta solo la píldora activa, porque es lo que ya está cargado.
- `counterparts.ts` desaparece. La pantalla calcula reportar y bloquear con las reglas nuevas.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20261017000300_agency_client_chat.sql` | Crear | Tablas, columnas, regla de acceso, RPC redefinidas y nuevas, trigger de salida |
| `supabase/tests/agency_client_chat.sql` | Crear | Suite con rollback (ids `62…`) |
| `scripts/apply-reviewed-migration.mjs` | Modificar | Prefijo `62…` |
| `src/agencies/messaging/types.ts` | Modificar | `AgencyConversationRole`, `AgencyAttendant`, campos nuevos, `setAttendant`, `setAgencyBlock`, `reportedUserId?` |
| `src/agencies/messaging/repository.ts` | Modificar | Decodificación tolerante y RPC nuevas |
| `src/agencies/messaging/presentation.ts` | Crear | Lado de cada mensaje, autor, vista previa, motivo sin envío, fechas e iniciales |
| `src/agencies/messaging/counterparts.ts` | Borrar | Sustituido por las reglas nuevas |
| `src/agencies/domain.ts` | Modificar (`agencyError`) | `KH_AGENCY_BLOCKED`, `…CONVERSATION_CLOSED`, `KH_CHAT_BLOCKED`, `…MANAGER_CHANGED`, `…ASSIGNMENT_CHANGED` |
| `src/components/messaging/MessageBubble.tsx` | Modificar | Prop `teammate` (lado propio en tono suave) |
| `src/components/agencies/AgencyAttendantsSheet.tsx` | Crear | Hoja «Quién atiende» |
| `src/screens/AgencyConversationScreen.tsx` | Reescribir la vista | Chat de cliente y de equipo |
| `src/screens/InboxScreen.tsx` | Modificar (`AgencyInbox`) | Píldoras, filas con último mensaje y número de no leídos |
| `src/screens/DetailScreen.tsx` | Modificar (`openContact`) | Atajo cuando hay una sola inmobiliaria |
| `src/screens/AgencyTeamChatScreen.tsx` | Modificar | Usa `messageDay` |
| `tests/agency-client-chat.test.ts` | Crear | Decodificación, repositorio, presentación y errores |
| `tests/agency-refresh-recovery.test.ts`, `tests/agency-consultation-states.test.ts`, `tests/agency-messaging.test.ts` | Modificar | Enlaces de piezas nuevas, etiqueta de la píldora y fin de `counterparts` |

---

### Task 1: Suite SQL y migración

**Files:** `supabase/tests/agency_client_chat.sql`, `supabase/migrations/20261017000300_agency_client_chat.sql`, `scripts/apply-reviewed-migration.mjs`

- [x] **Step 1:** Escribe la suite. Cubre:
  - El enlace fija al responsable, y el cliente no ve nombres ni la lista del equipo.
  - Otro gestor no ve ni escribe.
  - El administrador y el coordinador responden sin tomar el caso, y el responsable no cambia.
  - El responsable no puede añadir personas. El administrador añade a G2, que escribe sin expediente (`kh_get_agency_deal` lo rechaza).
  - El equipo ve autores y roles; el cliente solo `fromAgency`.
  - El reporte del cliente apunta a la última persona del equipo que escribió.
  - Un bloqueo personal solo detiene a esa persona.
  - Con la inmobiliaria bloqueada: `KH_AGENCY_BLOCKED` al enviar (cliente y equipo) y al iniciar. Otra inmobiliaria da `KH_CHAT_INVALID_BLOCK`, el equipo no puede tocar el bloqueo y desbloquear lo restaura.
  - Un enlace con otro gestor reabre la misma conversación.
  - La cola aparece primero para el administrador, el responsable solo ve las suyas y la actividad reordena la lista.
  - Salir del equipo borra a la persona de las conversaciones.
  - Privilegios cerrados.
- [x] **Step 2:** Escribe la migración. Contratos:
  - `agency_conversation_role(actor, agency, deal, conversation)` → `client | supervisor | lead | attendant | null`.
  - `agency_conversation_prepare` y `agency_conversation_access` siguen el mismo esquema que `agency_prepare_deal` y `agency_deal_access`.
  - `agency_conversation_can_send`:
    - Expediente abierto, cliente activo, vivienda viva y cliente sin bloquear a la inmobiliaria.
    - Para el equipo, además: tener papel en la conversación, poder contactar y no tener bloqueo con el cliente.
  - `agency_conversation_json` añade `role`, `canManage`, `canSeeDeal`, `agencyBlocked`, `buyerName` (solo equipo), `attendants` (solo equipo), `lastMessage` y `lastMessageAt`.
  - `agency_message_json` añade `fromAgency`. `agency_message_view` añade `senderName` y `senderRole` solo para el equipo.
  - **Redefinidas:**
    - `kh_list_agency_conversations`: ordena por actividad.
    - `kh_list_agency_messages`.
    - `kh_send_agency_message`:
      - Guarda `from_agency` y `last_message_at`.
      - Deja leído lo propio.
      - Da `KH_AGENCY_BLOCKED` y `KH_CHAT_BLOCKED` por persona.
    - `kh_read_agency_conversation`.
    - `kh_report_agency_conversation`: sin persona, apunta a la última del equipo.
    - `kh_set_agency_conversation_block`: cualquiera del equipo con acceso puede bloquear al cliente; el cliente conserva sus reglas.
    - `agency_make_deal`: reabre el caso abierto del cliente y rechaza a un cliente que bloqueó a la inmobiliaria.
    - `kh_start_agency_conversation`.
  - **Nuevas:**
    - `kh_set_agency_conversation_attendant(p_actor_id, p_agency_id, {conversationId, userId, attending, clientRequestId})`, para coordinadores y administradores.
    - `kh_set_agency_client_block(p_actor_id, {agencyId, conversationId, blocked, clientRequestId})`, solo para el cliente y sin exigir el módulo activo.
- [x] **Step 3:** Prefijo `62…` en el script.
- [x] **Step 4:** `node scripts/apply-reviewed-migration.mjs 20261017000300_agency_client_chat`. Resultado: «suite superada; nada se aplicó».

### Task 2: Tipos, repositorio y presentación

**Files:** `src/agencies/messaging/{types,repository,presentation}.ts`, `src/agencies/domain.ts`, `tests/agency-client-chat.test.ts`

- [x] **Step 1:** Pruebas (`tests/agency-client-chat.test.ts`):
  - La vista del equipo decodifica quién atiende.
  - Un servidor antiguo sigue leyéndose, con el rol según las reglas viejas.
  - Los mensajes llevan su lado.
  - Solo el equipo añade personas y solo el cliente bloquea a la inmobiliaria, con eco comprobado.
  - El cliente reporta sin persona; el equipo debe nombrar al cliente.
  - Lados, autores, vistas previas y motivos.
  - Errores en español.
- [x] **Step 2:** Implementa:
  - `decodeAgencyConversation`. Si falta `role`, lo deduce:
    - `lead` si quien consulta es el responsable.
    - `supervisor` si es otra persona del equipo.
    - `client` en el resto de casos.
  - `decodeAgencyMessage`: `fromAgency`, `senderName` y `senderRole`, o `null` si faltan.
  - `setAttendant`, `setAgencyBlock` y `report` con `reportedUserId` opcional (solo el cliente puede omitirlo).
  - `presentation.ts`.
- [x] **Step 3:** `node --experimental-strip-types --test tests/agency-client-chat.test.ts` → 8/8.

### Task 3: Pantalla de conversación y hoja «Quién atiende»

**Files:** `src/screens/AgencyConversationScreen.tsx`, `src/components/agencies/AgencyAttendantsSheet.tsx`, `src/components/messaging/MessageBubble.tsx`

- [x] **Step 1:** Conserva `capture`, `load`, `act`, `send`, `useConsultationRefresh`, el sondeo, el intento pendiente y sus etiquetas («Mensaje a la inmobiliaria», «Enviar mensaje», «Reintentar el mismo mensaje», «Descartar intento», «Ver mensajes anteriores»).
- [x] **Step 2:** Vista:
  - **Cabecera:** el cliente ve `AgencyMark` y la inmobiliaria; el equipo ve un arco con las iniciales y el nombre del cliente. Debajo, la vivienda como enlace.
  - **Línea de privacidad.**
  - **Fila «Responsable · Atienden»** (solo equipo), que abre la hoja.
  - **Mensajes:**
    - Burbujas con separador por día.
    - Al equipo, un compañero aparece a la derecha en tono suave con «Nombre · Rol».
  - **«+»:** abre «Visitas y ofertas» al final de la lista. El panel sigue montado con `display: none`, así que el borrador no se pierde.
  - **Campo fijo abajo,** o una línea con el motivo si no se puede enviar.
  - **Hoja «Opciones»:**
    - «Ver vivienda».
    - «Visitas y ofertas».
    - «Abrir expediente».
    - «Quién atiende».
    - «Reportar…».
    - «Desbloquear al equipo», para bloqueos antiguos.
    - «Bloquear…», con confirmación en `danger-fill`.
- [x] **Step 3:** Hoja «Quién atiende»:
  - Lista los miembros activos (`listMembers`).
  - Ofrece «Hacer responsable» (`kh_assign_agency_deal`) y la cápsula «Atiende» para gestores (`setAttendant`).
  - Administradores y coordinadores llevan «Escribe siempre».
  - Para quien no gestiona, es de solo lectura.
- [x] **Step 4:** Arneses de prueba:
  - Enlaza `IconButton`, `AgencyMark`, `MessageBubble`, `Sheet`, `AgencyAttendantsSheet`, `goBack`, `presentation` y `agencyRoleLabel`.
  - `chatMessages` lee `MessageBubble`.
  - Fixture con `attendants: []` y `blockedUserIds: []`.

### Task 4: Bandeja y ficha

**Files:** `src/screens/InboxScreen.tsx`, `src/screens/DetailScreen.tsx`

- [x] **Step 1:** Pestañas «Personales · n» e «Inmobiliarias · n».
- [x] **Step 2:** Píldoras «Mis consultas» y el nombre de la inmobiliaria (etiqueta accesible «Equipo de …»), solo para quien pertenece a una.
- [x] **Step 3:** Cada fila lleva:
  - El arco: iniciales del cliente para el equipo, `AgencyMark` para el cliente.
  - El título, la hora del último mensaje y la vivienda.
  - La vista previa («Equipo: …» o «Tú: …»).
  - El número de no leídos.
  - `StateChip` «Sin responsable» o «Expediente cerrado».
- [x] **Step 4:** En la ficha, con una sola inmobiliaria disponible, sin contacto personal y sin enlace que confirmar, «Contactar» llama a `contactSeller(agencia)` sin abrir la hoja.

### Task 5: Comprobar

- [x] `npm run check`: todo en verde menos los 2 fallos conocidos de `pwsh`.
- [x] **Revisión independiente del diff.** Se aplicaron cuatro arreglos:
  - El aviso «Este mensaje no se envió» ya no aparece mientras el mensaje se está enviando.
  - `markRead` solo se llama cuando hay mensajes sin leer. Antes, cada sondeo de 3 s escribía un recibo y bloqueaba la vivienda.
  - `clientBlockedByMe` hace visible un bloqueo personal hecho fuera de esta conversación.
  - El texto de «¿Bloquear a este cliente?» ahora es exacto: el bloqueo personal solo detiene a esa persona.
- [x] **Hallazgos que se dejaron, con su motivo:**
  - La reapertura antes de comprobar el bloqueo con el gestor del enlace: la conversación reabierta conserva su responsable y el gestor del enlace no se asigna.
  - El `senderId` visible para el cliente: lo exige la compatibilidad con la 0.1.29, como dice la spec, y es un id sin nombre.
  - Saltar la hoja de contacto con una sola inmobiliaria: el usuario lo aprobó en la spec, y el chat muestra la línea de privacidad.
- [ ] **Mirar en la web:**
  - Necesita una cuenta con sesión y la migración aplicada.
  - Hasta entonces solo se comprueban los estados sin sesión.
- [ ] Commit, solo con permiso.
