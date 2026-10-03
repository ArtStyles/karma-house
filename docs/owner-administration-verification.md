# Propietario, administración y privacidad

La cuenta confirmada indicada por el usuario quedó vinculada por UUID como único
propietario, mediante `scripts/apply-owner-administration.mjs --commit`. El correo
se suministró por entorno para el alta y no se incorporó al cliente.
Migración: `20261003000100_owner_administration.sql`.

Mi espacio → Administración reúne revisión, anuncios, cuentas, reportes de anuncios,
reportes de mensajes e historial. Solo el propietario gestiona roles y suspensiones.
La suspensión completa y reversible elegida por el usuario impide publicaciones,
cambios y mensajes, pausa anuncios y conserva los datos. Reactivar restaura los
anuncios que no cambiaron durante la suspensión.

Los anuncios del propietario se aprueban en el servidor al enviarlos o editarlos;
los borradores conservan su condición. Continúan las validaciones de fotos,
versiones y reintentos; se generan alertas de búsqueda sin duplicarlas.

El perfil público devuelve solamente ID de navegación, nombre, referencia de avatar
y el indicador de identidad mínima. La interfaz muestra nombre y foto. No devuelve
correo, teléfono, fechas ni estadísticas. Las lecturas directas de `profiles` por
clientes solo permiten ID y nombre. El titular conserva sus datos privados en
Mi espacio/Ajustes.

El propietario está protegido frente a suspensión, degradación y al primer paso
destructivo de eliminación. Eliminar esta cuenta exige previamente transferir la
titularidad mediante una operación administrativa de servidor; no se añadió una
pantalla de transferencia. Los demás usuarios conservan la eliminación de cuenta.

## Verificación

- `npm run check`: TypeScript y **360 pruebas**, incluyendo privacidad estricta,
  permisos de controles y descarte de respuestas/errores de sesiones anteriores.
  Registro: `artifacts/owner-check.log`.
- Suite nueva `supabase/tests/owner_administration.sql`: publicación directa,
  borrador, edición, reintentos, denegación de elevación, protección del propietario,
  suspensión con sesión existente, mensajes/perfil/subidas bloqueados, reactivación
  sin revertir moderación posterior, permisos de tablas, perfil mínimo, auditoría y
  alertas deduplicadas. Todo transaccional con rollback.
- Diez suites SQL pasaron: owner_administration, messaging, negotiations,
  play_compliance, trust_profile, cover_thumb, catalog_pagination, operations,
  search_alerts y chat_negotiation_cards. `artifacts/owner-sql-regressions.log`.
- La suite histórica `cloud_marketplace.sql` falla por su recuento global de
  fotografías públicas existentes; se reprodujo idéntico fallo sin la migración.
  No se contabiliza entre las diez suites aprobadas.
- Revisión independiente: corregidas alertas de publicación directa y auditoría
  de verificación/revocación. Segunda revisión sin hallazgos bloqueantes.
- Aplicación remota y suite posterior: `artifacts/owner-activation.log`.
- Comprobación independiente: `role=owner`, `suspended=false`, administrador efectivo.
  RPC pública HTTP 200 con exactamente los cuatro campos de identidad. Sin cuentas
  sintéticas residuales. `artifacts/owner-remote-verification.log`.
- Navegador con servidor real: perfil cargado a 390 px con solo nombre y foto;
  Administración/Cuentas sin sesión muestran acceso reservado. Cuentas comprobada
  también a 1280 px; sin errores de consola.
- La revisión automática bloqueó iniciar la vista previa con API simulada
  (`blocked by policy`). Se usó el entorno habitual para las verificaciones públicas.
  No se probaron visualmente las gestiones autenticadas ni se suspendió una cuenta
  real. Las acciones se comprobaron en SQL con actores sintéticos.

## Android

- Release **0.1.14 (15)**, APK y AAB compilados. `artifacts/owner-android-build.log`.
- APK verificada: firma coincidente, configuración pública real, sin credenciales
  privadas detectadas, arm64-v8a/armeabi-v7a y alineación ZIP de 16 KB.
  `artifacts/owner-apk-verification.log`.
- SHA-256 APK: `f47ba2fdbc168d925d8c9b14f1d7e3bf72c2bed6d1e978d3d7d3f4e7ca56c052`.
- Instalada por USB en Pixel 7 Pro mediante `adb install -r`: Success, sin borrar
  datos. El dispositivo confirma 0.1.14 (15), MainActivity `Status: ok` y proceso
  activo. Sin errores AndroidRuntime/ReactNativeJS en la consulta tras el arranque.
- Registros: `artifacts/owner-device-install.log`, `artifacts/owner-device-launch.log`
  y `artifacts/owner-device-errors.log`. No se automatizaron gestiones desde la
  sesión personal del móvil. Servidores temporales y pestaña de pruebas cerrados.
