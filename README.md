# KarmaHouse

[![check](https://github.com/ArtStyles/karma-house/actions/workflows/check.yml/badge.svg)](https://github.com/ArtStyles/karma-house/actions/workflows/check.yml)

Primera entrega navegable de una aplicación de compraventa de viviendas en Cuba, desarrollada con **React Native y Expo** para Android e iPhone. La vista web sirve para revisar el mismo código desde el navegador.

La interfaz se ha actualizado con tipografía del sistema, superficies agrupadas y navegación flotante. [Referencias profesionales y verificación del rediseño](docs/apple-ui.md).

## Qué puedes probar

- Registro, confirmación de correo, acceso y recuperación de contraseña.
- Catálogo compartido de viviendas aprobadas, en páginas de 24 con filtros, orden y recuento resueltos en el servidor.
- Búsqueda por palabra con prefijo; si no encuentra nada, reintenta por subcadena.
- Publicación con hasta seis fotos optimizadas y borrador local por cuenta.
- Edición, pausa, reactivación y marcado como vendido desde Mis anuncios.
- Favoritos sincronizados entre sesiones.
- Revisión administrativa: aprobar o rechazar con un motivo; solo lo aprobado y activo es público.
- Ubicación exacta o aproximada al publicar y explorar viviendas en el mapa.
- Chat por vivienda, bandeja y mensajes sin leer, reintento manual, bloqueo y reportes.
- Visitas y ofertas desde el chat: fechas en hora de Cuba, contraofertas, aceptación, rechazo y cancelación; bandeja de solicitudes e historial.

Con las variables públicas de Supabase configuradas, la app usa datos reales sin importar los ejemplos. Sin configuración, conserva la demo local para revisar el diseño; la mensajería y las solicitudes requieren cuentas reales. La publicación en tiendas queda para próximas entregas.

[Esquema y pruebas remotas](docs/cloud-schema.md) · [Estado de la entrega conectada](docs/cloud-verification.md).

## Arranque

Requiere Node.js 22.13 o superior (LTS recomendado).

```sh
npm ci
# Copiar .env.example a .env.local y completar URL + clave pública
npm start
```

El mapa usa MapLibre nativo y necesita una compilación propia: **Expo Go no incluye este módulo**. Para probar en Android, instala el APK de pruebas o usa una development build. La vista web funciona con Metro.

```sh
npm run web -- --port 8083
npm run android
```

`npm run android` necesita un dispositivo o emulador Android configurado. `npm run ios` abre un simulador local y requiere macOS/Xcode. Desde Windows puede prepararse una compilación iOS en EAS, con la cuenta y credenciales correspondientes; esta entrega no envía nada a EAS ni a las tiendas.

## APK Android para pruebas

Con Android SDK, Java 17 para las herramientas de React Native y las variables públicas en `.env.local` (Gradle puede ejecutarse con JDK 17 o 21):

```powershell
npx expo prebuild --platform android --no-install
powershell -ExecutionPolicy Bypass -File scripts/build-android-preview.ps1
powershell -ExecutionPolicy Bypass -File scripts/verify-android-preview.ps1 -ApkPath artifacts/releases/KarmaHouse-0.1.5-preview.apk -ExpectedVersion 0.1.5 -ExpectedVersionCode 6 -SdkPath artifacts/android-sdk -BuildToolsVersion 36.0.0 -JdkPath artifacts/android-tooling/jdk17/jdk-17.0.20.1+1
```

El script acepta `-JdkPath` y `-SdkPath` si las herramientas están en otra ubicación. En Windows, usa una ruta del SDK **sin espacios**: la abreviación de `clang++.exe` puede impedir que se enlace la biblioteca estándar de C++. En este equipo se conserva una copia local de las herramientas en `artifacts/android-sdk` y Java 17 en `artifacts/android-tooling/jdk17`; el script las detecta automáticamente.

Se compila una variante release con JavaScript incorporado y firma de pruebas, para teléfonos ARM de 32 y 64 bits. El APK queda en `artifacts/releases/`, junto con su SHA-256. No necesita Metro ni Expo Go; las funciones de Supabase necesitan Internet. La verificación compara también los valores privados de `infra/.env.local` sin mostrarlos.

Para instalarlo, copia el APK al teléfono y ábrelo desde Archivos. Android puede pedir autorización para instalar aplicaciones desde esa aplicación. **0.1.5 conserva el identificador `com.karmahouse.karmahouse` y la firma de 0.1.4, así que se instala encima sin desinstalar y conserva sesión y borradores.** 0.1.4 sí había cambiado de identificador respecto a 0.1.3 y se instaló como otra app.

[APK inicial 0.1.0: tamaño, SHA-256 y comprobaciones](docs/android-preview-verification.md) · [Ajuste de la barra inferior en 0.1.1](docs/android-tab-bar.md) · [Mapa y APK 0.1.2](docs/property-map-verification.md) · [Mensajería 0.1.3](docs/messaging-verification.md) · [Avisos Android 0.1.4](docs/android-push-verification.md) · [Catálogo paginado 0.1.5](docs/superpowers/specs/2026-09-21-catalog-pagination-design.md).

## Verificación

```sh
npm run check
npx expo install --check
npm run export
```

`npm run check` ejecuta TypeScript y pruebas de búsqueda, validación, codec, hidratación, paginación del catálogo, fallos de escritura y concurrencia. `npm run export` genera los bundles de Android, iOS y web en `dist/`. **Exportar los bundles no genera un APK/IPA ni demuestra ejecución en teléfonos.** Resultados y límites: [docs/verification.md](docs/verification.md).

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/app` | Navegación de Expo Router |
| `src/screens` | Pantallas del recorrido |
| `src/components` | Tarjetas, formulario y controles compartidos |
| `src/domain` | Reglas puras y catálogo de demostración |
| `src/state` | Persistencia versionada y contexto de React |
| `src/catalog` | Páginas por cursor, anuncio por id, favoritos y vista de mapa |
| `src/messaging` | Conversaciones, cola de envío por cuenta y sincronización |
| `src/negotiations` | Visitas, ofertas, estados y solicitudes paginadas por participante |
| `src/notifications` | Bandeja de avisos, lecturas y preferencias por cuenta |
| `src/push` | Registro Android por sesión, permisos, revocación y apertura de avisos |
| `assets/images` | Fotografías sintéticas y procedencia |
| `tests` | Pruebas de comportamiento independientes de la UI |

Se utiliza Expo SDK 57, React Native 0.86 y React 19.2. El SDK admite Android 7+ e iOS 16.4+, según la [documentación versionada](https://docs.expo.dev/versions/v57.0.0/). Android usa el identificador elegido `com.karmahouse.karmahouse`, con la configuración cliente de Firebase en `google-services.json`. iOS conserva provisionalmente `com.karmahouse.app`. [Estado de Firebase y Expo](docs/firebase-android-setup.md).

## Persistencia e imágenes

### Notificaciones dentro de la app

La campana de Explorar y Mi espacio abren los avisos de mensajes, visitas y ofertas. La bandeja ofrece Todas y Sin leer, páginas de 30 avisos y marcado individual o en conjunto. Abrirla o entrar en una conversación no marca los avisos como leídos; la lectura del chat sigue siendo independiente. El marcado conjunto usa el último corte observado para conservar sin leer las novedades posteriores.

Los ajustes permiten elegir las categorías de los próximos avisos. No borran el historial ni silencian la recepción de mensajes o propuestas. Las notificaciones no incluyen textos de chat, notas ni importes. Los participantes bloqueados se ocultan de la bandeja y del contador; al desbloquear pueden reaparecer avisos anteriores.

El contador se consulta cada 30 segundos en primer plano y al regresar; las páginas solo se descargan con la bandeja visible. Se generan avisos de eventos nuevos, sin reconstruir los anteriores. [Pruebas del centro interno](docs/notifications-verification.md).

### Avisos en Android

«Tus avisos» permite activar o desactivar cada teléfono Android instalado. El permiso se solicita al pulsar activar. La entrega usa una cola privada en Supabase y Expo Push; respeta categorías, bloqueos y sesión. Cerrar sesión confirma antes la revocación del registro del teléfono. Si esa confirmación falla, se muestra un error para reintentar.

El texto del aviso es general; tocarlo resuelve la conversación autorizada para la cuenta actual. Web, iOS y Expo Go no activan push en esta entrega. No se programan recordatorios de visitas. [Implementación, APK y prueba física pendiente](docs/android-push-verification.md).

### Visitas y ofertas

Desde cada chat se pueden proponer visitas y ofertas de compra en USD, responder o enviar alternativas. Las fechas se interpretan en hora de Cuba; las ofertas pendientes caducan a los siete días y las visitas pendientes al llegar su hora. Hay una propuesta pendiente de cada tipo por conversación. Mi espacio y Mensajes dan acceso a Solicitudes, con vistas Pendientes y Todas.

El historial estructurado y un resumen en el chat se guardan en una misma transacción. Los reintentos conservan el identificador original para evitar duplicados. Los formularios conservan su contenido al cerrar el panel mientras siga montada la pantalla; no son borradores persistentes tras cerrar la app. Los bloqueos y la disponibilidad impiden nuevas propuestas y respuestas, pero permiten cancelar compromisos existentes. Aceptar una oferta no cobra, reserva ni marca la vivienda como vendida.

El servidor está aplicado y verificado. [Entrega y pruebas](docs/negotiations-verification.md). Los controles se incluyen en 0.1.4 y requieren la prueba instalada en un teléfono; el APK 0.1.3 anterior solo muestra sus resúmenes como mensajes de texto.

### Mensajes por vivienda

Contactar abre una conversación única entre comprador y vendedor sobre el anuncio. La bandeja está en Explorar y Mi espacio, con indicadores de mensajes sin leer. Se admiten mensajes de texto de hasta 2000 caracteres y páginas de 50 mensajes anteriores. La conversación conserva el título y la zona originales del anuncio.

Un envío se guarda en la cola local de la cuenta antes de transmitirse. Si falla, permanece como No enviado y puede reintentarse o descartarse; reintentar conserva el mismo identificador para evitar duplicados. Los mensajes pendientes no se reenvían automáticamente al iniciar sesión. Los borradores de texto y las colas se separan por cuenta; borrar los datos de la app puede eliminar texto no enviado.

La bandeja se actualiza cada 15 segundos en primer plano; el chat abierto, cada 5 segundos. Solo se marcan leídos los mensajes visibles al final de la conversación. No se incluye envío de archivos; los avisos Android se configuran por separado en «Tus avisos».

Bloquear impide nuevos mensajes entre ambas cuentas, en todas sus conversaciones, y conserva el historial. Solo quien creó un bloqueo puede retirarlo. Un anuncio que deja de estar aprobado y activo conserva su historial pero no admite mensajes nuevos. Reportar guarda el motivo y hasta 20 mensajes recientes como contexto; los administradores revisan esa evidencia sin recibir acceso general a chats privados. La revisión no suspende cuentas automáticamente.

El servidor controla participantes, lecturas, deduplicación y límites de uso (20 conversaciones nuevas/día, 20 mensajes/minuto y 300/hora, 10 reportes/día por cuenta). La migración es aditiva. Diseño y contratos: [mensajería](docs/superpowers/specs/2026-09-18-messaging-design.md).

### Ubicación de viviendas

Publicar y editar permiten elegir un punto manualmente, sin permiso GPS. El propietario decide entre posición exacta y zona aproximada; esta última se redondea en el cliente y en Supabase antes de guardarse. No se conserva un segundo punto exacto en la fila pública. La zona se representa con un círculo de 800 metros. El campo es opcional y los anuncios anteriores siguen siendo válidos.

Explorar ofrece Lista/Mapa con los mismos filtros. Los anuncios sin coordenadas permanecen en la lista. Las fichas con ubicación muestran el mapa y la precisión elegida. La cartografía usa [OpenFreeMap](https://openfreemap.org/) con un estilo Positron adaptado en `src/components/maps/mapConfig.ts`; se conservan las atribuciones de OpenMapTiles y OpenStreetMap. Necesita conexión para cargar el mapa, sin geocodificación ni mapas offline en esta versión.

La migración de ubicación es aditiva y posterior a la del catálogo. Su compatibilidad conserva el punto si un cliente anterior omite `mapLocation`, y lo elimina cuando un cliente actual envía `null` explícito.

Supabase conserva las cuentas, anuncios, favoritos y fotos. Las tablas y Storage tienen políticas por propietario y publicación moderada; las claves privadas solo se usan desde scripts locales de administración. `.env.local` e `infra/.env.local` están ignorados por Git. Los archivos `.env.example` contienen únicamente marcadores.

La sesión nativa se almacena en SecureStore; web usa AsyncStorage. Los borradores se separan por cuenta, con IndexedDB en web y almacenamiento local en móvil. Se conservan los identificadores de reintento para evitar anuncios duplicados; una edición desactualizada requiere descartar explícitamente el borrador y cargar la versión actual. Borrar datos del navegador o desinstalar puede eliminar borradores aún no enviados.

Las fotos se comprimen a JPEG, con hasta 1600 píxeles en el lado mayor, un límite de seis fotos y 4 MB por archivo. Storage es privado: la app utiliza accesos firmados y renueva las imágenes. Una URL ya emitida sigue funcionando hasta que caduca aunque el anuncio deje de ser público.

La demo sin Supabase conserva el almacenamiento `@karma-house/marketplace-v1`. No se migra automáticamente al catálogo real.

Las dos fotografías de demostración se generaron con `image_gen` integrado. Prompts y procedencia: [assets/images/PROVENANCE.md](assets/images/PROVENANCE.md). No representan inmuebles en venta. El icono es un dibujo vectorial original en `assets/karmahouse-icon.svg`; `scripts/render-icon.cjs` rasteriza ese SVG con Sharp y no altera las fotografías.

## Preparación antes de abrir al público

- Configurar un proveedor SMTP y verificar entrega real de confirmaciones y recuperación. La configuración de URLs actual cubre localhost:8083 y el esquema móvil karmahouse.
- Definir el dominio público y añadir sus callbacks autorizados antes de desplegar la web.
- Probar una development build Android/iOS, especialmente enlaces de correo, galería, persistencia y cambio de cuenta. Expo Go no registra el esquema propio de una app instalada.
- Completar la prueba física de avisos Android con la app cerrada, configurar APNs para iOS y definir el proceso operativo de moderación antes de lanzar al público.
