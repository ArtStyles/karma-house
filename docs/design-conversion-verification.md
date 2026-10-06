# Diseño y conversión: segunda fase

Trabajo local del 5 de octubre de 2026, en la rama aislada de recorrido público. La publicación asistida cerró en `7f14304` con su informe guardado y el checkout limpio. Se integró mediante `0b50d5c`; la nueva línea base pasó TypeScript y 385 pruebas. No se modificó el checkout principal, no se publicaron cambios ni se activó el backend asistido.

## Catálogo, errores y operaciones

- Cada respuesta y conteo conserva la identidad de sus filtros. La presentación detecta el cambio antes del debounce; muestra «Actualizando…» y no atribuye el conteo anterior a los criterios nuevos. No se pagina una lista que todavía pertenece a otros filtros.
- El panel mantiene un borrador independiente y usa «Aplicar filtros». Un rango inválido impide aplicar; cancelar conserva la búsqueda vigente. No realiza consultas de conteo por cada cambio del borrador.
- Detalle y favoritos consumen sus errores propios y ofrecen reintento. Los favoritos conocidos se conservan tras un fallo de lectura, sin afirmar que se retiraron; cambiar de cuenta invalida datos y respuestas anteriores. La copia del detalle sin conexión conserva el aviso y bloquea contacto/favoritos.
- Operación y provincia quedan visibles en el encabezado. Se mantienen los valores y reglas de venta/permuta/alquiler/busco. El vacío filtrado ofrece ampliar o guardar la búsqueda; la recuperación del guardado invitado continúa en la tarea de acceso contextual.

Las regresiones observadas fallaron antes de la implementación: faltaban las nuevas decisiones de estado y la identidad de la consulta actual. Después pasaron 51 pruebas de catálogo/ahorro y 27 de operaciones/búsquedas; la suite completa pasó TypeScript y 392 pruebas. Se añaden por separado las pruebas de la tarea de acceso contextual; sus resultados no acreditan todavía su interfaz.

## Evidencia visual

Se verificaron los componentes reales mediante un servidor HTTP sintético exclusivo de loopback. Auth, catálogo y favoritos se simulan; no se conectó a Supabase real, no se enviaron mensajes ni se modificaron anuncios reales.

La primera exportación falló porque el enlace de dependencias a otro disco generaba rutas Windows inválidas y un bundle sin rutas. Se descartó esa vista. La revisión utiliza una copia de las fuentes y de las mismas dependencias instaladas, dentro de la carpeta ignorada de este plan; la exportación estándar de Expo pasó allí. El código y dependencias originales no se sustituyeron. Un adaptador experimental de salida no es evidencia de compilación y no se utiliza en la revisión final.

Recorridos comprobados:

- Móvil 390 × 843, 320 × 843 y escritorio 1280 × 900, con operación visible y controles utilizables.
- Presupuesto máximo de 1 USD: durante una respuesta retrasada aparece «Actualizando…» y desaparece el conteo anterior; después se muestra el vacío confirmado y «Guardar esta búsqueda».
- Mínimo 2 y máximo 1: aplicar queda deshabilitado; cancelar no modifica la búsqueda.
- Los cinco valores de operación aparecen juntos en el selector.
- Un fallo de lectura de favoritos muestra reintento y ninguna afirmación de retirada. Una lectura de detalle fallida ofrece reintento; al recuperar la conexión se muestra la misma ficha.
- Una respuesta correcta sin ficha muestra «Esta vivienda no está disponible». Una pérdida de conexión después de cargar el catálogo recupera su copia; tocar Contactar muestra que requiere conexión.

Capturas en `C:/Users/ACER NITRO/.codex/visualizations/2026/10/05/01a10caa-337d-7232-9afd-ccbd10978a85`: `phase2-explore-320.png`, `phase2-explore-390.png`, `phase2-explore-1280.png`, `phase2-filters-390.png`, `phase2-updating-390.png`, `phase2-empty-390.png`, `phase2-favorites-error-390.png`, `phase2-detail-error-390.png`, `phase2-detail-unavailable-390.png` y `phase2-detail-offline-390.png`. Contienen datos sintéticos.

## Pendientes

El trabajo implementable del acceso contextual, tarjetas, Mi espacio, mapa y accesibilidad queda guardado localmente. En la continuación, el usuario confirmó el correo de recepción y se implementaron las entradas de publicación propia/asistida; su evidencia aparece al final. La activación remota sigue pendiente. Los cambios locales de la portada Vite no se copiaron desde otro checkout.

