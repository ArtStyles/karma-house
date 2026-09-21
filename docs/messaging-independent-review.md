# Revisión independiente de mensajería — 18 de septiembre de 2026

**Veredicto: sin hallazgos accionables pendientes en el alcance revisado.** Apto para continuar las comprobaciones de integración y del APK; este veredicto procede de revisión de código y reproducciones locales, no de una prueba física Android/iOS.

Se revisaron permisos de participante y administración, actor/JWT capturados, idempotencia, bloqueo entre cuentas, concurrencia de lectura, aislamiento al cambiar sesión, persistencia de salida y recorridos de conversación/reportes. Referencias principales: `supabase/migrations/20260918000100_messaging.sql:88`, `src/messaging/repository.ts:10`, `src/messaging/MessagingProvider.tsx:36`, `src/screens/ConversationScreen.tsx:87` y `src/screens/MessageReportsScreen.tsx:38`.

El hallazgo confirmado durante la revisión —un ACK aislado podía dejar mensajes intermedios inaccesibles y marcar el historial como completo— quedó corregido en `src/messaging/domain.ts:52`, `src/messaging/controller.ts:146` y `src/messaging/controller.ts:238`. La reproducción independiente original pasó tras la corrección: historial 1–10, ACK 101, actualización 52–101 y dos páginas anteriores recuperan exactamente 1–101. La protección adicional de `src/messaging/controller.ts:333` evita que una respuesta de lectura anterior deshaga en pantalla un bloqueo confirmado después.
