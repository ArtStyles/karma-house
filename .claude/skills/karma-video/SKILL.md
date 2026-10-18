---
name: karma-video
description: Crea un video promocional de KarmaHouse con HyperFrames (reel, reel cinético con la mascota Bloque, estado de WhatsApp, short, anuncio, intro o tutorial de la app) a partir de cómo lo describe el usuario, con la marca, los datos y los recursos reales del proyecto. Úsala con /karma-video y siempre que pidan un video, reel, animación o promo de KarmaHouse o Karma House, aunque no nombren HyperFrames.
argument-hint: "[cómo quieres el video]"
---

# Video de KarmaHouse

Pedido del usuario:

$ARGUMENTS

Si no hay pedido arriba, pide en una frase que pegue cómo quiere el video y espera. No empieces sin él.

## 1. Entra por HyperFrames

Carga la skill `hyperframes:hyperframes` (router del plugin HyperFrames) y sigue su flujo completo: intención, ruta, `BRIEF.md`, construcción, revisión y render. Esta skill solo aporta el contexto de KarmaHouse; no se salta ni sustituye pasos de HyperFrames. Si esa skill no existe, para y avisa que falta el plugin (`claude plugin install hyperframes@hyperframes`).

Entrega al router el pedido literal del usuario más este contexto, para que no pregunte lo que ya está resuelto:

- **Marca:** `BRAND.md` en la raíz del repo (ya en contexto vía `CLAUDE.md`). En la pregunta de diseño la respuesta es «ya tiene uno»: tras `init`, cópialo como `design.md` a la raíz del proyecto y anótalo en `BRIEF.md` § Assets. Lo que el video puede afirmar está en su sección *Facts*; no inventes cifras, precios ni testimonios.
- **Web oficial para capturar:** https://karmahouse.site/
- **Recursos locales** (rutas desde la raíz del repo; anótalos en § Assets): logo `assets/karmahouse-logo.png`, símbolo `assets/karmahouse-mark.png`, icono `assets/karmahouse-icon.png`, fotos de ambiente `web/public/vedado.jpg` y `web/public/interior.jpg` (generadas por IA: nunca como anuncio real).
- **Capturas reales de la app:** `artifacts/phone/*.png`. Mira cada una antes de usarla; si muestra nombres, correos, teléfonos o chats de personas reales, descártala o tapa esos datos.
- **Público e idioma:** personas en Cuba que compran, venden, permutan o alquilan, con datos móviles caros. Español de Cuba, tuteo, textos cortos y legibles en el móvil.
- **Formato recomendado** si el pedido no lo dice: 9:16 (Reels, Estados de WhatsApp, TikTok).

## 2. Dónde va el proyecto

Cada video en `artifacts/videos/<AAAA-MM-DD>-<tema>/` dentro del repo. `artifacts/` ya está fuera de git, tsc y Metro, así que el video no toca la app.

Ejecuta los comandos de HyperFrames con esa carpeta como directorio actual: `render` escribe en `./renders` relativo al directorio actual, y desde la raíz del repo el MP4 caería fuera de `artifacts/`.

## 3. Esta PC (Windows)

- Python: usa `python` (3.12, con numpy). `python3` es el alias de Microsoft Store y falla; `py` abre 3.13 sin numpy.
- Si `ffmpeg` no aparece en un shell, recarga el PATH en PowerShell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- La red es lenta y corta las conexiones largas: usa recursos locales antes que descargas y avisa antes de bajar algo grande.
- Pregunta antes de usar servicios en la nube de HeyGen (voz, avatares, cloud render, publish): pueden costar o no funcionar desde Cuba. El render local es gratis.
- Todo lo local ya está instalado: voz en español con Kokoro (`tts --voice ef_dora`, sin cuenta), subtítulos con Parakeet o Whisper (`transcribe --language es`), música con MusicGen y cortes al ritmo con librosa. Prefiérelos a los servicios en la nube.
- La voz española lee «KarmaHouse» como «Karma-ous» (la transcripción la devuelve como «KarmaOC»). En el guion de voz escribe la marca como se dice (por ejemplo «Karma Jáus»), escucha el resultado antes del render final y deja «KarmaHouse» en pantalla.

