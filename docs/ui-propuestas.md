# Propuestas de mejora de la interfaz — 22 de septiembre de 2026

Revisión de diseño de las pantallas existentes con motivo del logo nuevo. Trece revisiones independientes (una por área) produjeron 129 hallazgos; 67 de ellos pasaron además por dos revisores adversarios (uno comprobó que el problema existe en el código, otro que la propuesta es realizable con Expo SDK 57 y las dependencias instaladas). La columna «Verif.» indica ×2 cuando ambos confirmaron y ×1 cuando solo hubo la revisión inicial más una comprobación puntual del código. Tres hallazgos se descartaron por refutados (dos pedían cambiar el azul primario, que ya está alineado con el logo en este mismo cambio; uno describía una franja vacía en la cola de moderación que no puede darse).

Todas las propuestas se limitan a lo instalado: React Native 0.86, expo-router, expo-blur, Ionicons, MapLibre. Esfuerzo: S = horas, M = uno o dos días, L = tres a cinco días.

## Lo que ya cambió con el logo

- `assets/karmahouse-logo.png` es el logo completo con fondo transparente; `assets/karmahouse-mark.png` el símbolo. `scripts/render-logo.py` deriva de la imagen original el icono de la app (símbolo blanco sobre azul de marca, con margen para la máscara adaptativa de Android), el favicon y el icono de notificaciones. Los SVG antiguos y los assets de plantilla de Expo se eliminaron.
- `colors.primary` pasa de `#0066D6` a `#0153A8`, el azul medido en el logo. Blanco sobre ese azul da 7,5:1 (antes 5,4:1). `app.json` usa el mismo valor para el fondo del icono adaptativo y el color de notificaciones.
- Componente `Brand` en `src/components/ui.tsx`: símbolo más wordmark con «Karma» en negrita y «House» en regular, como en el logo. Se usa en la cabecera de Explorar, en Autenticación y en la insignia del mapa.
- Pendiente: pantalla de arranque (splash) con el símbolo. Requiere instalar `expo-splash-screen` y añadir el plugin en `app.json`; hoy la app arranca sobre blanco. Verificar el icono en un teléfono tras el próximo build de EAS.

## Impresión general

La base es más sólida que la media: primitivas con semántica de accesibilidad, objetivos táctiles de 44 pt casi universales, borradores persistentes en formularios y chat, estados vacíos con acción contextual, y privacidad real en la ubicación aproximada. Lo que se nota como «falta de pulido» tiene tres causas concretas y repetidas en todas las áreas: cabeceras y tarjetas decorativas que empujan el contenido útil bajo el pliegue (portada, autenticación, conversación, preferencias de avisos), color y tipografía decididos archivo por archivo (115 valores hex y 34 tamaños de fuente fuera de `theme.ts`), y acciones de peso distinto dibujadas con el mismo botón. La mayor oportunidad es la portada: hoy la primera vivienda aparece a unos 540 pt en un teléfono, justo lo contrario del objetivo escrito en `docs/apple-ui.md`.

## Prioridades

Ordenadas por impacto para el usuario ponderado por esfuerzo.

1. **Portada: la primera vivienda antes del pliegue.** (S, ×2 parcial) A 390 pt se apilan cabecera, panel de bienvenida de 187 pt, búsqueda, segmentos y dos titulares con rol de encabezado antes de la primera foto (`src/screens/ExploreScreen.tsx:73`, `src/components/ExploreIntro.tsx:27-32`). Hacer: montar `ExploreIntro` solo cuando no hay filtros ni búsqueda; compactar el panel (paddingVertical 16, arte 104 px); bajar «Explora viviendas» a 15/600 para que cada estado tenga un solo H1; eliminar el bloque «A tu manera» (`:122-134`), que duplica el conmutador de mapa y la pestaña Favoritos y solo aparece tras cargar todas las páginas; mostrar el banner «Tu vivienda, aquí.» solo bajo una lista real (`:135` → `(result.length > 0 || view === 'map') && !storageError`); quitar el eyebrow de 8 px del banner.

2. **Publicar: el precio se puede publicar mal y las fotos obligatorias quedan escondidas.** (S, ×1 comprobado) «85.000» pasa la validación como 85 porque `normalizeDecimalInput` solo cambia coma por punto, y la pantalla Revisar imprime la cadena cruda (`src/components/ListingForm.tsx:435`) en vez de `formatMoney`. Hacer: `formatMoney(Number(draft.price))` en Revisar y una línea de 12 px bajo Precio y Superficie con «Se publicará como $ 85 USD». Mover `<ListingPhotos>` al inicio del paso Detalles (hoy es la última tarjeta, `:404`) con asterisco de obligatorio en modo nube, y sustituir los dos `scrollTo({ y: 0 })` de `:154` y `:174` por un `Notice error` con los campos que fallan; hoy la pantalla salta arriba y el único error queda al fondo.

3. **Accesibilidad transversal en web e iOS.** (S–M, ×1) react-native-web descarta `accessibilityState`, así que en navegador ningún filtro, pestaña de vista o selector anuncia su estado; el patrón correcto ya existe en `ExploreScreen.tsx:87` (`aria-pressed`). No hay ninguna llamada a `announceForAccessibility`, por lo que VoiceOver no oye «Cambios guardados», errores ni cambios de paso. Hacer: `aria-pressed={active}` en `Pill` e `IconButton` (`src/components/ui.tsx`) y `aria-expanded` en los desplegables; helper `announce()` en ui.tsx llamado al fijar éxito, error y paso; `aria-hidden` por defecto en `Icon` (hoy cada icono decorativo es una parada de foco); `accessibilityRole="header"` en las nueve secciones de texto plano (filtros, fotos, historial, títulos de hojas).

