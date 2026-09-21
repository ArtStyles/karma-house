# Messaging Implementation Plan

**Goal:** Completar el bloque de chat autorizado: contacto, historial, bandeja/no leídos, bloqueo y reportes.
**Architecture:** Subsistema de mensajes con RPC privadas, controller de sesión y outbox persistido; UI consume el contexto compartido.
**Tech Stack:** Expo57 / RN0.86 / Supabase PostgreSQL / AsyncStorage.
**Spec:** `docs/superpowers/specs/2026-09-18-messaging-design.md`.

## Restricciones

Conservar trabajo/datos previos y cuatro pestañas. No commits, roles nuevos, conversaciones con usuarios reales, correos, push ni visitas/ofertas. RPC verifican actor y participante. Leer Expo57 antes de código.

## 1. Servidor — agente SQL

Archivos: nueva migración `20260918000100_messaging.sql`, `supabase/tests/messaging.sql`, `scripts/apply-messaging.mjs`, `scripts/verify-messaging.mjs`.

- [x] Reproducir ausencia del subsistema con pruebas; implementar tablas/RLS/RPC exactas del contrato.
- [x] Verificar deduplicación, cursor, lectura propia, bloqueo y reportes en SQL con rollback, incluyendo intentos desde tercero/anónimo/admin no participante.
- [x] Aplicar aditivamente con checksum/inventario/hashes; comprobar que catálogo y roles existentes no cambian.
- [x] Verificar por REST con usuarios sintéticos y limpiar todos sus mensajes/reportes/fotos/perfiles.

## 2. Cliente — agente controller

Archivos: `src/messaging/types.ts`, `domain.ts`, `repository.ts`, `controller.ts`, `MessagingProvider.tsx`, pruebas `tests/messaging*.test.ts`.

- [x] Tests rojos de envío/idempotencia/outbox/sesión/paginación/lectura y validación.
- [x] Implementar tipos y funciones exactos de la especificación, mapeo RPC y errores españoles.
- [x] Persistir antes de transmitir; conservar ID al reintentar; bloquear escritura tras hidratación fallida; limpiar UI en cambios de sesión.
- [x] Mantener sincronización solo primer plano y no leídos reales; ejecutar tests del subsistema.

## 3. Pantallas — agente UI

Archivos: `src/screens/InboxScreen.tsx`, `ConversationScreen.tsx`, componentes bajo `src/components/messaging`, rutas messages.

- [x] Bandeja y chat con contexto de vivienda, historial/anteriores, composer accesible/teclado, enviado/fallo/reintento/descartar.
- [x] Conservar texto del composer ante fallo previo a encolar; evitar duplicar mensaje pendiente al reintentar.
- [x] Marcar leído solo al mostrar final, impedir nuevos envíos cuando no disponible/bloqueado, conservar consulta de historial.
- [x] Opciones bloquear/desbloquear/reportar con texto explicativo, confirmación de producto y éxito solo tras guardar.
- [x] Revisar tipos y experiencia móvil; no tocar integración de Root/Detail/Profile/Explore.

## 4. Integración — root

Archivos: rootlayout, DetailScreen, ProfileScreen, ExploreScreen, tablayout, authcallback, MessageReportsScreen/ruta, app/package.

- [x] Integrar proveedor, Contactar/login, accesos a bandeja y badges no leídos; mantener cuatro pestañas.
- [x] Cola administrativa con contexto auténtico del reporte y revisión; sin acceso general a chat privado.
- [x] Revisión independiente de seguridad y contratos; pruebas finales, migración verificada y QA entre usuarios sintéticos.
- [x] Exportar, compilar/verificar APK con firma existente y copiar a Descargas; documentar evidencias/límites y limpiar herramientas de QA.
