# Invitaciones de equipo — verificación

Fecha: 14 de octubre de 2026 (15 de octubre, UTC).

## Problema

- Una cuenta nueva no encontraba en Mi espacio nada que darle a la inmobiliaria. «Ver mi perfil público» solo aparece con un anuncio activo y aprobado (spec del perfil de confianza), y sin anuncios nadie más puede ver ese perfil (`kh_private.profile_visible`).
- Invitar daba errores genéricos aunque la invitación se guardaba. En producción hay una sola invitación (01:24 UTC, Chrome en Android) y un solo recibo `invite_member`: los intentos fallidos no escribieron nada. Cada toque enviaba un `clientRequestId` nuevo, así que tras una respuesta perdida (plazo de 20 s de `fetchTimeout.ts`) el reintento acababa en `KH_AGENCY_INVITATION_OPEN`, mostrado como «No se pudo completar la acción». Sin registros de Postgres no se pudo confirmar el texto exacto que vio el usuario.
- El administrador no veía las invitaciones pendientes que había enviado, y un error vaciaba la lista del equipo.

## Cambios

- Mi espacio › Cuenta: «Mi código de cuenta». En la web lo copia; en Android abre compartir. El código queda visible.
- Equipo e invitaciones: acepta código, enlace o el mensaje compartido entero (`accountIdFrom`); un mismo `clientRequestId` por intención hasta que se guarda; mensajes propios para invitación abierta, miembro existente, destinatario no válido y conexión caída; lista «Invitaciones enviadas» para administradores; un error deja la lista y la vuelve a cargar.
- `public.kh_list_agency_sent_invitations(uuid,uuid,integer,integer)`: solo administradores (`agency_reader … 'admin'`), solo pendientes sin caducar, con el nombre de quien la recibe. Sin permiso para `anon`.

## Mi espacio (segunda entrega)

- Gestión muestra una fila por inmobiliaria con nombre, rol y estado si no está aprobada; abre esa inmobiliaria directamente.
- «Invitaciones de inmobiliarias · N» aparece solo con invitaciones pendientes y lleva a ellas. Quien solicitó una inmobiliaria aún no aprobada ve «Solicitud de X». Sin inmobiliaria, invitación, solicitud ni administración, Gestión no aparece.
- `loadAgencyOverview` lee rol, invitaciones y solicitud con las RPC existentes; cada parte falla por separado.
- Mi inmobiliaria aplica la inmobiliaria del enlace una sola vez por cuenta (volver a la pantalla ya no deshace la elección) y elige sola cuando solo hay una.
- Aceptar una invitación termina en «Ya formas parte de X como gestor» con el botón «Ir a X».
- `npm test`: 828 tests, 822 pasan, los mismos 2 fallos por `pwsh`. `npx expo export --platform web` compila.

## Pruebas

- Local (PostgreSQL 17, `127.0.0.1:56440`, base nueva con todas las migraciones): `agency_sent_invitations`, `pro` y `owner_administration` superadas.
- `npm test`: 826 tests, 820 pasan, 2 fallan por falta de `pwsh` (igual que antes). `tsc` sin errores. Quitar el filtro de administrador en `loadAgencyTeamPage` hace fallar su test.

## Producción

- Ensayo `node scripts/apply-agency-sent-invitations.mjs` (migración y suite en una transacción deshecha): superado.
- Aplicación `--commit`: hecha. Ledger `20261014000200 agency_sent_invitations`, SHA-256 `7dcd5aeda99da8f89d0a7842358f0935f8d3b13a20a5b628c56d70684a807f54`, igual que el archivo. Suite superada sobre el esquema aplicado, sin filas sintéticas. `anon` no puede ejecutarla; `authenticated` sí.
- El verificador de inmobiliarias fija sus funciones por nombre; esta función nueva no cambia su inventario.

## Pendiente

- APK nuevo para Android (la web se publica al subir a `main`).
- Probar el recorrido real con dos cuentas en la web publicada.
- Cancelar una invitación pendiente no existe todavía.