La evidencia de navegador no prueba Android. La continuación añade pruebas físicas de teclado, Atrás, texto ampliado y otros recorridos enumerados al final, con un paquete QA separado y backend sintético. Siguen pendientes TalkBack, rendimiento medido, mapa/correo reales, despliegue público, Supabase real y apertura de enlaces con/sin la app habitual.

## Acceso contextual

La intención local conserva solo tipo, ID validado o filtros y orden durante treinta minutos. Lectura corrupta o vencida devuelve ningún contexto; destinos externos siguen rechazados por el contrato original de autenticación. La restauración consume el contexto una vez, solo para la pantalla activa y el destino coincidente. Salir o cambiar de cuenta limpia lo pendiente. No se almacenan credenciales ni mensajes.

En el servidor sintético se comprobó el recorrido invitado con máximo de 1 USD y orden descendente: el motivo permanece al alternar acceso/registro, entrar recupera ambos valores y abre la hoja para confirmar. Contactar vuelve a la misma ficha mostrando la acción pendiente; no inicia una conversación. El motivo del favorito se muestra y «Seguir explorando» elimina el contexto. El acceso ordinario posterior vuelve a su explicación normal.

Pruebas nuevas RED→GREEN de consumo único y cambio de foco; TypeScript y 401 pruebas completas pasan. La confirmación por correo y la expiración se verifican en funciones puras; no se solicitó un correo real ni se completó un registro remoto. Capturas: `phase2-auth-search-390.png`, `phase2-search-restored-390.png`, `phase2-auth-contact-390.png`, `phase2-contact-restored-390.png`, en la carpeta de evidencia indicada arriba.

## Tarjetas, editor y Mi espacio

Tarjetas con título de dos líneas, precio y datos existentes; se mantienen miniaturas. Se comprobaron títulos largos, foto ausente, alquiler mensual, permuta como valor estimado y «Busco» sin inventar superficie o baños. El editor permite «Usar como portada» para cualquier foto: con dos imágenes de demostración se verificó cambiar y revertir el orden sin perderlas, y retroceder sin perder título, zona o provincia. El importador permanece sin limpieza silenciosa nueva. La [lista editorial](listing-editorial-review.md) contiene propuestas para los tres anuncios públicos leídos anónimamente; ninguna se aplicó.

Mi espacio invitado muestra la preferencia antes de la invitación a entrar y publicar; actividad y gestión aparecen con sesión o en demo. Las invitaciones comparten estructura y anchos. Ahorro persiste tras recargar y deja el mapa esperando «Cargar mapa». Invitado y cuenta sintética se revisaron a 320, 390 y 1280 px. No se afirma haber probado texto ampliado del sistema.

El encuadre inicial aprovecha puntos publicados ya presentes en el resultado de una provincia, sin otra consulta de catálogo; sin contexto válido conserva Cuba. Se fija una vez por apertura, luego manda el viewport. Tres pruebas nuevas cubren puntos válidos, ausentes/incorrectos y superpuestos. No se extrajeron pasos del editor: los cambios concretos de portada quedan en su componente, manteniendo un solo borrador y sus validaciones.

## Movimiento y accesibilidad

Se consultaron [Reanimated en Expo v57](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/) y la [guía oficial de accesibilidad](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/). Se usan las dependencias instaladas: feedback de pulsación de 100 ms, opacidad del panel de filtros de 180 ms y de pasos de 140 ms. Son tiempos configurados, no latencia medida. No se anima el scroll ni se añaden descargas o esperas; se conserva Deshacer de favoritos.

La preferencia de movimiento inicia reducida hasta conocerse y responde a cambios posteriores; una lectura tardía no pisa el evento nuevo. Las animaciones nuevas omiten escala/transiciones cuando se reduce. La preferencia real del navegador de prueba era false; Android y su ajuste real siguen pendientes. Escape cierra filtros y devuelve foco al control original. Corazón, quitar foto y elegir portada conservan al menos 44 puntos; enlaces legales de Mi espacio también.

La QA detectó que Reanimated convertía un callback de estilos en un arreglo, perdiendo el posicionamiento y área de botones. Se resolvió el callback antes de pasarlo al componente animado; la geometría final fue absoluta de 44 × 44 tanto en corazón como quitar foto. Las capturas afectadas se reemplazaron después de la corrección.

