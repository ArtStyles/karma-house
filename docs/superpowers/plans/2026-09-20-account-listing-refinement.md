# Perfil, publicación y filtros de KarmaHouse

**Objetivo:** entregar la foto de perfil, menú de cuenta y ajustes persistentes, junto con datos estructurados de viviendas y filtros coherentes con la identidad visual existente.

**Alcance autorizado:** solicitud directa del usuario de implementar estos ajustes. Conservar cuatro pestañas, autenticación, borradores, moderación, mensajes y catálogo existentes. Sin cambios de correo, borrado de cuentas ni generación de APK en este bloque.

**Diseño:** avatar que abre un menú con Mi espacio, Ajustes de cuenta y Cerrar sesión. Ajustes permite nombre y foto propia (elegir, recortar y quitar), correo de solo lectura. Publicación utiliza selectores y etiquetas legibles; añade estado de conservación, planta y precio negociable opcionales sin inventar datos de anuncios anteriores. El filtro se presenta en una hoja con selección provisional, contador de resultados, Aplicar, Limpiar y Cancelar. Precio y superficie aceptan intervalos, con validación de orden.

**Arquitectura:** React Native/Expo 57 y Supabase existentes. Componentes compartidos para selectores; reglas puras de datos y filtros. Migraciones aditivas y comprobadas, carga de fotos aislada por cuenta, permisos y validación en servidor. No dependencias nuevas previstas.

- [x] Cuenta: pruebas de validación, persistencia y aislamiento; avatar, menú y ajustes con errores recuperables.
- [x] Datos: enums/opciones, campos opcionales, compatibilidad de borradores, mapeo, filtros y migración con pruebas.
- [x] Formulario: selectores, ayudas concretas, datos nuevos en revisión, edición y detalle.
- [x] Catálogo: hoja de filtros, contador previo, rangos válidos y resumen de filtros activos.
- [x] Integración remota: revisión y aplicación secuencial de migraciones; conservación de datos y permisos verificada.
- [x] Verificación: TypeScript, 123 pruebas, revisión independiente, navegación y tamaños móviles/escritorio con dos cuentas temporales y limpieza comprobada.
- [x] Exportación conjunta Android, iOS y web: código 0; comprobación de secretos en 552 archivos de código y exportación aprobada.

## Evidencia y límites

La [verificación integrada](../../account-listing-ui-verification.md) recoge los casos de cuenta, filtros, edición, navegación, tamaños de pantalla y limpieza. La evidencia de permisos y migraciones está en [cuenta y avatar](../../account-profile-verification.md) y [datos de anuncios](../../listing-details-verification.md).

La última comprobación tras reiniciar la vista previa confirmó el catálogo real, el estado anónimo y los filtros, sin errores de navegador. No se generó un APK nuevo ni se realizaron pruebas en un teléfono físico en este bloque.

## Responsabilidades

Raíz integra formulario, filtros y QA visual. Agente de cuenta trabaja AuthProvider, componentes account, ajustes y su migración. Agente de datos trabaja dominio, repositorio y migración de anuncios. Revisor independiente revisa seguridad, compatibilidad y evidencia sin controlar el navegador.
