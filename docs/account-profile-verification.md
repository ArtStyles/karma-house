# Cuenta, avatar y ajustes — 2026-09-20

## Implementación

- `AccountMenu` abre un menú anclado al avatar con Mi espacio, Ajustes de cuenta y Cerrar sesión. Invitados conservan acceso a autenticación. Descarte exterior, Escape web y botón atrás nativo.
- `UserAvatar` muestra la foto o iniciales; tolera una imagen que no se pueda cargar. Admite tamaño configurable y es reutilizado en perfil, menú y ajustes.
- `/account-settings` conserva retorno tras autenticación. Permite nombre, foto y retirada de foto; el correo es solo lectura. El formulario conserva los cambios ante errores y solo confirma después de la respuesta de guardado.
- El selector existente de Expo admite imágenes, recorte nativo y cancelación sin cambiar la foto. La imagen se centra/recorta a cuadrado y se redimensiona a 512 × 512 JPEG antes de subir; máximo 1 MiB. En navegador se usa recorte cuadrado centrado, sin editor nativo de recorte.
- El perfil se guarda mediante RPC con actor fijado. Una sesión distinta aborta/descarta respuestas anteriores; el repositorio fija también el JWT y valida rutas/URLs de retorno.
- Referencia privada en `kh_private.account_avatars`; bucket privado `account-avatars`, ruta `UUID_usuario/UUID_imagen.jpg`. Solo el dueño puede subir, leer o firmar. Las URLs firmadas duran una hora y se renuevan al volver a primer plano y durante la sesión activa.
- El borrado del objeto actualmente referenciado está bloqueado. Una exclusión transaccional por usuario coordina adjuntar/retirar referencia y borrar; al reemplazar se limpia el objeto anterior tras guardar. Una cuenta distinta no recibe ni utiliza la referencia privada. No se publican fotos de cuenta en conversaciones.
- El rol de administrador sigue proviniendo de `kh_is_admin` / `kh_admins`. Los cambios de nombre pasan por RPC; no se mantienen escrituras directas de clientes sobre `profiles.display_name`.

## Evidencia

- Documentación Expo57 consultada antes del código: https://docs.expo.dev/versions/v57.0.0/, https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/, https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/.
- `node --experimental-strip-types --test tests/account-profile.test.ts`: **9/9**. Validación MIME/tamaño/firma/ruta; cancelación; conservación ante fallo de subida; quitar sin nueva subida; actor/JWT fijados; respuestas de otra cuenta o posteriores al cambio de sesión; URLs de foto restringidas al objeto y origen configurados.
- `node node_modules/typescript/bin/tsc --noEmit`: sin errores.
- `scripts/apply-account-profile.mjs --preflight`, `--test`, `--apply`, `--verify` ejecutados secuencialmente. La prueba SQL crea dos actores solo dentro de una transacción revertida. Aplicación registrada en ledger con SHA-256 `00b61161d127be4edcd662ac5c4838097a26ad03aae477de795863bac5015291`.
- `scripts/verify-account-profile.mjs`: **21 comprobaciones REST** con dos cuentas sintéticas. Verifica persistencia del nombre/foto, conservación al editar solo nombre, retirada, acceso anónimo/entre usuarios denegado, MIME/tamaño y sobrescritura rechazados, firma privada, protección del objeto referenciado y ausencia de escalada a administrador.
- Limpieza verificada: **0 usuarios, 0 perfiles, 0 referencias y 0 objetos sintéticos**. Hashes de todas las cuentas/perfiles/roles/anuncios/favoritos/fotos/recibos/mensajes/conversaciones previos permanecen idénticos. Registros: `docs/account-profile-*.log`.

## Límites de esta verificación

La revisión de navegador y el fixture combinado quedan a cargo del agente principal. Esta evidencia no acredita selección/recorte en un teléfono físico ni un APK nuevo. La foto es privada de la cuenta; no se añadió avatar público ni cambios de correo, contraseña o eliminación de cuenta.