4. **Color en un solo sitio.** (M, ×2 parcial) 115 hex en 36 archivos: ocho bordes de tarjeta, ocho azules suaves y diez gris-azules de texto que son variaciones del mismo color; el cambio de marca hay que perseguirlo archivo por archivo. Hacer en `src/theme.ts`: `border` único frío (`#E3E8F0`) y sustituir los ocho bordes; todos los paneles azules a `softBlue`; añadir `inkBlue: '#143658'`, `mutedBlue: '#4C6C93'`, `softDanger: '#FCEEF0'`, `overlay: '#14283D70'`, `rose`/`softRose` para Favoritos; reasignar el banner marino `#173B60` a `colors.primary`. Es el prerrequisito de las prioridades 12 y 13 y deja el modo oscuro preparado sin abrirlo.

5. **Notificaciones: tarjeta pulsable y preferencias que se guardan al soltar.** (S/M, ×2) La tarjeta de aviso es un `View` con dos botones secundarios idénticos de 44 px y mide unos 330 px (`src/components/notifications/NotificationCard.tsx:18-48`); en un teléfono entra tarjeta y media. Los interruptores de preferencias mutan un borrador y exigen «Guardar», y al volver atrás se pierden (`src/screens/NotificationSettingsScreen.tsx:61-91`). Hacer: raíz `Pressable` con etiqueta compuesta, un solo control compacto «Marcar como leído» y chevron, padding 16; en preferencias, llamar a `store.savePreferences` en `onValueChange` con indicador por fila y revertir si falla, y retirar los botones Guardar/Descartar. Además, borrar `NotificationHeader.tsx` y usar `PageTitle` (única cabecera distinta de la app), quitar la tarjeta intro de 150 px antes del primer interruptor y fusionar el recuento en la Pill «Sin leer».

6. **Mi espacio: un CTA para el invitado y una puerta visible a Ajustes.** (S/M, ×2 parcial) El invitado ve dos tarjetas de bienvenida seguidas y cinco filas con contador «0» que llevan a otra invitación a entrar (`src/screens/ProfileScreen.tsx:38`). Ajustes de cuenta solo se alcanza tocando el avatar, sin ninguna señal de menú (`:30`). Hacer: para invitado, botón «Iniciar sesión o crear cuenta» dentro de la tarjeta de identidad y filas que vayan a `/auth?returnTo=…`; grupo «Cuenta» con Ajustes, Preferencias de avisos, filas admin y «Cerrar sesión» en rojo, retirando los botones sueltos; `right={<IconButton name="settings-outline" …/>}` en el PageTitle; filas a 60 px sin descripciones que no aportan estado; ocultar contadores cuando son 0 (`:60`, `:68`); descripción de Notificaciones coherente con lo que la campana sirve (`:43`).

7. **Ficha: galería con el pulgar y mapa que no atrapa el scroll.** (S/M, ×2 la galería) La foto principal no se desliza; hay tres mecanismos para cambiar de foto y seis controles flotando sobre ella (`src/screens/DetailScreen.tsx:72-82`). El mapa de 280 px es interactivo por defecto dentro del ScrollView y captura el arrastre y la rueda (`:123`). Hacer: `ScrollView horizontal pagingEnabled` con un `PropertyImage` por foto, flechas solo en web, contador a `#000000A6`; `interactive={false}` en el KarmaMap de la ficha y quitar el `mapFrame` duplicado; un solo precio protagonista (barra inferior a 17/600 con «Precio negociable · USD»); `condition` y `floor` como características 4.ª y 5.ª y el chip «Negociable» junto al precio, eliminando «Más detalles»; `sectionTitle` a 17/600 y título a 26/700; foto hasta el borde superior (`edges={['left','right']}` y `top: insets.top + 8` en la navegación).

8. **Mapa: qué hace cada toque.** (S, ×1 comprobado) Clúster y precio son la misma cápsula blanca y el lector anuncia «Vivienda 12» para un grupo de 12 (`src/components/ExploreMap.tsx:36`, `src/components/maps/KarmaMap.tsx:48`). Un fallo de red se traga en `useMapView` (`src/catalog/useCatalog.ts:127`) y se muestra como «No hay viviendas en esta zona» sin reintento. No hay forma de cerrar la vivienda seleccionada. Hacer: `kind: 'listing' | 'cluster'` en `MapMarker` y círculo azul de 44 px con la cuenta en blanco para clústers; exponer `error` y `retry()` desde `useMapView` y pintar `Notice error` + «Reintentar»; `onMapPress={() => setSelectedId(undefined)}`; en la ficha, no pasar `selectedMarkerId` cuando la ubicación es aproximada (hoy un pin sólido contradice «El punto exacto no se publica», `DetailScreen.tsx:126`).

9. **Mis anuncios: responder «¿está mi vivienda en el catálogo?».** (S, ×2) Estado comercial y de moderación se apilan con el mismo tamaño y «Aprobado» va en azul primario, el color de las acciones (`src/screens/MyListingsScreen.tsx:65-69`). Pausar/Reactivar ignoran la moderación y reactivar un vendido no pide confirmación (`:80-82`). Hacer: un único chip derivado de ambos campos (Necesita cambios / Borrador / En revisión / En el catálogo / En pausa / Vendido) con tokens existentes; «Pausar» solo si activo y aprobado; vendido → activo por el mismo modal que activo → vendido; «Enviar a revisión» como único primario cuando está en borrador o rechazado; etiqueta accesible con estado, precio y ubicación (`:62`).

