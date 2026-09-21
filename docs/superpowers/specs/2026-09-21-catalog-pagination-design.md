# Paginación del catálogo de KarmaHouse en servidor

## Alcance acordado

El usuario eligió continuar con la escala del catálogo después de virtualizar la rejilla de Explorar con `FlatList`. Esa entrega quitó el coste de montar todas las tarjetas, pero no el de traerlas: `load()` recorre todas las páginas de `properties` y firma la URL de cada fotografía de cada anuncio en cada refresco.

Se entrega la lectura del catálogo paginada en servidor, con filtros, orden, búsqueda y contador resueltos en Supabase, y el mapa alimentado por recuadro con agrupación. El objetivo acordado es un catálogo de mil a veinte mil anuncios.

Queda fuera: escritura, moderación, favoritos como mecanismo, mensajería y avisos. Ninguno cambia. Tampoco se cambia el aspecto de la rejilla, las tarjetas ni el panel de filtros.

## Experiencia

Explorar carga una primera página y añade las siguientes al acercarse al final de la lista. El contador de resultados sigue siendo exacto y sigue actualizándose al cambiar filtros, con un retardo de 300 ms para no consultar en cada pulsación.

La búsqueda cambia de comportamiento de forma deliberada y visible. Hoy es subcadena: `risa` encuentra «Residencial Brisa». Pasa a intentar primero coincidencia por palabra con prefijo, que es lo que espera quien escribe `hab` buscando «Habana», y solo si eso no devuelve nada recurre a la subcadena anterior. Con una o dos letras únicamente se usa el prefijo.

El mapa deja de recibir todas las viviendas. Consulta el recuadro visible y, cuando hay demasiadas para dibujar, devuelve globos con recuento que se abren en pines individuales al acercar el zoom. Los pines aparecen y desaparecen al navegar; es un cambio visible respecto a la entrega anterior.

Un fallo cargando una página no vacía las páginas ya visibles: se conserva lo cargado y aparece un pie con reintento.

El modo demo local conserva el filtrado en cliente sobre su catálogo de ejemplo. Las pantallas no distinguen entre modos.

## Datos y privacidad

`kh_search_properties` y `kh_map_clusters` se declaran `security invoker`, a diferencia del resto de funciones del proyecto. Leen filas ya públicas, así que conviene que `kh_property_read` siga aplicándose como segunda barrera en vez de suspenderla. Aun así el cuerpo repite `moderation='approved' and availability='active'` de forma explícita, para que un propietario o un administrador no vean sus anuncios no públicos mezclados en el catálogo público.

Ninguna función acepta identificadores de cuenta del cliente: el catálogo público no depende del actor. Los favoritos y los anuncios propios conservan sus rutas actuales, ya autorizadas por `auth.uid()`.

El cursor viaja al cliente. No contiene datos privados: solo la clave de orden de la última fila, su `id` y el modo de búsqueda en uso. Se valida en servidor; un cursor corrupto o manipulado devuelve `KH_INVALID_CURSOR` en vez de una página arbitraria.

### Normalización de texto

`unaccent(text)` es `stable` y no puede usarse en una columna generada. Se envuelve en la forma de dos argumentos, que es `immutable`:

```sql
create or replace function kh_private.kh_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select extensions.unaccent('extensions.unaccent', $1) $$;
```

Sobre ese envoltorio, dos columnas generadas `stored` que concatenan título, ubicación, provincia, descripción y comodidades: `search_text` para trigram y `search_vector` con `to_tsvector('spanish', ...)` para full-text.

La equivalencia con el cliente está comprobada sobre el código, no supuesta: `normalizeSearch` en `src/domain/listings.ts` descompone a NFD y descarta las marcas combinantes, de modo que `ñ` (n + U+0303) queda en `n`. `unaccent` aplica el mismo mapeo. Ambos coinciden para el juego de caracteres del español.

