# Próximas etapas de KarmaHouse

Revisión local del 20 de septiembre de 2026. El usuario eligió visitas y ofertas dentro del chat como siguiente entrega. Este documento diferencia ese trabajo de las integraciones posteriores; no afirma que los proveedores estén configurados ni mide capacidad concurrente.

La etapa 1 ya está implementada y aplicada en Supabase, con recorrido comprobado en navegador entre comprador y vendedor. Evidencia y límites: [visitas y ofertas](negotiations-verification.md). La instalación de esos controles en un teléfono sigue pendiente de un nuevo APK/build y prueba física.

También se entregó el centro de avisos dentro de la app, con preferencias, contador y lecturas, probado en Supabase y navegador. [Entrega de notificaciones](notifications-verification.md). La integración Android de avisos ya tiene cliente, cola y APK 0.1.4; queda validar la recepción física con la app cerrada. [Evidencia y prueba en el teléfono](android-push-verification.md). iOS y los recordatorios programados continúan pendientes.

| Orden | Resultado para las personas | Integración o trabajo | Evidencia de entrega requerida |
| --- | --- | --- | --- |
| 1 | Coordinar visitas y negociar importes junto a cada vivienda | Registros privados de visitas/ofertas, alternativas, historial y solicitudes dentro de Supabase existente | Comprador y vendedor completan el recorrido; reintentos, permisos, fechas y conflictos comprobados |
| 2 | Recibir avisos de respuestas y próximas visitas fuera de la app | Expo Push, credenciales Android FCM y Apple APNs; cola de eventos en servidor, preferencias y retirada de tokens al salir | Recepción real en dispositivo, apertura de la conversación correcta, reintento sin duplicar y aislamiento de cuentas |
| 2a | Consultar novedades dentro de KarmaHouse | Campana, bandeja paginada, lecturas y preferencias de mensajes/visitas/ofertas en Supabase | Eventos reales, aislamiento por cuenta, bloqueos, reintentos y lectura por corte; ver [notificaciones](notifications-verification.md) |
| 2 | Poder crear y recuperar cuentas con correo fiable | SMTP propio y dominio remitente verificado en Supabase Auth | Entrega real a correos externos, confirmación y recuperación por enlace en app instalada |
| 3 | Cargar rápido al crecer el catálogo | Búsqueda/filtros y cursor en servidor; lista virtualizada; cargar fotos según necesidad | Medición con catálogos crecientes y redes lentas, equivalencia de filtros y conservación de favoritos |
| 3 | Ver conversaciones actualizadas con menos consultas repetidas | Eventos privados de Supabase Realtime y recuperación incremental después de reconectar | Reconexión sin huecos en historial, permisos por participante y medición de consultas/transferencia |
| 3 | Detectar problemas y medir el recorrido de compra | Sentry para errores técnicos; eventos agregados de búsqueda, contacto, visita y oferta | Fallos diagnosticables por versión; sin texto de chats, fotos, credenciales ni datos personales en telemetría |
| 4 | Compartir una vivienda y regresar cuando aparezca una adecuada | Ficha pública entregada ([verificación](public-listing-verification.md)); pendientes dominio propio, Android App Links/iOS Universal Links, búsquedas guardadas y alertas | Enlace funciona con/sin app, solo expone anuncios públicos, alertas deduplicadas y cancelables |

## Dependencias actuales observadas en el código

El catálogo ya no se recorre entero. Explorar pide páginas de 24 anuncios por cursor a `kh_search_properties`, que resuelve filtros, orden, búsqueda y el total exacto en Supabase, y firma solo la fotografía de portada de cada tarjeta (`src/catalog/`, `supabase/migrations/20260921000100_catalog_pagination.sql`). La carga de sesión conserva únicamente los anuncios de la cuenta y sus favoritos. Medido sobre PostgreSQL 15 con 5.000 anuncios: una página con su total exacto tarda 7,5 ms y los cuatro órdenes usan su índice parcial. Falta la medición sobre el proyecto real y con redes lentas. [Diseño](superpowers/specs/2026-09-21-catalog-pagination-design.md).

El mapa consulta `kh_map_clusters` con el recuadro que está viendo: `KarmaMap` lo informa al terminar cada desplazamiento o zoom, en la implementación nativa (`onRegionDidChange`) y en la web (`moveend`). Por encima de 200 viviendas en el recuadro devuelve globos con recuento, y pulsar uno acerca dos niveles de zoom sobre su centro, lo que hace que el servidor los separe. Comprobado en el navegador de extremo a extremo; la implementación nativa comparte la conversión de recuadro pero necesita una compilación en teléfono para verificarse.

La bandeja consulta cada 15 segundos y la conversación cada cinco mientras están activas. Eso sigue justificando sincronización incremental antes de una campaña amplia; no permite afirmar un número máximo de usuarios sin medirlo.

El README conserva pendiente la preparación del SMTP y dominio. En esta revisión no se consultó la configuración remota de correo, por lo que se requiere comprobarla antes de cambiarla. El proyecto Expo y la credencial Android FCM V1 están vinculados y validados; [evidencia y vencimiento](firebase-android-setup.md). Registro por sesión, cola de entrega y revocación Android se implementaron en 0.1.4; siguen pendientes la recepción física y APNs para iOS. Tampoco se ha añadido seguimiento centralizado de errores.

## Fuentes oficiales consultadas

- [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/): versión del proyecto, sin cambio de tecnología propuesto.
- [Configuración de Expo Push](https://docs.expo.dev/push-notifications/push-notifications-setup/): permisos del dispositivo y credenciales de ambas plataformas; permite compilación local. La prueba web no acredita entrega nativa.
- [SMTP en Supabase](https://supabase.com/docs/guides/auth/auth-smtp): proveedor SMTP propio y configuración de correo. Elegir proveedor requiere revisar disponibilidad y condiciones para la operación concreta de KarmaHouse.
- [Cambios de base de datos por Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes): diseñar eventos y autorización antes de sustituir consultas periódicas.
- [Sentry con Expo](https://docs.expo.dev/guides/using-sentry/): diagnóstico de errores y asociación con versiones.
- [Enlaces de aplicación](https://docs.expo.dev/linking/overview/): vínculos entre web y aplicaciones instaladas.

Las integraciones externas quedan pendientes de su etapa y de las cuentas/dominios necesarios; este documento no contrata servicios ni realiza envíos.
