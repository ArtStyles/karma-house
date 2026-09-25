# Permuta y «Busco vivienda»

26 de septiembre de 2026. Aprobado por el usuario: mismo catálogo con filtro «Operación» (A), permuta con «a cambio busco», provincias y diferencia (A), busco sin fotos ni superficie (A).

## Problema

KarmaHouse solo admite compraventa. En Cuba la permuta es un mercado propio y en Revolico o en los grupos de WhatsApp la mitad de los mensajes son «busco…». Esa demanda no tiene sitio en la app, y cada «busco» publicado es un motivo para que un vendedor la instale y escriba.

## Diseño

### Servidor

Migración `supabase/migrations/20260926000100_operations.sql`.

- `public.properties.operation text not null default 'sale' check (operation in ('sale','swap','wanted'))`. Las filas existentes quedan en `sale`.
- Permuta: `swap_wants text`, `swap_provinces text[]`, `swap_balance text`, `swap_amount numeric`.
  - `check ((operation='swap') = (swap_wants is not null))`; `char_length(btrim(swap_wants)) between 20 and 500`.
  - `swap_provinces`: nulo o entre 0 y 16 valores distintos de la lista oficial (`kh_private.valid_provinces(text[])`, misma técnica que `valid_amenities`). Solo en `swap`.
  - `swap_balance in ('none','pay','receive')`, obligatorio en `swap`, nulo en el resto. `swap_amount` solo con `pay`/`receive`, entre 1 y 100 000 000.
- Busco: `type`, `area` y `bathrooms` pasan a admitir `null`, con `check (operation='wanted' or (type is not null and area is not null and bathrooms is not null))`. La restricción de fotos pasa a `check (moderation='draft' or operation='wanted' or cardinality(photo_paths) >= 1)`. `latitude`/`longitude` deben ser nulas en `wanted`.
- `kh_save_property`:
  - lee `operation` del payload; si falta, conserva la de la fila existente o usa `sale`. Valor inválido → `KH_INVALID_OPERATION`.
  - `sale`: validación actual, y `swap*` deben venir nulos u omitidos.
  - `swap`: validación actual más `swapWants` (20-500), `swapProvinces` (array de provincias válidas, opcional), `swapBalance` (obligatorio), `swapAmount` (solo con `pay`/`receive`). Error `KH_INVALID_SWAP`.
  - `wanted`: `type` en (`Casa`,`Apartamento`, nulo = cualquiera), `area` y `bathrooms` ignorados y guardados nulos, `amenities` vacías, `photoPaths` vacío o no, `mapLocation` guardado nulo, `condition`/`floor`/`priceNegotiable` nulos. `price` = presupuesto máximo (>0), `bedrooms` = habitaciones mínimas (1-20). Error `KH_INVALID_WANTED`.
  - El payload canónico incluye `operation` y los `swap*`, así la idempotencia por `clientRequestId` sigue funcionando.
- `kh_catalog_where(f)`: si `f->'operations'` es un array no vacío de valores válidos, `p.operation = any(...)`; si falta, `p.operation in ('sale','swap')`. Valor inválido → `KH_INVALID_OPERATION`. `kh_search_properties` no cambia de firma.
- `kh_map_clusters`: sin cambios. Un busco nunca guarda coordenadas, así que `latitude is not null` ya lo excluye; la suite lo comprueba.
- Todo lo demás (chat, favoritos, reportes, visitas y ofertas, avisos, ficha pública por `id`) funciona sin cambios porque cuelga de `property_id`.

### Ficha pública (`web/api/p.ts`)

- `COLUMNS` añade `operation,swap_wants,swap_provinces,swap_balance,swap_amount`.
- `og:title` y `<title>`: prefijo «Permuta: » o «Busco: ».
- `og:description` y línea de datos: permuta «Valor est. 85,000 USD · …»; busco «Hasta 40,000 USD · Playa, La Habana · desde 2 hab · Casa o apartamento».
- Permuta: sección «A cambio busca» con el texto, las provincias y la diferencia («Sin diferencia», «Añade hasta $ 5,000», «Pide $ 5,000»).
- Busco: sin galería ni `og:image`; sin superficie, baños ni características; el botón dice «Tengo algo que encaja».

### Cliente

Dominio (`src/domain/listings.ts`):

