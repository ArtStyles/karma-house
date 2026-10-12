# Vistas internas de Mi espacio · 0.1.25

12 de octubre de 2026. Implementación local en `codex/visual-redesign`, desde `063897e`. Código del rediseño: `6d96e8b`; ajuste final de texto: `a038fee`. [Plan y criterio visual](superpowers/plans/2026-10-12-internal-screens.md).

## Diseño implementado

Se rediseñaron las 34 pantallas internas asignadas y las dos pantallas de autenticación relacionadas. `AdminManagementScreen` sirve a cuentas, anuncios e historial. El hub de Mi espacio, Favoritos y la navegación clásica conservan el diseño ya aprobado.

Encabezados compactos, contenido de hasta 720 px, márgenes de 20 px, superficies de 16 px y divisores finos. Las acciones largas salen del encabezado. `ActionGroup` separa botones por 12 px y los apila a anchuras menores de 380 px, con fuente ampliada o con más de dos acciones. Los botones conservan etiquetas que pueden envolver y comunican ocupación mientras esperan una petición. Los estados vacíos son factuales y se distinguen de las cargas y los errores.

El formulario compartido de Publicar/Editar conserva sus tres pasos y validaciones, con campos etiquetados, progreso legible a 320 px, fotos que adaptan sus columnas y acciones separadas. Los selectores de provincia, ubicación e importación también se ajustaron. Apariencia conserva Claro/Oscuro/Sistema con selección explícita y filas de 52 px.

## Cobertura por pantalla

“Teléfono” describe lo observado, no una prueba de todas las mutaciones o de todos los roles. Todas las fuentes modificadas tienen comprobación de tipos y revisión independiente; los recorridos de comportamiento están cubiertos por las pruebas del proyecto.

