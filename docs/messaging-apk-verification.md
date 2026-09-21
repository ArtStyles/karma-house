# APK de mensajería — KarmaHouse 0.1.3

Verificado el 18 de septiembre de 2026. El APK incorpora el código de mensajería y el módulo nativo `expo-crypto`, con el mismo identificador y certificado que las versiones de prueba anteriores.

| Dato | Resultado |
| --- | --- |
| Paquete | `com.karmahouse.app` |
| Versión | `0.1.3` (`versionCode: 4`) |
| Android mínimo | API 24, Android 7 |
| Arquitecturas | `arm64-v8a`, `armeabi-v7a` |
| Tamaño | 81.693.454 bytes; 81,69 MB; 77,91 MiB |
| Depurable | No |
| Firma APK v2 | Válida |
| SHA-256 del APK | `2dea49fafe825cdbf467e9538de854698ec2f78a23885739e2ae826c2a51ad60` |
| SHA-256 del certificado | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |

## Compilación y comprobaciones

- Leída la referencia exacta de [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), como indica `AGENTS.md`.
- Ejecutado `expo prebuild --platform android --no-install` con el Node incluido en el entorno. El proyecto Android generado declara la versión `0.1.3 (4)`.
- Ejecutado `scripts/build-android-preview.ps1` con el JDK 17 y Android SDK ya disponibles en `artifacts`; la ruta del SDK no contiene espacios. Se añadió `-Djava.net.preferIPv4Stack=true` al entorno de Java. No se reinstalaron herramientas.
- Gradle terminó con código 0: `BUILD SUCCESSFUL in 6m 14s`, 583 tareas, 555 ejecutadas y 28 actualizadas.
- Metro empaquetó 1.495 módulos. El APK contiene `assets/index.android.bundle`, de 3.287.768 bytes.
- `scripts/verify-android-preview.ps1 -ExpectedVersion 0.1.3` aprobó firma, identificador, versión, Android mínimo, ambas arquitecturas y ausencia de la marca `debuggable`. Se comprobó además `versionCode: 4` y la coincidencia del certificado con las versiones anteriores.
- El bundle contiene la URL y clave pública de Supabase configuradas. Se examinaron las 1.307 entradas descomprimidas del APK y no se encontraron los tres valores privados de referencia de la configuración local, en UTF-8 ni UTF-16 LE/BE. Esta comprobación se limita a esos valores conocidos.
- `zipalign -c -P 16 -v 4` terminó con código 0 y `Verification successful`.
- Ambas arquitecturas contienen `libmaplibre.so`. Los archivos DEX contienen la clase nativa `expo.modules.crypto.CryptoModule`; el autolinking generado registra `CryptoModule` y `AesCryptoModule`.
- El APK y su archivo `.sha256` se copiaron a Descargas sin sobrescribir archivos. El SHA-256 de la copia coincide y el contenido del archivo de checksum es idéntico al original.

## Archivos de entrega y evidencia

- APK: `D:\work\karma-house\artifacts\releases\KarmaHouse-0.1.3-preview.apk`.
- Copia para instalar: `C:\Users\ACER NITRO\Downloads\KarmaHouse-0.1.3-preview.apk`.
- Checksum de la copia: `C:\Users\ACER NITRO\Downloads\KarmaHouse-0.1.3-preview.apk.sha256`.
- Reporte estructurado: `artifacts/android-preview-0.1.3-verification.json`.
- Prebuild: `artifacts/android-prebuild-0.1.3.log`.
- Compilación: `artifacts/android-build-0.1.3.log`.
- Verificador: `artifacts/android-apk-0.1.3-verification.log`.
- Alineación: `artifacts/android-apk-0.1.3-zipalign.log`.

## Alcance de esta evidencia

Estas comprobaciones validan el artefacto Android y su contenido. No se instaló ni ejecutó este APK en un teléfono físico durante esta preparación. Queda pendiente comprobar en el dispositivo la actualización sobre la versión anterior, el envío y recepción de mensajes, la reapertura del chat y su comportamiento al perder y recuperar la conexión. Las pruebas de aplicación, navegador y Supabase se documentan por separado; la compilación no las sustituye.
