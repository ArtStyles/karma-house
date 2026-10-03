# Propietario y administración de KarmaHouse

Solicitud: convertir la cuenta del creador ya verificada en propietaria, publicar
sus anuncios directamente, administrar usuarios y moderación, y mostrar de su
perfil solamente nombre y foto a otras personas.

El usuario confirmó suspensión completa y reversible: impedir publicaciones y
mensajes, ocultar anuncios y conservar datos hasta reactivación.

## Reglas

- Un propietario único, asociado a su UUID confirmado en Auth, almacenado en
  esquema privado. El correo de arranque no se incluye en la app ni en APIs públicas.
- El propietario hereda todas las capacidades administrativas. Solo él puede
  conceder o retirar administración y suspender/reactivar otras cuentas.
  Nadie puede suspender, degradar ni eliminar por accidente la cuenta propietaria.
- Sus envíos y ediciones se publican directamente; guardar borrador sigue siendo
  borrador. Se mantienen validación, fotos obligatorias, versiones e idempotencia.
- Usuarios normales y administradores ordinarios siguen sujetos a revisión.
- Suspender exige motivo y confirmación, impide nuevas publicaciones, cambios y
  mensajes aunque haya una sesión antigua, y pausa sus anuncios activos.
  Reactivar restaura solamente anuncios que no cambiaron durante la suspensión.
  Se conservan cuentas, mensajes, pruebas de reportes y anuncios.
- El perfil público del propietario devuelve identidad mínima (ID técnico,
  nombre y referencia de foto), sin correo, teléfono, antigüedad ni estadísticas.
  Los anuncios siguen siendo públicos por separado. Mi cuenta conserva sus datos
  privados para su titular. No se añade acceso a conversaciones privadas completas.

## Vistas

Mi espacio → Administración: accesos a revisión, anuncios, cuentas, reportes de
anuncios, reportes de mensajes e historial. Las vistas de revisión y reportes se
reutilizan. Cuentas permite buscar por nombre y filtrar activas/suspendidas;
detalle muestra rol, estado y acciones con motivo. Anuncios permite retirar
contenido publicado con motivo. Historial muestra actor, acción, destino, fecha
y motivo de cambios administrativos. Roles y suspensiones solo para propietario.

## Seguridad y validación

Autorización en SQL, nunca comparando correos en el cliente. RPCs vinculan actor
a la sesión y vuelven a comprobar rol y estado. Auditoría inmutable para clientes.
Las respuestas de una sesión anterior se descartan al cambiar de cuenta.

Pruebas SQL transaccionales: actor normal denegado, propietario protegido,
publicación directa frente a revisión normal, borradores, idempotencia,
suspensión con sesión ya emitida, catálogo oculto y reactivación, perfil mínimo
y denegación de datos privados. TypeScript y suite completa; vistas en móvil y
escritorio. Aplicar migración y alta del propietario de forma transaccional,
verificar estado remoto, compilar APK e instalar actualización conservando datos.
