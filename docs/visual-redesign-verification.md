# Verificación del rediseño visual 0.1.24

11–12 de octubre de 2026, hora de Cuba. Rama local `codex/visual-redesign`; código de aplicación `dbbe501`, base `ce85678`. Diseño y decisiones en [la revisión visual](visual-design-review.md).

## Implementación

- Navegación clásica sólida, integrada al borde inferior; el navegador reserva su altura y la oculta con el teclado.
- Explorar delimita las publicaciones con una línea fina del color de borde del tema, entre tarjetas móviles o filas de la cuadrícula. Conserva el espacio de lectura existente y no añade una línea al principio/final de la lista.
- Favoritos vacío con explicación directa y acceso a Explorar. Retirar y Deshacer conservan la posición del corazón y el comportamiento optimista existente.
- Publicar guiado por Venta, Permuta, Alquiler o Búsqueda. Conserva formulario al visitar ayuda/opciones y borradores por cuenta; una operación ya guardada prevalece sobre una nueva entrada.
- Pegar anuncio completa solo vacíos, conserva datos/fotos/identidad de reintento, rechaza una operación explícita diferente y permite recuperar el borrador anterior con Deshacer importación.
- Mi espacio usa identidad breve, listas de Actividad/Viviendas/Gestión según los permisos existentes, contadores reales, ahorro de datos y un único Ajustes.
- Ficha prioriza foto, precio, ubicación y características; la hoja de contacto muestra la vivienda y la disponibilidad. Mantiene revalidación de responsable/inmobiliaria y retorno de acceso. Cerrar o perder foco invalida navegación y errores tardíos; no revierte una operación que el servidor ya haya realizado.

## Pruebas automáticas y revisión

`npm run check`: **729 pruebas, 725 correctas, 4 omitidas, 0 fallos**; TypeScript sin errores. Resultado final registrado en `.superpowers/sdd/2026-10-11-visual-redesign/check-delivery.log`.

Se añadieron pruebas de operaciones, retorno estricto de autenticación, conservación de borrador/fotos, importación y foco. La función TSX real de la ficha se ejecuta con dependencias locales y promesas diferidas para verificar acceso de invitado, cierre durante revalidación, cierre durante apertura, error de inmobiliaria y pérdida de foco. Esta simulación no crea conversaciones reales ni prueba el transporte de Supabase.

La revisión independiente de `ce85678..baa4a1f` detectó pérdida de borrador al importar, hoja sobre el acceso de invitados y continuación tardía tras cerrar. Los tres hallazgos se corrigieron. La revisión del texto ampliado/teclado Android se reservó para el teléfono.

## Navegador

Exportación web de producción: `npx expo export --platform web --output-dir artifacts/visual-redesign/web`, exit 0. Vista local en `http://127.0.0.1:8129/`, modo demostración sin configuración Supabase.

Se observaron las cuatro pestañas, Favoritos vacío, los cuatro recorridos guiados hasta Paso 1, opciones/ayuda sin enviar correo, ficha y contacto demo. El título permanece al volver a opciones y cancelar importación. Un texto incompatible deja la hoja abierta con aviso; uno compatible completa zona/provincia y conserva título. Deshacer devuelve el título original y la zona vacía.

En la comprobación del corazón, las coordenadas fueron x=318.40/y=103.60 antes y después de retirar; Deshacer devuelve el favorito. Se observaron tamaños de 390×844 y 320×740, ancho de documento igual al de ventana y barra en su área reservada. Claro/Oscuro/Sistema se comprobaron y se restauró Sistema; el interruptor de ahorro de datos cambió false→true→false.

Las capturas de la app se guardan en `artifacts/visual-redesign/`: `favoritos-final.png`, `publicar-final.png`, `mi-espacio-claro.png`, `mi-espacio-oscuro.png`, `ficha.png` y `contacto.png`. Los dos últimos se capturaron en la app de desarrollo; los demás en la exportación. No son bocetos.

El registro capturado de la exportación 8129 no mostró errores/avisos. El historial de desarrollo 8128 conserva avisos de dependencias y dos avisos de nodo vacío de la hoja de importación durante edición, corregidos con `Boolean(error)` antes de exportar.

## Android y límites de entrega

