# Importar un anuncio pegando texto

30 de septiembre de 2026. Aprobado por el usuario: parser puro en el cliente, botón «Pegar anuncio» al publicar, formulario relleno con aviso de lo detectado. Basado en siete anuncios reales de Revolico aportados por el usuario (capturas); Revolico bloquea la lectura automática con verificación anti-bots.

## Problema

Quien vende ya tiene su anuncio escrito en Revolico o en un grupo de WhatsApp. Reescribirlo campo a campo es la mayor fricción para publicar, y sin oferta no hay catálogo, alertas ni fichas que compartir.

## Diseño

### Parser (`src/domain/importListing.ts`, puro)

`parseListingText(text: string): ImportResult` con `ImportResult = { draft: Partial<ListingDraft>; detected: ImportField[]; missing: ImportField[]; notes: string[] }`. `ImportField` = claves del borrador que el parser maneja (`operation`, `title`, `type`, `location`, `province`, `price`, `bedrooms`, `bathrooms`, `area`, `floor`, `condition`, `priceNegotiable`, `amenities`, `description`, `rentPeriod`, `swapWants`).

Pasos:

1. **Normalizar**: dígitos en emoji de tecla pasan a dígitos normales; se quita el resto de emoji y símbolos decorativos (picas, estrellas, marcas de verificación, casas); se unifican espacios y se conservan los saltos de línea. Se busca sobre una copia sin acentos y en minúsculas; título y descripción salen del texto limpio.
2. **Contacto**: eliminar teléfonos cubanos (8 dígitos que empiezan por 5; fijos de 7 u 8 dígitos precedidos de «llamar», «tel», «teléfono:», «whatsapp»; `+53…`; números `+1` de 10 dígitos), enlaces `wa.me/…` y `t.me/…`, correos, y las frases que los introducen («llamar al», «escribir al whatsapp», «para más info»). Nota: «Quitamos N datos de contacto: en KarmaHouse se habla por el chat.»
3. **Operación**: primera coincidencia por prioridad `busco|necesito|compro` → `wanted`; `permuto|permuta|cambio … por` → `swap`; `alquilo|rento|arriendo|se alquila|se renta|en alquiler|renta` → `rent`; `vendo|se vende|venta|en venta` → `sale`. Sin coincidencia: `sale`, no detectada.
4. **Precio (USD)**: candidatos en orden: `N mil` / `Nmil` / `Nk` (×1000, admite decimales como «12.5 mil»); número con separador de miles (`45.000`, `45,000`); número de 3 a 8 cifras junto a `usd`, `dólares`, `$` o `precio`. Se descarta lo que sea teléfono o vaya seguido de `cup|mn|mlc|eur|euros|pesos` (nota: «El precio está en otra moneda; indícalo en USD.»). Entre varios candidatos gana el que acompaña a «precio» o «usd»; si no, el mayor.
5. **Habitaciones**: `N cuartos|habitaciones|habitación|dormitorios`, número pegado (`1cuarto`), en letras (`un`, `una`, `dos`… `seis`) y la notación `N/4`. **Baños**: igual con `baños|baño`; `1 1/2 baños` → 1; una línea que sea solo «baño» → 1. **Superficie**: `N m2|m²|mts|metros (cuadrados)`.
6. **Tipo**: `apartamento|apto` → Apartamento; `casa|biplanta|chalet` → Casa; gana la primera mención. **Planta**: `N(er|do|ro|to)? piso`, `primer|segundo|tercer… piso`, `planta baja|bajos` → 0.
7. **Negociable**: `negociable|se escuchan ofertas|me ajusto|precio a conversar`. **Estado**: `buen estado|buenas condiciones` → `good`; `a reparar|para reparar|necesita reparaci` → `needs-renovation`; `recien construid|a estrenar|nueva construccion` → `new`.
8. **Comodidades** (solo las del catálogo `AMENITIES`): Balcón (`balcon`), Patio, Garaje (`garaje|garage`), Terraza, Piscina, Cisterna, Ascensor (`ascensor|elevador`), Tanque de agua (`tanque`), Aire acondicionado (`aire acondicionado|split`), Entrada independiente (`puerta calle|entrada independiente`), Amueblado (`amueblad|con todo adentro|se deja todo|juego de sala`).
9. **Lugar**: `src/domain/places.ts` exporta `PLACES: { name: string; province: string }[]` (municipios de La Habana, repartos frecuentes, municipios y cabeceras del resto de provincias) y `findPlace(text)`: coincidencia sin acentos, por palabra completa, la más larga primero. Resultado: `location` = nombre canónico y su `province`. Si solo aparece el nombre de una provincia: `province` y `location` vacía.
10. **Alquiler**: `por noche|la noche|diario|por dia` → `rentPeriod: 'day'`; si no, `month`. **Permuta**: lo que sigue a `por` / `busco` / `necesito` hasta fin de frase va a `swapWants` si tiene 20 caracteres o más.
11. **Título**: primera línea con 3 o más letras tras limpiar, recortada a 100; si queda genérica (solo «venta de casa», «se vende casa») y hay lugar, «Casa en Vedado». **Descripción**: texto limpio completo, máximo 2000.
12. `detected` lista lo que se rellenó; `missing` lista lo obligatorio para esa operación que quedó vacío (por ejemplo `area`, `bathrooms`, `province`).

Nunca inventa: un campo sin evidencia queda vacío.

### Interfaz

- En «¿Qué quieres publicar?» (`ListingForm`), botón secundario «Pegar anuncio» con el texto «¿Ya lo tienes escrito en Revolico o WhatsApp? Pégalo y rellenamos el formulario.».
- `src/components/ImportListingSheet.tsx`: modal con campo multilínea (máx. 4000), contador, «Analizar» y «Cancelar». Sin dependencia de portapapeles: se pega con el gesto del sistema.
- Al analizar: se aplica `draft` al borrador, queda elegida la operación y se abre el paso 0. Aviso en la cabecera del formulario: «Rellenamos desde tu texto: operación, precio, habitaciones… Falta: superficie, baños.» más las notas. Botón «Descartar lo importado» que vuelve al selector con el borrador vacío.
- Las fotos se añaden a mano.

## Verificación

- `tests/import-listing.test.ts`: unos 30 anuncios redactados con las convenciones observadas (no copiados), uno por patrón y varios completos por operación; ningún teléfono sobrevive en título ni descripción; texto vacío o sin señales devuelve borrador vacío con `missing`; `findPlace` con acentos, mayúsculas y nombres contenidos en otros («Habana» frente a «Centro Habana»).
- `npm run check`. Navegador en modo demo: pegar un anuncio, ver el formulario relleno y el aviso. Teléfono: pegar un anuncio desde el portapapeles.

## Fuera de alcance

Fotos; leer enlaces; monedas distintas de USD; botón de portapapeles; compartir texto hacia KarmaHouse desde otra app (intent de Android).
