# KarmaHouse: respuesta táctil y filtros con movimiento directo

## Alcance autorizado

El usuario pidió comenzar por botones y filtros, preparar un plan, implementarlo y acompañarlo con bocetos. Esta autorización incluye ejecutar el plan en esta sesión. El resultado debe sentirse rápido, tranquilo y predecible en Expo 57 / React Native 0.86.

## Diseño

- Conservar colores, tipografía, navegación y la franja de cuatro opciones de Explorar.
- `MotionPressable` responde al apoyar el dedo con una compresión del 2 % y vuelve con un resorte sin rebote. Pulsaciones nuevas pueden redirigir el retorno. El estado deshabilitado y el movimiento reducido cancelan la transformación.
- Extender la misma respuesta a los controles de Explorar que todavía usan `Pressable`; una tarjeta de vivienda utiliza una compresión del 0.5 % para mantener estable su fotografía.
- Los filtros móviles entran desde abajo. Una zona de agarre independiente permite arrastrar; el formulario conserva su desplazamiento vertical. La salida por gesto puede retomarse durante el movimiento.
- El cierre depende de distancia y velocidad. Una reversión clara hacia arriba devuelve el panel. El retorno conserva la velocidad del gesto y no rebota.
- Cerrar, tocar el fondo y arrastrar descartan el borrador. Solo «Aplicar filtros» cambia el catálogo, exactamente una vez. La confirmación explícita de aplicar se completa aunque llegue otra pulsación.
- Atrás con el teclado visible cierra primero el teclado. Cerrar explícitamente también oculta el teclado. El panel mantiene sus márgenes de seguridad y pie de acciones visible.
- En pantallas de al menos 700 puntos, usar un diálogo centrado con fundido y sin arrastre. Con movimiento reducido, conservar controles y fundidos cortos, omitir desplazamientos automáticos y compresión.
- No añadir desenfoque, hápticos, sonidos, dependencias, descargas adicionales ni cambios de negocio en esta primera fase.

## Componentes y verificación

`FilterSheet` contiene el modal, el fondo, la zona de agarre, el movimiento y el cierre. `CatalogFilters` conserva campos, validación y borrador. Funciones pequeñas de geometría y una puerta de cierre impiden aplicaciones duplicadas y callbacks antiguos.

La verificación incluye pruebas de distancia/velocidad, interrupción y cierre único; ejecución de los componentes TSX con stubs para estados y callbacks (no se presenta como evidencia física); typecheck; exportación Expo; y revisión de la interfaz real en navegador móvil/escritorio. La sensación, el teclado Android y el botón Atrás físico se marcarán como pendientes si no se prueban en un dispositivo.

El boceto interactivo representa los botones y los filtros. Se identifica como boceto y no como captura de la aplicación instalada.

## Base y límites

Base: `2435e2d`, versión 0.1.21. La base tiene 662 pruebas: 655 pasan, 3 fallan y 4 se omiten. Los fallos repetibles son las tres variantes «actual chat preserves 60 loaded messages and proposal/message attempts after transient …» de `tests/agency-refresh-recovery.test.ts` (control «Reintentar propuesta» ausente). Son previos a esta fase; no cambiar mensajería para ocultarlos.

Trabajar en `codex/apple-interactions`, preservando los cambios ajenos del checkout principal. Entrega local; publicación, APK e integración al principal requieren un alcance posterior.
