---
name: landing-page-design
description: Estrategia, estructura, textos de conversión, SEO y lista de entrega para la landing de KarmaHouse en `web/` (karmahouse.site). Úsala al crear, editar, revisar o escribir textos de la landing o de una página nueva de campaña en `web/`, aunque no digan «conversión» ni «landing». No es para la app de Expo. Lo visual (tipografía, colores, movimiento) lo decide BRAND.md.
---

# Landing de KarmaHouse

Adaptada de `landing-page-design` de [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) (MIT). Se quitaron sus reglas visuales porque chocan con la marca.

## Prioridad

1. Lo que pide el usuario.
2. `BRAND.md` (hechos, voz, color, Calistoga, movimiento) y los tokens `@theme` de `web/src/index.css`.
3. Esta skill.

Si algo de aquí choca con `BRAND.md`, gana `BRAND.md`.

Una landing gana una sola intención: **una oferta, un público, una acción.** En KarmaHouse la acción es «Descarga KarmaHouse para Android».

## 1. Antes de escribir

Ya está resuelto; no lo preguntes:

- **Acción y conversión:** descargar el APK oficial desde karmahouse.site.
- **Oferta:** app gratis para comprar, vender, permutar o alquilar vivienda en Cuba, hablando directo con quien publica.
- **Público:** personas en Cuba que buscan o publican vivienda, casi siempre desde el móvil y con datos caros. Diseña primero para móvil.
- **Voz:** español de Cuba, tuteo, frases cortas (`BRAND.md`).
- **Pruebas:** solo los hechos de `BRAND.md` § Facts.

Pregunta solo lo que falte, en un único bloque: de dónde llega el tráfico (anuncio, redes, WhatsApp, búsqueda), qué sabe ya el visitante y qué objeción debe vencer la página. Si no hay respuesta, asume, dilo en una línea y sigue.

Objeciones frecuentes y la respuesta que permiten los hechos:

| Objeción | Respuesta |
|---|---|
| ¿Cuánto cuesta? | Publicar, buscar y conversar es gratis. Sin comisión. |
| ¿Es de fiar? | Los anuncios se revisan antes de publicarse. Nunca «verificado» ni «garantizado». |
| ¿Verán mi teléfono? | Chat privado: nadie ve tu teléfono ni tu correo. Puedes reportar, bloquear o eliminar tu cuenta. |
| ¿Gasta muchos datos? | Fotos optimizadas y ahorro de datos. |
| ¿Funciona en mi teléfono? | Android 7 o superior. |
| ¿De dónde lo bajo? | APK oficial en karmahouse.site. |

## 2. Estructura

**Arriba, sin hacer scroll (obligatorio)**
1. Título: resultado y público. Una sola frase en azul.
2. Subtítulo: aclara qué es y para quién.
3. CTA principal: «Descarga KarmaHouse para Android».
4. Una señal de prueba tomada de los hechos, por ejemplo «Gratis y sin comisión» o «Toda Cuba».
5. Visual: captura real de la app o foto con la etiqueta «Imagen ilustrativa».

**En medio (el argumento)**
6. Problema y solución, en una sección.
7. Tres a cinco beneficios, contados como resultado.
8. Cómo funciona, en tres pasos.
9. Prueba: hechos y capturas reales con la etiqueta «Ejemplo de uso». Sin testimonios, cifras de usuarios ni logos de terceros.

**Al final (objeciones)**
10. Preguntas frecuentes, de seis a doce.
11. Reducción de riesgo: gratis, sin comisión, puedes eliminar tu cuenta.
12. CTA final, igual al de arriba.

La sección de lema (§ 6) va en medio, separada del hero.

**Tipo de página:** elige uno y di por qué.
- **A. Clásica, hero y secciones.** La actual y la opción por defecto.
- **B. Historia larga.** Cuando hay que explicar más o vencer desconfianza.
- **C. Mínima.** Campañas para gente que ya conoce la app: hero, una prueba y descarga.

Las páginas de comparación con otros sitios no aplican: no se nombran terceros ni se muestran sus logos.

**Si la página ya existe**, trabaja sobre `web/src/App.tsx` y sus secciones actuales (hero, `#posibilidades`, `#app`, `#como-funciona`, confianza, `#descargar`, `#preguntas`, `#publicar`). No la rehagas entera.

## 3. Conversión y textos

- Un solo CTA principal visible arriba. Nunca «Más información» ni «Enviar».
- El beneficio va antes que la función.
- Sé concreto, usando solo hechos. ❌ «Encuentra tu hogar ideal fácilmente». ✅ «Habla directo con quien publica. Sin comisión.»
- Pon la prueba junto a la afirmación que respalda.
- Reutiliza las frases del sitio que lista `BRAND.md`.
- Viñetas de beneficio: **beneficio** y luego el detalle. Ejemplo: **Ahorras datos**: las fotos llegan optimizadas.
- Mayúscula solo al inicio de títulos y botones.
- Evita palabras huérfanas: `text-wrap: balance` en títulos (ya está en `index.css`) y `pretty` en párrafos. Corta las líneas del título donde termina una idea.
- Sin clichés de IA («eleva», «sin complicaciones», «revoluciona», «descubre el poder», «sumérgete», «en el mundo de») ni los clichés cubanos que prohíbe `BRAND.md`.
- Errores directos y sin «¡Ups!»: «No se pudo enviar. Inténtalo de nuevo.» Sin exclamaciones en los mensajes de éxito.
- Nada de lorem ipsum, cifras inventadas, precios reales, testimonios ni socios. Los chats de ejemplo llevan la etiqueta «Ejemplo de uso».

