# Selector de orden del catálogo

Se sustituyó la apertura del filtro completo desde «Más recientes» por un menú
compacto anclado al control. Ofrece Más recientes, Menor precio, Mayor precio y
Mayor superficie, con una marca en la opción elegida. Elegir cierra el menú y
modifica únicamente `filters.sort`; búsqueda y filtros se conservan. El botón de
filtros junto al buscador mantiene el formulario completo.

`CatalogSortMenu` usa el cierre de Modal para Atrás en Android, Escape en web y
un fondo que permite cerrar tocando fuera. Permanece deshabilitado cuando el
catálogo muestra la copia sin conexión. Cambiar de tamaño cierra el menú para
no conservar coordenadas anteriores. A menos de 400 px, el recuento queda encima
de los controles para mantener legibles las cuatro etiquetas y el botón de mapa.

## Verificación

- `npm run check`: TypeScript y 354 pruebas aprobadas; `artifacts/sort-menu-check.log`.
- Navegador demo: menú con exactamente cuatro opciones y selección marcada;
  Menor precio coloca primero 74 000 USD; con Casas y búsqueda «Casa», Mayor precio
  ordena 138 000 antes de 112 000 y conserva ambos filtros; Mayor superficie
  coloca 210 m² antes de 168 m².
- Cierre automático, toque fuera y Escape comprobados; el botón original de
  filtros sigue abriendo «Tu búsqueda, a medida», con el orden seleccionado.
- Inspección visual a 390, 320 y 1280 px; sin errores de consola registrados.
- No hay cambios de esquema ni de consultas del servidor para este ajuste.

## APK e instalación

- Release 0.1.13 (versionCode 14) compilada correctamente; APK y AAB en
  `artifacts/releases/`. Registro: `artifacts/sort-menu-android-build.log`.
- APK verificada con la misma firma de la versión instalada, configuración pública
  incluida y sin credenciales privadas detectadas. Registro:
  `artifacts/sort-menu-apk-verification.log`.
- SHA-256 de la APK:
  `7770b6f228da99c23c866ec7a0b33bab1f6350058c32638c2e028540abe31fd6`.
- Actualización por USB en Pixel 7 Pro mediante `adb install -r`: `Success`.
  El dispositivo confirma versión 0.1.13 (14), conservando la instalación y datos.
- Apertura de MainActivity: `Status: ok`; proceso activo y sin entradas
  AndroidRuntime/ReactNativeJS de nivel error en la consulta posterior al arranque.
  Registros: `artifacts/sort-menu-device-install.log`,
  `artifacts/sort-menu-device-launch.log` y `artifacts/sort-menu-device-errors.log`.
- La interacción del menú se verificó en navegador. En el móvil físico se verificó
  instalación y apertura; no se automatizaron los toques del menú.
