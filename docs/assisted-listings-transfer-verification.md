# Publicación asistida y traspaso: evidencia de implementación

Implementación local, sin despliegue. Base `734adcbc0a150dbbc61e34cb850697cf965f05b8`; rama `codex/assisted-listings-transfer`, worktree aislado `C:/Users/ACER NITRO/.codex/worktrees/d9a9/karma-house`. El checkout principal y sus modificaciones ajenas no se alteraron. Cliente 0.1.16, Android versionCode 17; Expo 57.0.23, React Native 0.86.3, React 19.2.3.

## Alcance comprobado localmente

- PostgreSQL 17 real, clúster desechable en loopback `127.0.0.1:56432`; migraciones históricas y nuevas aplicadas desde cero. Adaptadores mínimos Auth/Storage y transportes cron/net inertes; no se envían solicitudes externas. Las suites usan rollback y los ensayos de concurrencia limpian las cuentas sintéticas.
- Publicación oficial autorizada y referencia privada; reserva inmutable de creación; un reintento después del traspaso devuelve `KH_PROPERTY_MANAGEMENT_CHANGED` y no duplica la ficha.
- Fotos y miniatura registradas por UUID de ficha; reutilización de adjuntos heredados, rechazo de otra ficha, retiro irreversible y cola con leases/reintentos. Eliminación de cuenta no entrega paths heredados al cliente. Firmas de fichas privadas duran 300 segundos y no se guardan en el caché público.
- Ofertas exclusivamente desde la cuenta principal configurada y protegida, sobre sus fichas asistidas; 1–20 por lote, un colaborador/receptor, siete días, versiones de ficha/procedencia/vínculo y aceptación completa. Campos restantes, favoritos y paths se conservan.
- Diez casos con conexiones independientes prueban doble aceptación/ACK perdido, edición, vencimiento durante espera, reserva competidora, revínculo, desaparición/recuperación del objeto, suspensión, cambio de gestor durante inicio de chat, eliminación y subida concurrente con eliminación: un resultado completo o cero cambios de gestor, sin residuos de fixture.
- Historial de chat conserva participantes y mensajes; receptor no obtiene acceso anterior. Inicio con gestor esperado detecta cambio. ACK de mensaje confirmado sigue recuperable. Publicaciones heredadas no aportan puntuación de publicaciones propias; sí aparecen como gestionadas.
- Transporte fija JWT/actor y descarta respuestas/errores de sesión anterior; decisión conserva identidad en almacenamiento privado tras timeout y reinicio. Endpoint privado niega terceros y canceladas; comprueba de nuevo la solicitud después de firmar. Fixture HTTP local pasa con Auth/Storage simulados.

## Regresiones y diagnósticos

Baseline cliente: typecheck y 362 tests pasaban antes de cambios. La pasada final `npm run check` pasa typecheck y **382/382 tests**. Incluye reconciliación tras aceptación confirmada en servidor con GET perdido, descarte de respuestas anteriores y conservación de identidad de formulario al renovar JWT sin cambiar la sesión autenticada. `npm run export -- --output-dir artifacts/assisted-transfer-export` produjo los bundles Android/iOS/web y sus rutas.

SQL: `cloud_marketplace`, `cover_thumb`, `cover_thumb_upgrade`, `owner_administration`, `operations`, `rent`, `optional_area`, `messaging`, `negotiations`, `chat_negotiation_cards`, `trust_profile`, `notifications`, `search_alerts`, `play_compliance` pasan en el ensayo local actualizado. Las suites nuevas de publicación, medios, limpieza, aceptación, fallos, permisos y chat pasan.

Son **21 suites SQL** sobre `kh_assisted_test_v14`, más los diez ensayos de concurrencia real. La actualización desde una base histórica también conserva exactamente ficha, recibo, fotos, miniatura, favorito y replay de creación. Un objeto ausente impide la migración de forma atómica; el flag comienza false. El dry-run del configurador verificó la identidad protegida en la fixture, sin cambiarla.

Una revisión independiente de la rama completa no encontró P0/P1 ni una fuga o bypass concreto de los permisos/atomicidad revisados. Se corrigieron sus P2: reconciliación de aceptación recuperada, formulario conservado al renovar JWT, fecha/aviso de confirmación antigua y comparación de gestor sin sesión en la ficha pública.

