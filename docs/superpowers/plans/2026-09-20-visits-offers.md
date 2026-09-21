# Visitas y ofertas Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the bounded tasks below. Preserve existing uncommitted work; do not commit or reset the workspace.

**Goal:** Gestionar visitas y ofertas estructuradas desde las conversaciones existentes.
**Architecture:** Módulo negotiations con dominio/repositorio tipados, hook de sesión y componentes reutilizables; RPCs transaccionales de Supabase con registros y recibos privados por participantes. Integración ligera en chat y bandeja, sin alterar envío de texto existente.
**Tech Stack:** React Native, Expo57, TypeScript, Supabase/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-09-20-visits-offers-design.md.

## Restricciones

Hora America/Havana, ofertas USD; conservar bloqueos, roles y moderación; preservar compatibilidad de mensajes antiguos; sin SDK/proveedor nuevo; foto/nombre y formularios anteriores intactos. Consultar documentación exacta Expo57 antes del código. Cambios de servidor se revisan y aplican secuencialmente; fixtures identificados y limpiados.

## Tareas

- [x] Dominio y repositorio: src/negotiations/types.ts, domain.ts, repository.ts; tests/negotiations-domain.test.ts y negotiations-repository.test.ts. Probar primero fechas, estados, permisos, formato y actor capturado, después implementar.
- [x] Servidor: supabase/migrations/20260920000300_negotiations.sql; scripts/apply-negotiations.mjs y verify-negotiations.mjs. Transacciones, fechas, alternativas, límites, concurrencia y recibos se comprueban antes de aplicar. Este agente no modifica UI.
- [x] UI y estado: src/negotiations/useNegotiations.ts, src/components/negotiations/*, src/screens/RequestsScreen.tsx. Hook con actor capturado, descarte tardío, paginación y recuperación de fallos. Componentes de propuesta, hoja de creación/respuesta y panel de conversación. Pruebas puras/controlador según comportamiento.
- [x] Integración raíz: ConversationScreen, InboxScreen, ruta /requests, retorno de autenticación; conservar lectura, borradores, bloqueos y actualización existente. Ajustes menores tras revisar contratos.
- [x] QA: revisor independiente y scripts de fixture acotado; aplicar solo tras revisión/prueba con rollback; probar como comprador y vendedor y limpiar. Verificar tsc, suite, exportaciones y navegador. Documentar lo realmente observado.

Resultado: 150 pruebas pasan; TypeScript y exportación Android/iOS/web correctos; servidor aplicado y concurrencia verificada; recorrido comprador/vendedor/tercero comprobado en navegador; fixtures eliminados con inventario previo intacto. Evidencia y límites: `docs/negotiations-verification.md`. No se generó APK ni se realizó prueba física.

## Propiedad y coordinación

Agente de datos controla dominio/repositorio/SQL. Agente de UI controla hook/componentes/RequestsScreen. Raíz controla integración y QA navegador. Revisor controla fixture y revisión independiente. Primero acordar firmas y enums del contrato de la especificación; comunicar cambios antes de cruzar interfaces.
