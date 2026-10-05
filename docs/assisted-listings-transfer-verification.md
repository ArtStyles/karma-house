# Publicación asistida y traspaso: evidencia de implementación

Trabajo en curso, sin despliegue. Base `734adcbc0a150dbbc61e34cb850697cf965f05b8`; rama `codex/assisted-listings-transfer`, worktree aislado `C:/Users/ACER NITRO/.codex/worktrees/d9a9/karma-house`. El checkout principal y sus modificaciones ajenas no se alteraron. Expo 57.0.23, React Native 0.86.3, React 19.2.3.

## Alcance comprobado localmente

- PostgreSQL 17 real, clúster desechable en loopback `127.0.0.1:56432`; migraciones históricas y nuevas aplicadas desde cero. Adaptadores mínimos Auth/Storage y transportes cron/net inertes; no se envían solicitudes externas. Las suites usan rollback y los ensayos de concurrencia limpian las cuentas sintéticas.
- Publicación oficial autorizada y referencia privada; reserva inmutable de creación; un reintento después del traspaso devuelve `KH_PROPERTY_MANAGEMENT_CHANGED` y no duplica la ficha.
- Fotos y miniatura registradas por UUID de ficha; reutilización de adjuntos heredados, rechazo de otra ficha, retiro irreversible y cola con leases/reintentos. Eliminación de cuenta no entrega paths heredados al cliente. Firmas de fichas privadas duran 300 segundos y no se guardan en el caché público.
- Ofertas exclusivamente desde la cuenta principal configurada y protegida, sobre sus fichas asistidas; 1–20 por lote, un colaborador/receptor, siete días, versiones de ficha/procedencia/vínculo y aceptación completa. Campos restantes, favoritos y paths se conservan.
- Dos conexiones independientes prueban doble aceptación/ACK perdido, edición concurrente, vencimiento durante espera y marcador de eliminación: un resultado completo o cero cambios de gestor, sin residuos de fixture.
- Historial de chat conserva participantes y mensajes; receptor no obtiene acceso anterior. Inicio con gestor esperado detecta cambio. ACK de mensaje confirmado sigue recuperable. Publicaciones heredadas no aportan puntuación de publicaciones propias; sí aparecen como gestionadas.
- Transporte fija JWT/actor y descarta respuestas/errores de sesión anterior; decisión conserva identidad en almacenamiento privado tras timeout y reinicio. Endpoint privado niega terceros y canceladas; comprueba de nuevo la solicitud después de firmar. Fixture HTTP local pasa con Auth/Storage simulados.

## Regresiones y diagnósticos

Baseline cliente: typecheck y 362 tests pasaban antes de cambios. Typecheck y suites Node focalizadas del nuevo dominio, reintentos, permisos de fotos, caché privado, limpieza, chat y endpoint pasan después de los cambios implementados.

SQL: `cloud_marketplace`, `cover_thumb`, `cover_thumb_upgrade`, `owner_administration`, `operations`, `rent`, `optional_area`, `messaging`, `negotiations`, `chat_negotiation_cards`, `trust_profile`, `notifications`, `search_alerts`, `play_compliance` pasan en el ensayo local actualizado. Las suites nuevas de publicación, medios, limpieza, aceptación, fallos, permisos y chat pasan.

Se reprodujo un fallo del adaptador anterior también sin estas migraciones: asignaba `{}` como metadata por defecto y hacía fallar la comprobación de UPDATE de Storage. Se corrigió el adaptador al campo nullable sin default del [esquema oficial de Supabase Storage](https://github.com/supabase/storage/blob/master/migrations/tenant/0002-storage-schema.sql), y el test original pasó en la base baseline. No se modificó esa aserción para ocultar el fallo.

Se ajustaron fixtures antiguos con `synthetic/photo.jpg` compartido para usar paths únicos actor/request válidos, manteniendo las aserciones de chat/avisos. Cambios legítimos de expectativas: miniatura retirada queda para limpieza de servidor; el guard de pertenencia sustituye el antiguo prefijo mutable; el texto de confianza especifica publicaciones propias; el manifiesto de eliminación entrega archivos sin registro y avatar, mientras el servidor retira adjuntos registrados.

## Pendiente antes de activar

Pantallas integradas y visuales 390/1280, invalidación de gestión/catálogo, matriz de concurrencia ampliada, pasada completa `npm run check`/export, revisión final independiente y build APK compatible. No existe todavía evidencia de instalación/recorridos físicos.

Este ensayo no demuestra Supabase REST/Auth/Storage real ni ejecución desplegada del endpoint. No se aplicaron migraciones a infraestructura real, no se subieron bytes de imágenes a Storage, no se publicaron anuncios reales y no se probaron recepción/taps de push. La prueba HTTP citada usa un servidor loopback con proveedores simulados.

El flag privado comienza **false**. Distribución, despliegue y piloto requieren la autorización de esa etapa y completar la identidad pública/responsable/retención del protocolo. Desactivar el flag detiene nuevas ofertas/aceptaciones; no revierte lotes aceptados. Las URLs privadas ya entregadas pueden seguir válidas hasta 300 segundos.
