# Centro de notificaciones de KarmaHouse

## Alcance acordado por continuidad

El usuario pidió continuar con la siguiente mejora después de visitas/ofertas. La hoja de ruta coloca los avisos a continuación. Se entrega un bloque completo de avisos **dentro de KarmaHouse**, con eventos reales en Supabase, bandeja, contador y preferencias. No hay configuración local de proyecto Expo, FCM ni APNs; la pregunta al usuario sobre sus cuentas sigue abierta. La entrega de push con la app cerrada es una integración posterior que requiere esas cuentas, una compilación y evidencia física. No se añade un interruptor que finja activar push, ni SDK, cron o worker sin una integración utilizable.

## Experiencia

Campana en Explorar, entrada en Mi espacio y menú de cuenta, centro `/notifications` con Todas/Sin leer, lista paginada y apertura de la conversación correspondiente. Abrir la pantalla o actualizarla no marca avisos leídos. Cada aviso tiene una acción explícita para marcarlo leído; abrir la conversación conserva esa separación. Marcar todos afecta solo avisos existentes hasta el corte obtenido del servidor, sin tragarse nuevos avisos. La lectura del chat conserva sus reglas actuales.

Preferencias en `/notification-settings`, accesibles desde el centro y Ajustes de cuenta: nuevos avisos de mensajes, visitas y ofertas. Todas activas inicialmente. Desactivar una categoría impide crear avisos futuros de ese tipo, sin borrar el historial ni impedir mensajes/propuestas. Texto visible aclara que estos ajustes corresponden a la bandeja dentro de KarmaHouse; no promete recepción con la app cerrada.

## Eventos y privacidad

Solo para el destinatario de un mensaje o acción de negociación. El evento contiene metadatos de su conversación, título original del anuncio y texto genérico de servidor. Nunca se copia texto del mensaje, nota, importe o foto a la notificación. No se importan avisos históricos durante la migración.

Los resúmenes de visitas/ofertas se enlazan explícitamente con su evento estructurado: una columna nullable en `kh_messages` y helper privado de persistencia. La API pública de mensajes conserva su firma y nunca admite origen de negociación del cliente. Un único trigger sobre mensajes crea avisos; los snapshots `superseded`/`expired` no generan avisos separados. Una contraoferta produce un aviso. Reintentos confirmados no vuelven a insertar el mensaje ni el aviso.

Las funciones públicas verifican actor capturado y autenticado. Tablas privadas/RLS y permisos cerrados: sin acceso de otros usuarios ni acceso general administrativo. El servidor aplica bloqueo tanto en creación como en lista/contador/marcado. Los avisos anteriores de cuentas bloqueadas quedan ocultos mientras exista el bloqueo; al desbloquear pueden reaparecer como historial. Un anuncio no disponible conserva el historial autorizado del chat; las cancelaciones bloqueadas/no disponibles siguen sin generar nuevos mensajes ni avisos.

## Contrato de datos

Archivo compartido `src/notifications/types.ts`:

```ts
type NotificationCategory = 'message' | 'visit' | 'offer';
interface AppNotification {
  id: string; seq: string; recipientId: string; category: NotificationCategory;
  conversationId: string; messageId: string; negotiationId: string | null;
  actorId: string; actorName: string; propertyTitle: string;
  title: string; body: string; createdAt: string; readAt: string | null;
}
interface NotificationPreferences { messages: boolean; visits: boolean; offers: boolean; version: number }
interface NotificationPage { items: AppNotification[]; nextCursor: string | null; unreadCount: number; readThrough: string }
interface NotificationRepository {
  summary(context: MessagingRequestContext): Promise<{ unreadCount: number; readThrough: string }>;
  list(options: { beforeSeq?: string; unreadOnly?: boolean; category?: NotificationCategory }, context: MessagingRequestContext): Promise<NotificationPage>;
  markRead(id: string, context: MessagingRequestContext): Promise<{ unreadCount: number }>;
  markAllRead(readThrough: string, context: MessagingRequestContext): Promise<{ unreadCount: number }>;
  preferences(context: MessagingRequestContext): Promise<NotificationPreferences>;
  savePreferences(input: { messages: boolean; visits: boolean; offers: boolean; expectedVersion: number }, context: MessagingRequestContext): Promise<NotificationPreferences>;
}
```

RPCs: `kh_notification_summary(p_actor_id)`, `kh_list_notifications(p_actor_id,p_before_seq text=null,p_unread_only=false,p_category text=null,p_limit=30)`, `kh_read_notification(p_actor_id,p_id)`, `kh_read_notifications_through(p_actor_id,p_through_seq text)`, `kh_get_notification_preferences(p_actor_id)`, `kh_save_notification_preferences(p_actor_id,p_payload)`.

`seq` se transporta como cadena decimal sin pérdida de precisión. Orden descendente estable y consulta por cursor, máximo 30 por página desde el cliente. `unreadCount` y `readThrough` representan todos los avisos visibles del destinatario, independientemente del filtro de esa página; `'0'` para el corte vacío. Asignación de secuencia serializada por destinatario antes de `nextval`, para que un commit tardío no quede antes de un corte ya presentado. El marcado solo modifica filas existentes; nunca almacena un cursor que dé por leídas futuras inserciones.

Preferencias ausentes: true/true/true/version0. Guardado con versión esperada, y reintento idempotente si todos los campos deseados ya coinciden con lo confirmado. Un conflicto real obliga a actualizar. Capturar JWT/actor/AbortSignal por petición y descartar resultados de sesiones anteriores, también A→B→A. No publicar éxito antes del servidor.

## Cliente y estado

Controlador y proveedor global separados de la UI, como mensajería. El contador se consulta con el RPC ligero `kh_notification_summary` cada 30 segundos en primer plano y al reanudar. Se descargan páginas solo al usar el centro. Ningún refresco automático aborta una petición lenta ni borra páginas cargadas. La UI muestra errores y reintento; al cambiar de cuenta limpia inmediatamente lista, contador, preferencias y operaciones pendientes. Sin persistencia de avisos privados en disco.

Mismas superficies, tipografía y controles de KarmaHouse. FlatList virtualizada, acciones con etiquetas accesibles, estados vacío/cargando/fallo y diseño comprobado a 320/390 px y escritorio. Datos de demo no fabrican actividad personal.

## Verificación

Tests de dominio/repositorio/controlador con red/green; permisos y comportamiento SQL en rollback antes de aplicar. Regresión de mensajería y negociaciones al cambiar helpers; reintentos, una contraoferta/un aviso, resumen humano que imita texto, preferencias, paginación, corte de lectura y aislamiento/bloqueos. Prueba concurrente real de corte/insert y creación idempotente. Fixture sintético acotado entre comprador/vendedor/tercero, sin push ni correo externos, seguido de logout, cleanup e inventario previo intacto. TypeScript, suite completa, exportación de Android/iOS/web y revisión de valores privados. No APK ni prueba de teléfono en este bloque.
