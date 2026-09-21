# Cliente Android de notificaciones

Verificado localmente el 20 de septiembre de 2026. Alcance: cliente, persistencia segura, contrato RPC, integración de sesión y apertura autorizada de conversaciones. No se ejecutó una compilación ni una prueba física desde este bloque.

## Integración

- `src/push/PushProvider.native.tsx` habilita push solamente en Android fuera de Expo Go, con Supabase configurado. Web, iOS y Expo Go devuelven `supported: false` y `permission: 'unavailable'`.
- `usePushNotifications` expone `supported`, `ready`, `enabled`, `busy`, `permission`, `canAskAgain`, `error`, `enable()`, `disable()`, `refresh()` y `openSettings()`.
- `permission` es `undetermined | granted | denied | unavailable`. Activar es la única operación que puede solicitar permiso. Se crea antes el canal `karmahouse-updates`.
- `enabled` mantiene el último estado activo confirmado mientras una revocación o sustitución de token quede sin confirmar; el error indica que debe reintentarse. No se anuncia una desactivación por una respuesta fallida.
- `PushProvider` está dentro de `NotificationsProvider`; una recepción de la cuenta actual actualiza su resumen. El handler de primer plano suprime avisos de otra cuenta o sin sesión hidratada.
- Antes de `auth.signOut` se ejecuta la barrera de revocación. Una instalación nunca activada puede cerrar sesión sin red; cualquier registro persistido confirmado o incierto debe revocarse. Un error conserva la sesión y comunica el reintento.

## Persistencia y concurrencia

SecureStore conserva un UUID, un secreto aleatorio de 32 bytes, la revisión monotónica y la intención de registro/desactivación. Las escrituras están serializadas y preceden la mutación remota. Una escritura fallida no permite enviar el registro. El secreto no se imprime ni se publica en el estado React.

Las renovaciones idénticas reutilizan la revisión; cambios de token o desactivación generan una revisión mayor. El límite compartido con SQL es 999999999, y la parte variable del Expo token tiene entre 10 y 200 caracteres. Los reintentos conservan la misma operación y revisión. Una desactivación explícita crea un tombstone incluso sin registro anterior; el cierre de sesión nunca activado solo invalida las tareas locales que aún no llegaron a persistirse.

Los contextos de registro y resolución capturan usuario, `session_id`, JWT, generación y señal de cancelación. El JWT se usa únicamente como identidad local de cancelación: el servidor autentica y comprueba `auth.sessions`. Cambiar de cuenta, incluido A→B→A, invalida trabajos anteriores. La renovación de JWT de la misma sesión no cancela una operación válida. El desmontaje suspende y aborta el controlador; una repetición de efectos de React puede reanudarlo sin perder la intención persistida.

El repository utiliza los tres RPC exactos de la especificación. Registro y resolución usan el JWT capturado y `p_actor_id`. La revocación usa solo la credencial de instalación y la clave pública del proyecto, sin depender de la cuenta actual. Las respuestas se validan antes de publicar estado; los errores del transporte no exponen cuerpos del servidor.

## Apertura de avisos

Solo se admite `{kind:'karmahouse.notification',notificationId,recipientId}` con UUID válidos y sin campos adicionales. Se espera la hidratación de sesión y la raíz de navegación, se verifica el destinatario y se consulta `kh_resolve_push_notification`. Solo su conversación autorizada permite abrir `/messages/[id]`. Ninguna operación del cliente push marca el aviso como leído.

Los identificadores de respuesta se deduplican. La respuesta nativa retenida se borra únicamente cuando coincide con la respuesta procesada, para no borrar un toque más reciente. Avisos inválidos, bloqueados, ajenos o resueltos después de cambiar de cuenta no abren conversación.

## Evidencia

- Pruebas nuevas: `tests/push-controller.test.ts`, `tests/push-domain.test.ts`, `tests/push-repository.test.ts`: 29 casos de comportamiento tras la revisión. Primer pase sin módulos falló por funcionalidades ausentes; los casos adicionales de cierre nunca activado, reinicio tras revocación fallida, suspensión y limpieza de respuestas fallaron antes de sus correcciones. La revisión añadió la suspensión durante la primera hidratación, tanto sin activar como con una activación persistida: falló antes del arreglo y pasó después.
- `npm run typecheck`: salida 0.
- Suite final de Node: 207 pruebas, 207 aprobadas, 0 fallos (incluye la regresión de Metro añadida al integrar el APK).
- Cubren permiso explícito/denegado, fallo de red, reintentos idénticos, cambio de token/JWT/cuenta, A→B→A, respuestas tardías, persistencia, tombstone, cierre sin conexión, revocación fallida, cold start, deduplicación, aislamiento de destinatario, respuestas RPC adversarias y cancelación de transporte.
- No se afirma recepción física, entrega Expo/FCM ni validación de la migración a partir de estas pruebas. Esas evidencias pertenecen al backend y a la prueba del APK en Android.

Documentación de API consultada antes del código: [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/), [Notifications SDK57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) y [Crypto SDK57](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/). Se usan las APIs sincrónicas actuales `getLastNotificationResponse` y `clearLastNotificationResponse`, y los tipos instalados de `expo-notifications ~57.0.20`.
