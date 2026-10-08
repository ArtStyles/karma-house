# Administration Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implementar el diseño aprobado de administración, recarga y agencia principal.

**Architecture:** Consultas administrativas paginadas y filtradas en servidor con contratos propios. Componentes comunes para búsqueda, filtros, badges, tarjetas y paginación; acciones existentes conservan sus validaciones. Una relación protegida identifica la inmobiliaria principal y mantiene separados los permisos globales y empresariales.

**Tech Stack:** Expo ~57.0.23, React Native 0.86.3, TypeScript 6, Supabase PostgreSQL, Node test.

**Spec:** `docs/superpowers/specs/2026-10-08-administration-redesign-design.md`.

## Global Constraints

- Leer https://docs.expo.dev/versions/v57.0.0/ antes de escribir código; leído en esta sesión.
- Cambios locales en worktree; sin migraciones de producción ni publicación.
- Preservar identidad privada, roles, autorizaciones y borradores existentes.
- Paginación de 20, filtros antes de paginar, respuestas ligadas a sesión y consulta.
- No inventar datos comerciales ni trasladar viviendas personales a la agencia.

## Review Focus

- Cambiar cuenta o filtros durante una recarga no debe mostrar datos anteriores.
- Fallos de recarga deben conservar el último resultado y la página vigente.
- Totales y filtros deben incluir toda la consulta autorizada, no solo la página visible.
- La agencia principal debe ser única y no editable por metadatos de miembros o agencias ajenas.
- Formularios y conversaciones deben conservar borradores y posición durante la recarga.

### Task 1: Principal agency authority and presentation

**Files:** Nueva migración `20261008000100_principal_agency.sql`, `supabase/tests/principal_agency.sql`, contratos `src/agencies/*`, `src/components/agencies/AgencyVerifiedBadge.tsx`, proyección `web/api/agency.ts` y tests relacionados.

**Interfaces:** Produce `AgencySummary.isPrincipal?: boolean`, distintivo `AgencyVerifiedBadge({verified, agencyName, principal?, labelled?})` y configuración protegida del propietario. Campo ausente se interpreta como falso para despliegue progresivo.

- [x] Escribir y ejecutar pruebas que rechacen falsificación de la identidad principal y distingan los sellos.
- [x] Añadir bootstrap seguro, membresía del propietario, proyección pública mínima y perfil incompleto configurable sin datos inventados.
- [x] Ejecutar pruebas de identidad, perfil público y SQL sintético con rollback cuando haya runtime local.

### Task 2: Server-side administration queries

**Files:** Nueva migración `20261008000200_administration_queries.sql`, `src/admin/queries.ts`, tests de consultas y `supabase/tests/administration_queries.sql`.

**Interfaces:** Produce `kh_admin_query(p_actor_id, p_section, p_query, p_filters, p_offset, p_limit, p_sort)` con `{items,total,hasMore}`. Secciones: `review`, `accounts`, `listings`, `history`, `propertyReports`, `messageReports`, `agencies`, `assistedCollaborators`, `assistedListings`; filas conservan la forma de los repositorios actuales. `p_filters` puede incluir `collaboratorId` para anuncios asistidos y `source` para reportes de chat. Produce constantes/decodificadores/argumentos en queries.ts y documenta forma exacta por sección.

- [x] Escribir y ejecutar tests RED de filtros válidos, offset múltiplo de 20, decodificación y totales.
- [x] Implementar filtros sobre toda la consulta autorizada, conteo y orden estable antes de limit/offset; evitar exponer datos privados adicionales.
- [x] Ejecutar tests GREEN y SQL de autorización/orden/paginación cuando sea posible.

### Task 3: Pull-to-refresh in consultation screens

**Files:** `src/screens/ProfileScreen.tsx`, pantallas `Agency*` excepto Reviews y Workspace (propiedad de Task 4), `MyListingsScreen.tsx`, `InboxScreen.tsx`, `ListingTransfersScreen.tsx`, `ListingTransferScreen.tsx`, `NotificationsScreen.tsx`, `AccountSettingsScreen.tsx`, helpers de recarga y tests de comportamiento.

**Interfaces:** Consume promesas de carga existentes. Produce recarga sin botones visibles, con estado controlado y exclusión mutua. Mi espacio usa identidad de Task 1; el acceso de administración y agencia será reorganizado por Task 4 tras entregar esta tarea.

- [x] Probar exclusión de recargas repetidas y descartes por contexto; no crear tests que solo copien CSS/markup.
- [x] Sustituir controles de actualización por gesto en consultas, incluyendo listas vacías; preservar edición, cancelación y autorizaciones.
- [x] Verificar typecheck y pruebas focalizadas; informar pantallas editadas para integración.

### Task 4: Approved administration UI and integration

**Files:** Componentes `src/components/admin/*`, hook `src/admin/useAdminQuery.ts`, `AdministrationScreen.tsx`, `AdminManagementScreen.tsx`, `AdminScreen.tsx`, reportes, `AgencyReviewsScreen.tsx`, `AssistedListingsScreen.tsx`, `AgencyWorkspaceScreen.tsx`, integración final de Mi espacio, fixtures y documentación de verificación.

**Interfaces:** Consume Task 1 distintivos y Task 2 consultas. Paginación/filtros tienen una fuente de estado y descartan respuestas antiguas. Conserva repositorios existentes para las mutaciones.

- [x] Probar controlador de consultas: sesión cambiante, filtro nuevo, refresh con error, resultados vacíos y página retirada.
- [x] Implementar componentes y pantallas del diseño aprobado con consultas reales.
- [x] Ejecutar suite completa, export web, revisión visual a 360/desktop y revisión independiente final; corregir hallazgos materiales.
- [x] Registrar resultados y limitaciones, conservar cambios revisables en rama aislada; no desplegar sin solicitud.

## Resultado de ejecución

Implementación y revisión terminadas. Suite: 657 pruebas, 655 correctas, 2 omitidas, 0 fallos; typecheck y export web/Android/iOS correctos. Ambas suites SQL ejecutadas con rollback en PostgreSQL 17. Revisión visual a 360 × 800, 1280 × 900 y modo oscuro, y revisión independiente de permisos/navegación completadas. Ver ../administration-redesign-verification.md para evidencias y límites.
