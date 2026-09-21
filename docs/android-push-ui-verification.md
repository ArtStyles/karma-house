# Ajustes de avisos — revisión visual

Revisión en el navegador integrado contra Metro en `localhost:8083`, con una cuenta sintética del fixture de notificaciones. No se usó una cuenta real ni se activó ningún dispositivo.

- Sin sesión, «Tus avisos» presenta el acceso a la cuenta.
- Con sesión, web explica que la activación del teléfono se hace en la app Android instalada. No muestra un botón que simule permisos push del navegador.
- Pantallas de 320 y 390 píxeles: tarjeta, descripciones, interruptores y botones legibles, sin desbordamiento horizontal tras confirmar el viewport efectivo. Escritorio de 1280 píxeles: columna centrada de ancho limitado.
- Se desactivaron las ofertas, se guardaron las preferencias y apareció «Preferencias guardadas». La cuenta conservó mensajes y visitas activados. Una navegación nueva, tras reiniciar Metro, recuperó ofertas desactivadas desde Supabase.
- El perfil volvió al estado sin cuenta después de «Cerrar sesión»; la limpieza del fixture se ejecuta después de ese cierre y su registro está en `artifacts/android-push-ui-cleanup.log`.

Durante la compilación apareció `EACCES` al intentar observar un socket temporal de Java. Se localizó la causa: el watcher de Metro normaliza rutas Windows a `/`, mientras el patrón absoluto existente solo coincidía con `\\`. `metro.config.cjs` acepta ambos separadores, y una prueba usa el matcher real de Metro para verificar que se excluye el directorio antes de descender en sus sockets. Se observó el fallo antes de corregirlo, el test pasó después y la vista previa volvió a cargar durante la compilación.

El navegador valida presentación y preferencias, no el diálogo de permisos Android, SecureStore nativo ni recepción de avisos con la app cerrada. Esos recorridos requieren instalar el APK en un teléfono.
