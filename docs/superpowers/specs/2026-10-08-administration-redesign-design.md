# Administración, recarga e inmobiliaria principal

Estado: diseño aprobado por el usuario el 8 de octubre de 2026 mediante «si aprobado». Implementación local autorizada; publicar una APK o aplicar migraciones de producción queda fuera de esta solicitud.

## Diseño aprobado

Usar «Tarjetas claras» del boceto `karmahouse-administracion.html`: fondo de la app, tarjetas con borde sutil, resumen principal y estado separados de las acciones. Panel con ocho accesos y tareas pendientes obtenidas del servidor, sin contadores ficticios. En móvil una columna de resultados y dos columnas para accesos cuando el ancho lo permita; mantener Claro/Oscuro/Sistema.

Eliminar los controles visibles de actualización en las vistas de consulta de administración, Mi espacio y los espacios de inmobiliarias. Usar RefreshControl de React Native 0.86 y Expo SDK 57. La recarga conserva los filtros, solicita la primera página y solo reemplaza los resultados tras una respuesta vigente. Conservar resultados ante fallos; cancelar o ignorar respuestas de sesiones, filtros o pantallas antiguas. Impedir recargas concurrentes y durante mutaciones. No perder borradores ni cambios sin guardar al actualizar formularios.

Las listas administrativas tienen búsqueda, filtros relevantes, orden estable y páginas de 20 resultados, aplicados antes de paginar en servidor. Filtros: anuncios por moderación/disponibilidad/origen/operación/provincia; cuentas por estado/rol/vínculo; reportes por estado/motivo/fecha y origen del chat; agencias por aprobación/verificación/provincia; historial por gestión/actor/fecha; colaboradores por tipo/estado/vínculo y sus anuncios por estado/elegibilidad. Mostrar paginación y totales reales, recuperar páginas tras eliminar/revisar el último elemento y reservar las acciones y motivos existentes a los actores autorizados.

Mi espacio presenta dos accesos diferenciados: actividad comercial de «Mi inmobiliaria principal» y administración global. La cuenta propietaria conserva su identidad privada y permisos protegidos y administra una agencia real, aprobada y verificada. La agencia principal usa sello dorado/ocre «Inmobiliaria principal» en espacios, perfiles, fichas y contactos. Las agencias verificadas normales mantienen el verde. El servidor identifica a la agencia principal mediante una relación protegida, nunca por nombre comercial, metadatos de registro o color. Sus miembros no heredan permisos globales.

No inventar teléfono, responsable, dirección, provincia o zonas comerciales. Si la cuenta no tiene perfil comercial completo, ofrecer la configuración con los mismos validadores existentes y publicar solo información confirmada. Nunca reasignar ni convertir silenciosamente la cartera personal anterior a cartera empresarial.

## Verificación

Pruebas de consultas y decodificación, cambios de sesión/filtro y errores de recarga; SQL con actores sintéticos y rollback para autorización, identidad principal, filtros antes de paginar y orden estable. Typecheck y suite completa. Export web y revisión visual móvil/desktop con fixtures autorizadas y aisladas. Registrar por separado compilación local, validación SQL, producción y dispositivo físico.
