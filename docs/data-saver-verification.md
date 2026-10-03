# Modo ahorro de datos: continuación y verificación

Sesión del 29 de septiembre de 2026. Se retomaron el diseño y el plan existentes
con fecha de archivo `2026-10-02`, sin reiniciar los tres pasos ya confirmados en Git.
Rama local: `codex/data-saver-resume`.

## Comportamiento implementado

- Miniatura de portada de 480 px y enlaces firmados reutilizables; los anuncios anteriores conservan la portada original hasta que tengan miniatura.
- Interruptor local en Mi espacio, disponible también sin sesión. La lectura inicial de la preferencia termina antes de permitir imágenes o mapas; los cambios rápidos se persisten en orden.
- Con ahorro activado, las tarjetas esperan un toque. Tocar la foto no abre la ficha; tocar el resto de la tarjeta sí. En detalle se muestra la foto seleccionada y las restantes esperan selección. El mapa requiere «Cargar mapa».
- Se conserva la primera página de 24 anuncios sin filtros durante un máximo de siete días. Solo una respuesta vigente la actualiza; una página vacía sustituye los anuncios anteriores.
- Ante un fallo de red sin resultados disponibles se muestra la copia, su antigüedad y un reintento. Los filtros y el mapa quedan bloqueados. La ficha guardada avisa que precio y disponibilidad pueden haber cambiado, permite reintentar y no envía contactos, favoritos ni reportes.
- Se descartan copias incompletas que podrían romper el renderizado del detalle.
- La migración normaliza los recibos anteriores para conservar reintentos de publicación/edición tras perder una respuesta.

## Evidencia obtenida

- `npm run check`: TypeScript y 354 pruebas aprobadas. Registro: `artifacts/data-saver-check.log`.
- Exportación Expo para Android, iOS y web aprobada, sin variables de Supabase (demo). Resultado: `artifacts/data-saver-export`; registro: `artifacts/data-saver-export.log`. No equivale a un APK instalado.
- Regresiones observadas fallar y luego pasar: hidratación/orden de preferencias, actualización de primera página vigente, instantáneas incompletas y reintentos SQL a través de la migración.
- `node scripts/apply-cover-thumb.mjs` **sin `--commit`**: ensayo de actualización y suite de miniaturas aprobados; transacción revertida. Inventario antes/después: 2 usuarios, 3 anuncios, 12 notificaciones y 7 objetos. Registro: `artifacts/data-saver-sql-green.log`.
- Suites `optional_area`, `rent`, `operations`, `search_alerts` y `trust_profile` ejecutadas con la migración en transacciones revertidas: todas aprobadas. Registro: `artifacts/data-saver-sql-regression.log`.
- Navegador en demo: interruptor persistido tras recargar; cuatro tarjetas sin imagen automática; toque de una foto sin navegación y conservación al cambiar de vista; mapa retenido hasta pulsar su botón. Inspección visual del ajuste a 320 px, catálogo/mapa a 390 px y catálogo a 1280 px.
- Detalle de demostración abierto con ahorro activado. Sin errores de consola registrados; preferencia demo y tamaño de navegador restaurados al terminar.

## Estado remoto y límites

Tras la autorización del usuario, se ejecutó `node scripts/apply-cover-thumb.mjs --commit`.
La migración quedó aplicada y su suite pasó. El inventario se mantuvo en 2 usuarios,
3 anuncios, 12 notificaciones y 7 objetos, sin datos sintéticos persistidos.
Registro: `artifacts/data-saver-sql-applied.log`.

`node scripts/verify-cover-thumb.mjs` confirmó una columna, una restricción y una
política de lectura de miniaturas; su suite también pasó. El primer intento de
esta comprobación agotó el tiempo de conexión; el reintento terminó correctamente,
sin volver a ejecutar la migración. Registro: `artifacts/data-saver-sql-verified.log`.
Hay cero miniaturas en los anuncios existentes: conservan su portada original y
no se han regenerado sus imágenes automáticamente.

La API pública respondió HTTP 200 tanto a la selección de `cover_thumb_path` como
a `kh_search_properties` con los filtros por defecto del cliente. El catálogo
devolvió tres anuncios, todos con el campo nuevo. Registro:
`artifacts/data-saver-public-check.log`.

La versión Android 0.1.12 (código 13) se compiló e instaló por USB en el Pixel 7 Pro
del usuario, actualizando la 0.1.11 mediante `adb install -r`, sin desinstalar ni
borrar datos. Se verificó la coincidencia del certificado con el APK extraído del
móvil; Android conserva la fecha de primera instalación del 24 de septiembre.
El inicio de `MainActivity` devolvió `Status: ok`.

APK: `artifacts/releases/KarmaHouse-0.1.12.apk` (83 596 031 bytes).
SHA-256: `2b24c81f9ba0eea76a016bedc495032af919b105dcb27f4e548762c8b61450bd`.
También se generó el AAB, sin publicarlo. La verificación del APK aprobó firma v2,
versión, ambas arquitecturas, configuración pública de Supabase, ausencia de
valores privados en 1386 entradas y alineación ZIP de 16 KB. La suite local volvió
a pasar con 354 pruebas. Registros: `artifacts/data-saver-android-build.log`,
`artifacts/data-saver-apk-verification.log`, `artifacts/data-saver-device-install.log`,
`artifacts/data-saver-device-launch.log` y `artifacts/data-saver-device-version.log`.

Quedan pendientes la prueba física de arranque en modo avión y la medición de bytes. Las pruebas de
navegador usan imágenes locales de demostración: validan interacción y diseño,
no una reducción medida del consumo móvil.

La copia local conserva datos y enlaces, no descarga todas las fotos para uso
sin conexión. Una foto solo podrá verse sin red si el sistema la conserva en su
caché; puede no estar disponible. Las fotos nunca vistas, el mapa, los contactos
y las escrituras requieren red. Esta entrega no añade un service worker para
arrancar la web sin conexión.

## Próximo paso de entrega

1. Migración aplicada y verificada. No repetir `--commit`: la migración añade una
   columna que ya existe. Para comprobarla, usar `node scripts/verify-cover-thumb.mjs`.
2. APK 0.1.12 generado, verificado e instalado en el Pixel 7 Pro; arranque confirmado.
3. En teléfono: cargar catálogo conectado; cerrar; activar modo avión; abrir
   catálogo y ficha guardada; reconectar y reintentar. Comprobar también una
   instalación sin caché previa.
4. Medir consumo de catálogo frío/caliente por UID y verificar interruptor,
   galería y mapa. No atribuir un porcentaje de ahorro antes de esa medición.

## Decisiones al retomar

Se conservaron los cambios sin confirmar de Claude en el directorio solicitado
y se creó una rama de continuación. No se trasladaron ni descartaron archivos.
Se sustituyó el guardado de cualquier respuesta por el de respuestas vigentes,
para evitar que una petición antigua restaurase anuncios obsoletos. Se mantuvo
la publicación remota como paso separado conforme al plan existente.

Referencia de compatibilidad consultada antes de editar:
[documentación versionada de Expo 57](https://docs.expo.dev/versions/v57.0.0/).