Pruebas nuevas de portadas, encuadre y preferencia fallaron antes de implementar. Verificación final: TypeScript y 408/408 pruebas, exportación estándar Expo web de la copia local y revisión de cambios. No se incorporaron dependencias, credenciales ni archivos de otro trabajo sin confirmar.

Capturas adicionales: `phase2-profile-guest-320.png`, `phase2-profile-guest-390.png`, `phase2-profile-guest-1280.png`, sus tres equivalentes `phase2-profile-account-*`, `phase2-cover-before-390.png`, `phase2-cover-after-390.png`, `phase2-card-long-390.png`, `phase2-card-long-1280.png` y `phase2-map-data-saver-320.png`. Las imágenes muestran fixtures locales. Los recorridos de alquiler/Busco/permuta se verificaron; sus capturas anteriores al arreglo de estilos no se usan como prueba del resultado final.

## Alcance implementable y acciones pendientes

El destino de asistencia y las dos entradas se completaron en las continuaciones descritas al final, junto con las pruebas físicas allí enumeradas, incluido el cambio y persistencia de portada heredada. Quedan la revisión editorial por el responsable, TalkBack, mapa/correo reales, publicación y apertura de enlaces con/sin la app habitual. No se activó asistencia remota, no se publicaron APK, no se desplegó ni se modificaron anuncios reales. El build Vite no aplica a la portada rastreada de esta rama: no tiene script build. Tras consolidar la nueva portada sin confirmar del checkout principal, hay que portar allí la llamada y ejecutar su build.

## Revisión independiente y cierre

Un revisor independiente inspeccionó la entrega y ejecutó TypeScript y 408 pruebas en el código anterior a sus correcciones. Identificó cuatro problemas P2, sin P0/P1. Se verificaron contra las fuentes y se corrigieron en una sola pasada:

1. Reintentar un cambio de filtros fallido inicia su primera página, aunque el resultado anterior tuviera más páginas. Solo se reintenta la paginación si los resultados pertenecen a los filtros actuales. Se reprodujo y recuperó el fallo en el navegador con paginación y respuesta 503 sintéticas.
2. La navegación global distingue `/auth/callback` de abandonar el acceso. El salto al callback conserva la intención mientras se verifica la sesión; volver como invitado a otra pantalla la elimina. La prueba recorre almacenamiento, ambas transiciones y consumo único. No se envió un correo ni se probó el deep link en Android.
3. Elegir o quitar la portada prepara su miniatura antes de modificar el orden, también en fotos almacenadas/heredadas. Si falla, se mantiene el orden anterior y se informa. La miniatura nueva pertenece al prefijo del propietario y solicitud actuales; utiliza un token nuevo para no reutilizar un archivo inmutable que el servidor ya marcó huérfano. Reintentar la misma preparación conserva el token. Las pruebas cubren preparación, carga, payload y lectura posterior con solo la URL de miniatura; no prueban Storage/RLS desplegado.
4. El mapa espera los límites reales de su cámara antes de consultar. Web informa al cargar, mover y redimensionar; deja de consultar el rectángulo de los puntos disponibles como si fuera todo el viewport. Una prueba de eventos verifica los bordes visibles antes de cualquier gesto. La carga real de mapas y Android siguen pendientes.

También se incluyó en la cancelación de la tarea 5 el acceso tardío preexistente: una respuesta de otra visita no puede redirigir ni mostrar estado en la pantalla abandonada. En navegador, una entrada sintética retrasada cinco segundos permitió volver y abrir Mi espacio; la respuesta final conservó ese destino, sin abrir la hoja de guardado. La sesión de prueba se cerró y no se confirmó ninguna búsqueda ni mensaje.

Las nuevas pruebas fallaron al faltar los contratos; la regresión adicional de la portada almacenada falló mostrando la ruta antigua `a_t.jpg` antes de corregirse. Resultado final después de todos los cambios: `npm run check`, TypeScript y **415/415 pruebas**, y exportación estándar Expo web exit 0. No se realizó una segunda revisión independiente; el ejecutor verificó la única pasada de correcciones. `git diff --check` de los cambios propios pasa; el rango completo conserva el detalle menor heredado de abajo.