## 3b. Lo aprendido en el primer video (2026-10-03)

- **Afirmaciones:** antes del storyboard, lee `capture/extracted/visible-text.txt`. La web publicada manda sobre `BRAND.md` si difieren; si cambió, actualiza `BRAND.md` § Facts.
- **Música sin cuenta HeyGen:** el paso de audio de `product-launch-video` se salta la música. Genérala aparte con el motor de `/media-use`: un `audio_request.json` con `"lines": []` y `"bgm": {"mode": "generate", "prompt": "..."}`, y `audio.mjs --only bgm`. Elige el mejor tramo con librosa (energía y golpes) y recórtalo con ffmpeg. Luego apunta `audio_meta.json` → `bgm.path` al recorte, con `bgm_pending: false`.
- **Fuentes:** cada fuente debe existir como archivo en `assets/fonts/` del proyecto. Titulares en Calistoga (`web/node_modules/@fontsource/calistoga/files/calistoga-latin-400-normal.woff2`); Roboto variable desde `artifacts/videos/2026-10-03-cartel-se-vende/assets/fonts/`, con el bloque `@font-face` de su `frame.md` como modelo. Antes de `build-frame`, cambia `-apple-system` por `Roboto` en `capture/extracted/tokens.json`; después pon a mano Calistoga en los titulares de `frame.md`.
- **Capturas de la app:** el texto de una captura se lee diminuto en un móvil. Repite en una tarjeta grande lo que tenga que leerse.
- **ffmpeg 9:** usa `-fps_mode passthrough`; `-vsync` ya no existe.

## 3c. Lo aprendido en «La puerta» (2026-10-06)

- **El usuario quiere ilustración, no texto:** una palabra grande por escena, objetos 3D que salen del cuadro, rayos de luz. Bocetos con mucho texto fueron rechazados.
- **CLI con red:** el node del sistema vuelve a dar `EACCES`. Lanza el CLI con un `.cmd` que pone primero en PATH el node de Codex (`%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`), fija `npm_execpath` al `npm-cli.js` del sistema y llama `plugin-cli.mjs %*`. Así funcionan `auth login`, `catalog` y las instalaciones opcionales (`onnxruntime-node`).
- **Imágenes con IA:** `media-use resolve --type image --provider codex` con `codex.exe` de la app Codex en PATH (`C:\Program Files\WindowsApps\OpenAI.Codex_*\app\resources`). Necesita la conexión del usuario (VPN); tarda ~5 min por imagen, en paralelo va bien. Pide objetos sobre fondo gris liso y recórtalos por color (distancia al gris del borde + bordes suaves): `remove-background` está hecho para personas y destroza objetos.
- **HeyGen:** el catálogo de SFX de media-use necesita el CLI `heygen`, que no existe para Windows; solo queda el banco incluido (clics, whooshes, sin puertas).
- **After Effects:** el MCP `aftereffects` está registrado (local) pero AE no está instalado; el 3D se hizo en CSS/GSAP.

## 3d. Lo aprendido en «La historia de KarmaHouse» (2026-10-07)

