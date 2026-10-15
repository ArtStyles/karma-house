# Aviso de actualización en la app de Android

Fecha: 15 de octubre de 2026. Estado: propuesta para revisar.

## Objetivo

Quien usa el APK de Android se entera de que hay una versión nueva, ve qué cambia y cuánto pesa,
y la instala encima de la actual con un toque. Nada se descarga sin que lo pida.

## Decisiones tomadas con el dueño

- El APK sigue en la release pública de GitHub, como hoy en la web. karmahouse.site sirve solo el
  manifiesto con el SHA-256; la app comprueba el archivo antes de instalarlo.
- El aviso es una fila en Mi espacio y un punto en la pestaña Mi espacio (y en la barra lateral).
- «Ahora no» quita el punto hasta la siguiente versión; la fila se queda.
- Las notas salen de un archivo por versión: `docs/release-notes/<versión>.txt`.

## Manifiesto

`web/public/android/latest.json`, servido en `https://www.karmahouse.site/android/latest.json`:

```json
{
  "version": "0.1.29",
  "versionCode": 30,
  "date": "2026-10-20",
  "size": 85268595,
  "sha256": "<64 hex>",
  "url": "https://github.com/ArtStyles/karma-house/releases/download/v0.1.29/KarmaHouse.apk",
  "notes": ["Una línea por cambio."]
}
```

- `scripts/prepare-android-distribution.ps1` lo escribe en `artifacts/distribution/<versión>/` y en
  `web/public/android/`. Lee las notas de `docs/release-notes/<versión>.txt` como UTF-8 y se detiene si
  falta. Las mismas líneas van a `NOTAS-RELEASE.txt`, en lugar del texto fijo del script. De paso se
  corrigen las tildes rotas que hoy salen en ese archivo («cÃ³digo»): Windows PowerShell 5.1 lee el
  script sin BOM como ANSI.
- `web/src/content.ts` conserva su `VERSION`, que es lo que importa Vite. Una prueba exige que coincida con
  `latest.json`. Publicar sigue siendo un solo commit después de subir la release, con los dos archivos.
- La fecha es la del día en que se prepara la entrega.

## App (`src/updates/`)

Solo `Platform.OS === 'android'`. En la web no se consulta ni se muestra nada.

- `manifest.ts` (puro, con pruebas): `parseManifest` valida tipos; acepta solo `https://github.com/ArtStyles/karma-house/releases/download/`,
  SHA-256 de 64 caracteres hexadecimales, tamaño mayor que cero, `versionCode` entero y notas como
  lista de textos. `isNewer` compara `versionCode` con el instalado. También da formato al tamaño
  («85,3 MB») y a la fecha.
- Versión instalada: `Constants.expoConfig.android.versionCode` (expo-constants ya está instalado; sin
  actualizaciones OTA, coincide con la del APK).
- Consulta: al abrir la app y al volver a primer plano, como mucho una vez cada 24 horas (unos 600
  bytes). Guarda el último manifiesto válido, la hora de la consulta y la versión pospuesta en el
  almacenamiento local que ya usa Ahorro de datos. Un fallo de red no muestra nada.
- Descarga, solo al tocar «Descargar», también con Ahorro de datos activado:
  `File.createDownloadTask` de expo-file-system a la caché, con progreso y «Cancelar».
- Comprobación: SHA-256 con `expo-crypto` sobre los bytes del archivo. Si no coincide, se borra el
  archivo y se avisa.
- Instalación: `expo-intent-launcher` (dependencia nueva) abre `android.intent.action.VIEW` con
  `file.contentUri`, que sirve el FileProvider que ya declara expo-file-system para la caché, el tipo
  `application/vnd.android.package-archive` y `FLAG_GRANT_READ_URI_PERMISSION`. `app.json` añade
  `android.permission.REQUEST_INSTALL_PACKAGES`. Android pide a la persona permitir instalar desde
  KarmaHouse la primera vez.
- Si cierra el instalador, el APK comprobado se queda en la caché y el botón pasa a «Instalar», sin
  volver a gastar datos. Se borra al abrir una versión igual o más nueva.

## Interfaz

- Mi espacio: fila «Nueva versión 0.1.29» con icono de descarga, descripción «85,3 MB · Qué cambia»,
  encima de Ahorro de datos.
- Punto en la pestaña Mi espacio y en la barra lateral mientras haya versión nueva no pospuesta.
- Modal, con el mismo patrón que en `PublicProfileScreen.tsx`: «KarmaHouse 0.1.29», fecha y tamaño,
  «Qué cambia» con las notas, y el texto «Se instala encima de la versión que tienes. Android puede
  pedirte permiso para instalar desde KarmaHouse y un análisis de Play Protect.»
  Botones «Descargar · 85,3 MB» y «Ahora no». Mientras descarga: progreso y «Cancelar».

## Pruebas

`tests/app-update.test.ts`: parseo de un manifiesto válido; rechazo de URL ajena, `http`, SHA mal
formado y tamaño cero; comparación de versiones. Además, `tsc --noEmit` y `npm test`.

## Límites conocidos

- Funciona desde la versión que lo incluya (0.1.29). Quien tenga 0.1.28 actualiza a mano una vez más.
- El hash lee el APK entero en memoria (unos 85 MB). En un teléfono con poca RAM podría fallar; en ese
  caso habría que calcularlo por partes.
- Google Play no permite que una app se actualice sola ni el permiso `REQUEST_INSTALL_PACKAGES` para
  esto. Si algún día se sube el AAB a Play, ese build tiene que ir sin el aviso.
- No se puede probar aquí en un teléfono: descarga real, permiso de instalar desde KarmaHouse e
  instalador quedan pendientes de un dispositivo.
