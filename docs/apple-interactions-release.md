# Botones y filtros: entrega Android 0.1.22

9 de octubre de 2026. El usuario autorizó continuar con «hazlo» después de la entrega local y conectó el Pixel 7 Pro para comprobar la actualización.

## Integración y pruebas

- Avance directo de `main` desde `2435e2d` hasta `c4a320c`, con los botones y filtros revisados, sin conflicto.
- Versión de aplicación, package y lockfile: **0.1.22**, Android **versionCode 23**.
- `npm run check` ejecutado sobre el resultado integrado: **682 pruebas, 678 correctas, 0 fallos y 4 omitidas**; TypeScript correcto. Log local: `artifacts/apple-merged-check.log`.
- Se corrigió el reloj del fixture de recuperación de propuestas en `7610c40`. La visita ficticia del 9 de octubre a las 10:00 pasó al pasado y era rechazada antes del envío fallido; ahora el validador real recibe el reloj fijo del 8 de octubre. Se comprueba explícitamente que la propuesta llega al límite de red antes de probar su recuperación. No se cambió la regla que exige visitas futuras.
- Los cambios ajenos de `.claude/skills/karma-video`, `CLAUDE.md`, `BRAND.md` y `docs/android-distribution-verification.md` se preservaron.

## Empaquetado y teléfono

Compilación firmada `scripts/build-android-preview.ps1 -Release`: **BUILD SUCCESSFUL in 6m 53s**, 593 tareas. `scripts/prepare-android-distribution.ps1` verificó y preparó la APK.

| Dato | Resultado |
| --- | --- |
| APK | `artifacts/releases/KarmaHouse-0.1.22.apk` |
| Copia comprobada | `C:/Users/ACER NITRO/Downloads/KarmaHouse-0.1.22.apk` y checksum adyacente |
| Tamaño | 85.152.075 bytes |
| SHA-256 APK | `e57c305e9b3d2a5a10935ea3121d1c45666642dff5112f5c77926bd0da9dbb97` |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |
| Metadatos | `com.karmahouse.karmahouse`, 0.1.22 / 23, minSdk 24, no depurable, firma v2 |
| Arquitecturas | arm64-v8a y armeabi-v7a |
| Bundle incorporado | 5.373.960 bytes, con la configuración pública esperada |
| Inspección | 1.386 entradas descomprimidas sin los valores privados de referencia ni marcadores PEM/JSON de servicio; alineación ZIP de 16 KB correcta. No equivale a verificar la alineación de cada ELF. |
| Instalación | Pixel 7 Pro, Android 17; `adb install -r` devolvió `Success` |
| Datos | Primera instalación conservada: 24 de septiembre de 2026, 11:30:59; sesión administrativa disponible después de actualizar, sin introducir credenciales |

Se generó también el AAB local: `artifacts/releases/KarmaHouse-0.1.22.aab`, SHA-256 `e6fb3fbe4538cb04e6ed039389052a422a9a001690ce3d80f431be979e4be154`.

## Pruebas en el Android real

Acciones enviadas por ADB y verificadas con la jerarquía nativa y capturas del teléfono; no son un navegador ni un backend simulado.

- Seleccionar Alquiler y cancelar mantiene Venta y permuta en el catálogo. Aplicar cambia explícitamente la operación a Alquiler.
- Mínimo 200 / máximo 100 muestra el error y deshabilita Aplicar, también con el teclado visible. El pie de acciones queda sobre el teclado.
- Primer Atrás: teclado oculto (`mInputShown=false`), panel conservado. Segundo Atrás: panel cerrado y borrador descartado; Alquiler sigue confirmado.
- Arrastre del agarre de 300 px en 900 ms: panel vuelve a sus coordenadas iniciales. Arrastre de 905 px en 500 ms: panel cierra sin cambiar el catálogo.
- Desplazar el formulario muestra habitaciones, baños y superficie; las coordenadas de la cabecera y Aplicar se conservan.
- El botón animado de ordenar abre su menú nativo y permite seleccionar y cerrar. Se restableció Más recientes.
- Se limpiaron y aplicaron los filtros de prueba, conservando la búsqueda inicial. Sesión administrativa comprobada desde Mi espacio, sin cerrar sesión ni realizar operaciones de administración.
- Sin coincidencias de `FATAL EXCEPTION`, `JavascriptException`, `TypeError`, `ReanimatedError` o `WorkletsError` en los canales de error consultados del proceso durante esta comprobación.
- Panel final abierto en modo oscuro, con Aplicar habilitado y dentro del área visible: y=2845–3001 en pantalla de 1440 × 3120. Apariencia previa conservada.

Capturas y evidencias locales ignoradas por Git en `artifacts/apple-release`: `build.log`, `apk-verification.log`, `install.log`, `device-before.txt`, `device-after.txt`, los XML de cada paso y `runtime-errors.log`. Capturas principales: `phone-filters-final.png` y `phone-keyboard-invalid.png`.

La retoma de un cierre y las carreras entre los hilos se comprobaron mediante las pruebas deterministas de componentes. No se afirma una medición nativa de frames, una evaluación humana del tacto, una prueba TalkBack o equivalencia perceptiva con iOS. El teléfono se dejó con el panel abierto para la valoración directa del usuario.

No se ha publicado esta continuación en GitHub Releases, Vercel o el backend. El boceto y la primera comprobación web permanecen en [apple-interactions-verification.md](apple-interactions-verification.md).
