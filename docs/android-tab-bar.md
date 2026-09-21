# Barra inferior Android — 17 de septiembre de 2026

La captura enviada desde el teléfono mostró que la cápsula de navegación alcanzaba los bordes laterales, la selección quedaba demasiado cerca del contorno y la sombra oscurecía la zona del gesto del sistema.

## Causa y corrección

La implementación instalada de Expo Router añade `start: 0`, `end: 0`, padding por eje y `elevation: 8` a su barra inferior. Los estilos anteriores de KarmaHouse mezclaban `left/right` con esos límites lógicos y `padding` genérico con los valores específicos del navegador. Además, la sombra propia se sumaba a la elevación de Android.

Se corrigió `src/app/(tabs)/_layout.tsx` para usar límites `start/end`, padding explícito de 6 puntos arriba, abajo y a ambos lados, elevación cero y una única sombra suave. Conserva los cuatro destinos, las etiquetas, el tamaño de iconos, la selección azul y la ocultación con teclado. La separación inferior es el área segura más 8 puntos, con un mínimo de 16.

El margen inferior del contenido se unificó en 144 puntos, también en el formulario. El material de Android continúa siendo blanco opaco; iOS conserva la alternativa opaca cuando se solicita reducir transparencia.

Se consultó la [documentación versionada de Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) y el código del navegador instalado antes de modificarlo.

## Verificación realizada

- TypeScript: `tsc --noEmit`, código 0.
- Navegador a 320 × 740: márgenes laterales de 16 px; barra de 288 × 68 px; cada opción mide aproximadamente 64,6 × 55,2 px y mantiene su etiqueta visible.
- Navegador a 390 × 844: márgenes de 16 px; padding explícito de 6 px confirmado en el estilo calculado; opciones de aproximadamente 82,2 × 55,2 px.
- Navegador a 1200 × 900: barra centrada de 520 px de ancho, con 340 px a cada lado.
- Recorrido por Explorar, Favoritos, Publicar y Mi espacio: destino y selección correctos. Regreso a Explorar mediante teclado comprobado.
- Mi espacio a 320 px, desplazado al final: texto y botón finales accesibles por encima de la barra. Sin errores registrados en la consola del recorrido.
- Revisión independiente del cambio: coincide con las causas de geometría y sombra identificadas en la captura.

La captura original aporta evidencia del problema en Android. Las medidas anteriores son del navegador; **la corrección todavía necesita confirmación en el teléfono**, especialmente con navegación por gestos, tres botones, teclado y tamaño de fuente ampliado. No se sustituyen esas comprobaciones con una captura web.

## APK de esta corrección

- Versión 0.1.1, código Android 2; paquete `com.karmahouse.app`.
- Archivo: `artifacts/releases/KarmaHouse-0.1.1-preview.apk`.
- Copia entregada en `C:/Users/ACER NITRO/Downloads/KarmaHouse-0.1.1-preview.apk`, con su archivo `.sha256` y hash comprobado contra el original. Instalar encima de 0.1.0 sin desinstalar.
- Tamaño: 61 261 853 bytes (61,26 MB / 58,42 MiB).
- SHA-256: `640134adb7926bcda79332568e0b156470cf7eed7e36d6ca1f581c1b50770d85`.
- Compilación release terminada con código 0 en 7 min 52 s; 544 tareas.
- Registro: `artifacts/android-build-0.1.1.log` (ignorado por Git).
- Verificador del APK aprobado: firma v2 válida, aplicación no depurable, API mínima 24, bibliotecas ARM de 32/64 bits y bundle incorporado de 3 033 332 bytes. Las 1246 entradas se examinaron sin encontrar los valores privados locales de referencia; sí contiene la configuración pública de Supabase.
- El certificado SHA-256 sigue siendo `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, igual que en 0.1.0. Permite instalar esta actualización encima de la anterior.
- `zipalign -c -P 16 -v 4`: aprobado. Evidencia en `artifacts/android-apk-0.1.1-verification.log` y `artifacts/android-apk-0.1.1-zipalign.log`.
