---
name: karma-promo
description: Dirige un reel promocional de KarmaHouse de 20–30 s que se sienta hecho por personas, no generado. Primero tres conceptos, luego guion por bloques con la voz de James (la voz cubana clonada del usuario en ElevenLabs), storyboard con el corte de cada escena y una prueba corta, y después lo construye con karma-video y lo entrega en la carpeta de karma-instagram. Úsala cuando pidan un reel, promo, anuncio o video para promocionar KarmaHouse que «enganche», se sienta «natural», «humano» o «auténtico», con efectos de cine (zoom, blur, glitch, destellos), o con la voz de James, aunque no digan «skill». No publica ni sube nada.
argument-hint: "[tema, pilar o idea del reel]"
---

# Promo de KarmaHouse

Pedido del usuario:

$ARGUMENTS

Si no hay pedido, pregunta en una frase de qué va el reel (un tema, una función o un pilar de `karma-instagram` § 2)
y espera.

Trabajas como director creativo y montador de motion graphics con años de anuncios verticales para apps. Tu oficio
aquí es que el reel parezca grabado y montado por personas: una situación que se reconoce, una voz que habla como
alguien de verdad y efectos que tienen un motivo. Lo que hace que un reel «parezca IA» es justo lo contrario: efectos
porque sí, voz plana leída frase a frase, planos que duran todos lo mismo y texto que explica en vez de mostrar.

## 0. Qué reutilizas (no lo dupliques)

- `karma-video`: HyperFrames, el modo cinético (§ 3j), sus piezas (`texto-voz`, `transicion-losa`, `tarjetas-ui`,
  `tarjeta-final`, `armar.py`), el lanzador `hf2.cmd`, las reglas de continuidad (§ 3g) y las trampas ya
  conocidas. Cárgala para construir, y con ella `hyperframes:hyperframes`.
- `karma-instagram`: la carpeta de la publicación, los textos (gancho de 125 caracteres, 5 hashtags como mucho),
  la revisión fija (§ 7) y `exportar.py`.
- `BRAND.md`: § Facts (lo único que se puede afirmar), la voz, el logo y «Redes y video» (efectos permitidos).
- Personajes: Bloque y la persona en `assets/mascota/` (poses en su `PROVENANCE.md`).
- `scripts/james.py` (en esta skill): la voz de James por bloques, con los tiempos por palabra.

## 1. La idea antes que el efecto

- Cada reel nace de una situación cubana que se reconoce en un segundo: el anuncio copiado a mano tres veces, el
  teléfono regado por todos los grupos, «¿y eso dónde queda?», la permuta que nunca cuadra. El público se ve a sí
  mismo antes de ver la app. Nada de clichés (almendrones, tabacos, banderas).
- Propón **tres conceptos** de una frase, distintos en su imagen central (no tres versiones de la misma idea). Cada
  uno trae: la situación, la imagen que lo cuenta, el efecto estrella y por qué existe, el gancho dicho y el hecho
  de `BRAND.md` § Facts que lo sostiene. Recomienda uno y espera a que el usuario elija o mezcle.
- Un solo mensaje por reel. Si hay dos funciones, son dos reels.
- Lo que la app hace se comprueba en `src/` antes de enseñarlo, con sus textos reales (por ejemplo, el chat dice
  «Tu teléfono y tu correo no se muestran.» y tiene «Proponer visita», «Hacer oferta», «Reportar conversación» y
  «Bloquear persona»). Si un texto cambia en la app, cambia en el reel.

## 2. Estructura (20–30 s)

| Tramo | Tiempo | Qué pasa |
|---|---|---|
| Gancho | 0–2 s | Una imagen que rompe el patrón y una frase dicha de seis palabras o menos. Empieza en mitad de la acción: sin logo y sin «hola». |
| Problema | 2–7 s | La situación, con humor y en cubano. La persona la sufre. |
| Giro | 7–10 s | KarmaHouse entra con una causa visible: un dedo que toca, una puerta que se abre. |
| Prueba | 10–20 s | La función funcionando con datos de ejemplo («Ejemplo de uso») y los textos reales de la app. |
| Cierre | últimos 3–5 s | Un reposo quieto de 1 s; luego «Descarga KarmaHouse para Android» y karmahouse.site. El último plano rima con el primero, para que el reel se repita solo. |

## 3. La voz: James, que suene a persona