Compilación firmada **aprobada**, incluyendo el divisor solicitado después de la primera revisión y la eliminación del texto duplicado de inmobiliaria en Mi espacio. El ensamblado Android ejecutó `:app:createBundleReleaseJsAndAssets`, `assembleRelease` y `bundleRelease`; los APK/AAB se generaron correctamente. No se cambiaron dependencias ni servicios.

| Comprobación de APK | Resultado |
| --- | --- |
| Paquete | `com.karmahouse.karmahouse` |
| Versión / code | `0.1.24` / `25` |
| minSdk / targetSdk | `24` / `36` |
| Arquitecturas | `arm64-v8a`, `armeabi-v7a` |
| Depurable | No |
| Firma | APK v2 válida; certificado existente |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |
| APK SHA-256 | `afee1b2e641d1324fabde2741fb9e25838f5de908d23b65c33291f0d72f93cce` |
| Tamaño | `85154467` bytes (81.21 MiB) |
| Contenido | Configuración pública presente; 1386 entradas sin los valores privados de referencia ni marcadores PEM/JSON de servicio |
| Alineación | ZIP de 16 KB aprobada; la verificación no analiza alineación ELF de las bibliotecas |

Verificación final con `scripts/verify-android-preview.ps1` y referencias privadas de `D:/work/karma-house/infra/.env.local`, utilizadas únicamente para detectar filtraciones. El registro no expone sus valores. Archivo final: `D:/work/karma-house/artifacts/releases/KarmaHouse-0.1.24.apk`; copia y comprobación local en `artifacts/distribution/0.1.24/`. No se publicó una release remota.

La fuente Android se prepara desde el commit indicado en `D:/work/karma-house/artifacts/v24`, con dependencias verificadas copiadas del worktree y herramientas Android existentes. El primer intento encontró dependencias incompletas en el checkout principal; se aisló la compilación para preservar la rama `web-redesign`, su índice y todos sus cambios en curso. No se modifican main ni la rama de web y no se publica una release remota.

## Teléfono físico

Pixel 7 Pro autorizado por USB, Android **17 / API 37**, resolución 1440×3120 y escala de fuente existente **1.15**. `adb install -r` devolvió Success; la instalación final indica 0.1.24/25, actualización del 12 de octubre a las 00:12:58 y primera instalación conservada del 24 de septiembre. La cuenta sigue autenticada y Mi espacio mantiene 64 anuncios y 0 favoritos.

Se observaron:

- Explorar con fotos reales, corazón visible y divisor fino entre tarjetas; barra de cuatro pestañas integrada con área segura.
- Favoritos vacío, texto directo y acción Ir a Explorar.
- Publicar guiado con las cuatro opciones visibles; entrada a Alquiler directamente en Paso 1. El teclado muestra el campo y oculta la barra; al cerrarlo la barra regresa. Volver a opciones conserva la operación y ofrece Continuar anuncio. Pegar anuncio muestra la regla de preservar vacíos/fotos y Cancelar conserva el formulario. No se escribió contenido ni se guardó un anuncio.
- Mi espacio con gestión de la cuenta existente, contadores reales y un único Ajustes. La etiqueta de inmobiliaria principal aparece una vez después del ajuste final.
- Ficha de una vivienda propia: foto protagonista, precio, características, miniaturas, siguiente foto y acción Editar persistente. El corazón pasó de Guardar a Quitar y volvió a Guardar; se confirmó el retorno a 0 favoritos.
- Apariencia Claro y Sistema con sistema oscuro; se restauró **Sistema**. Ahorro de datos false→true→false, conservando el estado original. El registro capturado de AndroidRuntime/ReactNativeJS del proceso final no mostró errores.

Capturas físicas en `D:/work/karma-house/artifacts/visual-redesign/phone/`; `home-final.png` y `mi-espacio-final.png` pertenecen al APK definitivo. Las capturas de Publicar, teclado, ficha y favoritos corresponden al mismo rediseño antes de la última eliminación de una etiqueta repetida.

La muestra física de ficha era un anuncio propio, por lo que mostraba **Editar anuncio**. La hoja para contactar a otro usuario y sus respuestas tardías se verificaron en demo/navegador y pruebas con dependencias locales; no se presentan como una conversación física comprobada. No se enviaron mensajes, correos ni publicaciones. Cuentas suspendidas, otros roles y fallos de transporte tampoco se presentan como recorridos físicos verificados.
