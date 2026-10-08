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

## Perfiles estrictos local y hosted

`verifyAgencies(db, 'local' | 'hosted')` selecciona explícitamente un perfil revisado. Las llamadas históricas de fixture sin segundo argumento conservan `local`; los CLI siempre pasan su target validado como perfil. Un target/perfil distinto se rechaza antes de configuración, conexión o consultas. No hay detección permisiva del entorno. La salida incluye `profile`. Ambos perfiles fijan las diez migraciones y sus bytes/ledger, 241 definiciones de función y permisos efectivos anon/authenticated/service_role, 41 tablas con metadatos/permisos de tabla/columna, siete adjuntos administrados y sus estados de disparo, bucket privado y singleton.

La base del manifest sigue siendo el esquema local revisado. `profiles.hosted` contiene exclusivamente 109 cambios exactos de EXECUTE service_role y dos hashes de triggers Auth derivados de las mismas definiciones/estados con `auth.users` RLS **true**, FORCE RLS **false**. El resto de los pines es compartido literalmente. Desactivar RLS, activar FORCE RLS, cambiar/desactivar un trigger o añadir/quitar cualquier permiso efectivo esperado falla. No se modifican los defaults ni RLS de Auth en producción para satisfacer el fixture.

La derivación de service_role procede de los defaults de funciones del esquema public del propietario Supabase: EXECUTE para anon/authenticated/service_role. REVOKE a PUBLIC no retira grants explícitos a esos roles; CREATE OR REPLACE conserva el ACL y SET SCHEMA/RENAME conserva la identidad. Todas las 102 funciones públicas inventariadas conservan service_role (una ya estaba true en el perfil local, por lo que son 101 overrides). Ocho funciones privadas conservan su grant de creación pública y revocan únicamente PUBLIC/anon/authenticated:

- `full_public_profile(uuid)`: `20261003000100_owner_administration.sql` trasladó/renombró `kh_public_profile`; las sustituciones de octubre conservan su ACL.
- `personal_kh_save_property(jsonb)`, `personal_kh_submit_property(uuid)`, `personal_kh_set_property_status(uuid,text)`: `20261007000300_agency_property_origins.sql` traslada las RPC históricas y revoca los tres roles de cliente.
- `link_assisted_agency_before_aliases(uuid,jsonb)`: la RPC pública se crea en `20261007000300` y se traslada/renombra en `20261007000400` conservando service_role.
- `kh_review_agency_before_lifecycle(uuid,jsonb)`: creada públicamente en `20261007000200`, renombrada y trasladada en `20261007000500`.
- `kh_create_negotiation_pre_scheduling(uuid,jsonb)` y `kh_respond_negotiation_pre_scheduling(uuid,jsonb)`: RPC históricas públicas de `20260920000300_negotiations.sql`, renombradas y trasladadas en `20261007000700`.

El parser anterior conservaba tres nombres públicos inexistentes para los últimos tres helpers. Ahora registra sus identidades finales privadas y fija sus definiciones/grants, conservando literalmente los 238 pines previos. El inventario no acepta esos nombres fantasma como prueba de existencia. Los overrides hosted están enumerados por firma exacta en el manifest; no se generan desde el catálogo del destino ni se ignoran permisos de service_role.

### Extensión de administración y agencia principal

El estado histórico de diez migraciones continúa verificándose contra `supabase/agency-activation-manifest.json`, sin cambiar ese archivo ni sus registros SQL/hash. La extensión revisada contiene exactamente `20261008000100_principal_agency.sql` y `20261008000200_administration_queries.sql`. `supabase/agency-administration-activation-manifest.json` enlaza el SHA-256 del manifest histórico con saltos LF, fija los bytes de ambas migraciones y el inventario completo resultante: **12 migraciones, 249 funciones y 43 tablas**. Solo para ese enlace del JSON se acepta la conversión CRLF estándar de Git; cualquier otro cambio de bytes cambia el hash. Los SQL y recibos siguen comparándose literalmente, sin normalizar saltos. Sus pines hosted conservan todos los anteriores y enumeran los nuevos permisos exactos; no se derivan del catálogo de producción al verificar.

Antes de actualizar un despliegue existente, comprobar el perfil histórico, respaldo legible, recibos y cliente compatible con `isPrincipal`. Aplicar ambas migraciones en orden y registrar cada SQL UTF-8/LF como un único elemento de `statements`, junto con su SHA-256, dentro de una sola transacción. Usar `administrationMigrationArtifacts()` para obtener solo los dos archivos nuevos; `reviewedAdministrationManifest('hosted')` devuelve los doce archivos y el contrato completo. Ejecutar `verifyAgencies(db, 'hosted')` en esa misma conexión antes de COMMIT. Conservar literalmente los diez recibos históricos, los datos existentes y la bandera previa; la extensión y el verificador no habilitan el módulo.

El ledger selecciona el inventario completo de diez o doce migraciones. Una sola migración nueva, cualquier versión adicional del prefijo `20261008`, SQL/hash distintos, o esquema extendido sin sus dos recibos falla. Las definiciones, ACL efectivos, columnas/defaults/constraints/índices/triggers/RLS/políticas y adjuntos administrados siguen comparándose íntegramente. El mismo CLI de `verify`/`status` muestra el conteo del estado aplicado y conserva `enabled`.

