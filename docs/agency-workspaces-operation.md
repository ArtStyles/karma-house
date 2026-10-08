# Operación de inmobiliarias

Task 15 prepara controles locales; no acredita un despliegue o activación en producción. La autorización posterior del usuario para migraciones y activación está registrada en el preflight de Task 15. El controlador ejecuta esa autorización después de los gates de revisión y cliente compatible; no se necesita volver a pedir permiso rutinario.

## Decisiones independientes

El módulo habilitado permite iniciar operaciones. Cada inmobiliaria necesita además aprobación de KarmaHouse y miembros vigentes. La verificación es un sello separado: solo el propietario protegido de KarmaHouse puede concederlo, mediante revisión de solicitud o asignación directa documentada. La solicitud debe tener datos de responsable y referencias privadas; correcciones y rechazos conservan su historial. La revisión inicial admite aprobación, solicitud de cambios, rechazo y suspensión según las RPC y sus versiones actuales.

Una agencia aprobada sin verificación publica viviendas mediante revisión individual. Una agencia verificada puede publicar directamente cuando su autoridad de origen y los demás controles lo permiten. La verificación de una colaboradora no cambia la política de la agencia de origen. Revocar únicamente el sello conserva los anuncios ya aprobados: retirar una publicación requiere una decisión expresa de moderación. Verificar no concede propiedad ni autoridad sobre viviendas ajenas.

Gestor: sus casos, contactos y seguimiento. Coordinador: además coordina/asigna casos de su equipo. Administrador: además gestiona equipo, cartera de origen, solicitudes de verificación y confirmación de cierres autorizados. Las invitaciones necesitan aceptación de su destinatario; ni correo ni metadatos Auth conceden un rol. La cuenta protegida de KarmaHouse dispone de recuperación del último administrador y mantenimiento. Desactivar el módulo no bloquea el mantenimiento necesario, la baja de cuentas ni la recuperación autorizada.

Una colaboradora comunica la venta a la fuente actual. La agencia de origen, o el titular personal cuando corresponda, confirma con versiones de propiedad/autoridad/solicitud y recibo idempotente. La comisión corresponde exclusivamente al gestor confirmado como ejecutor del cierre. El cierre termina los procesos comerciales de la identidad canónica y sus alias, conserva ventas/recibos/mensajes y nunca se revierte reabriendo visitas o chats antiguos.

## Modo desactivado

Un miembro actual puede seleccionar «Consultar historial» y leer su alcance autorizado, incluso si la agencia está suspendida. La cartera y sus fotos privadas requieren además mandato activo; un mandato retirado permite únicamente los casos, conversaciones, propuestas, tareas y cierres históricos propios. No habilita el contenido privado actual de otra agencia. Las fotos exigen cuenta vigente, miembro activo, mandato activo y asset attached; los permisos públicos/personales existentes se conservan. Un miembro retirado no conserva acceso. Los avisos guardados abren el mismo alcance de lectura vigente.

La captura de lectura conserva usuario, JWT, generación, aborto y el callback `onAuthorizationError`. Un cambio de cuenta, permisos o generación invalida resultados pendientes. La captura operativa exige módulo activo y agencia aprobada. Los endpoints empresariales comprueban OFF antes de consultar recibos: reintentar un recibo anterior no autoriza una nueva operación. Los reconocimientos de lectura y acciones de seguridad mantienen sus permisos específicos.

## Comandos

Los comandos validan target/acción antes de leer configuración o importar el conector. Sin argumentos terminan con código 2. No existe destino predeterminado ni lectura implícita de credenciales de producción.

```powershell
node scripts/verify-agencies.mjs --target local
node scripts/configure-agencies.mjs --target local --status
node scripts/configure-agencies.mjs --target local --enable --reason 'Prueba local autorizada'
node scripts/configure-agencies.mjs --target local --disable --reason 'Reversión de prueba local'
```

Local requiere `KH_LOCAL_DATABASE_URL=postgresql://agency_test@127.0.0.1:55487/kh_agency_test_legacy_<32 caracteres hex>` y que el usuario sea propietario de ese clon desechable. Se rechaza la base fuente inmutable. El dueño del fixture conserva y comprueba su recibo/runId antes de operar. Los comandos no crean, destruyen ni buscan bases automáticamente.