## 4. Lo visual lo decide `BRAND.md`

Tipografía, color, fondos, iconos y movimiento salen de `BRAND.md` y de los tokens de `web/src/index.css`. Usa lo que ya está instalado (`lucide-react`, `motion`, Tailwind v4) y no añadas dependencias.

Reglas que no chocan con la marca:

- **Radios:** botones y chips siempre en píldora (`rounded-full`). Si una forma va dentro de otra con menos de 32px de separación, radio interior = radio exterior − separación, solo si el resultado es mayor que 2.
- **Bordes:** en tarjetas, el borde va todo alrededor o no va.
- **Movimiento:** reutiliza `Reveal`, `Stagger` y `StaggerItem` de `web/src/ui.tsx` y la curva `var(--ease-out-soft)`. Para revelar al hacer scroll usa `IntersectionObserver` o `whileInView`, nunca un `window.addEventListener('scroll')` sin limitar con `requestAnimationFrame`. Respeta `prefers-reduced-motion`. La página se prerenderiza: lo del hero se anima en CSS para que se vea aunque no cargue JS.

## 5. Estados

Cada elemento interactivo tiene todos sus estados:

- **Hover:** cambio de fondo o un leve desplazamiento.
- **Active:** `scale(0.98)`.
- **Focus:** foco visible (ya definido en `index.css`).
- **Carga:** esqueleto con la forma real, no un spinner.
- **Error:** en línea y concreto. Nunca `window.alert()`.

Nada de enlaces a `#`: un enlace o lleva a algún sitio o se ve desactivado. La navegación marca la sección actual.

## 6. Sección de lema (recomendada)

Una sección de tipografía grande con el beneficio central, separada del hero. Si la página no la tiene, propónla; no la impongas.

- **Texto:** dos líneas como mínimo. Usa un lema de `BRAND.md`, por ejemplo «Cada hogar, un nuevo comienzo.»
- **Tamaño:** grande, en Calistoga, con saltos de línea donde termina una idea.
- **Animación:** las palabras empiezan apagadas (unos 30 % de opacidad) y pasan al color pleno una a una, en orden de lectura, al cruzar una línea de activación. Usa `var(--ease-out-soft)` y `IntersectionObserver`, o un scroll limitado con `requestAnimationFrame`. Con `prefers-reduced-motion`, el texto sale pleno desde el inicio.

## 7. SEO

- **Páginas permanentes (la principal):** indexar, con `<title>`, meta description, `og:image` y las preguntas frecuentes en formato pregunta y respuesta. Añade el esquema `FAQPage` si encaja.
- **Páginas de campaña ligadas a un anuncio o a una fecha:** `noindex`.

## 8. Antes de entregar

- [ ] Una oferta, un público y una sola acción, sin CTAs que compitan arriba.
- [ ] Cada afirmación existe en `BRAND.md` § Facts. Nada de «verificado», «garantizado» ni «16 provincias».
- [ ] La prueba va al lado de lo que respalda.
- [ ] Una sola frase en azul por título, Calistoga solo en 400 y botones en píldora.
- [ ] Fotos de IA con la etiqueta «Imagen ilustrativa». Capturas de `artifacts/phone/` revisadas para que no muestren nombres, teléfonos, correos ni chats reales.
- [ ] Ningún logo de terceros (Revolico, WhatsApp, Google Play).
- [ ] Estados de hover, active, foco, carga y error. Sin enlaces muertos.
- [ ] Enlaces de privacidad y términos en el pie, y enlace «Saltar al contenido».
- [ ] Página 404 propia, favicon, `<title>`, meta, `og:image` y `alt` en las imágenes.
- [ ] HTML semántico: `nav`, `main`, `section`, `footer`.
- [ ] Probado en móvil y con `prefers-reduced-motion`.

## Página nueva: qué entregar primero

Antes de escribir código, entrega:

1. Esquema de secciones.
2. Textos del hero: título, subtítulo, CTA y línea de prueba.
3. Beneficios, de tres a cinco.
4. Cómo funciona, en tres pasos.
5. Preguntas frecuentes, de seis a doce.
6. SEO: indexar o `noindex`, y title y meta si se indexa.
7. Tipo de página (A, B o C) y por qué.

Después construye sección por sección (hero, beneficios, cómo funciona, prueba, preguntas, CTA final) y no rehagas toda la página en cada vuelta.
