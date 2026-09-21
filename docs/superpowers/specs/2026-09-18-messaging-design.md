# Mensajes dentro de KarmaHouse

El usuario autorizó continuar con el primer bloque: Contactar, chat por vivienda con historial y reintentos, bandeja, no leídos, bloqueo y reportes. Visitas y ofertas quedan para otra entrega. Mantener mapas, anuncios y cuatro pestañas actuales. Expo57 leído antes de escribir código. No commits ni cambios de roles administrativos.

## Recorrido

Contactar requiere una cuenta. Regresa al anuncio después del acceso y permite abrir una conversación única por vivienda/comprador/vendedor. No hay contacto consigo mismo ni con anuncios que no estén aprobados y activos. Mostrar conversaciones desde Mi espacio y un botón de mensajes en Explorar; indicadores de no leídos en esos accesos y en la pestaña Mi espacio, sin quinta pestaña.

Chat de texto de 1 a 2000 caracteres, sin adjuntos en este bloque. Historial paginado en lotes de 50. Estados Enviando/Enviado/No enviado y reintento manual con el mismo identificador. Persistir la bandeja de salida por cuenta antes de transmitir; no reenviar automáticamente al iniciar sesión o recuperar conexión. Reconciliar un mensaje recibido del servidor aunque se hubiera perdido su respuesta. Mantener el texto no enviado ante fallos y cambios de pantalla; nunca enviarlo bajo otra cuenta.

La bandeja se actualiza al entrar, al volver al primer plano y cada 15 segundos con la app activa; el chat abierto, cada 5 segundos. No son notificaciones push ni se promete recibir alertas con la app cerrada. Mostrar fallo de sincronización y botón de reintento; conservar el historial ya cargado. Solo marcar leído hasta la secuencia recibida y visible al final del chat, no mensajes posteriores que lleguen durante la petición.

Bloquear actúa sobre la otra cuenta en ambos sentidos y en todas sus conversaciones con quien bloquea. Conserva el historial y permite desbloquear solo el bloqueo propio. La ficha de chat informa si no se pueden enviar mensajes, también si el anuncio pasa a no disponible. Reportar permite Spam, Posible fraude, Acoso u Otro, con comentario opcional, y se confirma solo cuando el servidor lo conserva. Los administradores revisan una cola de reportes con contexto real capturado por el servidor; no reciben acceso general a conversaciones privadas.

## Modelo compartido (src/messaging/types.ts)

```ts
export interface ChatMessage { id: string; conversationId: string; seq: number; clientMessageId: string; senderId: string; body: string; createdAt: string }
export interface Conversation { id: string; propertyId: string; propertyTitle: string; propertyLocation: string; buyerId: string; sellerId: string; otherUserId: string; otherName: string; lastMessage: string | null; lastMessageAt: string | null; lastSeq: number; unreadCount: number; blockedByMe: boolean; blockedByOther: boolean; canSend: boolean; propertyAvailable: boolean; createdAt: string }
export type ReportReason = 'spam' | 'fraud' | 'harassment' | 'other';
export interface ChatReport { id: string; conversationId: string; propertyTitle: string; reporterId: string; reportedUserId: string; reason: ReportReason; details: string; status: 'open' | 'reviewed'; createdAt: string; reviewNote: string | null; context: ChatMessage[] }
export interface PendingMessage { clientMessageId: string; conversationId: string; senderId: string; body: string; createdAt: string; status: 'sending' | 'failed'; error?: string }
export interface ConversationHistory { messages: ChatMessage[]; hasMore: boolean; loading: boolean; error: string | null }
```

No exponer correos, tokens ni teléfonos de otros usuarios. Nombre público solo para participantes. Títulos/zonas del anuncio se guardan como instantánea al iniciar el chat para no mostrar futuras ediciones privadas. Las miniaturas no son necesarias en la bandeja; usar icono de vivienda.

## RPC y seguridad

Tablas nuevas `kh_conversations`, `kh_messages`, `kh_conversation_reads`, `kh_user_blocks`, `kh_message_reports`; no reescribir migraciones aplicadas. RLS habilitada. Anónimos/terceros sin acceso a conversaciones o mensajes; ningún rol cliente puede escribir tablas directamente. Administración puede leer reportes y su contexto, no todos los mensajes. Usar membresía real `kh_admins` mediante `kh_is_admin`, nunca metadatos editables.

Todas las RPC reciben `p_actor_id uuid` obligatorio y verifican que coincide con `auth.uid()`; impide que una petición retenida del cliente anterior escriba bajo la nueva sesión. Mutaciones security definer con search_path vacío, comprobación de participante, entradas limitadas y permisos EXECUTE explícitos solo authenticated.

RPC devuelven JSON con nombres camelCase del contrato compartido:

