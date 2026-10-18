---
name: karma-instagram
description: Prepara publicaciones de Instagram de KarmaHouse listas para programar a mano en la app de Instagram (carrusel o lámina 1080×1350, story 1080×1920, reel con el modo cinético de karma-video) con su texto, texto alternativo, primer comentario, ficha y lámina de revisión, y el plan de la semana. Úsala cuando pidan un post, carrusel, story, reel o contenido para Instagram (o redes) de KarmaHouse, el calendario o el «plan de la semana», aunque no digan «skill». No publica ni inicia sesión en ningún servicio.
argument-hint: "[tema o «plan de la semana»]"
---

# Instagram de KarmaHouse

Pedido del usuario:

$ARGUMENTS

Si no hay pedido, pregunta en una frase qué quiere (una publicación sobre un tema o el plan de la semana) y espera.

## 0. Lo que esta skill no hace

- No publica, no programa, no sube nada y no inicia sesión en Instagram, Meta, Metricool ni ningún otro servicio.
  Prepara la carpeta; el usuario la programa en la app de Instagram (§ 8).
- No inventa cifras de usuarios ni de anuncios, precios reales, testimonios, socios ni premios (`BRAND.md`).

## 1. Fuentes de verdad

- `BRAND.md`: § Facts (lo único que se puede afirmar), la voz, las reglas del logo, «Imagen ilustrativa» y
  «Ejemplo de uso», y § «Redes y video» (colores extra, efectos y mascota permitidos aquí).
- Lo que hace una función se comprueba en el código de la app (`src/`) antes de enseñarlo. Ejemplo: los campos que
  rellena «Pegar anuncio» salen de ejecutar `parseListingText` (`src/domain/importListing.ts`) con el texto de ejemplo.
- Personajes: Bloque y la persona en `assets/mascota/` (poses y prompts en su `PROVENANCE.md`).
- Escenas vóxel ya hechas: `artifacts/videos/2026-10-18-pegar-anuncio/assets/img/` (`sala.png`, `mesa.png`,
  `calle.png`). Para una escena nueva, genérala con Codex como dice `karma-video` § 3j, paso 4.
- Capturas reales de la app: `artifacts/phone/*.png`. Mira cada una: si muestra nombres, correos, teléfonos o chats
  de personas reales, descártala.

## 2. Pilares de contenido

Rota los cinco; no repitas pilar en la misma semana.

| Pilar | De qué va | Hechos que lo sostienen |
|---|---|---|
| **Cómo funciona** | Una función por publicación, paso a paso | «Pegar anuncio», publicar con ayuda, mapa con ubicación exacta o aproximada, visitas y ofertas en el chat, fotos optimizadas y ahorro de datos, app.karmahouse.site |
| **Confianza** | Por qué es seguro hablar y publicar | Chat privado (no ven tu teléfono ni tu correo), reportar, bloquear, eliminar la cuenta, anuncios revisados antes de publicarse (nunca «verificado» ni «garantizado»), sin comisión |
| **Inmobiliarias** | Lo que la app ofrece a una agencia | Solo lo que dice la lista de `artifacts/videos/2026-10-13-inmobiliarias/TREATMENT.md` § 7 (sacada del código): solo venta; sin «verificada», «gratis» ni comisiones |
| **La casa cubana** | Valor sin vender: el mediopunto, la losa hidráulica, el portal, cómo describir tu casa, qué es una permuta | Cultura y consejos generales; cuando se nombre la app, solo con hechos de § Facts. Nada de datos de mercado inventados |
| **Novedades** | Algo nuevo que ya está en la APK publicada o en app.karmahouse.site | La versión y lo que trae, comprobado en la web publicada o en el código ya publicado |

## 3. Formatos

- **Carrusel:** 2–10 láminas de 1080×1350 (4:5), en JPEG. Portada con el gancho → una idea por lámina → cierre con
  «Descarga KarmaHouse para Android». Número de lámina arriba a la derecha y «Desliza →» en la portada.
