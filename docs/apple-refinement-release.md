# Favoritos y continuación visual — 0.1.23

9 de octubre de 2026. Continuación autorizada por el usuario para corregir la respuesta del corazón y ejecutar las mejoras visuales pendientes de Apple Design.

## Cambios

- Corazón siempre visible, estado optimista compartido con contador/lista, toques rápidos conservados en orden y recuperación tras un fallo. Las lecturas de alias y los avisos de cualquier instancia respetan la intención más reciente. Hidratación compartida y aislamiento entre cuentas.
- Barra inferior conserva el navegador y sus eventos. Un indicador se desplaza entre pestañas con un resorte amortiguado; el cambio de tamaño y el movimiento reducido lo sitúan directamente.
- Blur moderado en Android 12+: un `BlurTargetView` por pantalla y referencia de la ruta activa, separado de la barra. Android anterior, destino ausente, contraste alto o transparencia reducida usan superficie sólida. Material adaptado a Claro/Oscuro/Sistema.
- Franja de las cuatro opciones conservada: indicador continuo en el hilo UI; deslizar no modifica la búsqueda y la rotación conserva la opción.
- Fotos con fundido de 180 ms después de cargar, sin cambiar el marco ni descargar imágenes ocultas por ahorro de datos. Identidad independiente por fuente, error visible y adaptación al movimiento reducido.
- Reacción discreta del corazón al guardar, sin bloquear entradas. No se añadieron sonidos, hápticos, Liquid Glass ni dependencias.

## Evidencia local

- `npm run check` sobre `main` integrado: **707 pruebas; 703 correctas, 0 fallos, 4 omitidas**; TypeScript correcto. Log: `artifacts/apple-refinement/merged-check.log`.
- 25 pruebas nuevas cubren favorito optimista antes de red/alias, escrituras rápidas y fallidas, cuenta, hidratación, lecturas viejas, errores entre instancias, selección, tamaño, movimiento reducido, fotos y ahorro de datos. Se observaron fallos antes de implementar las correcciones.
- Revisión independiente de favoritos: tres casos P2 reproducidos y corregidos; segunda revisión sin hallazgos accionables. Revisión visual: un P3 de hidratación de movimiento reducido corregido con prueba RED/GREEN.
- Exportación web Expo 57 correcta. Aplicación real DEMO comprobada en 390 × 844, 1280 × 900 y 320 × 568: navegación, selección, fotos, corazón y restauración del favorito utilizado. Consola sin errores capturados. La revisión web usa DEMO; no acredita persistencia cloud.
- Capturas locales de navegador: `artifacts/apple-refined-mobile.jpg` y `artifacts/apple-refined-desktop.jpg` en el worktree. El servidor local 8112 sirve la última exportación.
- Integración por avance directo desde `bdf491d` hasta `b9add6f`; versión 0.1.23 / código Android 24. Cambios ajenos, incluida la eliminación ya staged del skill karma-video, preservados.
- No se regeneró el proyecto Android: no cambiaron SDK, plugins ni dependencias nativas. Se sincronizaron únicamente `versionName`/`versionCode` del archivo generado, preservando sus cachés.

## Entrega Android

Compilación firmada correcta: **4 min 55 s**, 593 tareas (62 ejecutadas, 531 en caché). `prepare-android-distribution.ps1` aprobó firma, metadatos, configuración pública, búsqueda de valores privados y alineación ZIP de 16 KB. La inspección ZIP no certifica alineación ELF.

| Dato | Resultado |
| --- | --- |
| APK | `artifacts/releases/KarmaHouse-0.1.23.apk`, 85.163.807 bytes |
| Copia comprobada | `C:/Users/ACER NITRO/Downloads/KarmaHouse-0.1.23.apk` y checksum |
| SHA-256 APK | `928e656e20bb1bed9ec081740d73cdfe10ef5b1bc018451ebf4ddfe9e9c837db` |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |
| Metadatos | `com.karmahouse.karmahouse`, 0.1.23 / 24, minSdk 24, no depurable, firma v2 |
| ABI / bundle | arm64-v8a y armeabi-v7a; bundle de 5.385.696 bytes |
| AAB local | SHA-256 `186003389f08d3801aa1078cf9f1103029f428bb3de4398d898fbcf7b11f0cf7` |
| Instalación | Pixel 7 Pro conectado; `adb install -r`: Success |
| Conservación | `firstInstallTime=2026-09-24 11:30:59`; `lastUpdateTime=2026-10-09 15:58:32` |

Se lanzó la actividad actualizada y se comprobó el proceso. El log filtrado de AndroidRuntime/ReactNativeJS/Reanimated/Worklets no contiene errores capturados. Evidencia: `artifacts/apple-refinement/build.log`, `apk-verification.log`, `install.log`, `device-before.txt`, `device-after.txt` y `runtime-errors.log`.

**Prueba táctil física pendiente:** el dispositivo muestra la pantalla de bloqueo y UIAutomator solo expone SystemUI. Se solicitó desbloquearlo mediante la pregunta pendiente. No se intentó omitir su autenticación. La instalación y el proceso iniciado no verifican los toques, la persistencia real de favoritos, el material Android, la sesión visible ni la fluidez física de esta versión.

## Límites

Los tests TSX ejecutan componentes reales con adaptadores deterministas; no miden percepción, latencia física ni frames. Los fallos de red lentos se prueban con promesas suspendidas. No se publica una release remota ni se modifica el backend. El desempeño del desenfoque en otros teléfonos y la equivalencia visual iOS requieren comprobación en esos dispositivos.

Referencias consultadas: [Apple Design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md), [documentación exacta Expo 57](https://docs.expo.dev/versions/v57.0.0/), [BlurView 57](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/).
