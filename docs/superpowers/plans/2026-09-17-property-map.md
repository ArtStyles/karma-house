# Property Map Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent tasks below.

**Goal:** Publicar una ubicación elegida por el vendedor y explorar las viviendas en un mapa KarmaHouse.

**Architecture:** Mantener los repositorios actuales y extender el anuncio con una posición pública opcional. Adaptadores de MapLibre nativo/web comparten contrato; formulario, lista y ficha consumen el mismo modelo. Migración SQL aditiva protege normalización, moderación e idempotencia.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, MapLibre Native/GL JS, OpenFreeMap y Supabase.

**Spec:** `docs/superpowers/specs/2026-09-17-property-map-design.md`.

## Constraints

Conservar trabajo y datos actuales; no publicar en tiendas ni contratar servicios. Leer docs Expo 57 antes de código. No enviar claves privadas al cliente. No inventar coordenadas para anuncios. La posición aproximada se normaliza en el servidor. No reescribir migraciones aplicadas. No añadir una quinta pestaña.

## 1. Contrato de datos y base remota

Archivos: `src/domain/geo.ts`, `listings.ts`, `draftPersistence.ts`, `src/data/remoteMapping.ts`, `supabaseMarketplace.ts`, `src/state/marketplaceStore.ts`, migración SQL nueva, pruebas y herramienta de aplicación nueva.

- [x] Escribir y ejecutar pruebas que fallen para coordenadas inválidas, aproximación, retirada, clonación, persistencia y compatibilidad antigua.
- [x] Implementar contrato `mapLocation` de la especificación y verificar pruebas locales.
- [x] Extender RPC en migración nueva: normalización, null/omitido, reintentos y revisión. Probar aislamiento y confidencialidad en SQL.
- [x] Inventariar, aplicar y verificar remotamente con transacción/checksum; conservar datos existentes.

## 2. Adaptadores de mapa

Archivos: `src/components/maps/KarmaMap.types.ts`, `KarmaMap.tsx`, `KarmaMap.web.tsx`, configuración de estilo y atribución. Root instala dependencias y configura plugin Expo.

- [x] Comprobar estilos y cartografía de OpenFreeMap, atribuciones y compatibilidad nativa.
- [x] Implementar mapa con coordenadas, precios, selección, área aproximada, eventos, errores/reintento y controles accesibles.
- [x] Verificar exportación web/nativa y typecheck contra las APIs realmente instaladas.

## 3. Elegir ubicación

Archivos: `src/components/LocationPicker.tsx`, `ListingForm.tsx`, `src/screens/EditScreen.tsx`.

- [x] Integrar campo en primer paso, modal/selector, exacta/aproximada (predeterminada), confirmación/cancelación y retirada.
- [x] Conservar ubicación en revisión del formulario, cambios de pasos, borradores y edición.
- [x] Verificar el flujo móvil con interacción real y sin permisos GPS obligatorios.

## 4. Explorar y ficha

Archivos: `src/screens/ExploreScreen.tsx`, `DetailScreen.tsx`, componente `PropertyMap.tsx`.

- [x] Alternar Lista/Mapa manteniendo filtros y resaltar selección con tarjeta de propiedad.
- [x] Informar resultados sin punto y usar exclusivamente resultados filtrados públicos.
- [x] Añadir mapa y descripción de precisión a ficha; comprobar todos los estados vacíos y navegación.

## 5. Integración y entrega

- [x] Revisar cambios de cada agente y contratos de extremo a extremo; ejecutar TypeScript y pruebas pertinentes.
- [x] Verificar catálogo/selector/ficha y persistencia con demo local aislada; verificar API remota con cuentas temporales sin contactar personas ni importar demos.
- [x] Exportar plataformas, compilar APK con firma existente, verificar contenido/secretos/hash y copiar a Descargas.
- [x] Registrar proveedor, pruebas, límites físicos y pasos de actualización; entregar APK.