- **Fotos fijas con movimiento de cámara = "barato" para este usuario.** Para una historia con personas quiere video real: personas de cuerpo entero (con cara, personaje ficticio) que se muevan. El camino que funcionó: protagonista de referencia con Codex (`codex exec ... "<prompt>" -i ref.png`; el prompt va ANTES de `-i`, que es variádico) → escenas con la misma persona → clips image-to-video → montaje en HyperFrames.
- **Generadores de video:** Sora cerró (web abril 2026, API septiembre 2026). Kling gratis rechaza tareas en horas pico ("non-member users cannot submit"). **Hailuo** (hailuoai.video) funcionó: 150 créditos al registrarse, modo Start/End Frame + modelo Hailuo 2.3-Fast, 768p · 6 s = 15 créditos por clip; marca de agua «MINIMAX | Hailuo AI» en el plan gratis (no quitarla; el usuario eligió dejarla entera: escalar a 1280×1920 y recortar `crop=1080:1920:180:0`). Los clips se descargan directo de `cdn.hailuoai.video` leyendo los `<video>` de la página.
- **Navegador integrado:** el usuario inicia sesión; no tiene herramienta para subir archivos y bloquea el acceso de una web a `localhost`, así que el usuario sube cada imagen (copiar las imágenes a `Descargas\karma-escenas` porque `artifacts/` no se ve fácil). Claude en Chrome no estaba conectado.
- **Etalonaje de clips:** hecho con ffmpeg antes del montaje (`eq` + `colorbalance`, `vignette`, `noise=alls=3:allf=t`, CRF 20); las transiciones van en el timeline `main` sobre los `<video>` con escala ≥ 1 (sin bordes) y el clip entrante encima (sin pantallas lechosas).
- **Render:** con imágenes graduadas por `media-treatment`, snapshot/check/render necesitan `--no-browser-gpu` en esta PC (Intel Iris Xe).
- **Bash heredoc:** las barras invertidas en scripts Python escritos con heredoc pueden colapsar; usa `chr(92)` para `\`.

## 3e. Lo aprendido en «KarmaHouse explicado» (2026-10-07)

- **Tipografía cinética que gustó:** una escena por frase sobre la rejilla de la música (compás ≈ 1,657 s), cada escena con su fondo de la paleta, letras partidas en `<span>` (volteo 3D, caída, convergencia, máquina de escribir) y el color de una frase cambiando en los golpes. Cada escena termina llenando la pantalla con el fondo de la siguiente (círculo, persiana, flash): así no hay cortes secos.
- **Revisión previa:** guion + 3 escenas animadas de prueba (gancho, verbos y estallido) antes de construir el resto. Se aprobó a la primera.
- **`check` y letras partidas:** si las letras van en `inline-block`, Calistoga en dos líneas necesita `line-height` ≥ 1,16, y separa más los titulares apilados; si no, salen errores `content_overlap`. Pon `white-space: nowrap` en los titulares partidos: si no, la línea se corta a mitad de palabra («priva / do.»). Las palabras apiladas a propósito (verbos que se relevan) llevan `data-layout-allow-overlap` en cada `<span>` de letra; el atributo no se hereda.
- **No animes `letterSpacing`** (`gsap_non_transform_motion` en lint): usa `scaleX`/`scale`.
- **Flash blanco entre escenas:** un flash que se desvanece lento se ve lechoso; déjalo en ≤ 0,15 s.

## 3f. Lo aprendido en «Pestañas» (2026-10-11)

- **Gustos del usuario:** quiere el texto narrado escrito en pantalla (karaoke, palabra activa en azul), pero rechazó repetir el mismo recurso en todas las escenas («en todos usas el efecto del buscador»): un recurso de texto distinto por escena. Pidió un fondo que reaccione a las animaciones y un diseño menos escueto (más capas, ornamento, profundidad). Voz elegida: Kokoro `em_alex` (hombre) a 0,95.
- **Kokoro y la palabra «app»:** se oye como «API»; escribe «aplicación» en el guion de voz.
- **Red y sandbox:** `capture` falla dentro del sandbox de Bash (`net::ERR_NETWORK_ACCESS_DENIED`) y el `audio.mjs` de product-launch falla al llamar `npx hyperframes tts` con el node del sistema. Ejecuta ambos con el sandbox desactivado y a través del lanzador `.cmd` con el node de Codex (`hf2.cmd --script <ruta>\audio.mjs …`). Si una línea de TTS falla, vuelve a ejecutar el mismo comando: reutiliza las que ya existen.
- **Pausas en la voz:** `sync-durations` pone a cada escena la duración exacta de su voz, sin respiros. Para tener pausas, alarga cada WAV con `ffmpeg apad`/`adelay`, actualiza `duration_s` y los tiempos de palabra en `audio_meta.json` y vuelve a ejecutar `sync-durations`.
- **No ejecutes `fetch-sfx`:** reescribe `audio_meta.json` desde el sidecar y borra la música y las voces con pausas. Escribe tú las entradas `sfx` (`frame`, `file`, `offset_s`, `duration_s`, `volume`) con los archivos de `media-use/audio/assets/sfx/`.
- **Capas persistentes:** un fondo vivo (`compositions/fondo.html`) y una barra de pestañas (`compositions/pestanas.html`) montados a mano en `index.html` después de `assemble-index` (fondo justo tras abrir `#root`, pestañas al final) y antes de `transitions inject`. Los frames quedan transparentes y las transiciones solo mueven el contenido. Rejilla común de baldosas de 180 px en (0,0); el fondo se desplaza en múltiplos de 180 px para no desalinear las reacciones de cada frame.
- **Karaoke fiable:** `karaoke.json` con las palabras de pantalla y los tiempos de la transcripción (unir «Karma»+«House»). Los workers lo usan tal cual; la transcripción ASR tiene errores («Pública», «Si conversa»).
- **Workers de frames:** dales en el contexto las excepciones aprobadas (texto narrado en pantalla, raíz transparente, sin salida), una escena ya aprobada como referencia de estilo, ids que empiecen por letra (`f03-…`) y menos de 20 elementos con blur/gradiente radial/clip-path. Revisa que la «palabra de color» del boceto se quede azul (los workers la pasan a tinta por la regla de karaoke).
- **Vista previa de bocetos:** la entrada `videos` de `.claude/launch.json` sirve `artifacts/videos` en el puerto 8097; `file://` en el navegador integrado no carga fuentes ni imágenes relativas.
- **Prueba rápida:** con `prueba.html` como `index.html` (solo las escenas de prueba en sus tiempos reales), render en ~1 min y corte de tramos con ffmpeg. Saca de la raíz cualquier otro HTML con `data-composition-id` (error `multiple_root_compositions`).
- **Volumen final:** el render sale cerca de −20 LUFS; normaliza a −14 LUFS para Reels y Estados (`loudnorm=I=-14:TP=-1.5`, vídeo copiado).
- **Receta `karma-pestanas` (v1):** el usuario aprobó este formato como receta (`~/.media/recipes/karma-pestanas/`). `recipe.mjs use` solo copia `frame.md` y los esqueletos; las capas persistentes y el modelo de `karaoke.json` están en `extras/` de la receta (y en `artifacts/videos/2026-10-11-pestanas/`): cópialos a `compositions/` y ajusta sus tiempos de acto al nuevo guion.

