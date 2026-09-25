# Ficha pública de cada vivienda — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada anuncio aprobado y activo tiene una URL pública con vista previa rica (foto, precio, zona) que muestra el anuncio completo y ofrece abrir la app; «Compartir» envía ese enlace.

**Architecture:** Una Edge Function de Supabase (`p`) lee `public.properties` con `service_role`, firma las fotos y devuelve HTML generado por un módulo puro (`render.ts`) probado con `node --test`. La app solo cambia el texto de compartir. El despliegue lo hace GitHub Actions con la CLI de Supabase.

**Tech Stack:** Deno (Edge Functions), `npm:@supabase/supabase-js@2`, TypeScript, `node --test`, GitHub Actions, `supabase/setup-cli`.

Spec: `docs/superpowers/specs/2026-09-24-public-listing-design.md`.

**Contexto para quien no conoce el repo**

- Pruebas: `npm test` ejecuta `node --experimental-strip-types --test tests/*.test.ts`. Los tests importan módulos `.ts` con extensión explícita. `tests/` está excluido del typecheck.
- Typecheck: `npm run typecheck` (`tsc --noEmit`) revisa todo salvo `node_modules`, `tests`, `dist`, `artifacts`. Un archivo con `Deno.serve` o imports `npm:` rompería `tsc`; por eso el manejador se excluye y solo `render.ts` se typechequea.
- El node del sistema no tiene red en el PC de desarrollo. Para el script de verificación contra el proyecto real usa `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- Precio en la app: `formatMoney` usa `Intl.NumberFormat('es-CU')` y produce `85,000`. La ficha usa el mismo separador sin depender de ICU.
- Columnas de `public.properties` (migraciones `20260917000100`, `20260920000200`): `id uuid, title, location, province, type, description text, price numeric, area numeric, bedrooms int, bathrooms int, amenities text[], photo_paths text[], moderation text, availability text, condition text null, floor int null, price_negotiable boolean null`. Bucket privado `property-photos`.
- Mensajes de commit: en inglés, tipo `feat:`/`docs:`/`ci:`, cuerpo explicando el porqué, y al final `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

**Estructura de archivos**

- Create `supabase/functions/p/render.ts` — HTML puro: `escapeHtml`, `formatPrice`, `describeListing`, `renderListing`, `renderUnavailable`.
- Create `supabase/functions/p/index.ts` — manejador Deno: método, uuid, consulta, firma, respuesta.
- Create `supabase/config.toml` — `verify_jwt = false` para `p`.
- Modify `tsconfig.json` — excluir `supabase/functions/**/index.ts`.
- Create `tests/public-listing.test.ts` — pruebas de `render.ts` y de `listingShareUrl`.
- Modify `src/lib/publicSite.ts` — `listingShareUrl(id)`.
- Modify `src/screens/DetailScreen.tsx:85-94` — `share()` usa el enlace.
- Create `.github/workflows/functions.yml` — despliegue.
- Create `scripts/verify-public-listing.mjs` — comprobación contra el proyecto real.
- Create `docs/public-listing-verification.md`; modify `README.md`, `docs/growth-roadmap.md`.

---

### Task 1: `render.ts` — escape, precio y descripción

