# KarmaHouse: plan de mejoras de diseño y conversión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparar los recorridos que pierden usuarios y hacer más fácil encontrar, guardar, consultar y publicar una vivienda, conservando el ahorro de datos y las funciones existentes.

**Architecture:** Mejoras sobre Expo Router, los controladores de catálogo y los componentes actuales. Mantener separados el sitio de captación, la ficha pública de cada anuncio y la aplicación. Reutilizar búsquedas guardadas, autenticación y publicación asistida; esta última depende de integrar el trabajo en curso.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Supabase, Expo Router, Reanimated; React/Vite/Motion para la portada; pruebas con `node --test` y revisión visual en navegador y Android.

**Spec / fuente:** Auditoría de diseño realizada en este chat el 5 de octubre de 2026. Este documento recoge las decisiones propuestas y los criterios para ejecutarlas después. La creación del plan no inicia implementación, edición de anuncios ni publicación.

## Prioridades y orden

| Etapa | Prioridad | Resultado | Dependencia |
| --- | --- | --- | --- |
| 0. Preparación | Obligatoria | Base actual y alcance de cada entrega confirmados | Retomar este plan |
| 1. Reparar recorridos | P0 | Enlaces correctos, conteos honestos y errores recuperables | Etapa 0 |
| 2. Buscar y volver | P1 | Operaciones visibles, búsquedas conservadas y acceso contextual | Etapa 1 |
| 3. Captar anuncios | P1 | Publicación propia o asistida y confianza comprensible | Integración de publicación asistida y traspaso |
| 4. Claridad visual | P2 | Tarjetas, Mi espacio y mapa más útiles | Etapas 1–2; editor después de etapa 3 |
| 5. Movimiento y cierre | P3 | Interacciones discretas y entrega verificada | Recorridos y contenido estabilizados |

Ejecutar en entregas pequeñas. Las etapas 1 y 2 pueden avanzar antes de integrar publicación asistida. La etapa 3 debe consumir su contrato final; no reconstruir esa implementación. Cada entrega incluye sus pruebas y revisión visual: la etapa 5 no es una excusa para posponerlas.

## Restricciones globales