Hosted exige `--config <ruta absoluta del JSON privado>` además de `--target hosted`. El operador prepara fuera del repositorio `{databaseUrl,caFile,expectedHost,expectedDatabase}`; `caFile` es una ruta absoluta y TLS verifica el certificado. Host y base deben coincidir literalmente con el destino revisado. No se admiten opciones TLS en la URL ni loopback hosted. No se copia ese archivo ni su URL al entorno público de Expo. Task 15 no carga ese archivo ni conecta a hosted.

```powershell
node scripts/verify-agencies.mjs --target hosted --config $agencyPrivateConfig
node scripts/configure-agencies.mjs --target hosted --config $agencyPrivateConfig --status
node scripts/configure-agencies.mjs --target hosted --config $agencyPrivateConfig --enable --reason 'Release revisado; gates OFF y cliente completados'
node scripts/configure-agencies.mjs --target hosted --config $agencyPrivateConfig --disable --reason 'Incidencia de smoke; investigación pendiente'
```

`status` y `verify` usan transacción de solo lectura. `enable` exige inventario completo. El JSON de salida comunica estado y conteos, nunca motivo privado, credenciales, evidencias ni compradores. Código 0 confirma éxito completo; 2 argumentos inválidos; 1 error o desactivación incompleta. Un error genérico no confirma cambio alguno.

`disable` establece OFF aunque el inventario presente deriva. Usa savepoints para que un fallo de inventario o cola no aborte ese cierre de operaciones. Si existe el singleton y el commit funciona, devuelve `disabled:true, enabled:false`; `complete:false` identifica inventario no validado y `cancellationComplete:false`/`failed` identifica cancelación o auditoría incompleta, con salida 1. La ausencia del singleton falla sin afirmar OFF. Esos resultados parciales requieren revisión privada y reparación, nunca activación automática.

Se cancelan recordatorios pending/failed, eventos empresariales pending, terminaciones agency_deal pending/failed y push de categoría agency pending/retry/ticketed/sending/checking_receipt, limpiando su intento activo. Se conservan notificaciones guardadas, recibos, ventas, eventos entregados y trabajos personales, además de provider_accepted/failed/cancelled. Esto impide futuros envíos internos; no retira una entrega ya autorizada externamente ni demuestra recepción física.

## Orden concurrente y recuperación

Las escrituras empresariales toman el bloqueo compartido `kh:agency:module` antes de recibos; configure toma `kh:push:worker` y después el bloqueo exclusivo `kh:agency:module`. Una escritura ya iniciada termina antes de OFF y su trabajo pendiente se cancela; una escritura posterior espera y falla OFF sin nuevo recibo. El coste es esperar transacciones en curso (timeouts de bloqueo 15 s/statement 30 s en el operador). No invertir worker→module. El mantenimiento protegido conserva sus bloqueos establecidos.

Atribuir un nuevo origen asistido exige ON incluso para el propietario protegido: su entrada pública toma el bloqueo compartido antes de los prefijos de cuenta/agencia/propiedad y conserva todas las comprobaciones de procedencia. No se reclasifica esa creación como mantenimiento OFF.

Si un smoke pausa worker en otra conexión, hacer la limpieza exacta del fixture manteniendo esa pausa, **liberar worker antes de llamar configure --disable desde otra conexión**. Mantenerlo mientras se espera configure bloquearía al propio operador. Una rutina en la misma sesión tendría que tomar el mismo orden y mantener toda la transacción; los CLI aquí abren su propia sesión.

Ante incidencia: desactivar explícitamente, comprobar OFF y cancelación, conservar la evidencia sanitizada y los recibos, corregir y repetir gates. La desactivación es reversión operativa: no borra migraciones ni deshace ventas. La restauración de respaldo es una recuperación extraordinaria del entorno completo, coordinada con datos/Storage/Auth posteriores al respaldo, nunca una forma rutinaria de reabrir negocios vendidos.