| Pantalla | Cambio específico | Evidencia física disponible |
| --- | --- | --- |
| Ajustes de cuenta | Identidad, datos, preferencias, privacidad y eliminación separados; confirmación desplazable. | Claro/Sistema oscuro, nombre y teclado, controles de foto y protección de la cuenta propietaria. |
| Perfil público | Identidad compacta, anuncios y datos en filas; nivel y verificación en diálogos. | Sin recorrido físico de esta vista en esta tarea. |
| Mensajes | Conversaciones en filas con fecha, vivienda y separador; actividad de inmobiliarias diferenciada. | Bandeja con dos conversaciones reales. |
| Conversación | Contexto compacto, compositor y teclado; propuestas y opciones con jerarquía. | Historial real, teclado sin escribir, opciones y Cancelar. |
| Notificaciones | Filtros y resumen; contenido y acciones separados. | Consulta de la cuenta y filtros; no se activó ninguna gestión. |
| Tus avisos | Dispositivo y categorías por secciones, switches legibles. | Permiso existente y categorías, sin cambios. |
| Solicitudes | Navegación secundaria en filas; propuestas e historial diferenciados. | Vista pendiente sin propuestas; accesos a cierres y autorizaciones. |
| Mis alertas | Criterios, estado y acciones; confirmación de borrado y hoja de guardado ordenadas. | Vacío real de la cuenta. Guardado/borrado cubiertos por fuentes y pruebas. |
| Mis anuncios | Filtros reales por estado, ficha compacta y acciones; cierre con texto válido para cualquier operación. | 64 anuncios; filtro de cambios muestra 2, Todos restaura 64; abrir confirmación de cierre y cancelar. |
| Editar | Cabecera compacta y formulario compartido por secciones. | Tres pasos de un alquiler propio, fotos existentes y acciones; cancelar sin guardar. |
| Transferencias | Resumen de lotes, personas y estados. | Sin lote disponible en este recorrido. |
| Transferencia | Vista previa, confirmación y decisión separadas. | Sin transferencia real para abrir; permisos y vista previa bajo pruebas. |
| Publicación asistida | Lista, selección y colaboración; acciones fuera del título y registro en diálogo. | Pantalla y consulta de la cuenta oficial. |
| Editor asistido | Material recibido, permiso y datos de vivienda por secciones. | Sin editor con autorización real abierto; formularios y permisos bajo pruebas. |
| Administración | Accesos agrupados en publicaciones, comunidad, gestiones y cuenta oficial. | Navegación y contadores de la cuenta propietaria. |
| Gestión de cuentas/anuncios/historial | Filtros comunes; filas y decisiones separadas; motivo en diálogo desplazable. | Cuentas, filtros, catálogo e historial. Sin moderación ni cambios de permisos. |
| Revisión de anuncios | Contexto antes de aprobar o pedir cambios; diálogo con teclado y área segura. | Cola consultada sin coincidencias en la vista seleccionada. |
| Reportes de anuncios | Reportes en filas; información y decisión ordenadas. | Vacío real de pendientes. Sin reportes modificados. |
| Reportes de mensajes | Orígenes y filtros; contexto privado y nota de resolución por secciones. | Pantalla y filtros; no se resolvió ningún reporte. |
| Mi inmobiliaria | Identidad seleccionada y navegación comercial/administrativa agrupada. | Inmobiliaria principal de KarmaHouse. |
| Solicitud de inmobiliaria | Estado de solicitud, identidad, correcciones y regreso separados. | Sin solicitud propia abierta; carga/error/vacío bajo regresiones. |
| Perfil comercial | Identidad, contacto, cobertura, oficina y datos por secciones. | Formulario comercial existente, sin editar ni guardar. |
| Verificación | Estado comercial y solicitud ordenados; principal protegida. | Inmobiliaria principal verificada y protección explícita. |
| Equipo | Invitaciones, personas y formulario de invitación diferenciados. | Equipo actual y formulario sin enviar ni retirar miembros. |
| Cartera | Lista y acceso a ficha privados; acciones y estado de consulta separados. | Cartera real sin viviendas autorizadas. |
| Agenda | Semana, vivienda y participantes; visitas y ocupación en filas; fechas de Cuba. | Semana consultada sin visitas. Intervalos de varios días bajo regresiones. |
| Seguimientos | Responsable, vivienda, interesado y etapa separados; contacto externo en formulario. | Consulta y filtros del espacio activo. |
| Expediente | Contexto, responsable, etapa, propuestas, visitas, tareas e historial por secciones. | Sin expediente real disponible para este recorrido; carga y autorización bajo regresiones. |
| Cierres | Datos de venta y autorización antes de decisiones; formularios agrupados. | Carga inicial y posterior vacío real de solicitudes. |
| Vivienda de inmobiliaria | Origen, permisos, coincidencias, ficha y cambios separados. | Sin vivienda autorizada para abrir; edición compartida verificada en anuncio propio. |
| Autorizaciones y cambios | Vigentes, solicitudes y cambios propuestos por secciones. | Consulta sin solicitudes en la página. |
| Duplicados | Canónica, candidatos y evidencia antes de consolidar. | Formulario y cero seleccionados, sin consulta ni consolidación enviada. |
| Revisión de inmobiliarias | Datos comerciales/privados y decisión diferenciados; diálogo desplazable. | Filtros y estado consultado, sin decisiones. |
| Conversación de inmobiliaria | Contexto autorizado antes del compositor; lectura, mensajes, privacidad y propuestas ordenados. | Sin conversación de este espacio abierta; recuperación y denegación bajo pruebas. |
| Entrar/crear/recuperar cuenta | Títulos factuales, campos legibles y controles que envuelven. | Demostración en navegador; se conservó la sesión del teléfono. |
| Callback de autenticación | Contenido desplazable y acciones separadas, también con letra grande. | Flujo y errores bajo pruebas; sin enlace de correo real en esta tarea. |

## Correcciones de comportamiento

- Recarga de Mis alertas visible después de la primera consulta; Guardar búsqueda bloquea el segundo envío antes del siguiente render.
- Mis anuncios distingue carga inicial, error y vacío; filtra de verdad por estado.
- Administración comunica el fallo de consulta; los diálogos privados se ocultan sincrónicamente cuando cambia el token de la sesión.
- Mensajes e inmobiliarias no afirman que faltan registros cuando la consulta falla. Expediente y conversación privada muestran lectura inicial, y el compositor espera contexto autorizado.
- Agenda conserva la fecha final cuando una reserva o visita cambia de día en Cuba, incluidos cruces de medianoche. Conserva la presentación compacta si las dos horas pertenecen al mismo día.
- Las opciones de conversación mantienen 12 px entre Bloquear, Reportar y Cancelar.
- El estado y la confirmación de cerrar un anuncio usan «Cerrado», «Cerrar anuncio» y «Reactivar» para evitar llamar venta a un alquiler, permuta o búsqueda. Los valores enviados al servicio permanecen iguales.

