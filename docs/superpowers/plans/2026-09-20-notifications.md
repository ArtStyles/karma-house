# Centro de notificaciones Implementation Plan

**Goal:** Consultar y gestionar avisos privados de mensajes, visitas y ofertas dentro de KarmaHouse.
**Architecture:** Eventos de servidor ligados a mensajes/origen estructurado; RPCs privados por destinatario; controlador/proveedor de sesión y pantallas React Native.
**Tech Stack:** Expo57, React Native, TypeScript, Supabase PostgreSQL; sin dependencias nuevas.
**Spec:** docs/superpowers/specs/2026-09-20-notifications-design.md.

## Restricciones

Preservar todo el trabajo no confirmado por Git; no commit/reset/push. No editar migraciones ya aplicadas. Documentación exacta Expo57 consultada antes del código. Sin envíos externos, SDK push ni cron. SQL se prueba y revisa antes de aplicar; una sola ventana remota de escritura; fixtures exactos y limpieza verificada. No datos privados ni credenciales en logs.

## Tareas independientes

- [x] Datos (agente backend): crear `src/notifications/types.ts`, `domain.ts`, `repository.ts` y pruebas `tests/notifications-domain.test.ts`, `notifications-repository.test.ts`. Establecer contratos de la especificación, validar cursor/UUID/páginas/pertenencia y fijar JWT/actor/abort. Escribir pruebas que fallen, implementar y ejecutar hasta verde.
- [x] SQL (mismo agente): `supabase/migrations/20260920000400_notifications.sql`, `supabase/tests/notifications.sql`, `scripts/apply-notifications.mjs`, `verify-notifications.mjs`. Nueva migración introduce inbox/preferencias/origen explícito, conserva firmas de mensajes/negociaciones. Probar permisos, deduplicación, contexto, bloqueo, versiones, read-all corte y concurrencia; correr suites previas en rollback. Revisar checksum y aplicar solo tras coordinación de raíz.
- [x] Estado/UI (agente frontend): `src/notifications/controller.ts`, `NotificationsProvider.tsx`, hooks y `src/screens/NotificationsScreen.tsx`, `NotificationSettingsScreen.tsx`, componentes propios. Probar primero cambios de cuenta, lecturas tardías, cargas lentas, paginación, marcado y preferencias con fallo. Mantener contador propio y no alterar lecturas de chat. Exponer `useNotifications` a raíz.
- [x] Integración (raíz): rutas `/notifications` y `/notification-settings`, retornos de login permitidos y pruebas; proveedor en layout; campana/contador en Explorar; accesos desde Mi espacio, menú de cuenta y Ajustes. No introducir autorización ficticia para push.
- [x] Revisión y fixture (revisor): revisión independiente de contratos y código; script fixture acotado para navegador, ningún envío externo; coordinar la ventana remota con backend antes de crear o limpiar.
- [x] QA (raíz): flujo de mensajes y negociaciones, contador/lecturas/preferencias, cuenta ajena y bloqueo; inspección móvil/escritorio; logout/cleanup exactos, tsc+suite+exportación+secret scan. Documentar resultados reales y actualizar hoja de ruta.

## Pruebas mínimas que deben preceder al comportamiento

1. `list` rechaza recipientId de otra cuenta y no publica una respuesta cuyo contexto cambió.
2. Dos páginas con llegada nueva se combinan sin duplicados ni truncar historia.
3. `markAllRead(W)` conserva sin leer un aviso con secuencia posterior y falla sin publicar lectura si RPC rechaza.
4. Preferencias no cambian visualmente a guardadas antes de ACK; reintento idéntico no crea conflicto, escritura concurrente diferente sí.
5. Un mensaje normal con texto «Oferta propuesta» sigue siendo mensaje; un resumen estructurado genera exactamente un aviso de oferta.
6. Contraoferta genera un solo aviso, replay ninguno, y rollback por fallo de resumen tampoco deja aviso/evento parcial.
7. Bloqueo excluye la misma población en listado/contador/lectura y cancela avisos nuevos; el chat histórico permanece autorizado.
