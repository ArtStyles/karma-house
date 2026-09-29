# Superficie opcional

30 de septiembre de 2026. Aprobado por el usuario: la superficie (m²) pasa a ser opcional en venta, permuta y alquiler; si se indica, mantiene las reglas actuales; sin ella no se muestra la cifra; ordenar por «Mayor superficie» o filtrar por m² solo devuelve anuncios que la indican; los clientes 0.1.8 y anteriores no reciben ofertas sin superficie por el catálogo ni por el mapa.

## Problema

Muchos anuncios cubanos no dicen los metros, y el vendedor no los sabe. Exigirlos obliga a inventar una cifra o abandona la publicación; pegar un anuncio de Revolico o WhatsApp siempre marcaba «Superficie» como pendiente.

## Diseño

### Servidor (`supabase/migrations/20260930000100_optional_area.sql`)

- `properties_offer_fields` se recrea como `operation = 'wanted' or (type is not null and bathrooms is not null)`. El check de rango de `area` (`> 0 and <= 10000`) se mantiene y deja pasar `null`.
- `kh_save_property` (copia de la versión de `20260929000100_rent.sql`): fuera de `wanted`, `area` puede faltar o ser `null`; si viene, `> 0 and <= 10000` o `KH_INVALID_PROPERTY`. El payload canónico sigue llevando `'area', v_area`.
- `kh_catalog_where(f)` (misma copia): salvo que `f->>'optional_area' = 'true'`, añade `and (p.area is not null or p.operation = 'wanted')`; con `sort = 'area-desc'` añade `and p.area is not null` (en orden descendente los nulos irían primero y el cursor no podría pasarlos). `min_area`/`max_area` ya excluyen `null` por comparación. Lo usan `kh_search_properties` y `kh_map_clusters`, así que catálogo y mapa se comportan igual.
- `kh_private.property_matches`: evalúa `p_filters || '{"optional_area":true}'`, de modo que las búsquedas guardadas y los busco reciben alerta de ofertas sin superficie. Las búsquedas guardadas nunca llevan la clave: `normalize_search_filters` no cambia y la rechaza.
- `notify pgrst, 'reload schema'`.

### Cliente

- `validateDraft`: en venta, permuta y alquiler solo valida `area` si `draft.area.trim()` no está vacío; `validatedValues` omite `area` si está vacío. `filterListings`: `minArea` y `maxArea` no casan con un anuncio sin superficie; `area-desc` lo deja al final.
- `listingFacts` omite « · N m²» sin superficie; `shareText` lo hereda. Tarjeta, Admin y Mis anuncios usan `listingFacts` o no muestran la superficie.
- `propertyPayload`: `area: null` si está vacía. `mapRemoteListing` acepta `area: null` en cualquier operación y sigue rechazando valores no positivos o no numéricos. `marketplaceStore` y `draftPersistence` aceptan la superficie ausente (un borrador sin la clave se restaura con `''`).
- `searchPayload` envía siempre `optional_area: true`; el mapa usa el mismo payload. `toSavedFilters` la quita.
- Publicar: «Superficie (m², opcional)» sin marca de obligatorio; la revisión oculta el dato de m² si está vacío. Detalle: sin superficie desaparece la caja «Superficie» y la fila queda con dos cajas (Habitaciones, Baños), como en el busco. `EditScreen` ya convierte `undefined` en `''`.
- Importar anuncio: `area` deja de figurar en `missing` en todas las operaciones (se sigue rellenando si se detecta).
- Ficha pública `web/api/p.ts`: `describeListing` y la tabla de detalles omiten la superficie cuando es `null`.

### Compatibilidad

APK 0.1.8 y anteriores: no envían `optional_area`, así que `kh_search_properties` y `kh_map_clusters` nunca les devuelven una oferta sin superficie. Siguen publicando con superficie obligatoria. Las lecturas directas por PostgREST no pasan por `kh_catalog_where` y sí pueden entregarles una fila con `area: null`, que su `mapRemoteListing` rechaza con «datos de propiedad no válidos» para todo el lote: abrir por id (enlace compartido, notificación de alerta, chat), la página de favoritos si incluye una, la cola de moderación de Admin con un pendiente sin superficie y la carga de «Mis anuncios» de una cuenta que publicó sin superficie desde un cliente nuevo.

## Verificación

- Suite SQL `supabase/tests/optional_area.sql` (actores `30000000-…`): venta sin `area` guardada con `null`; `area: 0` y `area: 20000` → `KH_INVALID_PROPERTY`; aprobada por Admin; una búsqueda guardada de otro usuario recibe la alerta; `kh_search_properties` sin la clave no la devuelve y con `optional_area` sí; con `sort: 'area-desc'` o `min_area: 10` no (una venta de control con superficie sí aparece); `kh_map_clusters` cuenta su punto solo con la clave. Scripts `apply-optional-area.mjs` (ensayo con rollback; `--commit` aplica) y `verify-optional-area.mjs`. `operations.sql`, `rent.sql` y `search_alerts.sql` siguen pasando sobre la migración.
- Unitarias: `tests/operations.test.ts` (validación, creación, edición, filtros y orden, payload, fila remota, borrador, snapshot, `listingFacts`, `shareText`, `searchPayload.optional_area`), `tests/search-alerts.test.ts` (`toSavedFilters` sin `optional_area`), `tests/import-listing.test.ts` (lista `missing`), `tests/public-listing.test.ts` (descripción y tabla sin superficie).
- Navegador (demo): publicar una venta sin superficie; revisión, tarjeta y detalle sin m².

## Fuera de alcance

Filtrar las lecturas directas por PostgREST para clientes antiguos; superficie construida frente a superficie de parcela; convertir unidades (varas, m² de terreno).
