# Visitas y ofertas: interfaz y estado

Implementación local del 20 de septiembre de 2026. Alcance de este informe: componentes, hook/controlador y pruebas del cliente. La aplicación SQL, fixtures remotos y revisión visual pertenecen al flujo del agente principal.

## Contratos

- `ConversationNegotiations({ conversation, userId, onChanged, onVisibilityChange? })`: acceso compacto bajo la vivienda, panel de propuestas e historial. Notifica visibilidad para suspender lectura del chat mientras lo cubre. Invoca `onChanged` después de un cambio confirmado por el servidor.
- `useNegotiations({ conversationId?, pendingOnly?, enabled? })`: expone items, ready, loading, loadingMore, mutating, hasMore, error, available, refresh, loadMore, create y respond. Consulta por páginas de 30. La conversación no consulta con su panel cerrado.
- `RequestsScreen`: Pendientes por defecto y Todas para conservar acceso a visitas aceptadas y el historial. Paginación de servidor, sin descargar todos los registros para filtrar.

## Comportamiento

- Visita para cualquiera de los participantes; oferta inicial para el comprador. Aceptar/rechazar/alternativa para el destinatario; retirar pendiente propia y cancelar aceptada según el dominio compartido.
- La disponibilidad actual de la conversación desactiva las respuestas nuevas inmediatamente. Retirada/cancelación se mantienen cuando corresponda, incluso con bloqueo o anuncio no disponible.
- Día y mes mediante selectores; hora/minutos juntos. Todos los valores se validan y muestran en hora de Cuba. Importe en USD y nota de hasta 500 caracteres. Sin dependencias nuevas ni escritura de fecha ISO por la persona.
- El primer envío valida y fija payload normalizado + UUID. Si falla, conserva ambos y ofrece reintentar exactamente ese envío, actualizar o editar de forma explícita. Un reintento de recibo no vuelve a validar que la fecha siga siendo futura.
- Borradores, intento, error y confirmación viven por encima del Modal, dentro de un padre aislado por cuenta y por propuesta. Sobreviven a cerrar/reabrir el panel y volver al historial durante esta pantalla. No se añadió persistencia a disco.
- Una alternativa cuyo original ya no esté pendiente tras actualizar se deshabilita con explicación; un intento incierto conserva la posibilidad de recuperar su recibo.
- No hay éxito optimista. Una respuesta confirmada se muestra inmediatamente; una resincronización posterior fallida conserva el resultado confirmado y muestra el error aparte. El original de una alternativa confirmada permanece como sustituido en el historial si esa resincronización falla.
- Actor/JWT capturados, abortado al desmontar o cambiar cuenta y época de sesión contra A→B→A. Lecturas antiguas no sobrescriben mutaciones nuevas. La actualización automática no interrumpe cargas lentas ni descarta páginas de historial ya cargadas.

## Comprobaciones locales

- Documentación Expo57 consultada antes del código: https://docs.expo.dev/versions/v57.0.0/.
- `tests/negotiations-controller.test.ts`: 12 pruebas — cambio de cuenta, respuestas tardías, paginación, reintento, ACK inmediato, recuperación, StrictMode, historial cargado, A→B→A, cargas lentas y original sustituido tras error de resincronización.
- `tests/negotiations-draft.test.ts`: 3 pruebas — restauración de campos/UUID al reabrir, aislamiento por propuesta/cuenta y descarte selectivo después de completar.
- Suite combinada con dominio/repositorio: ejecutada tras finalizar los cambios; ver resultado del flujo principal para el total global.
- TypeScript `tsc --noEmit`: sin errores.

La revisión de navegador móvil/escritorio y las pruebas entre comprador/vendedor quedan documentadas por el agente principal. Este trabajo no genera un APK ni demuestra uso en teléfono físico.