`unaccent` y `pg_trgm` son extensiones nuevas en este proyecto: ninguna migración anterior declara `create extension`. Están disponibles en Supabase pero hay que habilitarlas, y su esquema de instalación debe confirmarse contra el proyecto real antes de fijar `extensions.` en la migración. El script de aplicación resuelve el esquema en vez de darlo por hecho.

### Índices

Todos parciales sobre `moderation='approved' and availability='active'`:

| Índice | Para |
| --- | --- |
| `gin(search_text gin_trgm_ops)` | respaldo por subcadena |
| `gin(search_vector)` | búsqueda por palabra con prefijo |
| `(created_at desc, id desc)` | orden por recientes |
| `(price, id)` | precio ascendente y descendente |
| `(area desc, id)` | mayor superficie |
| `(longitude, latitude) where latitude is not null` | recuadro del mapa |

`properties_public_catalog` se reemplaza. Ordena por `created_at desc` sin desempate, y sin `id` el cursor no es estable entre anuncios creados en el mismo instante.

### Paginación por cursor

Se usa keyset, no `offset`. Con `offset`, aprobar un anuncio mientras alguien pagina desplaza el conjunto y produce filas duplicadas o saltadas. El cursor guarda la clave de orden de la última fila y su `id`; la comparación de filas `(created_at, id) < (:c, :i)` resuelve por índice.

El contador exacto obliga a contar el conjunto filtrado en la primera página, así que decidir el modo de búsqueda sale gratis: si el recuento de full-text es cero se repite con trigram. El modo elegido se guarda en el cursor para que las páginas siguientes no recuenten ni cambien de criterio a media lista.

El respaldo trigram solo se intenta con tres o más caracteres. Por debajo, el índice GIN de trigramas no puede usarse y la consulta degradaría a escaneo secuencial, mientras que el prefijo full-text sí funciona con una o dos letras.

### Agrupación del mapa

`kh_map_clusters` devuelve puntos individuales cuando el recuadro contiene como mucho doscientas viviendas y globos agrupados por celda de rejilla cuando contiene más, con el tamaño de celda derivado del zoom.

La rejilla en grados y el recuadro por btree son una simplificación deliberada con techo conocido, marcada en la migración con un comentario `ponytail:`: sirve para el objetivo de veinte mil anuncios y debe migrar a PostGIS si el catálogo se acerca a cien mil.

### Valores fijados

| Valor | Elegido | Motivo |
| --- | --- | --- |
| Filas por página | 24 | Divisible por las tres anchuras de rejilla (1, 2 y 3 columnas), de modo que ninguna página deja una fila a medias |
| Retardo del contador | 300 ms | Tras la última pulsación en el buscador o el panel de filtros |
| Umbral de puntos frente a globos | 200 viviendas en el recuadro | Por encima, dibujar pines individuales satura el mapa y la respuesta |

## Contrato de datos

Archivo compartido `src/catalog/types.ts`:

```ts
import type { Coordinates, MapLocation } from '../domain/geo';
import type { Listing, ListingFilters } from '../domain/listings';

type SearchMode = 'fts' | 'trgm' | 'none';

interface CatalogPage {
  rows: Listing[];
  total: number;
  nextCursor: string | null;
  searchMode: SearchMode;
}
interface BoundingBox { west: number; south: number; east: number; north: number }
interface MapCluster extends Coordinates { key: string; count: number }
interface MapPoint extends MapLocation { id: string; price: number }
type MapView = { mode: 'points'; items: MapPoint[] } | { mode: 'clusters'; items: MapCluster[] };

interface CatalogRepository {
  search(filters: ListingFilters, cursor: string | null, checkpoint: () => void): Promise<CatalogPage>;
  mapView(bbox: BoundingBox, zoom: number, filters: ListingFilters, checkpoint: () => void): Promise<MapView>;
  byId(id: string, checkpoint: () => void): Promise<Listing | null>;
  byIds(ids: string[], checkpoint: () => void): Promise<Listing[]>;
}
```

El orden no necesita un tipo nuevo: `ListingFilters.sort` ya lo declara y `filters` viaja entero al payload. `MapPoint` y `MapCluster` extienden los tipos de `src/domain/geo.ts` en lugar de repetir latitud y longitud.

