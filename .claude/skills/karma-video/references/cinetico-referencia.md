# Notas del video de referencia (modo cinético)

Video que el usuario compartió el 2026-10-18 como listón de calidad: una grabación de pantalla de 114 s (816×470,
con el video apaisado dentro). Se analizó con ffmpeg: hojas de fotogramas a 1 fps, tramos a 10 fps y detección de
cortes (`select='gt(scene,0.2)'`). No se guardaron fotogramas ni se copian sus personajes, su marca ni sus textos:
aquí solo está lo que le da la calidad, para reproducirlo con lo nuestro.

## Ritmo

- Unos 95 cambios de imagen en 114 s: un golpe cada 1–2 s de media.
- Los cortes vienen en ráfagas (3–4 cambios en 0,1–0,2 s) y alternan con esperas largas de 3–6 s sobre el mismo
  plano mientras el texto sigue entrando. La variación de duración es lo que evita el pase de diapositivas.
- Guion en arco: gancho (una pregunta corta) → problema → revelación → prueba (la cosa funcionando) → llamada final.

## Texto cinético

- El texto sigue la voz palabra por palabra: cada palabra aparece cuando se dice.
- Jerarquía por palabra, no por frase: conectores pequeños (≈ 60 px a 1080 de ancho) arriba o al lado, y la
  palabra clave enorme debajo, en otra fuente y en color.
- Tres fuentes con papel fijo: sans gruesa para el texto corrido, condensada en mayúsculas para la palabra que
  golpea y pixel o mono para cifras, nombres de código y valores.
- Entrada de la palabra clave: llega desde un lado con estela de colores (copias en rojo, cian y amarillo que se
  recogen sobre la letra), desenfoque de movimiento y un pequeño rebote al asentarse (≈ 0,25–0,3 s).
- Las letras pequeñas nacen de color y se asientan en blanco.
- Descifrado: la palabra o el número aparece primero como dígitos o glifos al azar en mono cian y se resuelve
  letra a letra (≈ 0,4 s).
- Glitch: dos copias de color que tiemblan unos frames y se apagan; nunca más de 0,3–0,4 s.
- Etiquetas de interfaz pequeñas en mono con una línea guía hacia el personaje o el objeto que nombran.

## Personajes

- Dos personajes fijos durante todo el video: uno «humano» que guía y otro pequeño y expresivo que reacciona.
  Están en casi todos los planos, aunque sea en una esquina.
- Actúan con poses, no con animación completa: señalar, sorprenderse, celebrar, pensar.
- El cambio de pose se tapa con una ráfaga: el personaje se deshace en partículas (píxeles) y se rehace en la pose
  nueva en 0,2–0,3 s. Con poses fijas generadas por IA basta con eso.
- Reaccionan a lo que pasa (el texto, un objeto que cae, una tarjeta que aparece): la causa se ve.

## Mundo y cámara

- Escenas 3D en el mismo estilo que los personajes (vóxel), con luz cálida de lámpara o de tarde, fondos
  desenfocados (bokeh) y profundidad de campo: el personaje nítido, el fondo blando.
- La cámara nunca está quieta del todo: deriva lenta (escala y desplazamiento) en cada plano, salvo en los reposos.
- Objetos de interfaz como piezas vivas dentro de la escena: tarjetas, ventanas, campos, nunca una pantalla entera
  en miniatura.

## Transiciones (una cada 1–2 s)

- Disolución en bloques: la pantalla se llena de cuadros de color (rojo, blanco, negro) y se vacía en la escena
  nueva, en 2–3 frames.
- Barrido con desenfoque: el plano sale de lado con estelas.
- Destello corto entre escenas.
- Zoom que atraviesa un objeto (una tarjeta, una pantalla) hasta que el objeto es la escena siguiente.
- Pila de tarjetas 3D que se balancea y se aparta con desenfoque.

## Sonido

- Un efecto en cada golpe: whoosh en barridos y entradas, golpes graves en las palabras clave, glitch en el
  glitch, clics en los toques, tecleo en lo que se escribe solo.
- Música de fondo constante, más baja que la voz.

## Cierre

- Los dos personajes en su escena, una tarjeta de llamada a la acción con un campo de texto que se escribe solo y
  un botón con flecha, y una línea pequeña de contexto debajo.

## Cómo se traduce a KarmaHouse

Ver `SKILL.md` § «Modo cinético»: la mascota Bloque y la persona de `assets/mascota/`, la paleta de
`BRAND.md` § «Redes y video» (flamboyán, turquesa y sol para las estelas), las transiciones de marca (losa,
mediopunto, puerta) y las piezas de `piezas/`.
