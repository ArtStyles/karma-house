# Ficha pública de cada vivienda

24 de septiembre de 2026. Aprobado por el usuario: ficha servida por una Edge Function (A), con el contenido completo del anuncio (A) y desplegada desde GitHub Actions (A).

## Problema

«Compartir vivienda» envía solo texto y la portada del sitio. Quien lo recibe por WhatsApp, Telegram o Facebook no ve foto ni precio en la vista previa, y no tiene un enlace que abra ese anuncio. El sitio público es estático (GitHub Pages) y no puede servir etiquetas `og:` distintas por anuncio, que es lo que los rastreadores de esas aplicaciones leen sin ejecutar JavaScript.

Objetivo: cada anuncio aprobado y activo tiene una URL propia, con vista previa rica, que muestra el anuncio completo sin instalar nada y ofrece abrir la app.

## Diseño

### Servidor

Edge Function `p` en `supabase/functions/p/index.ts` (Deno, sin dependencias externas salvo `@supabase/supabase-js`).

- `GET /functions/v1/p/<uuid>` devuelve HTML. Cualquier otro método: `405`.
- `supabase/config.toml` declara `[functions.p] verify_jwt = false`: la ficha es pública.
- Consulta `public.properties` con la clave `service_role` que el runtime inyecta (`SUPABASE_SERVICE_ROLE_KEY`), filtrando `id = <uuid> and moderation = 'approved' and availability = 'active'`. Columnas: `id, title, location, province, type, description, price, area, bedrooms, bathrooms, amenities, photo_paths, condition, floor, price_negotiable, updated_at`. Nunca lee ni expone `owner_id`, `latitude`, `longitude` ni `location_precision`.
- Firma `photo_paths` en el bucket `property-photos` con `createSignedUrls(paths, 3600)`. Si la firma falla, la página se renderiza sin fotos y sin `og:image`.
- Cabeceras: `Content-Type: text/html; charset=utf-8`, `Cache-Control: public, max-age=300`.
- `SITE_URL` fija en el código: `https://artstyles.github.io/karma-house/`.

`supabase/functions/p/render.ts` es un módulo puro sin API de Deno, para que `node --test` lo pruebe:

- `renderListing(row, photoUrls, siteUrl)`: HTML completo de la ficha.
- `renderUnavailable(siteUrl)`: página «Ya no está disponible».
- `escapeHtml` aplicado a todo campo que venga de la base de datos, incluidas las URL firmadas dentro de atributos.

### Página

`<html lang="es">`, sin JavaScript salvo el fallback del botón; CSS inline con la paleta de `site/style.css`.

- `<title>`: título del anuncio. `<link rel="canonical">` a la propia URL.
- `og:type=website`, `og:site_name=KarmaHouse`, `og:title`, `og:description`, `og:url`, `og:image` (primera foto firmada, si hay), `twitter:card=summary_large_image`. `og:description` = `«85,000 USD · Vedado, La Habana · 3 hab · 2 baños · 120 m²»`; el importe se formatea con separador de miles «,», como en la app (`85,000`).
- Cuerpo: cabecera con la marca y enlace al sitio; galería de todas las fotos con `<img loading="lazy">`; precio y «Negociable» si `price_negotiable`; tipo, estado (`condition` traducido con las etiquetas de `listingOptions.ts`), planta si existe, zona y provincia, hab/baños/m²; descripción con saltos de línea conservados; características (`amenities`).
- Botón fijo inferior «Abrir en KarmaHouse» → `karmahouse://property/<id>`. Un `<script>` mínimo: al pulsarlo, si a los 1,5 s `document.visibilityState` sigue siendo `visible`, redirige a `SITE_URL`.
- Segundo botón «Ver más viviendas» → `SITE_URL`.

La ruta `property/[id]` ya existe en expo-router y el esquema `karmahouse` está declarado en `app.json`; `anon` puede leer anuncios aprobados, así que el enlace profundo abre el detalle sin sesión.

### Errores

| Caso | Respuesta |
| --- | --- |
| Id no es uuid, anuncio inexistente, no aprobado, pausado o vendido | `404` con `renderUnavailable` |
| Fallo de base de datos | `503` texto plano, `Retry-After: 30` |
| Fallo al firmar fotos | `200`, página sin fotos |
| Método distinto de `GET` | `405` |

### Cliente