## 3h. Lo aprendido en «Inmobiliarias PRO» (2026-10-13)

- **Inmobiliarias:** la web no las menciona; las afirmaciones salen del código de la app (lista en `artifacts/videos/2026-10-13-inmobiliarias/TREATMENT.md` §7). Solo venta, nunca alquiler; no «verificada», «gratis» ni comisiones. CTA: Android + navegador (`app.karmahouse.site`).
- **Lanzador:** si falta, recrea `hf2.cmd` en el scratchpad (node de Codex primero en PATH, `npm_execpath` al `npm-cli.js` del sistema, `plugin-cli.mjs %*`) y llámalo desde PowerShell con `& "<ruta>\hf2.cmd"`. Este CLI no tiene `usage`.
- **JSON desde PowerShell:** `Out-File -Encoding utf8` mete BOM y el motor de audio falla al leerlo; escribe los JSON con `printf` en Bash o con Python.
- **Voz:** `audio.mjs` acepta `--speed 0.95`. Antes de `captions.mjs build`, une «Karma»+«House» en las palabras de `audio_meta.json` (si no, el subtítulo dice «Karma House»).
- **Workers:** los paquetes de `frame-packets.mjs` no llevan el `## Video direction`. Escribe `_shared.md` (dirección, el elemento que cruza cada costura con medidas exactas, tokens y textos reales de la app, franjas reservadas) y `_words.txt` (tiempos por palabra de cada frame) junto a los paquetes y pásalos en el prompt de cada worker. Con eso las costuras salieron alineadas a la primera.
- **Capa persistente:** el reloj se montó con un `<div data-composition-src>` justo después del último frame en `index.html` y antes de `transitions inject`. Una cámara con zoom dentro de un frame puede invadir la franja de esa capa: `check` lo marca como `content_overlap` con la capa.

## 3i. Lo aprendido en «Inmobiliarias v2» (2026-10-14)

