---
version: 1
name: KarmaHouse app · Mediopunto
description: >-
  La app de KarmaHouse (Android y app.karmahouse.site) de noche: fondo mar profundo, fotos de
  vivienda a pantalla completa y una sola forma propia, el mediopunto habanero, que enmarca las
  fotos en arco y enciende sus vidrios para mostrar progreso. Un azul de
  marca como único acento fuerte, sol para lo que pide atención y un cartel de papel cal
  («Se vende») para la operación. Calistoga en títulos y cifras; la fuente del sistema para todo
  lo demás. Cápsulas en botones y chips, tarjetas muy redondeadas, sin sombras en reposo.

colors:
  # Noche: modo por defecto de la app.
  ground: "#0A1626"          # fondo de pantalla
  sheet: "#0F1E31"           # hojas inferiores, barra lateral, campos dentro de tarjetas
  surface: "#13233A"         # tarjetas, filas agrupadas, botones redondos
  raised: "#1B3654"          # avatares, controles sobre tarjeta, pasos de contador
  photo-ground: "#050D18"    # fondo de fotos que no llenan su marco (object-fit: contain)
  ink: "#F3EFE7"             # texto principal (cal tibio, nunca blanco puro)
  body: "#C3CDD6"            # texto de párrafo y secundario fuerte
  muted: "#8FA2B5"           # metadatos, ayudas, etiquetas
  line: "rgba(215,226,236,0.12)"   # bordes finos de tarjeta y campo (0.06 entre filas)
  blue: "#8CC0F7"            # acento: acción principal, enlaces, precios, selección
  on-blue: "#0B1A29"         # texto sobre blue
  sol: "#E3B04B"             # atención: avisos sin leer, pendientes, Pro, foco de progreso
  sol-text: "#E7D2A6"        # texto sobre fondo teñido de sol
  danger: "#FF929D"          # texto e iconos de peligro
  danger-fill: "#B32839"     # botón destructivo (texto blanco)
  persiana: "#8CC7A1"        # éxito, «En el catálogo», aceptado
  ocre: "#E7BF72"            # en pausa, ya no disponible
  cream: "#FAF6EE"           # cartel y tarjetas de papel
  cream-ink: "#1A2B3B"       # texto sobre cream
  scrim: "rgba(10,22,38,0.62)"     # cápsulas y botones sobre foto
  dim: "rgba(5,13,24,0.62)"        # velo detrás de hojas y diálogos
  glow: "rgba(227,176,75,0.20)"    # luz de lámpara detrás de fotos y héroes

colorsDay:
  # Día: el modo Claro de Ajustes. Misma geometría, paleta de la landing.
  ground: "#FAF6EE"          # cal
  sheet: "#FFFFFF"
  surface: "#FFFFFF"
  raised: "#F2EADC"          # arena
  ink: "#1A2B3B"
  body: "#4D5A66"
  muted: "#66717D"
  line: "#E6DCCB"            # línea arena
  blue: "#0153A8"            # azul del logo
  on-blue: "#FFFFFF"
  sol: "#E3B04B"             # solo decoración; como texto usa ocre
  ocre: "#8A5C15"
  danger: "#C32935"
  persiana: "#3F6B4F"
  terracota: "#A84C33"       # solo puntos e iconos pequeños

typography:
  display:   { fontFamily: Calistoga, fontWeight: 400, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 }
  display-long: { fontFamily: Calistoga, fontWeight: 400, fontSize: 28, lineHeight: 32 }
  listing-title: { fontFamily: Calistoga, fontWeight: 400, fontSize: 30, lineHeight: 32, letterSpacing: -0.4 }
  sheet-title: { fontFamily: Calistoga, fontWeight: 400, fontSize: 24, lineHeight: 28 }
  section:   { fontFamily: Calistoga, fontWeight: 400, fontSize: 20, lineHeight: 24 }
  card-title: { fontFamily: Calistoga, fontWeight: 400, fontSize: 18, lineHeight: 22 }
  numeral-lg: { fontFamily: Calistoga, fontWeight: 400, fontSize: 32, lineHeight: 34, fontVariant: tabular-nums }
  numeral:   { fontFamily: Calistoga, fontWeight: 400, fontSize: 22, lineHeight: 26, fontVariant: tabular-nums }
  body:      { fontFamily: system, fontWeight: 400, fontSize: 16, lineHeight: 22 }
  body-sm:   { fontFamily: system, fontWeight: 400, fontSize: 15, lineHeight: 21 }
  control:   { fontFamily: system, fontWeight: 600, fontSize: 15, lineHeight: 20 }
  label:     { fontFamily: system, fontWeight: 600, fontSize: 13, lineHeight: 18 }
  caption:   { fontFamily: system, fontWeight: 400, fontSize: 12, lineHeight: 16 }
  price:     { fontFamily: system, fontWeight: 700, fontSize: 17, lineHeight: 22, fontVariant: tabular-nums }

