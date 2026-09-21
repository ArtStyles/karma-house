# Cliente de mensajes — 18 de septiembre de 2026

Implementación en `src/messaging/types.ts`, `domain.ts`, `repository.ts`, `controller.ts` y `MessagingProvider.tsx`. Conserva el contrato de `docs/superpowers/specs/2026-09-18-messaging-design.md`.

## Comportamiento

- Bandeja privada, historial y pendientes aislados por usuario. La identidad nueva oculta el estado anterior antes del siguiente pintado; cambio de cuenta cancela peticiones y descarta continuaciones de la generación anterior.
- Cada petición recibe el actor y JWT capturados, usa Authorization explícita y AbortSignal, y pasa `p_actor_id` al RPC. La renovación del token de la misma cuenta no vacía la conversación.
- UUID mediante `expo-crypto` en la aplicación y dominio puro inyectable para pruebas. No se persisten tokens en mensajes, borradores o historial.
- Cola AsyncStorage con clave por cuenta, máximo 50 pendientes. Se lee y valida antes de escribir. Cada envío se conserva antes de transmitir; un fallo previo al encolado rechaza para que el editor mantenga su texto.
- Una vez encolado, `sendMessage` resuelve. El intento de red queda representado por Enviando/No enviado. Solo Enviar y Reintentar disparan transmisiones; hidratar, reabrir, iniciar sesión y recuperar conexión no envían pendientes automáticamente.
- Reintento con el UUID, conversación y cuerpo originales. Los recibos del servidor reconcilian respuestas perdidas fuera de la página reciente. Una confirmación no se convierte en error de envío por fallar su limpieza local; la siguiente sincronización reintenta únicamente esa limpieza.
- Historial paginado por secuencia exclusiva. Se conserva una ventana contigua: un ACK aislado no puede ocultar huecos ni declarar completo el historial. Los mensajes anteriores siguen accesibles mediante su cursor.
- Marca de lectura acotada a una secuencia recibida y existente; no adelanta la lectura por mensajes que lleguen durante la petición. La metadata tardía de lectura no revierte un bloqueo posterior confirmado.
- Provider actualiza bandeja al volver a primer plano y cada 15 segundos activo. Una misma carga de bandeja no se solapa consigo misma. La pantalla mantiene la actualización de conversación cada 5 segundos. No hay push ni envío en segundo plano.
- Respuestas del servidor validadas sin introducir requisitos de UUID que PostgreSQL no exige ni transformar textos legítimos recibidos. Los errores del proveedor se traducen sin reflejar detalles internos.

## Evidencia automatizada

Comandos ejecutados con Node 24 del runtime local:

```text
node --experimental-strip-types --test tests/messaging-*.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Resultado: **22 pruebas pasan; TypeScript sin errores**.

`tests/messaging-controller.test.ts` — 16 casos:

- Persistencia antes del transporte y contrato del editor tras fallo de red.
- Fallo de escritura anterior al envío: ninguna transmisión.
- Fallo de lectura: estado listo con error, sin sobrescribir datos desconocidos, y recuperación manual.
- Respuesta perdida reconciliada sin retransmitir.
- Reintento con mismo UUID y una sola burbuja.
- Cancelación y ausencia de publicación tardía al cambiar cuenta.
- Cambio de cuenta durante persistencia: sin transmitir bajo la cuenta nueva.
- Paginación anterior y actualización reciente sin perder páginas contiguas.
- Lectura concurrente limitada a la secuencia visible capturada.
- Recuperación de limpieza local fallida después de confirmación remota.
- Dos envíos simultáneos conservados antes del transporte serializado.
- Mensaje encolado de la cuenta anterior cancelado antes de transmitirse.
- ACK futuro con hueco: paginación recupera todas las secuencias intermedias.
- Recibo antiguo: reconcilia pendientes sin crear un hueco al inicio del historial reciente.
- Metadata de lectura tardía no deshace un bloqueo confirmado.
- Rechazo del pendiente número 51 antes de almacenamiento o red.

`tests/messaging-domain.test.ts` — 3 casos: recuperación y propietario de outbox, validación del texto, identidad de confirmación y fusión sin duplicados.

`tests/messaging-repository.test.ts` — 3 casos con el query builder Supabase real y transporte controlado: JWT/actor capturados y páginas de bandeja, sesión invalidada antes del transporte, y recepción de 1500 emojis con saltos de línea y UUID válido para PostgreSQL sin variante RFC obligatoria.

Los fallos iniciales de las pruebas se observaron antes de implementar sus correcciones, incluidos los huecos de historial, la limpieza pendiente del ACK y la carrera de lectura/bloqueo.

## Límites de esta evidencia

Estas pruebas ejercitan lógica cliente y transporte controlado; no sustituyen la verificación SQL/REST, la interacción del navegador, el APK o un teléfono físico. Esas comprobaciones se coordinan en la tarea principal. El historial confirmado permanece en memoria de la sesión; solo la cola pendiente se guarda localmente por usuario. Los borradores del editor tienen su propia persistencia, probada por la integración de pantallas.
