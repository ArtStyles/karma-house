# Modo ahorro de datos

2 de octubre de 2026. Aprobado por el usuario en la priorización: miniaturas en el catálogo, caché para abrir sin conexión e interruptor en Mi espacio; sin sesión ya se ven catálogo, mapa, detalle y perfil público.

## Problema

En Cuba los datos móviles son caros y la red es lenta. Hoy cada tarjeta del catálogo descarga la foto completa (hasta 1600 px, entre 150 y 400 KB) y cada sesión firma URL nuevas, así que la caché de imágenes del sistema nunca acierta y todo se vuelve a descargar. Sin red, Explorar queda vacío.

## Diseño

### A. Miniatura de portada

- Al elegir fotos (`ListingPhotos`), además de la versión de 1600 px se genera una miniatura de la primera foto: lado mayor 480 px, JPEG, compresión 0,6 (unos 25 a 40 KB). Se sube a `property-photos` como `<owner>/<request>/<nombre>_t.jpg`.
- Servidor (`supabase/migrations/20261002000100_cover_thumb.sql`): columna `properties.cover_thumb_path text` con `check` del patrón `^<owner>/<request>/[A-Za-z0-9_-]{1,100}\.jpg$`; `kh_save_property` acepta `coverThumbPath` (opcional; valida pertenencia, patrón y existencia en `storage.objects` con el mismo bloqueo que las fotos; si la portada cambia y no llega miniatura, se guarda nulo); la política `kh_photo_read` también permite leer la miniatura de un anuncio aprobado y activo; `photo_delete_allowed` trata la miniatura referenciada como en uso. Nada más cambia.
- Cliente: `PROPERTY_COLUMNS` añade `cover_thumb_path`; `Listing.coverThumb?: { uri, storagePath }`; al firmar filas del catálogo (`photos: 'cover'`) se firma la miniatura si existe y, si no, la portada completa (anuncios anteriores). `PropertyCard`, Mis anuncios, favoritos y el perfil público usan la miniatura; el detalle sigue con las fotos completas.
- Ficha web: `og:image` sigue siendo la foto completa (los rastreadores piden buena resolución).

### B. URL firmadas reutilizables

- Hoy cada carga firma por 1 h y la URL cambia, así que la caché de disco de imágenes nunca acierta. `src/data/signedUrlCache.ts`: caché en memoria y en `AsyncStorage` de `ruta → { url, expiresAt }`; las firmas nuevas se piden por 7 días y se reutilizan hasta 24 h antes de caducar. Tamaño máximo 500 entradas, se descartan las más antiguas. Puro salvo el almacenamiento inyectado; probado.
- `createRowSigner` consulta la caché antes de pedir firmas y solo firma las rutas que faltan.
- Una foto retirada deja de estar accesible por la política aunque su URL firmada siga viva hasta 7 días; se acepta porque la foto ya fue pública. Al cerrar sesión o cambiar de cuenta la caché se conserva (son URL de fotos públicas).

### C. Catálogo sin conexión

- `src/catalog/offlineSnapshot.ts`: guarda en `AsyncStorage` la primera página del catálogo con los filtros por defecto (24 anuncios, con sus URL firmadas de miniatura) y la fecha. Se reescribe tras cada carga correcta de esa página.
- Si la primera carga falla por red (`TypeError: Network request failed` o `fetch` abortado por tiempo) y no hay filas, Explorar muestra la instantánea con un aviso «Sin conexión. Viendo lo último que cargaste, de hace 3 horas.» y un botón «Reintentar». Filtros, mapa y búsqueda quedan deshabilitados con explicación mientras dure.
- El detalle de un anuncio de la instantánea se abre con los datos guardados (sin chat ni favoritos hasta recuperar la red).

### D. Interruptor «Ahorro de datos»

- `src/settings/dataSaver.ts` y `useDataSaver()`: preferencia local (`AsyncStorage`), por defecto apagada. Fila en Mi espacio → «Ahorro de datos» con interruptor y texto «Carga fotos solo cuando las tocas y no descarga el mapa hasta que lo pidas.».
- Con el modo encendido: las tarjetas muestran un recuadro con icono y «Tocar para ver la foto» en lugar de descargar la miniatura (una vez tocada queda visible y en caché); el detalle carga solo la primera foto y el resto al pasar a cada una; el mapa de Explorar y el del detalle muestran un botón «Cargar mapa» en lugar de las teselas.

### Sin sesión

Catálogo, mapa, detalle, perfil público y ficha web ya funcionan sin cuenta. No hay cambios; se documenta.

### Compatibilidad

`cover_thumb_path` es una columna nueva que los clientes anteriores ignoran (no la piden). Los anuncios sin miniatura usan la portada completa.

## Verificación

- Suite SQL `supabase/tests/cover_thumb.sql`: guardar con miniatura válida; ruta ajena, patrón inválido o archivo inexistente → `KH_INVALID_PHOTO_PATH` / `KH_PHOTO_NOT_FOUND`; política de lectura para `anon` sobre la miniatura de un anuncio aprobado y no sobre la de uno pendiente; al cambiar la portada sin miniatura queda nula. Scripts `apply-cover-thumb.mjs` / `verify-cover-thumb.mjs`.
- Unitarias: `signedUrlCache` (reutiliza, caduca, límite de 500, solo pide las que faltan), `offlineSnapshot` (guarda, restaura, descarta datos corruptos o de más de 7 días), `dataSaver` (persistencia), mapeo de `cover_thumb_path`.
- Teléfono: medir bytes recibidos por la app (`/proc/net/xt_qtaguid` no existe en Android moderno; usar `dumpsys netstats detail` por uid antes y después) al abrir Explorar con 2 anuncios: antes y después de la miniatura, y en la segunda apertura (caché). Modo avión: Explorar muestra la instantánea. Interruptor: tarjetas sin foto hasta tocar.

## Fuera de alcance

Transformaciones de imagen en el servidor (exigen plan de pago); `expo-image`; precarga de detalle para uso sin conexión; compresión del mapa; miniaturas de todas las fotos (solo la portada).
