# Continuación visual de Apple Design

Autorización: el usuario pidió continuar las mejoras visuales pendientes al terminar favoritos. Se ejecuta en la misma sesión y worktree, preservando la identidad actual y sin cambiar flujos de negocio.

## Diseño acotado

- Barra inferior: mantener el navegador, etiquetas, badges, teclado y eventos existentes. Un único fondo de selección se desplaza con resorte amortiguado desde el valor visible. Geometría basada en el ancho real, cuatro rutas y posición activa del navegador.
- Material: en Android 12+ capturar exclusivamente el contenido de cada pantalla con `BlurTargetView`, fuera de la barra. Conectar el destino de la ruta activa a una única `BlurView` de intensidad moderada. Android anterior, destino ausente, contraste alto o transparencia reducida usan superficie sólida. iOS/web conservan su material adaptado.
- Franja: conservar las cuatro tarjetas. El indicador sigue continuamente el desplazamiento; su etiqueta accesible cambia solo al cruzar de tarjeta. Girar mantiene la misma opción. Deslizar nunca aplica una operación.
- Fotos: fundido breve después de cargar, sin cambiar dimensiones, resolver URLs de nuevo ni descargar fotos ocultas por ahorro de datos. Cambiar de fotografía reinicia su propia carga/error; un callback antiguo no afecta la siguiente.
- Corazón: reacción pequeña al cambiar a guardado, además de la respuesta inmediata ya corregida. Sin retrasar la acción ni impedir nuevos toques. Movimiento reducido evita escalas y desplazamientos automáticos.

No se añaden sonidos, hápticos ni Liquid Glass: la continuación solicitada es visual y las dependencias existentes permiten estos cambios.

## Ejecución

- [ ] Pruebas fallidas de selección/rotación/movimiento reducido y de carga/error/ahorro de fotos antes de implementar.
- [ ] Implementar componentes compartidos de indicador, material y fotografía; integrar en navegación y Explorar.
- [ ] TypeScript, suite completa, revisión independiente y exportación/render móvil/escritorio.
- [ ] Integrar main local y generar una sola APK 0.1.23 con favoritos y esta continuación; verificar firma e instalar conservando datos.
- [ ] Probar favoritos, navegación, franja, fotos, ambos temas y movimiento reducido en Android; registrar limitaciones de rendimiento y de otras plataformas.

## Revisión

Cambios rápidos de pestaña no pueden bloquear eventos; cada destino de blur pertenece a su pantalla y nunca captura la barra; un cambio de tamaño no deja el indicador fuera del botón; ahorro de datos no monta la imagen oculta; una carga/error antiguo no afecta otra fotografía; preferencias de accesibilidad cambian sin remontar navegación.

Referencias: [apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md), [Expo 57 BlurView](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/). La primera fase queda concluida; esta autorización amplía su alcance a materiales, indicadores y fotografías.