- `src/lib/publicSite.ts`: `listingShareUrl(id)` devuelve `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/p/${id}`; sin URL de Supabase configurada (demo local) devuelve `SITE_URL`.
- `DetailScreen.share()`: conserva título, precio, zona y medidas; la última línea pasa a ser el enlace de `listingShareUrl`.

### Despliegue

`.github/workflows/functions.yml`: en push a `main` que toque `supabase/functions/**` o `supabase/config.toml`, y en `workflow_dispatch`:

1. `actions/checkout@v4`
2. `supabase/setup-cli@v1`
3. `supabase functions deploy p --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}` con `SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}`

Secretos del repositorio que el usuario crea: `SUPABASE_ACCESS_TOKEN` (token personal del panel de Supabase) y `SUPABASE_PROJECT_REF`. La clave `service_role` no sale de Supabase.

## Verificación

- `tests/public-listing.test.ts` sobre `render.ts`: título con `<script>` queda escapado; etiquetas `og:` completas con foto; sin fotos no hay `og:image` y no rompe; `renderUnavailable` enlaza al sitio; descripción conserva saltos de línea.
- `scripts/verify-public-listing.mjs` contra el proyecto real, con el node de Codex: un anuncio aprobado (`200`, `og:image`, `Cache-Control`), uno pausado (`404`), un id inválido (`404`), `POST` (`405`).
- `docs/public-listing-verification.md` con la evidencia.
- Enlace profundo en Android: `adb shell am start -a android.intent.action.VIEW -d karmahouse://property/<id>` si hay emulador o teléfono; si no, queda documentado como pendiente.
- `npm run check`.

## Fuera de alcance

Dominio propio y App Links verificados; enlace de descarga del APK en el sitio (sin release publicada); mapa en la ficha; contadores de visitas; limitación de tasa propia (se confía en los límites de Supabase; la ficha solo expone datos ya públicos para `anon`).

## Cambio del 25 de septiembre: Vercel en lugar de Edge Function

La Edge Function se desplegó y respondió, pero el gateway de Supabase reescribe a `text/plain` con `Content-Security-Policy: default-src 'none'; sandbox` cualquier HTML servido desde `*.supabase.co` (medida anti-phishing; solo un dominio propio de pago lo evita). Además recorta `/functions/v1` de la ruta que ve la función, así que `og:url` salía mal. Se descartó la opción A. El usuario tiene cuenta en Vercel con proyectos que cargan desde ETECSA sin VPN, y eligió Vercel (plan Hobby) frente a prerenderizar en GitHub Pages.

Lo que cambia respecto a las secciones anteriores:

- **Servidor:** proyecto Vercel con Root Directory `web/`. `web/api/p.ts` exporta `GET(request)` (función Web estándar, sin dependencias) y `handle(request, env, fetch)` para probarla con un `fetch` falso. `web/vercel.json` reescribe `/p/:id` a `/api/p?id=:id` y redirige `/` al sitio. el módulo puro de render va dentro de `web/api/p.ts` (sin imports relativos, para no depender de cómo Vercel resuelve `.ts`). Lee con la clave `anon` por REST (`/rest/v1/properties?...&moderation=eq.approved&availability=eq.active`) y firma las fotos con `POST /storage/v1/object/sign/property-photos` (`expiresIn: 3600`), lo que la política `kh_photo_read` ya permite. Variables de entorno del proyecto: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Cabecera de caché `public, s-maxage=300, stale-while-revalidate=60`. Errores como antes: `404`, `503` con `Retry-After: 30` (también si `fetch` lanza), `405`; si la firma falla o lanza, `200` sin fotos.
- **Cliente:** `PUBLIC_PAGES_URL = 'https://karmahouse.vercel.app/'` en `publicSite.ts`; `listingShareUrl(id)` = `${PUBLIC_PAGES_URL}p/${id}`. Se ajusta si el proyecto recibe otro dominio.
- **Despliegue:** integración Git de Vercel sobre `main` (Root Directory `web`, Framework «Other», sin build). Se eliminan `supabase/functions/`, `supabase/config.toml` y `.github/workflows/functions.yml`; la función `p` desplegada se borra desde el panel de Supabase y los dos secretos de GitHub sobran.
- **Verificación:** pruebas de `handle` con `fetch` falso (200 con fotos, firma fallida, 404 sin tocar Supabase para ids malformados, 503, 405); `scripts/verify-public-listing.mjs [url]` contra el dominio real exige `Content-Type: text/html`.