**Files:**
- Create: `supabase/functions/p/render.ts`
- Test: `tests/public-listing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/public-listing.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeListing, escapeHtml, formatPrice, type PublicListingRow } from '../supabase/functions/p/render.ts';

export const row: PublicListingRow = {
  id: '33000000-0000-4000-8000-000000000003',
  title: 'Casa en el Vedado <script>alert(1)</script>',
  location: 'Vedado', province: 'La Habana', type: 'Casa',
  description: 'Primera línea.\nSegunda "línea" & más.',
  price: '85000', area: '120.5', bedrooms: 3, bathrooms: 2,
  amenities: ['Balcón', 'Patio'], condition: 'good', floor: 2, price_negotiable: true,
};

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(escapeHtml(`<a href="x">Tom's & Jerry</a>`), '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Jerry&lt;/a&gt;');
});
test('formatPrice matches the app separator and drops cents', () => {
  assert.equal(formatPrice('85000'), '85,000');
  assert.equal(formatPrice(5500.49), '5,500');
  assert.equal(formatPrice(999), '999');
  assert.equal(formatPrice(1234567), '1,234,567');
});
test('describeListing is the og:description line', () => {
  assert.equal(describeListing(row), '85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: FAIL, `Cannot find module '.../supabase/functions/p/render.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/p/render.ts
// Pure HTML for the public listing page. No Deno API here so `node --test` can exercise it.

export interface PublicListingRow {
  id: string;
  title: string;
  location: string;
  province: string;
  type: string;
  description: string;
  price: number | string;
  area: number | string;
  bedrooms: number;
  bathrooms: number;
  amenities: string[] | null;
  condition: string | null;
  floor: number | null;
  price_negotiable: boolean | null;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Same grouping as the app's formatMoney (es-CU: `85,000`), without depending on ICU data. */
export function formatPrice(value: number | string): string {
  return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function describeListing(row: PublicListingRow): string {
  return `${formatPrice(row.price)} USD · ${row.location}, ${row.province} · ${row.bedrooms} hab · ${row.bathrooms} baños · ${Number(row.area)} m²`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/p/render.ts tests/public-listing.test.ts
git commit -m "feat: describe a listing for its public page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `render.ts` — página completa y página no disponible

**Files:**
- Modify: `supabase/functions/p/render.ts`
- Test: `tests/public-listing.test.ts`

- [ ] **Step 1: Write the failing tests**

Añade al final de `tests/public-listing.test.ts`:

```ts
import { renderListing, renderUnavailable } from '../supabase/functions/p/render.ts';

const site = 'https://artstyles.github.io/karma-house/';
const self = `https://example.supabase.co/functions/v1/p/${row.id}`;
const photos = ['https://example.supabase.co/storage/v1/object/sign/a.jpg?token=x&y=1', 'https://example.supabase.co/storage/v1/object/sign/b.jpg?token=z'];

test('renderListing escapes user text and carries the open graph tags', () => {
  const html = renderListing(row, photos, site, self);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('<title>Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.ok(html.includes('<meta property="og:title" content="Casa en el Vedado &lt;script&gt;alert(1)&lt;/script&gt;">'));
  assert.ok(html.includes('<meta property="og:description" content="85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120.5 m²">'));
  assert.ok(html.includes(`<meta property="og:url" content="${self}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${self}">`));
  assert.ok(html.includes('<meta property="og:image" content="https://example.supabase.co/storage/v1/object/sign/a.jpg?token=x&amp;y=1">'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(html.includes('<meta property="og:site_name" content="KarmaHouse">'));
});
test('renderListing shows every photo, the details and the description with line breaks', () => {
  const html = renderListing(row, photos, site, self);
  assert.equal((html.match(/<img loading="lazy"/g) ?? []).length, 2);
  assert.ok(html.includes('src="https://example.supabase.co/storage/v1/object/sign/b.jpg?token=z"'));
  assert.ok(html.includes('85,000'));
  assert.ok(html.includes('Negociable'));
  assert.ok(html.includes('Buen estado'));
  assert.ok(html.includes('Planta 2'));
  assert.ok(html.includes('Primera línea.<br>Segunda &quot;línea&quot; &amp; más.'));
  assert.ok(html.includes('<li>Balcón</li><li>Patio</li>'));
  assert.ok(html.includes(`href="karmahouse://property/${row.id}"`));
  assert.ok(html.includes(`href="${site}"`));
});
test('renderListing without photos or optional fields still renders', () => {
  const html = renderListing({ ...row, amenities: null, condition: null, floor: null, price_negotiable: null, description: '' }, [], site, self);
  assert.ok(!html.includes('og:image'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('Negociable'));
  assert.ok(!html.includes('Planta'));
  assert.ok(!html.includes('<ul'));
  assert.ok(html.includes('85,000'));
});
test('renderUnavailable points back to the site', () => {
  const html = renderUnavailable(site);
  assert.ok(html.includes('Ya no está disponible'));
  assert.ok(html.includes(`href="${site}"`));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: FAIL, `renderListing is not a function` (o export inexistente)

- [ ] **Step 3: Write the implementation**

Añade al final de `supabase/functions/p/render.ts`:

```ts
const CONDITION_LABELS: Record<string, string> = { new: 'Nuevo', good: 'Buen estado', 'needs-renovation': 'A reformar' };

const STYLE = `
:root{--ink:#1C1C1E;--muted:#5E6B7A;--primary:#0153A8;--paper:#F5F5F7;--card:#FFFFFF;--border:#E3E8F0}
@media(prefers-color-scheme:dark){:root{--ink:#F2F4F7;--muted:#A5B0BD;--primary:#7DB4F0;--paper:#111418;--card:#1B2027;--border:#2C333D}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px 16px 120px}
header{display:flex;align-items:center;gap:10px;margin-bottom:16px}header a{color:var(--ink);text-decoration:none;font-size:20px}header b{font-weight:700}
.gallery{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:20px}
.gallery img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start;border-radius:20px;background:var(--border)}
h1{font-size:28px;line-height:1.2;margin:16px 0 4px;letter-spacing:-0.02em}
.price{font-size:26px;font-weight:700;margin:0}.price small{font-size:14px;font-weight:400;color:var(--muted)}
.muted{color:var(--muted);font-size:14px}
section.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:16px 20px;margin:16px 0}
h2{font-size:18px;margin:0 0 8px}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
ul{margin:0;padding-left:20px}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:12px;justify-content:center}
.bar a{flex:1;max-width:360px;text-align:center;padding:14px;border-radius:14px;font-weight:600;text-decoration:none}
.open{background:var(--primary);color:#fff}.more{border:1px solid var(--border);color:var(--ink)}
`;

function page(title: string, head: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${head}
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function header(siteUrl: string): string {
  return `<header><a href="${escapeHtml(siteUrl)}"><b>Karma</b>House</a></header>`;
}

export function renderListing(row: PublicListingRow, photoUrls: string[], siteUrl: string, selfUrl: string): string {
  const title = escapeHtml(row.title);
  const description = escapeHtml(describeListing(row));
  const site = escapeHtml(siteUrl);
  const self = escapeHtml(selfUrl);
  const deepLink = `karmahouse://property/${escapeHtml(row.id)}`;
  const head = [
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${self}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="KarmaHouse">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${self}">`,
    ...(photoUrls.length ? [`<meta property="og:image" content="${escapeHtml(photoUrls[0])}">`, `<meta name="twitter:card" content="summary_large_image">`] : []),
  ].join('\n');
  const gallery = photoUrls.length
    ? `<div class="gallery">${photoUrls.map((url) => `<img loading="lazy" alt="" src="${escapeHtml(url)}">`).join('')}</div>`
    : '';
  const details: [string, string][] = [
    ['Tipo', row.type],
    ...(row.condition && CONDITION_LABELS[row.condition] ? [['Estado', CONDITION_LABELS[row.condition]] as [string, string]] : []),
    ...(row.floor !== null && row.floor !== undefined ? [['Planta', `Planta ${row.floor}`] as [string, string]] : []),
    ['Zona', `${row.location}, ${row.province}`],
    ['Habitaciones', String(row.bedrooms)],
    ['Baños', String(row.bathrooms)],
    ['Superficie', `${Number(row.area)} m²`],
  ];
  const amenities = row.amenities?.length
    ? `<section class="card"><h2>Características</h2><ul>${row.amenities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
    : '';
  const about = row.description.trim()
    ? `<section class="card"><h2>Descripción</h2><p>${escapeHtml(row.description.trim()).replace(/\r?\n/g, '<br>')}</p></section>`
    : '';
  const body = `${header(siteUrl)}
${gallery}
<h1>${title}</h1>
<p class="price">$ ${formatPrice(row.price)} <small>USD${row.price_negotiable ? ' · Negociable' : ''}</small></p>
<p class="muted">${escapeHtml(row.location)}, ${escapeHtml(row.province)}</p>
<section class="card"><dl>${details.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl></section>
${about}
${amenities}
<p class="muted">Para contactar con quien publica, guardar la vivienda o verla en el mapa, ábrela en KarmaHouse.</p>
<nav class="bar"><a class="open" id="open" href="${deepLink}">Abrir en KarmaHouse</a><a class="more" href="${site}">Ver más viviendas</a></nav>
<script>
document.getElementById('open').addEventListener('click',function(){setTimeout(function(){if(document.visibilityState==='visible')location.href='${site}'},1500)});
</script>`;
  return page(title, head, body);
}

export function renderUnavailable(siteUrl: string): string {
  const site = escapeHtml(siteUrl);
  return page('Vivienda no disponible', '<meta name="robots" content="noindex">', `${header(siteUrl)}
<h1>Ya no está disponible</h1>
<p class="muted">Esta vivienda se vendió, está en pausa o el enlace no es válido.</p>
<nav class="bar"><a class="more" href="${site}">Ver más viviendas</a></nav>`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores (`render.ts` entra en el typecheck).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/p/render.ts tests/public-listing.test.ts
git commit -m "feat: render the public page of a listing

Every field comes from the database, so everything is escaped, including
signed photo URLs inside attributes. The page carries the open graph tags
WhatsApp, Telegram and Facebook read without running JavaScript.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: manejador Deno, `config.toml` y exclusión del typecheck

**Files:**
- Create: `supabase/functions/p/index.ts`
- Create: `supabase/config.toml`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write the handler**

```ts
// supabase/functions/p/index.ts
// GET /functions/v1/p/<uuid> → public HTML page of an approved, active listing.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderListing, renderUnavailable, type PublicListingRow } from './render.ts';

const SITE_URL = 'https://artstyles.github.io/karma-house/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' };
const COLUMNS = 'id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,condition,floor,price_negotiable';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

function unavailable(): Response {
  return new Response(renderUnavailable(SITE_URL), { status: 404, headers: HTML });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const id = url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!UUID.test(id)) return unavailable();

  const { data, error } = await supabase.from('properties').select(COLUMNS)
    .eq('id', id).eq('moderation', 'approved').eq('availability', 'active').maybeSingle();
  if (error) {
    console.error('properties query failed', error.code, error.message);
    return new Response('Service Unavailable', { status: 503, headers: { 'Retry-After': '30' } });
  }
  if (!data) return unavailable();

  const row = data as unknown as PublicListingRow & { photo_paths: string[] | null };
  let photoUrls: string[] = [];
  if (row.photo_paths?.length) {
    const signed = await supabase.storage.from('property-photos').createSignedUrls(row.photo_paths, 3600);
    if (signed.error) console.error('photo signing failed', signed.error.message);
    else photoUrls = signed.data.filter((item) => item.signedUrl && !item.error).map((item) => item.signedUrl);
  }

  const selfUrl = `${url.origin}${url.pathname}`;
  return new Response(renderListing(row, photoUrls, SITE_URL, selfUrl), { status: 200, headers: HTML });
});
```

- [ ] **Step 2: Write `supabase/config.toml`**

```toml
# Only what the Edge Function deploy needs. `project_id` names the local instance for the
# CLI; the remote project ref is passed with --project-ref in CI.
project_id = "karma-house"

[functions.p]
# The listing page is public: WhatsApp, Telegram and browsers fetch it without a token.
verify_jwt = false
entrypoint = "./functions/p/index.ts"
```

- [ ] **Step 3: Exclude the Deno entrypoint from `tsc`**

En `tsconfig.json` sustituye la línea `exclude`:

```json
  "exclude": ["node_modules", "tests", "dist", "artifacts", "supabase/functions/**/index.ts"]
```

- [ ] **Step 4: Verify typecheck and tests**

Run: `npm run check`
Expected: typecheck sin errores (el `index.ts` con `Deno` queda fuera; `render.ts` sigue dentro) y todos los tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/p/index.ts supabase/config.toml tsconfig.json
git commit -m "feat: serve the public listing page from an Edge Function

The function reads with the service role only rows that anon can already
read (approved and active), signs the photos for an hour and never selects
the owner or the coordinates. Its Deno entrypoint is excluded from tsc; the
pure renderer stays typechecked and unit tested.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: la app comparte el enlace

**Files:**
- Modify: `src/lib/publicSite.ts`
- Modify: `src/screens/DetailScreen.tsx:85-94`
- Test: `tests/public-listing.test.ts`

- [ ] **Step 1: Write the failing test**

Añade al final de `tests/public-listing.test.ts`:

```ts
import { listingShareUrl, SITE_URL } from '../src/lib/publicSite.ts';

test('listingShareUrl targets the Edge Function and falls back to the site', () => {
  const previous = process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co/';
  assert.equal(listingShareUrl(row.id), `https://example.supabase.co/functions/v1/p/${row.id}`);
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  assert.equal(listingShareUrl(row.id), SITE_URL);
  if (previous !== undefined) process.env.EXPO_PUBLIC_SUPABASE_URL = previous;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: FAIL, `listingShareUrl` no exportado

- [ ] **Step 3: Implement `listingShareUrl`**

Añade al final de `src/lib/publicSite.ts`:

```ts
/** Public page of one listing, served by the `p` Edge Function; the site when Supabase is not configured (local demo). */
export function listingShareUrl(id: string): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/functions/v1/p/${id}` : SITE_URL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/public-listing.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Use it in `share()`**

En `src/screens/DetailScreen.tsx` cambia el import de la línea 18:

```ts
import { listingShareUrl } from '../lib/publicSite';
```

y sustituye la función `share` (líneas 85-94) por:

```ts
  async function share() {
    if (!listing) return;
    const message = `${listing.title}
${formatMoney(listing.price)} USD · ${listing.location}, ${listing.province}
${listing.bedrooms} hab. · ${listing.bathrooms} baños · ${listing.area} m²

${listingShareUrl(listing.id)}`;
    try { await Share.share({ title: listing.title, message, url: listingShareUrl(listing.id) }); } catch { /* Dismissed, or this browser has no share target. */ }
  }
```

`url` lo usa iOS; Android y web usan `message`, que ya lleva el enlace.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: sin errores; `SITE_URL` ya no se importa en `DetailScreen` (si `tsc` avisa de import sin uso, quita `SITE_URL` del import).

- [ ] **Step 7: Commit**

```bash
git add src/lib/publicSite.ts src/screens/DetailScreen.tsx tests/public-listing.test.ts
git commit -m "feat: share a listing as a link to its public page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: despliegue desde GitHub Actions

**Files:**
- Create: `.github/workflows/functions.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: functions

on:
  push:
    branches: [main]
    paths: [supabase/functions/**, supabase/config.toml, .github/workflows/functions.yml]
  workflow_dispatch:

concurrency:
  group: functions
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      # The service role key never leaves Supabase: the runtime injects it into the function.
      - run: supabase functions deploy p --project-ref "$SUPABASE_PROJECT_REF"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
```

- [ ] **Step 2: Validate YAML locally**

Run: `node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/functions.yml','utf8');if(!/supabase functions deploy p/.test(y))process.exit(1)"`
Expected: exit 0. (No hay parser YAML instalado; la validación real es la ejecución en GitHub.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/functions.yml
git commit -m "ci: deploy the public listing function from main

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Secrets (lo hace el usuario)**

En GitHub → Settings → Secrets and variables → Actions:
- `SUPABASE_ACCESS_TOKEN`: token personal creado en https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_REF`: el subdominio de `EXPO_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`)

Tras el push a `main`, la ejecución `functions` debe terminar en verde. Si falla con `Access token not provided` faltan los secretos.

---

### Task 6: verificación contra el proyecto real

**Files:**
- Create: `scripts/verify-public-listing.mjs`
- Create: `docs/public-listing-verification.md`

- [ ] **Step 1: Write the script**

```js
// scripts/verify-public-listing.mjs
// Checks the deployed `p` function: an approved listing renders with open graph tags, a
// non-public one and a bogus id return 404, and POST is rejected. Reads nothing private.
import { readFileSync } from 'node:fs';
import { createDatabaseClient } from './cloud-db.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const base = `${env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/p/`;

const db = createDatabaseClient();
await db.connect();
const { rows } = await db.query(`
  select id, title, moderation, availability from public.properties
  where (moderation='approved' and availability='active') or not (moderation='approved' and availability='active')
  order by (moderation='approved' and availability='active') desc, created_at desc`);
await db.end();
const approved = rows.find((row) => row.moderation === 'approved' && row.availability === 'active');
const hidden = rows.find((row) => !(row.moderation === 'approved' && row.availability === 'active'));
if (!approved) throw new Error('KH_NO_PUBLIC_LISTING: no hay ningún anuncio aprobado y activo que comprobar');

const checks = [];
async function check(name, url, init, expect) {
  const response = await fetch(url, init);
  const body = await response.text();
  const result = { name, status: response.status, cache: response.headers.get('cache-control'), ok: expect(response, body) };
  checks.push(result);
  console.log(JSON.stringify(result));
}

await check('approved', base + approved.id, undefined, (r, b) =>
  r.status === 200 && r.headers.get('cache-control') === 'public, max-age=300'
  && b.includes('<meta property="og:title"') && b.includes('<meta property="og:image"') && b.includes(`karmahouse://property/${approved.id}`));
if (hidden) await check('hidden', base + hidden.id, undefined, (r, b) => r.status === 404 && b.includes('Ya no está disponible'));
await check('bogus', base + 'not-a-uuid', undefined, (r) => r.status === 404);
await check('post', base + approved.id, { method: 'POST' }, (r) => r.status === 405);

if (checks.some((c) => !c.ok)) { console.error('KH_PUBLIC_LISTING_FAILED'); process.exitCode = 1; }
```

- [ ] **Step 2: Run it (needs the deployed function and the Codex node)**

Run (Git Bash):
```bash
N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/verify-public-listing.mjs
```
Expected: cuatro líneas JSON con `"ok":true` y exit 0. Si la función no está desplegada, `approved` devuelve 404 con cuerpo `{"code":"NOT_FOUND"...}` y el script marca fallo: desplegar primero (Task 5).

- [ ] **Step 3: Open the approved URL in the browser preview**

Con la URL `approved` impresa: comprobar visualmente galería, precio, botón «Abrir en KarmaHouse» y «Ver más viviendas». Guardar captura en `artifacts/` (no se commitea).

- [ ] **Step 4: Deep link on Android (if a device/emulator is attached)**

```bash
adb shell am start -a android.intent.action.VIEW -d "karmahouse://property/<id aprobado>" com.karmahouse.karmahouse
```
Expected: la app abre el detalle de esa vivienda. Sin dispositivo, anotar «pendiente de teléfono».

- [ ] **Step 5: Write `docs/public-listing-verification.md`**

```markdown
# Ficha pública: verificación

Fecha: <fecha de la ejecución>. Función `p` desplegada por la ejecución `functions` de GitHub Actions <enlace a la ejecución>.

## Comprobaciones

`scripts/verify-public-listing.mjs` (node de Codex):

<pegar las cuatro líneas JSON>

## Navegador

<qué se vio: galería, precio, botones; ruta de la captura en artifacts/>

## Enlace profundo Android

<resultado de `adb shell am start` o «pendiente de teléfono»>

## Límites

- Sin dominio propio: la URL es la del proyecto de Supabase.
- La vista previa en WhatsApp/Telegram depende de que sus rastreadores lleguen a `*.supabase.co`; comprobado desde <red> el <fecha> / no comprobado.
- `og:image` es una URL firmada de 1 h; el rastreador la descarga al compartir y conserva su copia.
```

Rellena cada `<...>` con lo observado. Nada de `<...>` puede quedar en el commit.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-public-listing.mjs docs/public-listing-verification.md
git commit -m "docs: verify the public listing page against the project

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: README y roadmap

**Files:**
- Modify: `README.md:21`
- Modify: `docs/growth-roadmap.md:18`

- [ ] **Step 1: README**

Sustituye la línea 21 de `README.md`:

```markdown
- Compartir una vivienda como enlace a su ficha pública (vista previa con foto y precio, botón para abrir la app), reportar un anuncio y cola de moderación para retirarlo.
```

Y en la sección «Google Play», tras el párrafo de las páginas públicas, añade:

```markdown
La ficha pública de cada anuncio la sirve la Edge Function `supabase/functions/p` (`/functions/v1/p/<id>`), desplegada por el workflow `functions` con los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF`. `scripts/verify-public-listing.mjs` la comprueba; [evidencia](docs/public-listing-verification.md).
```

- [ ] **Step 2: Roadmap**

En `docs/growth-roadmap.md`, sustituye la fila 4 de la tabla:

```markdown
| 4 | Compartir una vivienda y regresar cuando aparezca una adecuada | Ficha pública entregada ([verificación](public-listing-verification.md)); pendientes dominio propio, Android App Links/iOS Universal Links, búsquedas guardadas y alertas | Enlace funciona con/sin app, solo expone anuncios públicos, alertas deduplicadas y cancelables |
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/growth-roadmap.md
git commit -m "docs: record the public listing page in the README and roadmap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

- Spec: función `p` (T3), `render.ts` puro y probado (T1-T2), etiquetas `og:` y página (T2), errores 404/503/405 y fotos sin firma (T3), `listingShareUrl` y `share()` (T4), workflow y secretos (T5), script y doc de verificación, enlace profundo (T6), README/roadmap (T7). `HEAD` se acepta además de `GET`; no contradice la spec.
- Tipos: `PublicListingRow` (T1) es lo que consume `renderListing` (T2) y lo que castea `index.ts` (T3); `renderListing(row, photoUrls, siteUrl, selfUrl)` con cuatro argumentos en T2, T3 y tests.
- Sin marcadores salvo los `<...>` del doc de verificación, que T6 obliga a rellenar.
