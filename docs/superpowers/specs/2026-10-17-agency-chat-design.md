# Chat de inmobiliarias: equipo que atiende al cliente y chat interno

Fecha: 17 de octubre de 2026.
Estado: diseño aprobado por el usuario en conversación, con las cuatro decisiones por defecto (sección 2). Esta aprobación no cubre migraciones en producción, push ni publicación: cada una necesita la suya.

## 1. Problema

Peticiones del usuario:

1. «En inmobiliaria debe haber una sección para chat interno o chat grupal que lo vean todos los del equipo y todos puedan escribir.»
2. Cuando un cliente escribe por una vivienda de una inmobiliaria, debe abrirse un chat con la inmobiliaria. Lo gestionan sus administradores y las personas que ellos asignen, y varias personas autorizadas pueden responder en el mismo chat a nombre de la inmobiliaria.

Cómo funciona hoy (`20261007000600_agency_deals_messaging.sql`, `AgencyConversationScreen`, `InboxScreen`):

- Cada consulta crea un expediente (`agency_deals`) con una conversación (`agency_conversations`). El expediente tiene un solo responsable (`assignee_id`).
- Administradores y coordinadores ven todas las conversaciones. Un gestor solo ve las que tiene asignadas.
- Solo el responsable puede escribir: `canSend` exige `assignee_id = actor`. Si un administrador quiere contestar, tiene que pulsar «Tomar este caso», y eso le quita el caso al gestor, con sus visitas y tareas.
- En la cola (expediente sin responsable), el cliente escribe pero nadie del equipo puede contestar.
- Ningún mensaje de inmobiliaria genera aviso ni push. El equipo no se entera de que el cliente escribió, y el cliente no se entera de la respuesta.
- El cliente ve «Equipo · participante 1, 2», con botones de reportar y bloquear por participante. La pantalla es una lista de tarjetas y avisos, no un chat.
- En la bandeja, las filas no muestran el último mensaje ni la hora.
- Un enlace compartido con `managerId` falla con «Ese contacto no está disponible» si el cliente ya tenía una conversación abierta con otro responsable (`KH_AGENCY_ASSIGNMENT_CHANGED`).
- No existe chat interno del equipo.

## 2. Decisiones confirmadas

1. En los chats con clientes, los coordinadores pueden lo mismo que los administradores.
2. Las personas que atienden solo tienen el chat. El expediente (visitas, ofertas, tareas y cierre) sigue siendo del responsable, de los coordinadores y de los administradores.
3. El cliente habla con «la inmobiliaria». No ve nombres de personas del equipo.
4. El chat interno no tiene reportes en v1. El administrador puede retirar a alguien del equipo.

## 3. Alcance

**Entra:**
- Chat interno por inmobiliaria.
- Personas que atienden cada conversación con un cliente.
- Permisos nuevos de lectura y escritura.
- Bloqueo de una inmobiliaria por parte del cliente.
- Avisos push de mensajes.
- Bandeja con el último mensaje.
- Pantallas de chat en Mediopunto.

**Queda fuera:**
- Adjuntos, editar o borrar mensajes, hilos, «escribiendo…» y confirmaciones de lectura por persona.
- Reportes en el chat interno.
- El contador de mensajes de inmobiliaria en la insignia de la pestaña Mi espacio.
- Avisos en la web: no hay push en el navegador, igual que hoy.

## 4. Chat interno del equipo (parte 1)

### Datos

Migración `20261017000200_agency_team_chat.sql`:

- `kh_private.agency_team_chats(agency_id pk → agencies, last_seq ≥ 0)`. La fila se crea con el primer mensaje.
- `kh_private.agency_team_messages(id, agency_id → agency_team_chats, seq > 0, client_message_id, author_id, sender_id → auth.users on delete set null, body 1–2000, created_at)`, con `unique(agency_id, seq)` y `unique(author_id, client_message_id)`. Igual que en `agency_messages`:
  - `author_id` no cambia nunca y sirve para la idempotencia.
  - `sender_id` pasa a nulo si se elimina la cuenta.
- `kh_private.agency_team_reads(agency_id, user_id → auth.users on delete cascade, last_seq)`.
- Las tres tablas tienen RLS y ningún permiso para `anon` ni `authenticated`, como el resto de `kh_private`.
- `kh_private.agency_shared_chat_rate()` añade `agency_team_messages` a su conteo, y la tabla nueva recibe el mismo trigger. Así el límite de 20 mensajes por minuto y 300 por hora es común a los tres chats.

### Permisos

