# Mapa de KarmaHouse — versión 0.1.2

## Funcionalidad

- Ubicación opcional al publicar y editar: punto manual, aproximada por defecto, exacta, confirmar, cancelar y retirar.
- La aproximada publica una posición redondeada y un área de 800 metros. Ni el borrador confirmado ni la fila/recibo del servidor conservan el punto preciso original.
- Explorar alterna Lista/Mapa usando el mismo resultado filtrado. El precio abre una tarjeta y esta abre la ficha. Los anuncios sin coordenadas siguen en la lista y se informa su cantidad.
- La ficha muestra un mapa con la precisión elegida. Se conservan las cuatro pestañas existentes.
- OpenFreeMap Positron adaptado con agua azul, fondo neutro y selección azul. Atribuciones de OpenFreeMap/OpenMapTiles/OpenStreetMap fuera del área interactiva.
- Sin permisos GPS, búsqueda automática de direcciones ni mapas offline en esta entrega.

## Verificación de datos

Ver [property-map-data-verification.md](property-map-data-verification.md): migraciones 002 y 003 aplicadas, 31 aserciones SQL y 40 comprobaciones REST. Se compararon hashes y conteos para conservar la propiedad y fotos existentes. Las cuentas sintéticas de REST y los fixtures SQL se limpiaron; no se enviaron correos.

La revisión independiente identificó diferencias de redondeo en empates binarios entre JavaScript y SQL. Se corrigieron en la migración aditiva 003 sin reescribir la 002 aplicada.

## Navegador

QA real mediante la interfaz en una demo aislada en localhost:8084, sin Supabase. No se modificó el anuncio real ni la sesión del usuario para hacer la prueba visual.

- 390 × 844: seleccionar, confirmar aproximada, cambiar a exacta y cancelar conservando la aproximada, quitar y volver a elegir, confirmar exacta, avanzar y revisar.
- Guardar un anuncio ficticio local, recargar, abrir edición y comprobar que conserva el punto. Cambiar a aproximada, guardar y abrir ficha con círculo de 800 m.
- Buscar por texto, cambiar Lista/Mapa, seleccionar el precio, abrir ficha y regresar con búsqueda/vista conservadas. Cambiar categoría retira el marcador y la tarjeta que ya no corresponden. Los cuatro anuncios sin coordenadas muestran el acceso a la lista.
- 320 × 740: selector con mapa, atribución y acciones visibles; los botones se apilan en la pantalla estrecha.
- 1200 × 900: distribución de escritorio y mapa con los mismos filtros.
- Se observó y probó el estado de error y el botón de reintento durante el diagnóstico de carga web.

El diagnóstico encontró que MapLibre GL 6 espera un worker ESM junto a su módulo, que Metro no emitía. `scripts/prepare-map-web.mjs` copia el worker, sus imports publicados y la licencia a `public/maplibre/<versión>`; `postinstall` lo sincroniza y el adapter configura su URL. Se comprobó MIME JavaScript y coincidencia de hashes. El mapa se dibuja después del arreglo y los archivos también aparecen en la exportación.

La prueba de ficha detectó un aviso por una cadena vacía en la condición de moderación de anuncios locales; se corrigió la condición booleana y se confirmó que desaparece al recargar. La cámara nativa mantiene estable la referencia a su centro para no aplicar un movimiento en cada selección.

## Comprobaciones locales y límites

TypeScript y 72 pruebas pasan; incluyen geometría independiente del área de 800 m, persistencia, normalización, selección y copia del worker. El escaneo de fuentes y exportaciones no encontró valores privados de `infra/.env.local`.

Se verificaron por HTTPS teselas vectoriales de La Habana y Santiago de Cuba desde este equipo. Esto no demuestra conectividad desde una red cubana o ejecución en teléfono. Las exportaciones Android/iOS/web se generan, pero una exportación de JavaScript no es una compilación iOS ni una prueba física.

La compilación y firma del APK se documentan con su propio reporte en `artifacts/`. La primera descarga nativa falló por DNS de `dl.google.com`; el reintento usa el caché y preferencia IPv4 de Java, sin descargar de nuevo las herramientas Android.

## APK entregado

`KarmaHouse-0.1.2-preview.apk`, versión 0.1.2, código 3, paquete `com.karmahouse.app`.

- Copiado a `C:\Users\ACER NITRO\Downloads\KarmaHouse-0.1.2-preview.apk`, junto con `.apk.sha256`.
- 81.538.170 bytes: 81,54 MB / 77,76 MiB.
- SHA256 `b49e70bf3a5553107b1248aa33896b8a60ff5044d6df8e2bf1837b635d73ff55`; hash de la copia verificado.
- Misma firma de prueba que 0.1.0 y 0.1.1: permite actualizar sin desinstalar. Certificado SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Ambas ARM, Android 7+, JavaScript incorporado, MapLibre nativo incluido, no depurable. Firma v2 y zipalign de 16 KB aprobados.
- Escaneadas 1.307 entradas: configuración pública incluida, valores privados ausentes. Reporte `artifacts/android-preview-0.1.2-verification.json`.
- Los dos primeros intentos tuvieron fallos DNS de dependencias. El tercer intento terminó en 3m47s reutilizando las tareas y descargas anteriores.

Instalar encima de la versión anterior. No necesita Expo Go ni Metro. Aún hace falta comprobar mapa, gestos, navegación y conexión en el Android físico; iOS necesita su propia compilación y prueba.

La configuración de Metro excluye `artifacts/`: contiene SDK, Java y salidas generadas, que no deben recorrerse como fuentes de la aplicación. Se verificó que las rutas de herramientas quedan excluidas y las fuentes de `src/` permanecen incluidas.
