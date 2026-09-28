# Alquiler

29 de septiembre de 2026. Aprobado por el usuario (A-D): operación `rent` con precio mensual, periodo mes/día y estancia mínima opcional; oculta por defecto en el catálogo; el busco elige qué busca (comprar, permutar, alquilar); el APK 0.1.7 no recibe alquileres.

## Problema

El alquiler es la transacción más frecuente en Cuba y hoy no cabe en KarmaHouse. Añadirlo como cuarta operación reutiliza todo lo entregado: publicación, moderación, chat, alertas, fichas públicas.

## Diseño

### Servidor (`supabase/migrations/20260929000100_rent.sql`)

- `properties.operation` admite `rent`. Columnas nuevas: `rent_period text` (`month` | `day`), `rent_min_stay integer` (1-365, opcional). Restricción: `operation='rent'` ⇔ `rent_period is not null`; `rent_min_stay` solo con `rent`. Un alquiler exige lo mismo que una venta (tipo, superficie, baños, foto).
- `properties.wanted_operations text[] not null default '{sale,swap}'`, subconjunto no vacío de `{sale,swap,rent}`; solo tiene sentido en `wanted` (en el resto se guarda el valor por defecto).
- `kh_save_property`: rama `rent` = validación de venta más `rentPeriod` (obligatorio) y `rentMinStay` (opcional, entero 1-365) → `KH_INVALID_RENT`; rama `wanted` acepta `wantedOperations` (array; si falta, `{sale,swap}`) → `KH_INVALID_WANTED`. El payload canónico incluye los tres campos; columnas en insert/update. `KH_OPERATION_LOCKED` sigue igual.
- `kh_catalog_where` y `normalize_search_filters`: `rent` válido en `operations`; el valor por defecto sin `operations` sigue siendo `('sale','swap')` (el APK 0.1.7 nunca recibe alquileres).
- Alertas: `wanted_filters(p)` usa `to_jsonb(p.wanted_operations)` como `operations`; `alert_on_approval` trata `rent` como oferta (`p.operation in ('sale','swap','rent')`) y, al aprobar un busco, avisa a los dueños de ofertas cuya operación esté en `wanted_operations`. La búsqueda guardada con `operations: ['rent']` recibe alquileres.
- Ficha pública `web/api/p.ts`: `COLUMNS` añade `rent_period,rent_min_stay,wanted_operations`; título y `og:title` con prefijo «Alquiler: »; precio «$ 300 USD / mes» o «/ noche»; `og:description` «Alquiler 300 USD/mes · zona · hab · baños · m²»; detalle «Estancia mínima: N meses/noches» cuando exista; busco muestra «Busca: comprar, permutar o alquilar» según `wanted_operations`.

### Cliente

- `ListingOperation` añade `rent`; `OPERATIONS` añade `{ value: 'rent', label: 'Alquilar', badge: 'Alquiler', description: 'Ofreces tu vivienda por meses o por noches.' }`. `RentPeriod = 'month' | 'day'`; `RENT_PERIODS` con etiquetas «Por mes» / «Por noche».
- `Listing.rent?: { period: RentPeriod; minStay?: number }`, `Listing.wantedOperations?: ListingOperation[]` (solo busco). `ListingDraft.rentPeriod?: RentPeriod | ''`, `rentMinStay?: string`, `wantedOperations?: ListingOperation[]`.
- `validateDraft`: `rent` = reglas de venta más `rentPeriod` obligatorio y `rentMinStay` entero 1-365 si se indica; `wanted` = `wantedOperations` no vacío ⊆ `sale|swap|rent` (por defecto `['sale','swap']`). `validatedValues`, `updateListing`, `propertyPayload` (`rentPeriod`, `rentMinStay` numérico o nulo, `wantedOperations`), `mapRemoteListing` (`rent_period`, `rent_min_stay`, `wanted_operations`), `draftPersistence`, `marketplaceStore` siguen el patrón de permuta.
- `operations.ts`: `operationBadge` → «Alquiler»; `priceLabel` → «Alquiler»; nueva `priceSuffix(listing)` → `' / mes'` | `' / noche'` | `''`; `listingFacts` como venta; `shareText` «Alquiler: {título}\n$ X USD / mes · …»; `wantedOperationsText(listing)` → «comprar, permutar o alquilar» / «alquilar» etc.
- `OperationFilter` y `Shortcut` añaden `rent`; `operationsFor('rent') = ['rent']`; `operationsFor('offers')` sigue `['sale','swap']`. `CatalogFilters` añade la pill «Alquiler»; Explorar el chip «Alquileres»; `activeFilterCount` ya cuenta la operación.
- Publicar: cuarta opción «Alquilar». Paso 1 en `rent`: etiqueta de precio «Precio por mes (USD)» o «Precio por noche (USD)» según el periodo, `SelectionField` «Cobro» (Por mes / Por noche) y campo «Estancia mínima (opcional)». Busco: `ChoiceField` «Qué busco» con pills Comprar / Permutar / Alquilar (multiselección, al menos una; por defecto Comprar y Permutar); si solo Alquilar, la etiqueta del presupuesto es «Presupuesto máximo por mes (USD)».
- Tarjeta y detalle: precio con `priceSuffix`; detalle de alquiler añade «Estancia mínima» en «Más detalles»; detalle de busco muestra «Busca: …» con `wantedOperationsText`. Mis anuncios y Admin heredan la etiqueta.
- Landing: FAQ «¿Puedo publicar permutas o búsquedas?» pasa a mencionar alquiler; titular «Compra, vende, permuta o alquila…».

### Compatibilidad

APK 0.1.7: publica y ve venta y permuta; nunca recibe `rent` (mismo filtro por defecto); un payload viejo sin `wantedOperations` guarda el valor por defecto.

## Verificación

- Suite SQL `supabase/tests/rent.sql`: alquiler válido por `kh_save_property` (mes y día, con y sin estancia mínima); sin `rentPeriod` → `KH_INVALID_RENT`; `rentMinStay` fuera de rango → `KH_INVALID_RENT`; busco con `wantedOperations: ['rent']` aprobado y alquiler aprobado → alerta al busco y al arrendador; catálogo sin `operations` excluye alquileres; `['rent']` los devuelve; búsqueda guardada con `operations:['rent']` recibe alerta; `['buy']` en `wantedOperations` → `KH_INVALID_WANTED`. Scripts `apply-rent.mjs` / `verify-rent.mjs`.
- Unitarias en `tests/operations.test.ts` y `tests/public-listing.test.ts`: validación y valores de `rent` y `wantedOperations`, payload, fila remota, textos (`priceSuffix`, `shareText`, `wantedOperationsText`), render de la ficha de alquiler y de busco con operaciones.
- Navegador (demo): publicar un alquiler y un busco de alquiler, tarjeta con «/ mes», detalle con estancia mínima; chip «Alquileres». Contra el proyecto real: fila sintética y ficha pública en Vercel. `docs/rent-verification.md`.

## Fuera de alcance

Depósito, servicios incluidos, calendario de disponibilidad, precio en CUP, reservas.