10. **Navegación: un solo «Volver» y un badge que cuente todo.** (S, ×2 el badge) Cinco destinos distintos para Volver sin historial (`ui.tsx`, `NotificationHeader`, `ConversationScreen:154`, `AuthScreen:65`, `EditScreen:22`). El badge de la pestaña Mi espacio solo cuenta mensajes (`src/app/(tabs)/_layout.tsx:39`); tres notificaciones sin leer son invisibles en tres de las cuatro pestañas. Cinco implementaciones de badge numérico. Hacer: helper `goBack(fallback)` en ui.tsx y prop `fallback` en `PageTitle`; badge = mensajes + notificaciones; `CountBadge({ count, size })` en ui.tsx reutilizado por campana, mensajes, filtros y bandeja; títulos iguales a la etiqueta de entrada («Visitas y ofertas», «Preferencias de notificaciones»); `+not-found` con área segura, margen y Volver.

11. **Autenticación: el formulario bajo el pliegue y el teclado que no avanza.** (S, ×2 en cuatro de seis) Unos 300 px de cabecera decorativa antes del primer campo; el CTA desaparece con el teclado (`src/screens/AuthScreen.tsx:130-133`). «Siguiente» no mueve el foco (`:95`), el error se inserta encima del botón y lo desplaza (`:100`), ningún campo se marca como inválido, el placeholder `#8E8E93` da 3,3:1 (`:118`). Hacer: sin tile en signin/signup, título 32/38 sin saltos forzados, `form.marginTop` 20; refs y `onSubmitEditing` con `submitBehavior="submit"`; `Notice` debajo del botón y prop `invalid` en `Field`; `placeholderTextColor={colors.muted}`; en «Olvidé mi contraseña» un solo botón lleno; extraer `Segmented` a ui.tsx y usarlo aquí, en Explorar y en el selector Aproximada/Exacta.

12. **Mensajes y negociaciones: menos cabecera, más hilo, estado visible.** (S/M, ×1) Unos 200 pt de cabecera, tarjeta de vivienda y tarjeta «Visitas y ofertas» antes del primer mensaje (`src/screens/ConversationScreen.tsx:153-163`); el botón «Ir al final» está en flujo y salta la lista (`:191`); metadatos a 10 px y «Enviado» en cada burbuja (`MessageBubble.tsx:16-39`). En negociaciones cinco de seis estados comparten la misma insignia gris de 10 px (`NegotiationCard.tsx:16-32`) y hasta cuatro botones secundarios idénticos por tarjeta. Hacer: vivienda en la cabecera como subtítulo pulsable y negociaciones como `IconButton` junto al menú; `toBottom` absoluto; hora a 12 px y estado solo en pendiente/fallido/último; mapa de estilo por estado con `softBlue/softGreen/softDanger/paper`; variante `plain` en `Button` para acciones terciarias; `loading` por botón pulsado en vez de atenuar todas las tarjetas; hoja anclada abajo en móvil como en la ficha. Compositor de visita: minutos en pasos de 15, horas 07-20, día de la semana en `formatNegotiationValue` y resumen en vivo.

13. **Escala tipográfica y radios.** (M, ×1) 34 tamaños de fuente (8 a 39) y 43 radios (2 a 100); doce textos de 8-10 px, por debajo del mínimo de 11 pt de la HIG que el proyecto cita. Hacer: escala de ocho pasos en `theme.ts` (11, 13, 15, 17, 20, 24, 28, 34) y `radius = { sm: 8, md: 14, lg: 24, xl: 28, pill: 999 }`, aplicados primero en ui.tsx y en las seis pantallas más visibles; todos los eyebrows a 11 o eliminados; `AuthScreen` de 39 a 34. Borrar `typefaces.display`: resuelve a la fuente del sistema en las tres plataformas y solo se aplica en seis de veinte títulos.

14. **Favoritos: deshacer al quitar.** (S, ×2) Tocar el corazón borra la tarjeta en el mismo frame sin confirmación ni recuperación (`src/screens/FavoritesScreen.tsx:23`). El aviso de favoritos que dejaron de estar en venta va al final y sin cifra (`:24`). Hacer: conservar en sesión los listados quitados con opacidad 0,6 y corazón en contorno para restaurar con otro toque, más `Notice` «Quitado de favoritos · Deshacer»; mover el aviso bajo el título y cuantificarlo.

## Por área

### Explorar

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Pila de cabecera empuja la primera vivienda a ~540 pt y encadena dos H1 (`ExploreScreen.tsx:73`, `ExploreIntro.tsx:31`) | Crítica | Intro solo sin filtros; panel compacto; título de sección a 15/600 | S | ×1 (captura confirma) |
| Marino, verde, morado y ámbar fuera de tokens (`ExploreScreen.tsx:171-173`, `ExploreIntro.tsx:33-39`) | Moderada | Banner a `colors.primary`; atajos blancos; intro solo blanco, tinte y primary | S | ×2 |
| Al cambiar de segmento la única señal de carga está al pie (`ExploreScreen.tsx:120`, `controller.ts:38`) | Moderada | `replacing` en `CatalogState`; «Actualizando…» junto al recuento y celdas al 50 % | S | ×2 |
| Banner «Tu vivienda, aquí.» bajo el estado vacío filtrado y bajo el error (`:135`) | Moderada | Condición `(result.length > 0 \|\| view === 'map') && !storageError` | S | ×2 |
| «A tu manera» duplica mapa y Favoritos y solo aparece tras cargar todo (`:122-134`) | Moderada | Eliminar bloque y estilos | S | ×2 |
| «Ordenar» abre la hoja completa con el orden al final (`:103`, `CatalogFilters.tsx:51`) | Moderada | Menú anclado propio de ~25 líneas con `SORT_OPTIONS` como Pills, patrón de `AccountMenu` | S | ×2 |
| Insignia «En venta» constante en todas las tarjetas (`PropertyCard.tsx:27`) | Moderada | Mostrar «Negociable» solo cuando aporte; quitar los avisos de demo repetidos | S | ×1 |
| Título y ubicación sin `numberOfLines`, foto de altura fija, PNG de demo de 3,5 MB (`PropertyCard.tsx:32-44`) | Moderada | `numberOfLines` 2/1; `aspectRatio: 3/2`; demo a JPEG 1200 px | S | ×1 |
| Eyebrows de 8-9 px y chips de filtro de 36 pt (`:173`, `:162`) | Moderada | Quitar `sellerEyebrow`; eyebrow intro a 11; `filterTag` a 44 o `hitSlop` | S | ×1 |