- `type ListingOperation = 'sale' | 'swap' | 'wanted'`; `Listing.operation` (por defecto `sale` al mapear filas sin la columna); `Listing.swap?: { wants: string; provinces: string[]; balance: SwapBalance; amount?: number }`.
- `Listing.type`, `Listing.area` y `Listing.bathrooms` pasan a opcionales (ausentes solo en `wanted`). El compilador señala cada uso.
- `ListingDraft.operation`, `swapWants`, `swapProvinces`, `swapBalance`, `swapAmount` (cadena). `validateDraft` valida por operación: en `wanted` no exige fotos, superficie, baños, tipo ni mapa; en `swap` exige `swapWants` y `swapBalance`, y `swapAmount` numérico si la diferencia no es `none`.
- `ListingFilters.operation: 'offers' | 'sale' | 'swap' | 'wanted'`, por defecto `offers`. `searchPayload` lo traduce a `operations: ['sale','swap'] | ['sale'] | ['swap'] | ['wanted']`. `Shortcut` añade `swap` y `wanted`.
- `propertyPayload` envía `operation` y los `swap*` (`swapAmount` numérico o nulo). `mapRemoteListing` lee las columnas nuevas y acepta `type`/`area`/`bathrooms` nulos solo en `wanted`.
- `draftPersistence` conserva los campos nuevos.

Publicar (`PublishScreen`, `ListingForm`):

- Paso previo «¿Qué quieres publicar?» con tres opciones: Vender, Permutar, Busco vivienda. Elegir fija `draft.operation`; se puede volver.
- Vender: flujo actual.
- Permutar: flujo actual con etiqueta «Valor estimado (USD)» en precio y sección nueva «A cambio busco» en el paso 2: texto, provincias (multiselección con `SelectionField`/pills), diferencia (tres opciones) e importe.
- Busco vivienda: dos pasos. Paso 1: título, provincia, zona, tipo (Casa / Apartamento / Cualquiera). Paso 2: presupuesto máximo, habitaciones mínimas, descripción, revisión. Sin fotos ni mapa.
- Edición (`EditScreen`) respeta la operación guardada; no se cambia de operación al editar.

Catálogo:

- `CatalogFilters`: bloque «Operación» con pills Venta y permuta · Venta · Permuta · Busco.
- Explorar: chips rápidos «Permuta» y «Busco» tras Casa/Apartamento; `activeFilterCount` cuenta la operación cuando no es `offers`.
- `PropertyCard`: etiqueta «Permuta» o «Busco» sobre la foto; busco sin foto muestra un bloque con icono y «Busco», precio «Hasta $ X», línea «desde N hab · Casa o apartamento · Zona, Provincia».
- `DetailScreen`: permuta añade sección «A cambio busca»; busco oculta galería, superficie, baños, mapa y características, muestra «Presupuesto máximo», «Habitaciones mínimas», «Tipo», y el botón de contacto dice «Tengo algo que encaja». `share()` adapta el texto.
- `MyListingsScreen`: etiqueta de operación en cada fila.

Landing (`web/public/index.html`): titular «Compra, vende o permuta casa en Cuba. Sin intermediarios.»; FAQ de permuta actualizada.

### Compatibilidad

- APK 0.1.6: publica ventas (payload sin `operation` → `sale`), ve venta y permuta (una permuta la muestra como venta con su valor estimado), nunca recibe filas con `type`/`area`/`bathrooms` nulos.
- Fichas públicas anteriores siguen válidas.

## Verificación

- `supabase/tests/operations.sql` en transacción revertida: guardar permuta válida; permuta sin `swapWants` → `KH_INVALID_SWAP`; busco sin fotos ni superficie se guarda y se aprueba; payload sin `operation` → `sale`; `kh_search_properties` sin `operations` excluye busco; con `['wanted']` solo devuelve busco; `kh_map_clusters` no cuenta busco. `scripts/apply-operations.mjs` (prueba y deshace; `--commit` aplica) y `scripts/verify-operations.mjs`.
- Unitarias en `tests/operations.test.ts`: `validateDraft` por operación, `propertyPayload`, `mapRemoteListing` (nulos permitidos solo en `wanted`), `searchPayload`, `activeFilterCount`, textos de tarjeta; `tests/public-listing.test.ts` amplía el render para permuta y busco.
- Navegador: publicar una permuta y un busco, aprobarlos como admin, Explorar con cada filtro, detalle y chat, ficha pública en Vercel. `docs/operations-verification.md`.
- `npm run check`.

## Fuera de alcance

Búsqueda de texto dentro de «a cambio busco»; avisos a quien publica un busco cuando aparece una vivienda que encaja (entrega 3, alertas); alquiler; cambiar la operación de un anuncio ya publicado.
