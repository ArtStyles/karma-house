# Filtros compactos de Explorar

Diseño Compacta aprobado el 7 de octubre de 2026. Incluido en Android 0.1.18
(versionCode 19), junto con los modos Claro, Oscuro y Sistema.

En 0.1.19 (20), [la franja deslizante](discovery-carousel.md) sustituye el título
de la cabecera y retira los accesos al mapa de Explorar. La verificación descrita
abajo corresponde a 0.1.18.

Operación y provincia comparten una barra con un separador discreto. Conservan sus
selectores completos, con cinco operaciones y dieciséis provincias. Los nombres
largos se abrevian visualmente y mantienen la etiqueta accesible completa.

Se retiraron los accesos permanentes Casas, Apartamentos, Hasta $30.000 y 3+ hab.
Las etiquetas describen únicamente criterios aplicados: tipo, precio, habitaciones,
baños, superficie, conservación, precio negociable y comodidades. Quitar una etiqueta
modifica solo su criterio. Operación, provincia y texto se muestran en sus controles;
sin etiquetas adicionales, no aparece una fila vacía con Limpiar.

El conteo y los controles de orden, búsqueda guardada y mapa usan una fila más ligera.
A menos de 360 puntos, o con escala de fuente mayor que 1.2, se separan en dos filas.
Los avisos de resultados pendientes y las restricciones offline se conservan.

Verificación local:

- Documentación de Expo SDK 57 consultada antes de modificar el código.
- `npm run check`: TypeScript y 433 pruebas correctas; cuatro nuevas comprueban
  etiquetas, conservación de criterios y resultados reales al retirar el precio.
- Exportación web correcta; diseño revisado a 390, 320 y 1280 píxeles. A 320 píxeles
  se comprobó una provincia larga sin desbordamiento horizontal y sin fila vacía.
  Sin errores de consola en la sesión de revisión.
- Revisión independiente de la lógica y del último ajuste sin hallazgos importantes.

Verificación Android:

- APK y AAB firmados de producción compilados. Verificador de paquete, versión,
  certificado, configuración pública y archivos empaquetados correcto.
- APK SHA-256: `29525d3cd370cb68f870d99b8bdf181297e31fb52c55967181c910e319cbc2d2`.
- Pixel 7 Pro actualizado a 0.1.18 (19) con `adb install -r` y sin borrar datos.
  Se conservó `firstInstallTime=2026-09-24 11:30:59` y la sesión de cuenta existente.
- Barra compacta revisada en Claro y Oscuro. Casa + precio máximo 30000 + mínimo
  tres habitaciones generaron tres etiquetas y cero viviendas; retirar precio
  conservó las otras dos etiquetas y recuperó la vivienda de $40000.
- En el APK final se comprobó el selector de operaciones y el cambio a Venta sin
  fila vacía. La revisión táctil posterior se pausó al cambiar el usuario de app.
  La preferencia original era Claro; se restauró y verificó en la revisión de 0.1.19.

Registros, capturas y XML en `artifacts/compact-filters/`; APK y AAB en
`artifacts/releases/`. No se han publicado estos artefactos en una descarga pública.
