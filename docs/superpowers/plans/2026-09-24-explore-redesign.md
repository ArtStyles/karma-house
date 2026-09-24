# Explorar: contenido primero — plan de implementación

> Ejecutado en la misma sesión que aprobó el diseño. Spec: [2026-09-24-explore-redesign-design.md](../specs/2026-09-24-explore-redesign-design.md).

**Goal:** Primera vivienda y su precio visibles al abrir la app, provincia a un toque, sin cambios de servidor.

**Architecture:** Lógica de atajos y de «Nueva» como funciones puras en `src/domain/listings.ts`, probadas con `node --test`. Las pantallas solo las consumen. El selector de provincia reutiliza el modal de `SelectionField` mediante una prop `renderTrigger`.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-router, pruebas con `node --experimental-strip-types --test`.

---

### Task 1: Funciones puras

**Files:** Modify `src/domain/listings.ts`; Test `tests/explore-shortcuts.test.ts`.

- [x] Prueba: `isNewListing` es cierto con 6 días y falso con 8, con fecha futura o inválida.
- [x] Prueba: `toggleShortcut(defaultFilters, 'Casa')` da `{ type: 'Casa' }`; aplicado dos veces vuelve a `'Todas'`; `'price'` fija `maxPrice: '30000'` y borra `minPrice`; `'bedrooms'` alterna 0 ↔ 3; `shortcutActive` solo reconoce el atajo exacto (un `maxPrice` de 40000 no lo activa).
- [x] Ejecutar `node --experimental-strip-types --test tests/explore-shortcuts.test.ts` → falla.
- [x] Implementar `isNewListing`, `PRICE_SHORTCUT`, `BEDROOM_SHORTCUT`, `shortcutActive`, `toggleShortcut`.
- [x] Ejecutar la prueba → pasa.

### Task 2: `SelectionField.renderTrigger`

**Files:** Modify `src/components/SelectionField.tsx`.

- [x] Extraer el `Modal` a una constante; si llega `renderTrigger(open)`, devolver `<>{renderTrigger(open)}{modal}</>` sin etiqueta ni disparador propios.
- [x] `npx tsc --noEmit` limpio.

### Task 3: Tarjeta

**Files:** Modify `src/components/PropertyCard.tsx`.

- [x] Foto de 200 con radio 16 dentro de un envoltorio; cuerpo sobre el fondo; «Nueva» con `isNewListing`; precio 22/700 y «Negociable»; título, zona y datos en líneas de una línea. Variante horizontal en tarjeta blanca.

### Task 4: Explorar

**Files:** Modify `src/screens/ExploreScreen.tsx`; Delete `src/components/ExploreIntro.tsx`.

- [x] Barra superior sin `AccountMenu`; título; búsqueda en píldora con filtros dentro; fila de atajos (provincia con `SelectionField.renderTrigger` y `PROVINCES`, Casas, Apartamentos, «Hasta $30.000», «3+ hab.»); línea de resultados con provincia; etiquetas solo para lo que no refleja un atajo; conmutador Mapa/Lista en la línea de resultados y flotante sobre la barra de pestañas solo tras desplazarse; dos tarjetas de relleno mientras carga.

### Task 5: Mi espacio

**Files:** Modify `src/screens/ProfileScreen.tsx`.

- [x] Grupo «Cuenta» con sesión: Ajustes de cuenta, Preferencias de notificaciones, Cerrar sesión (rojo, sustituye al botón).

### Task 6: Verificación y commit

- [x] `npm run check`.
- [x] Navegador 375 × 812, 320 × 740 y escritorio: primera foto, atajos, provincia, mapa/lista, Mi espacio sin sesión.
- [ ] Favoritos y Mi espacio con sesión (requiere una cuenta en el teléfono).
- [ ] Commit de spec, plan y código (cuando el usuario lo pida).
