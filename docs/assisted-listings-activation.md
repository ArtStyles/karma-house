# Preparación del backend y activación controlada

La preparación del backend y la distribución del cliente 0.1.16 fueron autorizadas el 6 de octubre de 2026. Esto no activa traspasos ni autoriza utilizar material real en el piloto. La cuenta principal debe coincidir con `kh_private.platform_owner`; no se busca por nombre ni se sustituye por otro administrador.

## Preparación ejecutada el 6 de octubre de 2026

Se aplicaron y registraron las tres migraciones en una única transacción al proyecto que utiliza el cliente de producción. Antes del inventario y del primer backfill se adquirió `LOCK TABLE public.properties, storage.objects IN ACCESS EXCLUSIVE MODE`, con `lock_timeout='5s'` y `statement_timeout='60s'`. Este bloqueo previo impide que una publicación o subida concurrente quede fuera del inventario inicial. Una repetición debe comprobar el ledger y no volver a ejecutar estas migraciones ya registradas.

La transacción verificó la cuenta protegida y confirmada, la igualdad completa de las filas de propiedades antes/después, los conteos de Storage y los backfills. Se conservaron las tres propiedades y los cinco objetos existentes; cinco referencias de medios, sin ausencias ni duplicados. `official_publisher_id` coincide con `platform_owner` y **`transfers_enabled=false`**.

