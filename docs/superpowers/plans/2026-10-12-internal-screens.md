# Rediseño de las vistas internas de Mi espacio

La petición del usuario autoriza implementar el criterio ya aprobado en cada vista interna. Se conserva el hub de Mi espacio, la navegación clásica y los recorridos y permisos actuales. El rediseño es específico por pantalla, incluidos sus formularios, estados vacíos y diálogos.

## Criterio común

- Encabezado interior compacto, título de 28 px y descripción breve. Las acciones largas van en el contenido, no junto al título.
- Contenido centrado de hasta 720 px, margen lateral de 20 px, secciones con 16–24 px de separación y divisores finos.
- Una acción principal por sección. Acciones relacionadas separadas por 12 px; se apilan en teléfonos estrechos o con letra ampliada. Controles de al menos 44 px y etiquetas que pueden envolver.
- Estados vacíos factuales, alineados a la izquierda, sin ilustración genérica. Colores del tema, sin sombras ornamentales o superficies azules grandes.
- Formularios por secciones, etiquetas visibles, campos de 48–52 px, ayuda y validación junto a su campo. Diálogos desplazables y respetuosos con teclado y área segura.
- Cargas, errores, falta de permiso y resultados vacíos siguen siendo estados distintos. Se conservan todas las confirmaciones destructivas y verificaciones de cuenta.

## Componentes compartidos (responsabilidad principal)

`PageTitle` añade `compact?: boolean`, `EmptyState` añade `plain?: boolean`; ambos preservan su aspecto actual por defecto. `ActionGroup` acepta `children`, `direction?: 'auto' | 'vertical' | 'horizontal'`, `style?` y separa acciones responsivamente. `internalLayout` reúne las medidas anteriores. `Button` comunica `busy` durante una petición además de impedir pulsaciones duplicadas.

## Cuenta y actividad

- Ajustes de cuenta: identidad compacta; edición, privacidad y zona de peligro en secciones. Eliminación en diálogo desplazable con confirmación intacta.
- Perfil público: cabecera legible y anuncios; no repetir grandes bloques decorativos.
- Mensajes: bandeja en filas con separadores; conversación con contexto compacto, compositor y teclado bien separados; reportes y propuestas en hojas ordenadas.
- Notificaciones: filas y acciones separadas; preferencias agrupadas con controles claros.
- Solicitudes: navegación secundaria ordenada, filtros que envuelven y tarjetas de negociación con jerarquía.
- Búsquedas guardadas: criterios legibles, estado de alerta y acciones separadas; formulario de guardado revisado.

## Anuncios y administración

- Mis anuncios: filtros y contador, ficha compacta con acciones separadas; edición conserva todos los datos.
- Transferencias: personas, estados y acciones claros; oferta y aceptación con las mismas confirmaciones.
- Publicación asistida: lista y editor con acciones principales fuera del encabezado.
- Administración: navegación en filas agrupadas; revisión de viviendas, cuentas, reportes e historial con filtros, información y decisiones legibles.

## Inmobiliaria

- Espacio y perfil: identidad y accesos en grupos compactos.
- Registro, solicitud y verificación: formularios por secciones y estados de revisión explícitos.
- Equipo y cartera: filas legibles, acciones y permisos diferenciados.
- Solicitudes, duplicados y revisiones: información de cada caso antes de las decisiones.
- Agenda: fecha, vivienda y participantes en bloques; acciones que no se pisan.
- Expediente, operaciones, cierres y conversación privada: encabezado compacto, contexto y datos por secciones; propuestas, confirmaciones y acciones separadas.

## Ejecución y comprobación

1. Preparar los componentes compartidos y una prueba de accesibilidad del botón ocupado.
2. Implementar tres grupos independientes con propiedad exclusiva de archivos. Se usa dispatching-parallel-agents para estos grupos; no el flujo secuencial de subagent-driven-development. No se comparten ediciones, Git ni control del navegador/teléfono.
3. Revisar formularios compartidos y autenticación; integrar y comprobar tipos y pruebas de comportamiento. Las modificaciones visuales se comprueban con geometría y capturas, sin pruebas que dupliquen estilos.
4. Revisar rutas disponibles en navegador y teléfono, claro/oscuro y anchuras pequeñas. Registrar por vista qué evidencia existe y las limitaciones por rol o datos.
5. Preparar APK local nueva, verificar versión/firma, instalar como actualización y probar sin publicar anuncios, enviar mensajes, moderar ni borrar datos.

Se trabaja en el worktree existente `apple-interactions`, rama `codex/visual-redesign`. No se modifica ni publica el trabajo web del checkout principal. La documentación de Expo SDK 57 se leyó antes de modificar código.