- **Leer** (`kh_get_agency_team_chat`, `kh_list_agency_team_messages`, `kh_read_agency_team_chat`): cualquier miembro activo, con `agency_reader(..., 'manager')`. No exige módulo activo ni inmobiliaria aprobada, igual que «Consultar historial».
- **Escribir** (`kh_send_agency_team_message`): miembro activo con el módulo activo y la inmobiliaria aprobada, con `agency_actor(..., 'manager')`.
- **Orden de bloqueos al escribir:**
  1. Bloqueo compartido del módulo.
  2. Cuenta (`agency_lock_accounts`).
  3. `kh:chat:actor`.
  4. Inmobiliaria.
  5. Fila del chat (`for update`).

  Es el mismo orden que `agency_flow_locks`, así que no se cruza con un mensaje a un cliente.
- Quien sale del equipo pierde el acceso. Sus mensajes se conservan con su nombre, y su rol se muestra como `null` (la app escribe «Ya no está en el equipo»).

### RPC (todas `security definer`, `search_path=''`, solo para `authenticated`)

- **`kh_get_agency_team_chat(p_actor_id, p_agency_id)`** devuelve `{agencyId, agencyName, lastSeq, unreadCount, canSend, memberCount, lastMessage}`.
  - `lastMessage` es `{body, senderName, createdAt}` o `null`.
  - `canSend` es verdadero cuando el módulo está activo, la inmobiliaria aprobada y quien consulta puede contactar (`agency_contact_member`).
- **`kh_list_agency_team_messages(p_actor_id, p_agency_id, p_before_seq, p_limit)`** devuelve `{items, hasMore}`.
  - Las páginas van de más nuevo a más viejo y tienen como máximo 50 mensajes.
  - Cada mensaje es `{id, agencyId, seq, clientMessageId, senderId, senderName, senderRole, body, createdAt}`.
  - `senderName` es el nombre del perfil o «Cuenta eliminada».
  - `senderRole` es el rol activo o `null`.
- **`kh_send_agency_team_message(p_actor_id, p_agency_id, p_payload {clientMessageId, body})`** devuelve el mensaje.
  - Sin espacios al principio y al final, el texto debe tener de 1 a 2000 caracteres.
  - Repetir el mismo `clientMessageId` con el mismo texto devuelve el mensaje ya guardado. Con otro texto, o desde otra inmobiliaria, da `KH_CHAT_MESSAGE_CONFLICT`.
  - Quien envía queda con el chat leído hasta su propio mensaje.
- **`kh_read_agency_team_chat(p_actor_id, p_agency_id, p_payload {lastSeq})`**.
  - `lastSeq` debe estar entre 0 y el `last_seq` del chat. Si no, da `KH_CHAT_INVALID_CURSOR`.
  - La lectura solo avanza: se guarda `greatest` entre el valor guardado y el nuevo.
- **Errores:** se reutilizan `KH_AGENCY_MEMBERSHIP_REQUIRED`, `KH_AGENCY_NOT_APPROVED`, `KH_AGENCY_DISABLED`, `KH_CHAT_INVALID_MESSAGE`, `KH_CHAT_MESSAGE_CONFLICT`, `KH_CHAT_RATE_LIMIT` y `KH_CHAT_INVALID_CURSOR`.

### App

- **`src/agencies/messaging/teamChat.ts`:** tipos, decodificación estricta y repositorio con `createScopedRpc`.
  - Lectura con `captureAgencyReadContext`.
  - Envío con `captureAgencyContext`.
- **Pantalla `AgencyTeamChatScreen` (`/agency-team-chat`):**
  - Cabecera con `AgencyMark`, «Chat del equipo» y el nombre de la inmobiliaria con el número de personas.
  - Burbujas con `MessageBubble`. Las mías van a la derecha. Las de compañeros van a la izquierda, con el nombre y el rol encima.
  - Separadores por día y campo de escribir fijo abajo.
  - Se actualiza cada 3 s mientras está abierta (`startAgencyPoll`) y marca como leído al llegar al final.
  - Si el envío falla, el texto se conserva con el mismo `clientMessageId` para reintentarlo.
  - Cuando `canSend` es falso, el campo se sustituye por una línea con el motivo.
- **Entradas:**
  - Fila «Chat del equipo» en Mi inmobiliaria, con el número de mensajes sin leer.
  - Fila fijada arriba en Mensajes › Con inmobiliarias › Equipo de mi inmobiliaria, con el último mensaje.

## 5. Chat con el cliente atendido por el equipo (parte 2)

Migración `20261017000300_agency_client_chat.sql`.

### Datos

- `kh_private.agency_conversation_members(conversation_id → agency_conversations, user_id → auth.users on delete cascade, added_by, created_at, pk(conversation_id, user_id))`: las «personas que atienden».
- `kh_private.agency_client_blocks(agency_id → agencies, user_id → auth.users on delete cascade, created_at, pk(agency_id, user_id))`: un cliente que bloqueó a una inmobiliaria.
- `agency_conversations.last_message_at`, rellenado desde los mensajes que ya existen. Ordena la bandeja por actividad.
- **Trigger nuevo `after update of state` en `agency_memberships`:** cuando alguien pasa a `removed`, se borran sus filas de personas que atienden en las conversaciones de esa inmobiliaria.
  - No se redefine `terminate_agency_member_flows`, porque la spec de comisiones también lo toca.