Conservar: segmentos con `aria-pressed`, hoja de filtros con borrador aislado y recuento vivo, chips de filtros activos, rejilla 1/2/3 columnas con tarjeta horizontal para un solo resultado.

### Ficha de vivienda

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Galería sin deslizar y seis controles sobre la foto (`DetailScreen.tsx:72-82`) | Moderada | `ScrollView` horizontal paginado; flechas solo web; contador a `#000000A6`; chip de tipo a la fila de badges | M | ×2 |
| Precio dos veces con dos jerarquías (`:98`, `:143`) | Moderada | `barPrice` 17/600 y etiqueta «Precio negociable · USD» | S | ×1 |
| Mapa interactivo atrapa el gesto y esquinas recortadas (`:123`) | Moderada | `interactive={false}`; radio y borde desde `KarmaMap` | S | ×1 (código confirma) |
| Franja gris sobre el hero por `edges={['top',…]}` (`:69`) | Moderada | `edges={['left','right']}` y navegación a `insets.top + 8` con velo `#FFFFFF80` | S | ×1 |
| Título 24/600 pesa menos que secciones 21/700 (`:171-173`) | Moderada | `sectionTitle` 17/600, título 26/700 | S | ×1 |
| Ubicación como metadato con «, Cuba» y sin enlace al mapa (`:100`) | Moderada | 16/500 ink, sin «Cuba», «Ver en el mapa» con `scrollTo` | S | ×1 |
| Negociable, estado y planta enterrados en «Más detalles» (`:109-116`) | Moderada | Como características; «Negociable» junto al precio; `minWidth` 80 para 320 px | S | ×1 |
| Botón Contactar atenuado sin explicación (`:144`) | Moderada | `loading` en vez de `disabled` mientras carga; etiqueta según sesión | S | ×1 |
| Estado demo repetido cuatro veces; tarjeta de vendedor vacía en remoto (`:130-134`) | Menor | Ocultar tarjeta en demo; «Publicado el …» en remoto; modal cerrable por fondo y Escape | S | ×1 |
| Placeholder de foto ausente en gris verdoso `#E5E9E3` con texto de 11 px (`PropertyImage.tsx:15-17`) | Menor | `softBlue` + primary; prop `placeholderSize` | S | ×1 |

Conservar: barra de contacto persistente con bloqueo de dobles envíos, cobertura de estados, encabezados accesibles, tarjeta de características y explicación de la zona de 800 m.

### Publicar y editar

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| «85.000» se publica como 85 y Revisar no lo delata (`ListingForm.tsx:435`, `numericInput.ts:3`) | Crítica | `formatMoney` en Revisar; vista previa bajo Precio y Superficie | S | ×1 (código confirma) |
| Fotos obligatorias al final del paso y error fuera de vista (`:144`, `:154`, `:404`) | Crítica | `ListingPhotos` al inicio con asterisco; `Notice error` con campos en vez de `scrollTo(0)`; «Hacer portada» | S | ×1 (código confirma) |
| Mapa arranca sobre toda Cuba aunque la provincia ya está elegida (`LocationPicker.tsx:62`) | Moderada | `PROVINCE_CENTERS` en `mapConfig.ts`, prop `initialCenter`, botón «Usar el centro de {provincia}» | M | ×1 |
| Dos lenguajes de campo en la misma tarjeta (`SelectionField.tsx:60` vs `ListingForm.tsx:610`) | Moderada | En modo modal, `SelectionField` como fila subrayada con etiqueta 13/500 | S | ×1 |
| Errores genéricos y etiqueta «Los dormitorios» para «Habitaciones» (`listings.ts:200`, `:346`) | Moderada | «Indica el precio» / «debe estar entre X e Y»; renombrar etiquetas | S | ×1 |
| No se puede saltar a un paso desde el indicador ni desde Revisar (`:234`, `:430`) | Moderada | Indicador pulsable hacia atrás; «Editar» en Revisar | S | ×1 |
| El borrador se restaura en silencio y no hay «Empezar de nuevo» (`:94`) | Moderada | `Notice` «Recuperamos tu borrador · Empezar de nuevo» | S | ×1 |
| «Cancelar edición» pesa como «Anterior»; icono de disquete al enviar (`:493-508`) | Menor | Enlace de texto; `paper-plane-outline` en nube | S | ×1 |
| Indicador de pasos sin `accessible`; «Siguiente» del título no avanza (`:234`, `:271`) | Menor | `accessible` + `progressbar`; ref al campo siguiente | S | ×1 |
| Siete colores fuera de tokens (`SelectionField.tsx:60-62`, `ListingForm.tsx:611-613`) | Menor | Sustituir por `paper`, `border`, `softBlue`, `overlay` | S | ×1 |