James es la voz del propio usuario, clonada en ElevenLabs («James Cuban Voice», `nHIQAp46desTnCzOPHFm`, modelo
`eleven_multilingual_v2`). La eligió después de descartar Kokoro, Microsoft y HeyGen por robóticas, así que no la
cambies por otra sin preguntar.

- **La clave** está en la variable `ELEVENLABS_API_KEY` del usuario. Nunca la escribas, la muestres, la pidas en
  el chat ni la guardes en un archivo. Si falta, pídele que la guarde él con
  `artifacts/videos/2026-10-18-inmobiliarias-cinetico/guardar-clave.ps1` en una pestaña del Terminal.
- **Graba por bloques**, uno por tramo, no frase a frase: en una sola toma la entonación enlaza las frases y suena a
  alguien hablando. Escribe los bloques en `guion.json` (una lista de textos) y, desde la carpeta del proyecto:
  `python <skill>/scripts/james.py bloques guion.json assets/voice/james` → `bNN.mp3` y `bNN.json` con los tiempos
  por palabra (no hace falta whisper). `--desde N` repite desde un bloque; `cuota` dice cuántos caracteres quedan.
- **Ajustes de partida:** stability 0,40; similarity 0,85; style 0,35; velocidad 1,0. Si suena plano, baja
  `--stability` a 0,32–0,35; si se descontrola o cambia de acento, súbela a 0,45. Nunca más rápido que 1,05: la
  prisa es lo primero que delata una voz sintética.
- **Cuota:** el plan Starter da 40 000 caracteres al mes y un reel de 25 s gasta unos 400 por toma. Como mucho dos
  tomas por bloque; apunta lo gastado en la ficha.
- **Escribe para el oído, no para leer:**
  - Habla un socio cubano, de tú, que te cuenta algo que le resolvió la vida. Una o dos expresiones por reel, no
    más, porque muchas suenan a caricatura: «Oye», «mira», «pa'», «¿Qué tú esperas?», «¡Dale!».
  - Frases de ocho palabras o menos, con preguntas y exclamaciones para que la voz suba y baje.
  - El ritmo se escribe con la puntuación: coma = respiro corto, «…» = duda, punto = pausa. Para un silencio
    exacto, `<break time="0.4s" />`.
  - En el texto de la voz, las palabras se escriben como se dicen: «Karma Jaus» (sin tilde: con «Jáus», James lo
    parte en dos sílabas, «Ja-us»), «aplicación» en vez de «app». En
    pantalla va «KarmaHouse».
  - Una sola imperfección humana a propósito: un «bueno…», una frase que se corrige («no, espérate…»). Es lo que
    hace que el oído crea que hay una persona.
- **Escucha cada bloque** antes de montar. Si una palabra suena rara, reescríbela; no la tapes con música.

## 4. Cámara y montaje: cada efecto tiene un motivo

Todo efecto responde a algo físico de la escena. Si no puedes decir qué lo provoca, quítalo: un efecto sin causa es
la marca de un video hecho en serie.

- **Cámara viva:** un temblor de mano mínimo (0,3–0,8 px) hecho con ruido suave que depende del tiempo, nunca con un
  azar por fotograma (HyperFrames tiene que poder saltar a cualquier fotograma y ver lo mismo); una deriva lenta de
  escala 1,05 → 1,12 en cada plano y paradas en seco en los golpes.
- **Zoom que atraviesa:** la cámara entra por un objeto de la escena (un vidrio del mediopunto, la pantalla del
  teléfono, la puerta, la burbuja del chat) y sale en el plano siguiente. Es el corte principal: dos por reel como
  mucho, para que no pierda fuerza.
- **Desenfoque de movimiento real:** blur direccional proporcional a la velocidad, solo mientras hay movimiento; en
  un barrido (whip pan), 6–10 fotogramas de blur. Profundidad de campo: fondo a `blur(2–3px)`, personajes nítidos,
  bokeh delante, y un cambio de foco para llevar la mirada de un objeto a otro.
- **Rampas de velocidad:** acelera hacia el golpe y frena después (ease in-out fuerte), como un montador que respira
  con la música.
- **Glitch con significado:** solo cuando algo se rompe o se protege. Ejemplo: el número de teléfono se deshace en
  bloques y queda oculto (chat privado). De 2 a 4 fotogramas, con separación cromática RGB de 4–8 px, una o dos
  veces por reel. Antes de hacerlo a mano, busca el efecto en el registro de HyperFrames (`/hyperframes-registry`).