### Quién ve y quién escribe

| Rol en la conversación | Ve | Escribe | Gestiona quién atiende | Expediente |
|---|---|---|---|---|
| Cliente (`buyer_id`) | sí | sí | no | — |
| Administrador o coordinador | todas las de su inmobiliaria | sí, sin tomar el caso | sí | sí |
| Responsable (`assignee_id`) | sí | sí | no | sí |
| Persona que atiende | sí | sí | no | no |
| Otro gestor | no | no | no | no |

- Para escribir hace falta, además:
  - Expediente abierto, vivienda viva, inmobiliaria aprobada y módulo activo (`agency_flow_live`).
  - Cliente con cuenta activa.
  - Que quien escribe pueda contactar.
  - Que no haya bloqueo personal entre quien escribe y el cliente.
  - Que el cliente no haya bloqueado a la inmobiliaria.
- Ya no se exige que el responsable no tenga un bloqueo con el cliente: cada persona del equipo se comprueba por separado.
- El cliente puede escribir a la cola, igual que hoy.
- Un predicado nuevo, `kh_private.agency_conversation_access(actor, agency, conversation)`, devuelve el papel de cada uno. Lo usan solo las RPC de conversación.
  - `agency_deal_visible` no cambia, para que las personas que atienden no tengan el expediente.
- Se redefinen `kh_get_agency_conversation`, `kh_list_agency_conversations`, `kh_list_agency_messages`, `kh_send_agency_message`, `kh_read_agency_conversation`, `kh_report_agency_conversation` y `kh_set_agency_conversation_block` sobre ese predicado.
- **Gestionar quién atiende:** `kh_set_agency_conversation_attendant(p_actor_id, p_agency_id, p_payload {conversationId, userId, attending, clientRequestId})`.
  - Solo pueden coordinadores y administradores.
  - La persona destino debe poder contactar y no tener un bloqueo con el cliente.
  - Al responsable no hace falta añadirlo. Se cambia con `kh_assign_agency_deal`, como hoy.

### Respuestas

- **Conversación:** se añaden `buyerName` (solo para el equipo), `attendants: [{userId, displayName, role, lead}]` (solo para el equipo), `canManage`, `canSeeDeal`, `agencyBlocked`, `lastMessage {body, createdAt, fromAgency}` y `lastMessageAt`.
- **Mensaje:**
  - Se añade `fromAgency`.
  - `senderName` va solo para el equipo; para el cliente va `null`.
  - Se mantiene `senderId` para no romper la 0.1.29. Es un id interno, sin nombre.

### Cliente

- **Bloquear a la inmobiliaria:** `kh_set_agency_client_block(p_actor_id, p_payload {agencyId, conversationId, blocked, clientRequestId})`.
  - Solo puede quien tiene una conversación con esa inmobiliaria.
  - Mientras dure el bloqueo, nadie del equipo le escribe, él no puede escribir y `kh_start_agency_conversation` devuelve `KH_AGENCY_BLOCKED`.
- **Reportar conversación:** el cliente ya no elige persona. El servidor apunta el reporte a la última persona del equipo que escribió y guarda los últimos 30 mensajes con su autor, como hoy. La tabla de reportes no cambia.
- **Bloqueos personales antiguos** que un cliente hizo a una persona concreta: se siguen respetando. Las opciones muestran «Desbloquear al equipo», que los quita con la RPC existente.
- **`kh_start_agency_conversation`:** si ya hay un expediente abierto de ese cliente con esa inmobiliaria para esa vivienda, devuelve su conversación aunque el `managerId` del enlace sea otro. Si es nuevo, el gestor del enlace queda como responsable, como hoy.

### Pantallas

- **`AgencyConversationScreen`** se rehace como chat. Usa las mismas piezas que `ConversationBody`: cabecera, lista invertida al final, `MessageBubble`, separadores por día, campo fijo y menú de opciones.
  - **Para el cliente:**
    - Cabecera con `AgencyMark`, el nombre de la inmobiliaria y la vivienda.
    - Debajo, la línea «Te responde el equipo de X. Tu teléfono y tu correo no se muestran.»
    - Las respuestas del equipo, a la izquierda y sin nombre.
    - Opciones: «Ver vivienda», «Visitas y ofertas», «Reportar conversación» y «Bloquear a X» o «Desbloquear a X».
  - **Para el equipo:**
    - Cabecera con el nombre del cliente y la vivienda.
    - El cliente, a la izquierda.
    - El equipo, a la derecha: los míos en azul y los de compañeros en un tono suave, con «Nombre · Rol» encima.
    - Fila «Atienden», con avatares de iniciales, que abre la hoja «Quién atiende» (`Sheet`): responsable y personas que atienden. Solo pueden editarla quienes tienen `canManage`.
    - «Visitas y ofertas» y «Expediente» aparecen solo con `canSeeDeal`.