- **Lámina sola:** 1080×1350, una idea.
- **Story:** 1080×1920. Deja libres 250 px arriba y 250 px abajo (la interfaz de Instagram). El enlace va en el
  sticker de enlace, que el usuario pone en la app.
- **Reel:** 1080×1920, con `karma-video` en modo cinético (§ 3j de esa skill). Copia el MP4 final a la carpeta de
  la publicación como `reel.mp4`, normalizado a −14 LUFS y en x264 CRF 21 (unos 12 MB por 17 s: los datos en Cuba
  son caros):
  `ffmpeg -i <render>.mp4 -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 160k -movflags +faststart reel.mp4`

Estilo: el de § «Redes y video» de `BRAND.md` y el mundo vóxel de la mascota: escena vóxel desenfocada con velo mar,
titular en Calistoga con una frase en sol, la palabra que golpea en Bahnschrift condensada, cifras en mono, tarjetas
de la app como piezas vivas, Bloque y la persona actuando.

## 4. Carpeta de cada publicación

`artifacts/instagram/<AAAA-MM-DD>-<tema>/`, con la fecha prevista de publicación (así las carpetas se ordenan como
un calendario). `artifacts/` está fuera de git. Si trabajas en un worktree, la carpeta va en el `artifacts/` del
worktree; avisa de que hay que copiarla a la copia principal antes de borrar el worktree.

- `laminas/`: el proyecto HyperFrames de las láminas (`index.html` y `assets/`).
- `lamina-1.jpg` … (o `story-1.jpg` …) y `reel.mp4` si hay reel.
- `texto.txt`: el pie de foto.
- `alt.txt`: una línea de texto alternativo por lámina.
- `comentario.txt`: el primer comentario, con los hashtags.
- `ficha.md`: pilar, formato, fecha y hora, hashtags, revisión y pasos para programar (§ 8).
- `revisar.png`: todas las láminas en fila con los tres textos debajo, para revisar de un vistazo.

Ejemplo completo: `artifacts/instagram/2026-10-20-pegar-anuncio/` (carrusel de 4 láminas + reel).

## 5. Proceso de una publicación

1. **Elige pilar y un hecho** de § Facts (o del código). Escribe el guion de láminas: qué dice cada una y quién de
   los dos personajes actúa y con qué pose.
2. **Láminas:** copia `plantilla/carrusel.html` a `<carpeta>/laminas/index.html`. Tiene las clases de portada, paso
   numerado, tarjeta de la app, campos, panel final y personajes; cambia textos, escenas y poses. Una lámina = un
   clip de 1 s. Copia a `laminas/assets/fonts/` `Calistoga.ttf`, `Roboto-Variable.woff2`, `bahnschrift.ttf` y
   `JetBrainsMono-400.woff2`, y a `laminas/assets/img/` las escenas, las poses que uses, `grano.png` y el logo y el
   símbolo de `assets/`. Para una story, cambia el tamaño a 1080×1920 en el `meta`, el `html, body` y el `#root`.
3. **Captura** desde `laminas/` con el lanzador de HyperFrames (`karma-video` § 3h):
   `hf2.cmd snapshot . --at 0.5,1.5,2.5,3.5 --no-end --no-browser-gpu --timeout 20000` (un tiempo por lámina).
4. **Textos** (§ 6) en `texto.txt`, `alt.txt` y `comentario.txt`, en UTF-8 (en Bash con `printf`).
5. **Exporta:** `python .claude/skills/karma-instagram/exportar.py <carpeta>` escribe `lamina-N.jpg` y `revisar.png`.
6. **Revisa `revisar.png` tú mismo** con la lista de § 7: si algo se corta, se tapa o no se lee en el móvil,
   corrige y repite 3–5.
7. **Ficha** (`ficha.md`) con la revisión marcada y los pasos de § 8.
8. **Entrega:** la ruta de la carpeta, de `revisar.png` y de cada pieza. No subas nada.

