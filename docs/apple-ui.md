# KarmaHouse: interfaz inspirada en aplicaciones de Apple

16 de septiembre de 2026. Rediseño de las pantallas existentes, con React Native y Expo.

## Referencias profesionales

| Referencia oficial | Aplicación en KarmaHouse |
| --- | --- |
| [Apple HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | Tipografía del sistema, títulos claros y jerarquía consistente. Se elimina la combinación de serif e itálica. |
| [Apple HIG — Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Transparencia reservada a navegación y controles; tarjetas de contenido blancas para mantener legibilidad. |
| [Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Cuatro destinos estables, iconos con texto y selección visible. |
| [Landmarks: Building an app with Liquid Glass](https://developer.apple.com/documentation/SwiftUI/Landmarks-Building-an-app-with-Liquid-Glass) | Referencia de fotografías protagonistas, controles sobre imágenes y separación entre contenido y navegación. |
| [Expo 57 — BlurView](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/) | Implementación del material de navegación compatible con la base Expo existente. |

La dirección seleccionada combina fondos neutros, superficies agrupadas, azul para las acciones y fotografía amplia. Las referencias informan la jerarquía y los materiales; KarmaHouse conserva sus contenidos, marca y recorridos.

## Cambios

- Explorar: cabecera compacta, búsqueda inmediata, selector de tipos, recuento y orden, tarjetas con información más legible. La primera vivienda aparece antes.
- Navegación: barra inferior flotante, fondo desenfocado en iOS/web, selección en cápsula y margen adicional al final de las pantallas.
- Mi espacio: identidad compacta, filas agrupadas y contadores. Favoritos cuenta los anuncios activos, igual que su pantalla de destino.
- Ficha: fotografía amplia, botones sobre la imagen, características agrupadas y acción de contacto persistente. El contacto de prueba se presenta en una hoja inferior en móvil.
- Publicar/editar: progreso compacto, campos agrupados, tipografía de entrada de 17 px y nota de demostración breve. Conserva los tres pasos, validación, fotos y guardado.
- Mis anuncios: tarjetas compactas con estados y acciones de edición, pausa, reactivación y venta.

El material utiliza `expo-blur`, sin exigir una versión reciente de Liquid Glass. Android usa una superficie opaca; iOS también la utiliza si el usuario activa Reducir transparencia. Los colores secundarios se ajustaron tras revisar su contraste. Las categorías usan botones con estado pulsado, utilizables con teclado, y superficies táctiles de al menos 44 px.

## Verificación

- TypeScript y 18 pruebas de dominio/persistencia: correctos.
- Compatibilidad de dependencias y Expo Doctor: 21/21 controles correctos.
- Exportaciones de Android, iOS y web: correctas.
- Navegador: revisión visual a 390 × 844, pantalla estrecha de 320 × 740 y escritorio de 1200 × 900; sin desbordamiento horizontal detectado en las dos últimas medidas.
- Recorridos probados: filtro combinado, estado vacío y limpieza, selección de categoría mediante Espacio, favorito persistente tras recarga, detalle y aviso de contacto, navegación del perfil, edición de tres pasos con guardado y regreso, errores de publicación vacía.
- Consola del recorrido final: sin errores.

Las comprobaciones de navegador y los bundles no prueban una instalación en teléfonos. El desenfoque, áreas seguras, teclado nativo y tamaños de texto del sistema todavía requieren validación física en Android/iPhone. La aplicación continúa siendo una demo local.
