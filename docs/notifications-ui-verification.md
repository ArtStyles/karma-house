# Centro de avisos: estado e interfaz

Fecha: 2026-09-20. Alcance de este registro: controlador, proveedor, pantallas y componentes locales. La aplicación SQL, el fixture remoto, la integración de rutas y la inspección visual corresponden a la verificación de raíz; no se presentan aquí como realizadas.

## Comportamiento implementado

- `NotificationsProvider` usa el resumen ligero cada 30 segundos con la app activa y al volver al primer plano. No descarga páginas fuera del centro.
- `useNotificationCenter` consulta páginas al estar visible y activo. Al salir aborta una página pendiente. El temporizador no cancela lecturas lentas ni reemplaza varias páginas ya cargadas. La actualización manual, volver a la pantalla y reanudar la app recargan la primera página para revalidar visibilidad, incluidos cambios de bloqueo desde otra sesión. El botón de actualización está siempre disponible también en web.
- Todas/Sin leer, paginación por cursor decimal, acciones separadas para abrir conversación y marcar leído. Ningún montaje, navegación o refresco marca avisos ni modifica cursores de chat.
- Marcar todos envía el corte exacto recibido del servidor. Solo tras confirmación modifica los avisos cubiertos; conserva avisos posteriores y muestra errores sin fingir éxito.
- Preferencias de mensajes, visitas y ofertas: formulario local, versión esperada, guardado confirmado, conservación de cambios ante error y descarte/actualización explícitos. Un formulario limpio adopta preferencias actualizadas; un formulario con cambios conserva sus valores y versión. Si una actualización del servidor confirma exactamente sus valores, también adopta la nueva versión para evitar un conflicto artificial en la siguiente edición.
- Textos genéricos del servidor y nombre visible del participante para distinguir conversaciones; la tarjeta no consulta el cuerpo del mensaje, nota, importe, fotos ni datos privados adicionales. Sin SDK push, persistencia local de avisos ni controles ficticios de activación.
- `invalidateAfterBlockChange()` se llama tras confirmación del bloqueo o desbloqueo: vacía todas las páginas en memoria, aborta resultados de lista/resumen/marcado anteriores y recarga solo el contador. Así cubre todas las conversaciones entre ese par sin inferir participantes en la UI.
- Cuentas separadas por actor, JWT capturado, abort y época de sesión. También rechaza callbacks retenidos de una sesión anterior A→B→A. El desmontaje invalida solicitudes y el controlador admite la reactivación de StrictMode.

## Contrato de integración

`src/notifications/NotificationsProvider.tsx` exporta `NotificationsProvider` y `useNotifications()`.

- Campana: `available`, `userId`, `summaryReady`, `summaryError`, `unreadCount`, `refreshSummary()`.
- Centro: `list`, `readThrough`, `marking`, `mutationError`, `setUnreadOnly(bool)`, `refreshList()`, `autoRefreshList()`, `loadMore()`, `pauseList()`, `markRead(id)`, `markAllRead(cutoff)`.
- Ajustes: `preferences`, `preferencesLoading`, `preferencesError`, `savingPreferences`, `loadPreferences()`, `savePreferences(input)`.
- Bloqueo: `invalidateAfterBlockChange(): Promise<void>`; se liga a la cuenta/época del render y no recibe identidad del cliente externo.

## Evidencia local

- TDD inicial: 11 pruebas del controlador fallaron por módulo pendiente, después pasaron al implementar el comportamiento.
- Prueba adicional de invalidación tras bloqueo: fallo observado por método ausente, implementación y verde.
- 15 pruebas del controlador: resumen sin páginas, aislamiento de cuenta, cursor superior a `MAX_SAFE_INTEGER`, corte de marcado, fallo sin cambios, lecturas tardías, preferencias y ACK, refresco/paginación, filtros, A→B→A, StrictMode, callback retenido, bloqueo, salida de pantalla y limpieza del error de marcado tras una recarga confirmada.
- 3 pruebas del borrador de preferencias: formulario limpio, cambios distintos que conservan versión y coincidencia confirmada que adopta versión nueva.
- Suite conjunta de notificaciones: **26/26** pruebas verdes (controlador + dominio + repositorio + borrador).
- `tsc --noEmit`: sin errores al completar ambas pantallas y la integración del proveedor.

La UI usa FlatList, SafeAreaView, etiquetas accesibles, controles de altura mínima 44 y superficies existentes, con acciones apiladas y encabezado en dos niveles para móviles estrechos. La inspección real de 320/390 px y escritorio queda a cargo de la QA de raíz; no se infiere del typecheck.