No se modificaron servicios, SQL, endpoints, payloads ni permisos. La comparación AST independiente no encontró diferencias en expresiones de llamadas a backend entre las 62 fuentes TSX revisadas y la base. Los hallazgos importantes de la revisión fueron corregidos y revisados de nuevo.

## Comprobaciones

- `npm run check`: TypeScript correcto; **778 pruebas, 774 pasan, 4 omitidas y 0 fallos** después de integrar las correcciones. El último cambio fue únicamente texto en Mis anuncios: TypeScript y sus 6 regresiones volvieron a pasar.
- Revisión independiente de las correcciones finales: **24/24** regresiones correctas.
- Exportación web final correcta, servida en `http://127.0.0.1:8129/` con recarga de rutas. La vista previa es demostración local; no usa la sesión del teléfono.
- Navegador: 390×844, 320×740 y 1200×900; Ajustes y formulario/selector sin desbordamiento horizontal observado. Radios de Apariencia de 52 px. Sistema restaurado y tamaño temporal del navegador restablecido.
- Pixel 7 Pro por USB, Android 17/API 37, 1440×3120, escala de fuente existente 1.15. Sesión conservada; 64 anuncios y 0 favoritos. Claro→Sistema restaurado. Sin texto escrito, guardados, cierres, propuestas, mensajes, cambios de miembros ni moderación enviados durante la QA.
- Separación física observada de opciones de conversación: 35 px entre controles de 157 px, equivalente al margen de 12 dp con el redondeo nativo. El compositor sube sobre el teclado. Cerrar anuncio pide confirmación; Cancelar conserva 64 anuncios.
- Registro final del proceso de la aplicación para AndroidRuntime/ReactNativeJS: **0 líneas de error**.

Capturas y XML en `D:/work/karma-house/artifacts/internal-screens/phone/`; navegador en `artifacts/internal-screens/browser/`. Las capturas de cuenta, conversación, edición y administración preceden al último ajuste de texto de Mis anuncios; el resto de su código es idéntico en el APK final. `my-listings-final-restored.png` y las vistas de inmobiliaria corresponden al APK final.

## APK local final

| Dato | Resultado |
| --- | --- |
| Fuente | `a038feefb373bd786288eb86acacea8bcd332664` |
| Paquete | `com.karmahouse.karmahouse` |
| Versión/código | **0.1.25 / 26** |
| Archivo | `D:/work/karma-house/artifacts/releases/KarmaHouse-0.1.25.apk` |
| Tamaño | 85,180,663 bytes · 81.23 MiB |
| SHA-256 | `54e50063d4c1063a3d7a84ebd2b7b0a08cc8b9f608e706805e8835f7665d4e5e` |
| Firma | v2 correcta, mismo certificado de distribución existente |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6` |
| Arquitecturas | arm64-v8a y armeabi-v7a |
| Verificación privada | 1386 entradas inspeccionadas sin valores privados ni claves de servicio |
| Alineación | ZIP de 16 KB correcta; la verificación no evalúa alineación ELF |
| Instalación final | `adb install -r`: Success; actualización 2026-10-12 01:26:49; primera instalación 2026-09-24 conservada |
| APK del teléfono | Extraído del paquete instalado: SHA-256 idéntico al archivo final |

Se reutilizó el entorno aislado `artifacts/v24` para conservar la caché Android, con fuente archivada desde el commit final. Se cotejaron las 307 fuentes copiadas: cero diferencias frente al archivo Git. Compilación final correcta en 58 segundos. Logs de compilación/verificación y el archivo de fuente están en `D:/work/karma-house/artifacts/internal-screens/`.

La entrega se guarda también en `artifacts/distribution/0.1.25/`. No se ha publicado una release remota ni se ha integrado esta rama en el trabajo web del checkout principal.
