# Decisiones y límites de la entrega local

Este registro recoge las decisiones de ejecución y lo que quedó fuera de la evidencia. El informe principal es [design-conversion-verification.md](design-conversion-verification.md); no acredita despliegue ni Android.

| Orden | Decisión | Motivo y coste si resulta insuficiente |
| --- | --- | --- |
| 1 | El alcance independiente se consideró aprobado por la instrucción de comenzar. | El usuario autorizó continuar; cualquier ajuste sigue siendo local y reversible. |
| 2 | Mantener las URLs legales antiguas y usar la portada oficial para descargar. | Son contratos distintos; verificar de nuevo sus URLs al publicar. |
| 3 | Reutilizar las dependencias instaladas mediante junction sin instalarlas otra vez. | Evita mutaciones concurrentes; la exportación entre discos requirió una copia física temporal. |
| 4 | Registrar tareas manualmente y dejar abiertas las casillas de dependencias. | El plan usa títulos en español y aceptación compuesta; una casilla abierta puede incluir solo validación operativa pendiente. |
| 5 | No ejecutar un build Vite inexistente en el paquete rastreado ni copiar cambios ajenos sin confirmar. | La portada nueva del otro checkout no forma parte de esta entrega; deberá integrarse por separado. |
| 6 | Usar iframes durante el trabajo concurrente y viewports directos después de su cierre. | Se evita interferencia; el resultado no demuestra adaptación nativa. |
| 7 | Comprobar copia y CSS con vistas reales sin pruebas que reproduzcan la implementación. | La evidencia depende de esos escenarios; texto extremo y dispositivo necesitan validación adicional. |
| 8 | Guardar la entrega pública en un commit local sin publicar ni distribuir APK. | La corrección todavía no llega a usuarios del sitio desplegado. |
| 9 | Separar apertura Android y despliegue del veredicto de revisión pública. | Las 22 pruebas públicas no acreditan instalación ni deep link físico. |
| 10 | Dejar el contraste/tamaño extremo del pie público preexistente fuera del bloque independiente. | Puede permanecer un problema con texto extremo; la revisión normal móvil/escritorio no lo resuelve. |
| 11 | Conservar la rama/worktree para continuar y revisar localmente. | La integración final y publicación siguen siendo pasos posteriores. |
| 12 | No inventar un canal asistido ni activar el backend; sí aclarar publicación propia y confianza. | La entrada asistida y su llamada en portada siguen pendientes de un destino operativo real. |
| 13 | Exportar una copia ignorada con las mismas fuentes y dependencias tras el fallo entre discos. | La exportación acredita esa copia exacta; no el adaptador experimental descartado. La copia ocupa espacio temporal. |
| 14 | Consumir la intención con una cola, destino coincidente y pantalla activa. | Si se pierde contexto se reelige la acción; nunca se guarda ni contacta automáticamente. |
| 15 | Usar puntos públicos ya cargados para encuadrar; conservar Cuba si faltan. | Una provincia puede abrir con un encuadre amplio. No se infieren coordenadas ni se descarga todo el catálogo. |
| 16 | Diferir la extracción de pasos del editor. | No resolvía una dificultad concreta de lo tocado; el formulario grande sigue requiriendo mantenimiento cuidadoso. |
| 17 | Omitir el fundido opcional de fotos. | Falta ese pulido visual, pero la imagen útil aparece inmediatamente y no aumenta consultas. |
| 18 | Calificar los cuatro P2 de la revisión como importantes y corregirlos una vez. | El ejecutor verifica la corrección; no se afirma una segunda aprobación independiente. |
| 19 | Incluir la navegación tardía preexistente en la cancelación de acceso. | El requisito de conservar/cancelar intención la incluye; el servidor puede completar una sesión ya solicitada, pero no cambia el destino abandonado ni ejecuta una acción comercial. |
| 20 | Crear una miniatura nueva para portadas almacenadas en el prefijo del propietario actual. | Evita reusar medios huérfanos o escribir bajo el dueño anterior. Si la preparación falla, el usuario debe reintentar antes de cambiar la portada. Storage desplegado sigue pendiente. |
| 21 | Esperar el viewport real y notificarlo al cargar/redimensionar. | Evita omitir puntos visibles y elimina la consulta inicial basada en un rectángulo de contexto. Si el mapa no carga, no se inicia esa consulta y debe reintentarse. |
| 22 | Conservar el registro solicitado y eliminar solo copias temporales propias. | Prima la ruta de continuidad indicada por el usuario sobre la limpieza general de la guía; quedan pequeños logs y evidencia para revisión. |
| 23 | Mantener la rama local sin menú de integración adicional. | El usuario autorizó la entrega aislada y preservación del checkout principal; no implica autorización de push, merge al principal o despliegue. |
| 24 | Desactivar la continuación al terminar lo implementable. | El resto necesita canal, dispositivo o autorización concreta; no se repetirá un aviso de inicio ni se simulará avance automático. |

## Lo que el revisor dejó fuera del veredicto

| Parte | Decisión del ejecutor y límite |
| --- | --- |
| Correo real, Auth/Storage/RLS desplegados, URLs tras publicación, APK y activación de traspasos | Mantener pendientes operativos; no autorizados en esta ejecución. Las pruebas locales no los sustituyen. |
| Teclado/Atrás/TalkBack, texto ampliado, movimiento reducido real, picker y rendimiento nativo | Mantener pendientes de dispositivo; las funciones puras y el navegador no acreditan su comportamiento Android. |
| Nueva ejecución SQL de concurrencia/actualización | No se modificó SQL funcional en esta fase. Se revisó el contrato integrado, pero no se reutiliza su informe como una ejecución nueva. |
| CTA asistida y de portada | Diferidas hasta canal operativo y activación autorizada; costo: menor captación hasta entonces. |
| Anuncios reales y calidad de sus fotos | Propuestas en lista editorial para el responsable; no se aplicaron ni se inventaron atributos. |
| Extracción de editor y fundido de fotos | Evaluadas y diferidas en las decisiones 16–17. |
| Provincia sin puntos cargados | Mantener Cuba como fallback; costo: primer encuadre amplio. |
| Animaciones previas de navegación/mapa y pie extremo | Fuera del cambio de movimiento nuevo; no se afirma que cumplan reducción de movimiento o texto extremo. |
| Acceso tardío tras Atrás | Se incluyó y corrigió por la tarea 5; ver decisión 19. |

## Menores diferidos

- Línea vacía adicional al final de `scripts/local-sql/bootstrap.sql:29`, heredada de la integración asistida. Sin efecto funcional; permanece como aviso de formato al comprobar el rango completo.