rounded:
  sign: 4          # solo el cartel
  thumb: 16        # miniaturas cuadradas, celdas pequeñas
  inner: 22        # foto dentro de tarjeta, cajas dentro de tarjeta
  card: 24         # tarjeta por defecto, avisos
  card-lg: 28      # tarjetas con foto, tarjetas principales
  sheet: 32        # esquinas superiores de hojas y diálogos
  pill: 999        # botones, chips, campos de una línea, barra de navegación
  arch: "ancho / 2 arriba · 14–22 abajo"   # fotos en arco, avatares, logos

spacing:
  page: 16         # margen lateral de listas y paneles (20 en formularios, 24 en el texto de la ficha)
  safe-top: 52     # inicio del contenido bajo la barra de estado
  gap-xs: 6
  gap-sm: 8
  gap: 10
  gap-md: 12
  gap-lg: 14
  section: 24      # entre secciones
  touch: 44        # objetivo táctil mínimo

components:
  button-primary: { height: 56, radius: pill, bg: blue, fg: on-blue, font: control-16-650 }
  button-secondary: { height: 56, radius: pill, border: "1px rgba(215,226,236,0.28)", fg: ink }
  button-danger: { height: 56, radius: pill, bg: danger-fill, fg: "#FFFFFF" }
  button-icon: { size: 44, radius: pill, bg: surface }
  chip: { height: 36, radius: pill, bg: surface, selected: { bg: blue, fg: on-blue } }
  field: { height: 52, radius: pill, bg: surface, border: line, focus: blue }
  nav-bar: { height: 68, radius: pill, inset: 16, bottom: 20, bg: "ground al 85 % (cristal: desenfoque en iOS y web, translúcido en Android)", active: "icono propio relleno en sol de noche y en ocre de día, etiqueta en blue" }
  sheet: { radius-top: sheet, bg: sheet, handle: mediopunto-outline, backdrop: dim }
  card: { radius: card-lg, bg: surface, padding: 10 }
---

# DESIGN.md · KarmaHouse app

Cómo se ve la app de KarmaHouse en Android y en el navegador (app.karmahouse.site), que comparten
el mismo código de Expo en `src/`. La landing (`web/`) no sigue este archivo: tiene su estilo de día
en `BRAND.md` y la skill `landing-page-design`.

**Prioridad:** lo que pida el usuario → `BRAND.md` (hechos, voz, logo, colores de marca) → este
archivo → la skill `karma-app-design`. Si algo de aquí contradice un hecho de `BRAND.md`, gana
`BRAND.md`.

