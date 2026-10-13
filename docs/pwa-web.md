# KarmaHouse web (PWA), fase 1

Objetivo: que quien tiene iPhone pueda usar KarmaHouse desde el navegador y añadirla a la
pantalla de inicio. Es la misma app de Expo exportada para web, en `app.karmahouse.site`.
La fase 1 no incluye notificaciones push; en la web las novedades quedan en la bandeja de la app.

## Qué incluye

- `public/index.html`: plantilla web de Expo (`npx expo customize public/index.html`) con
  `lang="es"`, `viewport-fit=cover` (para leer el área segura del iPhone), manifest, icono de
  Apple, metadatos de pantalla de inicio y el registro del service worker después de `load`.
- `public/manifest.json` y `public/icons/` (192, 512 y 180 px, generados desde
  `assets/karmahouse-icon.png`).
- `public/sw.js`: service worker escrito a mano, sin Workbox.
  - Precarga la página y los bundles que carga `index.html`.
  - Las navegaciones van primero a la red; si no hay red o tarda más de 5 s, sirve la página
    precargada. Así la app abre sin conexión y siempre coincide con su bundle.
  - `/_expo/static`, `/assets` y `/maplibre` (rutas con hash o versión) se sirven desde la caché.
  - No guarda nada de otros orígenes: Supabase, teselas del mapa y fotos van siempre a la red.
  - Sin sellar (servidor de desarrollo) no hace nada.
- `scripts/stamp-sw.mjs`: después del export escribe en `dist/sw.js` la versión (hash de
  `index.html` y del propio `sw.js`) y la lista de precarga. Cada build nueva instala un service
  worker nuevo, que borra la caché anterior. Nunca guarda como asset una respuesta HTML.
  Prueba: `tests/stamp-sw.test.ts`.
- `public/vercel.json`: reescritura SPA a `index.html` para todo menos `/_expo`, `/assets`,
  `/maplibre` e `/icons` (un archivo que falte da 404, no la página), caché inmutable para rutas
  con hash y `no-cache` para `sw.js`. Expo lo copia a `dist/`, que es lo que se publica.
- `public/.vercelignore`: la CLI de Vercel no sube ninguna carpeta `node_modules`, y Expo deja la
  fuente de iconos (Ionicons) en `assets/node_modules/`. Este archivo la vuelve a incluir.
- `src/components/InstallHint.tsx`: tarjeta en Explorar, solo en iPhone y solo si la app no está
  instalada: «Toca Compartir y luego «Añadir a pantalla de inicio»». Se puede cerrar y no vuelve
  en ese navegador.

## Construir

```bash
npm run build:web
```

Usa las variables `EXPO_PUBLIC_*` de `.env.local`, igual que la APK. El resultado queda en `dist/`.

## Publicar

Proyecto de Vercel `karmahouse-app-pwa` (equipo `frank-james-hernandezs-projects`), separado del
de la landing. Se publica la carpeta ya construida, no la raíz del repo: el `.vercelignore` de la
raíz solo deja subir `web/` para la landing. Framework «Other», sin build en Vercel.

```bash
npm run build:web
```

```bash
npx vercel deploy dist --prod --project karmahouse-app-pwa --scope frank-james-hernandezs-projects --yes
```

Si `node` da `EACCES` al conectar, ejecuta la CLI con el node empaquetado de Codex
(`%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`).
Antes de publicar, `vercel deploy dist --dry --json --project karmahouse-app-pwa` debe mostrar
`"ignoredCount": 0`.

Estado el 2026-10-13:

1. En producción: https://app.karmahouse.site (también https://karmahouse-app-pwa.vercel.app).
   Se publica desde `main`, que desde este día incluye el rediseño visual 0.1.25.
2. DNS en GoDaddy: `CNAME app → b48cd2d2a2f31010.vercel-dns-017.com.` Vercel lo verificó. El
   certificado no se emitió solo; hizo falta
   `vercel certs issue app.karmahouse.site --scope frank-james-hernandezs-projects`.
3. Supabase → Authentication → URL Configuration:
   - Site URL: `https://app.karmahouse.site/auth/callback` (antes `http://localhost:8083/...`,
     que dejaba sin salida a cualquier enlace que cayera en la URL por defecto).
   - Redirect URLs: `http://localhost:8083/auth/callback**`, `karmahouse://auth/callback**`,
     `https://app.karmahouse.site/auth/callback**`,
     `https://karmahouse-app-pwa.vercel.app/auth/callback**`.
4. No anunciar iPhone en la landing ni en BRAND.md hasta comprobarlo en un iPhone real.

El primer despliegue subió sin la fuente de iconos; la reescritura devolvió `index.html` en su
lugar con caché de un año. Ya está corregido, pero un navegador que abrió esa versión puede seguir
viendo cuadros en vez de iconos hasta borrar los datos del sitio.

## Verificado en local (2026-10-13)

Con `dist/` servido en `localhost` y reescritura SPA, en el navegador integrado:

- El service worker se activa, controla la página y precarga `/`, el CSS y el bundle principal.
  Las fuentes y el logo se guardan al usarse.
- Con el servidor apagado, `/favorites` abre desde la caché.
- Un build nuevo cambia la versión, y al actualizar queda solo la caché nueva.
- Con user agent de iPhone a 390 × 844 aparece la tarjeta de instalación; al cerrarla no vuelve
  tras recargar. Con user agent de Android no aparece.
- Sin errores en consola. `npm run typecheck` y `tests/stamp-sw.test.ts` pasan.

En producción (`app.karmahouse.site` y `karmahouse-app-pwa.vercel.app`): página, rutas internas y `/auth/callback`
responden 200; un asset que no existe responde 404; el bundle sale en brotli con caché inmutable;
`sw.js` sin caché. En el navegador el service worker controla la página, carga las viviendas
reales y los iconos, sin errores en consola.

Peso de la primera visita (brotli): bundle principal ≈ 650 KB, mapa ≈ 235 KB al abrirlo.
Las visitas siguientes solo piden `index.html` y los datos.

## Falta comprobar en un iPhone real

- Instalar desde Safari y abrir desde la pantalla de inicio: barra de estado, notch, indicador
  de inicio (barra de pestañas), teclado en el chat y en los formularios.
- Elegir fotos para un anuncio y para el avatar.
- Entrar, cerrar la app y volver días después: la sesión debe seguir.
- El enlace del correo de confirmación se abre en Safari, no en la app instalada. Después hay
  que entrar con la contraseña en la app.

## Fase 2

Web Push para iPhone (iOS 16.4 o superior, solo con la app instalada): suscripción VAPID en el
navegador, guardar la suscripción en Supabase y enviar desde Supabase. El iPhone recibe por los
servidores de Apple, no por `exp.host`, pero hay que probarlo desde Cuba.
