# Notificaciones Android de KarmaHouse

## Alcance aprobado

El usuario pidió avanzar con la integración de avisos de mensajes, visitas y ofertas y un APK Android tras vincular Firebase y Expo. Esta es una ampliación de arquitectura sobre el centro interno existente. Se trabaja en `codex/karmahouse-foundation`, conservando los cambios locales y sin commits ni publicación en tiendas. La autorización de continuidad cubre implementación, migración aditiva y programación de su entrega en Supabase; no hace falta volver a aprobar pasos rutinarios.

Resultado: activar avisos de este teléfono desde Tus avisos, desactivarlos, respetar categorías/bloqueos/cierre de sesión, y abrir la conversación autorizada al tocar un aviso. No solicitar permiso al iniciar la app. Android es la plataforma habilitada; web e iOS mantienen su bandeja interna y muestran una explicación, sin simular push habilitado. Sin recordatorios programados de visitas en este bloque.

## Decisiones

Se usa Expo Push, ya vinculado a FCM V1, en lugar de implementar FCM directo. Una cola duradera en PostgreSQL, `pg_cron` y `pg_net` entrega los eventos existentes sin mantener un servidor en este equipo. Las extensiones están disponibles en el proyecto. Un worker Edge añadiría otra autenticación y despliegue sin aportar capacidad necesaria en este volumen; el transporte SQL queda separado del dominio para poder sustituirlo.

La app usa `expo-notifications` compatible con Expo SDK57. Los permisos se piden con una acción explícita; el canal Android `karmahouse-updates` se crea antes del permiso/token. Icono blanco transparente derivado del SVG existente. La versión es 0.1.4, versionCode5, paquete `com.karmahouse.karmahouse`, proyecto Expo `e054aea9-38b4-4211-826b-521b3cc0be9f`.

## Dispositivos y sesiones

Cada instalación guarda en SecureStore una identidad UUID, un secreto aleatorio de 256 bits y una revisión monotónica. El servidor conserva solo el hash del secreto. Las mutaciones se serializan localmente y rechazan revisiones antiguas en servidor, incluyendo A→B→A, respuestas tardías y reintentos. Igual revisión solo es idempotente si coincide toda la operación. Un tombstone de desactivación sobrevive al logout y evita reactivación tardía.

Registro asociado a usuario autenticado y al `session_id` verificado contra `auth.sessions`, con vencimiento de registro a 30 días y renovación en primer plano. El token solo puede estar activo en una instalación: un conflicto con otra instalación activa no puede robarse; una asociación revocada o sin sesión válida puede reemplazarse controladamente. El cliente conserva una revisión de registro válida para renovaciones idénticas; cambios de cuenta/token o desactivación incrementan la revisión. Reanudar no vuelve a solicitar permiso. Cambiar de cuenta desactiva la asociación previa y exige activación explícita para la nueva cuenta.

Antes de cerrar sesión se confirma la desactivación cuando hay registro local activo. Si falla, se comunica el error y se permite reintentar; nunca anunciar revocación confirmada sin servidor. Cambios externos de sesión inician también limpieza por el secreto de instalación. Las tareas pendientes conservan generación, usuario y sesión originales y se cancelan si ya no coinciden. No borrar tombstones cuando `auth.sessions` desaparece.

RPCs:

- `kh_register_push_device(p_actor_id uuid,p_payload jsonb)` recibe `{installationId,installationSecret,revision,expoPushToken,platform:'android',projectId}` y devuelve `{enabled:true,revision,platform:'android'}`.
- `kh_disable_push_device(p_installation_id uuid,p_installation_secret text,p_revision integer)` devuelve `{enabled:false,revision}`. Anónimo solo con posesión del secreto y únicamente para revocar; no permite consultar tokens ni cuentas.
- `kh_resolve_push_notification(p_actor_id uuid,p_notification_id uuid)` devuelve `{conversationId,recipientId,notificationId}` tras comprobar destinatario y visibilidad/bloqueos. Nunca marca leído.

## Cola, transporte y privacidad

Nueva migración aditiva `20260920000500_android_push.sql`; las migraciones 003/004 ya aplicadas son inmutables. Tablas privadas con RLS, RPCs de alcance mínimo y funciones worker accesibles solo a postgres. Un trigger de `kh_private.notifications` encola solo eventos nuevos para dispositivos actualmente registrados. No backfill ni envío de avisos anteriores al activar el teléfono.

El trabajo programado cada 30 segundos procesa lotes acotados, comprueba otra vez sesión, generación, preferencias, lectura del aviso y bloqueos antes de enviar a las URLs fijas de Expo. TTL de una hora. Payload genérico por categoría, sin nombres, anuncios, mensajes, notas, precios ni teléfonos. `data` solo contiene `{kind:'karmahouse.notification',notificationId,recipientId}`; `tag` y `collapseId` estables por aviso. No se aceptan URLs arbitrarias del payload.

Cola persistente separada de tablas UNLOGGED de pg_net. Tickets y recibos se concilian con reintentos acotados y espera creciente para red/429/5xx; errores de configuración quedan como fallo operativo, sin bucle infinito. Recibos se consultan desde los 15 minutos y antes de 24 horas. `DeviceNotRegistered` desactiva solo la generación/token afectado, nunca un registro posterior. Se purgan trabajos terminales antiguos y no se almacenan cuerpos de errores con tokens. El job no debe duplicarse al reejecutar configuración.

La deduplicación de la cola no garantiza entrega externa exactamente una vez: una caída tras aceptación por Expo puede causar un reintento. `tag` limita duplicados visibles. No puede retirarse un aviso que ya salió al proveedor; el texto genérico y la resolución autenticada protegen el cambio de cuenta. Un recibo Expo/FCM correcto no demuestra recepción física.

## Navegación y presentación

En Tus avisos se añade una tarjeta coherente con el diseño existente para este teléfono: activar, estado confirmado, desactivar, permiso bloqueado/abrir ajustes, error/reintento. Las categorías existentes gobiernan bandeja y futuras entregas. Web explica que la activación se hace en la app Android. Al tocar un aviso se valida su formato y cuenta; se espera hidratación/navegación, se consulta el RPC y se abre `/messages/[id]`. Avisos de otra cuenta, inválidos o bloqueados no abren una conversación. Abrir no cambia leído automáticamente.

## Evidencia exigida

Pruebas de controlador/repository/dominio: permisos explícitos, fallos de registro, revocación, token cambiado, cambio de cuenta, A→B→A, respuestas tardías y payload malformado. SQL en rollback: permisos, sesiones, secretos/revisiones, no backfill, categorías, bloqueo, cancelación de cola, tickets/recibos y errores. Pruebas externas no envían avisos a usuarios reales: fixture sintético y simulación de respuestas; prueba de conectividad Expo sin destinatarios.

Aplicar solo tras revisión y rollback verde. Verificar el job remoto, limpiar fixtures y comparar inventario. Suite completa, TypeScript, export Android/iOS/web, revisión visual móvil/web y APK release firmado de pruebas con JS incorporado. Comprobar paquete, versión/código, firma, alineación y ausencia de secretos. Sin dispositivo conectado, recepción con la app cerrada queda explícitamente pendiente del teléfono del usuario.