**Referencia visual:** el lienzo «KarmaHouse de noche»
(https://claude.ai/artifact/LVY8ywGMHRLqTUPBZrp6CZ) dibuja unas 80 pantallas con este sistema, por
flujos. Las referencias de Pinterest que lo inspiraron están en `artifacts/referencias/app/` (fuera
de git; solo inspiración, nunca se copian sus fotos ni marcas).

## 1. La idea

**La app es La Habana de noche; la landing, de día.** Contrastan sin dejar de ser la misma marca:
el mismo azul, Calistoga, la cal y el mar de `BRAND.md`.

**Cada casa, una ventana encendida.** La forma propia es el *mediopunto*, el abanico de vidrios de
colores sobre las puertas habaneras. Aparece en tres papeles y en ninguno más:

1. **Marco en arco** de las fotos en listas, miniaturas, avatares y logos de inmobiliaria.
2. **Progreso**: un mediopunto de 3 o 4 vidrios cuyas piezas se encienden (sol la actual, azul las
   terminadas, apagadas las que faltan): pasos de Publicar, verificación, etapa del interesado.
3. **Estados vacíos y finales**: apagado con un solo vidrio encendido cuando falta algo; entero
   encendido cuando algo terminó bien («Tu anuncio está en revisión»). El asa de las hojas es un
   mediopunto en contorno.

Lo acompañan dos piezas de la calle cubana:

- **El cartel**: «Se vende», «Se alquila», «Se permuta», «Se busca», en papel cal, Calistoga,
  esquinas casi rectas (4 px), girado entre −4° y 3°, con una sombra corta. Solo nombra la operación
  de una vivienda, y en estados finales «Vendida». Es la única excepción a la regla de cápsulas.
- **La luz de lámpara**: un resplandor sol muy suave (`glow`, 16–26 % de opacidad) detrás de una
  foto principal, un héroe o un avatar. Uno por pantalla como mucho.

## 2. Color

- El **azul** (`blue`) es el único acento fuerte: acción principal, enlaces, precios, selección y
  la etiqueta de la ruta activa. Nunca otro color saturado (`BRAND.md`).
- **Sol** marca lo que pide atención: no leídos, pendientes, Pro, el paso actual, la luz de lámpara y
  el icono de la ruta activa de noche (relleno, como un vidrio del mediopunto; de día va en `ocre`).
  Nunca como fondo de pantalla ni en bloques grandes; como mucho, tintes del 10–18 %.
- **Persiana, ocre y danger** solo en estados: chips con un punto, avisos y acciones destructivas.
- **Cream** solo en el cartel, en tarjetas de papel (una por pantalla: «Pega tu anuncio»,
  «¿Quieres Pro?») y en logos de inmobiliaria.
- Las superficies se separan por **un paso de tono** (`ground` → `surface` → `raised`), no por
  sombras.
- Texto sobre foto: siempre sobre `scrim` o sobre un degradado a `ground` en el borde inferior de la
  foto (es el «mar overlay» de `BRAND.md`).

Estados de anuncio (mismo chip en Mis anuncios, Cartera y Revisar anuncios):

| Estado | Color | Fondo del chip |
| --- | --- | --- |
| En el catálogo, Aceptada, Venta confirmada | `persiana` | persiana 16 % |
| En revisión, Pendiente, Sin usar | `sol` | sol 16 % |
| Necesita cambios, Anuncio retirado, Suspendida | `danger` | danger 14 % |
| En pausa, Ya no disponible | `ocre` | ocre 14 % |
| Borrador, Cerrado, Descartado, Caducado, Enviada | `body` | línea 10 % |

**Contraste comprobado (AA, 4,5:1 o más):** en noche, `muted` sobre `surface` 6,0, sobre `raised`
4,7; `blue` sobre `surface` 8,3; `on-blue` sobre `blue` 9,2; cada chip de estado sobre su tinte entre
5,8 y 6,7; blanco sobre `danger-fill` 6,4. En día, `muted` sobre blanco 5,0 y sobre cal 4,6; `body`
sobre arena 5,9; blanco sobre azul 7,5. No uses `muted` como texto sobre `raised` en tamaños
menores de 13.

## 3. Tipografía

- **Calistoga 400** para títulos de pantalla, de sección, de hoja y de tarjeta, y para **cifras**:
  precios grandes, contadores, datos de la ficha (3 · 2 · 140), fechas del calendario, números de
  página y totales. Nunca en negrita falsa ni por debajo de 16 px.
- **Fuente del sistema** para todo lo demás (Roboto en Android, San Francisco en iOS y la del
  sistema en la web).
- Escala: los roles de `typography` arriba. No inventes tamaños intermedios.
- Los títulos caben en **dos líneas** como mucho. Si no, `display-long` y después recorta palabras.
- Cifras alineadas con `tabular-nums`. Importes con `formatMoney` / `formatUsd` (`Intl`), nunca
  armados a mano.
- Frase en color: un título puede llevar una frase en `blue` («Encuentra *tu lugar*.»). Los títulos
  que escribe el usuario (anuncios) nunca.

## 4. Forma y espacio

- **Cápsula** en todo lo que se toca: botones, chips, campos de una línea, buscador, barra de
  navegación, paginación, interruptores.
- **Tarjetas** muy redondeadas (`card` 24, `card-lg` 28) y la foto dentro con `inner` 22.
- **Arco** para fotos en listas: radio superior igual a la mitad del ancho y 14–22 abajo.
- **Sin sombras en reposo.** Solo flota con sombra lo que de verdad flota: barra inferior, menús,
  el cartel y los avisos.
- Bordes finos de 1 px en `line` para tarjetas sobre tarjetas, campos y hojas. Nada de rejillas,
  marcas ni divisores decorativos.
- Objetivo táctil mínimo de 44 px; filas de 52–56 px.
- Margen lateral 16 en listas y 20 en formularios; 24 entre secciones.

## 5. Fotos

- **En la ficha y la galería la foto se ve completa**: `object-fit: contain` sobre `photo-ground`,
  sin recortar. En listas sí se recorta, dentro de un arco.
- Miniaturas bajo la foto para cambiarla; «+N» abre la galería a pantalla completa.
- Las fotos de ejemplo llevan «Imagen ilustrativa»; los datos inventados, «Ejemplo de uso»
  (`BRAND.md`). En la app real esas etiquetas no existen: solo van en maquetas y capturas.
- Con **Ahorro de datos** las fotos cargan al tocarlas y el mapa al pedirlo: deja un hueco del mismo
  tamaño con el arco y el icono, nunca un salto de diseño.

## 6. Componentes

Las piezas viven en `src/components/ui.tsx` y vecinos. Reutiliza antes de crear.

- **Barra inferior flotante**: cápsula de 68 px, a 16 px de los lados y 20 del borde. Es un cristal
  teñido con el fondo (`ground` al 85 %): con desenfoque en iOS y la web, translúcido sin desenfoque
  en Android, y opaco con «Reducir transparencia» o alto contraste. Flota sobre las pantallas, que
  terminan su contenido por encima (`TabBarSpace`). Cuatro destinos con icono y etiqueta: Explorar,
  Favoritos, Publicar, Mi espacio. El activo conserva su icono, relleno en `sol` de noche y en `ocre`
  de día, y pone la etiqueta en `blue`; sin fondo detrás. Una cuenta con sesión muestra su avatar, con
  un aro del mismo color si está activa.
- **Barra lateral** desde 1024 px de ancho: 248 px, fondo `sheet`, logo arriba y la cuenta abajo. El
  activo, igual que en la barra inferior: icono relleno (sol de noche, ocre de día) y etiqueta en blue,
  sin cápsula.
- **Botones**: principal en `blue` con texto `on-blue`; secundario con borde; destructivo en
  `danger-fill`; de Pro con borde y texto sol. Uno principal por pantalla.
- **Botones redondos** de 44 px para volver, cerrar, compartir y favoritos; sobre foto, con `scrim`.
- **Chips y filtros**: cápsulas de 36 px; el elegido en `blue`. Si no caben, una fila deslizable,
  nunca dos filas de filtros.
- **Selector segmentado**: contenedor `surface` con la opción elegida en `blue`.
- **Campos**: etiqueta encima (13 px, 600), cápsula de 52 px y texto de 16. Los textos largos van en
  caja de 24 px de radio. El ejemplo va en el *placeholder* y termina en «…».
- **Buscador**: cápsula de 50–52 px con lupa; filtra mientras escribes y no distingue tildes.
- **Listas largas**: paginación numerada (flechas y números Calistoga en círculos de 44 px, el actual
  en `blue`) y «Mostrando 1–3 de 11» encima. Tamaño de página según la pantalla (3 en Mis anuncios y
  Cartera; 10 en Comisiones).
- **Hojas inferiores**: esquinas de 32, fondo `sheet`, asa en mediopunto y velo `dim` detrás. Son el
  patrón por defecto para confirmar, elegir y escribir motivos.
- **Diálogos centrados** solo para explicar algo sin acción (Nivel e insignia). **Menús** flotantes
  anclados al botón que los abre, con radio 26.
- **Avisos** en línea: información en azul 8 %, atención en sol 10 %, peligro en danger 10 %, con
  icono y frase completa. **Toast** invertido sobre la barra inferior: fondo `ink`, texto `ground` y
  la acción («Deshacer») en el azul de día.
- **Interruptores** de 52 × 32 en cápsula; **contadores** con − y + de 40 px y la cifra en Calistoga.
- **Carrusel en arco** solo en el inicio de Explorar: la tarjeta central grande y las laterales
  atenuadas. La tira sigue el dedo y se asienta en la vivienda más cercana; el marco del arco central
  se queda quieto.

## 7. Movimiento

Sigue `BRAND.md`: todo entra con `cubic-bezier(.22,1,.36,1)`, nada rebota ni gira.

- Pulsar: escala 0,98 (`MotionPressable`).
- Listas y secciones: suben 16–24 px con opacidad, escalonadas 80 ms.
- Firma: los vidrios del mediopunto se encienden uno a uno (pasos y estados finales).
- Ficha: la foto se abre hacia arriba como una puerta.
- Hojas: suben desde abajo con `translateY` (`SheetRise`), nunca con una animación de diseño como
  `SlideInDown`: en Android el `Modal` se mide primero sin las barras del sistema y la hoja se quedaba
  por encima del borde. El velo aparece a la vez.
- Con «Reducir movimiento» no hay desplazamientos, solo cambios de opacidad (`useReducedMotion`). Lo
  que mueve la persona sigue a su dedo igual: el carrusel se desliza y solo se acorta su asentamiento.

## 8. Texto y voz

- Español de Cuba, tú, frases cortas (`BRAND.md`). Botones que dicen lo que hacen («Escribir a
  quien publica», «Enviar a revisión»).
- **Nunca «verificado» ni «garantizado».** Se dice «Revisado antes de publicarse», «Perfil revisado
  por KarmaHouse» y «Sello empresarial». Cada sello aclara que no acredita la propiedad.
- KarmaHouse no cobra comisión: lo repite cualquier pantalla de cierres o comisiones.
- Fechas y horas con `Intl` y «hora de Cuba» donde importe. «…» y no «...».

## 9. Accesibilidad

Las reglas de *Web Interface Guidelines* de Vercel, en React Native:

| Regla | Cómo en esta app |
| --- | --- |
| Botón de solo icono con nombre | `accessibilityLabel` («Guardar en favoritos», «Cerrar filtros sin aplicar») |
| Elemento correcto | `accessibilityRole` `button`, `link`, `tab`, `switch`, `radio`, `header`; nunca un `View` con `onPress` |
| Estado visible al lector | `accessibilityState` `{ selected, checked, disabled, busy, expanded }` |
| Foco visible en la web | anillo `blue` de 3 px con separación; nunca quitarlo sin sustituto |
| Campos con etiqueta | etiqueta visible y `accessibilityLabel`; `autoComplete`, `keyboardType` / `inputMode` correctos; sin bloquear pegar |
| Cambios que se anuncian | `accessibilityLiveRegion="polite"` en resultados, totales y errores |
| Movimiento reducido | `useReducedMotion` y `ReduceMotion.System` en Reanimated |
| Imágenes | `accessibilityLabel` descriptivo; decorativas con `accessible={false}` |
| Texto ampliable | sin `allowFontScaling={false}`; los diseños soportan 130 % |
| Áreas seguras | `useSafeAreaInsets` en la barra, las hojas y la acción fija inferior |
| Gestos | todo deslizar tiene un botón equivalente (flechas de galería y carrusel) |
| Confirmar lo destructivo | hoja con texto claro; borrar y retirar piden motivo cuando el servidor lo exige |

## 10. Pantalla ancha (web)

- Hasta 767 px: el diseño de teléfono.
- 768–1023 px: el mismo, con el contenido a 720 px de ancho como mucho y centrado.
- Desde 1024 px: barra lateral y, en listas con detalle (revisar anuncios, cartera, mensajes),
  dos columnas: la lista de 360 px y el detalle al lado. Mismos tokens y componentes.

## 11. Modo día

Ajustes ofrece Claro, Oscuro y Sistema; **la app abre en Oscuro (noche)**. El modo día usa
`colorsDay` con la misma geometría: fondo cal, tarjetas blancas con línea arena, azul del logo y
la barra inferior de cristal cal (cal al 85 %) con sombra suave. El sol nunca se usa como texto en
día (usa `ocre`). El icono de la ruta activa va relleno en `ocre` de día (5,4:1 sobre el cristal cal;
en sol quedaba en 1,8:1) y en sol de noche (9,2:1); la etiqueta en azul repite el estado (6,9:1).

## 12. Prohibido

- Otros colores saturados, degradados de colores, neón, brillos que no sean la luz de lámpara.
- Morado, naranja o verde de las referencias de Pinterest.
- Emoji como iconos, etiquetas diminutas en mayúsculas espaciadas, numeración 01/02/03 como adorno.
- Tarjetas de icono repetidas como único contenido; sombras bajo cada tarjeta.
- Cifras, reseñas, socios o premios inventados (`BRAND.md`).
- Calistoga en texto de párrafo, en negrita falsa o por debajo de 16 px.
- El mediopunto fuera de sus tres papeles (también en la barra: la ruta activa lleva su propio
  icono), o el cartel para algo que no sea la operación.
- Texto sobre foto sin `scrim`.

## 13. De la maqueta al código

1. **Tokens** en `src/theme/palette.ts`: `darkColors` toma los valores de `colors` y `lightColors`
   los de `colorsDay` (mismas claves que hoy: `paper` → `ground`, `surface` → `surface`,
   `primary`/`primaryFill` → `blue`, `onPrimary` → `on-blue`, `amber` → `sol`, `green` → `persiana`).
   El modo por defecto pasa a Oscuro en `src/settings/appearance.ts`.
2. **Fuente**: Calistoga en TTF dentro de `assets/fonts/`, cargada con `expo-font`; `typefaces.display`
   en `src/theme.ts` pasa a `Calistoga`. Comprobar en un Android real.
3. **Escala, radios y espacios** como constantes en `src/theme.ts`, al lado de `internalLayout`.
4. **Piezas nuevas** en `src/components/`: `Mediopunto` (vidrios y estado encendido), `Cartel`,
   `ArchImage`, `Sheet` con asa y velo, `Pagination`, `StateChip` con la tabla de estados.
5. Después, pantalla por pantalla con la skill `karma-app-design`, siguiendo el lienzo.

### Qué artboard del lienzo corresponde a cada ruta

| Ruta en `src/app/` | Artboards |
| --- | --- |
| `(tabs)/index` | B · Explorar, Resultados, Ordenar por, Filtros, Guardar búsqueda, B · Mapa |
| `(tabs)/favorites`, `saved-searches` | Favoritos, Favoritos vacío, Mis alertas, ¿Borrar esta alerta? |
| `property/[id]` | B · Ficha, Ficha completa, Galería, Elegir contacto, Entra en tu cuenta, Visitas y ofertas, Proponer una visita, Hacer una oferta, Reportar anuncio, Vivienda no disponible |
| `user/[id]` | Perfil público, Nivel e insignia |
| `messages`, `messages/[id]`, `notifications` | Bandeja, Bandeja vacía, Conversación, Opciones, Reportar conversación, ¿Bloquear?, Conversación bloqueada, Notificaciones |
| `(tabs)/publish`, `edit/[id]` | Publicar, Pegar anuncio, Publicar con ayuda, Paso 1–3, Elegir provincia, Ubica tu vivienda, Anuncio en revisión |
| `(tabs)/profile`, `my-listings`, `account-settings`, `notification-settings`, `auth`, `pro`, `requests` | Mi espacio, Actualización, Mis anuncios, ¿Cerrar este anuncio?, Ajustes de cuenta, ¿Eliminar tu cuenta?, Preferencias, Entrar o crear cuenta, Revisa tu correo, KarmaHouse Pro, Visitas y ofertas |
| `agency-*` | Mi inmobiliaria, Cartera, Vivienda de la cartera, Seguimientos, Expediente, Agenda, Cierres, Equipo, Invitación, Perfil comercial, Verificación, Solicitud, Comisiones (gestor, administrador, sin tabla), Tabla de comisiones, Reparto especial |
| `administration`, `admin*`, `property-reports`, `message-reports`, `assisted-listings` | Administración, Revisar anuncios (y su versión de escritorio), Reportes de anuncios, Reportes de mensajes, Cuentas, Revisar inmobiliarias, KarmaHouse Pro (gestión), Historial, Publicación asistida |

Sin artboard propio (usan piezas de arriba): `listing-transfers`, `listing-transfer/[id]`,
`agency-property-requests`, `agency-duplicate-reviews`, `agency-conversation/[id]`,
`assisted-listing-editor`, `admin-listings` y `+not-found`.
