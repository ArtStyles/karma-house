# Avisos Android y APK 0.1.4

Esta entrega añade la activación por teléfono de avisos de mensajes, visitas y ofertas. Las preferencias de categorías siguen en «Tus avisos». No se programan recordatorios de visitas en este bloque.

## Implementación

- Expo SDK57 y `expo-notifications ~57.0.20`; canal `karmahouse-updates`, icono blanco transparente y permiso solicitado solo al pulsar activar.
- Identidad de instalación y secreto en SecureStore; registro ligado a la sesión de Supabase. Las revisiones persistidas impiden que una petición antigua reactive un teléfono después de desactivarlo.
- Cerrar sesión revoca primero cualquier registro confirmado o incierto. Si nunca se intentó activar, salir no requiere contactar con el servicio de push.
- El aviso contiene texto general y una referencia a la notificación. Al tocarlo se comprueba la cuenta y la autorización antes de abrir la conversación.
- Cola privada de Supabase, entrega por Expo, reintentos y conciliación de recibos. La fuente duradera es PostgreSQL, no la cola temporal de HTTP.
- Web, iPhone y Expo Go conservan la bandeja interna; la activación de esta entrega requiere la app Android instalada.

Diseño y límites: [especificación](superpowers/specs/2026-09-20-android-push-design.md), [plan](superpowers/plans/2026-09-20-android-push.md), [Firebase y vencimiento de credencial](firebase-android-setup.md).

## Identidad del APK

Versión `0.1.4`, código `5`, paquete `com.karmahouse.karmahouse`. El APK anterior 0.1.3 usaba `com.karmahouse.app`: Android trata esta entrega como otra aplicación. No migra automáticamente la sesión o los borradores de la instalación anterior. Si conviven ambas, los enlaces `karmahouse://` pueden requerir elegir la aplicación.

La firma es de pruebas, no una firma de distribución para Play Store. Las credenciales FCM privadas permanecen fuera del repositorio y del APK.

## Prueba pendiente en el teléfono

1. Instalar el APK 0.1.4 e iniciar sesión.
2. Entrar en la campana → ajustes → «Tus avisos», pulsar «Activar en este teléfono» y aceptar el permiso de Android.
3. Dejar KarmaHouse en segundo plano. Desde otra cuenta participante, enviar un mensaje, una propuesta de visita y una oferta en una conversación de prueba.
4. Comprobar la recepción y tocar cada aviso: debe abrir la conversación correspondiente. Leer la bandeja y desactivar una categoría no deben borrar el historial.
5. Cerrar sesión y comprobar que nuevos eventos de esa cuenta no llegan a ese teléfono. Iniciar otra cuenta no activa avisos automáticamente.

No hay un dispositivo Android conectado al equipo. Las pruebas de código, servidor y compilación no demuestran recepción física. Un recibo aceptado por Expo tampoco la demuestra. Android puede impedir la entrega tras «Forzar detención»; la prueba debe hacerse dejando la app en segundo plano o cerrándola normalmente.

## Evidencia de esta ejecución

La instalación del SDK y la generación nativa finalizaron correctamente. TypeScript pasó y la suite final aprobó **207/207 pruebas**: 29 casos push nuevos y una regresión del watcher de Metro, además de los casos existentes. La exportación de Android, iOS y web terminó sin errores. El escaneo de 657 archivos fuente/exportados no encontró las credenciales privadas configuradas.

Revisión independiente del cliente y SQL sin hallazgos importantes pendientes después de corregir hidratación, orden de bloqueos, expiración y recibos. La [revisión visual](android-push-ui-verification.md) comprobó estado sin sesión, presentación de web, categorías guardadas y persistencia. Se cerró la cuenta sintética y se eliminaron sus datos; el inventario remoto previo quedó intacto.

El APK final se generó tras las correcciones del cliente (`BUILD SUCCESSFUL`, 584 tareas). Verificación:

- Archivo: `artifacts/releases/KarmaHouse-0.1.4-preview.apk` y fichero `.sha256` contiguo.
- Tamaño: **83 226 653 bytes**, 83,23 MB / 79,37 MiB.
- SHA-256: `fc313259b443860258eb38acb95ba7f7017e60a170643240718d6f5a5c8bd63a`.
- Paquete/versión/código correctos; ARM64 y ARM32, minSdk24, no depurable y JavaScript incorporado (3 589 344 bytes).
- Firma APK v2 validada; certificado SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- 1380 entradas descomprimidas sin los valores privados configurados; bundle/textos sin PEM privado ni JSON de cuenta de servicio. Alineación ZIP de 16 KB comprobada; no se afirma compatibilidad ELF de 16 KB ni aprobación en Play Store.
- Inspección del manifiesto del APK: `POST_NOTIFICATIONS`, recepción FCM, servicio `ExpoFirebaseMessagingService`, `NotificationsService`, canal `karmahouse-updates` e iconos declarados.
- APK 0.1.3 preservado con SHA `2dea49fafe825cdbf467e9538de854698ec2f78a23885739e2ae826c2a51ad60`. Migraciones 003 y 004 conservan sus hashes originales.

Registros locales: `artifacts/android-push-unit-tests.log`, `android-push-export.log`, `android-push-build-final.log`, `android-push-apk-verification.log` y `android-push-ui-cleanup.log`.

Supabase quedó **aplicado y activo**: cuatro suites SQL, ocho comprobaciones de concurrencia, inventario original intacto y salida real `pg_net → Expo` con HTTP200 para una consulta de recibos vacía. Se observaron dos ejecuciones programadas correctas después de activar el transporte y una lectura independiente posterior confirmó tres ejecuciones adicionales correctas. No había dispositivos registrados ni trabajos pendientes; no se enviaron avisos a personas durante las comprobaciones. [Evidencia del servidor](android-push-data-verification.md).