RPCs: `kh_search_properties(p_payload jsonb)` y `kh_map_clusters(p_payload jsonb)`.

`kh_search_properties` devuelve `{ rows, total, next_cursor, search_mode }`. Acepta en el payload los trece predicados actuales de `filterListings` —tipo, rango de precio, rango de superficie, provincia, estado de vivienda, negociable, mínimo de habitaciones, mínimo de baños, comodidades y texto—, el orden, el cursor y si debe calcular el total.

## Fotografías

Al paginar, una página son veinticuatro filas de como mucho seis fotografías: dos lotes de firma en lugar de recorrer el catálogo entero. No hace falta trabajo aparte para eso.

Sí se añade una mejora que está en el camino crítico. La tarjeta de la rejilla solo muestra la primera fotografía, de modo que las páginas de lista firman únicamente `photo_paths[1]`, lo que divide entre seis las firmas del recorrido más frecuente. `resolveRows` pasa a aceptar `{ photos: 'cover' | 'all' }` y `mapRemoteListing` deja de exigir URL firmada para las fotografías no solicitadas. La pantalla de detalle pide las seis a través de `byId`.

## Cliente y estado

Cinco archivos en `src/catalog/`, con la misma separación que `src/messaging/` y `src/notifications/`: `types.ts`, `query.ts` (filtros a payload y codificación del cursor, puro), `repository.ts`, `controller.ts` y `useCatalog.ts`, que expone `useCatalogPage`, `useListing`, `useFavoriteListings` y `useMapClusters`.

`controller.ts` reutiliza el patrón de `generation` y secuencia de `src/state/remoteMarketplaceStore.ts`, que ya impide que la respuesta de una cuenta anterior publique datos después de cambiar de sesión, y que una respuesta obsoleta sustituya a una más reciente.

`listings` se elimina de `MarketplaceContextValue`. Es el punto del cambio: `src/screens/DetailScreen.tsx` resuelve con `listings.find` y `src/screens/FavoritesScreen.tsx` con `listings.filter`. Si `listings` pasara a significar «página actual» ambos seguirían compilando y empezarían a fallar en silencio cuando el anuncio quedara fuera de la página cargada. Quitándolo, cada consumidor pendiente es un error de TypeScript. El contexto conserva sesión, `favoriteIds`, `ownListings`, moderación y mutaciones.

`filterListings` no se borra: los hooks leen `mode` del contexto y despachan al filtrado local en modo demo o al repositorio remoto en modo conectado.

`remoteErrorMessage` añade `KH_INVALID_CURSOR`, con el mensaje «La lista cambió. Vuelve a cargar el catálogo», y el controlador vuelve a la primera página.

## Verificación

`tests/catalog-query.test.ts` comprueba la traducción de filtros a payload, la ida y vuelta del cursor y el rechazo de un cursor corrupto o manipulado.

`tests/catalog-controller.test.ts` comprueba la acumulación de páginas, que `loadMore` no duplique filas, que una respuesta iniciada antes de cambiar los filtros se descarte, que el cambio de cuenta limpie las páginas y que un error conserve las páginas previas.

`supabase/tests/catalog_pagination.sql` comprueba la estabilidad del keyset insertando una fila aprobada a mitad de la paginación sin duplicar ni saltar resultados, el respaldo de full-text a trigram, la exactitud del contador, que `anon` no reciba anuncios pendientes y los recuentos de agrupación del mapa.

## Riesgo de despliegue

`add column ... generated always as ... stored` reescribe la tabla completa bajo `access exclusive`. Con el volumen actual es instantáneo; con veinte mil filas deja de serlo, de modo que conviene aplicarlo antes del crecimiento y no después.

La migración se acompaña de `scripts/apply-catalog-pagination.mjs` y `scripts/verify-catalog-pagination.mjs`, con rollback, siguiendo las nueve anteriores. Aplicarla al proyecto Supabase real es un paso separado que requiere confirmación expresa del usuario.