- Antes de escribir código, leer de nuevo la documentación exacta de [Expo v57](https://docs.expo.dev/versions/v57.0.0/) y comprobar las versiones instaladas. La auditoría encontró Expo 57.0.23, React Native 0.86.3 y Reanimated 4.5.1; son una referencia histórica, no una instrucción de actualización.
- Mantener las cuatro pestañas, rutas de anuncios, favoritos, borradores, operaciones y permisos. No reescribir la aplicación ni agregar pagos, comisiones, mensajería externa automática o nuevas funciones de colaboración.
- Conservar miniaturas de portada, caché de URL firmadas, instantánea limitada del catálogo y carga de fotos/mapas bajo demanda. Una mejora visual no puede iniciar descargas antes de hidratar la preferencia de ahorro.
- Mantener `safeReturnTo` como lista cerrada de destinos internos. El contexto de una acción nunca autoriza una escritura automática al iniciar sesión.
- Diferenciar revisión del anuncio, verificación del perfil y titularidad de la vivienda. No presentar las dos primeras como comprobación de la tercera.
- Respetar los cambios locales existentes, especialmente la portada Vite en `web/`. Al retomar, inspeccionar commits y estado actual antes de elegir una base aislada. No incorporar archivos ajenos a la entrega.
- Los cambios de contenido de anuncios reales requieren revisión de sus datos y autorización del responsable. No inventar características, precios, ubicaciones ni fotografías.
- Mantener por separado evidencia local, despliegue público y comportamiento en Android físico. El navegador no prueba teclado, botón Atrás, TalkBack, instalación ni rendimiento nativo.

## Riesgos que debe cubrir la verificación

1. **Destinos incoherentes:** ficha compartida que envía a una portada antigua, enlaces legales rotos o pérdida del anuncio al abrir la app. Responsable: tarea 1.
2. **Resultados engañosos:** conteo de filtros anteriores, respuesta tardía, error tratado como vacío o anuncio retirado. Responsables: tareas 2 y 3.
3. **Pérdida de intención:** búsqueda descartada al acceder, contexto vencido o ejecución repetida de contactar/guardar. Responsable: tarea 5.
4. **Confianza y permisos ambiguos:** ayuda de publicación confundida con propiedad verificada o traspaso ofrecido a quien no corresponde. Responsable: tarea 6.
5. **Regresión móvil o de consumo:** fotos completas en tarjetas, mapas automáticos, controles fuera de pantalla, movimiento forzado o datos de otra sesión. Responsables: tareas 3, 7–10.

## Etapa 0 — preparar la siguiente sesión

- [ ] Leer este plan, `docs/growth-roadmap.md` y los planes/specs existentes de catálogo, búsquedas guardadas, importación, confianza y ahorro de datos.
- [x] Revisar `git status --short`, commits recientes y artefactos del chat. Registrar la base elegida y conservar los cambios previos. Si hace falta aislamiento, reutilizar un worktree adecuado antes de crear otro.
- [x] Revisar el resultado del chat «Plan de publicación asistida y traspaso» (`01a10c8e-153d-7513-9def-494f01039927`) cuando esté integrado. Identificar sus rutas, permisos, estados y pruebas; no editar su checkout desde esta tarea.
- [x] Ejecutar `npm run check` para obtener una línea base. Para una entrega que toque `web/`, ejecutar también `npm --prefix web run build`.
- [x] Reproducir en la base actual los problemas de la etapa elegida. Usar anuncios reales solo para lectura y fixtures claramente identificados para errores o escenarios ausentes.

**Salida:** base documentada, fallos reproducidos y una entrega concreta seleccionada. Si un problema ya fue corregido por otro trabajo, verificarlo y marcarlo resuelto en lugar de repetirlo.

## Etapa 1 — reparar los recorridos

### Tarea 1: ficha compartida y destino oficial

**Estado al 5 de octubre:** cambios implementados y verificados localmente en el worktree `public-journey`. Ver [evidencia](../../public-journey-verification.md). Pendientes integración, publicación y apertura real en Android. No usar los resultados de navegador como prueba de instalación o deep link nativo.

**Archivos:** `web/api/p.ts`, `src/lib/publicSite.ts`, `site/index.html`, `tests/public-listing.test.ts`; `web/src/App.tsx` si hay que ajustar el destino de descarga.

**Decisión:** la ficha pública seguirá en `/p/<id>` y abrirá `karmahouse://property/<id>`. Su enlace secundario llevará a `https://karmahouse.vercel.app/#descargar` con un texto como «Descargar KarmaHouse». No llamarlo «Ver más viviendas» mientras el destino sea una portada sin catálogo web.

- [x] Agregar primero regresiones en `tests/public-listing.test.ts`: destino oficial tanto en ficha válida como no disponible; deep link con el mismo ID; contenido escapado y URL canónica conservados.
- [x] Corregir el destino de la ficha y su fallback visible. Evitar redirecciones que expulsen al usuario de la ficha sin una acción comprensible. Conservar el deep link del mismo anuncio; su apertura física se verifica por separado.
- [x] Separar la URL de captación de las URLs legales actuales. Comprobar privacidad, términos y eliminación de cuenta antes de cambiar constantes o navegación.
- [x] Revisar el texto público «sin intermediarios» y sustituirlo, donde siga vigente y esté bajo control del proyecto, por un mensaje coherente con propietarios, gestores y agencias. No prometer un catálogo que el sitio no ofrece.
- [x] Ejecutar `node --experimental-strip-types --test tests/public-listing.test.ts` y `npm run check`. No se modificó el frontend Vite; la base aislada solo contiene el paquete estático anterior, sin script de build. La API se verificó mediante TypeScript y su suite.
- [x] Revisar la ficha a 390 y 1280 px y comprobar en navegador que descargar abre otra pestaña y conserva la ficha original.
- [ ] Verificar en Android con y sin app instalada. Sin app, dejar accesible la descarga y el enlace del anuncio para regresar. No afirmar recuperación automática del anuncio después de instalar sin probar ese mecanismo.

**Aceptación:** la ficha deja de enviar al visitante al sitio mínimo antiguo; descarga, apertura y enlaces legales tienen destinos válidos. La navegación pública posterior al despliegue se verificará por separado.

### Tarea 2: filtros y conteos honestos

**Estado:** implementación y pruebas locales terminadas; ver [evidencia de segunda fase](../../design-conversion-verification.md). La revisión física y publicación siguen pendientes.

**Archivos:** `src/components/CatalogFilters.tsx`, `src/screens/ExploreScreen.tsx`, `src/catalog/useCatalog.ts`, `src/catalog/controller.ts`; `tests/catalog-controller.test.ts`, `tests/catalog-query.test.ts`.

**Decisión:** usar «Aplicar filtros» en el panel. No calcular un conteo remoto por cada cambio del borrador en esta entrega. En Explorar, los datos anteriores pueden mantenerse visibles durante una recarga, pero su conteo no debe presentarse como el resultado de los nuevos filtros.

- [x] Añadir una regresión de respuesta tardía y cambio rápido de filtros en el controlador; conservar las pruebas existentes de paginación y cambio de cuenta. Documentar una comprobación visual para el intervalo anterior al debounce, que la prueba del controlador no cubre por sí sola.
- [x] Quitar del panel la cifra basada en filtros aplicados. Mantener el borrador aislado: cerrar o cancelar no modifica la búsqueda; aplicar sí; rangos inválidos impiden aplicar.
- [x] Hacer explícito en el hook/presentación cuándo los filtros solicitados todavía no corresponden al resultado mostrado, incluyendo el intervalo de debounce. Mostrar «Actualizando…» y reservar el vacío definitivo para una respuesta vigente y correcta.
- [x] Verificar búsquedas consecutivas, borrado de filtros, máximo 1 USD, rangos inválidos y error al cargar una página adicional. No contar una respuesta antigua como nueva ni borrar filas por un fallo de paginación.
- [x] Ejecutar `node --experimental-strip-types --test tests/catalog-controller.test.ts tests/catalog-query.test.ts` y `npm run check`; revisar el panel y la lista a 390 y 1280 px.

**Aceptación:** modificar el presupuesto ya no muestra «Ver 3 viviendas» con una cifra ajena al borrador; los resultados nuevos aparecen sin estados vacíos o conteos engañosos durante la transición.

### Tarea 3: distinguir error, vacío y anuncio retirado

**Estado:** implementación y pruebas locales terminadas, incluida recuperación por reintento y copia sin conexión. Android y despliegue pendientes.

**Archivos:** `src/catalog/useCatalog.ts`, `src/screens/DetailScreen.tsx`, `src/screens/FavoritesScreen.tsx`; nuevo `src/catalog/presentation.ts` y `tests/catalog-presentation.test.ts` para las decisiones de estado compartidas.

**Contrato:** conservar `useListing(...).error` y `retry()`. Ampliar `useFavoriteListings()` con `retry()` y consumir su `error`. La presentación debe distinguir carga, error, vacío confirmado, contenido vigente y contenido sin conexión; «no disponible» exige una respuesta exitosa sin anuncio.

- [x] Escribir pruebas de estados: carga inicial; error sin datos; respuesta exitosa vacía; datos anteriores con fallo de recarga; detalle de instantánea sin conexión. Una lectura fallida de favoritos no cuenta sus anuncios como retirados.
- [x] Conectar el error propio de cada consulta y un botón de reintento en detalle y favoritos. No depender solo de `storageError` del proveedor general.
- [x] Conservar datos anteriores de la misma sesión cuando resulte útil durante un fallo de recarga. Limpiar al cambiar de cuenta y descartar respuestas tardías para evitar mostrar favoritos ajenos.
- [x] Verificar con fallos controlados del repositorio, sin borrar anuncios reales: red caída, recuperación, anuncio realmente ausente y favorito retirado tras respuesta correcta. Mantener bloqueadas las acciones que requieren red cuando se usa la instantánea.
- [x] Ejecutar `node --experimental-strip-types --test tests/catalog-presentation.test.ts tests/catalog-controller.test.ts tests/data-saver.test.ts`, después `npm run check`, y revisar los estados renderizados.

**Aceptación:** una conexión fallida ofrece recuperación; no afirma que el anuncio desapareció ni que todos los favoritos dejaron de estar disponibles.

## Etapa 2 — facilitar la búsqueda y conservar la intención

### Tarea 4: operaciones visibles y búsquedas sin coincidencias

**Estado:** operación visible y vacío con guardado implementados y revisados a 320, 390 y 1280 px. El retorno invitado ya conserva criterios y orden; Android y despliegue siguen pendientes.

**Archivos:** `src/screens/ExploreScreen.tsx`, `src/components/CatalogFilters.tsx`, `src/domain/listings.ts`, `src/domain/listingOptions.ts`, `src/components/SaveSearchSheet.tsx`; `tests/explore-shortcuts.test.ts`, `tests/operations.test.ts`, `tests/search-alerts.test.ts`.

**Decisión:** separar la operación de provincia, tipo y presupuesto. Usar una selección visible que permita reconocer «Venta y permuta», «Venta», «Permuta», «Alquiler» y «Busco» sin depender del desplazamiento horizontal actual. Mantener los valores `offers`, `sale`, `swap`, `rent`, `wanted` y su semántica.

- [x] Verificar con pruebas que `offers` sigue incluyendo venta y permuta, y que alquiler y «Busco» aplican sus operaciones reales. No convertir «Busco» en una categoría genérica de compradores.
- [x] Reorganizar el encabezado móvil y los accesos a filtros. El control de operación debe mostrar su valor y abrir todas las opciones; los atajos de tipo/presupuesto deben mantener estados inequívocos.
- [x] Añadir «Guardar esta búsqueda» al vacío con filtros, junto a la acción de ampliarlos. Reutilizar `SaveSearchSheet` y las alertas existentes; no crear otro servicio de avisos.
- [ ] Verificar operaciones, combinaciones con provincia/tipo, limpieza de filtros, y guardado de criterios con cero coincidencias. El retorno invitado conserva criterios y orden; guardado remoto real pendiente.
- [x] Ejecutar `node --experimental-strip-types --test tests/explore-shortcuts.test.ts tests/operations.test.ts tests/search-alerts.test.ts`, después `npm run check`; revisar 320, 390 y 1280 px.

**Aceptación:** alquiler y «Busco» son descubribles en móvil; una búsqueda vacía ofrece una vía útil de retorno sin inventar resultados.

### Tarea 5: acceso contextual y recuperación de la búsqueda

**Estado:** implementación local y recorrido sintético comprobados; confirmación de correo real y validación nativa pendientes. Verificación de cierre: TypeScript y 415 pruebas pasan; véase el informe.

**Archivos:** `src/screens/AuthScreen.tsx`, `src/screens/DetailScreen.tsx`, `src/components/PropertyCard.tsx`, `src/screens/ExploreScreen.tsx`, `src/auth/AuthProvider.tsx`, `src/searches/domain.ts` si hace falta exponer su validador; nuevo `src/auth/pendingIntent.ts` y `tests/auth-intent.test.ts`; conservar `src/auth/callback.ts` y `tests/auth.test.ts`.

**Decisión:** guardar localmente una intención acotada, separada de `returnTo`, para restaurar el contexto. Tipos permitidos: contactar un anuncio, guardar un favorito o guardar una búsqueda. No guardar credenciales, textos de mensajes ni URLs arbitrarias.

**Contrato propuesto:** `createPendingIntentStore({ storage, now })` expone `write(intent)`, `read()` y `clear()`. `intent` contiene `kind`, el ID del anuncio o los filtros validados con el dominio de búsquedas, y caduca a los 30 minutos. Para la búsqueda, guardar `SavedSearchFilters` más `sort` validado contra las cuatro opciones existentes: `toSavedFilters` omite el orden y no basta por sí solo para restaurar la vista. Leer no ejecuta la acción. Limpiar tras restaurarla, cancelarla, salir de la cuenta o eliminarla. Datos corruptos o vencidos se descartan sin impedir el acceso normal.

- [x] Escribir primero pruebas de round-trip de los filtros y orden, vencimiento, contenido corrupto, tipos/IDs inválidos y limpieza. Mantener pruebas de rechazo de destinos externos y parámetros ambiguos en `tests/auth.test.ts`.
- [x] Capturar la intención antes de abrir acceso y mostrar un motivo concreto: «Entra para consultar esta vivienda», «Entra para guardar esta vivienda» o «Entra para guardar esta búsqueda». El resumen de una vivienda debe provenir del anuncio leído, no de texto confiado de la URL.
- [x] Tras acceder, restaurar la búsqueda y abrir su hoja de guardado, o volver al anuncio con la acción reconocible. Guardar búsqueda, favorito o enviar mensaje requiere la confirmación habitual; no hacerlo automáticamente por el mero acceso.
- [x] Mantener este contexto al alternar acceso/registro. Si la confirmación por correo vuelve después de vencer la intención, mostrar un destino interno válido sin repetir acciones ni aparentar haber conservado el borrador.
- [ ] Probar acceso correcto, error y reintento, registro con confirmación, cancelación y cambio de sesión. Revisar retorno con botón Atrás y teclado en Android.
- [x] Ejecutar `node --experimental-strip-types --test tests/auth-intent.test.ts tests/auth.test.ts tests/router-query-security.test.ts tests/search-alerts.test.ts`, después `npm run check`, y verificar el recorrido completo renderizado.

**Aceptación:** guardar una búsqueda como invitado conserva exactamente sus criterios al acceder; contactar una vivienda explica el motivo del acceso y vuelve al mismo anuncio, sin acciones duplicadas.

## Etapa 3 — captar anuncios y comunicar la confianza

### Tarea 6: publicación propia o asistida

**Estado:** el usuario confirmó `fejames07@gmail.com` como destino operativo. Las dos entradas y la llamada de la portada rastreada están implementadas localmente; no se activa el backend ni se publica esta entrega. La nueva portada Vite del checkout principal sigue sin confirmar y debe consolidarse antes de trasladar allí esta llamada.

**Dependencia obligatoria:** publicación asistida y traspaso integrados y verificados. Si todavía no están listos, continuar con tareas independientes de la etapa 4; no reconstruir servidor, permisos ni traspaso dentro de esta entrega.

**Archivos:** `src/screens/PublishScreen.tsx`, `src/components/AccountPrompt.tsx`, `src/components/ListingForm.tsx`, `src/screens/DetailScreen.tsx`, `web/src/App.tsx`, `web/api/p.ts`; componentes y pruebas de publicación asistida que entregue su implementación. `tests/import-listing.test.ts`, `tests/trust-profile.test.ts`.

**Límite de negocio:** la cuenta oficial publica inicialmente con autorización. Solo la cuenta oficial principal inicia el traspaso de sus anuncios; el destinatario acepta o rechaza y no puede retransmitirlos a terceros. ID, enlaces, fotos y favoritos se conservan. Otras colaboraciones quedan fuera.

- [x] Leer el contrato final integrado y usar sus estados reales. Verificar la ruta de ayuda/contacto ya acordada; si no existe una operativa, dejar esa acción pendiente de un destino real y no inventar número, formulario o canal de recepción.
- [x] Mostrar «Publicar por mi cuenta» y «Publicar con ayuda de KarmaHouse» en la entrada de publicación. Explicar los datos/fotos necesarios y el consentimiento; hacer descubrible «Pegar anuncio» dentro del flujo propio.
- [x] Añadir a la portada rastreada (`web/public/index.html`) una llamada a aportar una vivienda y una explicación breve del proceso asistido, conectadas al destino operativo existente. No copiar la portada Vite sin confirmar de otro trabajo.
- [x] Distinguir quién ayudó a publicar y quién gestiona actualmente el anuncio. Revisar etiquetas de perfil/anuncio verificado para que no prometan titularidad comprobada.
- [ ] Verificar antes/después de aceptar o rechazar traspaso, cuenta oficial, destinatario y tercero, conservando referencias del mismo anuncio. Reutilizar las pruebas de permisos y persistencia del trabajo integrado.
- [x] Ejecutar las pruebas de importación, confianza y publicación asistida incorporadas a `npm run check`: TypeScript y 417 pruebas pasan tras corregir la reserva inferior. Revisar el recorrido autenticado con la cuenta sintética local, conservación de borrador al cambiar de opción y tras recargar; exportación Expo web estándar exit 0. La portada rastreada es estática y no tiene script build; revisar su render y enlaces en navegador.
- [ ] Tras consolidar la nueva portada Vite, portar la llamada y ejecutar su build. Mantener separadas publicación, pruebas de correo real y activación remota.

**Aceptación:** el visitante entiende cómo aportar un anuncio y quién lo gestiona; los controles visibles corresponden a permisos efectivos. La entrada asistida funciona sin abrir una función nueva de transferencia entre usuarios.

## Etapa 4 — mejorar claridad y presentación

### Tarea 7: calidad editorial, portadas y tarjetas

**Estado:** implementación local y verificación sintética terminadas; pruebas de dispositivo y publicación pendientes. Véase `docs/design-conversion-verification.md`.

**Archivos:** `src/components/PropertyCard.tsx`, `src/components/ListingPhotos.tsx`, `src/components/ListingForm.tsx`, `src/domain/importListing.ts`, `web/api/p.ts`; `tests/import-listing.test.ts`, `tests/listing-draft.test.ts` si se modifica la importación.

- [x] Preparar una lista de correcciones de los anuncios iniciales para revisión de su responsable: portada individual nítida, título legible y descripción sin residuos de formato de WhatsApp. No aplicar cambios masivos al catálogo real desde una regla de presentación.
- [x] Dar dos líneas al título de tarjeta y jerarquizar precio, ubicación y datos esenciales. Revisar títulos largos, foto ausente, alquiler, permuta y anuncios «Busco» sin inventar datos faltantes.
- [x] Reforzar la elección explícita de portada en el editor. Mostrar una recomendación breve para elegir una foto individual, nítida y representativa. No agregar un detector de collages ni generar imágenes que alteren la vivienda.
- [ ] Si se limpia texto importado, probar primero ejemplos con marcadores de WhatsApp y caracteres legítimos. Presentar el resultado para revisión antes de guardar; no modificar silenciosamente el texto de anuncios existentes.
- [x] Ejecutar `npm run check` y las pruebas de importación/borrador cuando haya cambios de comportamiento. Revisar tarjeta y detalle a 390 y 1280 px; confirmar que la tarjeta sigue usando `PropertyImage` con `variant="thumb"`.

**Aceptación:** títulos y portadas comunican mejor la vivienda sin perder hechos ni aumentar las descargas. Las correcciones de anuncios reales quedan registradas por separado de los cambios del componente.

### Tarea 8: Mi espacio invitado y coherencia de componentes

**Estado:** implementación local y verificación sintética terminadas; pruebas de dispositivo y publicación pendientes. Véase `docs/design-conversion-verification.md`.

**Archivos:** `src/screens/ProfileScreen.tsx`, `src/components/AccountPrompt.tsx`, `src/components/ui.tsx`, `src/theme.ts`, `src/screens/PublishScreen.tsx`, `src/screens/FavoritesScreen.tsx`; `tests/data-saver.test.ts`.

- [x] Reducir Mi espacio invitado a acceso/registro, una invitación útil a publicar y preferencias relevantes. Agrupar actividad y gestión de anuncios para usuarios con sesión, respetando permisos de administrador/propietario.
- [x] Colocar «Ahorro de datos» en el primer grupo visible de preferencias, accesible sin entrar en una cuenta. Verificar que sigue persistiendo y que espera su hidratación antes de cargar medios.
- [x] Unificar anchos, márgenes, botones y estados de las invitaciones de acceso. Añadir a `src/theme.ts` únicamente los valores de espaciado, radio, tipografía y superficies compartidos por estos componentes; evitar una migración global de estilos.
- [x] Mantener el azul de marca y la legibilidad del catálogo. Reservar los acentos cálidos de la portada para bienvenida/estados vacíos; no repetir la ilustración de captación en cada tarjeta.
- [ ] Ejecutar `node --experimental-strip-types --test tests/data-saver.test.ts` y `npm run check`; revisar invitado y usuario con sesión a 320, 390 y 1280 px, incluido tamaño de texto aumentado.

**Aceptación:** Mi espacio deja de exigir un recorrido largo para encontrar el ahorro de datos; las invitaciones de acceso presentan una estructura consistente y sin contenido fuera de pantalla.

### Tarea 9: mapa inicial y mantenimiento del editor

**Estado:** implementación local y verificación sintética terminadas; pruebas de dispositivo y publicación pendientes. Véase `docs/design-conversion-verification.md`.

**Archivos:** `src/components/ExploreMap.tsx`, `src/catalog/useCatalog.ts`, `src/domain/geo.ts` si se requiere una función pura de encuadre; `tests/map-rendering.test.ts`, `tests/map-data.test.ts`. Para el editor: `src/components/ListingForm.tsx` y subcomponentes que correspondan a sus pasos actuales.

- [x] Encajar el mapa a la provincia seleccionada o al contexto ya disponible al cargarlo por primera vez. Mantener consulta por viewport; no descargar todo el catálogo para calcular el encuadre ni recentrar después de cada movimiento del usuario.
- [ ] Revisar puntos cercanos/agrupaciones y la acción de volver a lista. Mantener explícita la existencia de anuncios sin ubicación publicada; no inventar coordenadas.
- [x] Probar encuadre válido, ningún punto y puntos superpuestos. Ejecutar `node --experimental-strip-types --test tests/map-rendering.test.ts tests/map-data.test.ts tests/data-saver.test.ts`, después `npm run check`; verificar que activar ahorro evita consultas y mapas hasta «Cargar mapa».
- [x] Después de integrar la etapa 3, evaluar la extracción de los pasos de `ListingForm` que esa entrega ya necesite tocar. Mantener un único dueño del borrador y las validaciones existentes. Si la extracción no reduce una dificultad concreta, diferirla; no convertir esta tarea en un refactor completo.
- [ ] Si se extraen pasos, verificar importación, navegación atrás/adelante, datos incompletos, orden de fotos, recuperación de borrador y envío único con `tests/listing-draft.test.ts`, `tests/import-listing.test.ts` y revisión autenticada.

**Aceptación:** el mapa resulta útil sin consumir más datos ni luchar contra el usuario. Cualquier extracción del editor conserva el mismo borrador y comportamiento.

## Etapa 5 — movimiento discreto y cierre

### Tarea 10: microinteracciones y accesibilidad

**Estado:** implementación local y verificación sintética terminadas; pruebas de dispositivo y publicación pendientes. Véase `docs/design-conversion-verification.md`.

**Archivos:** componentes tocados de botones, favorito, filtros, fotos y pasos del editor; la abstracción mínima compartida de movimiento que resulte necesaria. No agregar una librería nueva.

- [x] Consultar [Reanimated en Expo v57](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/) y su [guía de accesibilidad](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/) antes de implementar. Usar Reanimated instalado solo donde aporte una interacción concreta.
- [x] Aplicar feedback de pulsación de 80–120 ms, confirmación discreta de favorito conservando «Deshacer», apertura de filtros de 150–220 ms y transición de pasos alrededor de 140 ms. Ajustar con evidencia renderizada; los tiempos son propuestas, no resultados medidos.
- [x] Para una foto ya cargada, considerar un fundido de hasta 150 ms que no dispare descargas ni oculte contenido útil. Evitar animar cada tarjeta al hacer scroll o introducir esperas artificiales.
- [x] Respetar reducción de movimiento: omitir desplazamientos/escala y conservar el significado del estado. Verificar foco al abrir/cerrar modal, etiquetas y áreas táctiles de al menos 44 pt, sin depender solo del color.
- [ ] Revisar reducción de movimiento en navegador y Android, botón Atrás, teclado y TalkBack. Medir fluidez en Android si se va a afirmar un resultado de rendimiento; no deducir 60 fps de que la animación existe.

**Aceptación:** las interacciones ayudan a reconocer acciones y estados; la aplicación sigue siendo completa y comprensible con animaciones reducidas y ahorro de datos activo.

## Verificación y entrega de cada etapa

- [x] Ejecutar las pruebas específicas descritas y `npm run check`. Ejecutar `npm --prefix web run build` cuando cambie la portada. Registrar comandos y resultado real; no reutilizar resultados anteriores como prueba de la entrega nueva.
- [ ] Revisar en navegador 390 × 843 y 1280 × 900; incluir 320 px y texto aumentado donde se modifican controles. Guardar capturas nuevas de antes/después y anotar qué escenario utiliza fixtures.
- [ ] Completar Android físico. Se verificaron filtros/error/reintento, acceso contextual y modal sin guardar, teclado/Atrás, fuente 1.5, movimiento reducido y persistencia de ahorro en el paquete QA. La continuación manual verificó cambio de portada heredada, miniatura y persistencia al guardar/reabrir, con backend ficticio; el usuario abrió el editor. Quedan TalkBack y mapa/correo reales. No presentar los casos pendientes ni el backend remoto como comprobados.
- [x] Verificar físicamente el cambio de portada con dos fotos almacenadas/heredadas: selección de interior, guardado único, miniatura correspondiente y editor reabierto con interior primero marcado Portada. Conservar capturas y registros del backend local ficticio.
- [x] Verificar cuenta invitada y autenticada donde corresponda, limpieza de fixtures, respuestas tardías, cambio de cuenta y carga sin red. No tocar datos reales para simular errores.
- [x] Ejecutar `git diff --check` y revisar el diff de la entrega; actualizar las casillas y un registro breve con base, archivos, evidencia y pendientes.
- [x] Preparar la entrega para revisión. Despliegue, nueva APK y comprobación pública son pasos posteriores dentro del alcance autorizado al retomar; no se ejecutan por guardar este plan. Cuando se publiquen cambios, volver a verificar los recorridos en sus URLs reales.

## Evidencia de partida y límites

Auditoría del 5 de octubre: revisión renderizada de Expo web, portada local/pública, ficha pública y destino antiguo; revisión estática de formularios, autenticación, datos, ahorro y animaciones. Las capturas se guardaron fuera del repositorio en:

`C:\Users\ACER NITRO\.codex\visualizations\2026\10\05\01a10caa-337d-7232-9afd-ccbd10978a85`

Capturas clave: `app-filtros-conteo-390.jpg`, `destino-ver-mas-publico-390.jpg`, `app-contacto-acceso-390.jpg`, `app-mi-espacio-invitado-390.jpg`, `app-explorar-390.jpg`, `app-detalle-390.jpg` y `portada-publica-390.jpg`.

La auditoría no verificó flujos autenticados completos, Android físico, teclado nativo, lector de pantalla, reducción de movimiento del sistema, bytes consumidos ni fps. El catálogo tenía tres anuncios en la consulta inicial; ese número no debe convertirse en un supuesto fijo de las pruebas futuras.

## Fuera de esta primera ronda

- Conteos remotos por cada cambio dentro del panel de filtros.
- Catálogo web completo, nuevos canales de recepción de anuncios o otro backend de alertas.
- Transferencias entre destinatarios, colaboración posterior y cambios en comisiones/pagos.
- Descarga de mapas sin conexión, todas las fotos precargadas o miniaturas de toda la galería sin medir antes su beneficio.
- Cambio de identidad visual completo, animaciones de lista en cascada, confeti, mapas 3D o transiciones compartidas de imágenes.

Estos puntos requieren una necesidad comprobada y un plan separado; no bloquean las correcciones prioritarias.

## Cierre local del 5 de octubre

La segunda fase se integró y completó en lo implementable, con revisión independiente y una pasada de correcciones. La continuación añadió el correo confirmado, las dos entradas de publicación y la llamada de la portada estática. TypeScript y 417/417 pruebas pasan; exportación estándar Expo web exit 0. En Pixel se verificaron los recorridos enumerados en docs/design-conversion-verification.md, incluido texto ampliado, teclado y Atrás. Las casillas compuestas de correo real, Android completo, mapa real, consolidación Vite y despliegue permanecen abiertas. Los pasos condicionados de limpieza del importador y extracción no se ejecutan porque no se introdujeron esos cambios. Las decisiones están en docs/design-conversion-decisions.md. El aviso de inicio ya se emitió una vez y la continuación permanece PAUSED tras este cierre.
