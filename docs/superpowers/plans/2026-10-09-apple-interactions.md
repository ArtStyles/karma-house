# Apple-inspired interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar respuesta táctil consistente a Explorar y movimiento directo al panel de filtros sin modificar la búsqueda hasta aplicar.

**Architecture:** `MotionPressable` concentra la compresión y el retorno. `FilterSheet` concentra el modal y gestos; `CatalogFilters` conserva el formulario y su borrador. Geometría y cierre único se verifican sin depender de un motor gráfico.

**Tech Stack:** Expo 57, React Native 0.86, Reanimated 4.5.1, Gesture Handler 2.32, Worklets 0.10.1, TypeScript y node:test.

**Spec:** `docs/superpowers/specs/2026-10-09-apple-interactions-design.md`.

## Global Constraints

- Documentación versionada de Expo 57 leída antes de escribir código.
- Sin nuevas dependencias, hápticos, desenfoque ni cambios de negocio.
- Conservar Claro/Oscuro/Sistema, movimiento reducido y franja de cuatro tarjetas.
- Solo «Aplicar filtros» modifica el catálogo; una confirmación se ejecuta exactamente una vez.
- Diálogo centrado sin gesto desde 700 puntos; respetar teclado y safe areas.
- Preservar cambios ajenos; entregar localmente en `codex/apple-interactions`.

## Review Focus

- Una salida retomada con el dedo no puede cerrar después por un callback antiguo.
- Una confirmación repetida no puede aplicar dos veces ni un gesto cancelarla después de aplicarse.
- Arrastrar el formulario y escribir números no debe activar el cierre.
- Deshabilitar un botón durante su pulsación no deja su transformación comprimida.
- Cambiar tamaño o activar movimiento reducido durante la transición no deja un panel invisible o bloqueado.

## Task 1: Reglas de movimiento y respuesta táctil

**Files:** crear `src/components/filterSheetMotion.ts`, `tests/filter-sheet-motion.test.ts`; modificar `src/components/MotionPressable.tsx`; crear `tests/motion-pressable.test.ts`.

**Interfaces:** producir `filterSheetPosition(position, height)`, `shouldDismissFilterSheet(position, velocity, height)` y `createFilterDismissalGate(onClose)`; mantener `PressableProps` y añadir `pressedScale?: number`.

- [x] Escribir pruebas que distingan un arrastre corto, un lanzamiento hacia abajo, una reversión hacia arriba y datos inválidos. Probar cancelación de callbacks antiguos, cierre único y confirmación única.
- [x] Ejecutar las pruebas y comprobar el fallo antes de implementación.
- [x] Implementar las reglas con funciones compatibles con worklets.
- [x] Probar el componente real de pulsación con eventos rápidos, estado deshabilitado y movimiento reducido; implementar compresión corta y retorno con resorte amortiguado.
- [x] Ejecutar pruebas focalizadas y typecheck. Commit local de este bloque.

## Task 2: Panel de filtros y controles de Explorar

**Files:** crear `src/components/FilterSheet.tsx`, `tests/catalog-filter-sheet.test.ts`; modificar `CatalogFilters.tsx`, `PropertyCard.tsx`, `ExploreDiscovery.tsx`, `CatalogRefinements.tsx`, `CatalogSortMenu.tsx` y controles locales de `ExploreScreen.tsx`.

**Interfaces:** consumir reglas del bloque 1; `FilterSheet({ onClose, children })`, con `children(close)` y `close(commit?)` para aplicar o descartar. Root de Gesture Handler dentro del Modal, zona de agarre independiente y transformaciones/opacidad en el hilo UI.

- [x] Probar el formulario real: editar y cancelar no aplica; aplicar una vez transmite el borrador; un rango inválido no confirma.
- [x] Verificar fallo antes de sustituir el contenedor.
- [x] Implementar entrada, seguimiento del dedo, salida interrumpible, fundido reducido/escritorio y cancelación segura al desmontar.
- [x] Integrar la respuesta táctil en Explorar sin cambiar acciones, carga de fotos ni filtros.
- [x] Ejecutar pruebas focalizadas y typecheck. Commit local de este bloque.

## Task 3: Boceto y verificación visual

**Files:** boceto en la carpeta de visualizaciones de este chat; crear `docs/apple-interactions-verification.md`.

- [x] Crear un boceto interactivo de pulsaciones y filtros, respetando el aspecto existente y movimiento reducido.
- [x] Exportar Expo para Android/web y probar la aplicación real en navegador móvil y escritorio, incluyendo cierre sin aplicar, aplicación, gesto y teclado web.
- [x] Ejecutar toda la suite y comparar con los tres fallos de base, sin omitirlos.
- [x] Solicitar una revisión independiente del cambio; resolver hallazgos funcionales y repetir solo las comprobaciones afectadas.
- [x] Documentar resultados, limitaciones físicas y commits. Mostrar el boceto y el cambio local al usuario.

## Continuación autorizada: integración y APK

El usuario pidió «hazlo» después de la entrega local y de indicar integración al principal, APK y comprobación Android como pendientes. Ejecutar integración local y empaquetado firmado; probar el dispositivo si está conectado. Conservar los cambios ajenos. No publicar en remoto como parte de esta continuación.

- [ ] Estabilizar el reloj del fixture de recuperación de propuestas: el fallo previo se debe a una visita fija que ya pasó. Conservar la validación real y comprobar que el envío llega al límite de red fallido.
- [ ] Ejecutar la suite completa y TypeScript, integrar por avance directo en `main` y verificar el resultado integrado.
- [ ] Preparar 0.1.22 / versionCode 23, generar APK firmada y verificar firma, metadatos, configuración y hash.
- [ ] Instalar conservando los datos y probar filtros, teclado y Atrás si hay un teléfono conectado; documentar el límite si no lo hay. Entregar APK local y evidencia.
