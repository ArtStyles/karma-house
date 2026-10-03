---
name: karma-video
description: Crea un video promocional de KarmaHouse con HyperFrames (reel, estado de WhatsApp, short, anuncio, intro o tutorial de la app) a partir de cómo lo describe el usuario, con la marca, los datos y los recursos reales del proyecto. Úsala con /karma-video y siempre que pidan un video, reel, animación o promo de KarmaHouse o Karma House, aunque no nombren HyperFrames.
argument-hint: "[cómo quieres el video]"
---

# Video de KarmaHouse

Pedido del usuario:

$ARGUMENTS

Si no hay pedido arriba, pide en una frase que pegue cómo quiere el video y espera. No empieces sin él.

## 1. Entra por HyperFrames

Carga la skill `hyperframes:hyperframes` (router del plugin HyperFrames) y sigue su flujo completo: intención, ruta, `BRIEF.md`, construcción, revisión y render. Esta skill solo aporta el contexto de KarmaHouse; no se salta ni sustituye pasos de HyperFrames. Si esa skill no existe, para y avisa que falta el plugin (`claude plugin install hyperframes@hyperframes`).

Entrega al router el pedido literal del usuario más este contexto, para que no pregunte lo que ya está resuelto:

- **Marca:** `${CLAUDE_SKILL_DIR}/design.md`. En la pregunta de diseño la respuesta es «ya tiene uno»: tras `init`, cópialo como `design.md` a la raíz del proyecto y anótalo en `BRIEF.md` § Assets. Lo que el video puede afirmar está en su sección *Facts*; no inventes cifras, precios ni testimonios.
- **Web oficial para capturar:** https://karmahouse.vercel.app/
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

- **Afirmaciones:** antes del storyboard, lee `capture/extracted/visible-text.txt`. La web publicada manda sobre `design.md` si difieren (aquel día el APK aún no era público).
- **Música sin cuenta HeyGen:** el paso de audio de `product-launch-video` se salta la música. Genérala aparte con el motor de `/media-use`: un `audio_request.json` con `"lines": []` y `"bgm": {"mode": "generate", "prompt": "..."}`, y `audio.mjs --only bgm`. Elige el mejor tramo con librosa (energía y golpes) y recórtalo con ffmpeg. Luego apunta `audio_meta.json` → `bgm.path` al recorte, con `bgm_pending: false`.
- **Fuentes:** cada fuente debe existir como archivo en `assets/fonts/` del proyecto. Copia las de `artifacts/videos/2026-10-03-cartel-se-vende/assets/fonts/` (Georgia, Roboto variable, Permanent Marker) y el bloque `@font-face` de su `frame.md`. Antes de `build-frame`, cambia `-apple-system` por `Roboto` en `capture/extracted/tokens.json`; después pon a mano Georgia en los titulares de `frame.md`.
- **Capturas de la app:** el texto de una captura se lee diminuto en un móvil. Repite en una tarjeta grande lo que tenga que leerse.
- **ffmpeg 9:** usa `-fps_mode passthrough`; `-vsync` ya no existe.

## 4. Entrega

Termina con la ruta del MP4 final, la carpeta del proyecto y cómo reabrir la vista previa. No publiques ni subas el video a ningún sitio sin permiso explícito.
