# Verificación de la primera entrega

Fecha: 16 de septiembre de 2026. Alcance: demo local de KarmaHouse para explorar y gestionar anuncios ficticios, sin backend ni publicación pública.

## Código y exportaciones

| Comprobación | Resultado confirmado |
| --- | --- |
| `npm run check` | TypeScript sin errores y 18/18 pruebas correctas, según la última ejecución del controlador. |
| `npx expo install --check` | Dependencias compatibles; comprobación correcta. |
| Exportación Expo Android | Bundle JavaScript/Hermes generado correctamente. |
| Exportación Expo iOS | Bundle JavaScript/Hermes generado correctamente. |
| Exportación Expo web | Exportación generada correctamente. |
| Expo Doctor | 21/21 comprobaciones correctas. La consulta a React Native Directory se resolvió al reintentar. |
| `npm audit` | 13 avisos moderados, ninguno alto ni crítico. No se aplicó una degradación forzada de dependencias. |

Las exportaciones son paquetes de código y recursos: no generan APK/IPA ni prueban la ejecución nativa en dispositivos. No se ha realizado instalación física, firma, compilación de distribución, envío a EAS ni publicación en tiendas.

## Pruebas de comportamiento y revisión independiente

La suite cubre búsqueda sin distinción de mayúsculas y tildes, filtros combinados, exclusión de anuncios inactivos, validación de precios y medidas, edición con identidad estable, imágenes locales, recuperación de esquemas corruptos, hidratación, serialización y recuperación de escrituras fallidas.

La revisión independiente identificó dos fallos y comprobó sus correcciones: quitar una foto conservaba la anterior, y la recuperación permitía identificadores repetidos. Se verificó con una ejecución focalizada del controlador que quitar la foto persiste después de guardar y rehidratar, que reemplazarla funciona, y que se conservan registros únicos al normalizar identificadores repetidos. Las regresiones específicas de eliminación de foto y colisión con anuncios demo también pasaron. No quedan hallazgos importantes abiertos en esos cambios.

## Recorrido web móvil

El controlador probó la interfaz a 390 × 844 px. Son comprobaciones de navegador sobre componentes React Native Web, no pruebas Android/iOS.

| Recorrido | Resultado |
| --- | --- |
| Buscar una vivienda por «Brisa» | Confirmado en la interfaz. La equivalencia entre tildes y mayúsculas está cubierta en dominio. |
| Guardar favorito y recargar | El favorito permanece guardado. |
| Abrir detalle y contactar | Se muestra el aviso de demostración y no se envía ningún mensaje. |
| Continuar con campos obligatorios vacíos | Se muestran errores junto a los campos. |
| Crear anuncio con foto seleccionada | Guardado local correcto. |
| Recargar después de publicar | Anuncio y foto web permanecen guardados. |
| Editar título y precio, quitar foto | Cambios comprobados en el recorrido móvil. |
| Pausar anuncio | Cambio a pausa comprobado. |
| Volver después de guardar edición | Corregida la duplicación del historial mediante `dismissTo`; una pulsación vuelve a Mi espacio. |
| Crear otro anuncio sin recargar | El formulario inicia vacío en el paso 1 inmediatamente después de guardar el anterior. |
| Reactivar anuncio | Recupera el estado activo. |
| Marcar vendido y recargar | La confirmación guarda el estado vendido y lo conserva tras recargar. |
| Excluir anuncios inactivos | Tras vender uno y pausar el segundo, Explorar contiene únicamente las cuatro viviendas demo. |
| Combinar tipo, precio y habitaciones | Apartamentos, máximo 90 000 USD y mínimo 2 habitaciones devuelve únicamente Brisa. |
| Estado vacío y limpieza | Reducir el máximo a 80 000 USD devuelve cero resultados; limpiar restaura las cuatro viviendas demo. |

## Revisión visual de escritorio e imágenes

Se revisó una captura completa a 1200 × 900 px. El catálogo presenta tres columnas y el DOM confirmó ausencia de desbordamiento horizontal (`scrollWidth = innerWidth = 1200`).

La revisión detectó una imagen web con dimensiones intrínsecas de 1536 × 1024 dentro de una tarjeta de 360 × 230. Se corrigió `PropertyImage` para ocupar explícitamente el 100 % del contenedor. El DOM confirmó 360 × 230 y la captura final mostró la foto ajustada correctamente. La revisión independiente de este cambio y del retorno mediante `dismissTo` no encontró problemas adicionales.

TypeScript y las exportaciones de Android, iOS y web volvieron a completarse correctamente después del último ajuste de tamaño de imagen. La consola del recorrido web no registró errores. La vista previa local quedó disponible en el panel de Codex.

## Límites de la entrega

Los favoritos, anuncios y fotografías pertenecen únicamente al almacenamiento local. Las fotos nativas se copian a Documents por código, pero la selección, permisos y persistencia física en Android/iOS todavía requieren pruebas en teléfono. Las fotos web usan data URI y están sujetas a la cuota del navegador. Un error de almacenamiento se muestra y no confirma un guardado que haya fallado.

Los comandos de arranque, requisitos y límites de Expo Go y development builds están en [README.md](../README.md). La especificación aprobada se conserva en [el diseño de la entrega](superpowers/specs/2026-09-16-karmahouse-foundation-design.md).
