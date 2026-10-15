# Barra lateral, avatar de cuenta y Android 0.1.27 — 14 de octubre de 2026

## Cambio

- En pantallas anchas (desde `layout.wideMinWidth`, 1024 px) la navegación es `src/components/SideRail.tsx`, montada en `src/app/_layout.tsx` fuera de la pila. Reúne Explorar, Favoritos, Publicar, Notificaciones y Mensajes (con no leídos) y deja Mi espacio al pie, tras una línea. Se queda visible en esas secciones y en los chats (`/messages/[id]`); el resto de pantallas usa todo el ancho, como antes.
- Cada destino de la barra vuelve primero a las pestañas (`dismissAll`) y después navega, así moverse por la barra no apila pantallas.
- Mi espacio muestra la foto de la cuenta o sus iniciales con sesión iniciada (`UserAvatar`), en la barra lateral y en la barra inferior del móvil. Sin sesión, el icono de persona.
- En pantallas anchas, la cabecera de Explorar (logo con nombre, campana y mensajes) desaparece; el símbolo del logo queda a la izquierda del buscador. `BrandMark` lo pinta azul en fondo claro y blanco en fondo oscuro, como pide BRAND.md; en el móvil, el logo con nombre también pasa a blanco en modo oscuro.
- Commit `28693b9` (`feat(nav): persistent side rail with inboxes and account avatar`).

## Verificación

- `tsc --noEmit`: correcto.
- Navegador a 1040 × 640 y 1440 × 900, claro y oscuro: seis entradas en la barra, sin elementos enfocables anidados, `aria-selected` correcto. Notificaciones → Mensajes → Explorar → Mi espacio: la barra se mantiene y el historial no crece. Logo blanco en oscuro y azul en claro. Sin errores en consola.
- Móvil a 375 × 812: cuatro pestañas abajo, campana y mensajes en la cabecera, sin desbordamiento horizontal.
- `npm test`: fallan 2 pruebas del verificador del APK y de la distribución (referencia privada), ajenas a estos archivos.
- **Sin comprobar:** foto o iniciales con una cuenta real, porque no se inició sesión.

## Android 0.1.27

| Dato | Resultado |
| --- | --- |
| Fuente | `f53b376f2cb7a97c20cc7c49a14f7c4ed3abc275` (`release: prepare Android 0.1.27 with the account avatar`) |
| Paquete / versión / código | `com.karmahouse.karmahouse` / `0.1.27` / `28` |
| APK | `KarmaHouse.apk`, 85.235.451 bytes (81,29 MiB) |
| APK SHA-256 | `be6f0d1c201432a13c7a5843e4fd484d4ceb403e2eeb9d42261cb19cc678f596` |
| AAB SHA-256 (local) | `bbdd9b8204c14347fe2ad6912f0b144ba3b73ecf8191ef810eceae4f4ebd07f8` |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6`, el mismo de las versiones anteriores |
| Firma / Android / ABI | v2 correcta, no depurable, minSdk 24 (Android 7), arm64-v8a y armeabi-v7a |
| Secretos | 1386 entradas sin los valores privados de `infra/.env.local` ni marcadores PEM o credenciales JSON |
| Alineación | ZIP de 16 KB correcta; no evalúa la alineación ELF |
| JavaScript | El bundle contiene la expresión de rutas de `SideRail` y «Foto de tu cuenta» |

- Compilado en el entorno aislado `artifacts/v24` con la fuente de `f53b376` extraída por `git archive`: 1038 archivos idénticos al commit (sin contar finales de línea). `versionCode`/`versionName` del proyecto nativo de `v24` actualizados a mano a 28 / 0.1.27 (las dependencias nativas no cambiaron desde la 0.1.26). `build-android-preview.ps1 -Release -RefreshBundleCache` con `-SdkPath artifacts\android-sdk` (la ruta por defecto tiene un espacio): correcto en 3 min 6 s. `prepare-android-distribution.ps1` necesita `-PrivateConfigurationPath infra\.env.local` de la raíz. Logs en `artifacts/v24/artifacts/android-build-0.1.27.log` y `distribution-0.1.27.log`; entrega en `artifacts/distribution/0.1.27/`.
- En PowerShell 5.1, redirigir la salida del script con `*>&1` convierte el stderr de Gradle en error; lanzarlo con `powershell -File … > log 2>&1`.
- Sin instalación en teléfono en esta entrega: falta probar la actualización sobre 0.1.26 y el análisis de Play Protect en un dispositivo.