Se reprodujo un fallo del adaptador anterior también sin estas migraciones: asignaba `{}` como metadata por defecto y hacía fallar la comprobación de UPDATE de Storage. Se corrigió el adaptador al campo nullable sin default del [esquema oficial de Supabase Storage](https://github.com/supabase/storage/blob/master/migrations/tenant/0002-storage-schema.sql), y el test original pasó en la base baseline. No se modificó esa aserción para ocultar el fallo.

Se ajustaron fixtures antiguos con `synthetic/photo.jpg` compartido para usar paths únicos actor/request válidos, manteniendo las aserciones de chat/avisos. Cambios legítimos de expectativas: miniatura retirada queda para limpieza de servidor; el guard de pertenencia sustituye el antiguo prefijo mutable; el texto de confianza especifica publicaciones propias; el manifiesto de eliminación entrega archivos sin registro y avatar, mientras el servidor retira adjuntos registrados.

## Interfaz y teléfono físico

El navegador local se recorrió a 390 y 1280 px: entrada oficial protegida, contactos/procedencia privados, colaboradores homónimos identificados por cuenta, confirmación específica del lote y revisión de las imágenes antes de aceptar. La salida de sesión impidió leer la pantalla privada. Se corrigieron una paginación del adaptador UI, un error oculto detrás del modal y un bucle de onLoad de imágenes.

En el **Pixel 7 Pro** conectado se instaló y abrió `com.karmahouse.karmahouse.qa`, 0.1.16/17, ARM64, en paralelo a la instalación habitual `com.karmahouse.karmahouse`, que conserva 0.1.15/16. El paquete QA utiliza solo el gateway loopback mediante adb reverse; HTTP claro y ausencia de configuración Firebase son ajustes únicamente del proyecto nativo ignorado de esa fixture.

Recorrido físico realizado con las cuentas sintéticas oficial, colaborador y comprador:

- Inicio de sesión con teclado real, revisión de dos fichas con imágenes cargadas, confirmación voluntaria, background/foreground y aceptación del lote.
- Con el gateway desconectado, la acción mostró un resultado no confirmado y la BD siguió pending. Al reconectar y repetir, terminó accepted. Antes de cualquier edición posterior, la comparación de las dos filas completas coincidió exactamente con sus snapshots salvo owner_id/version: gestor receptor, versión +1; favorito del comprador conservado.
- Mis anuncios mostró ambas fichas y preservó la pausa. Al editar la ficha recibida, el selector Android canceló, reabrió y seleccionó únicamente la imagen sintética de `KarmaHouse-QA`. La subida y guardado conservaron el original del gestor previo y añadieron un path del receptor; fila en versión 3, pending y paused, dos fotos. Se corrigió una inferencia de tipos en el adaptador SQL de subida; el reintento conservó el borrador.
- El comprador mantuvo su favorito y su mensaje anterior. El chat histórico mostró el aviso de gestión cambiada y deshabilitó composición/envío. Consultar al gestor actual abrió la misma ficha, y Contactar creó una conversación distinta, vacía, con el receptor y composición habilitada. El receptor no tenía el chat anterior.
- La cuenta oficial mostró procedencia privada, las dos cuentas homónimas, fecha de última confirmación y fichas no elegibles después del traspaso. Se inspeccionó el formulario de permiso en el teléfono.

Capturas locales: `artifacts/assisted-transfer-qa/phone-review-confirmed.png`, `phone-my-listings.png`, `phone-edit-two-photos.png`, `phone-old-chat.png`, `phone-new-chat.png` y `phone-confirmation-dates.png`.

La fixture usa **SQL/RLS reales** y bytes seleccionados/transformados en el teléfono, pero **Auth y entrega de Storage simulados**. No acredita cuentas reales ni Supabase desplegado. Las pruebas físicas no incluyen recepción/tap push ni un ensayo de caducidad de cinco minutos.

## Pendiente antes de activar

Verificar Supabase REST/Auth/Storage y función desplegada en un entorno de prueba expresamente autorizado, completar el protocolo operativo y realizar el piloto antes de activar. La preparación de publicación no equivale a autorización de despliegue o distribución.

Este ensayo no demuestra Supabase REST/Auth/Storage real ni ejecución desplegada del endpoint. No se aplicaron migraciones a infraestructura real, no se subieron bytes de imágenes a Storage, no se publicaron anuncios reales y no se probaron recepción/taps de push. La prueba HTTP citada usa un servidor loopback con proveedores simulados.

El flag privado comienza **false**. Distribución, despliegue y piloto requieren la autorización de esa etapa y completar la identidad pública/responsable/retención del protocolo. Desactivar el flag detiene nuevas ofertas/aceptaciones; no revierte lotes aceptados. Las URLs privadas ya entregadas pueden seguir válidas hasta 300 segundos.