- `kh_start_conversation(p_property_id,p_actor_id)` → Conversation. Idempotente unique(property_id,buyer_id,seller_id). El vendedor de una conversación existente ve la bandeja, no crea una conversación consigo mismo.
- `kh_list_conversations(p_actor_id,p_offset default0,p_limit default50)` → Conversation[]. Incluir solo conversaciones propias, ordenar por última actividad e id. El vendedor ve conversaciones con mensajes; el comprador también su conversación vacía. Repository carga páginas hasta final.
- `kh_get_conversation(p_conversation_id,p_actor_id)` → Conversation.
- `kh_list_messages(p_conversation_id,p_actor_id,p_before_seq defaultnull,p_limit default50)` → ChatMessage[]. Últimos50 o anteriores al cursor exclusivo; respuesta en orden ascendente.
- `kh_send_message(p_conversation_id,p_client_message_id,p_body,p_actor_id)` → ChatMessage. UUID estable por envío; unique(sender_id,client_message_id). Repetir mismo cuerpo/conversación devuelve la confirmación; cambiar payload con el mismo ID se rechaza. Bloqueo de fila incrementa secuencia por conversación para ordenar y marcar leídos. La deduplicación de un envío ya aceptado precede al rechazo por bloqueo/disponibilidad posterior.
- `kh_find_sent_messages(p_client_message_ids,p_actor_id)` → ChatMessage[]. Hasta50 UUID; solo mensajes enviados por ese actor, permite reconciliar respuestas perdidas aunque hayan salido de la página reciente.
- `kh_mark_conversation_read(p_conversation_id,p_last_seq,p_actor_id)` → void. Solo propio, monotónico, acotado al último seq real. No cuenta mensajes del propio usuario como no leídos.
- `kh_set_user_block(p_other_user_id,p_blocked,p_actor_id)` → void. Requiere conversación compartida; efecto de bloqueo serializado con nuevos envíos entre la pareja.
- `kh_report_conversation(p_conversation_id,p_client_report_id,p_reason,p_details,p_actor_id)` → UUID. Identificador de reintento estable, motivo válido, comentario máximo1000. Captura hasta20 mensajes reales recientes en contexto ordenado, no evidencia aportada por cliente. No duplica al reintentar; rechaza mismoID conotrocontenido.
- `kh_list_message_reports(p_actor_id,p_status default'open',p_offset default0,p_limit default50)` → ChatReport[]. Solo admin. Cola paginada.
- `kh_review_message_report(p_report_id,p_note,p_actor_id)` → void. Solo admin ajeno a las partes, nota máximo1000; marcar revisado, sin borrar evidencia.

Frenar abuso inicial en servidor: máximo20 conversaciones nuevas/día por comprador, 20 mensajes/minuto y300/hora por remitente, 10 reportes/día. Reintentos idempotentes no consumen otro cupo. Los errores se traducen a español sin reflejar detalles del proveedor. Tests con cuentas sintéticas, no mensajes a personas reales.

## Contrato cliente/UI

`src/messaging/MessagingProvider.tsx` exporta `MessagingProvider`, `useMessaging`. Contexto:

```ts
interface MessagingContextValue {
  available: boolean; ready: boolean; userId: string | null; conversations: Conversation[];
  unreadCount: number; error: string | null; pending: PendingMessage[];
  histories: Record<string, ConversationHistory>;
  refresh(): Promise<void>;
  startConversation(propertyId: string): Promise<string>;
  openConversation(id: string): Promise<void>;
  loadOlder(id: string): Promise<void>;
  sendMessage(id: string, body: string): Promise<void>;
  retryMessage(clientMessageId: string): Promise<void>;
  discardMessage(clientMessageId: string): Promise<void>;
  markRead(id: string, lastSeq: number): Promise<void>;
  setBlocked(id: string, blocked: boolean): Promise<void>; // id de conversación
  reportConversation(id: string, reason: ReportReason, details: string, clientReportId: string): Promise<void>;
}
```

Provider/controller fuera de screens, pruebas sin runtime nativo. `src/messaging/repository.ts` exporta repositorio Supabase y mapea filas/errores con controles de sesión antes/después. Pantallas InboxScreen y ConversationScreen consumen solo contexto. IDs uuid generados con helper `createMessageId` exportado por `src/messaging/domain.ts` (crypto.randomUUID si disponible, alternativa compatible RN con aleatoriedad nativa o formato seguro; idempotencia, no secreto). Provider limpia estado y detiene peticiones al cambiar sesión; hidratación no restaura envíos en curso como envío automático. Persistencia AsyncStorage separada por usuario; fallo de lectura no permite sobrescribir cola desconocida. Mantener colas acotadas (máximo50 pendientes, 2000 caracteres cada uno), historial no se escribe en almacenamiento público compartido.

Cada petición captura JWT y actor antes de empezar; el repositorio usa Authorization explícita y AbortSignal para que una petición retenida nunca adopte credenciales de la siguiente cuenta. sendMessage resuelve tras encolar incluso si falla la red, dejando el pendiente fallido; solo rechaza validación o persistencia anterior al encolado. Así el composer no crea duplicados de un mensaje que ya está pendiente.

Rutas `/messages`, `/messages/[id]`, `/message-reports`. Auth safeReturnTo admite inbox y conversación exacta, no URLs externas. Root integra proveedor, Contactar, accesos/no leídos, revisión administrativa y versión/APK. Mensajería no disponible en demo: estado explicativo sin chats falsos.

## Verificación/entrega

Tests significativos: aislamiento, reintento sin duplicar, conflicto payload, sesión cambiante, cuenta con conversación compartida, outbox con fallo de lectura/escritura/ACK perdido, lectura concurrente, paginación, bloqueo/desbloqueo ambos sentidos, reportes/no acceso global admin, límites. SQL transaccional y REST real con limpieza de fixtures y hashes del catálogo existente. Navegador móvil/escritorio con dos cuentas sintéticas. TypeScript, exportaciones y APK nuevo con misma firma. Evidencia física e iOS se informa separada; no tiendas ni push configurados.