Capturas nuevas de cierre en la carpeta de evidencia: `phase2-review-filter-error-390.png`, `phase2-review-filter-recovered-390.png`, `phase2-review-search-restored-390.png`, `phase2-review-auth-back-390.png` y `phase2-final-profile-390.png`. La última captura se verificó a 390 × 843 con el encabezado de 331,2 px, evitando capturar una transición de viewport. Son datos sintéticos; las capturas del correo y del mapa real no se inventan.

Menor diferido: línea vacía adicional al final de `scripts/local-sql/bootstrap.sql:29`, incorporada con el trabajo asistido. No cambia SQL; no se modificó ese archivo solo por formato.

La entrega quedó guardada en `124f185`, en `codex/public-journey`, con el worktree conservado y los [pendientes y decisiones](design-conversion-decisions.md) disponibles para revisión. El registro solicitado se mantiene en `.superpowers/sdd/2026-10-05-design-and-conversion/progress.md`. Los tabs de QA se cerraron, el viewport se restauró y el servidor loopback se detuvo. La revisión automática rechazó la eliminación de `ui-project` y `web-fixture` con el motivo genérico «blocked by policy»; se conservan ignoradas, aproximadamente 2 GB, sin intentar otro método de borrado. La continuación `continuar-mejoras-de-karmahouse` quedó **PAUSED**, confirmado por la herramienta de la aplicación, porque lo restante requiere destino operativo, autorización de publicación o dispositivo.

## Continuación: canal de publicación asistida

El usuario respondió que `fejames07@gmail.com` atenderá las solicitudes. «Publicar» ofrece publicación propia o con ayuda. La ayuda está disponible para invitados y explica operación, provincia, zona aproximada, características, precio/condiciones, fotos y revisión. La cuenta oficial necesita autorización expresa antes de publicar; el texto explica la invitación posterior para aceptar o rechazar el traspaso. El botón prepara un correo con campos vacíos y una solicitud de información; no incorpora datos de la cuenta ni del borrador, no envía correo ni otorga consentimiento. Si no puede abrir un cliente, informa y conserva visible la dirección seleccionable. Las cuentas suspendidas mantienen el bloqueo.

El formulario propio permanece montado al cambiar de opción, oculto de pantalla y accesibilidad mientras se consulta ayuda. En el navegador con la cuenta sintética, el título y la operación se conservaron al ir a ayuda y volver, y tras recargar. «Pegar anuncio» sigue visible en el selector de operaciones. Se vació el título añadido para la prueba; no se envió ningún anuncio.

La portada estática rastreada incorpora una llamada desde el inicio y el pie, dos opciones y el correo operativo. Se mantuvieron el contacto general anterior y la descarga pública 0.1.15. Se revisaron anchos 320, 390 y 1280, sin desbordamiento horizontal. No se copiaron las fuentes Vite ni otros archivos sin confirmar del checkout principal; su integración y build quedan pendientes.

