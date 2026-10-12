# Rediseño de la web con narrativa de scroll

11 de octubre de 2026. Aprobado por el usuario en esta conversación:

- Público: quien busca y quien publica, por igual.
- Audacia: narrativa con scroll (escenas fijas que cuentan una historia), con más recursos que el mínimo: «quiero algo innovador, usa un poquito de recursos».
- Tráfico principal: WhatsApp y redes, en móvil y con poco contexto.
- Concepto: «Del mapa a la conversación» envuelto en la ventana de la casa cubana.
- Transición del hero: «la ventana se convierte en teléfono», validada en el prototipo v2 (https://claude.ai/artifact/BRxwh5QF5GpWDiPhCEWp65). La puerta de persianas del prototipo v1 quedó descartada.
- El prototipo valida movimiento y ritmo, no el acabado: el usuario lo considera feo y espera el acabado del sitio actual.
- Construir directamente en `web/` sin prototipar las secciones restantes.

## Objetivo

Que quien llega desde un enlace de WhatsApp entienda en segundos qué hace KarmaHouse, viéndola funcionar, y descargue la app. La página sigue siendo una sola, prerenderizada, indexable y accesible, con la marca de `BRAND.md` y solo sus hechos.

## Restricciones

- Hechos: solo `BRAND.md` § Facts y lo que ya dice el sitio. Nunca «verificado», «garantizado» ni «16 provincias». Fotos y chats con «Imagen ilustrativa» y «Ejemplo de uso».
- Marca: Calistoga solo en 400, una frase en azul por título, botones y chips en píldora, curva `cubic-bezier(.22,1,.36,1)`, nada rebota, sin logos de terceros.
- Pila actual sin dependencias nuevas: React 19, Vite 8, Tailwind 4, `motion` 14, `lucide-react`, Calistoga de `@fontsource`.
- El HTML prerenderizado (`prerender.mjs`) contiene todo el texto. La página se ve completa sin JavaScript.
- `vercel.json` y las rutas `/p/:id` y `/agency/:id` no cambian.
- Las anclas actuales siguen funcionando: `#posibilidades`, `#app`, `#como-funciona`, `#publicar`, `#descargar`, `#preguntas`, `#contenido`.

## Estructura de la página

| # | Sección | Contenido | Movimiento |
|---|---|---|---|
| 0 | Cabecera | Marca, navegación (Cómo funciona, Toda Cuba, Publicar, Preguntas), «Descargar app». | Línea sol → terracota → azul que crece con el scroll. La navegación marca la sección actual con `aria-current`. |
| 1 | Hero | «Viviendas en Cuba». «Tu casa en Cuba, para *comprar / vender / permutar / alquilar*». «Compra, vende, permuta o alquila, y habla directamente con quien publica. Gratis y sin comisión.» Botón «Descarga KarmaHouse para Android» y enlace de texto «Publica tu vivienda». Prueba: «Anuncios revisados antes de publicarse · Chat privado · Toda Cuba». Ventana en arco con el mediopunto y `vedado.jpg`, «Hecho para Cuba», «Cada hogar, un nuevo comienzo.» y «Imagen ilustrativa. No corresponde a un anuncio.» | Al cargar, en CSS: entrada escalonada, el mediopunto se enciende y el verbo cambia una vez y se detiene. |
| 2 | Del mapa a la conversación (`#como-funciona`, `#app`) | Cuatro pasos con el texto del prototipo v2: Mapa, Ficha, Chat y Visita. | Escena fija. El arco se convierte en el teléfono y la cámara se aleja de la casa hasta el barrio, donde la casa queda como el pin terracota. Después caen los pins, sube la ficha con la misma foto, se marca el favorito, entra el chat, aparecen los mensajes y la visita pasa de «Pendiente» a «Aceptada». Los textos cambian por paso con un fundido de 0,45 s. |
| 3 | Toda Cuba (`#cuba`, `#posibilidades`) | «Las 15 provincias y la Isla de la Juventud». Mapa de la isla y la lista de los 16 territorios en el orden de `PROVINCES`. Debajo, las cuatro operaciones con el texto actual de cada tarjeta. | La isla se revela de oeste a este con una máscara y cada territorio se enciende mientras su nombre se resalta en la lista. Las tarjetas suben escalonadas. Sustituye a `ProvinceMarquee`. |
| 4 | Lema | «Un espacio para / encontrar tu lugar.» | Las palabras pasan del 62 % al 100 % de opacidad una a una, ligadas al scroll. El 62 % es el mínimo que mantiene el contraste 3:1 de texto grande en claro y oscuro. |
| 5 | Publica en tres gestos (`#publicar`) | «Dale un lugar a tu vivienda». «Publica en tres gestos.» Pasos: «Pega tu anuncio»: pegas el texto y el formulario se rellena solo, y revisas el resultado antes de enviarlo. «Revisión»: los anuncios se revisan antes de publicarse, y si hay que corregir algo ves el motivo. «En el mapa»: tu vivienda aparece en el catálogo y en el mapa, gratis y sin comisión. Tarjeta «¿Prefieres ayuda?»: KarmaHouse puede preparar el anuncio contigo por correo, con tu autorización, con el botón `mailto` actual. | Escena fija con el mismo componente de teléfono: el texto entra al teléfono, los campos se llenan uno a uno, «En revisión» pasa a «Publicado» y cae el pin. |
| 6 | Tu confianza también tiene su lugar | Las tres tarjetas actuales. | Suben escalonadas, una vez. La losa al 6 %. |
| 7 | Ventana al mar (`#descargar`) | El panel `mar` actual: 0.1.20, Android 7 o superior, los tres pasos de instalación, SHA-256, notas y botón «Descarga KarmaHouse para Android». | Al entrar, el mediopunto grande se enciende panel a panel, una vez. |
| 8 | Preguntas (`#preguntas`) | Las 8 preguntas actuales. | Como ahora. |
| 9 | Pie | Como ahora. | Ninguno. |

La versión, los enlaces del APK, SHA-256, notas, instalación, legal y contacto salen de las constantes actuales de `App.tsx`. Ningún texto los repite a mano.

## Sistema de movimiento

- Las escenas fijas son `position: sticky` dentro de una pista alta. `motion` (`useScroll` con `target` y `useTransform`) lee el avance y escribe estilos sin volver a renderizar React. El paso actual se calcula con `useMotionValueEvent` y es lo único que cambia el estado.
- Solo se animan `transform`, `opacity` y `clip-path`. La única excepción es el arco que se convierte en teléfono: cambia `width`, `height` y `border-radius` en una sola caja con `contain: layout paint`.
- Las imágenes van ligadas al scroll, avanzan y retroceden sin retraso. Los textos cambian por umbrales con transición temporal, para leerse siempre completos.
- Sin suavizado artificial del scroll, sin `scroll-snap` y sin librerías de scroll.
- Ritmo: entradas de 0,6 a 0,8 s, escalonado de 0,08 s, interacción de 0,2 s, `scale(.98)` al pulsar. `VerbRotator` pasa del muelle actual, que se pasa del objetivo, a la curva de la marca.
- Recursos extra aprobados: balanceo 3D suave del teléfono, perspectiva del mapa, luz cálida que va de sol a terracota a lo largo de la página y grano suave fijo.
- Distancias de scroll: el recorrido 2 ocupa unas 5,6 pantallas, el 5 unas 3,5, y Toda Cuba y el lema 1,5 cada uno.

### Modos

| Modo | Cuándo | Qué cambia |
|---|---|---|
| Completo | JS cargado, sin preferencia de movimiento reducido y sin modo ligero. | Todo lo anterior. |
| Ligero | `navigator.connection.saveData` o `navigator.deviceMemory <= 2`. | Sin balanceo 3D, luz, grano ni parallax. Se conservan la transformación del arco, los pasos y los fundidos. |
| Movimiento reducido | `prefers-reduced-motion: reduce`. | Escenas sin fijar. El verbo queda fijo («comprar, vender, permutar o alquilar»), el mediopunto encendido, sin parallax ni zoom. Cada escena se muestra como contenido estático. |
| Sin JS | El script no llega o falla. | Igual que movimiento reducido. |

Un script en línea en el `<head>` añade la clase `js` a `<html>` antes de pintar. El diseño fijado solo se aplica con `.js` y `(prefers-reduced-motion: no-preference)`, así que no hay salto de diseño al hidratar. En el modo estático, el recorrido 2 muestra los cuatro pasos como lista junto a un teléfono quieto con el mapa y la ficha. Publicar muestra sus tres pasos junto a un teléfono quieto con el formulario relleno.

## Arquitectura

`App.tsx` hoy mezcla todas las secciones en 488 líneas. Se reparte por escenas para que cada archivo tenga un propósito:

| Archivo | Responsabilidad |
|---|---|
| `web/src/App.tsx` | Composición, cabecera, pie, enlace «Saltar al contenido» y `MotionConfig`. |
| `web/src/content.ts` | Constantes de versión y enlaces, `FAQ`, pasos del recorrido, pasos de publicar, operaciones y `PROVINCES`. Única fuente del texto. |
| `web/src/motion.ts` | `EASE`, `seg(p, a, b)`, `useStage(ref)` (avance de 0 a 1 de una pista) y `useMode()` («completo», «ligero» o «estatico»). |
| `web/src/phone/Phone.tsx` | Marco del teléfono y pantallas de la app: barra superior, mapa del barrio, ficha, chat, visita, formulario de publicar y barra inferior. Todo es ilustrativo: `role="img"` con `aria-label` y el interior `aria-hidden`. |
| `web/src/phone/barrio.tsx` | SVG del barrio ilustrativo, sin nombres de calles. |
| `web/src/scenes/Journey.tsx` | Hero, transformación del arco y recorrido 2. |
| `web/src/scenes/Cuba.tsx` | Mapa de la isla, lista de territorios y operaciones. El SVG de provincias se carga con `import()` dinámico al acercarse. |
| `web/src/scenes/Tagline.tsx` | Lema palabra a palabra. |
| `web/src/scenes/Publish.tsx` | Recorrido 5 y tarjeta de ayuda. |
| `web/src/scenes/Trust.tsx`, `Download.tsx`, `Questions.tsx` | Secciones actuales movidas, con el mediopunto animado en `Download`. |
| `web/src/ui.tsx` | `Reveal`, `Stagger`, `StaggerItem`, `Mediopunto`, `VerbRotator` y `Cenefa`. Se elimina `ProvinceMarquee`. |
| `web/src/cuba-map.ts` | Trazados SVG de los 16 territorios, simplificados (objetivo: 25 KB o menos). |

El mapa de Cuba sale de geoBoundaries gbOpen CUB ADM1 (OpenStreetMap, ODbL 1.0): 16 unidades con Artemisa, Mayabeque y la Isla de la Juventud. `web/scripts/cuba-map.mjs` lo simplifica a 25 KB o menos. La página cita «© colaboradores de OpenStreetMap (ODbL)» bajo el mapa y el archivo generado conserva el aviso de licencia.

## Accesibilidad

- Un `h1`, un `h2` por escena y `h3` dentro. Todo el texto es HTML real, nunca dentro de un SVG.
- Las escenas fijas no atrapan el foco. El orden del teclado sigue el del documento. Todo el texto de los pasos está en el DOM aunque solo uno se vea, y los pasos ocultos no reciben foco.
- Nada se mueve solo más de 5 segundos (WCAG 2.2.2): el verbo se detiene y la cinta de provincias desaparece.
- Contraste AA en claro y oscuro, foco visible (`:focus-visible` actual), objetivos táctiles de 44 px o más, `lang="es"` y textos alternativos con «Imagen ilustrativa».
- La navegación marca la sección actual con `aria-current="true"` mediante `IntersectionObserver`.

## SEO

- Se mantienen URL, `title`, description, `canonical` (`https://www.karmahouse.site/`), `og:*` y `twitter:card`.
- JSON-LD: `App` renderiza un `<script type="application/ld+json">` con `FAQPage` (las 8 preguntas, desde `content.ts`) y `MobileApplication` (nombre, Android 7 o superior, `softwareVersion` desde la constante de versión, `downloadUrl` al APK y `offers.price` 0). Como lo genera el prerender, nunca se desfasa del texto visible.
- `web/public/404.html` propia, con la marca, un enlace a la portada y estilos en línea.
- `web/public/sitemap.xml` con la portada, y `robots.txt` apuntando a él.
- Rendimiento como señal: la foto del hero es el LCP (`fetchPriority="high"`), sin saltos de diseño y sin tareas largas al hacer scroll.

## Peso y rendimiento

- Presupuesto de la primera carga: 350 KB comprimidos o menos, sumando HTML, CSS, JS, Calistoga y la foto del hero. Hoy son unos 215 KB.
- Se cargan al acercarse: los trazados de Cuba, `interior.jpg` y las pantallas de publicar.
- Objetivos: 60 fps sostenidos en el recorrido con la CPU frenada 4 veces, ninguna tarea de más de 50 ms durante el scroll y Lighthouse móvil con rendimiento de 85 o más, accesibilidad 100 y SEO 100.

## Pruebas

1. `npm --prefix web run build` termina, prerenderiza sin avisos de hidratación y el `dist/index.html` contiene el texto de todas las escenas y el JSON-LD válido.
2. En el servidor `site-dist`, recorrer cada escena hacia abajo y hacia arriba a 1280×800 y 375×812, en claro y oscuro: sin scroll horizontal, sin errores de consola, paso correcto en cada umbral.
3. Con movimiento reducido emulado y con JS desactivado, la página se lee completa y en orden, sin escenas fijas.
4. Modo ligero emulado (`saveData`): sin balanceo, luz ni grano, y la transformación del arco intacta.
5. Medición del peso de la primera carga con los archivos de `dist/` comprimidos. Panel de rendimiento con la CPU frenada 4 veces y Lighthouse móvil con los objetivos de arriba.
6. Búsqueda en `web/src` de «verificado», «garantizado» y «16 provincias»: cero resultados.
7. Enlaces del APK, SHA-256, notas, instalación, legal y contacto iguales a los actuales, y las anclas antiguas funcionando.

## Fuera de alcance

- Páginas de campaña, analítica, aviso de cookies, video y cambios en la app.
- El teléfono imita la interfaz actual de la app. Si la «Navegación inferior clásica integrada» de `docs/visual-design-review.md` se publica antes, se actualiza la barra inferior del teléfono.

## Riesgos

- La transformación del arco cambia propiedades de diseño. Está aislada con `contain`. Si un Android modesto se traba, el modo ligero la convierte en un fundido.
- Chrome antiguo sin actualizar en Cuba: `motion` funciona. `svh` lleva respaldo en `vh`. El sitio ya depende de `color-mix` por Tailwind 4, así que no es una restricción nueva.
- Exactitud y licencia del mapa de Cuba: se verifican en el plan antes de dibujar la escena.

## Revisión del 12 de octubre de 2026

Pedida por el usuario tras ver el build:

- **Recorrido:** sin la barra de progreso de los pasos (la de la cabecera se mantiene). La pantalla del teléfono fija su color y tamaño de texto de app, que en modo oscuro heredaba el claro de la página.
- **Toda Cuba:** sin la lista de provincias. Panel `mar` con la silueta de la isla rellena de losa hidráulica, revelada de oeste a este mientras un sol cálido la cruza.
- **Operaciones:** tarjetas translúcidas (`backdrop-filter`) sobre luces suaves de sol, azul y terracota, sin iconos. Cada tarjeta lleva un arco de mediopunto en su tono y una línea de contexto («Para quien busca», etc.). En modo ligero son opacas.
- **Publicar:** libro de tres páginas que giran sobre su borde izquierdo con el scroll. Cada página muestra una pantalla de la app más grande (texto de 13 px) y lo que ocurre en ella se anima al abrirse. Los títulos de página usan la sans del sistema en negrita, a petición del usuario, en lugar de Calistoga.