La función `listing-transfer-preview` se desplegó mediante el workflow manual [assisted-backend.yml](../.github/workflows/assisted-backend.yml), con verificación JWT habilitada y comprobación del proyecto de destino. Ejecución: [37498365522](https://github.com/ArtStyles/karma-house/actions/runs/37498365522).

La verificación fresca cubrió 21 suites SQL y diez escenarios concurrentes en PostgreSQL local; seis suites nuevas se ensayaron además en el proyecto alojado dentro de una transacción revertida. Los fixtures que eliminan `storage.objects` por SQL o suponen un inventario vacío se reservaron a la base local: en el proyecto alojado se utilizó la API real de Storage para subir y eliminar únicamente bytes sintéticos.

La prueba remota posterior utilizó dos cuentas Auth confirmadas y sesiones reales. Verificó RPC y rechazo de un actor suplantado, subida privada, aislamiento de fotos, vista previa del receptor con JWT válido, descarga anónima de los bytes firmados con vencimiento de 300 segundos y rechazo después de cancelar. El anuncio sintético permaneció pausado y nunca fue visible en el catálogo público. La limpieza eliminó solo sus filas, objetos mediante Storage API y cuentas mediante Auth Admin API; el inventario final volvió a tres propiedades y cinco objetos, sin cuentas, propiedades ni colaboradores de prueba. El flag permaneció false durante todo el ensayo; las ofertas y aceptaciones reales no se activaron.

La preparación técnica no sustituye completar responsable, permiso y retención en el protocolo, el recorrido físico del cliente público ni el piloto. Las ofertas y aceptaciones seguirán desactivadas hasta revisar esas etapas y autorizar su activación.

## Orden de preparación

1. Completar nombre público oficial, responsable de consultas, texto del permiso y retención de evidencias en [el protocolo](assisted-listings-operation.md).
2. Elegir un entorno de prueba acordado. Revisar el inventario de fotos y miniaturas existentes antes de aplicar las tres migraciones `20261005000100`, `20261005000200` y `20261005000300`. Un archivo ausente o una referencia duplicada detiene el backfill; se resuelve con evidencia, sin borrar material comercial silenciosamente. El flag queda false.
3. Desplegar `listing-transfer-preview` con verificación JWT habilitada. Su cliente de servidor necesita la clave de servicio únicamente en el entorno de la función. Revisar los grants y el endpoint con oficial, receptor, tercero y anon mediante Supabase REST/Storage reales.
4. Ensayar el recorrido completo con tres cuentas sintéticas y bytes reales en Storage: autorización/publicación, favorito/chat comprador, aceptación, consulta al nuevo gestor, edición con fotos heredadas/nuevas, pausa/revisión y limpieza interrumpida/reintentada. Registrar el inventario y limpiar solo esas fixtures.
5. Distribuir primero el cliente compatible 0.1.16 (Android versionCode 17), firmado con el certificado habitual. El APK preview local usa la firma de prueba y no sirve para actualizar la instalación pública. Comprobar en Android físico teclado, imágenes, reconexión, background/foreground, enlace/favorito y chat. Recepción y tap push ordinarios requieren evidencia física separada.
6. Revisar configuración con una conexión explícita de operador; este script nunca lee `infra/.env.local` automáticamente:

```powershell
# Introducir la conexión de operador por un canal privado, sin guardarla en Git ni logs.
# KH_ASSISTED_DATABASE_URL debe apuntar al entorno autorizado.
node scripts/configure-assisted-listings.mjs --official <UUID-protegido-confirmado> --transfers off --dry-run
```

Solo después de autorizar esa etapa y revisar cliente/endpoint/piloto, el operador aplica la misma configuración con `--commit`; para `--transfers on` exige también `--client-reviewed`. Esto expresa una revisión operativa, no demuestra que las pruebas se hayan realizado.

## Piloto y recuperación

Empezar con un colaborador voluntario, vínculo exacto confirmado por canal conocido y una ficha autorizada con disponibilidad reciente. El receptor revisa y acepta libremente. Cada lote tiene 1–20 fichas, siete días de servidor y aceptación completa; pueden seguir otros lotes sin límite acumulado.

Ante errores, desactivar nuevas ofertas/aceptaciones con `--transfers off --commit`. Conservar la gestión ya aceptada, los chats anteriores y los adjuntos en uso. Un lote obsoleto requiere una oferta nueva; no cambiar snapshots ni revertir gestores por SQL. Para una respuesta perdida, repetir la misma acción con el identificador conservado por el cliente.

`cleanup-retired-media.mjs` empieza en dry-run, usa leases y solo opera los paths que devuelve la cola privada. Revisar primero su destino explícito y ejecutar `--commit` solo en el entorno acordado. No borrar prefijos de cuentas completas: pueden contener material heredado de fichas gestionadas por otra cuenta.

Las firmas privadas caducan como máximo a los 300 segundos; cancelar no revoca instantáneamente una firma ya emitida. El cliente las mantiene solo en memoria y exige refrescar la revisión cuando vencen.

## Ensayos reproducibles locales

```powershell
$env:KH_LOCAL_DATABASE_URL='postgresql://kh_test@127.0.0.1:56432/kh_assisted_test_nuevo'
node scripts/local-sql/setup.mjs
node scripts/verify-assisted-listings-transfer.mjs
# Para el ensayo de actualización, usar otra base nueva y setup --baseline-only.
node scripts/local-sql/verify-assisted-upgrade.mjs
```

La fixture UI usa otra base vacía `kh_assisted_test_ui...`, el adaptador loopback `scripts/assisted-listings-ui-fixture.mjs` y variables públicas del proceso Expo apuntando a `http://127.0.0.1:56433`. Su Auth y entrega de bytes son simulados; sus RPC/RLS son SQL real. Esa fixture no acredita un despliegue de Supabase.

Al cambiar las variables públicas del backend entre QA y el cliente preparado, usar `scripts/build-android-preview.ps1 -RefreshBundleCache` con los paths de JDK/SDK disponibles. Gradle no incorpora esas variables entre los inputs del task JS; Expo 57 omite el reset bajo CI. El parámetro regenera primero el bundle con el reset habilitado. Confirmar identificador, URL incorporada, firma y versión del APK antes de instalar o distribuir. El paquete `.qa` jamás sustituye la app habitual.

En este worktree de Windows se usó `K:` como alias del directorio padre mediante `subst`, con el proyecto en `K:/karma-house`, y JDK/SDK sin espacios. Expo resolvía los paths de las dependencias nativas a la ruta larga original: en el archivo generado e ignorado `android/build/generated/autolinking/autolinking.json` se normalizó ese prefijo a su ruta equivalente en `K:`. Las cachés nativas anteriores se apartaron antes de recompilar. Si se regenera el proyecto, hay que comprobar esos paths y mantener el alias durante la compilación. No se cambiaron dependencias, fuentes nativas ni arquitectura de React Native para eludir el fallo de Ninja.