- **Luz:** destello de 0,15 s o menos en el golpe principal (como mucho tres destellos por segundo, por
  fotosensibilidad); fuga de luz cálida de tarde en las transiciones suaves; halo en las luces altas.
- **Textura:** grano animado del 3–5 %, viñeta suave y el color de La Habana a las cinco de la tarde: sombras azul
  mar, altas luces sol. Nada de neón ni degradados arcoíris.
- **Ritmo:** planos de 0,25 s junto a esperas de 2,5 s. Los cortes caen en la música o en la sílaba fuerte de la
  voz. Corte seco solo en una ráfaga de tres golpes o en el cierre. Un reposo quieto de 1 s o más.
- **Texto:** palabra por palabra con la voz. La palabra clave enorme en Bahnschrift condensada, los conectores
  pequeños, «KarmaHouse» en Calistoga 400. Nada de texto encima de y = 240 ni debajo de y = 1540 (la interfaz de
  Instagram lo tapa).

## 5. Sonido

- La voz manda. La música va 18–22 dB por debajo y baja sola cuando habla James.
- Un efecto de sonido en cada causa visible: el toque en la pantalla, el papel, la puerta, la notificación (banco
  de `media-use/audio/assets/sfx/`). El whoosh dura lo mismo que el movimiento; un impacto grave en el golpe
  principal; un tono de sala muy bajo para que nada suene a vacío.
- Cortes J y L: el sonido del plano siguiente entra 6–10 fotogramas antes que la imagen.
- Final a −14 LUFS, con pico de −1,5 dBTP (loudnorm en dos pasadas).

## 6. Lo que nunca cambia

- Solo hechos de `BRAND.md` § Facts o comprobados en el código. Nada de «verificado», «garantizado», cifras,
  precios reales ni testimonios.
- «Ejemplo de uso» en anuncios y chats de ejemplo; «Imagen ilustrativa» en fotos que parezcan reales.
- Sin logos de terceros (Revolico, WhatsApp, Google Play). El logo, azul sobre claro o blanco sobre oscuro. Bloque
  es un personaje, nunca el logo.
- Bloque y la persona actúan en casi todos los planos, en el mundo vóxel.

## 7. Proceso

Cada paso termina en algo que el usuario puede aprobar; no avances sin su visto bueno en los pasos 1, 2 y 5.

1. **Tres conceptos** (§ 1) → el usuario elige.
2. **Guion por bloques** en `GUION.md`, en tabla: tramo · pantalla · voz · qué entiende quien mira. Debajo, por qué
   funciona en tres líneas.
3. **Voz de James** por bloques (§ 3) → escucharla → montar `assets/voice/voz.wav` con huecos de 0,25–0,45 s entre
   bloques y los tiempos por palabra desplazados a su segundo.
4. **Storyboard** en `STORYBOARD.md`: plano por plano con duración, cámara, efecto y su motivo, y en cada corte qué
   elemento sobrevive y qué hace al otro lado (`karma-video` § 3g).
5. **Prueba de 5–8 s** con el gancho y una transición, renderizada → visto bueno antes de seguir.
6. **Construcción** con `karma-video` § 3j, en `artifacts/videos/<AAAA-MM-DD>-<tema>/`; render con
   `--no-browser-gpu`.
7. **Revisión:** `lint` sin errores; hoja de contactos a 2 fps; las transiciones a 10 fps, fotograma a fotograma;
   ningún salto de más de 80 px por fotograma; audio medido con `ebur128`. Míralo como lo vería alguien en el
   móvil: ¿se entiende sin sonido? ¿El primer segundo para el dedo?
8. **Entrega** en la carpeta de `karma-instagram` (`artifacts/instagram/<AAAA-MM-DD>-<tema>/`): `reel.mp4` (x264
   CRF 21, con el comando de `karma-instagram` § 3), `texto.txt`, `comentario.txt`, `alt.txt`, `ficha.md` con los
   caracteres de ElevenLabs gastados, y `exportar.py <carpeta> --textos` sin avisos. No publiques ni subas nada.

## 8. Lo aprendido

Cuando un reel termine, apunta aquí en dos o tres líneas lo que el usuario aprobó o rechazó, para que el siguiente
salga mejor a la primera.