Conservar: validación por paso con salto al primer inválido, borrador con debounce e IndexedDB, selector de ubicación con privacidad explícita, `SelectionField` con búsqueda sin acentos, fotos optimizadas en el dispositivo.

### Mi espacio y ajustes

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Invitado: dos bienvenidas y cinco filas que acaban en otra invitación (`ProfileScreen.tsx:38`) | Crítica | Un CTA en la tarjeta de identidad; filas a `/auth?returnTo` | M | ×1 |
| Ajustes solo tras un avatar sin señal; el menú repite la pantalla (`:30`, `AccountMenu.tsx:63`) | Crítica | Grupo «Cuenta»; icono de ajustes en `PageTitle`; omitir la fila de la ruta actual | S | ×1 |
| Filas de 79 px empujan «Publicar» y «Cerrar sesión» fuera de pantalla (`:107`) | Moderada | `minHeight` 60; descripción solo cuando comunica estado | S | ×2 |
| 22 colores propios: cinco azules suaves y una paleta navy (`:96-122`, `UserAvatar.tsx:15`) | Moderada | `rose`/`softRose` en theme; resto a `softBlue`, `ink`, `muted`, `border` | S | ×2 |
| Seis textos de 10-11 px (`:101`, `:122`, `AccountSettingsScreen.tsx:90`, `AccountMenu.tsx:76-78`, `AccountPrompt.tsx:22`) | Moderada | Mínimo 12 px | S | ×2 |
| Fila Notificaciones dice «Novedades de tus conversaciones» aunque la campana ya no las lleva (`:43`) | Moderada | «Avisos de visitas y ofertas»; revisar `NotificationsScreen.tsx:20` | S | ×2 |
| «Guardar cambios» en medio de la página; «Tus avisos» parece parte del formulario (`AccountSettingsScreen.tsx:76-82`) | Moderada | Fila de navegación «Otros ajustes» al final | S | ×2 |
| Avatar no pulsable en Ajustes y anunciado dos veces en el menú (`AccountSettingsScreen.tsx:64`, `UserAvatar.tsx:10`) | Menor | `Pressable` «Cambiar foto»; prop `decorative` en `UserAvatar` | S | ×2 |
| Contadores «0» y misma forma que la insignia de no leídos (`:60`, `:68`) | Menor | Ocultar en 0; cantidades como texto plano | S | ×2 |
| «TU KARMAHOUSE» en versalitas de 10 px contradice el wordmark (`:32`) | Menor | Retirar eyebrows; usar `Brand` donde haga falta el nombre | S | ×1 |

Conservar: filas con contador en la etiqueta accesible, `AccountMenu` con anclaje y guardas, patrón de guardado de Ajustes, contador de Favoritos coherente con su pantalla.

### Autenticación

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Formulario bajo el pliegue: ~300 px de cabecera (`AuthScreen.tsx:130-133`) | Crítica | Sin tile en signin/signup; título 32/38; márgenes 16/20 | S | ×1 (captura confirma) |
| «Siguiente» no mueve el foco (`:94-96`) | Moderada | Refs + `onSubmitEditing` + `submitBehavior="submit"` | S | ×2 |
| Errores no marcan el campo y desplazan el botón (`:100`) | Moderada | `Notice` bajo el botón; prop `invalid` en `Field`; validar antes de enviar | S | ×2 |
| Placeholder 3,3:1 y foco sin anillo en web (`:118`, `:141`) | Moderada | `colors.muted`; `boxShadow` de foco con `softBlue` | S | ×1 |
| Segmentado duplicado con métricas distintas y sin `aria-pressed` (`:134` vs `ExploreScreen.tsx:160`) | Moderada | `Segmented` compartido en ui.tsx | S | ×1 |
| Tres tamaños de título en el mismo flujo y saltos forzados que rompen a 320 px (`:131`, `:56`) | Moderada | Un estilo 32/38 sin `\n` en Auth y Callback | S | ×1 |
| Tras «Revisa tu correo» no se puede reenviar el enlace (`:84`) | Moderada | «Reenviar enlace» con `requestPasswordReset` / `supabase.auth.resend` y espera de 60 s | M | ×1 |
| En «Olvidé» tres salidas compiten con el CTA (`:103`) | Menor | Enlace de texto en vez de botón secundario | S | ×1 |
| Aviso de error con 4 px de padding (`ui.tsx:45`) | Menor | `paddingHorizontal: 14` cuando `error` | S | ×2 |

Conservar: accesibilidad base, `safeReturnTo` con lista blanca, copy por modo, autorrelleno para gestores de contraseñas.

### Mensajes

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| ~200 pt de tarjetas antes del primer mensaje (`ConversationScreen.tsx:153-163`) | Moderada | Vivienda en la cabecera; negociaciones como `IconButton`; un solo slot de banner | M | ×1 (código confirma) |
| Compositor editable cuando no se puede enviar (`:195`) | Moderada | Fila de bloqueo con motivo a 14 px y «Desbloquear» | S | ×1 |
| Todas las conversaciones con el mismo icono de casa; azul sin significado (`InboxScreen.tsx:52-75`) | Moderada | `UserAvatar` con iniciales; vivienda en `muted`; primary solo para no leídos | S | ×1 |
| Metadatos a 10 px, «Enviado» en cada burbuja, fallo en azul marino (`MessageBubble.tsx:16-39`) | Moderada | 12 px; estado solo en pendiente/fallido/último; borde `danger` en fallo; burbuja `accessible` | S | ×1 |
| «Ir al final» en flujo salta la lista (`:191`) | Moderada | `position: 'absolute'` con sombra | S | ×1 |
| Cuatro modales, cuatro implementaciones; «Bloquear» pesa como «Cancelar» (`:232`, `ReportConversationSheet.tsx:71`, `NegotiationSheet.tsx:26`) | Moderada | `Sheet` compartido en ui.tsx; `tone: 'danger'` en `Button` | M | ×1 |
| Conversaciones cortas pegadas arriba; `EmptyState` completo dentro del chat (`:225`) | Menor | `justifyContent: 'flex-end'`; vacío ligero | S | ×1 |
| Tarjeta «Visitas y ofertas» pesa más que las conversaciones (`InboxScreen.tsx:33`) | Menor | `IconButton` en el `right` de `PageTitle` | S | ×1 |
| Once colores fuera de theme en mensajería | Menor | Tokens `softDanger`, `overlay`, `onPrimaryMuted`, `tint` | S | ×1 |
| En web no se envía con Enter; burbujas de hasta 696 pt (`:195`) | Menor | `onKeyPress` Enter sin Shift; `maxWidth: 560` | S | ×1 |

