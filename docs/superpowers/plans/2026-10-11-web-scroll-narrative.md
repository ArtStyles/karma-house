# Narrativa de scroll de la web — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la portada de `web/` como una narrativa de scroll: la ventana en arco del hero se convierte en el teléfono que recorre mapa, ficha, chat y visita; siguen Toda Cuba, el lema, Publicar, Confianza, Descarga y Preguntas.

**Architecture:** Cada escena es una pista alta (`.track`) con un escenario `position: sticky` (`.stage`). `motion` (`useScroll`) entrega el avance 0..1 de la pista y una función `frame(p)` escribe estilos en los elementos marcados `data-part`, sin volver a renderizar React. El CSS solo fija las escenas cuando `<html>` tiene `.js` y el visitante no pidió movimiento reducido; si no, todo se lee como contenido estático. Los textos y hechos viven en `content.ts`, y la matemática pura del scroll en `scroll.ts`, ambos probados con `node --test`.

**Tech Stack:** React 19, Vite 8, Tailwind 4, `motion` 14 (`motion/react`), `lucide-react`, Node 24 (`node --experimental-strip-types --test`).

**Spec:** `docs/superpowers/specs/2026-10-11-web-scroll-narrative-design.md`. Prototipo de referencia: https://claude.ai/artifact/BRxwh5QF5GpWDiPhCEWp65 (versión 3).

**Comandos base** (desde la raíz del repo):
- Tests: `node --experimental-strip-types --test tests/web-*.test.ts`
- Build: `npm --prefix web run build`
- Servidor de desarrollo: `preview_start` con `name: "site"` (puerto 8090). Build servido: `name: "site-dist"` (puerto 8094).

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `web/src/scroll.ts` | Crear | Matemática pura: `seg`, `mix`, `easeOut`, `stepAt`, `pickMode`, `cardSizes`. |
| `web/src/content.ts` | Crear | Hechos, enlaces y textos; `plain` y `structuredData`. |
| `web/scripts/cuba-map.mjs` | Crear (hecho al planificar) | Genera `cuba-map.ts` desde geoBoundaries CUB ADM1. |
| `web/src/cuba-map.ts` | Generado | Contornos de los 16 territorios. |
| `web/src/motion.ts` | Crear | `useMode`, `useParts`, `useStage`, `put`, `fade`. |
| `web/src/ui.tsx` | Reescribir | Clases y piezas compartidas, `Mediopunto` con `lit`, `VerbRotator` sin muelle. |
| `web/src/scenes.css` | Crear | Mecánica de escenas fijas y estado estático. |
| `web/src/index.css` | Modificar | Importa `scenes.css`, grano en modo completo, quita la cinta. |
| `web/index.html` | Modificar | Script que añade `.js`. |
| `web/src/phone/Barrio.tsx` | Crear | Mapa ilustrativo del barrio y posiciones de pins. |
| `web/src/phone/Phone.tsx` | Crear | Marco y pantallas de la app. |
| `web/src/scenes/Journey.tsx` | Crear | Hero, arco → teléfono y los cuatro pasos. |
| `web/src/scenes/Cuba.tsx` | Crear | Mapa de Cuba, lista de territorios y operaciones. |
| `web/src/scenes/Tagline.tsx` | Crear | Lema palabra a palabra. |
| `web/src/scenes/Publish.tsx` | Crear | Publicar en tres gestos y tarjetas de publicación. |
| `web/src/scenes/Trust.tsx`, `Download.tsx`, `Questions.tsx` | Crear | Secciones actuales movidas a `content.ts`. |
| `web/src/App.tsx` | Reescribir | Cabecera con progreso y `aria-current`, pie, JSON-LD y composición. |
| `web/public/404.html`, `sitemap.xml`, `robots.txt` | Crear/Modificar | SEO. |
| `tests/web-scroll.test.ts`, `tests/web-content.test.ts`, `tests/web-cuba-map.test.ts` | Crear | Pruebas puras. |
| `web/README.md` | Modificar | Documentar la nueva estructura. |

Los archivos completos van en bloques precedidos por `<!-- file: ruta -->`.

---

### Task 1: Matemática del scroll

**Files:**
- Create: `web/src/scroll.ts`
- Test: `tests/web-scroll.test.ts`

- [ ] **Step 1: Escribir la prueba**

<!-- file: tests/web-scroll.test.ts -->
```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardSizes, easeOut, pickMode, seg, stepAt } from '../web/src/scroll.ts';

test('seg clamps progress to its window', () => {
  assert.equal(seg(0.1, 0.2, 0.4), 0);
  assert.equal(seg(0.25, 0, 0.5), 0.5);
  assert.equal(seg(0.9, 0.2, 0.4), 1);
});

test('easeOut starts at 0, ends at 1 and never overshoots', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(easeOut(t) >= 0 && easeOut(t) <= 1);
});

test('stepAt splits progress into equal steps and stays in range', () => {
  assert.deepEqual([0, 0.24, 0.25, 0.5, 0.99, 1, 1.4].map((s) => stepAt(s, 4)), [0, 0, 1, 2, 3, 3, 3]);
});

test('pickMode: static for reduced motion, lite for data saver or low memory', () => {
  assert.equal(pickMode({ reduce: true, saveData: true }), 'static');
  assert.equal(pickMode({ reduce: false, saveData: true }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 2 }), 'lite');
  assert.equal(pickMode({ reduce: false, deviceMemory: 4 }), 'full');
  assert.equal(pickMode({ reduce: false }), 'full');
});

test('cardSizes fits the arch in the visual area and keeps the phone at 9:19.5', () => {
  for (const [w, h] of [[560, 640], [343, 380], [300, 900]]) {
    const s = cardSizes(w, h);
    assert.ok(s.archH <= h - 28 + 1e-6, `arch height for ${w}x${h}`);
    assert.ok(s.archW <= w, `arch width for ${w}x${h}`);
    assert.equal(Math.round((s.phoneW / s.phoneH) * 1000), Math.round((9 / 19.5) * 1000));
  }
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --experimental-strip-types --test tests/web-scroll.test.ts`
Expected: FAIL, `Cannot find module '.../web/src/scroll.ts'`.

- [ ] **Step 3: Implementar**

<!-- file: web/src/scroll.ts -->
```ts
// Pure helpers for the scroll scenes. No DOM, so node --test can import them.
export const EASE = [0.22, 1, 0.36, 1] as const;

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
/** Progress of `p` inside the window [a, b], clamped to 0..1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Close to the brand curve cubic-bezier(.22,1,.36,1) and cheap enough to run every frame. */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4.2);
/** Index of the active step when `s` (0..1) is split into `count` equal parts. */
export const stepAt = (s: number, count: number) => Math.min(count - 1, Math.floor(clamp(s) * count));

export type Mode = 'full' | 'lite' | 'static';
/** 'static' when the visitor asks for reduced motion, 'lite' with data saver or ≤ 2 GB of memory, otherwise 'full'. */
export function pickMode({ reduce, saveData, deviceMemory }: { reduce: boolean; saveData?: boolean; deviceMemory?: number }): Mode {
  if (reduce) return 'static';
  if (saveData || (deviceMemory !== undefined && deviceMemory <= 2)) return 'lite';
  return 'full';
}

/** Journey card sizes: the arch window of the hero (10 px frame, mediopunto, bar, 5:4 photo) and the phone it becomes. */
export function cardSizes(w: number, h: number) {
  const pad = 10;
  const iw = Math.max(160, Math.min(w * 0.94 - 2 * pad, 420, (h - 64) / 1.31));
  const phoneH = Math.min(h - 8, 640);
  return { pad, iw, archW: iw + 2 * pad, archH: 36 + 1.31 * iw, transom: iw * 0.51 + 16, phoneH, phoneW: (phoneH * 9) / 19.5 };
}
```

- [ ] **Step 4: Ver que pasa**

Run: `node --experimental-strip-types --test tests/web-scroll.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/scroll.ts tests/web-scroll.test.ts
git commit -m "feat(web): add scroll scene math"
```

---

### Task 2: Textos y hechos

**Files:**
- Create: `web/src/content.ts`
- Test: `tests/web-content.test.ts`

- [ ] **Step 1: Escribir la prueba**

<!-- file: tests/web-content.test.ts -->
```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import * as content from '../web/src/content.ts';
import { PROVINCES as APP_PROVINCES } from '../src/domain/listingOptions.ts';

const { APK, FAQ, INSTALL, JOURNEY, NOTES, PROVINCES, PUBLISH, SHA, VERSION, plain, structuredData } = content;

test('provinces match the app: 15 provinces and the Isla de la Juventud', () => {
  assert.deepEqual([...PROVINCES], [...APP_PROVINCES]);
  assert.equal(PROVINCES.length, 16);
});

test('copy never makes claims BRAND.md forbids', () => {
  const copy = JSON.stringify(Object.fromEntries(Object.entries(content).filter(([, v]) => typeof v !== 'function')));
  for (const banned of [/verificad/i, /garantizad/i, /16 provincias/i, /revolico/i, /whatsapp/i]) assert.doesNotMatch(copy, banned);
});

test('every step has a title and one blue phrase', () => {
  assert.equal(JOURNEY.length, 4);
  assert.equal(PUBLISH.length, 3);
  for (const step of [...JOURNEY, ...PUBLISH]) {
    assert.ok(step.title && step.accent && step.text && step.label);
    assert.ok(!step.title.includes(step.accent));
  }
});

test('download links point at the same release', () => {
  for (const url of [APK, SHA, NOTES, INSTALL]) assert.ok(url.includes(`v${VERSION}`), url);
});

test('structured data mirrors the visible FAQ and the release', () => {
  const graph = structuredData()['@graph'] as any[];
  const app = graph.find((n) => n['@type'] === 'MobileApplication');
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  assert.equal(app.softwareVersion, VERSION);
  assert.equal(app.downloadUrl, APK);
  assert.equal(faq.mainEntity.length, FAQ.length);
  faq.mainEntity.forEach((q: any, i: number) => {
    assert.equal(q.name, FAQ[i].q);
    assert.equal(q.acceptedAnswer.text, plain(FAQ[i].a));
    assert.doesNotMatch(q.acceptedAnswer.text, /</);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `node --experimental-strip-types --test tests/web-content.test.ts`
Expected: FAIL, `Cannot find module '.../web/src/content.ts'`.

- [ ] **Step 3: Implementar**

<!-- file: web/src/content.ts -->
```ts
// Every fact and line of copy on the landing page. Only claims from BRAND.md § Facts and the live site.
export const VERSION = '0.1.20';
export const SITE = 'https://www.karmahouse.site/';
export const RELEASE = 'https://github.com/ArtStyles/karma-house/releases';
export const APK = `${RELEASE}/download/v${VERSION}/KarmaHouse.apk`;
export const SHA = `${APK}.sha256`;
export const NOTES = `${RELEASE}/tag/v${VERSION}`;
export const INSTALL = `${RELEASE}/download/v${VERSION}/INSTALACION.txt`;
export const CODE = 'https://github.com/ArtStyles/karma-house';
export const LEGAL = 'https://artstyles.github.io/karma-house';
export const CONTACT = 'mailto:hernandezfrankjames@gmail.com';
export const ASSISTED_EMAIL = 'fejames07@gmail.com';
export const ASSISTED_CONTACT = `mailto:${ASSISTED_EMAIL}?subject=Ayuda%20para%20publicar%20en%20KarmaHouse`;

/** Section ids in the main navigation, in page order. */
export const NAV: readonly (readonly [id: string, label: string])[] = [
  ['como-funciona', 'Cómo funciona'], ['cuba', 'Toda Cuba'], ['publicar', 'Publicar'], ['preguntas', 'Preguntas'],
];

export const PROOF = ['Anuncios revisados antes de publicarse', 'Chat privado', 'Toda Cuba'];

/** Same list and order as PROVINCES in src/domain/listingOptions.ts: west to east, then the special municipality. */
export const PROVINCES = ['Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Villa Clara', 'Cienfuegos', 'Sancti Spíritus',
  'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud'] as const;

/** A step of a pinned scene. `accent` is the headline's one blue phrase, shown after `title`. */
export type Step = { label: string; title: string; accent: string; text: string };

export const JOURNEY: Step[] = [
  { label: 'Mapa', title: 'Busca', accent: 'con contexto.', text: 'Filtra por precio, habitaciones y estado, y mira las viviendas en el mapa. Quien publica decide si la ubicación es exacta o aproximada.' },
  { label: 'Ficha', title: 'Conoce cada', accent: 'vivienda.', text: 'Revisa fotos y detalles, y guarda las que te interesen para volver a ellas.' },
  { label: 'Chat', title: 'Habla directo con', accent: 'quien publica.', text: 'Cada anuncio tiene su conversación. Otros usuarios no ven tu teléfono ni tu correo.' },
  { label: 'Visita', title: 'Visitas y ofertas,', accent: 'dentro del chat.', text: 'Propón un día y recibe la respuesta en la misma conversación. La negociación y el cierre son entre las partes.' },
];

export const PUBLISH: Step[] = [
  { label: 'Pega tu anuncio', title: 'Pega el texto y', accent: 'se rellena solo.', text: 'Si ya tienes tu anuncio escrito, usa «Pegar anuncio». Revisas el resultado y añades tus fotos antes de enviarlo.' },
  { label: 'Revisión', title: 'Se revisa antes de', accent: 'publicarse.', text: 'Los anuncios pasan por moderación antes de aparecer en el catálogo. Si hay que corregir algo, ves el motivo y lo cambias.' },
  { label: 'En el mapa', title: 'Tu vivienda,', accent: 'en el mapa.', text: 'Aparece en el catálogo y en el mapa, con la ubicación exacta o aproximada que elijas. Publicar es gratis y sin comisión.' },
];

