# Ofertas y visitas como tarjetas del chat

24 de septiembre de 2026. Aprobado por el usuario (enfoque A).

## Problema

Cada propuesta y cada respuesta se guardan como un mensaje de texto («Oferta propuesta: 5500.00 USD.») y se ven como una burbuja más, con importes y fechas sin formato. Para aceptar, rechazar o cancelar hay que abrir la hoja «Visitas y ofertas», cuya tarjeta de entrada, junto a la de la vivienda, ocupa unos 140 pt sobre el hilo.

`kh_messages.negotiation_event_id` ya enlaza cada uno de esos mensajes con su evento en `kh_private.negotiation_events` (acción e instantánea de la propuesta), pero `chat_message_json` no lo expone.

## Diseño

### Servidor

Migración `20260924000100_chat_negotiation_cards.sql`: `create or replace` de `kh_private.chat_message_json(kh_messages)` para añadir `negotiation`: `null` en mensajes normales y, en los enlazados, `{ id, action, kind, createdBy, amountUsd, visitAt, note, parentId }` tomados del evento. Pasa de `immutable` a `stable` porque lee otra tabla. El cuerpo de texto no cambia: las versiones anteriores de la app y la vista previa de la bandeja siguen viendo el resumen.

### Cliente

- `ChatMessage.negotiation?: MessageNegotiation | null`, validado en `decodeChatMessage`.
- `src/negotiations/presentation.ts` (puro, probado): título de la tarjeta, valor formateado («$ 80.000 USD»; «sábado 27 de septiembre» + «10:30 · hora de Cuba»), estado con tono (pendiente, aceptada, rechazada, cancelada, reemplazada, caducada), aviso de caducidad de ofertas y texto del aviso centrado de cada respuesta.
- `ProposalCard`: propuesta (`action = 'created'`) alineada según su autor. Estado y botones vienen de la negociación viva en `useNegotiations` de la conversación, con `availableNegotiationActions`:
  - recibida y pendiente: Rechazar, Aceptar y enlace «Proponer otro importe» / «Proponer otra fecha», que abre el formulario existente precargado;
  - propia y pendiente: «Retirar propuesta»;
  - aceptada: «Cancelar acuerdo», con confirmación;
  - `canAct` falso: la tarjeta lo dice y solo permite cancelar.
  Si la negociación no está entre las cargadas, la tarjeta se muestra sin estado ni botones.
- `NegotiationNotice`: aceptar, rechazar o cancelar se muestra como una línea centrada («Enrique aceptó tu contraoferta de $ 85.000 · 11:20»).
- Mensajes sin enlace (anteriores a la columna) siguen como burbuja de texto.
- Conversación:
  - la vivienda pasa a subtítulo pulsable de la cabecera; se retiran su tarjeta y la de «Visitas y ofertas» (y con ellas la ocultación al escribir);
  - botón «+» junto al campo: abre la hoja de visitas y ofertas, que ya contiene «Proponer visita», «Hacer oferta» e historial;
  - `useNegotiations` queda activo mientras el chat está abierto (cada 15 s) y se refresca al llegar un mensaje enlazado nuevo; las acciones usan `useNegotiationMutations` y sus errores aparecen en la barra de avisos del chat;
  - «Enviado» se calcula solo sobre mensajes de texto propios.
- `ConversationNegotiations` deja de tener estado propio de apertura y de datos: recibe el store, las mutaciones y la petición de apertura (historial o formulario de un tipo, con o sin propuesta previa).

## Verificación

- Suite SQL `supabase/tests/chat_negotiation_cards.sql` en transacción revertida: mensaje normal con `negotiation` nulo; propuesta con acción `created`, tipo e importe; aceptación con acción `accepted` y el autor original.
- Pruebas de `decodeChatMessage` y de `presentation.ts`.
- `npm run check`; navegador con la sesión del usuario sin pulsar acciones sobre propuestas reales.
