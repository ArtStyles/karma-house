# Visitas y ofertas dentro del chat

El usuario priorizó explícitamente «Visitas y ofertas desde el chat» el 20 de septiembre de 2026. Este bloque implementa ese recorrido con la identidad visual actual y Supabase existente. No configura proveedores externos ni genera un APK.

## Recorrido

En una conversación se accede a Visitas y ofertas. Cualquiera de los dos participantes puede proponer una visita; la oferta inicial de compra la inicia el comprador. La persona que recibe una propuesta puede aceptar, rechazar o proponer otra fecha/importe. Quien propone puede retirar una propuesta pendiente. Una propuesta aceptada puede cancelarse por cualquiera de los dos; los valores anteriores y las alternativas permanecen en el historial. Aceptar una oferta registra una negociación, sin pago, contrato, reserva exclusiva ni cambio automático de disponibilidad.

La visita se introduce mediante día y hora y se muestra siempre con zona America/Havana. Se valida fecha real y futura, hasta 180 días. Las ofertas son USD, positivas, con hasta dos decimales y límite 1 000 000 000; caducan a los siete días si siguen pendientes. Una visita pendiente caduca a su hora de inicio. Una sola propuesta pendiente por clase y conversación; contraofertar sustituye la anterior de manera atómica. Las aceptadas conservan su resultado histórico, y una visita aceptada no caduca retroactivamente.

Una sección de solicitudes en la bandeja permite ver pendientes y consultar historial paginado. Los eventos de negociación generan texto de resumen en el chat de manera transaccional y compatible con clientes anteriores. El importe/fecha y estado autorizados provienen del registro estructurado, nunca de interpretar mensajes escritos por personas.

## Reglas y datos

Nuevo módulo negotiations separado del texto del chat. Solo comprador/vendedor de la conversación pueden leer; administradores no reciben acceso general. Servidor valida actor capturado, participantes, bloqueo, anuncio activo/aprobado y turno de respuesta. Una retirada/cancelación debe seguir siendo posible para limpiar compromisos cuando el anuncio deja de estar disponible o existe bloqueo; en ese caso se registra el estado sin crear un mensaje nuevo entre personas bloqueadas. Cancelar no permite editar nota/importe/fecha.

Las acciones llevan UUID idempotente y versión esperada. Repetir una acción tras perder la respuesta devuelve el recibo anterior; cambiar su contenido con el mismo UUID falla. Crear alternativa, actualizar original, conservar evento y añadir resumen se confirman juntos. Fallos mantienen formulario y UUID para reintento manual; cambios de cuenta abortan solicitudes y descartan respuestas antiguas. Listas y resúmenes usan paginación; no descargan todos los registros para filtrar pendientes.

## Contrato compartido

`NegotiationKind = 'visit' | 'offer'`; `NegotiationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'superseded' | 'expired'`.

`Negotiation`: id, conversationId, propertyId, propertyTitle, propertyLocation, buyerId, sellerId, createdBy, kind, status, version, amountUsd(number|null), visitDate(string|null YYYY-MM-DD), visitTime(string|null HH:mm), visitAt(string|null ISO), note, createdAt, updatedAt, parentId(string|null), expiresAt(string), canAct(boolean). El estado de pendientes vencidos se calcula coherentemente con reloj de servidor y se materializa al mutar cuando corresponda.

`CreateNegotiationInput`: conversationId, kind, clientRequestId, note, amountUsd?(string), visitDate?(string), visitTime?(string), replacesId?(string), expectedVersion?(number). `RespondNegotiationInput`: id, action('accept'|'decline'|'cancel'), expectedVersion, clientRequestId.

`NegotiationRepository`: list({conversationId?:string,pendingOnly?:boolean,offset:number}, context) -> Negotiation[]; create(input, context) -> Negotiation; respond(input, context) -> Negotiation. Context es MessagingRequestContext (actor/JWT/signal/checkpoint). Página 30, servidor máximo 50. RPCs kh_list_negotiations / kh_create_negotiation / kh_respond_negotiation con p_actor_id, p_payload para escrituras y parámetros p_conversation_id/p_pending_only/p_offset/p_limit para lectura.

## Verificación

Reglas de transición, decimales/fechas, aislamiento, cargas tardías, reintentos y conflicto de versiones con pruebas. SQL prueba primero en transacción revertida, revisión antes de aplicar, inventario previo/posterior. Dos cuentas de prueba para crear/aceptar/contraproponer/cancelar desde UI, y un tercero para denegación. Limpieza exacta de fixtures y conservación de datos existentes. Navegador móvil/escritorio, TypeScript, suite y export Android/iOS/web. Teléfono físico y push son evidencia separada.

## Próximas integraciones evaluadas

- Expo Push para avisos fuera de la app; necesita credenciales FCM/APNs y prueba de entrega en dispositivo: https://docs.expo.dev/push-notifications/push-notifications-setup/.
- Correo transaccional con SMTP propio y dominio para acceso/recuperación: https://supabase.com/docs/guides/auth/auth-smtp.
- Eventos privados de Supabase Realtime con resincronización después de reconectar: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.
- Catálogo paginado y filtrado por servidor antes de ampliar captación; seguimiento de errores con Sentry: https://docs.expo.dev/guides/using-sentry/.

Estas integraciones son siguientes etapas propuestas, no funciones entregadas en este bloque.
