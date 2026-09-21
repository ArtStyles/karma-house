# Cloud Marketplace Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Scope and connection are authorized by the user's supplied project credentials.

**Goal:** Completar una primera entrega conectada con cuentas, anuncios revisados, fotos y favoritos.
**Architecture:** Supabase Auth/Postgres/Storage detrás de un proveedor remoto; UI actual conserva controles y recorridos.
**Tech Stack:** Expo 57, React Native, TypeScript, Supabase JS y PostgreSQL.
**Spec:** docs/superpowers/specs/2026-09-17-cloud-marketplace-design.md

## Global constraints

- Nunca incluir credenciales privadas en código, logs, bundle o Git.
- No importar ejemplos locales ni tocar datos ajenos.
- Distinguir evidencia local, remoto, correos y teléfonos físicos.

### 1. Base de datos
- [x] Migración con RLS, RPC de propietario/moderación, Storage privado e idempotencia.
- [x] Aplicar solo después de inventario vacío confirmado; verificar ledger y permisos reales.

### 2. Cuentas
- [x] Cliente público, sesión nativa persistente, perfil, auth/callback/recovery y límites entre cuentas.
- [x] Tests relevantes de parseo/persistencia, UI y sesión.

### 3. Catálogo remoto
- [x] Tipos compatibles, repositorio remoto, fotos y proveedor con protección frente a cambios de sesión.
- [x] Tests de mapeo y reintentos; conservar suite existente.

### 4. Integración y entrega
- [x] Adaptar UI/fotos/formularios/borrador/autorización; panel de revisión real.
- [x] Recorrido remoto con dos cuentas y administrador, fotos y accesos denegados.
- [x] Revisión independiente, typecheck/tests/exports y documentación final.

## Resultado

Implementación y pruebas completadas. Evidencia y límites: `docs/cloud-verification.md`. Confirmación de correo real, teléfonos físicos y lanzamiento público quedan para la siguiente etapa.
