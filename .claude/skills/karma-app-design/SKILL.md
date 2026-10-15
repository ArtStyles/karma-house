---
name: karma-app-design
description: Diseña, revisa y corrige pantallas y componentes de la app de KarmaHouse en `src/` (la APK de Android y app.karmahouse.site, que comparten código Expo) con la dirección «Mediopunto» de DESIGN.md. Úsala al crear o cambiar una pantalla, hoja, modal o componente de la app, al pulir su aspecto, al revisar su accesibilidad o cuando digan que algo se ve genérico, aunque no mencionen el diseño. No es para la landing de `web/`.
---

# Diseño de la app de KarmaHouse

Combina tres fuentes: el sistema visual de `DESIGN.md` (formato de *awesome-design-md*), la
revisión anti-«hecho por IA» de *taste-skill* (`redesign-skill`: escanear, diagnosticar, corregir sin
reescribir) y las *Web Interface Guidelines* de Vercel, traducidas a React Native en `DESIGN.md` §9.

## Prioridad

1. Lo que pide el usuario.
2. `BRAND.md`: hechos, voz, logo y colores de marca.
3. `DESIGN.md`: cómo se ve la app.
4. Esta skill.

## 1. Leer antes de tocar

- `DESIGN.md` entero y el código de la pantalla con todo lo que importa (`src/components/ui.tsx`,
  `src/theme.ts`, `src/theme/palette.ts`). Reutiliza piezas existentes antes de crear otras.
- Su artboard en el lienzo «KarmaHouse de noche» (tabla de `DESIGN.md` §13). Para leerlo usa la
  herramienta Artifact, acción `read`, con
  `url: https://claude.ai/artifact/LVY8ywGMHRLqTUPBZrp6CZ` y `path: project/<Artboard>.dc.html`.
  Las cifras, nombres y fotos del lienzo son de ejemplo: nunca los copies a la app.
- Si no hay artboard para esa pantalla, compónla con las piezas de `DESIGN.md` §6 y dilo en el
  informe.

## 2. Revisar

Escribe los hallazgos como `ruta:línea — problema → arreglo`, agrupados por archivo. Revisa:

**Tokens.** Busca con Grep, solo en lo que vas a tocar:
- Colores sueltos: `'#[0-9A-Fa-f]{6,8}'` fuera de `src/theme/`.
- Tamaños de letra fuera de la escala: `fontSize:\s*\d+` (la escala está en `typography`).
- Radios fuera de `rounded`: `borderRadius:\s*\d+`.
- Calistoga mal usada: `typefaces.display` con `fontWeight` distinto de `'400'` o tamaño menor de 16.

**Dirección.**
- Una sola cosa domina la pantalla. Una sola acción principal en `blue`.
- El mediopunto aparece solo en sus cuatro papeles y el cartel solo para la operación.
- La luz de lámpara aparece una vez como mucho.
- Cápsulas en todo lo que se toca, tarjetas redondeadas y sin sombras en reposo.
- Las fotos de la ficha se ven completas; en listas, en arco. Sin texto sobre foto sin `scrim`.
- Hay dos estados de color (atención y peligro) y no más; nada de colores nuevos.

**Delatores de diseño genérico** (de *taste-skill*, los compatibles con la marca): títulos de más de
dos líneas, etiquetas diminutas en mayúsculas, numeración decorativa, filas de tarjetas idénticas con
icono, degradados, emoji, cifras o testimonios inventados, botones «Más información» o «Comenzar».

**Accesibilidad.** Todas las filas de `DESIGN.md` §9. Además: objetivo táctil de 44 px, foco visible
en la web y texto al 130 % sin cortes.

**Estados.** Cargando, vacío, error con reintento, sin conexión, texto muy largo, 320 px de ancho y
cuenta sin permisos. Cada uno con su diseño, no una pantalla rota.

**Texto.** Español de Cuba con tú. Los hechos solo de `BRAND.md`. Nunca «verificado» ni «garantizado»:
usa «Perfil revisado por KarmaHouse», «Sello empresarial» y «Revisado antes de publicarse». Usa
«…», `Intl` para fechas y cifras, y botones que digan lo que hacen.

## 3. Corregir

1. Primero los tokens que falten en `src/theme/` y las piezas compartidas
   (`Mediopunto`, `Cartel`, `ArchImage`, `Sheet`, `Pagination`, `StateChip`), una vez.
2. Después la pantalla, sin reescribirla: cambia estilos y estructura, conserva la lógica, los
   textos aprobados y los `accessibility*` que ya existen.
3. No añadas dependencias sin preguntar; Expo 57 y Reanimated ya cubren el movimiento.
4. Movimiento según `DESIGN.md` §7, siempre con `useReducedMotion`.

Comprueba con:

```bash
npm run check
```

## 4. Mirar

La revisión del código no basta. Abre la app en la web con la configuración `web` de
`.claude/launch.json` (puerto 8083) y mira la pantalla:

- A 390 × 844, a 320 × 740 y a 1280 × 800 (con la barra lateral).
- En noche y en día: cambia de modo en Mi espacio → Ajustes de cuenta → Apariencia.
- Con datos largos y con la lista vacía.

Haz capturas y compáralas con el artboard. Pregúntate si una sola cosa domina, si la marca se nota
sin ruido, si algo se sale o se corta, y si el contraste se lee de noche. Corrige los tres problemas
más graves y vuelve a mirar. Tres rondas como mucho.

## 5. Lo que la web no prueba

En el informe, deja como pendiente de un teléfono Android real todo lo que la web no demuestra: la
fuente Calistoga nativa, la barra opaca en Android, las áreas seguras, el teclado sobre las hojas, el
tamaño de letra del sistema y el rendimiento en Android 7. Nunca lo des por probado.

## 6. Informe

Breve: qué pantallas cambiaron, qué hallazgos se corrigieron y cuáles quedan, qué comprobaciones
pasaron (`npm run check`, capturas a cada ancho y modo) y qué queda por probar en Android.
