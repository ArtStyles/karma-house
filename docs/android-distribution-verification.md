# Distribución directa de KarmaHouse para Android

Revisión inicial del 2 de octubre y publicación del 3 de octubre de 2026. La distribución elegida es la descarga directa
desde la página oficial, sin una cuenta de pago de Google Play.

## Entrega 0.1.16 del 6 de octubre de 2026

Se reconstruyeron APK y AAB desde la aplicación integrada en `99e175648e50615be7b5251cf8ad9f68241d1eff`, regenerando el proyecto Android desde Expo 57 y refrescando el bundle. La release apunta a `2095f02279b7a2e7b1960e56c3ee50006a3a657b`: ese commit solo añade el workflow y controles de distribución; `src/`, configuración, dependencias y migraciones coinciden con las fuentes compiladas.

| Comprobación | Resultado |
| --- | --- |
| Paquete / versión / código | `com.karmahouse.karmahouse` / `0.1.16` / `17` |
| APK público | `KarmaHouse.apk`, 84.544.831 bytes (84,5 MB) |
| APK SHA-256 | `896dacb901cb65e8d6ba7cbc206833bc92b05ebc18b7f28bcef9b865f31635e4` |
| Certificado habitual SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |
| Android / ABI / firma | Android 7+, arm64-v8a y armeabi-v7a, firma v2 válida, no depurable |
| Bundle y secretos | Configuración pública de producción incluida; 1.386 entradas sin los valores privados comprobados ni marcadores de clave privada |
| AAB local | 51.946.771 bytes; firma válida con el mismo certificado |
| AAB SHA-256 | `01286df54f1e44bfa8e2eddc90746e1ffa0e7f4a63cd77b9fba29e7cdb674abe` |
| Validación de fuentes | TypeScript y 418 pruebas; build y TypeScript de la web; versión, enlaces y ausencia de overflow a 390 y 1280 px |

El correo de ayuda aprobado en `src/lib/assistedPublication.ts` es público. Los verificadores permiten únicamente ese correo administrativo cuando coincide exactamente con el contacto aprobado; siguen rechazando claves, contraseñas y otro correo administrativo. El nuevo ensayo comprueba también que una credencial igual al contacto continúa bloqueada.

