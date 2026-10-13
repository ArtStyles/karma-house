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
  `index.html`) y la lista de precarga. Cada build nueva instala un service worker nuevo, que
  borra la caché anterior. Prueba: `tests/stamp-sw.test.ts`.
- `public/vercel.json`: reescritura SPA a `index.html`, caché inmutable para rutas con hash y
  `no-cache` para `sw.js`. Expo lo copia a `dist/`, que es lo que se publica.
- `src/components/InstallHint.tsx`: tarjeta en Explorar, solo en iPhone y solo si la app no está
  instalada: «Toca Compartir y luego «Añadir a pantalla de inicio»». Se puede cerrar y no vuelve
  en ese navegador.

## Construir

```bash
npm run build:web
```

Usa las variables `EXPO_PUBLIC_*` de `.env.local`, igual que la APK. El resultado queda en `dist/`.

## Publicar (pendiente, lo hace el dueño de las cuentas)

1. Vercel: crear un proyecto nuevo (por ejemplo `karmahouse-app`), separado del de la landing.
   Publicar la carpeta ya construida, no la raíz del repo: el `.vercelignore` de la raíz solo
   deja subir `web/` para la landing.

   ```bash
   npx vercel deploy dist --prod
   ```

   Framework «Other», sin comando de build. `expo export` vacía `dist/` y con eso se borra
   `dist/.vercel`, así que cada despliegue debe indicar el proyecto (`--project` y `--scope`,
   como en `docs/agency-workspaces-release-runbook.md`) o volver a enlazarlo.
2. Dominio: añadir `app.karmahouse.site` a ese proyecto.
3. Supabase → Authentication → URL Configuration → Redirect URLs: añadir
   `https://app.karmahouse.site/**`. Sin esto, los enlaces de confirmación y de recuperar la
   contraseña no vuelven a la web.
4. No anunciar iPhone en la landing ni en BRAND.md hasta comprobarlo en un iPhone real.

## Verificado en local (2026-10-13)

Con `dist/` servido en `localhost` y reescritura SPA, en el navegador integrado:

- El service worker se activa, controla la página y precarga `/`, el CSS y el bundle principal.
  Las fuentes y el logo se guardan al usarse.
- Con el servidor apagado, `/favorites` abre desde la caché.
- Un build nuevo cambia la versión, y al actualizar queda solo la caché nueva.
- Con user agent de iPhone a 390 × 844 aparece la tarjeta de instalación; al cerrarla no vuelve
  tras recargar. Con user agent de Android no aparece.
- Sin errores en consola. `npm run typecheck` y `tests/stamp-sw.test.ts` pasan.

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
