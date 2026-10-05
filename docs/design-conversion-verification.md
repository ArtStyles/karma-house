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

Continuar acceso contextual, tarjetas, Mi espacio, mapa y accesibilidad según el plan. El canal real de recepción de publicaciones asistidas y la activación remota siguen pendientes de la operación; no se inventará un destino de contacto. Los cambios locales de la portada Vite no se copiaron desde otro checkout.

La evidencia de navegador no prueba Android, teclado nativo, botón Atrás, TalkBack, texto ampliado del sistema ni rendimiento. Tampoco prueba despliegue público, Supabase real ni apertura de enlaces con/sin app instalada. Estas verificaciones quedan explícitamente pendientes.

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

Quedan el destino operativo de asistencia y su entrada en la portada, la revisión editorial por el responsable, el correo real, Android físico (texto ampliado, teclado, Atrás, TalkBack y reducción de movimiento), publicación y apertura de enlaces instalada/no instalada. No se activó asistencia remota, no se publicaron APK, no se desplegó ni se modificaron anuncios reales. El build Vite no aplica: la portada rastreada no tiene script build; sus cambios sin confirmar en el checkout principal siguen preservados.