La prueba nativa independiente `scripts/local-sql/verify-agency-administration.mjs --profile local|hosted` exige `KH_ADMIN_MANIFEST_TEST_DATABASE_URL=postgresql://agency_test@127.0.0.1:55491/kh_agency_test_administration_manifest_20261008`, una fuente propia vacía anterior a agencias. Crea y elimina únicamente clones propios; no carga configuración ni credenciales hosted. Comprueba primero el contrato histórico exacto y después el extendido, rechaza prefijos incompletos y quince alteraciones de ledger, funciones, permisos, tablas y triggers por perfil, y conserva bytes e inventario de la fuente. `--record-manifest` genera el manifest adicional desde ambos perfiles de esa fixture; nunca reemplaza el manifest histórico.

### Remediación acotada de los dos permisos anónimos

`kh_set_agency_logo(uuid,uuid,text,integer)` y `kh_agency_review_detail(uuid,uuid,uuid)` se crearon después del bloque de revocación de `20261007000200`; su REVOKE posterior solo menciona PUBLIC. Los defaults públicos de Supabase dejaron un EXECUTE explícito para anon. **Ambos perfiles exigen anon=false**. Las migraciones aplicadas son inmutables; esta corrección operativa no añade SQL ficticio al ledger.

Solo el controlador raíz, después de revisión independiente y respaldo verificado, debe importar `remediateAgencyPlatform` de `scripts/agency-platform-remediation.mjs`. El módulo no tiene CLI ni lee configuración/conecta/muta al importar. Usar una conexión dedicada, sin transacción previa, abierta con `agencyConnection` tras validar literalmente `--target hosted --config <JSON privado absoluto>`; nunca pasar una URL directa ni reutilizar una sesión con worker pausado externamente. En esa conexión:

```javascript
// El controlador ya validó el comando hosted, respaldó el destino y conectó db.
const {remediateAgencyPlatform} = await import('./scripts/agency-platform-remediation.mjs');
const result = await remediateAgencyPlatform(db, 'hosted');
```

La rutina exige el perfil hosted explícito, toma los bloqueos migration→worker→module, bloquea el singleton y exige OFF. Compara todo el inventario con el perfil hosted, permitiendo en el **estado previo únicamente** anon=true para esas dos firmas. Un tercer grant, definición distinta, helper ausente o estado ya corregido aborta. Ejecuta una sola sentencia atómica `REVOKE EXECUTE ON FUNCTION public.kh_agency_review_detail(uuid,uuid,uuid), public.kh_set_agency_logo(uuid,uuid,text,integer) FROM anon`, verifica de nuevo ledger/bytes/esquema/grants/bucket/OFF con el perfil hosted y confirma. Cualquier fallo revierte ambos revokes; no activa, cambia defaults/RLS ni modifica datos comerciales/ledger. Éxito devuelve `complete:true`, `profile:'hosted'`, `enabled:false`, `revokedAnonymousExecute:2`. Una repetición falla por estado previo ya corregido y requiere comprobar `verify`, sin reintento automático.

Después, ejecutar `verify-agencies --target hosted --config ...` y `configure-agencies --target hosted --config ... --status`; ambos deben confirmar el mismo perfil completo y OFF antes de continuar los gates de release. La prueba de clon solo acredita estas reglas locales; el controlador verifica por separado el resultado real del destino, los usuarios/Auth/Storage y la publicación/activación autorizadas.

`disable` establece OFF aunque el inventario presente deriva. Usa savepoints para que un fallo de inventario o cola no aborte ese cierre de operaciones. Si existe el singleton y el commit funciona, devuelve `disabled:true, enabled:false`; `complete:false` identifica inventario no validado y `cancellationComplete:false`/`failed` identifica cancelación o auditoría incompleta, con salida 1. La ausencia del singleton falla sin afirmar OFF. Esos resultados parciales requieren revisión privada y reparación, nunca activación automática.

Se cancelan recordatorios pending/failed, eventos empresariales pending, terminaciones agency_deal pending/failed y push de categoría agency pending/retry/ticketed/sending/checking_receipt, limpiando su intento activo. Se conservan notificaciones guardadas, recibos, ventas, eventos entregados y trabajos personales, además de provider_accepted/failed/cancelled. Esto impide futuros envíos internos; no retira una entrega ya autorizada externamente ni demuestra recepción física.

## Orden concurrente y recuperación

Las escrituras empresariales toman el bloqueo compartido `kh:agency:module` antes de recibos; configure toma `kh:push:worker` y después el bloqueo exclusivo `kh:agency:module`. Una escritura ya iniciada termina antes de OFF y su trabajo pendiente se cancela; una escritura posterior espera y falla OFF sin nuevo recibo. El coste es esperar transacciones en curso (timeouts de bloqueo 15 s/statement 30 s en el operador). No invertir worker→module. El mantenimiento protegido conserva sus bloqueos establecidos.

Atribuir un nuevo origen asistido exige ON incluso para el propietario protegido: su entrada pública toma el bloqueo compartido antes de los prefijos de cuenta/agencia/propiedad y conserva todas las comprobaciones de procedencia. No se reclasifica esa creación como mantenimiento OFF.

Si un smoke pausa worker en otra conexión, hacer la limpieza exacta del fixture manteniendo esa pausa, **liberar worker antes de llamar configure --disable desde otra conexión**. Mantenerlo mientras se espera configure bloquearía al propio operador. Una rutina en la misma sesión tendría que tomar el mismo orden y mantener toda la transacción; los CLI aquí abren su propia sesión.

Ante incidencia: desactivar explícitamente, comprobar OFF y cancelación, conservar la evidencia sanitizada y los recibos, corregir y repetir gates. La desactivación es reversión operativa: no borra migraciones ni deshace ventas. La restauración de respaldo es una recuperación extraordinaria del entorno completo, coordinada con datos/Storage/Auth posteriores al respaldo, nunca una forma rutinaria de reabrir negocios vendidos.