Conservar: borradores por conversación, bandeja de salida con reintento, marcado de leído solo cuando el mensaje es visible, etiquetas compuestas en la bandeja.

### Negociaciones y visitas

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Cinco de seis estados con la misma insignia gris de 10 px (`NegotiationCard.tsx:16-32`) | Crítica | Mapa de estilo por estado con tokens; 12 px; punto de color; «Pendiente de ti» | S | ×1 |
| Botón pulsado sin progreso; todas las tarjetas se atenúan (`:23`) | Moderada | `pending: {id, action}` desde `useNegotiationMutations`; `loading` por botón | S | ×1 |
| Título duplicado en la hoja y dos formas de salir (`NegotiationComposer.tsx:39-50`) | Moderada | `onBack` en `NegotiationSheet`; chevron en vez de X mientras se compone | S | ×1 |
| Fecha y hora en cuatro selectores con buscador y sin resumen (`VisitDateTimeFields.tsx:26`, `domain.ts:53`) | Moderada | Minutos de 15, horas 07-20, `weekday: 'short'`, resumen en vivo | S | ×1 |
| No se ve con quién se negocia ni cuándo (`NegotiationCard.tsx:18`) | Moderada | Rol y fecha en la línea de autoría; «Caduca el …»; `otherName` desde la vista SQL (M) | S/M | ×1 |
| Al aceptar en «Pendientes» la tarjeta desaparece sin decir dónde quedó (`RequestsScreen.tsx:36`) | Moderada | «Visita aceptada. La verás en Todas.» con enlace | S | ×1 |
| Hasta cuatro botones secundarios idénticos por tarjeta (`:24`) | Moderada | Variante `plain`; «Abrir conversación» como enlace en la fila de vivienda | S | ×1 |
| Textos que explican un deshabilitado a 10-11 px (`ConversationNegotiations.tsx:47`) | Moderada | `Notice` de 13/20; estado 12; autoría 12/18 | S | ×1 |
| Hoja centrada mientras la ficha usa hoja inferior (`NegotiationSheet.tsx:26`) | Menor | Lógica de `DetailScreen`: `flex-end` en móvil, centrada en ancho | S | ×1 |
| Quince colores fuera de tokens y dos estilos de campo en el mismo formulario | Menor | Tokens existentes; igualar input a `SelectionField` | S | ×1 |

Conservar: vocabulario de acciones por tipo, borradores por propuesta con reintento idempotente, copy honesto sobre pagos, accesibilidad base.

### Notificaciones y push

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Tarjeta no pulsable con dos botones idénticos de 44 px (`NotificationCard.tsx:18-48`) | Crítica | Raíz `Pressable`; un control compacto; ~190 px por tarjeta | S | ×2 |
| Interruptores exigen «Guardar» y se pierden al volver (`NotificationSettingsScreen.tsx:61-91`) | Crítica | Guardar al soltar con indicador por fila y reversión | S | ×2 |
| `NotificationHeader` copia `PageTitle` con métricas distintas | Moderada | Borrar y usar `PageTitle` con `fallback` | S | ×2 |
| Tres cabeceras apiladas antes del primer interruptor (`:82`) | Moderada | Etiqueta de sección de texto en lugar de la tarjeta intro | S | ×2 |
| Resumen, «Marcar todos», refresco manual y tres avisos repetidos (`NotificationsScreen.tsx:35-56`) | Moderada | Recuento en la Pill; «Marcar todos» como `IconButton`; refresco solo en web | S | ×2 |
| Nueve tonos azul-gris a mano | Moderada | `cardBorder`, `surfaceBlue`, `inkBlue` en theme | S | ×2 |
| Badge numérico en tres versiones (`NotificationBell.tsx:19`, `ExploreScreen.tsx:67`, `InboxScreen.tsx:75`) | Moderada | `CountBadge` en ui.tsx | S | ×2 |
| Permiso bloqueado: el mismo mensaje tres veces (`PushDeviceCard.tsx:28-30`) | Moderada | Solo línea de estado y botón; check verde para «activado» | S | ×2 |
| En iOS y web la tarjeta push ocupa el primer lugar sin acción (`PushDeviceCard.tsx:11`) | Menor | Devolver `null` si no hay soporte; `Notice` corto tras los interruptores | S | ×2 |
| Un `header` por tarjeta y «· Cuba» en cada fecha (`NotificationCard.tsx:23-29`) | Menor | Quitar rol header; tiempo relativo con `Intl.RelativeTimeFormat`; punto decorativo | S | ×2 (parcial) |

Conservar: estados vacíos por filtro, campana con recuento accesible, mapa de estados de activación push, iconos de categoría en cuadrados redondeados.

