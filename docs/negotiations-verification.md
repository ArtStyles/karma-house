# Visitas y ofertas: entrega y verificación

Fecha: 20 de septiembre de 2026. Integración en React Native/Expo57 y Supabase, conservando la identidad visual y los cambios de cuenta, avatar y catálogo anteriores.

## Recorrido disponible

Chat → Visitas y ofertas permite proponer visitas con selectores de fecha/hora de Cuba y ofertas en USD. El destinatario puede aceptar, rechazar o enviar una alternativa. El autor retira propuestas pendientes y cualquiera de los participantes puede cancelar acuerdos aceptados. Solicitudes, accesible desde Mensajes y Mi espacio, separa pendientes e historial y consulta páginas de 30 registros en el servidor.

El estado confirmado, sus recibos de reintento y el resumen del chat se guardan juntos. Aceptar una oferta no cambia la disponibilidad del anuncio. Cancelar sigue permitido cuando un bloqueo o un anuncio no disponible impiden nuevas conversaciones; en ese caso no genera otro mensaje al contacto bloqueado.

## Navegador con cuentas sintéticas

Se usó la app real en localhost:8083 contra Supabase, sin sustituir respuestas de red. Fixture identificado: `kh-negotiations-ui-6e7a62fd-e772-4137-9354-ce7d4e3604fb`.

- Cuenta compradora: acceso desde Solicitudes, estado vacío, chat de la vivienda y panel. Propuso el 22/09/2026 a las 10:00 de Cuba y una oferta de 60.000,25 USD introducida con coma decimal.
- Cerrar/reabrir el panel conservó fecha y nota. Cerrar/reabrir después del envío conservó la confirmación, sin crear otra propuesta.
- Cuenta vendedora: vio ambas pendientes y propuso 63.000 USD y las 11:00 del mismo día. Las originales quedaron con alternativa.
- Cuenta compradora: aceptó ambas desde Solicitudes. Pendientes quedó vacío y Todas conservó los acuerdos y sus originales. Luego canceló la visita aceptada y creó/retiró una nueva visita pendiente.
- El estado remoto corroboró una oferta aceptada, dos visitas canceladas y dos originales sustituidas: 5 registros, 9 resúmenes de chat, 9 recibos y 11 eventos. La vivienda siguió aprobada y activa en su versión 2.
- Una tercera cuenta vio Pendientes y Todas vacías; el enlace directo al chat mostró que no estaba disponible para esa cuenta.
- Se inspeccionaron visualmente formularios y tarjetas a 390×844, formulario de oferta a 320×740 y bandeja a 1280×900. En pantallas pequeñas el panel permite desplazarse para alcanzar los controles.

Evidencia de estado: `negotiations-browser-state.log` y `negotiations-browser-final-state.log`. Los registros solo contienen identificadores y datos sintéticos, sin contraseñas ni tokens. La sesión de prueba se cerró antes de limpiar. La limpieza terminó con cero registros temporales y el inventario previo intacto, incluidos cuentas, anuncios, conversaciones, metadatos privados y Storage: `negotiations-browser-cleanup.log`.

## Revisiones y pruebas

- Suite completa local: **150 pruebas, 150 pasan**, incluidas 27 del nuevo módulo; TypeScript sin errores.
- Expo exportó Android (1521 módulos), iOS (1397) y web (1020), con salida correcta en `artifacts/negotiations-export`. El análisis de 589 archivos de código/exportación no encontró valores privados configurados ni el correo administrativo. No se añadieron dependencias.
- Revisión independiente cerró los hallazgos de caducidad al esperar un bloqueo de fila, actualización periódica que interrumpía páginas lentas, pérdida de borrador al desmontar el modal y alternativa obsoleta tras una respuesta ajena.
- [Servidor y concurrencia](negotiations-data-verification.md): migración aplicada, permisos y aislamiento, reintentos idénticos, carreras aceptar/retirar y alternativa/retirar, y expiración durante espera de bloqueo. Datos reales conservados.
- [Estado y componentes](negotiations-ui-verification.md): solicitudes tardías, cambio de cuenta, reintentos, paginación, confirmación independiente del refresco posterior y conservación temporal del formulario.

## Límites

La prueba de fallos de transporte y recuperación del mismo UUID es automatizada en controlador/repositorio y SQL; no se simuló pérdida de red desde el navegador. Los borradores de propuestas sobreviven al cierre del panel durante la pantalla, pero no se guardan en disco. No hay push, recordatorios externos, calendario externo ni pagos en este bloque.

La prueba de navegador no demuestra comportamiento en teléfono físico. El APK 0.1.3 anterior no incluye estos controles; necesita una nueva compilación para instalarlos. La exportación de código por plataforma tampoco es un APK/IPA.

Próximas fases: [hoja de ruta de crecimiento](growth-roadmap.md).
