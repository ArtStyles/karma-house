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

## Auditoría de cuentas (tercera entrega, `6a76f3b`)

- Mensajes propios para invitación caducada o de otra cuenta, cuenta suspendida o en eliminación y datos no válidos.
- Cerrar sesión muestra el motivo real; el enlace del correo lleva a una cuenta suspendida a Mi espacio en vez de cargar sin fin.
- Eliminar la cuenta avisa de que sales de tus inmobiliarias y de que una sin administración queda suspendida; si falla después de empezar, lo dice y explica cómo terminar.
- Mi espacio: aviso si no cargan las inmobiliarias; nombre y foto abren Ajustes; Pro solo en Mi espacio y preferencias de avisos solo en Ajustes y Notificaciones; «Anuncios por aceptar» solo si hay; títulos de sección y filas legibles por lector de pantalla.
- Mi inmobiliaria sin «Estado de mi solicitud» (callejón sin salida); «Invitaciones recibidas».
- Textos: «inmobiliaria» en toda la app (antes se mezclaba con «agencia»), «espacio» solo para Mi espacio, sin «verificada del sistema».
- `npm test`: 829 tests, 823 pasan, 4 omitidos y los mismos 2 fallos por `pwsh`. `expo export --platform web` compila.

## Segunda auditoría (`f194c72` y siguiente)

- Lógica: el inicio de sesión respeta el destino salvo que la solicitud de inmobiliaria necesite atención; avisos de sesión de inmobiliaria con palabras; cuenta suspendida a Mi espacio; los avisos de inicio de sesión en páginas de inmobiliaria, Pro, alertas y traspasos vuelven a ellas; borrar la cuenta trata una respuesta perdida como posible inicio; Mi espacio muestra el motivo real, conserva el último valor bueno y solo escribe la carga más reciente; recibos antiguos de invitación, propietario de la principal y bucles sin inmobiliaria corregidos.
- Diseño: `Notice` con «Reintentar» en lugar de «Desliza hacia abajo» (no existe en la web); botones y chips en píldora; tarjetas, modales e interruptores con los tokens comunes; un nombre por destino.
- Salir de una inmobiliaria y cancelar invitaciones: migración `20261015000100_agency_member_exits` con `kh_leave_agency` (mismos controles que retirar a un miembro: último administrador, propietario de la principal, recibo antes de la comprobación de miembro para que un reintento funcione) y `kh_cancel_agency_invitation` (solo administradores, con versión; la persona ya no puede aceptarla). Botones «Salir de la inmobiliaria» y «Cancelar invitación».
- Registro: «Reenviar correo» tras crear la cuenta; un enlace abierto en otro dispositivo explica que el correo ya quedó confirmado.
- Revisión final (`c073feb`): un reenvío fallido ya no borra el verificador PKCE que necesita el primer correo en el mismo dispositivo (`keepVerifierOnFailure`); el botón espera un minuto entre correos.
- Producción: ensayo superado y aplicación hecha con `node scripts/apply-reviewed-migration.mjs 20261015000100_agency_member_exits --commit`. Ledger `20261015000100`, SHA-256 `57eeb64472537b7b7cb19df76b8fe7202c6f425133982e9a431e7964aa77a620`, igual que el archivo. `anon` sin permiso; `authenticated` sí. Datos reales intactos.
- Local: `agency_member_exits`, `agency_sent_invitations`, `pro` y `owner_administration` superadas. `npm test`: 832 tests, 826 pasan, 4 omitidos y los 2 fallos de siempre por `pwsh`. `expo export --platform web` compila.
- No se tocó (funciones privadas fijadas por el verificador de inmobiliarias): una solicitud pendiente cuyo responsable borró la cuenta, y suspender a la última persona administradora sin suspender la inmobiliaria.

## Pruebas

- Local (PostgreSQL 17, `127.0.0.1:56440`, base nueva con todas las migraciones): `agency_sent_invitations`, `pro` y `owner_administration` superadas.
- `npm test`: 826 tests, 820 pasan, 2 fallan por falta de `pwsh` (igual que antes). `tsc` sin errores. Quitar el filtro de administrador en `loadAgencyTeamPage` hace fallar su test.

## Producción

- Ensayo `node scripts/apply-agency-sent-invitations.mjs` (hoy `node scripts/apply-reviewed-migration.mjs 20261014000200_agency_sent_invitations`) (migración y suite en una transacción deshecha): superado.
- Aplicación `--commit`: hecha. Ledger `20261014000200 agency_sent_invitations`, SHA-256 `7dcd5aeda99da8f89d0a7842358f0935f8d3b13a20a5b628c56d70684a807f54`, igual que el archivo. Suite superada sobre el esquema aplicado, sin filas sintéticas. `anon` no puede ejecutarla; `authenticated` sí.
- El verificador de inmobiliarias fija sus funciones por nombre; esta función nueva no cambia su inventario.

## Pendiente

- APK nuevo para Android (la web se publica al subir a `main`).
- Probar el recorrido real con dos cuentas en la web publicada.
- Cancelar una invitación pendiente no existe todavía.