- **Bandeja:**
  - Las pestañas pasan a ser «Personales» e «Inmobiliarias», con el número de mensajes sin leer.
  - En «Inmobiliarias», el cliente ve solo sus conversaciones, sin píldoras.
  - Quien es del equipo ve las píldoras «Mis consultas» y el nombre de su inmobiliaria.
  - En la píldora de la inmobiliaria: primero «Chat del equipo». Después, cada conversación con el nombre del cliente, la vivienda, el último mensaje, la hora, los mensajes sin leer y la etiqueta «Sin responsable» si está en la cola.
  - Para el cliente, cada fila lleva `AgencyMark` y el nombre de la inmobiliaria.
- **Ficha:** si hay una sola inmobiliaria, no hay contacto personal y no se llega por un enlace, «Contactar» abre el chat directamente.

## 6. Avisos (parte 3)

Migración `20261017000400_agency_chat_notifications.sql`.

- **Categoría nueva `agency_message`** en `kh_private.notifications`.
  - La forma se guarda en `agency_target {route, agencyId, dealId}`.
  - `route` puede ser `buyer_conversation` (cliente), `agency_conversation` (equipo) o `team_chat`.
  - `dealId` es el id de la conversación, o `null` en `team_chat`.
  - Además se guardan `agency_id` y una clave de chat para agrupar.
- **Queda fuera de la campana:** `notification_in_bell` la excluye, como hace con `message`. La 0.1.29 no la ve en su lista.
- **Destinatarios:** los calculan triggers `after insert` en `agency_messages` y en `agency_team_messages`.
  - Si escribe el cliente: el responsable y las personas que atienden. Si no hay nadie, todos los coordinadores y administradores que pueden contactar.
  - Si escribe el equipo: el cliente.
  - En el chat interno: todos los miembros activos menos quien escribe.
  - Se excluye a quien escribió, a quien tiene un bloqueo con el autor y a quien tiene apagada la preferencia «Mensajes».
  - Los destinatarios se bloquean ordenados con `notification_recipient_lock`.
- **`notification_visible`** vuelve a comprobar el acceso actual.
- **Push:**
  - `push_enqueue` y `push_eligible` exigen `push_devices.supports_agency_chat`, una columna nueva que se registra con `supportsAgencyChat: true` en `kh_register_push_device`.
  - `push_payload` dice «Tienes un nuevo mensaje.» y usa `tag`/`collapseId` `kh-chat-<clave>`, así que el teléfono reemplaza el aviso anterior del mismo chat.
- **Lectura:** al leer una conversación o el chat interno, se marcan como leídos los avisos `agency_message` de ese chat para esa persona.
- **`kh_resolve_push_notification`** devuelve `agencyTarget` también para esta categoría.
- **App:**
  - La navegación añade `agency_conversation` (`/agency-conversation/<id>?agencyId=…`) y `team_chat` (`/agency-team-chat`).
  - El registro de push envía `supportsAgencyChat`.

## 7. Conversaciones existentes

- No se copian datos: las conversaciones y los mensajes siguen igual.
- Tras la parte 2, administradores y coordinadores pueden responder en todas las conversaciones.
- Los gestores conservan las que tenían asignadas.
- No se envían avisos de mensajes antiguos.
- El chat interno empieza vacío.

## 8. Pruebas

- Una suite SQL por migración (`supabase/tests/agency_team_chat.sql`, `agency_client_chat.sql` y `agency_chat_notifications.sql`), con ids sintéticos `61…`, `62…` y `63…`. Comisiones usa `51…`.
- Antes de pedir que se apliquen, se ejecutan en seco con `node scripts/apply-reviewed-migration.mjs <version>_<name>`.
- Pruebas de TypeScript con `node:test` para la decodificación y los repositorios.
- `npm run check` en verde en cada parte.

## 9. Despliegue

Las migraciones se aplican en producción solo con el «sí» del usuario para cada una (`--commit`). La APK 0.1.30 y la web se publican aparte, también con su aprobación. El orden es partes 1, 2 y 3. La app nueva debe tolerar que la parte siguiente aún no esté aplicada:

- Hasta que se aplique la parte 2, el chat interno se ve en la bandeja de hoy.
- Si se aplica la parte 1 y no la parte 3, el chat interno funciona sin avisos.
