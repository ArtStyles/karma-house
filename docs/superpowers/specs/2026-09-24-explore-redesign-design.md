# Explorar: contenido primero

24 de septiembre de 2026. Aprobado por el usuario (dirección A). Sustituye la cabecera de Explorar y la tarjeta de vivienda; no cambia el servidor.

## Problema

A 375 × 812 la primera foto empieza a unos 414 pt y su precio queda bajo la barra de pestañas. Antes del contenido hay un panel decorativo de unos 150 pt («Un lugar para llamar hogar»), un selector Todas/Casas/Apartamentos a ancho completo, una fila Lista/Mapa y una fila de recuento. La provincia, primera pregunta de quien busca casa, solo está dentro de la hoja de filtros. «En venta» aparece en todas las tarjetas y no distingue nada. El avatar de la cabecera repite la pestaña Mi espacio.

Objetivo: primera foto a unos 230 pt y precio de la primera vivienda visible sin desplazar.

## Diseño

1. **Barra superior**: marca, campana y mensajes. Se retira `AccountMenu` de Explorar.
2. **Título y búsqueda**: «Encuentra tu casa en Cuba» (una línea) y una búsqueda en píldora con el botón de filtros dentro. Placeholder «Barrio, municipio o calle». Se elimina `ExploreIntro`.
3. **Atajos deslizables** (una fila horizontal):
   - «Toda Cuba ▾»: abre el selector de provincias; con una elegida, el atajo muestra su nombre en estado activo.
   - «Casas» y «Apartamentos»: alternan `filters.type`; tocar el activo vuelve a «Todas».
   - «Hasta $30.000»: alterna `maxPrice = '30000'` (sin `minPrice`).
   - «3+ hab.»: alterna `minBedrooms = 3`.
   Los atajos exponen `aria-pressed` y miden al menos 44 pt de alto táctil.
4. **Resultados**: una línea con el recuento corto («N viviendas», «N encontradas» o «N viviendas en {provincia}», para caber a 320 pt) y el orden, que abre la hoja de filtros como hoy. Las etiquetas de filtros activos solo muestran lo que no refleja un atajo (rangos de precio o área distintos, dormitorios distintos de 3, baños, estado, negociable, comodidades), seguidas de «Limpiar búsqueda y filtros».
5. **Tarjeta** (`PropertyCard`, también en Favoritos):
   - Foto de 200 pt con esquinas de 16, sin marco ni sombra; el cuerpo va sobre el fondo de la pantalla.
   - Insignia «Nueva» si `createdAt` tiene menos de 7 días; se retira «En venta». Demo y anuncios locales conservan su etiqueta.
   - Corazón y contador de fotos sobre la imagen.
   - Precio 22/700 con «USD»; «Negociable» si `priceNegotiable === true`.
   - Título, zona («Vedado, La Habana») y datos («3 hab · 2 baños · 140 m²») en una línea cada uno, para que una zona larga no recorte los datos.
   - La variante horizontal (un único resultado en pantalla ancha) se mantiene con el mismo estilo.
6. **Mapa/Lista**: botón compacto al final de la línea de resultados, y el mismo botón flotante centrado sobre la barra de pestañas cuando esa línea ya salió de la pantalla. Con una lista corta el flotante taparía la invitación a publicar; al final de una lista larga, el relleno inferior lo deja libre. Se retira el conmutador anterior.
7. **Carga**: dos tarjetas de relleno en lugar del indicador circular.

Sin cambios: hoja de filtros, invitación a publicar al final de la lista, estado vacío, modo demo, rejilla de 2 y 3 columnas (≥ 700 pt), actualización por arrastre, paginación.

### Mi espacio

Al retirar el avatar de Explorar, Mi espacio debe cubrir la cuenta sin depender del menú del avatar. Con sesión, se añade el grupo **Cuenta** con filas «Ajustes de cuenta» (nombre, foto, privacidad y eliminar cuenta), «Preferencias de notificaciones» y «Cerrar sesión» en rojo, que sustituye al botón suelto. Se mantiene el icono de ajustes del título, al que remite `site/eliminar-cuenta.html`.

## Componentes

- `ExploreScreen.tsx`: nueva cabecera, atajos, línea de resultados, botón flotante, relleno de carga.
- `PropertyCard.tsx`: nueva tarjeta.
- `SelectionField.tsx`: prop opcional `renderTrigger(open)` para abrir su selector desde otro control; el atajo de provincia la usa con `PROVINCES`.
- `ExploreIntro.tsx`: se elimina.
- `ProfileScreen.tsx`: grupo Cuenta.
- `src/domain/listings.ts`: `isNewListing(createdAt, now)` pura, con prueba.

## Verificación

- `npm run check`.
- Navegador a 375 × 812, 320 × 740 y escritorio: posición de la primera foto, atajos activos y combinados con la hoja de filtros, provincia, mapa/lista, Favoritos, Mi espacio con y sin sesión. Capturas de antes y después.
