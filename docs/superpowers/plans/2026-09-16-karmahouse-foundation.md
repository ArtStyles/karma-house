# KarmaHouse Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Entregar el primer recorrido móvil navegable de KarmaHouse con persistencia local.

**Architecture:** Expo Router separa rutas de pantallas. Reglas puras de anuncios y un contexto persistido desacoplan datos e interfaz. La versión web permite revisar los mismos componentes React Native.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, AsyncStorage, Expo Router.

**Spec:** docs/superpowers/specs/2026-09-16-karmahouse-foundation-design.md

## Global Constraints

- Compras y ventas en Cuba; interfaz en español; USD es moneda de demostración.
- Android e iPhone desde la base; ninguna publicación remota en esta entrega.
- Datos ficticios y anuncios locales identificados claramente.
- No convertir exportación JavaScript o navegador en evidencia de ejecución física.

### Task 1: Catálogo y persistencia

**Files:** src/domain/listings.ts, src/domain/demo.ts, src/state/MarketplaceProvider.tsx, tests/listings.test.ts.

**Interfaces:** export Listing, ListingDraft, ListingFilters, ListingStatus. Listing contiene id, title, location, province, price, bedrooms, bathrooms, area, type ('Casa' | 'Apartamento'), description, amenities: string[], imageKey ('vedado' | 'interior' | 'terrace'), photoUri?: string, owner ('demo' | 'local'), status ('active' | 'paused' | 'sold'), createdAt. ListingDraft usa cadenas para los campos numéricos; province y location son cadenas. ListingFilters: query:string, type:'Todas' | 'Casa' | 'Apartamento', maxPrice:string, minBedrooms:number, sort:'recent' | 'price-asc'.

Produce useMarketplace(): { ready, storageError, listings, favoriteIds, toggleFavorite(id), saveListing(draft, existingId?): Promise<string>, setStatus(id,status): Promise<void> }. Métodos async resuelven solo tras persistir; la UI captura errores. saveListing valida y solo permite editar anuncios locales. Genera id estable, no derivado del título.

- [x] Crear pruebas de búsqueda por tildes, filtros combinados, exclusión de inactivos, validación numérica, edición con id estable y lectura de esquema corrupto. Ejecutar `node --experimental-strip-types --test tests/*.test.ts` antes de implementar.
- [x] Implementar funciones puras y fixtures de viviendas con datos inequívocamente ficticios.
- [x] Implementar proveedor con AsyncStorage, hidratación bloqueante y mutaciones serializadas.
- [x] Ejecutar pruebas y registrar evidencia. El controlador revisa e integra.

### Task 2: Recorrido y apariencia

**Files:** src/app/_layout.tsx, src/app/(tabs)/*, src/app/property/[id].tsx, src/app/my-listings.tsx, src/app/edit/[id].tsx, src/components/*, src/screens/*, src/theme.ts, app.json, package.json.

Consume useMarketplace() y tipos de Task 1. Produce Explorar, Detalle, Favoritos, Publicar y Mis anuncios navegables. La interfaz representa loading, error y vacío. El formulario pide título, tipo, zona, provincia, precio, habitaciones, baños, superficie, descripción y extras. Reutiliza el mismo formulario para edición.

- [x] Configurar Router y bibliotecas mediante `npx expo install` para las versiones compatibles.
- [x] Construir navegación accesible y componentes visuales compartidos.
- [x] Implementar pantallas y enlazar acciones locales; las funciones futuras solo se explican, no se simulan como remotas.
- [x] Integrar imagen ficticia local y documentar procedencia.
- [x] Ejecutar typecheck y exportaciones; recorrer los flujos en navegador de tamaño móvil y escritorio.

### Task 3: Revisión y entrega

**Files:** README.md, docs/verification.md, correcciones en archivos afectados.

- [x] Revisor independiente contrasta requisitos y código; resolver hallazgos relevantes.
- [x] Verificar filtro, favorito tras recarga, publicación, edición, pausa y vendido.
- [x] Ejecutar `npm run typecheck`, `npm test` y exportar tres plataformas.
- [x] Documentar resultados y comandos para Expo Go/dev build; abrir preview local en Codex.

## Decisiones de ejecución

Se trabaja en el espacio vacío que el usuario designó. El scaffold inicializó Git; se utiliza rama `codex/karmahouse-foundation`. El diseño y la tecnología ya se aprobaron en conversación, por lo que no se repite una solicitud de permiso para el mismo alcance.
