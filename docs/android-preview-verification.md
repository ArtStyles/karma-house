# APK Android de prueba — 17 de septiembre de 2026

KarmaHouse 0.1.0 (código 1), paquete `com.karmahouse.app`, compilado como release para teléfonos ARM de 32 y 64 bits. Es una entrega de pruebas con la firma de desarrollo del proyecto; no se publicó en tiendas.

## Archivo entregado

- Original: `artifacts/releases/KarmaHouse-0.1.0-preview.apk`.
- Copia para transferir al teléfono: `C:/Users/ACER NITRO/Downloads/KarmaHouse-0.1.0-preview.apk`.
- Tamaño: **61 261 813 bytes — 61,26 MB / 58,42 MiB**.
- SHA-256: `ad369f97bd5d848c863e9a1537f1a62ea1160006e226cfbbd61949081a0f5045`.
- Ambos archivos tienen el mismo SHA-256 y un archivo `.apk.sha256` al lado.

## Comprobaciones realizadas

- Gradle terminó con código 0: `BUILD SUCCESSFUL in 11m 21s`; 544 tareas, 307 ejecutadas y 237 reutilizadas.
- `scripts/verify-android-preview.ps1` terminó con código 0. Confirmó paquete y versión, Android mínimo API 24 y aplicación no depurable.
- Firma APK v2 válida. SHA-256 del certificado: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Bibliotecas nativas para `arm64-v8a` y `armeabi-v7a`; bundle JavaScript/Hermes incorporado de 3 033 296 bytes.
- Configuración pública de Supabase presente. Se examinaron las 1246 entradas descomprimidas del APK sin encontrar los valores locales de la clave secreta, contraseña de base de datos ni correo de administrador. Esta comprobación es de esos valores concretos, no una auditoría general de seguridad.
- `zipalign -c -P 16 -v 4` aprobó la alineación del archivo.
- El manifiesto incorpora el esquema `karmahouse` y acceso a Internet; no solicita cámara ni micrófono.
- La copia en Descargas se comprobó contra el hash del original.

Evidencia local ignorada por Git: `artifacts/android-build-no-spaces-2.log` y `artifacts/android-apk-verification.log`.

## Herramientas y reproducción

Expo SDK 57, React Native 0.86.3, Java 17.0.20.1, Gradle 9.3.1, SDK Android 36, Build Tools 36.0.0, NDK 27.1.12297006 y CMake 3.22.1.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android-preview.ps1
powershell -ExecutionPolicy Bypass -File scripts/verify-android-preview.ps1 -ApkPath artifacts/releases/KarmaHouse-0.1.0-preview.apk
```

El script usa la copia del SDK en `artifacts/android-sdk`, una ruta sin espacios, y Java 17 instalado en `artifacts/android-tooling/jdk17`. La ruta anterior abreviaba `clang++.exe` como `CLANG_~1.EXE`, omitiendo el enlace automático de C++ con los argumentos de esta compilación. La copia local resolvió el fallo y conservó el SDK original. La ruta temporal de sockets de Java también se fija dentro del workspace para evitar la redirección de Windows.

## Instalación y límite de la verificación

Copia el APK al teléfono y ábrelo desde Archivos. Autoriza a esa aplicación a instalar APK si Android lo solicita. No necesita Expo Go, Metro ni el PC encendido; las cuentas, anuncios y fotos de Supabase necesitan Internet. Para futuras actualizaciones conserva la firma e instala encima de la versión anterior, sin desinstalar, para mantener los borradores locales.

`adb devices -l` no detectó dispositivos. **No se ha probado esta instalación en un teléfono físico.** Queda comprobar allí el arranque, navegación, registro y enlaces de correo, galería, publicación y persistencia al cerrar y abrir. El chat y los mapas siguen fuera de esta entrega; la entrega real de correos requiere la verificación de SMTP documentada en [cloud-verification.md](cloud-verification.md).