- **«Profesional» para este usuario no es sobrio:** rechazó la v1 de tarjetas blancas sobre crema plano («necesito algo visualmente más impactante») y pidió «lo más animado posible en cuanto a los efectos y la calidad de las texturas». Lo que aprobó: pared de cal con textura real de yeso, luz de tarde y franjas de persiana; palabras gigantes en Calistoga con textura de piedra que caen con temblor; objetos en 3D que llegan desde el fondo con sombra de contacto y brillo especular; campo azul con textura; sellos con destello ≤ 0,12 s y onda de choque; olas de losa hidráulica que se voltean; grano.
- **Texturas:** `hyperframes add texture-mask-text` instala 66 máscaras reales (ambientCG) en `assets/texture-mask-text/masks/`. Sirven como máscara de luminancia para letras y también para dar textura a fondos (`painted-plaster-017`, `travertine-009`, `concrete-047-a`).
- **Voz:** em_alex «no le gustó mucho»; prefirió Kokoro `em_santa` (muestra 4) frente a las voces neuronales de Microsoft (es-CU-ManuelNeural, etc.). Enviar 3–4 muestras con la misma frase funcionó para elegir.
- **Flujo que funcionó:** 3 escenas de prueba escritas a mano por el orquestador, cortadas en un clip de 15 s, aprobación, y luego los workers con `_v2.md` (contrato de estilo) más las 3 escenas aprobadas como referencia.
- **Peso:** el grano hace el render enorme (152 MB para 42 s). Recodifica con x264 CRF 22 (unos 33 MB) y saca una versión ligera a 1,3 Mbps (unos 7,5 MB).

## 3g. Continuidad: que no parezca un pase de diapositivas (2026-10-13)

Ideas del repo onetake (github.com/feitangyuan/onetake). Su licencia es no comercial: no instales su código ni copies sus archivos para KarmaHouse; aplica solo estas reglas.

- **Tres conceptos antes del guion:** cada uno es una frase sobre la imagen central, no sobre el producto, y se diferencian en esa idea (un objeto que se transforma en todo, un solo movimiento de cámara que cruza escalas, una reacción en cadena). Con la marca: la ventana mediopunto que se enciende panel a panel, la losa que se despliega, la puerta que se abre a la escena siguiente. Enséñalos y que el usuario elija.
- **Cada frontera dice qué pasa al otro lado:** en el storyboard, por cada cambio de escena, escribe qué elemento sobrevive y qué hace (el botón pulsado se convierte en el resultado, la tarjeta crece hasta ser la pantalla, la cámara entra en un panel de la ventana hasta que es la escena). Un fundido o un deslizamiento entre escenas sin relación no cuenta. Hazlo con un solo elemento que cambia de tamaño o forma, no con dos capas que se cruzan.
- **Cortes secos solo en una ráfaga o al cierre:** tres o más golpes en 1,5 s, o el paso a la tarjeta final.
- **Ritmo con forma:** las duraciones de plano varían 4× o más (palabras de 0,25 s junto a esperas de 2,5 s). Planos todos iguales = diapositivas, aunque cada uno se mueva.
- **Reposos quietos de verdad:** al menos un tramo de 1 s o más sin nada en movimiento (sin deriva ni zoom lento); cerca de un cuarto del video quieto. El reposo es lo que hace pegar los movimientos grandes.
- **Se ve la causa:** algo provoca cada reacción (un dedo que toca, la luz que entra, una puerta que empuja). Una pantalla que cambia sola parece salvapantallas.
- **Elementos pequeños, mucho fondo:** la interfaz como componente vivo en una tarjeta, o a pantalla completa solo en una espera con el dedo visible. Una página entera en miniatura no se lee.
- **No termines dos planos seguidos igual:** alterna muelle, desenfoque, crecimiento y corte.
- **Movimientos rápidos:** más de ~80 px por frame a 30 fps se ve a saltos. Hazlos más lentos o revisa ese tramo fotograma a fotograma en el render.

## 3j. Modo cinético (reels de Instagram, 2026-10-18)

Úsalo cuando pidan un reel o story «cinético», «como el de referencia», «con la mascota», o cuando lo pida la skill
`karma-instagram`. Formato 1080×1920, 15–45 s. Notas del video de referencia: `references/cinetico-referencia.md`.
Reel de ejemplo ya hecho con todo esto: `artifacts/videos/2026-10-18-pegar-anuncio/` («Pegar anuncio», 17 s); su
`index.html` es el modelo de escenas, personajes, puerta, ráfagas y sonido.

### Reglas

