# Importar un anuncio pegando texto — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pegar el texto de un anuncio y obtener el formulario de publicación relleno con lo que el texto dice, sin inventar nada.

**Architecture:** Parser puro en `src/domain/importListing.ts` apoyado en una lista de lugares `src/domain/places.ts`; una hoja modal en el paso de elección de operación de `ListingForm` aplica el resultado al borrador. Sin servidor.

**Tech Stack:** TypeScript, React Native, `node --test`.

Spec: `docs/superpowers/specs/2026-09-30-import-listing-design.md` (léela entera: las reglas del parser están ahí).

**Contexto**: `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`; tests importan `.ts` con extensión; dominio sin React Native. `ListingDraft`, `emptyDraft`, `validateDraft` en `src/domain/listings.ts`; `AMENITIES`, `PROVINCES`, `CONDITIONS` en `src/domain/listingOptions.ts`; `parseDecimal` en `src/domain/numericInput.ts`. Commits en inglés con última línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Los anuncios de prueba se redactan, no se copian de ningún sitio, y no llevan teléfonos reales (usa `55550101` a `55550199`).

### Task 1: Lugares y parser

**Files:** Create `src/domain/places.ts`, `src/domain/importListing.ts`, `tests/import-listing.test.ts`.

- [ ] Tests primero (`tests/import-listing.test.ts`), un `test` por grupo: normalización (emoji de tecla, decoraciones); contacto (8 dígitos, `+53`, `wa.me`, correo, frase introductoria; nada sobrevive en `title` ni `description`; nota con el recuento); operación (las cuatro más el valor por defecto); precio («10mil usd», «18 mil», «45k», «45.000 USD», «$45000», «Precio 15000», «12.5 mil», dígitos emoji, un teléfono no es precio, «800000 cup» no es precio y deja nota, varios candidatos); habitaciones y baños (pegado, letras, `3/4`, «3 habitación», «2 dormitorios», línea «Baño», «1 1/2 baños»); superficie; tipo; planta; negociable; estado; comodidades (cada sinónimo de la spec, sin duplicados, solo valores de `AMENITIES`); lugar (`findPlace`: «en playa» → Playa/La Habana, «Municipio Regla», «en el Vedado», «Centro Habana» gana a «Habana», «Cruces» → Cienfuegos, provincia sola); alquiler por noche y por mes; permuta con `swapWants`; título genérico sustituido; descripción recortada a 2000; texto vacío; y cinco anuncios completos (venta en lista por líneas, venta en párrafo, permuta, alquiler, busco) con `assert.deepEqual` sobre `draft`, `detected` y `missing`. Cada borrador completo que tenga todo lo obligatorio debe pasar `validateDraft` tras añadirle `imageKey: 'vedado'` y `clientRequestId`.
- [ ] `places.ts`: los 15 municipios de La Habana, unos 40 repartos habaneros frecuentes (Vedado, Nuevo Vedado, Miramar, Siboney, Kohly, Santos Suárez, Víbora, Lawton, Luyanó, Alamar, Guanabo, Cojímar, Casablanca, Mantilla, Párraga, Altahabana, Fontanar, Santiago de las Vegas, Wajay, Calabazar, La Ciruela…) y, para cada otra provincia, su cabecera y municipios principales (Cruces, Varadero, Cárdenas, Trinidad, Santa Clara, Remedios, Morón, Baracoa, Bayamo, Manzanillo, Gibara, Banes, Nueva Gerona…). Toda provincia usada debe estar en `PROVINCES`.
- [ ] `importListing.ts` según la spec. Funciones pequeñas por campo (`detectOperation`, `detectPrice`, …) exportadas para los tests.
- [ ] `npm run check` verde. Commit `feat: read a pasted listing into a draft`.

### Task 2: Interfaz

**Files:** Create `src/components/ImportListingSheet.tsx`; modify `src/components/ListingForm.tsx`.

- [ ] Hoja modal (patrón de `SaveSearchSheet.tsx`): campo multilínea, contador `n/4000`, «Analizar» deshabilitado con menos de 20 caracteres, «Cancelar».
- [ ] `ListingForm`: botón «Pegar anuncio» y su texto en el selector de operación (solo sin `initialDraft`); al analizar, aplica `result.draft` sobre `emptyDraft` conservando `clientRequestId`, fija `chosen`, guarda `result` en estado para el aviso; aviso con etiquetas de `fieldLabels` para `detected` y `missing` y las `notes`; botón «Descartar lo importado». Para `wanted` aplica las mismas limpiezas que el selector (sin fotos ni mapa, `wantedOperations` por defecto); para `rent`, `rentPeriod` detectado o `month`.
- [ ] `npm run check`; navegador en modo demo (`EXPO_NO_DOTENV=1 npx expo start --web --port 8085 --offline`): pegar un anuncio de venta en lista y uno de alquiler; comprobar campos rellenos, aviso y descarte. Commit `feat: fill the publish form from a pasted listing`.

### Task 3: Documentar

- [ ] `docs/import-listing-verification.md`, README («Pegar anuncio»), roadmap. Commit `docs: verify importing a pasted listing` y push.