La [release v0.1.16](https://github.com/ArtStyles/karma-house/releases/tag/v0.1.16), ID `404949505`, es pública, estable y la entrega más reciente. El activo APK `616087644` está `uploaded`, con tamaño y digest iguales a los locales. Se descargaron íntegramente y sin autenticación el APK, `KarmaHouse.apk.sha256` e `INSTALACION.txt`; sus tres hashes coinciden con los archivos preparados. Conserva la release 0.1.15 como entrega anterior. La portada actualiza conjuntamente versión, tamaño y enlaces de esa misma entrega.

El [backend compatible](assisted-listings-activation.md) quedó preparado, con sus tres migraciones registradas y el endpoint probado mediante Auth, REST y Storage reales. Las cuentas, filas y objetos sintéticos se eliminaron; se conservan las tres propiedades y cinco objetos existentes. **Los traspasos permanecen desactivados.**

Esta publicación no repite la instalación de 0.1.16 en un teléfono físico ni verifica el resultado de Play Protect o las notificaciones en ese dispositivo. La firma compatible acredita la identidad del APK; el piloto con material real sigue pendiente del protocolo y de autorización operativa.

## Publicación verificada el 3 de octubre de 2026

- Release `v0.1.15`, ID `402039134`, pública y no marcada como prerelease:
  [KarmaHouse 0.1.15 para Android](https://github.com/ArtStyles/karma-house/releases/tag/v0.1.15).
- La carga de 83.627.967 bytes se completó mediante el cargador web de GitHub.
  Los intentos por API habían dejado activos `starter` sin hash; se retiraron
  únicamente esos activos incompletos después de cerrar sus transferencias.
  El APK definitivo, ID `608530514`, tiene estado `uploaded` y digest
  `sha256:99bbceb0bfdf1ed56d6a92ea3b29c67bb7d660414aff46af1a692288fb5db792`.
- Se descargó el APK completo sin cabeceras de autenticación. Su tamaño y
  SHA-256 coinciden con la entrega local. Las descargas anónimas de
  `INSTALACION.txt` y `KarmaHouse.apk.sha256` también coinciden byte a byte.
- Se volvió a verificar el paquete `com.karmahouse.karmahouse`, versión
  `0.1.15` / código `16`, firma v2, Android mínimo 7 y ausencia de modo depurable.
  La firma coincide con el certificado del APK anterior 0.1.14. El verificador
  encontró la configuración pública real del backend dentro del bundle y no
  encontró los valores privados ni los marcadores que cubre su comprobación.
- El backend existente respondió HTTP 200 para salud de Auth y lectura de las
  columnas del catálogo. `kh_search_properties` devolvió una página válida;
  el registro por correo está habilitado. La inspección SQL con TLS, dentro de
  una transacción de solo lectura, confirmó `cover_thumb_path`, las RPC
  requeridas, RLS en las tablas revisadas y el bucket privado `property-photos`.
  No se modificaron datos, cuentas ni políticas. Una ficha pública real `/p/<id>`
  respondió HTTP 200 y conservó su enlace a la aplicación.
- El commit web `172d579a0c9a43c5d9b75689c336275336ed561e` contiene solo
  `web/public/index.html` y `web/README.md`; se publicó en `main`. Vercel informó
  `success`, «Deployment has completed». La página oficial respondió HTTP 200
  con el botón «Descargar APK» y los enlaces versionados correctos.
- Se revisaron navegación, botones y enlaces en la web publicada en escritorio
  (1440 px) y móvil (390 px), sin desbordamiento horizontal. La vista local
  también pasó a 320 y 768 px. Las 19 pruebas existentes de fichas públicas
  pasaron; `site.js` pasó la comprobación de sintaxis.

Evidencia: `artifacts/distribution-audit/anonymous-download-20261003.json`,
`upload-verified-20261003.json`, `release-public-20261003.json`,
`backend-readonly-20261003.json`, `backend-http-20261003.json`,
`vercel-download-20261003.json` y las capturas `download-public-*-20261003.png`.
No se instaló de nuevo la app en un dispositivo ni se obtuvo una aprobación de
Google Play Protect. La publicación no elimina los posibles avisos de Android.

## Seguimiento del 2 de octubre de 2026

Se corrigió el decodificador de enlaces, se compiló la versión **0.1.15 / 16**
con el certificado existente y se preparó la entrega en
`artifacts/distribution/0.1.15/`. TypeScript y 362 pruebas pasan. La actualización
sobre 0.1.14 y la apertura del catálogo se comprobaron en un Pixel 7 Pro con
Android 17. La instalación desde el navegador y el diálogo de Play Protect
siguen pendientes; las comprobaciones del teléfono se realizaron mediante ADB.

La web corregida ya está desplegada en producción. Los archivos de la release
siguen pendientes mientras se completa el inicio de sesión de GitHub solicitado
por el usuario.

## Descarga pública

- `https://karmahouse.vercel.app/` respondió HTTP 200.
- El botón apunta a
  `https://github.com/ArtStyles/karma-house/releases/latest/download/KarmaHouse.apk`.
  Ese enlace respondió HTTP 404, comprobado sin iniciar sesión.
- El repositorio `ArtStyles/karma-house` es público. La API de releases devolvió
  `[]`; el endpoint de la última release respondió HTTP 404. No hay una entrega
  pública que pueda servir el botón actual.
- Se ha publicado el texto corregido de la web: Android mínimo 7, firma propia,
  explicación de los avisos y análisis de Play Protect. Se retiró la afirmación
  «Google Play en revisión».
- El commit web `e218b7d98989fbb4bef87295696a828cb0698e8a` se publicó en `main`.
  Vercel devolvió el estado `success`, «Deployment has completed», y la página
  pública respondió HTTP 200 con los textos nuevos. La API de estado del commit
  enlaza esta [entrega de Vercel](https://vercel.com/frank-james-hernandezs-projects/karmahouse/4ME149JsXFmxgQbHRzX4YiPN9C7d).
- La publicación de los archivos de descarga sigue pendiente del acceso a
  GitHub CLI. Se abrió un inicio de sesión visible para que lo complete el usuario.

## APK nuevo comprobado: 0.1.15

| Comprobación | Resultado |
| --- | --- |
| Paquete | `com.karmahouse.karmahouse` |
| Versión / código Android | `0.1.15` / `16` |
| Android mínimo / objetivo | API 24 (Android 7) / API 36 |
| Firma | APK Signature Scheme v2 válida; mismo certificado oficial |
| Depurable | No |
| Arquitecturas | `arm64-v8a`, `armeabi-v7a` |
| Tamaño | 83.627.967 bytes (79,75 MiB) |
| SHA-256 del archivo | `99bbceb0bfdf1ed56d6a92ea3b29c67bb7d660414aff46af1a692288fb5db792` |
| SHA-256 del certificado | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |

La compilación release de APK y AAB terminó correctamente. El script de
preparación terminó con código 0: 1.386 entradas descomprimidas, bundle Hermes
de 3.849.888 bytes, configuración pública incluida y sin los valores privados
de referencia ni los marcadores de credenciales que comprueba el verificador.
La alineación ZIP de 16 KB pasó; no se evaluó la alineación ELF de cada librería.

El sourcemap de esa compilación contiene el decodificador adaptado, con contenido
idéntico al archivo local. El hash del bundle extraído del APK coincide con el
bundle generado por Gradle:
`21208fe26f10f546c25cb4b39818ce9a8a27f803951d41dcb4cf2ac11fd555ee`.
El sourcemap no incluye fuentes de `node-forge` ni de `uuid`; los dos avisos
restantes corresponden al árbol de herramientas y se mantienen documentados.

Los permisos se volvieron a leer en el APK nuevo: no se añadieron cámara,
micrófono, contactos, SMS, ubicación ni superposición. Siguen presentes los
permisos de almacenamiento externo limitados a API 32.

### Comprobación en el teléfono

- Pixel 7 Pro, Android 17, páginas de memoria de 4 KB.
- Antes: versión 0.1.14, código 15. Después de `adb install -r`: respuesta
  `Success`, versión 0.1.15, código 16. No se desinstaló la aplicación; la fecha
  de primera instalación permaneció en el 24 de septiembre.
- Se abrió `MainActivity` y se observó el catálogo cargado en una captura real.
- Se enviaron enlaces con Unicode y con la cadena malformada de la regresión.
  La actividad siguió visible y el proceso en ejecución; no se observaron
  errores AndroidRuntime/ReactNativeJS en el registro consultado.
- No se probó el alta de una instalación nueva desde el navegador, la revisión
  de Play Protect, todas las funciones de la app ni los selectores en Android
  antiguo. Actualizar con ADB no reproduce los avisos de descarga externa.

Evidencia local: `artifacts/distribution-audit/`, incluyendo logs de compilación,
verificación e instalación y `device-0.1.15.png`.

## APK original comprobado: 0.1.14

Archivo existente: `artifacts/releases/KarmaHouse-0.1.14.apk`.

| Comprobación | Resultado |
| --- | --- |
| Paquete | `com.karmahouse.karmahouse` |
| Versión / código Android | `0.1.14` / `15` |
| Android mínimo / objetivo | API 24 (Android 7) / API 36 |
| Firma | APK Signature Scheme v2 válida; RSA de 4096 bits |
| Certificado | `CN=KarmaHouse, O=KarmaHouse` |
| Depurable | No |
| Arquitecturas | `arm64-v8a`, `armeabi-v7a` |
| Tamaño | 83.627.407 bytes (79,75 MiB) |
| SHA-256 del archivo | `f47ba2fdbc168d925d8c9b14f1d7e3bf72c2bed6d1e978d3d7d3f4e7ca56c052` |
| SHA-256 del certificado | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |

El verificador existente terminó con código 0 y comprobó 1.386 entradas
descomprimidas frente a los valores privados de referencia de la configuración
local, sin encontrarlos. También comprobó la ausencia de marcadores de claves
privadas PEM y de credenciales JSON de cuentas de servicio en los archivos de
texto. Esto se limita a los valores y patrones que cubre el verificador.

Se comprobó la alineación ZIP de 16 KB. Esa comprobación no valida la alineación
ELF de todas las bibliotecas nativas.

El archivo `.sha256` existente coincide con el APK. La firma de este APK también
coincide con la huella esperada indicada en el comando de verificación.

Se realizó un control negativo con `KarmaHouse-0.1.5-preview.apk`: al exigir la
huella de distribución, el verificador rechazó su certificado de pruebas con el
mensaje esperado. Esto evita confundir una firma válida de pruebas con la firma
privada que deben conservar las entregas públicas.

### Permisos del APK

El manifiesto no declara permisos de cámara, micrófono, contactos, SMS, llamadas,
ubicación, superposición de ventanas, accesibilidad ni lectura de notificaciones
de otras apps. Sí declara Internet, estado de la conexión, notificaciones propias,
vibración, recepción de eventos de arranque, wake lock, recepción de mensajes de
Firebase y permisos de insignias de distintos fabricantes.

También declara lectura y escritura de almacenamiento externo, limitadas a
Android API 32 o inferior. No se eliminaron sin comprobar su uso por el selector
de imágenes en teléfonos antiguos.

## Dependencias

La consulta del endpoint oficial de avisos de npm se hizo sobre 564 nombres de
paquetes del árbol de dependencias que el lockfile no marca como `dev`. Se
identificaron tres paquetes con avisos conocidos:

| Paquete instalado | Dependencia que lo incorpora | Alcance observado |
| --- | --- | --- |
| `node-forge@1.4.0` | `expo` → `@expo/cli` / certificados de desarrollo | Pendiente de corrección upstream. Aviso alto sobre verificación RSA; no es el firmante Java del APK. |
| `uuid@7.0.3` | `expo-splash-screen` → config plugins → `xcode` | Aviso moderado sobre las APIs v3/v5/v6 con buffers externos. La llamada observada en `xcode/lib/pbxProject.js` es `uuid.v4()`, fuera de esas APIs. |
| `decode-uri-component@0.2.2` en la revisión inicial | `expo-router` → `query-string` | Corregido en el árbol actual con una adaptación CommonJS de la solución oficial 0.5.0; ver pruebas y alcance abajo. |

El árbol actual utiliza `decode-uri-component@0.5.0-karmahouse.1` desde
`vendor/decode-uri-component`. La versión identifica una adaptación local, no
una entrega oficial de npm. Se conserva el código de la solución oficial 0.5.0,
su licencia MIT, la exportación CommonJS que requiere `query-string@7` y la
conversión de `+` a espacio de la versión anterior. La dependencia y el override
quedan registrados en `package.json` y `package-lock.json`; no se mantiene una
edición manual de `node_modules`.

La versión oficial 0.5.0 es un módulo ES. Sustituirla sin adaptar su exportación
rompería el contrato de `query-string@7`, que llama directamente a una función
obtenida con `require()`. Esta adaptación se retirará cuando Expo Router
incorpore una dependencia corregida y compatible.

La consulta posterior volvió a cubrir 564 nombres, incluyendo la versión local
del decodificador: el endpoint devuelve avisos únicamente para `node-forge` y
`uuid`. Ese resultado no sustituye la revisión del código adaptado. Tampoco
certifica las dependencias que llevaba el APK 0.1.14 del 29 de septiembre.

En Expo CLI, `node-forge` interviene en la validación de certificados usados por
las herramientas de desarrollo. No se ha configurado firma de actualizaciones
OTA en `app.json`. Se mantiene el aviso abierto y no se aceptan certificados o
claves externos para ese flujo. La firma de instalación Android se comprueba
con `apksigner`, cuya implementación no usa ese paquete de npm.

`npm audit` no pudo conectarse por un error `EACCES` de Node. La consulta se hizo
mediante HTTPS de PowerShell al mismo endpoint de avisos, con un inventario
validado. No es una ejecución completa del cálculo de metavulnerabilidades de
`npm audit`.

Fuentes: [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
[decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).

### Pruebas de la corrección

- La prueba ejecuta el `query-string` que resuelve Expo Router, con sus
  dependencias reales. Un parámetro de 1.500 bytes `%FF` seguido de `%41`
  excedió el límite de tres segundos con la versión vulnerable. Tras la
  corrección, esa prueba terminó en unos 70 ms.
- Se comprobaron tildes, emojis, espacios, el signo `+` literal, parámetros
  repetidos, codificación y decodificación, y secuencias incompletas o inválidas.
- `npm run check`: revisión TypeScript aprobada; 362 pruebas aprobadas.
- `npm ci --offline --ignore-scripts --no-audit --no-fund` en un directorio
  limpio instaló 642 paquetes desde el lockfile. La dependencia local se
  resolvió correctamente y decodificó una consulta de control.

## Preparación de la entrega

La entrega actual está en `artifacts/distribution/0.1.15/`. El nombre público
`KarmaHouse.apk` coincide con el botón de la web. `KarmaHouse.apk.sha256` permite
comprobar su integridad. `INSTALACION.txt` explica cómo instalarlo y responder a
los avisos. Las notas de release y la evidencia de verificación local quedan en
el mismo directorio. La carpeta 0.1.14 se conserva como preparación histórica;
la candidata actual es 0.1.15.

La copia preparada se volvió a comprobar con SHA-256 y coincide con el original.
Los cambios de texto de la web se revisaron en el navegador local a 390 y 1280
píxeles. También se comprobó la apertura de la nueva pregunta sobre los avisos
a 320 píxeles: los elementos de las secciones modificadas no desbordan el ancho
del navegador. La comprobación posterior de la app en el teléfono se detalla
arriba.

La revisión independiente de los cambios de seguridad no encontró incidencias
críticas o importantes. Señaló una entrada residual del lockfile, que se retiró.
La validación de instalación del lockfile final con `npm ci --dry-run` pasó.
Los otros cambios de producto que ya existían en el espacio de trabajo quedan
fuera de esta revisión; el APK incorpora el estado local usado en la compilación.
En el seguimiento solicitado se guardó el código fuente usado por el APK en
`codex/android-distribution-0.1.15`, commit
`5d52ad04b39c645c5238c76eb0eb3f1f8679697c`, y se publicó esa rama en GitHub.
Este snapshot incluye el estado local de la app y las pruebas que se compilaron.
La actualización de la web se publicó en un commit separado sobre `main`, con
un único archivo cambiado. Se usaron índices temporales de Git: la rama, los
cambios locales y el índice originales permanecen disponibles para continuar
el trabajo previo.

### Preparación obligatoria para futuras entregas

`scripts/prepare-android-distribution.ps1` exige la huella oficial antes de
crear los archivos de distribución. También exige que el APK coincida con la
versión, el código Android y el paquete actuales de `app.json`, y ejecuta las
comprobaciones existentes del bundle, secretos y arquitecturas. Compara el hash
antes y después de verificar y después de copiar. El directorio de destino debe
estar libre; el script no sustituye una entrega ya preparada.

Se ejecutó un control con el APK de pruebas 0.1.5: el script rechazó su firma y
no creó el directorio de distribución 0.1.15.
También rechazó el APK oficial 0.1.14 por su versión anterior, sin modificar
la entrega 0.1.15 ya preparada.

```powershell
./scripts/prepare-android-distribution.ps1 `
  -ApkPath artifacts/releases/KarmaHouse-0.1.15.apk
```

El script genera el APK con nombre público estable, SHA-256, instrucciones,
notas de entrega y el registro de comprobación local. El registro local no es
necesario como archivo público. Se mantiene el verificador de previews separado
para poder comprobar builds de desarrollo sin tratarlas como entregas públicas.

La carpeta temporal `artifacts/distribution-audit/clean-install` permanece en el
disco: la revisión automática bloqueó su eliminación por política. Los logs y
los archivos de distribución se conservaron.

Antes de publicar una entrega nueva:

1. Compilar con la clave privada existente usando el parámetro `-Release`.
2. Verificar paquete, versión, firma y secretos con la huella fijada abajo.
3. Revisar los permisos del APK y los avisos de sus dependencias.
4. Probar instalación nueva desde el navegador y el análisis solicitado por
   Play Protect en un teléfono. Para 0.1.15, la actualización por ADB ya está
   comprobada; el flujo desde navegador sigue pendiente. El resultado pertenece
   a esa versión y dispositivo.
5. Publicar una release no marcada como prerelease con `KarmaHouse.apk`,
   `KarmaHouse.apk.sha256` e instrucciones; comprobar la descarga sin sesión y
   comparar el hash del archivo servido antes de anunciarla.

Para habilitar el botón actual se necesita publicar en
[Releases de KarmaHouse](https://github.com/ArtStyles/karma-house/releases) una
entrega estable que incluya exactamente `KarmaHouse.apk`,
`KarmaHouse.apk.sha256` e `INSTALACION.txt`. Una entrega draft o prerelease no
resuelve el enlace `/releases/latest/download/`. Las notas están preparadas en
`NOTAS-RELEASE.txt`. Antes de asociar un tag a la entrega, hay que conservar y
revisar los cambios fuente que contiene el APK; el estado local actual incluye
trabajo previo sin commit. Después se despliega el texto corregido de `web/`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-android-preview.ps1 `
  -ApkPath artifacts/releases/KarmaHouse-0.1.14.apk `
  -ExpectedVersion 0.1.14 -ExpectedVersionCode 15 `
  -ExpectedCertificateSha256 1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6 `
  -SdkPath artifacts/android-sdk -BuildToolsVersion 36.0.0 `
  -JdkPath artifacts/android-tooling/jdk17/jdk-17.0.20.1+1
```

## Límite de esta revisión

No se ha obtenido una aprobación de Google, ejecutado un análisis antivirus del
APK ni probado el diálogo de Play Protect en un teléfono. La firma acredita la
integridad y continuidad de la aplicación; no certifica ausencia de malware.
Los avisos por instalación desde el navegador pueden mantenerse.

[Distribución fuera de tiendas](https://developer.android.com/distribute/marketing-tools/alternative-distribution)
y [avisos de Play Protect](https://developers.google.com/android/play-protect/warning-dev-guidance).