- **Guion en arco:** gancho (pregunta corta) → problema → revelación (KarmaHouse y la función) → prueba (la función
  funcionando con datos de ejemplo) → llamada («Descarga KarmaHouse para Android»). Frases de 8 palabras o menos.
  Solo hechos de `BRAND.md` § Facts; lo que la app hace se comprueba en el código (`src/`), como el resultado real
  de `parseListingText` que se ve en el reel de ejemplo. Un ejemplo de anuncio lleva la etiqueta «Ejemplo de uso».
- **Texto con la voz, palabra por palabra:** conectores pequeños (Roboto 800, ~62 px) y la palabra clave enorme
  (Bahnschrift condensada en mayúsculas, 150–300 px) en color, con estela de flamboyán, turquesa y sol. «KarmaHouse»
  y los nombres de función en Calistoga. Cifras y valores en mono (JetBrains Mono) que se descifran. Glitch solo en
  1–2 palabras por video. Fuera de las franjas de Instagram: nada de texto arriba de y = 240 ni debajo de y = 1540.
- **Dos personajes fijos** que actúan en casi todos los planos: la mascota Bloque y la persona (`assets/mascota/`,
  ver su `PROVENANCE.md`). Poses de Bloque: base, saluda, señala, sorprendida, celebra, piensa. Poses de la
  persona: base, cansada, sorprendida, pulgar, señala, saluda. Cambio de pose = ráfaga de vóxeles (`cambiaPose` en
  el reel de ejemplo). Sombra de contacto bajo cada uno. Si falta una pose, genérala con Codex adjuntando la lámina.
- **Escenas 3D vóxel** con luz cálida y profundidad de campo: el fondo con `blur(2–3px)`, los personajes nítidos,
  bokeh delante. La cámara deriva siempre (escala 1,05 → 1,12 en cada plano), salvo en el reposo final.
- **Un golpe cada 1–2 s,** con duraciones que varían (0,2 s junto a 2,5 s) y al menos un reposo quieto de 1 s o más
  (el cierre). Sigue valiendo § 3g.
- **Transiciones disponibles:** losa hidráulica que gira (pieza `transicion-losa.html`), puerta que se abre (dos
  hojas con el mediopunto arriba, en el reel de ejemplo), entrada por un vidrio del mediopunto (zoom sobre un vidrio
  de la puerta de `sala.png` hasta que su color llena la pantalla y se abre la escena nueva), zoom que atraviesa una
  tarjeta, barrido con estelas, destello ≤ 0,15 s, glitch y disolución en bloques. No repitas la misma dos veces
  seguidas. Máximo tres destellos de pantalla completa por segundo.
- **Tarjetas de interfaz en fila** (pieza `tarjetas-ui.html`) con los textos reales de la app; nunca una captura
  entera en miniatura.
- **Sonido en cada golpe** con el banco de `media-use/audio/assets/sfx/` (pop, whoosh, impact-bass, glitch, click,
  typing, chime, sparkle, notification) y música de fondo a ~0,22 bajo la voz.
- **Cierre:** los dos personajes en la calle y la pieza `tarjeta-final.html`: panel mar, logo en blanco,
  «Descarga KarmaHouse para Android», campo que escribe `karmahouse.site`, botón píldora sol que se pulsa.

### Proceso

1. **Guion** en `SCRIPT.md`: pantalla y voz por línea; la voz escribe «Karma Jáus» y «aplicación» (§ 3, § 3f).
2. **Voz Kokoro `ef_dora`** (elegida por el usuario), una línea por archivo:
   `hf2.cmd tts l1.txt --voice ef_dora --speed 1.05 -o l1.wav`. Los `.txt` en UTF-8 sin BOM (escríbelos con
   `printf` en Bash). Monta la pista con un script de Python (soundfile): recorta el silencio de cada línea y
   colócala en su segundo, con huecos de 0,25–0,45 s → `assets/voice/voz.wav`.
3. **Tiempos por palabra con whisper:** `hf2.cmd transcribe assets\voice\voz.wav --engine whisper --model small --language es`
   (sin `--engine` usa Parakeet, que da tiempos más gruesos). Whisper adelanta la primera palabra de cada línea
   hacia el silencio: fíjala con `"t"` en el plan.