/** The tagline, word by word; `true` marks its one blue phrase. */
export const TAGLINE: (readonly [word: string, blue: boolean])[][] = [
  [['Un', false], ['espacio', false], ['para', false]],
  [['encontrar', false], ['tu', true], ['lugar.', true]],
];

export const OPERATIONS = [
  { icon: 'house', title: 'Comprar', text: 'Busca por zona, presupuesto y características. Guarda las viviendas que te interesen.', href: '#como-funciona', cta: 'Encuentra tu lugar', tone: 'text-blue bg-blue/10' },
  { icon: 'key', title: 'Vender', text: 'Presenta tu vivienda con fotos y detalles. Recibe consultas en su propia conversación.', href: '#publicar', cta: 'Da a conocer tu vivienda', tone: 'text-terracota bg-terracota/10' },
  { icon: 'swap', title: 'Permutar', text: 'Cuenta qué ofreces y qué buscas a cambio, con o sin una diferencia de dinero.', href: '#publicar', cta: 'Explora otra posibilidad', tone: 'text-persiana bg-persiana/10' },
  { icon: 'calendar', title: 'Alquilar', text: 'Publica o busca alquileres por mes o por noche, con el precio y las condiciones a la vista.', href: '#como-funciona', cta: 'Piensa en tu próxima estancia', tone: 'text-ocre bg-ocre/10' },
] as const;

export const TRUST = [
  ['Revisión antes de publicar', 'Los anuncios pasan por moderación. Una revisión del anuncio no certifica la propiedad ni sustituye las comprobaciones antes de un acuerdo.'],
  ['Tu ubicación, a tu manera', 'Quien publica puede indicar una ubicación exacta o aproximada. Decide cuánto compartir.'],
  ['Control de tu cuenta', 'Reporta anuncios, bloquea contactos o elimina tu cuenta y tus datos desde Ajustes.'],
] as const;

export const INSTALL_STEPS = [
  ['Descarga y abre el APK.', 'Usa el botón de esta página. Si Android lo solicita, autoriza al navegador para instalar desde este origen.'],
  ['Deja que Android lo analice.', 'Mantén Play Protect activo. Si solicita un análisis, espera el resultado antes de instalar.'],
  ['Entra y empieza.', 'Inicia sesión o regístrate con tu correo y confirma el enlace que recibas. Para actualizar, instala sobre la versión anterior.'],
] as const;

/** Text with optional inline links, so the FAQ renders as HTML and also feeds structured data as plain text. */
export type Part = string | { text: string; href: string };
export const plain = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');

export const FAQ: { q: string; a: Part[] }[] = [
  { q: '¿Cuánto cuesta usar KarmaHouse?', a: ['Publicar, buscar y conversar es gratis. KarmaHouse no cobra comisión por las operaciones ni interviene en la negociación entre las partes.'] },
  { q: '¿Ya puedo descargar la app?', a: [`Sí. KarmaHouse ${VERSION} está disponible para Android 7 o superior. `, { text: 'Descarga el APK oficial', href: APK }, ' e instálalo siguiendo las instrucciones de esta página. Si ya tienes KarmaHouse, instala la actualización sobre la versión anterior.'] },
  { q: '¿Por qué Android puede mostrar un aviso?', a: ['El APK se instalará fuera de Google Play. Android puede pedir autorización para ese origen y Play Protect puede solicitar un análisis. Mantén Play Protect activo y espera el resultado. Si identifica el archivo como dañino, detén la instalación y contacta con nosotros.'] },
  { q: '¿Cómo compruebo que el APK es el original?', a: ['Descárgalo desde el enlace oficial de esta página y compara su hash con el ', { text: 'archivo SHA-256 de esta versión', href: SHA }, '. Las ', { text: 'notas de la entrega', href: NOTES }, ' también lo incluyen. Compararlo permite detectar cambios; no sustituye al análisis de Play Protect ni implica una aprobación de Google.'] },
  { q: '¿Quién ve mi teléfono o mi correo?', a: ['Otros usuarios no ven esos datos de tu cuenta. La conversación ocurre dentro de la app y puedes bloquear o reportar contactos.'] },
  { q: '¿Qué significa que un anuncio esté revisado?', a: ['Se modera antes de aparecer en el catálogo. Si se rechaza, quien publica puede consultar el motivo y corregirlo. La revisión no certifica la titularidad del inmueble ni garantiza una operación.'] },
  { q: '¿Puedo usarla sin Internet?', a: ['Necesitas conexión para consultar el catálogo y conversar. Los borradores de tus anuncios se guardan en el teléfono hasta que puedas publicarlos.'] },
  { q: '¿Qué ocurre con los enlaces a viviendas?', a: ['Un enlace compartido permite consultar la ficha de una vivienda publicada en el navegador. Con la app instalada, puedes abrirla en KarmaHouse para guardarla o escribir.'] },
];

/** JSON-LD for the page: the app and the FAQ, generated from the same copy the page shows. */
export function structuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'MobileApplication', name: 'KarmaHouse', operatingSystem: 'Android 7 o superior', applicationCategory: 'LifestyleApplication',
        softwareVersion: VERSION, downloadUrl: APK, url: SITE, inLanguage: 'es', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) },
    ],
  };
}
```

- [ ] **Step 4: Ver que pasa**

Run: `node --experimental-strip-types --test tests/web-content.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/content.ts tests/web-content.test.ts
git commit -m "feat(web): gather landing copy and structured data"
```

---

### Task 3: Mapa de Cuba

**Files:**
- Create: `web/scripts/cuba-map.mjs` (escrito y ejecutado al planificar, ver el archivo)
- Create: `web/src/cuba-map.ts` (generado)
- Test: `tests/web-cuba-map.test.ts`
- Modify: `docs/superpowers/specs/2026-10-11-web-scroll-narrative-design.md` (fuente del mapa)

Fuente verificada: geoBoundaries gbOpen CUB ADM1 (OpenStreetMap, ODbL 1.0), 16 unidades con Artemisa, Mayabeque y la Isla de la Juventud. Natural Earth admin-1 completo pesa decenas de MB y la red corta descargas largas, así que se usa esta fuente.

- [ ] **Step 1: Escribir la prueba**

<!-- file: tests/web-cuba-map.test.ts -->
```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CUBA_PROVINCES, CUBA_VIEWBOX } from '../web/src/cuba-map.ts';
import { PROVINCES } from '../web/src/content.ts';

test('map has one outline per province, in PROVINCES order', () => {
  assert.deepEqual(CUBA_PROVINCES.map((p) => p.name), [...PROVINCES]);
  for (const { name, d } of CUBA_PROVINCES) assert.match(d, /^(M[\d. L]+Z)+$/, name);
  assert.equal(CUBA_VIEWBOX, '0 0 1000 343');
});

test('map stays within 25 KB and credits OpenStreetMap', () => {
  const source = readFileSync(new URL('../web/src/cuba-map.ts', import.meta.url), 'utf8');
  assert.ok(Buffer.byteLength(source) <= 25_000);
  assert.match(source, /OpenStreetMap contributors, ODbL/);
});
```

- [ ] **Step 2: Regenerar y probar**

Run (descarga de unos 560 KB):
```bash
curl -sSL --retry 3 -o "$TMP/cub-adm1.geojson" "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/CUB/ADM1/geoBoundaries-CUB-ADM1_simplified.geojson"
node web/scripts/cuba-map.mjs "$TMP/cub-adm1.geojson"
node --experimental-strip-types --test tests/web-cuba-map.test.ts
```
Expected: `cuba-map.ts: 16 provinces, 24797 bytes, viewBox 0 0 1000 343` y 2 tests PASS.

- [ ] **Step 3: Corregir la fuente en el spec**

En el spec, sustituir el párrafo que empieza por «El mapa de Cuba sale de Natural Earth admin-1» por:

```markdown
El mapa de Cuba sale de geoBoundaries gbOpen CUB ADM1 (OpenStreetMap, ODbL 1.0): 16 unidades con Artemisa, Mayabeque y la Isla de la Juventud. `web/scripts/cuba-map.mjs` lo simplifica a 25 KB o menos. La página cita «© colaboradores de OpenStreetMap (ODbL)» bajo el mapa y el archivo generado conserva el aviso de licencia.
```

- [ ] **Step 4: Commit**

```bash
git add web/scripts/cuba-map.mjs web/src/cuba-map.ts tests/web-cuba-map.test.ts docs/superpowers/specs/2026-10-11-web-scroll-narrative-design.md
git commit -m "feat(web): add simplified Cuba province map"
```

---

### Task 4: Base compartida (hooks, UI, CSS de escenas, teléfono)

**Files:**
- Create: `web/src/motion.ts`, `web/src/scenes.css`, `web/src/phone/Barrio.tsx`, `web/src/phone/Phone.tsx`
- Rewrite: `web/src/ui.tsx`
- Modify: `web/src/index.css`, `web/index.html`

- [ ] **Step 1: Hooks de escena**

<!-- file: web/src/motion.ts -->
```ts
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { pickMode, type Mode } from './scroll';

type Nav = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

/** The current mode as a ref, so scroll frames read it without re-rendering. Mirrored on <html data-mode> for CSS. */
export function useMode() {
  const reduce = useReducedMotion();
  const mode = useRef<Mode>('full');
  useEffect(() => {
    const nav = navigator as Nav;
    mode.current = pickMode({ reduce: Boolean(reduce), saveData: nav.connection?.saveData, deviceMemory: nav.deviceMemory });
    document.documentElement.dataset.mode = mode.current;
  }, [reduce]);
  return mode;
}

/** Elements marked data-part="name" inside `root`, collected after mount. These elements never get a JSX `style`:
 *  frames own their inline style. `still(true)` drops what frames wrote once, so the static CSS takes over. */
export function useParts(root: RefObject<HTMLElement | null>) {
  const parts = useRef<Record<string, HTMLElement>>({});
  const dirty = useRef(true);
  useEffect(() => {
    for (const el of root.current!.querySelectorAll<HTMLElement>('[data-part]')) parts.current[el.dataset.part!] = el;
  }, [root]);
  const still = useCallback((isStatic: boolean) => {
    if (!isStatic) { dirty.current = true; return false; }
    if (dirty.current) for (const el of Object.values(parts.current)) el.removeAttribute('style');
    dirty.current = false;
    return true;
  }, []);
  return { parts, still };
}

/** Runs frame(progress) while `track` scrolls: 0 when its top reaches the top of the viewport, 1 when its bottom
 *  reaches the bottom. Frames run once per animation frame through motion's scroll tracking. */
export function useStage(track: RefObject<HTMLElement | null>, frame: (p: number) => void) {
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', frame);
  useEffect(() => frame(scrollYProgress.get()), [frame, scrollYProgress]);
}

export function put(el: Element | undefined, transform: string, opacity?: number) {
  if (!el) return;
  const style = (el as HTMLElement).style;
  style.transform = transform;
  if (opacity !== undefined) style.opacity = String(opacity);
}