## 6. Textos

- **Pie de foto:** gancho en una línea; dos o tres frases cortas con el beneficio concreto, en tú y español de Cuba;
  cierre «Descarga KarmaHouse para Android: el enlace está en la bio.». Los enlaces del pie no se pueden tocar: el
  enlace va en la bio (karmahouse.site).
- **Primer comentario:** una pregunta corta para que respondan y 5–10 hashtags. Base: #KarmaHouse #CasasEnCuba
  #ViviendaEnCuba #LaHabana #Cuba, más los del tema (#VentaDeCasas, #AlquilerEnCuba, #PermutaEnCuba…).
- **Texto alternativo:** por lámina, qué se ve y el texto que lleva, en una o dos frases.
- **Hora:** sin estadísticas todavía, propón 20:30 hora de Cuba y dilo como suposición. Cuando el usuario pase
  capturas de las Estadísticas de Instagram, ajusta la hora y los pilares que mejor funcionan.

## 7. Revisión (fija, en cada pieza)

- [ ] Solo hechos de `BRAND.md` § Facts o comprobados en el código; nada de «verificado», «garantizado», cifras
      inventadas, precios reales ni testimonios.
- [ ] «Ejemplo de uso» en anuncios y chats de ejemplo; «Imagen ilustrativa» en fotos generadas que parezcan reales.
- [ ] Sin logos de terceros (Revolico, WhatsApp, Google Play) y sin datos de personas reales en capturas.
- [ ] El logo solo en azul sobre claro o en blanco sobre oscuro; la mascota nunca en lugar del logo.
- [ ] Todo el texto se lee en un móvil (mira `revisar.png`) y tiene fondo o sombra sobre la escena.
- [ ] El pie, el comentario y el texto alternativo dicen lo mismo que las láminas.

## 8. Programar en la app de Instagram

Requiere cuenta profesional (gratis). Pasa al teléfono las imágenes o el reel y los `.txt`; luego:
**+** → **Publicación** (o **Reel**) → elige las láminas en orden → **Siguiente** → pega `texto.txt` →
**Configuración avanzada** → **Escribir texto alternativo** (una línea de `alt.txt` por lámina) →
**Programar esta publicación** → fecha y hora → **Programar**. El primer comentario lo escribe el usuario cuando
sale la publicación: la app no programa comentarios. En un reel no se añade música de Instagram (ya trae la suya).
Las stories no se programan en la app: se publican a mano. Escribe estos pasos en cada `ficha.md`.

## 9. Modo «plan de la semana»

1. Lee los `artifacts/instagram/semana-*.md` anteriores para no repetir temas.
2. Propón **3 publicaciones** (por ejemplo martes, jueves y sábado a las 20:30): tres pilares distintos y formatos
   mezclados (un reel, un carrusel y una lámina o story). Escribe `artifacts/instagram/semana-<lunes AAAA-MM-DD>.md`
   con una tabla: día, hora, pilar, formato, tema, hecho de § Facts que lo sostiene y carpeta.
3. Enséñale la tabla al usuario y espera su visto bueno antes de producir: un reel lleva un buen rato.
4. Produce cada publicación con § 5 y termina con las tres carpetas y sus `revisar.png`.

## 10. Siguiente paso: Metricool (todavía no)

El informe de la cuenta (`instagram-cuenta-informe.md`, 18-10-2026, en las notas compartidas de Claude) dejó a
Metricool, plan gratis (1 marca, 20 publicaciones al mes, conector MCP), como la única forma razonable de que Claude
programe desde Cuba. Antes hay que comprobar dos cosas, y solo puede hacerlo el usuario: que el inicio de sesión de
Instagram dentro de Metricool funciona desde Cuba y que el conector MCP funciona con el plan gratis. Hasta entonces
esta skill no se conecta a nada. Si se confirma, el paso siguiente sería que la skill suba cada carpeta revisada
como borrador en Metricool, siempre con el visto bueno del usuario antes de programar.