4. **Imágenes de escena con Codex** cuando hagan falta: `codex exec --skip-git-repo-check -s workspace-write -C <carpeta> -i assets/mascota/bloque-lamina.png`
   con el prompt por stdin (`Get-Content -Raw prompt.txt | & codex.cmd exec ...`), pidiendo «use $imagegen … copy the
   PNG into the current working directory as X.png». 1024×1536, «voxel diorama», sin personajes ni texto, con hueco
   abajo para los personajes y el tercio de arriba tranquilo para el texto. Tarda 2–3 min; varias en paralelo van
   bien. El CLI está en `%APPDATA%\npm\codex.cmd`, con la sesión de ChatGPT del usuario. Si da EACCES, es el
   cortafuegos Simplewall: pide al usuario que permita esa aplicación. Guarda los prompts junto a las imágenes.
5. **Proyecto:** `hyperframes init <fecha-tema> --example blank --resolution portrait --non-interactive` (en una
   carpeta vacía) dentro de `artifacts/videos/`. Copia `piezas/*.html` a `compositions/` y las fuentes a
   `assets/fonts/`: `Calistoga.ttf` (`assets/fonts/` del repo), `Roboto-Variable.woff2` y `JetBrainsMono-400.woff2`
   (de un proyecto anterior en `artifacts/videos/`) y `bahnschrift.ttf` (`C:\Windows\Fonts`).
6. **Planos** en `index.html` (1–2 s cada uno) y **`plan.json`** con las frases, la losa y las tarjetas; después
   `python <skill>/piezas/armar.py` desde la carpeta del proyecto rellena las variables de las piezas con los tiempos
   de whisper y muestra la tabla de palabras para revisarla.
7. **Revisión:** `lint` (0 errores), `snapshot --at …` en los golpes, y render con `--no-browser-gpu`. Revisa el MP4
   con ffmpeg (hoja a 2 fps y tramos a 10 fps en las transiciones) y el sonido con `ebur128`; normaliza a −14 LUFS.

### Piezas reutilizables (`piezas/`)

Cada una es una sub-composición con una sola instancia que cubre todo el video y recibe sus datos por
`data-variable-values` (los JSON los escribe `armar.py`):

- `texto-voz.html` — variable `datos`: frases con caja (`x`, `y`, `ancho`, `alinear`), `inicio`/`fin` y líneas de
  palabras `{t, p, rol, color, tam, efecto}`; roles `conector`, `medio`, `clave`, `marca`, `cifra`; efectos
  `glitch` y `descifrar`.
- `transicion-losa.html` — variable `momentos`: `[{t, desde, fondo, petalo, centro, linea}]`; la pantalla queda
  tapada justo en `t`, que es donde se corta la escena.
- `tarjetas-ui.html` — variable `grupos`: filas de campos `{t, etiqueta, valor | nota}` en estilo `vacio` (cursor)
  o `lleno` (valor que se descifra y check en persiana).
- `tarjeta-final.html` — variables `titulo`, `acento`, `campo`, `boton`, `nota`, `y`, `entra`, `escribe`, `toque`
  (segundos desde el inicio de su clip).
- `armar.py` — une `plan.json` y la transcripción con las piezas.

### Trampas que ya costaron

- El hook del worktree bloquea escribir en la copia principal: el proyecto va en `artifacts/` del worktree (está
  fuera de git; cópialo a la copia principal antes de borrar el worktree).
- `fromTo` repetidos sobre el mismo elemento: añade `immediateRender: false` a los posteriores (lint
  `gsap_repeated_fromto_without_baseline`); un anillo o un dedo con `fromTo` sin eso se ve antes de tiempo.
- GSAP 3 no anima `className`: cambia la fuente con `tl.set(el, { fontFamily, color })`.
- El descifrado debe depender solo del progreso (no de un azar que avanza en cada `onUpdate`), o cada búsqueda de
  fotograma da otro texto.
- Las palabras clave condensadas a 250 px pueden ocupar 2/3 del ancho: deja la otra parte para el personaje.

## 4. Entrega

Termina con la ruta del MP4 final, la carpeta del proyecto y cómo reabrir la vista previa. No publiques ni subas el video a ningún sitio sin permiso explícito.