### Favoritos, Mis anuncios, Admin y Reportes

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Mis anuncios no responde si la vivienda está en el catálogo (`MyListingsScreen.tsx:65-69`) | Crítica | Chip único derivado de estado + moderación; orden por acción pendiente | S | ×2 |
| Pausar/Reactivar ignoran la moderación; reactivar vendido sin confirmar (`:80-82`) | Moderada | Condición por moderación; mismo modal en ambos sentidos | S | ×2 |
| «Enviar a revisión» enterrado entre botones iguales (`:84`, `:130`) | Moderada | Primario cuando borrador/rechazado; quitar overrides de `actionButton` | S | ×2 |
| Quitar un favorito lo borra al instante sin deshacer (`FavoritesScreen.tsx:23`) | Moderada | Conservar en sesión con opacidad; `Notice` «Deshacer» | S | ×2 |
| Avisos de error con 4 px de padding (`ui.tsx:45`) | Moderada | `paddingHorizontal: 14` en la variante error | S | ×2 |
| Lector no oye estado, precio ni moderación (`:62`) | Moderada | Etiqueta compuesta; `header` en el título del modal | S | ×2 |
| Todos los reportes con la misma bandera azul; mensajes de la cuenta reportada no destacan (`MessageReportsScreen.tsx:100`) | Moderada | Mapa motivo → icono/color; borde `danger` en mensajes del reportado | S | ×2 |
| Botón «Actualizar» a ancho completo en tres pantallas (`:57`, `AdminScreen.tsx:77`, `MessageReportsScreen.tsx:96`) | Menor | `RefreshControl` como en Favoritos; botón solo en error; icono en web | S | ×2 |
| Descripción completa en la cola de revisión (`AdminScreen.tsx:92`) | Menor | `numberOfLines={4}` con «Leer más»; recuento de fotos en la línea meta | S | ×1 (parte refutada) |
| Favoritos retirados desaparecen en silencio y el aviso queda al final (`FavoritesScreen.tsx:24`) | Menor | Aviso bajo el título con cifra | S | ×2 |

Conservar: modales de confirmación para acciones irreversibles, guardas de auto-revisión explicadas, estados vacíos con acción correcta, renovación de URL firmadas.

### Mapas

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Clúster y precio son la misma cápsula; lector anuncia «Vivienda 12» (`ExploreMap.tsx:36`, `KarmaMap.tsx:48`) | Crítica | `kind` en `MapMarker`; círculo azul de 44 px; etiqueta «Grupo de N viviendas» | S | ×1 (código confirma) |
| Fallo de red mostrado como «No hay viviendas» (`useCatalog.ts:127`, `ExploreMap.tsx:68`) | Crítica | `error` y `retry()` desde `useMapView`; `Notice error` + «Reintentar» | S | ×1 (código confirma) |
| Mapa de la ficha captura el desplazamiento (`DetailScreen.tsx:123`) | Moderada | `interactive={false}` nativo; `cooperativeGestures` en web | S | ×1 |
| No hay forma de cerrar la vivienda seleccionada (`ExploreMap.tsx:52`) | Moderada | `onMapPress` que limpia la selección; botón cerrar en la tarjeta | S | ×1 |
| Zona aproximada con pin azul sólido en el centro (`DetailScreen.tsx:126`) | Moderada | Sin `selectedMarkerId` si aproximada; estilo `approximateMarker` a trazos | S | ×1 |
| El selector acepta un punto a escala de toda la isla (`LocationPicker.tsx:80`) | Moderada | Si zoom < 11, acercar al punto en vez de fijarlo | S | ×1 |
| Aproximada/Exacta apenas distingue la activa (`LocationPicker.tsx:86`) | Moderada | `Segmented` compartido o Pill activa rellena | S | ×1 |
| Cada paneo cambia la ayuda a «Cargando…» (`ExploreMap.tsx:68`) | Menor | «Cargando» solo en primera carga; chip «Actualizando» tras 300 ms | S | ×1 |
| Tres marcos distintos alrededor del mismo mapa; «⌂» en web vs Ionicons en nativo | Menor | Solo `KarmaMap` dibuja marco; SVG de casa en web | S | ×1 |
| Atribución de 10 px y 14 px de alto (`MapChrome.tsx:8-32`) | Menor | `Pressable` de 28 px con `hitSlop` o botón de información | S | ×1 |

Conservar: globos de 44 px con semántica real, estados de carga y error con reintento, redondeo de privacidad y círculo de 800 m, contrato único nativo/web.

### Navegación y estructura

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| Mensajes a dos toques desde tres pestañas; Publicar ocupa un destino fijo con otras tres entradas (`_layout.tsx:38`) | Moderada | Pestaña Mensajes en lugar de Publicar (decisión de producto) o `IconButton` de mensajes en Favoritos y Publicar | M | ×1 |
| Dos cabeceras para pantallas hermanas (`NotificationHeader.tsx:19`) | Moderada | `PageTitle` con `fallback` | S | ×2 |
| Cinco destinos distintos para Volver sin historial | Moderada | `goBack(fallback)` en ui.tsx; etiqueta «Volver» en la ficha | S | ×1 |
| Etiqueta de entrada ≠ título de destino («Visitas y ofertas» → «Solicitudes») | Moderada | Titular igual que la entrada; un término por concepto | S | ×1 |
| Badge de pestaña solo cuenta mensajes (`_layout.tsx:39`) | Moderada | Sumar notificaciones | S | ×1 |
| `tabContentBottom = 144` también en Editar, sin barra (`ListingForm.tsx:590`) | Menor | Prop `bottomInset`; hook con insets reales | S | ×1 |
| Subtítulos: eslóganes, ausencias y puntuación desigual | Menor | Solo subtítulo con estado o instrucción | S | ×1 |
| `+not-found` sin área segura ni Volver | Menor | `SafeAreaView`, margen 20, botón Volver | S | ×1 |
| Cinco badges numéricos distintos | Menor | `Badge({ count, tone })` | S | ×2 |