export function fade(el: Element | undefined, opacity: number) {
  if (el) (el as HTMLElement).style.opacity = String(opacity);
}
```

- [ ] **Step 2: Reescribir `ui.tsx`**

Mantiene `ProvinceMarquee` hasta la Task 6. `Mediopunto` cambia `animated` por `lit` y `VerbRotator` deja el muelle (que se pasaba del objetivo) por la curva de la marca.

<!-- file: web/src/ui.tsx -->
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, useInView, useReducedMotion, type Variants } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { PROVINCES } from './content';
import { EASE } from './scroll';

export const WRAP = 'mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12';
export const BUTTON = 'inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-blue px-6 text-sm font-semibold text-on-blue transition hover:bg-blue-hover active:scale-[.98]';
export const LINK = 'group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-blue';
export const ARROW = 'size-4 transition-transform group-hover:translate-x-1';

export function Eyebrow({ children, className = 'text-ocre' }: { children: ReactNode; className?: string }) {
  return <p className={`flex items-center gap-3 text-xs font-bold uppercase tracking-[.16em] ${className}`}><span className="h-0.5 w-8 bg-sol" aria-hidden="true" />{children}</p>;
}

/** A headline with its one blue phrase. */
export function Title({ title, accent }: { title: string; accent: string }) {
  return <>{title} <span className="text-blue">{accent}</span></>;
}

// The prerendered HTML shows everything. After hydration, content still below the fold is hidden
// (off screen, so nobody sees it go) and animates in when scrolled to; content already on screen stays put.
// Slow connections and no-JS visitors therefore always get the full page.
function useReveal(amount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const [below, setBelow] = useState(false);
  useEffect(() => { if (ref.current!.getBoundingClientRect().top > innerHeight) setBelow(true); }, []);
  return { ref, initial: false as const, animate: below && !inView ? 'hidden' : 'shown' };
}

type Hidden = { opacity?: number; x?: number; y?: number; scaleX?: number };

/** Fades content up once when it scrolls into view. */
export function Reveal({ children, className, delay = 0, hidden = { opacity: 0, y: 24 }, amount = 0.25 }:
  { children?: ReactNode; className?: string; delay?: number; hidden?: Hidden; amount?: number }) {
  const variants: Variants = {
    hidden: { ...hidden, transition: { duration: 0 } },
    shown: { opacity: 1, x: 0, y: 0, scaleX: 1, transition: { duration: 0.7, ease: EASE, delay } },
  };
  return <m.div className={className} variants={variants} {...useReveal(amount)}>{children}</m.div>;
}

const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const item: Variants = { hidden: { opacity: 0, y: 28, transition: { duration: 0 } }, shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };

/** A list whose children (use <StaggerItem>) appear one after another. */
export function Stagger({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'ol' | 'ul' }) {
  const Tag = m[as] as typeof m.div;
  return <Tag className={className} variants={group} {...useReveal(0.2)}>{children}</Tag>;
}

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'article' }) {
  const Tag = m[as] as typeof m.div;
  return <Tag className={className} variants={item}>{children}</Tag>;
}

export function SectionHeading({ eyebrow, title, id, aside }: { eyebrow: string; title: ReactNode; id: string; aside: ReactNode }) {
  return (
    <Reveal className="grid items-end gap-6 md:grid-cols-[1.3fr_1fr]">
      <div><Eyebrow>{eyebrow}</Eyebrow><h2 id={id} className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">{title}</h2></div>
      <p className="text-[15px] leading-relaxed text-body md:justify-self-end md:text-right">{aside}</p>
    </Reveal>
  );
}

// Mediopunto: the half-moon stained-glass window above Cuban doors. Panes light up from the hub outwards.
const GLASS = ['var(--color-blue)', 'var(--color-sol)', 'var(--color-terracota)', 'var(--color-persiana)'];
const C = 100;
const point = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
function pane(r0: number, r1: number, a0: number, a1: number) {
  const inner = r0 ? `L${point(r0, a1)} A${r0} ${r0} 0 0 0 ${point(r0, a0)}` : `L${C} ${C}`;
  return `M${point(r1, a0)} A${r1} ${r1} 0 0 1 ${point(r1, a1)} ${inner} Z`;
}
const RINGS: [number, number, number][] = [[0, 24, 1], [24, 60, 5], [60, 97, 9]];
const PANES = RINGS.flatMap(([r0, r1, n], ring) =>
  Array.from({ length: n }, (_, i) => ({ d: pane(r0, r1, Math.PI + (i * Math.PI) / n, Math.PI + ((i + 1) * Math.PI) / n), ring, i })));

/** `lit="load"` lights the panes on first paint (CSS, before the JavaScript arrives), `"view"` when the window scrolls
 *  into view, `"always"` shows it lit. Under reduced motion the CSS animation is off and the panes show lit. */
export function Mediopunto({ className, delay = 0, lit = 'load' }: { className?: string; delay?: number; lit?: 'load' | 'view' | 'always' }) {
  const ref = useRef<SVGSVGElement>(null);
  // Any visible part counts: the large window behind the download panel is mostly clipped by the panel.
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const [below, setBelow] = useState(false);
  useEffect(() => { if (lit === 'view' && ref.current!.getBoundingClientRect().top > innerHeight) setBelow(true); }, [lit]);
  const animate = lit === 'load' || (lit === 'view' && below && inView);
  const dark = lit === 'view' && below && !inView;
  return (
    <svg ref={ref} className={className} viewBox="0 0 200 102" aria-hidden="true">
      {PANES.map(({ d, ring, i }) => (
        <path key={d} d={d} fill={ring === 0 ? 'var(--color-sol)' : GLASS[(i + ring) % GLASS.length]} fillOpacity={ring === 2 && i % 2 ? 0.55 : 0.9}
          stroke="var(--color-paper)" strokeWidth="2.6" strokeLinejoin="round"
          className={animate ? 'glass' : undefined} style={animate ? { animationDelay: `${delay + ring * 0.25 + i * 0.05}s` } : dark ? { opacity: 0 } : undefined} />
      ))}
    </svg>
  );
}

export const VERBS = [
  { word: 'comprar', tone: 'bg-blue' },
  { word: 'vender', tone: 'bg-terracota' },
  { word: 'permutar', tone: 'bg-persiana' },
  { word: 'alquilar', tone: 'bg-ocre' },
];

/** Cycles once through the four operations and settles on the first, so it stops before five seconds (WCAG 2.2.2). */
export function VerbRotator() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce || step >= VERBS.length) return;
    const timer = setTimeout(() => setStep(step + 1), step === 0 ? 1400 : 1000);
    return () => clearTimeout(timer);
  }, [reduce, step]);
  const verb = VERBS[step % VERBS.length];
  return (
    <span className={`relative -my-1 inline-grid justify-items-center overflow-hidden rounded-[0.32em] px-[0.34em] pb-[0.06em] align-baseline text-cal transition-colors duration-500 ${verb.tone}`} aria-hidden="true">
      {VERBS.map(({ word }) => <span key={word} className="invisible col-start-1 row-start-1">{word}</span>)}
      <AnimatePresence initial={false}>
        <m.span key={verb.word} className="col-start-1 row-start-1" initial={{ y: '90%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-90%', opacity: 0 }} transition={{ duration: 0.6, ease: EASE }}>{verb.word}</m.span>
      </AnimatePresence>
    </span>
  );
}

export function ProvinceMarquee() {
  const [paused, setPaused] = useState(false);
  const row = (hidden?: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {PROVINCES.map((name) => (
        <li key={name} className="flex items-center whitespace-nowrap font-display text-xl text-espuma md:text-2xl">
          {name}<span className="mx-6 inline-block size-1.5 rotate-45 bg-sol" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bg-mar text-espuma">
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-4 py-5 sm:px-8 lg:px-12">
        <p className="hidden max-w-[11rem] shrink-0 text-xs font-semibold uppercase leading-snug tracking-[.14em] text-sol sm:block">Las 15 provincias y la Isla de la Juventud</p>
        <div className="group relative min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [scrollbar-width:none]">
          <div className="marquee flex w-max" data-paused={paused}>{row()}{row(true)}</div>
        </div>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 text-espuma transition hover:bg-white/10 motion-reduce:hidden">
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          <span className="sr-only">{paused ? 'Reanudar' : 'Pausar'} la lista de provincias</span>
        </button>
      </div>
    </div>
  );
}

/** Thin band of tiles, like the cenefa that borders a Cuban tiled floor. */
export function Cenefa({ className = '' }: { className?: string }) {
  return <div className={`losa h-7 text-ocre opacity-40 ${className}`} aria-hidden="true" />;
}
```

En `web/src/App.tsx`, cambiar en `Download` `<Mediopunto animated={false}` por `<Mediopunto lit="always"`.

- [ ] **Step 3: Mapa del barrio y piezas del teléfono**

<!-- file: web/src/phone/Barrio.tsx -->
```tsx
// An illustrative seaside barrio seen from above. No street names: it is not a real address.
const BLOCKS = Array.from({ length: 14 * 9 }, (_, k) => {
  const r = Math.floor(k / 9), c = k % 9;
  return { x: c * 44 - 40, y: r * 44 + 70, park: (r === 7 && c === 4) || (r === 3 && c === 2), alt: (r * 3 + c) % 5 === 0 };
});

/** Pin positions as [left %, top %] of the map layer. HOUSE_PIN is the house from the hero photo. */
export const PINS: readonly (readonly [number, number])[] = [[28, 34], [74, 30], [44, 47], [62, 58], [24, 68], [80, 70], [52, 80]];
export const HOUSE_PIN = 3;

export function Barrio() {
  return (
    <svg viewBox="0 0 300 640" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <rect width="300" height="640" fill="#F6F1E7" />
      <g transform="rotate(-11 150 330)">
        {BLOCKS.map(({ x, y, park, alt }) => <rect key={`${x},${y}`} x={x} y={y} width="36" height="36" rx="4" fill={park ? '#D5E4D0' : alt ? '#E3D7C2' : '#E9DFCD'} />)}
        {BLOCKS.filter((b) => b.park).flatMap(({ x, y }) => [0, 1, 2, 3, 4].map((t) => (
          <circle key={`${x},${y},${t}`} cx={x + 7 + ((t * 13) % 24)} cy={y + 8 + t * 6} r="3.6" fill="#B5CFAE" />
        )))}
        <circle cx="186" cy="312" r="15" fill="#F6F1E7" /><circle cx="186" cy="312" r="8" fill="#D5E4D0" />
      </g>
      <path d="M-30 600 L330 250" stroke="#fff" strokeWidth="12" />
      <path d="M-30 600 L330 250" stroke="#F6F1E7" strokeWidth="2" strokeDasharray="6 8" />
      <path d="M0 0H300V70Q250 96 190 82T80 92T0 76Z" fill="#CFE0EE" />
      <path d="M0 76Q40 92 80 92T190 82T300 70" fill="none" stroke="#fff" strokeWidth="7" />
      <path d="M20 30q20-8 40 0t40 0M150 22q20-8 40 0t40 0M90 52q20-8 40 0t40 0" fill="none" stroke="#E4EEF7" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ house = false }: { house?: boolean }) {
  return (
    <svg viewBox="0 0 24 30" className="block w-full drop-shadow-[0_3px_3px_rgba(0,0,0,.18)]">
      <path d="M12 29s9-9.5 9-17A9 9 0 0 0 3 12c0 7.5 9 17 9 17z" fill={house ? '#A84C33' : '#0153A8'} /><circle cx="12" cy="12" r="4.2" fill="#fff" />
    </svg>
  );
}
```

<!-- file: web/src/phone/Phone.tsx -->
```tsx
import type { ReactNode } from 'react';
import { Bell, CalendarDays, Check, ChevronLeft, CirclePlus, CircleUser, ClipboardPaste, Compass, Heart, House, MapPin, MessageCircle, Search, SlidersHorizontal } from 'lucide-react';
import { Barrio, HOUSE_PIN, PINS, PinIcon } from './Barrio';

// The phone mirrors the Android app: same labels, colours and layout as its Explorar, chat and Publicar screens.
// Photos, chats and form values are illustrative. Animated scenes pass `part`, a prefix for the data-part names
// their scroll frames look up; static copies omit it.
const dp = (part: string | undefined, name: string) => (part === undefined ? undefined : `${part}${name}`);

export function PhoneFrame({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={`phone-frame ${className}`} role="img" aria-label={label}>
      <div className="phone-screen" aria-hidden="true">{children}</div>
    </div>
  );
}

export function ExploreBar({ part }: { part?: string }) {
  return (
    <div className="relative z-10 bg-[#F5F5F7] px-3 pb-2.5 pt-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] tracking-[-.03em] text-[#0153A8]"><img src="/karmahouse-mark.png" alt="" width="20" height="16" className="h-4 w-5 object-contain" /><span><b className="font-extrabold">Karma</b>House</span></span>
        <span className="flex gap-1.5">{[Bell, MessageCircle].map((Icon, i) => <span key={i} className="grid size-7 place-items-center rounded-full bg-white"><Icon className="size-3.5" /></span>)}</span>
      </div>
      <p className="mt-2.5 text-[15px] font-bold tracking-[-.02em]">Encuentra tu casa en Cuba</p>
      <div className="mt-2 flex items-center gap-2 rounded-full border border-[#E5E5EA] bg-white py-1 pl-3 pr-1">
        <Search className="size-3.5" /><span className="flex-1 text-[#68686D]">Barrio, municipio o calle</span>
        <span className="grid size-6 place-items-center rounded-full bg-[#EAF3FF] text-[#0153A8]"><SlidersHorizontal className="size-3" /></span>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-hidden whitespace-nowrap">
        <span className="phone-chip on"><MapPin className="size-3" />Toda Cuba</span>
        <span className="phone-chip" data-part={dp(part, 'chip')}>Casas</span>
        <span className="phone-chip">Apartamentos</span>
        <span className="phone-chip">Permutas</span>
      </div>
    </div>
  );
}

const TABS = [[Compass, 'Explorar'], [Heart, 'Favoritos'], [CirclePlus, 'Publicar'], [CircleUser, 'Mi espacio']] as const;

export function BottomNav() {
  return (
    <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex rounded-full bg-white p-1 text-[9px] shadow-[0_6px_20px_rgba(0,0,0,.12)]">
      {TABS.map(([Icon, label], i) => (
        <span key={label} className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1 ${i ? 'text-[#68686D]' : 'bg-[#EAF3FF] font-semibold text-[#0153A8]'}`}><Icon className="size-3.5" />{label}</span>
      ))}
    </div>
  );
}

export function BarrioMap({ part }: { part?: string }) {
  return (
    <>
      <Barrio />
      {PINS.map(([x, y], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
          <span className="phone-pin" data-part={dp(part, `pin${i}`)}><PinIcon house={i === HOUSE_PIN} /></span>
        </span>
      ))}
    </>
  );
}

export function ListingSheet({ part }: { part?: string }) {
  return (
    <div className="phone-sheet">
      <span className="mx-auto mb-2 block h-1 w-9 rounded-full bg-[#E5E5EA]" />
      <div className="relative h-[118px] overflow-hidden rounded-2xl">
        <picture><source type="image/avif" srcSet="/vedado-640.avif" /><img src="/vedado.jpg" alt="" loading="lazy" className="size-full object-cover object-[58%_center]" /></picture>
        <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold">Imagen ilustrativa</span>
        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white">
          <Heart className="col-start-1 row-start-1 size-3.5" />
          <Heart className="col-start-1 row-start-1 size-3.5 fill-[#A84C33] text-[#A84C33] opacity-0" data-part={dp(part, 'heart')} />
        </span>
      </div>
      <div className="mt-2.5 grid gap-1.5"><span className="block h-2.5 w-1/2 rounded-full bg-[#DCDCE0]" /><span className="block h-2 w-4/5 rounded-full bg-[#E5E5EA]" /><span className="block h-2 w-3/5 rounded-full bg-[#E5E5EA]" /></div>
      <span className="phone-toast" data-part={dp(part, 'saved')}>Guardada en Favoritos</span>
    </div>
  );
}

