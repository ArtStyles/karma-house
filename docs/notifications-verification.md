# Entrega de notificaciones — 2026-09-20

## Alcance

Centro privado de avisos dentro de KarmaHouse para mensajes, visitas y ofertas: campana/contador, Todas/Sin leer, lectura individual o por corte y preferencias por cuenta. Accesos desde Explorar, Mi espacio, menú del avatar y Ajustes. No entrega push con la app cerrada, recordatorios, correo, proveedores nuevos ni generación de APK/IPA.

## Verificación de código y compilación

- Suite completa final: **177/177** pruebas verdes, incluidas 27 de notificaciones. Registro local: `artifacts/notifications-tests.log`.
- TypeScript: `tsc --noEmit` sin errores después de integrar rutas, proveedor, accesos y cambio de bloqueo.
- Expo57: exportación Android/iOS/web completada en `artifacts/notifications-export`. Android 1534 módulos, iOS 1395, web 1024. Son bundles, no aplicaciones instalables ni evidencia de ejecución física.
- Escáner de credenciales: 618 archivos fuente/exportados comprobados; sin claves privadas ni correo de administrador.
- Revisión independiente de backend/UI sin hallazgos pendientes: preservación de chat, origen de avisos, bloqueos, permisos, lectura por corte, reintentos, refresco y versiones de preferencias.
- Las migraciones anteriores se conservaron. La nueva `20260920000400_notifications.sql` tiene SHA-256 `a9307bf072be3fb06d5c2499d1722165496379d3eee7aad0daa88434ed070811`.

## Servidor

Aplicación confirmada en Supabase tras dos ensayos rollback y revisión. Mensajería, negociaciones y notificaciones pasaron antes del commit; el inventario de datos existentes permaneció igual y no se generó historial retroactivo. [Detalles de datos](notifications-data-verification.md) y [registro de aplicación](notifications-sql-apply.log).

Concurrencia remota confirmada: dos reintentos simultáneos generan un aviso, remitentes distintos ordenan la secuencia antes de asignarla, el marcado por corte conserva el siguiente aviso y un cambio confirmado de preferencias gobierna un envío que estaba esperando. Acceso anónimo REST rechazado. [Registro](notifications-concurrency-verify.log). La primera ejecución sufrió un corte al abrir una conexión; se recuperaron únicamente sus fixtures y se comprobó el inventario antes de repetir con éxito. El SQL aplicado no cambió.

## Interfaz y límites

[Contrato y pruebas de interfaz](notifications-ui-verification.md). Se recorrió la app conectada a Supabase con tres cuentas sintéticas confirmadas sin enviar correos: comprador, vendedor y tercero. Se inspeccionaron 320×740, 390×844 y 1280×900, sin errores de consola.

1. El vendedor abrió una bandeja vacía, desactivó avisos de mensajes y guardó. Tras salir y volver a entrar, la preferencia seguía desactivada.
2. El comprador envió un mensaje, una visita futura y una oferta: quedaron tres mensajes, dos eventos y exactamente dos avisos al vendedor (visita/oferta). [Estado inicial](notifications-browser-initial-state.log).
3. El vendedor marcó solo la oferta: el filtro Sin leer mostró la visita y contador 1. Abrió el chat, aceptó la visita, hizo una contraoferta y regresó: el aviso seguía sin leer. El marcado conjunto lo dejó en 0, sin eliminar el historial.
4. El comprador recibió exactamente tres avisos: visita aceptada, contraoferta y mensaje. Un texto que comenzaba con «Oferta propuesta» permaneció en la categoría Mensaje. Las tarjetas no mostraron notas, importe ni texto del chat.
5. La campana reflejó 3 avisos. Bloquear al vendedor ocultó las tres tarjetas y puso el contador en 0; el historial de chat permaneció disponible. Desbloquear restauró los tres avisos sin duplicarlos. [Estado bloqueado](notifications-browser-blocked-state.log).
6. La cuenta ajena mostró 0 avisos y preferencias predeterminadas, sin datos ni estado de las otras cuentas. Se comprobaron los accesos de Mi espacio, menú del avatar y Ajustes.
7. Se cerró la sesión antes de limpiar. [Estado final](notifications-browser-final-state.log): vendedor 2 avisos leídos, comprador 3 sin leer y tercero 0. [Limpieza](notifications-browser-cleanup.log): cero cuentas, anuncios, fotos, chats, propuestas, avisos o preferencias temporales restantes; inventario previo intacto.

La paginación superior a 30, carreras de lectura, fallos de conexión y reintentos se cubrieron en pruebas automatizadas/SQL; no se presentan como gestos realizados en el navegador. La vista local quedó activa en el puerto 8083, sin sesión temporal.

Las consultas periódicas de avisos son cada 30 segundos en primer plano. No se añadieron Expo Push, FCM/APNs, tokens, cron ni avisos externos. La instalación en Android/iPhone necesita un nuevo build y pruebas físicas; el APK 0.1.3 existente no contiene estas pantallas.
