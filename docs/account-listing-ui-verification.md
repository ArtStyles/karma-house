# Perfil, publicación y filtros: verificación integrada

Fecha: 20 de septiembre de 2026.

La implementación y la revisión integrada cubren el menú de cuenta, los ajustes de nombre y foto, los selectores de publicación y edición, y los filtros del catálogo. Se conservaron las cuatro pestañas y los flujos existentes de autenticación, moderación y mensajes.

Este documento recoge la evidencia de navegación y comprobaciones ejecutadas por el agente principal, junto con la revisión independiente de código. Las verificaciones remotas específicas se detallan en [Cuenta, avatar y ajustes](account-profile-verification.md) y [Datos de anuncios y filtros](listing-details-verification.md).

## Estado de las comprobaciones

| Comprobación | Resultado |
| --- | --- |
| TypeScript | Finalizó con código 0. |
| Suite completa | 123 pruebas aprobadas, sin fallos. |
| Revisión independiente | Sin hallazgos importantes pendientes en SQL, permisos, repositorio, sesión, menú, ajustes, datos y filtros. |
| Navegador móvil | Revisión visual y funcional en 390 × 844 y 320 × 740. |
| Navegador de escritorio | Revisión visual en 1365 × 900. |
| Migraciones remotas | Aplicadas y verificadas secuencialmente; evidencia y conservación de datos en los documentos enlazados. |
| Limpieza de cuentas de prueba | Código 0, `inventoryUnchanged: true`; sin registros ni objetos sintéticos restantes. |
| Exportación Android, iOS y web | Finalizó con código 0 en `artifacts/account-listing-export`: Android, 1507 módulos y bundle de 4.1 MB; iOS, 1379 módulos y 3.8 MB; web, 1006 módulos. |
| Revisión de secretos del cliente | 552 archivos de código y exportación examinados; comprobación aprobada. |
| Vista previa tras reiniciarla | Recarga real en el puerto 8083 aprobada: una vivienda real en el catálogo, avatar anónimo, filtros nuevos operativos y ningún error en los registros del navegador. Se restauró el tamaño normal de la ventana y se dejó abierta la hoja de filtros. |

## Filtros y catálogo

La hoja de filtros, el menú de cuenta, los ajustes y el formulario se revisaron en los tamaños indicados. Las siguientes comprobaciones corresponden a interacciones reales en el navegador:

- Precio mínimo de 20 000 y máximo de 10 000: el rango inválido impide aplicar.
- Cancelar la hoja conserva los filtros previamente aplicados.
- Superficie escrita como `12,5`: el campo muestra `12.5` y el resumen del filtro conserva ese valor. Se corrigió la eliminación incorrecta de la coma decimal.
- La búsqueda del selector de provincia encuentra La Habana al escribir `habana`.
- El mínimo de tres habitaciones actualiza el contador a cero; al aplicar se muestran cero resultados y las etiquetas correspondientes.
- Limpiar retira las selecciones y devuelve el contador a un resultado en el escenario comprobado.
- El anuncio sintético deja de aparecer en el catálogo público al pasar de aprobado a pendiente después de editarlo.

## Cuenta, avatar y aislamiento

Se utilizaron dos cuentas sintéticas confirmadas, sin envío de correos. Ninguna credencial forma parte de este informe.

- La cuenta propietaria eligió `assets/karmahouse-icon.png` mediante el selector. El flujo preparó y guardó la imagen como JPEG y mostró el avatar.
- El nombre se guardó como «Laura Prueba Perfil» y se reflejó en la interfaz.
- Quitar la foto y descartar conserva la foto guardada. Quitarla y guardar vuelve a mostrar las iniciales.
- Cerrar sesión desde el avatar y entrar con la segunda cuenta muestra «Daniel», sin la foto anterior y con cero anuncios propios.
- La opción «Mi espacio» del menú lleva al perfil.
- Se corrigió la sincronización del nombre entre instancias de ajustes que permanecen montadas. La repetición del caso guardó «Daniel Prueba Actualizada», volvió a la instancia anterior y comprobó el nombre actualizado y «Guardar cambios» desactivado cuando no había cambios.

La revisión independiente confirmó que las operaciones de perfil fijan el usuario y su token, descartan respuestas de otra sesión y mantienen la referencia del avatar en una tabla privada. El SQL coordina adjuntar y borrar fotos mediante un bloqueo transaccional por usuario. El hash de la migración revisada coincide con el documentado en la verificación de cuenta.

## Edición y publicación

La edición del anuncio sintético se comprobó en el resumen, al volver a abrir el formulario y mediante el estado leído de la base de datos:

| Campo | Valor persistido |
| --- | --- |
| Provincia | Seleccionada mediante el selector de provincias. |
| Habitaciones | 3 |
| Baños | 2 |
| Superficie | 82.5 m², introducida como `82,5` |
| Estado de conservación | Nuevo (`new`) |
| Planta | 0 |
| Precio negociable | No (`false`) |
| Extras | Patio y Cisterna |
| Versión del anuncio | 3 |
| Moderación | Pendiente (`pending`) |

La planta cero y el precio no negociable se conservaron como valores explícitos. La edición volvió a someter el anuncio a moderación. Abrir una publicación nueva después de este flujo presentó un formulario sin los datos de la edición anterior.

## Limpieza y conservación

El script `scripts/account-listing-ui-fixture.mjs --cleanup` terminó con código 0 y confirmó `inventoryUnchanged: true` respecto al inventario previo a las pruebas. Los siguientes recuentos de datos sintéticos quedaron en cero:

- Usuarios, perfiles, anuncios y favoritos.
- Administradores y referencias de avatar.
- Conversaciones, mensajes, reportes y bloqueos.
- Objetos de almacenamiento de las cuentas de prueba.

La limpieza se limitó a las cuentas identificadas por la marca y los identificadores del fixture. Las cuentas y datos previos conservaron sus comprobaciones de inventario.

## Límites

La exportación conjunta genera los recursos de las tres plataformas; no acredita un APK nuevo, instalación en Android o iPhone, ni selección y recorte de fotos en un teléfono físico. La foto sigue siendo privada de la cuenta; no se añadió un avatar público para conversaciones ni cambios de correo, contraseña o eliminación de cuenta.