Una revisión independiente encontró un P2: el scroll no reservaba espacio para la barra flotante. Se añadió `layout.tabContentBottom`; la captura final a 320 muestra el correo en y=655–679, por encima de la barra. No quedan otros hallazgos en esa revisión. Verificación posterior a la corrección: TypeScript y **417/417 pruebas**, exportación Expo web estándar exit 0 y cambios propios sin errores de `git diff --check`. Las dos pruebas nuevas verifican el mailto y el fallo de apertura sin reintentos ni envío. Se leyeron las [referencias exactas de Expo v57](https://docs.expo.dev/versions/v57.0.0/) y [Linking v57](https://docs.expo.dev/versions/v57.0.0/sdk/linking/).

Capturas nuevas en la carpeta de evidencia: `phase3-publish-390.png`, `phase3-help-320-final.png`, `phase3-help-1280-final.png`, `phase3-public-320.png`, `phase3-public-390.png` y `phase3-public-1280-final.png`. Los recorridos de app utilizan exclusivamente el servidor sintético loopback; las imágenes de portada son las del sitio rastreado.

### Preparación Android y límite de dispositivo

La copia de QA encontró dos límites de Windows: raíces R:/C: distintas en codegen y longitud de rutas en Ninja. Se trasladó solo esa copia a una carpeta nueva e ignorada, `D:\work\karma-house\artifacts\design-conversion-qa`; se preservaron las cachés antiguas, sin borrarlas. La compilación posterior `assembleRelease` arm64 pasó: 571 tareas, `BUILD SUCCESSFUL`, 6 min 46 s. La fuente final de PublishScreen tiene el mismo SHA-256 en el worktree y la copia.

El APK de **pruebas**, firmado con la clave debug de su proyecto generado, usa `com.karmahouse.karmahouse.conversionqa`, nombre «KarmaHouse Conversion QA», 0.1.16/17 y un backend local sintético. Se omiten Firebase/EAS y credenciales reales; el manifiesto QA permite HTTP solo para esta prueba de loopback. No es un artefacto de distribución. Ruta: `D:\work\karma-house\artifacts\design-conversion-qa\android\app\build\outputs\apk\release\app-release.apk`, 62.254.819 bytes, SHA-256 `CD9E47B5426A68628848D40E97A9ADD1A3308ABE3E4263F491E6B6B0747E8DC0`.

La instalación y apertura en Pixel 7 Pro tuvieron éxito. La instalación habitual `com.karmahouse.karmahouse` sigue en 0.1.15/16. Al pasar Teléfono al primer plano, las acciones se detuvieron por la comprobación de foco; el usuario confirmó que el Pixel estaba libre y autorizó continuar. No se capturó Teléfono ni se modificaron sus datos. Se comprobaron estos recorridos físicos con la app QA y el backend sintético:

- Ayuda visible como invitado con fuente habitual 1.15; fuente 1.5 y escala de animador 0: las opciones responden, el texto se puede desplazar y el correo queda por encima de la barra. No se midieron duración real ni fps.
- Mi espacio como invitado con fuente 1.5: preferencias antes del acceso, texto y acciones legibles. Ahorro de datos pasó a `checked=true` y permaneció así después de detener y abrir otra vez **solo** la app QA. No se midieron bytes de fotos o mapas.
- Acceso desde publicación propia: el teclado se mostró (`mInputShown=true`); Atrás lo ocultó (`false`), y un segundo Atrás volvió a Publicar.
- Filtros: desde una vivienda, máximo 1 USD con respuesta retrasada pasó a «Actualizando…» sin el conteo antiguo. Un 503 mostró «Resultados sin actualizar» y Reintentar. Al recuperar el backend, el reintento obtuvo el vacío para máximo 1 USD.
- Guardar ese vacío con orden Mayor precio abrió el acceso con su motivo. Tras entrar con `buyer@example.invalid`, apareció la hoja de confirmación con máximo 1 USD. Se canceló sin guardar. La lista conservó «Mayor precio» y «0 – 1 USD»; los logs de RPC confirman `max_price:1`, `sort:price-desc`, `cursor:null`.

Capturas físicas: `phase3-native-help-default.png`, `phase3-native-help-large-reduced.png`, `phase3-native-profile-large.png`, `phase3-native-data-saver-restored.png`, `phase3-native-auth-back.png`, `phase3-native-catalog.png`, `phase3-native-filters-updating.png`, `phase3-native-filter-error.png`, `phase3-native-filter-recovered.png` y `phase3-native-search-restored.png`. Los estados y las fotos ausentes son sintéticos; no prueban backend desplegado, correo real ni recepción push.

La revisión automática rechazó el comando para abrir el editor Android con un anuncio sintético, con el motivo genérico «blocked by policy». Ninguna parte de ese comando se ejecutó. En ese punto quedó pendiente la prueba física de portadas almacenadas/heredadas y no se intentó otro camino para sortear el rechazo. La continuación manual documentada al final completó esa prueba, con el usuario abriendo el editor. Siguen pendientes TalkBack, correo/confirmación real, mapa real y apertura del enlace público con/sin la app habitual.

Se restauraron y verificaron fuente 1.15 y las tres escalas de animación 1.0. No se cambiaron permisos. La cuenta sintética del navegador se cerró; sus tabs se cerraron y el viewport se restableció. Cuando otro app pasó al primer plano del Pixel se evitó interactuar allí; se limpiaron únicamente los datos descartables del paquete QA con `pm clear`, confirmado por Success. El paquete QA sigue instalado, sin sesión ni borradores; la app habitual y sus datos se preservaron. Se retiró solo el reverse TCP 8106 creado para esta prueba.

Registros nuevos: `contact-check-final.log`, `contact-web-export-final.log`, `conversion-android-build-shortpath.log` y `native-fixture-log.json`, en el directorio ignorado del plan. Los logs fallidos de raíces/ruta se conservan como diagnóstico, no como evidencia de compilación correcta. La continuación permanece PAUSED: los siguientes pasos dependen de consolidación de la portada, pruebas personales pendientes o autorización concreta para publicación y activación. No se repitió el aviso de inicio de segunda fase.

Al cerrar esta continuación se detuvo el servidor sintético y se verificó que no quedaba un listener en 8106. Se retiró la unidad R: después de confirmar que apuntaba exclusivamente al directorio de QA de este plan. Se conservaron los logs, la copia QA, su APK y las capturas para revisión.

### Preparación posterior para el paso manual de portadas

El usuario autorizó mediante su conversación de voz preparar otra vez el ensayo y dejar QA en el último punto permitido. Se inspeccionaron la llamada original `call_ukCupWaJKJ4awytR7xquKDet` y su salida: el comando combinaba cambiar el escenario, detener QA y abrir directamente el editor mediante un URI. La salida solo contiene `CreateProcess ... Rejected ... blocked by policy`; no identifica la acción concreta ni ofrece otro motivo. No se repitió ese comando ni se abrió el editor por otra vía.

Se preparó `cover-fixture.mjs` exclusivamente en el directorio ignorado del plan, sin cambios al producto. Sirve dos imágenes distintas del proyecto como fotos heredadas: fachada e interior, bajo el prefijo del propietario ficticio anterior. El anuncio pertenece a la cuenta ficticia actual. Acepta solo la miniatura JPEG del propietario/solicitud actuales y el guardado del mismo ID, con versión coincidente y las dos rutas heredadas conservadas; registra carga, SHA-256, orden y ruta de miniatura para la comprobación posterior. No conecta a Supabase ni realiza solicitudes remotas.

La preparación reprodujo un error del propio fixture: devolvía el anuncio en todas las páginas, mientras `collectPages` espera una página vacía. Se corrigió la paginación del backend ficticio. La comprobación HTTP nueva devuelve una fila en offset 0 y cero en offset 1; se conservaron los diagnósticos anteriores. Esto no constituye una comprobación de portadas en Android. No se ejecutó de nuevo la suite del producto para esta preparación y no se reutilizan sus 417 pruebas como evidencia del recorrido pendiente.

Al comprobar el dispositivo, la app habitual estaba al frente, aunque el usuario había indicado que abrió QA. No se tocaron controles ni datos de esa app. La apertura normal de la actividad inicial de `com.karmahouse.karmahouse.conversionqa`, sin URI de editor ni force-stop, pasó la revisión normal y se ejecutó. Se restableció únicamente reverse TCP 8106, se entró con la cuenta sintética y se llegó a **Mis anuncios**, donde aparece una sola **Casa de prueba local**, la foto de fachada y **Editar**. Se comprobó el foco de QA antes y después de las acciones. Una lectura de jerarquía que no finalizaba se canceló; la captura segura posterior confirma esa pantalla y el botón visible.

**Estado al preparar el relevo:** el primer paso manual era tocar **Editar** en **Casa de prueba local**, dentro de **KarmaHouse Conversion QA**. La apertura del editor quedó al usuario por el rechazo anterior sin detalle. Después debía escoger la foto de interior como portada, guardar y reabrir, y contrastar la miniatura y las rutas registradas. El resultado posterior aparece abajo. La app habitual se conservó y no hubo anuncios reales, correo, despliegue ni activación remota.

La captura `phase3-native-cover-handoff-state.png` se conserva en la carpeta de evidencia. Durante el relevo se mantuvieron activos `node cover-fixture.mjs`, reverse TCP 8106 y la cuenta sintética únicamente en QA, para que el paso manual funcionara. Tras completar y registrar el recorrido se hizo la limpieza descrita al final. La automatización recurrente continúa PAUSED; esta preparación respondió a la autorización directa del usuario.

### Resultado físico del cambio de portada heredada

El usuario realizó manualmente la apertura del editor, el cambio a la foto de interior, el guardado y la reapertura. El asistente observó la app QA y contrastó el backend local; no repitió la apertura automática que había sido rechazada.

La captura nueva `phase3-native-cover-form-current.png` muestra el paso Detalles con el interior primero y la etiqueta Portada. Después del guardado, `phase3-native-cover-after-save-current.png` muestra Mis anuncios con la miniatura del interior y el estado En revisión. La ficha reabierta en `phase3-native-cover-reopened-current.png` muestra el interior como foto 1/2. Finalmente, la captura nueva `phase3-native-cover-editor-reopened-final.png` confirma **Editar anuncio → Detalles**, con el interior primero marcado **Portada** y la fachada segunda. Son capturas físicas sucesivas del mismo ensayo, no una reutilización de la vista anterior al guardado.

El backend ficticio registra **una subida de miniatura y un guardado**, versión **2**. Las dos rutas heredadas se conservan bajo el propietario ficticio anterior, ahora en orden `room.jpg`, `front.jpg`. La miniatura nueva pertenece al propietario/solicitud actuales, con un token nuevo: `10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/muw3t7v7-nuqk8splp8a-wxncwj884k_t.jpg`. Se inspeccionó visualmente el JPEG subido: corresponde al interior, mide **480 × 320**, ocupa **29.059 bytes** y su SHA-256 es `3dc30ab6c745f562a6ea83aebafbf5c4543053323fbbb406594ccf89af980d7f`. La lectura de esa miniatura aparece después del guardado. Las nuevas lecturas de propiedades/gestión posteriores al guardado respaldan la reapertura; no hubo un segundo guardado.

Se conservan `cover-fixture-after-save.json`, `cover-fixture-reopened.json`, `cover-fixture-final.json`, el JPEG y los diagnósticos en el directorio ignorado del plan. **Esta comprobación física de cambio, miniatura y persistencia queda completada para la app QA con backend local ficticio.** No verifica Storage/RLS, Supabase remoto, publicación o traspasos remotos. La suite previa de 417 pruebas no se presenta como prueba nueva de este recorrido; no se cambió código del producto.

Una captura adicional después del último «dale», `phase3-native-cover-editor-reopened-confirmed.png`, vuelve a confirmar el editor reabierto y el interior como Portada. `cover-fixture-confirmed.json` conserva la versión 2 y el único guardado/subida. No hace falta otro paso manual para este caso.

Después de documentar la evidencia, se limpiaron únicamente los datos descartables de `com.karmahouse.karmahouse.conversionqa` (`pm clear`: Success), se retiró reverse TCP 8106 y se detuvo el proceso propio del fixture. Se comprobó que no queda un listener en 8106 ni ese reverse. La app QA permanece instalada sin sesión ni borradores ficticios; la app habitual mantiene 0.1.15/16 y sus datos. No se cambiaron permisos ni ajustes globales. Se conservaron los archivos de evidencia; no se hizo borrado recursivo ni hubo un nuevo rechazo automático.

## Integración de ramas y web actual — 6 de octubre de 2026

Se reunieron los 37 commits pendientes de `codex/public-journey`, incluidos los cambios de `codex/assisted-listings-transfer` y `codex/data-saver-resume`, con la portada React/Vite de `origin/main` (`cab71fe`). Se conservaron los servidores de preview y la configuración de la web actual. La entrada «Publicar con ayuda de KarmaHouse» se trasladó a React con el mismo correo, autorización posterior y alternativa manual; se retiraron los archivos estáticos reemplazados. La comprobación previa del HTML compilado reprodujo la pérdida de `#publicar`, y la comprobación posterior confirmó su recuperación junto a los enlaces de contacto y descarga.

La exclusión de `web/prerender.mjs`, `web/dist` y `web/dist-ssr` evita que el chequeo de Expo lea archivos de build que Vite está reemplazando. `web/api/p.ts` sigue incluido en TypeScript y la portada tiene su propio chequeo.

Verificación nueva de la combinación: `npm run check` pasó TypeScript y **417 pruebas**, `npm --prefix web run build` pasó con prerender, `tsc --noEmit -p web/tsconfig.json` pasó y `expo export --platform web` terminó correctamente. Se revisó el bloque de publicación a **320, 390 y 1280 px**, sin desbordamiento horizontal ni errores de consola. La revisión independiente no dejó hallazgos importantes pendientes. Los logs de esta integración están en `artifacts/git-sync-*.log`, ignorados por Git.

Esta integración verifica el código combinado. No aplica migraciones, despliega la función privada, activa los traspasos ni distribuye una nueva versión Android. La descarga pública conserva **0.1.15**. Los APK/AAB normales 0.1.16 anteriores proceden de `ea3b97f`; una futura distribución necesita reconstruir desde la revisión final y completar la preparación del backend descrita en `assisted-listings-activation.md`.