export function ChatScreen({ part }: { part?: string }) {
  const bubble = (name: string, text: string, me: boolean) => <p className={`phone-bubble${me ? ' me' : ''}`} data-part={dp(part, name)}>{text}</p>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[#E5E5EA] bg-white px-2.5 pb-2.5 pt-4">
        <ChevronLeft className="size-4 text-[#0153A8]" />
        <span className="grid size-8 place-items-center rounded-full bg-[#EAF3FF] text-[#0153A8]"><House className="size-4" /></span>
        <span className="leading-tight"><strong className="block">Tu próxima vivienda</strong><span className="text-[10px] text-[#68686D]">Conversación privada</span></span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-1.5 p-2.5">
        {bubble('b1', 'Hola, ¿sigue disponible?', true)}
        {bubble('b2', 'Sí. ¿Quieres verla esta semana?', false)}
        {bubble('b3', '¿Podemos coordinar una visita?', true)}
        <div className="phone-visit" data-part={dp(part, 'visit')}>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#EAF3FF] text-[#0153A8]"><CalendarDays className="size-3.5" /></span>
          <span className="min-w-0 flex-1 leading-tight"><strong className="block">Propuesta de visita</strong><span className="text-[10px] text-[#68686D]">Sábado · 10:30 a. m.</span></span>
          <span className="grid text-[10px] font-bold">
            <span className="col-start-1 row-start-1 rounded-full bg-[#F7EAD0] px-2 py-0.5 text-[#7A5212]" data-part={dp(part, 'wait')}>Pendiente</span>
            <span className="col-start-1 row-start-1 inline-flex items-center gap-0.5 rounded-full bg-[#E1EEE4] px-2 py-0.5 text-[#2C5638] opacity-0" data-part={dp(part, 'ok')}>
              <Check className="phone-tick size-2.5" strokeWidth={3.4} data-part={dp(part, 'tick')} />Aceptada
            </span>
          </span>
        </div>
        {bubble('b4', 'Perfecto, te espero el sábado.', false)}
      </div>
      <div className="mx-2.5 rounded-full border border-[#E5E5EA] bg-white px-3 py-1.5 text-[#68686D]">Escribe un mensaje</div>
      <p className="py-2 text-center text-[10px] text-[#68686D]">Ejemplo de uso · No es una conversación real</p>
    </div>
  );
}

const FIELDS = [['Operación', 'Venta'], ['Tipo', 'Casa'], ['Provincia', 'La Habana'], ['Habitaciones', '3']] as const;