Conservar: geometría de la barra flotante, tres pistas de selección, `router.canGoBack()` en todas las cabeceras, cabecera de la ficha.

### Accesibilidad transversal

| Hallazgo | Sev. | Propuesta | Esf. | Verif. |
| --- | --- | --- | --- | --- |
| En web `accessibilityState` no llega al DOM (`ui.tsx:28-33`) | Crítica | `aria-pressed` / `aria-expanded` en primitivas y toggles | S | ×1 (código de RN-web confirma) |
| En iOS ningún cambio de estado se anuncia; cero `announceForAccessibility` | Crítica | Helper `announce()`; `useEffect` en `Notice` para errores; paso anunciado | M | ×1 (grep confirma) |
| Tarjeta de vivienda solo anuncia título y precio (`PropertyCard.tsx:24`) | Moderada | Etiqueta con tipo, ubicación y características | S | ×1 |
| Barra de 68 px fija y etiqueta de 11 px se recortan con texto grande; badge no anunciado (`_layout.tsx:27-39`) | Moderada | Altura según `fontScale`; `tabBarAccessibilityLabel` con no leídos | S | ×1 |
| Iconos decorativos son paradas de foco (`ui.tsx:9`) | Moderada | `aria-hidden` por defecto en `Icon` | S | ×1 |
| Secciones sin `header` (`CatalogFilters.tsx:34`, `ListingPhotos.tsx:47`, hojas modales) | Moderada | Rol header en nueve textos | S | ×1 |
| Insignias con altura fija y fuente de 10 px sin tope de escala; la de mensajes se lee dos veces | Moderada | `maxFontSizeMultiplier={1.3}`, `minHeight`; `Badge` compartido | S | ×1 |
| Objetivos < 44 pt: chips de filtro, atribución, «Actualizar» | Moderada | `minHeight` 44 o `hitSlop` | S | ×1 |
| Textos de 8-10 px | Menor | Mínimo 11 | S | ×1 |

Conservar: primitivas con semántica, 44 pt como norma, etiquetas compuestas con contexto, arte decorativo oculto al lector.

## Sistema de diseño

- Color: mover los 115 hex a `theme.ts` con los tokens listados en la prioridad 4. `softBlue` puede ajustarse a `#E8F0FA` para derivar del nuevo azul. Dejar fuera las ilustraciones (`ExploreIntro`, `EmptyState`) y los cuatro colores semánticos de iconos.
- Tipografía: escala de ocho pasos; ningún texto por debajo de 11 px; eliminar `typefaces.display`. Si se quiere eco del wordmark, una sola fuente con `expo-font` solo en títulos ≥ 24 px (M, ~100 KB).
- Radios: `radius` en theme con cinco valores; `pill` para botones, `md` para campos y tiles, `lg` para tarjetas, `xl` para hojas.
- Primitivas: `Button` con `plain` y `tone: 'danger'`, icono del secundario en `primary` en vez de `ink`; `Notice` con padding real en la variante error; `Segmented`, `CountBadge`, `Sheet` y `goBack` compartidos; `Icon` decorativo por defecto.
- Contraste: `#8E8E93` como placeholder (3,3:1) y `#B7C1CE` como anillo de opción (1,8:1) son los dos únicos fallos; `colors.muted` los resuelve.
- Modo oscuro: no ahora. Con el color en tokens, el coste posterior baja a un `useColors()` con `useColorScheme` y unos quince estilos inline.

## Plan sugerido

**Esta semana (todo S, sin decisiones de producto):** prioridades 1, 2, 9 y 14; de la 5, `PageTitle` en notificaciones y quitar la tarjeta intro; de la 8, error de red visible y `onMapPress`; de la 10, `goBack(fallback)` y badge sumado; de la 11, teclado, error bajo el botón y placeholder; `Notice` con padding, `Icon` con `aria-hidden`, `aria-pressed` en `Pill` e `IconButton`, chips de filtro a 44 pt, `sectionTitle` de la ficha a 17/600 y `interactive={false}` en su mapa.

**Próximas dos semanas:** prioridad 4 (tokens, prerrequisito del resto); tarjeta pulsable y guardado al soltar en notificaciones; Mi espacio para invitado y grupo «Cuenta»; galería con swipe y foto hasta el borde en la ficha; clúster distinto de precio; cabecera de Auth compacta y `Segmented`; vivienda en la cabecera de la conversación y estados de negociación por color; `announce()` en iOS; `CountBadge`.

**Después:** escala tipográfica y radios; `Sheet` compartido y `Button` con `plain`/`danger`; centrar el selector de ubicación por provincia; pestaña Mensajes en lugar de Publicar (requiere decidirlo); reenvío de correo de confirmación; splash con el símbolo; modo oscuro solo cuando el color viva en tokens y haya datos de uso nocturno.

## Verificación de este cambio

- `tsc --noEmit`: código 0. Suite: 225 pruebas, cero fallos.
- Navegador a 375 × 812: símbolo y wordmark en la cabecera de Explorar, en Autenticación (`/auth?mode=forgot`) y en la insignia del mapa; sin errores de consola.
- No se generó APK ni se probó en un teléfono: el icono adaptativo y el de notificaciones se ven en el próximo build de EAS.
