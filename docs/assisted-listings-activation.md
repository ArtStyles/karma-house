# Activación controlada, todavía sin ejecutar

La implementación y los ensayos locales no autorizan aplicar migraciones, desplegar funciones, distribuir una actualización pública ni utilizar material real. La cuenta principal debe coincidir con `kh_private.platform_owner`; no se busca por nombre ni se sustituye por otro administrador.

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