export function PublishScreen({ part }: { part?: string }) {
  return (
    <div className="flex h-full flex-col px-3 pt-4">
      <p className="text-[15px] font-bold tracking-[-.02em]">Nuevo anuncio</p>
      <span className="phone-paste mt-2" data-part={dp(part, 'paste')}><ClipboardPaste className="size-3.5" />Pegar anuncio</span>
      <div className="phone-note mt-2" data-part={dp(part, 'note')}>
        <span className="block h-1.5 w-11/12 rounded-full bg-[#D9D9DE]" /><span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-[#D9D9DE]" /><span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-[#D9D9DE]" />
      </div>
      <div className="mt-2.5 grid gap-1.5">
        {FIELDS.map(([label, value], i) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-[#E5E5EA] bg-white px-2.5 py-2">
            <span className="text-[#68686D]">{label}</span><span className="phone-fill font-semibold" data-part={dp(part, `f${i}`)}>{value}</span>
          </div>
        ))}
      </div>
      <span className="phone-send mt-auto" data-part={dp(part, 'send')}>Enviar a revisión</span>
      <p className="py-2.5 text-center text-[10px] text-[#68686D]">Ejemplo de uso</p>
      <div className="phone-status pinned-only" data-part={dp(part, 'status')}>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#EAF3FF] text-[#0153A8]"><House className="size-4" /></span>
        <span className="min-w-0 flex-1 leading-tight"><strong className="block">Tu anuncio</strong><span className="text-[10px] text-[#68686D]">Casa · Venta · La Habana</span></span>
        <span className="grid text-[10px] font-bold">
          <span className="col-start-1 row-start-1 rounded-full bg-[#F7EAD0] px-2 py-0.5 text-[#7A5212]" data-part={dp(part, 'review')}>En revisión</span>
          <span className="col-start-1 row-start-1 rounded-full bg-[#E1EEE4] px-2 py-0.5 text-[#2C5638] opacity-0" data-part={dp(part, 'live')}>Publicado</span>
        </span>
      </div>
      <div className="phone-pubmap pinned-only" data-part={dp(part, 'map')}>
        <Barrio />
        <span className="absolute left-[62%] top-[52%]"><span className="phone-pin" data-part={dp(part, 'pin')}><PinIcon house /></span></span>
        <span className="phone-toast" data-part={dp(part, 'toast')}>Tu vivienda ya está en el mapa</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS de escenas**

<!-- file: web/src/scenes.css -->
```css
/* Scroll scenes. A scene is a tall .track around a sticky .stage. Scenes pin only when the head script has added
   .js to <html> and the visitor allows motion; otherwise each reads as static content in document order.
   Frames (motion.ts) write transform, opacity and clip-path, except the journey card, whose box is contained. */

html:not(.js) .pinned-only { display: none }
@media (prefers-reduced-motion: reduce) { .pinned-only { display: none } }
.track, .stage { position: relative }

.glow { display: none; position: absolute; width: 80vmin; aspect-ratio: 1; border-radius: 50%; right: -10vmin; top: 50%; translate: 0 -50%; pointer-events: none }
html[data-mode="full"] .glow { display: block }
.glow-sol { background: radial-gradient(closest-side, color-mix(in srgb, var(--color-sol) 40%, transparent), transparent) }
.glow-terracota { background: radial-gradient(closest-side, color-mix(in srgb, var(--color-terracota) 28%, transparent), transparent); opacity: 0 }

/* Phone ------------------------------------------------------------------------------------------------- */
.phone-frame { aspect-ratio: 9 / 19.5; padding: 7px; border: 1px solid var(--color-line); border-radius: 36px; background: var(--color-paper); box-shadow: 0 40px 80px -40px rgba(26, 43, 59, .45) }
.phone-screen { position: relative; height: 100%; overflow: hidden; isolation: isolate; border-radius: 29px; background: #F5F5F7; color: #1D1D1F; font-size: 11px; line-height: 1.35 }
.phone-chip { display: inline-flex; flex-shrink: 0; align-items: center; gap: 4px; border: 1px solid #E5E5EA; border-radius: 999px; background: #fff; padding: 3px 9px; transition: background .3s, color .3s }
.phone-chip.on { border-color: transparent; background: #EAF3FF; color: #0153A8; font-weight: 600 }
.phone-pin { display: block; width: 24px; transform: translate(-50%, -100%); transform-origin: 50% 100% }
.phone-sheet { position: relative; padding: 8px 10px 16px; border-radius: 20px 20px 0 0; background: #fff; box-shadow: 0 -14px 34px -16px rgba(0, 0, 0, .35) }
.phone-toast { position: absolute; left: 50%; bottom: 16px; z-index: 6; translate: -50% 0; white-space: nowrap; border-radius: 999px; background: #1D1D1F; color: #fff; padding: 4px 12px; font-size: 10px; font-weight: 600; opacity: 0 }
.phone-bubble { align-self: flex-start; max-width: 84%; padding: 7px 10px; border: 1px solid #E5E5EA; border-radius: 15px 15px 15px 4px; background: #fff }
.phone-bubble.me { align-self: flex-end; border-color: transparent; border-radius: 15px 15px 4px 15px; background: #0153A8; color: #fff }
.phone-visit { display: flex; align-self: flex-end; align-items: center; gap: 8px; width: 88%; padding: 8px; border: 1px solid #E5E5EA; border-radius: 14px; background: #fff }
.phone-paste { display: inline-flex; align-self: flex-start; align-items: center; gap: 5px; border-radius: 999px; background: #EAF3FF; color: #0153A8; padding: 5px 10px; font-weight: 600 }
.phone-note { border: 1px dashed #C9C9CF; border-radius: 12px; background: #fff; padding: 8px }
.phone-fill { display: inline-block }
.phone-send { display: block; border-radius: 999px; background: #0153A8; color: #fff; padding: 8px; text-align: center; font-weight: 600 }
.phone-status { position: absolute; inset: auto 8px 40px; z-index: 4; display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #E5E5EA; border-radius: 16px; background: #fff; box-shadow: 0 12px 30px -14px rgba(0, 0, 0, .35) }
.phone-pubmap { position: absolute; inset: 0; z-index: 5; overflow: hidden; background: #F6F1E7 }

/* Pinned scenes ----------------------------------------------------------------------------------------- */
@media (prefers-reduced-motion: no-preference) {
  .js .track { height: calc(var(--screens) * 100vh); height: calc(var(--screens) * 100svh) }
  .js .stage { position: sticky; top: 76px; height: calc(100vh - 76px); height: calc(100svh - 76px); overflow: clip }
  .js .static-only { display: none }
}
```

- [ ] **Step 5: `index.css` e `index.html`**

En `web/src/index.css`, añadir tras `@import "@fontsource/calistoga/latin-400.css";`:

```css
@import "./scenes.css";
```

y al final del archivo:

```css
/* Soft grain, full mode only (see useMode in motion.ts). */
html[data-mode="full"] body::after {
  content: ""; position: fixed; inset: 0; z-index: 70; pointer-events: none; opacity: .045;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

En `web/index.html`, añadir justo después de `<meta name="viewport" ...>`:

```html
  <script>document.documentElement.classList.add('js')</script>
```

- [ ] **Step 6: Build y comprobación**

Run: `npm --prefix web run build`
Expected: termina con `prerendered dist/index.html`. La portada actual se ve igual en `site` (el verbo ya no rebota).

- [ ] **Step 7: Commit**

```bash
git add web/src/motion.ts web/src/ui.tsx web/src/scenes.css web/src/phone web/src/index.css web/index.html web/src/App.tsx
git commit -m "feat(web): add scroll scene foundation and phone parts"
```

---

### Task 5: Escena del recorrido (hero → teléfono)

**Files:**
- Create: `web/src/scenes/Journey.tsx`
- Modify: `web/src/scenes.css`, `web/src/App.tsx`

- [ ] **Step 1: Componente**

<!-- file: web/src/scenes/Journey.tsx -->
```tsx
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, MapPin } from 'lucide-react';
import { JOURNEY, PROOF } from '../content';
import { fade, put, useMode, useParts, useStage } from '../motion';
import { HOUSE_PIN, PINS } from '../phone/Barrio';
import { BarrioMap, BottomNav, ChatScreen, ExploreBar, ListingSheet, PhoneFrame } from '../phone/Phone';
import { cardSizes, easeOut, mix, seg, stepAt } from '../scroll';
import { ARROW, BUTTON, Eyebrow, LINK, Mediopunto, Title, VerbRotator, WRAP } from '../ui';

type Sizes = ReturnType<typeof cardSizes> & { dy: number };
const BUBBLES = [['b1', 0.58, 0.63], ['b2', 0.63, 0.68], ['b3', 0.68, 0.73], ['b4', 0.94, 0.98]] as const;

/** Hero and «Del mapa a la conversación»: the arch window turns into the phone, the camera pulls back from the
 *  house to the barrio (the house becomes the terracotta pin), then map, listing, chat and visit. */
export function Journey() {
  const track = useRef<HTMLElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const sizes = useRef<Sizes | null>(null);
  const progress = useRef(0);
  const [step, setStep] = useState(-1);

  const frame = useCallback((p: number) => {
    progress.current = p;
    const P = parts.current, size = sizes.current;
    if (still(mode.current === 'static') || !size || !P.card) return;
    const full = mode.current === 'full';
    const m = easeOut(seg(p, 0.03, 0.17));
    const s = seg(p, 0.15, 1);

    // 1. The arch window becomes the phone.
    const W = mix(size.archW, size.phoneW, m), H = mix(size.archH, size.phoneH, m), pad = mix(size.pad, 7, m);
    const r1 = mix(size.archW / 2, 36, m), r2 = mix(30, 36, m);
    const sway = full ? ` rotateY(${Math.sin(s * Math.PI * 2) * 3.5 * m}deg) rotateX(${2 * Math.sin(s * Math.PI) * m}deg)` : '';
    Object.assign(P.card.style, {
      width: `${W}px`, height: `${H}px`, borderRadius: `${r1}px ${r1}px ${r2}px ${r2}px`,
      transform: `translate(-50%, -50%) translateY(${size.dy * m}px)${sway}`,
    });
    const sr = mix(4, 29, m), sb = mix(22, 29, m);
    Object.assign(P.screen.style, {
      top: `${pad + size.transom * (1 - m)}px`, left: `${pad}px`, right: `${pad}px`, bottom: `${pad}px`, borderRadius: `${sr}px ${sr}px ${sb}px ${sb}px`,
    });
    put(P.transom, `translateY(${-14 * m}px) scale(${1 - 0.08 * m})`, 1 - seg(m, 0, 0.55));
    put(P.photo, `scale(${1 - 0.95 * easeOut(seg(m, 0.1, 1))})`, 1 - seg(m, 0.55, 0.95));
    fade(P.caption, 1 - seg(m, 0, 0.3));
    put(P.hero, `translateY(${-24 * easeOut(seg(p, 0.015, 0.07))}px)`, 1 - seg(p, 0.015, 0.06));
    P.hero.style.visibility = p > 0.07 ? 'hidden' : '';
    fade(P.losa, 0.06 * m);
    if (full) { fade(P.sun1, 0.7 * (1 - s * 0.7)); fade(P.sun2, 0.55 * s); }
    fade(P.lineBox, seg(p, 0.1, 0.14));
    put(P.line, `scaleX(${s})`);

    // 2. The story inside the same phone.
    const settle = easeOut(seg(s, 0, 0.2));
    put(P.plane, `scale(${(1 + 2.6 * (1 - m)) * (1.06 - 0.06 * settle)})${full ? ` rotateX(${12 * (1 - settle) * m}deg)` : ''}`, seg(m, 0.25, 0.7));
    PINS.forEach((_, i) => {
      const d = i === HOUSE_PIN ? seg(m, 0.7, 1) : easeOut(seg(s, 0.02 + i * 0.02, 0.09 + i * 0.02));
      const grow = i === HOUSE_PIN ? 1 + 0.4 * easeOut(seg(s, 0.2, 0.26)) : 1;
      put(P[`pin${i}`], `translate(-50%, -100%) translateY(${-24 * (1 - d)}px) scale(${(0.6 + 0.4 * d) * grow})`, d);
    });
    put(P.ui, `translateY(${-10 * (1 - seg(m, 0.6, 1))}px)`, seg(m, 0.6, 1));
    P.chip.classList.toggle('on', s > 0.12);
    put(P.sheet, `translateY(${(1 - easeOut(seg(s, 0.26, 0.36))) * 105}%)`);
    fade(P.heart, seg(s, 0.4, 0.44));
    const saved = easeOut(seg(s, 0.42, 0.46)) * (1 - seg(s, 0.49, 0.52));
    put(P.saved, `translateY(${(1 - saved) * 8}px)`, saved);
    put(P.chat, `translateX(${(1 - easeOut(seg(s, 0.5, 0.6))) * 102}%)`);
    for (const [name, a, b] of BUBBLES) { const t = easeOut(seg(s, a, b)); put(P[name], `translateY(${(1 - t) * 12}px)`, t); }
    const visit = easeOut(seg(s, 0.76, 0.84));
    put(P.visit, `translateY(${(1 - visit) * 14}px) scale(${0.96 + 0.04 * visit})`, visit);
    const ok = seg(s, 0.87, 0.93);
    fade(P.wait, 1 - ok);
    fade(P.ok, ok);
    P.tick.style.clipPath = `inset(0 ${100 - easeOut(ok) * 100}% 0 0)`;
    setStep(p < 0.1 ? -1 : stepAt(s, 4));
  }, [mode, parts, still]);

  useStage(track, frame);

  // Card sizes depend on the visual area; on phones the card also moves up into the room the hero copy leaves.
  useEffect(() => {
    const P = parts.current;
    const wide = matchMedia('(min-width: 1024px)');
    const measure = () => {
      const vis = P.visual.getBoundingClientRect();
      if (!vis.height) return;
      const base = cardSizes(vis.width, vis.height);
      let phoneH = base.phoneH, dy = 0;
      if (!wide.matches) {
        const from = P.stepsBox.getBoundingClientRect().bottom + 14, to = vis.bottom - 4;
        phoneH = Math.min(to - from, 640);
        dy = (from + to) / 2 - (vis.top + vis.bottom) / 2;
      }
      sizes.current = { ...base, phoneH, phoneW: (phoneH * 9) / 19.5, dy };
      P.transom.style.width = `${base.iw}px`;
      frame(progress.current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(P.stage);
    document.fonts?.ready.then(measure);
    measure();
    return () => observer.disconnect();
  }, [frame, parts]);

  return (
    <section ref={track} id="como-funciona" className="journey track" style={{ '--screens': 5.6 } as CSSProperties} aria-labelledby="hero-title">
      <span id="app" className="absolute top-[22%]" aria-hidden="true" />
      <div className="stage" data-part="stage">
        <div className="glow glow-sol" data-part="sun1" aria-hidden="true" />
        <div className="glow glow-terracota" data-part="sun2" aria-hidden="true" />
        <div className="losa journey-losa pinned-only" data-part="losa" aria-hidden="true" />
        <div className={`${WRAP} journey-layout`}>
          <div className="journey-text">
            <div data-part="hero">
              <div className="rise"><Eyebrow>Viviendas en Cuba</Eyebrow></div>
              <h1 id="hero-title" className="rise mt-6 text-[clamp(2.4rem,5.4vw,4.6rem)] leading-[1.05]" style={{ animationDelay: '80ms' }}>
                Tu casa en Cuba,<br />para <span className="sr-only">comprar, vender, permutar o alquilar</span><VerbRotator />
              </h1>
              <p className="rise mt-6 max-w-[31rem] text-[1.075rem] leading-relaxed text-body" style={{ animationDelay: '160ms' }}>
                Compra, vende, permuta o alquila, y habla directamente con quien publica. Gratis y sin comisión.
              </p>
              <div className="rise mt-8 flex flex-wrap items-center gap-x-7 gap-y-3" style={{ animationDelay: '240ms' }}>
                <a className={`${BUTTON} group`} href="#descargar">Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
                <a className={LINK} href="#publicar">Publica tu vivienda <ArrowRight className={ARROW} aria-hidden="true" /></a>
              </div>
              <ul className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-body" style={{ animationDelay: '320ms' }} aria-label="Características de KarmaHouse">
                {PROOF.map((text, i) => (
                  <li key={text} className={`flex items-center gap-2 ${i === 0 ? 'max-sm:hidden' : ''}`}><Check className="size-4 text-persiana" aria-hidden="true" />{text}</li>
                ))}
              </ul>
            </div>
            <div className="journey-steps" data-part="stepsBox">
              <ol>
                {JOURNEY.map((s, i) => (
                  <li key={s.label} className={i === step ? 'on' : undefined}>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-ocre">{i + 1} · {s.label}</p>
                    <h2 className="mt-3 text-[clamp(1.9rem,4.2vw,3.4rem)]"><Title title={s.title} accent={s.accent} /></h2>
                    <p className="mt-4 max-w-[30rem] leading-relaxed text-body">{s.text}</p>
                  </li>
                ))}
              </ol>
              <div className="journey-line pinned-only" data-part="lineBox" aria-hidden="true"><span data-part="line" /></div>
              <PhoneFrame className="static-only mx-auto mt-12 w-[min(300px,80vw)]" label="Pantalla Explorar de la app KarmaHouse: mapa del barrio con viviendas y la ficha de una vivienda. Imagen y datos ilustrativos.">
                <BarrioMap /><ExploreBar />
                <div className="absolute inset-x-0 bottom-0 z-10"><ListingSheet /></div>
              </PhoneFrame>
            </div>
          </div>
          <div className="journey-visual" data-part="visual">
            <div className="journey-card" data-part="card" role="img"
              aria-label="Ventana en arco con una vivienda que se convierte en la app KarmaHouse: mapa del barrio, ficha, conversación privada y propuesta de visita aceptada. Imagen y datos ilustrativos.">
              <div className="journey-transom" data-part="transom" aria-hidden="true"><Mediopunto className="block w-full" delay={0.35} /><i /></div>
              <div className="journey-screen" data-part="screen" aria-hidden="true">
                <div className="journey-plane pinned-only" data-part="plane"><BarrioMap part="" /></div>
                <div className="journey-photo" data-part="photo">
                  <picture>
                    <source type="image/avif" srcSet="/vedado-640.avif 640w, /vedado-1200.avif 1200w" sizes="(min-width: 1024px) 420px, 90vw" />
                    <img src="/vedado.jpg" width="1200" height="800" alt="" fetchPriority="high" className="size-full object-cover object-[58%_center]" />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-mar/70 via-mar/0 to-mar/0" />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-cal/90 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur"><MapPin className="size-3.5 text-terracota" aria-hidden="true" />Hecho para Cuba</span>
                  <p className="absolute bottom-5 left-5 font-display text-[clamp(1.2rem,2.4vw,1.6rem)] leading-tight text-white">Cada hogar,<br />un nuevo comienzo.</p>
                </div>
                <div className="journey-ui pinned-only" data-part="ui"><ExploreBar part="" /><BottomNav /></div>
                <div className="journey-sheet pinned-only" data-part="sheet"><ListingSheet part="" /></div>
                <div className="journey-chat pinned-only" data-part="chat"><ChatScreen part="" /></div>
              </div>
            </div>
            <p className="journey-caption" data-part="caption">Imagen ilustrativa. No corresponde a un anuncio.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: CSS del recorrido**

Añadir al final de `web/src/scenes.css`:

```css
/* Journey ----------------------------------------------------------------------------------------------- */
.journey .stage { padding-block: 2.5rem 4rem }
.journey-layout { position: relative; display: grid; gap: 3.5rem; align-items: center }
@media (min-width: 1024px) { .journey-layout { grid-template-columns: 1.15fr 1fr } }
.journey-steps ol { display: grid; gap: 2.5rem; margin: 3.5rem 0 0; padding: 0; list-style: none }
.journey-card { position: relative; width: min(440px, 100%); margin-inline: auto; padding: 10px; border: 1px solid var(--color-line); border-radius: 999px 999px 34px 34px; background: var(--color-paper); box-shadow: 0 40px 80px -40px rgba(26, 43, 59, .45) }
.journey-transom i { display: block; height: 10px; margin-block: 6px; border-radius: 999px; background: var(--color-ink); opacity: .85 }
.journey-screen { position: relative; aspect-ratio: 5 / 4; overflow: hidden; isolation: isolate; border-radius: 6px 6px 26px 26px; background: #F6F1E7 }
.journey-photo { position: absolute; inset: 0; z-index: 2; transform-origin: 64% 55% }
.journey-caption { margin-top: 1rem; text-align: center; font-size: .75rem; color: var(--color-body) }
.journey-plane { position: absolute; inset: -8%; transform-origin: 62% 58% }
.journey-ui { position: absolute; inset: 0; z-index: 3 }
.journey-sheet { position: absolute; inset: auto 0 0; z-index: 4 }
.journey-chat { position: absolute; inset: 0; z-index: 5; background: #F5F5F7 }
.journey-line { position: relative; height: 3px; max-width: 30rem; margin-top: 1.25rem; overflow: hidden; border-radius: 3px; background: var(--color-line) }
.journey-line span { position: absolute; inset: 0; transform: scaleX(0); transform-origin: left; background: linear-gradient(90deg, var(--color-sol), var(--color-terracota), var(--color-blue)) }
.journey-losa { position: absolute; inset: 0; color: var(--color-ocre); opacity: 0 }

@media (prefers-reduced-motion: no-preference) {
  .js .journey .stage { padding-block: 1.25rem }
  .js .journey-layout { height: 100%; grid-template-rows: auto minmax(0, 1fr); gap: 1.25rem; align-items: stretch }
  .js .journey-text { display: grid; align-items: start }
  .js .journey-text > * { grid-area: 1 / 1 }
  .js .journey-steps ol { margin: 0; gap: 0 }
  .js .journey-steps li { grid-area: 1 / 1; opacity: 0; transform: translateY(12px); transition: opacity .45s var(--ease-out-soft), transform .45s var(--ease-out-soft) }
  .js .journey-steps li.on { opacity: 1; transform: none }
  .js .journey-visual { position: relative; min-height: 0; align-self: stretch; perspective: 1400px; container-type: size }
  .js .journey-card { --iw: min(420px, 86vw - 20px); position: absolute; left: 50%; top: 50%; margin: 0; padding: 0; contain: layout paint;
    width: calc(var(--iw) + 20px); height: calc(var(--iw) * 1.31 + 36px); transform: translate(-50%, -50%); will-change: transform }
  .js .journey-transom { position: absolute; left: 10px; top: 10px; width: var(--iw) }
  .js .journey-screen { position: absolute; aspect-ratio: auto; left: 10px; right: 10px; bottom: 10px; top: calc(26px + var(--iw) * .51) }
  .js .journey-caption { position: absolute; inset-inline: 0; bottom: 0; margin: 0 }
  .js .journey-plane, .js .journey-ui, .js .journey-line, .js .journey .phone-pin, .js .journey .phone-bubble, .js .journey .phone-visit { opacity: 0 }
  .js .journey-sheet { transform: translateY(105%) }
  .js .journey-chat { transform: translateX(102%) }
  .js .journey .phone-tick { clip-path: inset(0 100% 0 0) }
  @media (min-width: 1024px) {
    .js .journey-layout { grid-template-rows: none; grid-template-columns: 1.05fr 1fr; align-items: center; gap: 3.5rem }
    .js .journey-text { align-items: center }
  }
  @supports (width: 1cqw) { .js .journey-card { --iw: min(94cqw - 20px, 420px, (100cqh - 64px) / 1.31) } }
}
```

- [ ] **Step 3: Conectar en `App.tsx`**

En `web/src/App.tsx`: borrar las funciones `HeroVisual`, `Hero`, `PhoneScreen`, `PhoneShowcase`, `Experience`, `HowItWorks` y la constante `APP`; añadir `import { Journey } from './scenes/Journey';`; en `App`, sustituir `<Hero />` por `<Journey />` y quitar `<Experience />` y `<HowItWorks />`. Quitar de los imports de `lucide-react` y `motion/react` lo que deje de usarse (`Bell`, `Bookmark`, `ChevronDown`, `CirclePlus`, `CircleUser`, `Compass`, `Heart`, `MapIcon`, `MapPin`, `Search`, `SlidersHorizontal`, `Check`, `useScroll`, `useTransform`, `useRef` si ya no se usa, `VerbRotator`).

- [ ] **Step 4: Build y prueba visual**

Run: `npm --prefix web run build`
Expected: termina sin errores.

En `site` (8090), a 1280×800 y 375×812, claro y oscuro: recorrer de arriba abajo y de abajo arriba. Debe verse lo mismo que en el prototipo v2: el hero, el arco que se convierte en teléfono, la casa como pin terracota, los pins, la ficha con el favorito, el chat, la visita aceptada y el texto por pasos. Sin errores de consola y con `document.documentElement.scrollWidth === innerWidth`.

- [ ] **Step 5: Commit**

```bash
git add web/src/scenes/Journey.tsx web/src/scenes.css web/src/App.tsx
git commit -m "feat(web): turn the hero window into the scroll-driven phone journey"
```

---

### Task 6: Toda Cuba

**Files:**
- Create: `web/src/scenes/Cuba.tsx`
- Modify: `web/src/scenes.css`, `web/src/ui.tsx`, `web/src/index.css`, `web/src/App.tsx`

- [ ] **Step 1: Componente**

<!-- file: web/src/scenes/Cuba.tsx -->
```tsx
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeftRight, ArrowRight, CalendarDays, House, KeyRound } from 'lucide-react';
import { OPERATIONS, PROVINCES } from '../content';
import { useMode, useParts, useStage } from '../motion';
import { easeOut, seg } from '../scroll';
import { ARROW, Eyebrow, LINK, SectionHeading, Stagger, StaggerItem, WRAP } from '../ui';

type CubaMap = typeof import('../cuba-map');
const ICONS = { house: House, key: KeyRound, swap: ArrowLeftRight, calendar: CalendarDays };

/** The island appears west to east and each territory lights up with its name; then the four operations. */
export function Cuba() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [map, setMap] = useState<CubaMap | null>(null);
  const lit = useRef<Element[][]>([]);
  const progress = useRef(0);

  const frame = useCallback((p: number) => {
    progress.current = p;
    if (still(mode.current === 'static')) {
      for (const els of lit.current) for (const el of els) el.classList.add('lit');
      return;
    }
    const reveal = easeOut(seg(p, 0.02, 0.55));
    if (parts.current.reveal) parts.current.reveal.style.clipPath = `inset(-4% ${(1 - reveal) * 100}% -4% -4%)`;
    lit.current.forEach((els, i) => { for (const el of els) el.classList.toggle('lit', p > 0.06 + i * 0.034); });
  }, [mode, parts, still]);

  useStage(track, frame);

  // The outlines (25 KB) load only when the scene comes near.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import('../cuba-map').then((mod) => setMap(mod));
    }, { rootMargin: '800px 0px' });
    observer.observe(track.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    lit.current = PROVINCES.map((_, i) => [...track.current!.querySelectorAll(`[data-province="${i}"]`)]);
    frame(progress.current);
  }, [map, frame]);

  return (
    <section id="cuba" aria-labelledby="cuba-title">
      <div ref={track} className="cuba track" style={{ '--screens': 1.8 } as CSSProperties}>
        <div className="stage">
          <div className={`${WRAP} grid gap-8 py-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-16 lg:py-16`}>
            <div>
              <Eyebrow>Las 15 provincias y la Isla de la Juventud</Eyebrow>
              <h2 id="cuba-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Toda Cuba, <span className="text-blue">en un mismo lugar.</span></h2>
              <p className="mt-5 max-w-[28rem] leading-relaxed text-body">Busca y publica en cualquier provincia. Filtra por zona y mira cada vivienda en el mapa.</p>
              <ol className="cuba-list mt-7 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3 sm:text-sm lg:grid-cols-2">
                {PROVINCES.map((name, i) => <li key={name} data-province={i}>{name}</li>)}
              </ol>
            </div>
            <figure className="cuba-figure m-0">
              <div data-part="reveal">
                {map ? (
                  <svg viewBox={map.CUBA_VIEWBOX} className="cuba-map" role="img" aria-label="Mapa de Cuba con sus 15 provincias y la Isla de la Juventud">
                    {map.CUBA_PROVINCES.map(({ name, d }, i) => <path key={name} d={d} data-province={i} />)}
                  </svg>
                ) : <div className="cuba-map" />}
              </div>
              <figcaption className="mt-3 text-xs text-body">Mapa: © colaboradores de OpenStreetMap (ODbL), vía geoBoundaries.</figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div id="posibilidades" className={`${WRAP} py-20 lg:py-28`}>
        <SectionHeading eyebrow="Un lugar, muchas posibilidades" id="possibilities-title" title="¿Cuál es tu próximo paso?"
          aside={<>Hay distintas formas de cambiar de hogar.<br />KarmaHouse tiene un espacio para cada una.</>} />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map(({ icon, title, text, href, cta, tone }) => {
            const Icon = ICONS[icon];
            return (
              <StaggerItem key={title} as="article" className="group relative flex flex-col rounded-[28px] border border-line bg-paper p-7 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-36px_rgba(26,43,59,.45)]">
                <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon className="size-[22px]" aria-hidden="true" /></span>
                <h3 className="mt-7 text-[1.75rem]">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-body">{text}</p>
                <a className={`${LINK} mt-auto pt-6`} href={href}>{cta} <ArrowRight className={ARROW} aria-hidden="true" /></a>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: CSS**

Añadir al final de `web/src/scenes.css`:

```css
/* Toda Cuba --------------------------------------------------------------------------------------------- */
.cuba-map { display: block; width: 100%; aspect-ratio: 1000 / 343 }
.cuba-map path { fill: color-mix(in srgb, var(--color-blue) 82%, var(--color-cal)); stroke: var(--color-cal); stroke-width: 1.4; stroke-linejoin: round; transition: fill .6s var(--ease-out-soft) }
.cuba-list { margin: 0; padding: 0; list-style: none }
.cuba-list li { display: flex; align-items: center; gap: .55rem; color: var(--color-ink); transition: color .4s var(--ease-out-soft) }
.cuba-list li::before { content: ""; width: 6px; height: 6px; flex: none; rotate: 45deg; background: var(--color-sol); transition: opacity .4s }
html:not(.js) .cuba-figure { display: none }
@media (prefers-reduced-motion: no-preference) {
  .js .cuba .stage { display: grid; align-items: center }
  .js .cuba [data-part="reveal"] { clip-path: inset(-4% 100% -4% -4%) }
  .js .cuba-map path:not(.lit) { fill: color-mix(in srgb, var(--color-ocre) 16%, var(--color-arena)) }
  .js .cuba-list li:not(.lit) { color: var(--color-body) }
  .js .cuba-list li:not(.lit)::before { opacity: .2 }
}
```

- [ ] **Step 3: Quitar la cinta y conectar**

- `web/src/ui.tsx`: borrar `ProvinceMarquee`, el import de `Pause, Play` y el de `PROVINCES`.
- `web/src/index.css`: borrar las líneas `@keyframes marquee`, `.marquee`, `.marquee[data-paused="true"]...` y `@media (prefers-reduced-motion: reduce) { .marquee { animation: none; } }`.
- `web/src/App.tsx`: borrar `Possibilities` y `OPERATIONS`; añadir `import { Cuba } from './scenes/Cuba';`; sustituir `<ProvinceMarquee />` y `<Possibilities />` por un solo `<Cuba />` justo después de `<Journey />`; quitar del import de `./ui` lo que deje de usarse (`ProvinceMarquee`, `Stagger`, `StaggerItem` si ya no se usan) y de `lucide-react` (`ArrowLeftRight`, `House`, `KeyRound`).

- [ ] **Step 4: Build y prueba visual**

Run: `npm --prefix web run build && node --experimental-strip-types --test tests/web-*.test.ts`
Expected: build sin errores; tests PASS. En `dist/assets` aparece un chunk aparte para `cuba-map`.

En `site`: la isla aparece de oeste a este, cada provincia se enciende con su nombre y ninguna se queda sin contorno; a 375×812 todo cabe en la escena; el crédito de OpenStreetMap se lee bajo el mapa; las tarjetas suben escalonadas.

- [ ] **Step 5: Commit**

```bash
git add web/src/scenes/Cuba.tsx web/src/scenes.css web/src/ui.tsx web/src/index.css web/src/App.tsx
git commit -m "feat(web): light up Cuba province by province"
```

---

### Task 7: Lema

**Files:**
- Create: `web/src/scenes/Tagline.tsx`
- Modify: `web/src/scenes.css`, `web/src/App.tsx`

- [ ] **Step 1: Componente**

<!-- file: web/src/scenes/Tagline.tsx -->
```tsx
import { useCallback, useRef, type CSSProperties } from 'react';
import { TAGLINE } from '../content';
import { fade, useMode, useParts, useStage } from '../motion';
import { easeOut, seg } from '../scroll';

const COUNT = TAGLINE.flat().length;

/** «Un espacio para encontrar tu lugar.» Each word goes from 30 % to full colour, in reading order, with the scroll. */
export function Tagline() {
  const track = useRef<HTMLElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);

  const frame = useCallback((p: number) => {
    if (still(mode.current === 'static')) return;
    for (let i = 0; i < COUNT; i++) {
      const a = 0.12 + (i * 0.6) / COUNT;
      fade(parts.current[`w${i}`], 0.3 + 0.7 * easeOut(seg(p, a, a + 0.6 / COUNT)));
    }
  }, [mode, parts, still]);

  useStage(track, frame);

  let k = 0;
  return (
    <section ref={track} className="tagline track" style={{ '--screens': 1.6 } as CSSProperties} aria-labelledby="tagline-title">
      <div className="stage">
        <h2 id="tagline-title" className="mx-auto max-w-[15ch] px-4 text-center text-[clamp(2.8rem,8vw,6.6rem)] leading-[1.02]">
          {TAGLINE.map((line, l) => (
            <span key={l} className="block">
              {line.map(([word, blue]) => {
                const i = k++;
                return <span key={i} className={`tagline-word${blue ? ' text-blue' : ''}`} data-part={`w${i}`}>{word} </span>;
              })}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: CSS**

Añadir al final de `web/src/scenes.css`:

```css
/* Tagline ----------------------------------------------------------------------------------------------- */
.tagline .stage { display: grid; place-items: center; padding-block: 6rem }
@media (prefers-reduced-motion: no-preference) {
  .js .tagline .stage { padding-block: 0 }
  .js .tagline-word { opacity: .3 }
}
```

- [ ] **Step 3: Conectar**

En `web/src/App.tsx`: `import { Tagline } from './scenes/Tagline';` y `<Tagline />` justo después de `<Cuba />`.

- [ ] **Step 4: Build y prueba visual**

Run: `npm --prefix web run build`
En `site`: las palabras se encienden una a una al bajar, «tu lugar.» queda en azul, y al subir se apagan en orden inverso.

- [ ] **Step 5: Commit**

```bash
git add web/src/scenes/Tagline.tsx web/src/scenes.css web/src/App.tsx
git commit -m "feat(web): reveal the tagline word by word"
```

---

### Task 8: Publica en tres gestos

**Files:**
- Create: `web/src/scenes/Publish.tsx`
- Modify: `web/src/scenes.css`, `web/src/App.tsx`

- [ ] **Step 1: Componente**

<!-- file: web/src/scenes/Publish.tsx -->
```tsx
import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { ASSISTED_CONTACT, ASSISTED_EMAIL, PUBLISH } from '../content';
import { fade, put, useMode, useParts, useStage } from '../motion';
import { PhoneFrame, PublishScreen } from '../phone/Phone';
import { easeOut, seg, stepAt } from '../scroll';
import { ARROW, BUTTON, Eyebrow, Title, WRAP } from '../ui';

/** Paste an ad and the form fills itself, it goes through review, and it appears on the map. */
export function Publish() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [step, setStep] = useState(0);

  const frame = useCallback((p: number) => {
    if (still(mode.current === 'static')) return;
    const P = parts.current, s = seg(p, 0.06, 1);
    const press = (a: number) => 1 - 0.05 * Math.sin(Math.PI * seg(s, a, a + 0.05));
    put(P['pub-paste'], `scale(${press(0.03)})`);
    const note = easeOut(seg(s, 0.05, 0.13));
    put(P['pub-note'], `translateY(${(1 - note) * -36}px)`, note);
    for (let i = 0; i < 4; i++) {
      const f = easeOut(seg(s, 0.14 + i * 0.04, 0.2 + i * 0.04));
      P[`pub-f${i}`].style.clipPath = `inset(0 ${(1 - f) * 100}% 0 0)`;
    }
    put(P['pub-send'], `scale(${press(0.36)})`);
    put(P['pub-status'], `translateY(${(1 - easeOut(seg(s, 0.4, 0.48))) * 140}%)`);
    const live = seg(s, 0.56, 0.62);
    fade(P['pub-review'], 1 - live);
    fade(P['pub-live'], live);
    put(P['pub-map'], `translateX(${(1 - easeOut(seg(s, 0.68, 0.78))) * 102}%)`);
    const pin = easeOut(seg(s, 0.8, 0.88));
    put(P['pub-pin'], `translate(-50%, -100%) translateY(${-28 * (1 - pin)}px) scale(${0.6 + 0.4 * pin})`, pin);
    const toast = easeOut(seg(s, 0.88, 0.94));
    put(P['pub-toast'], `translateY(${(1 - toast) * 8}px)`, toast);
    setStep(stepAt(s, 3));
  }, [mode, parts, still]);

  useStage(track, frame);

  return (
    <section id="publicar" aria-labelledby="publication-title">
      <div ref={track} className="publish track" style={{ '--screens': 3.6 } as CSSProperties}>
        <div className="stage">
          <div className={`${WRAP} publish-layout`}>
            <div>
              <Eyebrow>Dale un lugar a tu vivienda</Eyebrow>
              <h2 id="publication-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Publica en <span className="text-blue">tres gestos.</span></h2>
              <ol className="publish-steps mt-8">
                {PUBLISH.map((s, i) => (
                  <li key={s.label} className={i === step ? 'on' : undefined}>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-ocre">{i + 1} · {s.label}</p>
                    <h3 className="mt-2 text-[clamp(1.5rem,3vw,2.2rem)]"><Title title={s.title} accent={s.accent} /></h3>
                    <p className="mt-3 max-w-[28rem] leading-relaxed text-body">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="publish-visual">
              <PhoneFrame className="publish-phone" label="Pantalla Publicar de la app KarmaHouse: un anuncio pegado rellena el formulario, pasa la revisión y aparece en el mapa. Ejemplo de uso.">
                <PublishScreen part="pub-" />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
      <div className={`${WRAP} grid gap-6 pb-20 md:grid-cols-2 lg:pb-28`}>
        <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h3 className="text-2xl">Publicar por mi cuenta</h3>
          <p className="mt-5 text-[15px] leading-relaxed text-body">Entra en «Publicar» desde la app. Completa los datos y añade tus fotos; si ya tienes el texto, usa «Pegar anuncio» y revisa el resultado antes de enviarlo.</p>
          <a className={`${BUTTON} group mt-6 max-w-full`} href="#descargar">Empezar en la app <ArrowRight className={ARROW} aria-hidden="true" /></a>
        </article>
        <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h3 className="text-2xl">¿Prefieres ayuda?</h3>
          <p className="mt-5 text-[15px] leading-relaxed text-body">KarmaHouse puede preparar el anuncio contigo por correo. Escríbenos con la operación, provincia, zona aproximada, características, precio y moneda o condiciones. Adjunta fotos propias y nítidas si ofreces una vivienda.</p>
          <p className="mt-5 text-[15px] leading-relaxed text-body">Revisamos el anuncio contigo. La cuenta oficial necesita tu autorización expresa antes de publicarlo. Si después solicitas gestionarlo, podrás aceptar o rechazar una invitación de traspaso que conserva el enlace, las fotos y los favoritos.</p>
          <a className={`${BUTTON} group mt-6 max-w-full`} href={ASSISTED_CONTACT}>Escribir para pedir ayuda <MessageCircle className="size-4 shrink-0" aria-hidden="true" /></a>
          <p className="mt-5 break-words text-sm leading-relaxed text-body">Se abrirá tu aplicación de correo. Revisa y envía el mensaje desde allí. También puedes escribir directamente a <a className="text-blue underline underline-offset-4" href={`mailto:${ASSISTED_EMAIL}`}>{ASSISTED_EMAIL}</a>.</p>
        </article>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: CSS**

Añadir al final de `web/src/scenes.css`:

```css
/* Publish ----------------------------------------------------------------------------------------------- */
.publish .stage { padding-block: 5rem 3rem }
.publish-layout { display: grid; gap: 3rem; align-items: center }
@media (min-width: 1024px) { .publish-layout { grid-template-columns: 1fr 1fr } }
.publish-steps { display: grid; gap: 2rem; margin: 0; padding: 0; list-style: none }
.publish-phone { width: min(300px, 80vw); margin-inline: auto }
@media (prefers-reduced-motion: no-preference) {
  .js .publish .stage { padding-block: 1.25rem }
  .js .publish-layout { height: 100%; grid-template-rows: auto minmax(0, 1fr); gap: 1.25rem; align-items: stretch }
  .js .publish-steps { gap: 0 }
  .js .publish-steps li { grid-area: 1 / 1; opacity: 0; transform: translateY(12px); transition: opacity .45s var(--ease-out-soft), transform .45s var(--ease-out-soft) }
  .js .publish-steps li.on { opacity: 1; transform: none }
  .js .publish-visual { display: grid; min-height: 0; place-items: center }
  .js .publish-phone { width: auto; height: 100%; max-height: 600px }
  .js .publish .phone-note, .js .publish .phone-pin { opacity: 0 }
  .js .publish .phone-fill { clip-path: inset(0 100% 0 0) }
  .js .publish .phone-status { transform: translateY(140%) }
  .js .publish .phone-pubmap { transform: translateX(102%) }
  @media (min-width: 1024px) { .js .publish-layout { grid-template-rows: none; grid-template-columns: 1fr 1fr; align-items: center } }
}
```

- [ ] **Step 3: Conectar**

En `web/src/App.tsx`: borrar `Publication` y la constante `ASSISTED_CONTACT`/`ASSISTED_EMAIL` si quedan sin uso; `import { Publish } from './scenes/Publish';`; colocar `<Publish />` después de `<Tagline />` y quitar `<Publication />`.

- [ ] **Step 4: Build y prueba visual**

Run: `npm --prefix web run build`
En `site`: «Pegar anuncio» se pulsa, el texto entra, los cuatro campos se rellenan en orden, «Enviar a revisión» se pulsa, la tarjeta pasa de «En revisión» a «Publicado», el mapa entra, cae el pin y aparece el aviso. A 375×812 el teléfono cabe bajo el texto.

- [ ] **Step 5: Commit**

```bash
git add web/src/scenes/Publish.tsx web/src/scenes.css web/src/App.tsx
git commit -m "feat(web): show publishing in three gestures"
```

---

### Task 9: Secciones finales, cabecera y JSON-LD

**Files:**
- Create: `web/src/scenes/Trust.tsx`, `web/src/scenes/Download.tsx`, `web/src/scenes/Questions.tsx`
- Rewrite: `web/src/App.tsx`
- Modify: `web/src/index.css` (quitar `.tilt, .parallax`)

- [ ] **Step 1: Confianza, Descarga y Preguntas**

<!-- file: web/src/scenes/Trust.tsx -->
```tsx
import { ShieldCheck } from 'lucide-react';
import { TRUST } from '../content';
import { Eyebrow, Reveal, Stagger, StaggerItem, WRAP } from '../ui';

export function Trust() {
  return (
    <section className="py-20 lg:py-28" aria-labelledby="trust-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] border border-line bg-paper p-7 sm:p-12 lg:grid-cols-[.9fr_1.1fr] lg:p-16">
          <div className="losa absolute inset-0 text-ocre opacity-[.06]" aria-hidden="true" />
          <Reveal className="relative">
            <span className="grid size-12 place-items-center rounded-2xl bg-persiana/10 text-persiana"><ShieldCheck className="size-6" aria-hidden="true" /></span>
            <div className="mt-7"><Eyebrow className="text-persiana">Más claridad, desde el inicio</Eyebrow></div>
            <h2 id="trust-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Tu confianza<br /><span className="text-blue">también tiene su lugar.</span></h2>
            <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-body">Herramientas para compartir lo necesario y mantener el control de tu experiencia.</p>
          </Reveal>
          <Stagger className="relative grid gap-3">
            {TRUST.map(([title, text], i) => (
              <StaggerItem key={title} as="article" className="flex gap-5 rounded-3xl bg-cal p-6">
                <span className="pt-0.5 font-display text-lg text-persiana">0{i + 1}</span>
                <div><h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-body">{text}</p></div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
```

<!-- file: web/src/scenes/Download.tsx -->
```tsx
import { ArrowRight, Smartphone } from 'lucide-react';
import { APK, INSTALL, INSTALL_STEPS, NOTES, SHA, VERSION } from '../content';
import { ARROW, Mediopunto, Reveal, WRAP } from '../ui';

/** The navy panel that closes the page. The large mediopunto lights pane by pane when it scrolls into view. */
export function Download() {
  return (
    <section className="pb-20 lg:pb-28" id="descargar" aria-labelledby="android-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] bg-mar px-6 py-14 text-espuma sm:px-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:p-16">
          <Mediopunto lit="view" delay={0.1} className="pointer-events-none absolute -bottom-[26rem] left-1/2 w-[64rem] max-w-none -translate-x-1/2 opacity-[.16]" />
          <Reveal className="relative">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-sol">
              <span className="relative flex size-2" aria-hidden="true"><span className="absolute inline-flex size-full rounded-full bg-sol opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2 rounded-full bg-sol" /></span>
              Disponible para Android · {VERSION}
            </span>
            <h2 id="android-title" className="mt-7 text-[clamp(2.3rem,4.4vw,3.8rem)] text-white">Tu búsqueda,<br /><span className="text-sol">también en tu bolsillo.</span></h2>
            <p className="mt-6 max-w-[28rem] leading-relaxed">KarmaHouse para Android reúne catálogo, mapa y conversaciones. Fotos optimizadas y ahorro de datos para aprovechar mejor tu conexión.</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
              <a className="group inline-flex min-h-12 items-center gap-3 rounded-full bg-sol px-6 text-sm font-semibold text-mar transition hover:bg-[#f0c46a] active:scale-[.98]" href={APK}>Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
              <a className="inline-flex min-h-11 items-center text-sm font-semibold text-white underline-offset-4 hover:underline" href={NOTES}>Ver la versión</a>
            </div>
            <p className="mt-7 text-xs leading-relaxed">Versión {VERSION} · Android 7 o superior<br />Publicar, buscar y conversar es gratis</p>
            <p className="mt-3 text-xs leading-relaxed">APK firmado con el certificado oficial de KarmaHouse. <a className="text-white underline underline-offset-4" href={INSTALL}>Instrucciones para instalar y actualizar</a> · <a className="text-white underline underline-offset-4" href={SHA}>Comprobación SHA-256</a></p>
          </Reveal>
          <Reveal delay={0.1} className="relative rounded-[28px] border border-white/10 bg-white/[.04] p-7 backdrop-blur-sm">
            <Smartphone className="size-8 text-sol" aria-hidden="true" />
            <h3 className="mt-5 font-sans text-lg font-semibold tracking-normal text-white">Instala KarmaHouse en tres pasos</h3>
            <ol className="mt-6 grid gap-5">
              {INSTALL_STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sol/15 text-xs font-bold text-sol">{i + 1}</span>
                  <span className="text-sm leading-relaxed"><strong className="block text-white">{title}</strong>{text}</span>
                </li>
              ))}
            </ol>
            <a className="group mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sol" href="#preguntas">Resuelve tus dudas sobre la instalación <ArrowRight className={ARROW} aria-hidden="true" /></a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
```

<!-- file: web/src/scenes/Questions.tsx -->
```tsx
import { Fragment } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { CONTACT, FAQ, type Part } from '../content';
import { ARROW, Eyebrow, LINK, Reveal, WRAP } from '../ui';

function Answer({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => <Fragment key={i}>{typeof p === 'string' ? p : <a href={p.href}>{p.text}</a>}</Fragment>)}</>;
}

export function Questions() {
  return (
    <section className="pb-24 lg:pb-32" id="preguntas" aria-labelledby="questions-title">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20`}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Antes de empezar</Eyebrow>
          <h2 id="questions-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Buenas preguntas.<br /><span className="text-blue">Respuestas claras.</span></h2>
          <p className="mt-5 text-[15px] text-body">Lo esencial sobre KarmaHouse, tu cuenta y la instalación.</p>
          <a className={`${LINK} mt-4 text-blue!`} href={CONTACT}>Escríbenos si necesitas ayuda <ArrowRight className={ARROW} aria-hidden="true" /></a>
        </Reveal>
        <Reveal delay={0.1} className="faq border-t border-line">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex min-h-16 items-center justify-between gap-6 py-4 text-[15px] font-semibold transition-colors hover:text-blue">
                {q}<span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-blue transition-transform duration-300 group-open:rotate-45"><Plus className="size-4" aria-hidden="true" /></span>
              </summary>
              <p className="pb-6 pr-12 text-[15px] leading-relaxed text-body [&_a]:text-blue [&_a]:underline [&_a]:underline-offset-4"><Answer parts={a} /></p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Reescribir `App.tsx`**

<!-- file: web/src/App.tsx -->
```tsx
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { LazyMotion, MotionConfig, domAnimation, m, useScroll } from 'motion/react';
import { ArrowRight, Menu } from 'lucide-react';
import { CODE, CONTACT, LEGAL, NAV, RELEASE, structuredData } from './content';
import { Cuba } from './scenes/Cuba';
import { Download } from './scenes/Download';
import { Journey } from './scenes/Journey';
import { Publish } from './scenes/Publish';
import { Questions } from './scenes/Questions';
import { Tagline } from './scenes/Tagline';
import { Trust } from './scenes/Trust';
import { ARROW, BUTTON, Cenefa, WRAP } from './ui';

function Brand() {
  return (
    <a className="inline-flex min-h-11 shrink-0 items-center gap-2.5 text-[1.35rem] tracking-[-.04em] text-blue" href="./" aria-label="KarmaHouse, inicio">
      <img src="/karmahouse-mark.png" width="40" height="31" alt="" className="h-[31px] w-10 object-contain dark:brightness-0 dark:invert" /><span><b className="font-extrabold">Karma</b>House</span>
    </a>
  );
}

/** Id of the navigation section crossing the middle of the viewport. */
function useCurrentSection() {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const [id] of NAV) { const el = document.getElementById(id); if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, []);
  return current;
}

// Native <details> keeps the menu usable; this only closes it after a choice or on Escape.
function MobileMenu({ current }: { current: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const onClick = (event: MouseEvent) => {
    if ((event.target as Element).closest('a[href^="#"]')) menu.current!.open = false;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu.current!.open) {
      menu.current!.open = false;
      menu.current!.querySelector('summary')!.focus();
    }
  };
  return (
    <details className="relative md:hidden" ref={menu} onClick={onClick} onKeyDown={onKeyDown}>
      <summary className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"><Menu className="size-4" aria-hidden="true" />Menú</summary>
      <nav aria-label="Navegación móvil" className="absolute right-0 top-[calc(100%+12px)] grid w-64 rounded-3xl border border-line bg-paper p-2 shadow-2xl">
        {[...NAV, ['descargar', 'Descargar app'] as const].map(([id, label]) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? 'true' : undefined} className="flex min-h-11 items-center rounded-2xl px-4 text-sm hover:bg-arena aria-[current=true]:font-semibold aria-[current=true]:text-blue">{label}</a>
        ))}
      </nav>
    </details>
  );
}

function Header() {
  const current = useCurrentSection();
  const { scrollYProgress } = useScroll();
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-cal/85 backdrop-blur-md">
      <div className={`${WRAP} flex h-[76px] items-center justify-between gap-6`}>
        <Brand />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación principal">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={current === id ? 'true' : undefined} className="flex min-h-11 items-center text-sm text-body transition-colors hover:text-blue aria-[current=true]:font-semibold aria-[current=true]:text-blue">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a className={`${BUTTON} group min-h-11 px-5 max-sm:hidden`} href="#descargar">Descargar app <ArrowRight className={ARROW} aria-hidden="true" /></a>
          <MobileMenu current={current} />
        </div>
      </div>
      <m.span className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-gradient-to-r from-sol via-terracota to-blue" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    </header>
  );
}

function Footer() {
  const column = 'flex flex-col items-start gap-0.5 text-sm [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-body [&_a:hover]:text-blue';
  return (
    <footer className="bg-arena">
      <Cenefa />
      <div className={`${WRAP} pb-8 pt-14`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div><Brand /><p className="mt-4 text-sm leading-relaxed text-body">Un espacio para encontrar tu lugar.<br />Compra, venta, permuta y alquiler en Cuba.</p></div>
          <nav aria-label="Conoce KarmaHouse" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">KarmaHouse</h2><a href="#como-funciona">Cómo funciona</a><a href="#cuba">Toda Cuba</a><a href="#posibilidades">Qué puedes hacer</a><a href="#publicar">Publicar una vivienda</a><a href="#descargar">Android</a></nav>
          <nav aria-label="Ayuda y versiones" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Te ayudamos</h2><a href="#preguntas">Preguntas frecuentes</a><a href={CONTACT}>Contacto</a><a href={RELEASE}>Versiones públicas</a><a href={CODE}>Código del proyecto</a></nav>
          <nav aria-label="Información legal" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Legal</h2><a href={`${LEGAL}/privacidad.html`}>Privacidad</a><a href={`${LEGAL}/terminos.html`}>Términos de uso</a><a href={`${LEGAL}/eliminar-cuenta.html`}>Eliminar tu cuenta</a></nav>
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-line pt-6 text-xs text-body sm:flex-row"><span>© 2026 KarmaHouse</span><p>Las fotografías, la conversación y los formularios mostrados son ilustrativos. No representan anuncios ni usuarios reales.</p></div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <a className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-full bg-paper px-5 py-3 text-sm font-semibold shadow-lg focus:translate-y-0" href="#contenido">Saltar al contenido</a>
        <Header />
        <main id="contenido">
          <Journey />
          <Cuba />
          <Tagline />
          <Publish />
          <Trust />
          <Download />
          <Questions />
        </main>
        <Footer />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }} />
      </MotionConfig>
    </LazyMotion>
  );
}
```

En `web/src/index.css`, borrar el bloque de reduced motion que dice `/* Scroll-linked effects write inline transforms; this keeps them still. */ .tilt, .parallax { transform: none !important; }` (dejar la línea `.rise, .door, .glass { animation: none; }`).

- [ ] **Step 3: Build y comprobación**

Run: `npm --prefix web run build && node --experimental-strip-types --test tests/web-*.test.ts`
Expected: build y tests PASS. `grep -c 'application/ld+json' web/dist/index.html` → `1`. `grep -o '"@type":"Question"' web/dist/index.html | wc -l` → `8`.

En `site`: la línea de progreso crece bajo la cabecera, la navegación marca la sección actual, el mediopunto grande del panel de descarga se enciende al llegar, las preguntas se abren.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/scenes/Trust.tsx web/src/scenes/Download.tsx web/src/scenes/Questions.tsx web/src/index.css
git commit -m "feat(web): finish the narrative with trust, download, FAQ and structured data"
```

---

### Task 10: 404, sitemap y robots

**Files:**
- Create: `web/public/404.html`, `web/public/sitemap.xml`
- Modify: `web/public/robots.txt`

- [ ] **Step 1: Archivos**

<!-- file: web/public/404.html -->
```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Página no encontrada · KarmaHouse</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/karmahouse-mark.png">
  <style>
    :root { color-scheme: light dark; --cal: #faf6ee; --ink: #1a2b3b; --body: #4d5a66; --blue: #0153a8; --on-blue: #fff; --mark: none }
    @media (prefers-color-scheme: dark) { :root { --cal: #0f1a26; --ink: #f3efe7; --body: #b9c4ce; --blue: #8cc0f7; --on-blue: #0b1a29; --mark: brightness(0) invert(1) } }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--cal); color: var(--ink); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif }
    main { max-width: 32rem; text-align: center }
    img { width: 56px; height: 44px; object-fit: contain; filter: var(--mark) }
    h1 { margin: 20px 0 12px; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: clamp(2rem, 6vw, 3rem); line-height: 1.1; letter-spacing: -.02em }
    p { margin: 0 0 28px; color: var(--body) }
    a { display: inline-flex; min-height: 48px; align-items: center; padding: 0 24px; border-radius: 999px; background: var(--blue); color: var(--on-blue); font-weight: 600; text-decoration: none }
    a:focus-visible { outline: 3px solid var(--blue); outline-offset: 3px }
  </style>
</head>
<body>
  <main>
    <img src="/karmahouse-mark.png" alt="">
    <h1>Esta página no existe.</h1>
    <p>Puede que el enlace esté incompleto o que la página se haya movido. En la portada encuentras la app y cómo usarla.</p>
    <a href="/">Ir a la portada de KarmaHouse</a>
  </main>
</body>
</html>
```

<!-- file: web/public/sitemap.xml -->
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.karmahouse.site/</loc></url>
</urlset>
```

En `web/public/robots.txt`, añadir al final una línea vacía y:

```
Sitemap: https://www.karmahouse.site/sitemap.xml
```

- [ ] **Step 2: Build y comprobación**

Run: `npm --prefix web run build && ls web/dist/404.html web/dist/sitemap.xml && cat web/dist/robots.txt`
Expected: los dos archivos existen y `robots.txt` termina con la línea `Sitemap:`.

- [ ] **Step 3: Commit**

```bash
git add web/public/404.html web/public/sitemap.xml web/public/robots.txt
git commit -m "feat(web): add branded 404, sitemap and robots sitemap entry"
```

---

### Task 11: Verificación, documentación y limpieza

**Files:**
- Modify: `web/README.md`, `.claude/launch.json`

- [ ] **Step 1: Peso de la primera carga**

Run:
```bash
cd web && npm run build && node -e "
const fs=require('fs'),z=require('zlib');
const a=fs.readdirSync('dist/assets');
const first=['dist/index.html','public/vedado-640.avif',...a.filter(f=>/^index-.*\.(js|css)$/.test(f)||/calistoga.*\.woff2$/.test(f)).map(f=>'dist/assets/'+f)];
let t=0;for(const f of first){const n=z.gzipSync(fs.readFileSync(f)).length;t+=n;console.log(f,n)}
console.log('total gzip',t)"
```
Expected: `total gzip` ≤ 358400 (350 KB). Si se pasa, revisar qué pesa más antes de seguir.

- [ ] **Step 2: Página sin JavaScript**

Run:
```bash
cd web && sed -e 's#<script>document.documentElement.classList.add(.js.)</script>##' -e 's#<script type="module"[^>]*></script>##' dist/index.html > dist/nojs.html
```
Abrir `http://localhost:8094/nojs.html` en `site-dist`: todas las secciones en orden, el hero con el arco y la foto, los cuatro pasos como lista con el teléfono quieto, la lista de provincias legible, los tres pasos de publicar con el teléfono quieto, sin escenas fijas y sin huecos vacíos. Borrar `dist/nojs.html` al terminar.

- [ ] **Step 3: Recorrido completo**

En `site-dist` (build prerenderizado), a 1280×800 y 375×812, en claro y oscuro:
- recorrer de arriba abajo y de abajo arriba sin errores de consola;
- `document.documentElement.scrollWidth === innerWidth`;
- con `document.documentElement.dataset.mode = 'lite'` desaparecen luz y grano;
- los enlaces del APK, SHA-256, notas, instalación, legal y contacto coinciden con los de la versión anterior (`git show main:web/src/App.tsx`);
- las anclas `#app`, `#posibilidades`, `#como-funciona`, `#publicar`, `#descargar`, `#preguntas` y `#contenido` llevan a su sección.

- [ ] **Step 4: Rendimiento**

Con el panel del navegador en 375×812, registrar con `javascript_tool` los fotogramas durante un scroll programado por todo el recorrido (`requestAnimationFrame` midiendo intervalos) y confirmar que la mediana está cerca de 16,7 ms y que no hay intervalos de más de 50 ms después de la carga. Si hay Chrome y red disponibles, ejecutar Lighthouse móvil:

```bash
npx --yes lighthouse@12 http://localhost:8094/ --only-categories=performance,accessibility,seo --form-factor=mobile --output=json --output-path=./lighthouse.json --chrome-flags="--headless"
```
Expected: rendimiento ≥ 85, accesibilidad 100, SEO 100. Si no se puede ejecutar, dejarlo dicho en el informe final con el motivo.

- [ ] **Step 5: Hechos**

Run: `grep -rniE "verificad|garantizad|16 provincias" web/src || echo "sin coincidencias"`
Expected: `sin coincidencias`.

- [ ] **Step 6: README y limpieza**

En `web/README.md`, sustituir el párrafo que empieza por «La propuesta visual posterior» y el siguiente («La navegación móvil y las preguntas...») por:

```markdown
La portada es una narrativa de scroll (spec: `docs/superpowers/specs/2026-10-11-web-scroll-narrative-design.md`). Cada escena de `src/scenes/` es una pista alta (`.track`) con un escenario fijo (`.stage`); `src/motion.ts` da el avance con `useScroll` de `motion` y cada escena escribe estilos en sus elementos `data-part` sin volver a renderizar. Las escenas solo se fijan con JavaScript (el `<head>` añade `.js`) y sin movimiento reducido; si no, todo se lee como contenido estático. `useMode` elige `full`, `lite` (ahorro de datos o poca memoria: sin luz, grano ni balanceo) o `static`. Textos y hechos están en `src/content.ts`; la matemática pura en `src/scroll.ts`, y ambos tienen pruebas en `tests/web-*.test.ts` (`node --experimental-strip-types --test tests/web-*.test.ts` desde la raíz). El teléfono (`src/phone/`) imita la app con datos ilustrativos. El mapa de Cuba (`src/cuba-map.ts`) se genera con `node web/scripts/cuba-map.mjs <geojson>` desde geoBoundaries (OpenStreetMap, ODbL) y se carga solo al acercarse. Las provincias copian `PROVINCES` de `src/domain/listingOptions.ts` y una prueba lo comprueba. `public/404.html`, `sitemap.xml` y `robots.txt` completan el SEO; el JSON-LD (`FAQPage` y `MobileApplication`) sale de `content.ts` durante el prerender.
```

En `.claude/launch.json`, borrar la configuración `prototype` (apunta a una carpeta temporal).

- [ ] **Step 7: Tests y commit final**

Run: `node --experimental-strip-types --test tests/web-*.test.ts && npm --prefix web run build`
Expected: PASS y build sin errores.

```bash
git add web/README.md .claude/launch.json
git commit -m "docs(web): document the scroll narrative structure"
```

---

## Ajustes durante la ejecución

- Task 1: la prueba de `seg` usaba 0,1/0,2, que en coma flotante da 0,4999…; pasó a `seg(0.25, 0, 0.5)`.
- Task 5: `.journey .stage` no puede llevar `position: relative` (pisaba el `sticky`), y `.journey-visual` necesita `align-self: stretch` en ordenador. En móvil el hero se compactó (sin la lista de pruebas, que ya resume «Gratis y sin comisión») y el arco deja 40 px para su pie (`cardSizes` usa `(h - 76) / 1.31`). La frase sobre la foto escala con `cqw`.
- Task 6: las provincias apagadas usan un tono ocre suave para que la isla se lea entera.
- Task 8: la tarjeta de estado de Publicar no lleva icono, para que quepa en el teléfono estrecho.
- Task 9: `Mediopunto lit="view"` se enciende con cualquier parte visible (`margin: '0px 0px -15% 0px'`), porque el panel recorta casi toda la ventana grande.
- Task 11: en modo estático el arco va justo después del hero (`.journey-text { display: contents }` y `order`), y en modo fijo los pasos ocultos no capturan clics (`pointer-events: none`). `.claude/launch.json` no se incluye en el commit: su cambio restante (`videos`) es de otra sesión.
