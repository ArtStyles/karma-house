# Ficha pública y página oficial: verificación

25 de septiembre de 2026. Proyecto Vercel `karmahouse` (Root Directory `web`, sin build), desplegado desde `main` por la integración Git; commit verificado `1d1e020`. Diseño: [spec](superpowers/specs/2026-09-24-public-listing-design.md), con el cambio de Edge Function a Vercel explicado al final.

## Por qué no es una Edge Function

Se desplegó `supabase/functions/p` y respondió `200`, pero con `Content-Type: text/plain` y `Content-Security-Policy: default-src 'none'; sandbox`: Supabase reescribe cualquier HTML servido desde `*.supabase.co` (anti-phishing) y solo lo evita un dominio propio de pago. Además recortaba `/functions/v1` de la ruta y `og:url` salía como `http://<ref>.supabase.co/p/<id>`. La función y su workflow se retiraron del repo; la función desplegada debe borrarse desde el panel.

## Comprobaciones automáticas

`scripts/verify-public-listing.mjs https://karmahouse.vercel.app` (node de Codex, lee el id de un anuncio aprobado por Postgres):

```
{"name":"approved","status":200,"type":"text/html; charset=utf-8","cache":"public","ok":true}
{"name":"bogus","status":404,"type":"text/html; charset=utf-8","cache":"public","ok":true}
{"name":"post","status":405,"type":null,"cache":"public, max-age=0, must-revalidate","ok":true}
```

No hay ningún anuncio pausado, vendido o pendiente en el proyecto, así que la comprobación `hidden` no se ejecutó; la prueba unitaria cubre ese camino con un `fetch` falso. Vercel sustituye el valor de `Cache-Control` que envía la función por `public` en la respuesta al navegador; la caché de su CDN sí respeta `s-maxage`.

Antes de configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en Vercel la función respondía `503 Service Unavailable: missing SUPABASE_URL or SUPABASE_ANON_KEY`, que es el texto previsto para ese caso.

`npm run check`: typecheck limpio y 256 pruebas, 12 de ellas en `tests/public-listing.test.ts` (render, escape, `og:`, `handle` con 200, firma fallida, 404 sin tocar Supabase, 503 con motivo y 405).

## Navegador

`https://karmahouse.vercel.app/p/4cbaf3d8-717e-4282-8c72-bb12acc26bc6` en el navegador integrado, vista móvil y escritorio: título, galería con las tres fotos firmadas, precio, tabla de datos, descripción, características, botones «Abrir en KarmaHouse» (`karmahouse://property/<id>`) y «Ver más viviendas». Etiquetas leídas del DOM:

```
og:type=website
og:site_name=KarmaHouse
og:title=Casa lujosa cerca del Malecón
og:description=8,500 USD · Vedado, La Habana · 2 hab · 2 baños · 120 m²
og:url=https://karmahouse.vercel.app/p/4cbaf3d8-717e-4282-8c72-bb12acc26bc6
og:image=https://iuhvlpucclqbytuqflci.supabase.co/storage/v1/object/sign/property-photos/...
```

Sin errores de consola. La página oficial `https://karmahouse.vercel.app/` se revisó igual (móvil y escritorio, claro y oscuro): hero, franja de cifras, pasos, filas de negociación y confianza, banda de descarga, preguntas y pie.

## Pendiente

- Enlace profundo Android (`adb shell am start -a android.intent.action.VIEW -d karmahouse://property/<id>`): sin dispositivo conectado en esta sesión; pendiente de teléfono.
- Vista previa real en WhatsApp/Telegram desde ETECSA: los rastreadores deben alcanzar `karmahouse.vercel.app` y la foto firmada en `*.supabase.co`; el usuario confirma que sus proyectos Vercel cargan desde Cuba sin VPN, la vista previa en sí no se ha observado.
- El botón «Descargar APK» apunta a `https://github.com/ArtStyles/karma-house/releases/latest/download/KarmaHouse.apk`; no existe ninguna release todavía.
- Borrar la Edge Function `p` en el panel de Supabase y los secretos `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` en GitHub.

## Límites

- `og:image` es una URL firmada de 1 h; el rastreador la descarga al compartir y conserva su copia.
- Plan Hobby de Vercel: uso no comercial; revisar si KarmaHouse empieza a cobrar.
