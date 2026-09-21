# Mensajería KarmaHouse 0.1.3 — 18 de septiembre de 2026

## Entrega

Contactar desde una vivienda abre el chat privado entre comprador y vendedor. La bandeja se encuentra en Explorar y Mi espacio; los accesos y la pestaña Mi espacio muestran no leídos sin añadir una quinta pestaña. El chat conserva el contexto del anuncio, historial paginado, borradores, cola de envío por cuenta, reintento manual, bloqueo y reportes. Los administradores revisan únicamente la evidencia de los reportes mediante su rol de base de datos.

Se mantuvieron el catálogo, publicación, mapas y diseño de la barra inferior. Visitas, ofertas, adjuntos y notificaciones push quedan fuera de este bloque. La bandeja sincroniza cada 15 segundos en primer plano y la conversación abierta cada 5 segundos.

## Comprobaciones locales

- Suite completa: **102 pruebas pasan, cero fallos** con `node --experimental-strip-types --test tests/*.test.ts`.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit`, código 0.
- Exportación de Expo para Android, iOS y web: código 0; salida `artifacts/messaging-export` (1495, 1371 y 993 módulos, respectivamente).
- Inspección de 442 archivos fuente/exportados: no se encontraron los valores privados locales de credenciales ni el correo administrativo. `git diff --check` sin errores.
- Incluye 22 pruebas del subsistema de mensajes, cinco de borradores del composer, tres de moderación de reportes y regresión del retorno de autenticación a rutas de mensajes.
- La revisión independiente encontró un caso de ACK aislado que dejaba un hueco inaccesible en el historial. Fue corregido y reproducido de nuevo: todas las secuencias 1–101 se recuperan mediante paginación. Sin hallazgos accionables pendientes al finalizar la revisión.

Evidencia detallada: [cliente](messaging-client-verification.md), [pantallas y borradores](messaging-ui-verification.md), [revisión independiente](messaging-independent-review.md).

## Backend real

Migración aditiva `20260918000100_messaging` aplicada y checksum comprobado. **57 aserciones SQL y 47 comprobaciones REST pasan**, incluyendo terceros/anónimos, admin no participante, JWT/actor, deduplicación concurrente, cuotas, bloqueo global, lecturas y conservación de evidencia. Catálogo, perfiles, roles, fotos y recibos existentes conservaron sus hashes. [Informe del backend](messaging-data-verification.md).

## Navegador

Pruebas realizadas en `localhost:8083`, conectado al Supabase del proyecto, mediante cuentas sintéticas confirmadas sin enviar correo:

1. Abrir la vivienda temporal como visitante, tocar Contactar, entrar con el comprador y verificar el regreso al mismo anuncio.
2. Contactar abre la conversación correcta con nombre público, título y zona de la vivienda.
3. Enviar texto: estado Enviando pasa a Enviado. La respuesta de la cuenta vendedora se guarda mediante la API real.
4. La bandeja recibe la respuesta y muestra **1 mensaje sin leer**. Abrir el chat muestra ambos mensajes; una lectura posterior por RPC confirmó `unread=0`, `lastSeq=2`.
5. Escribir un borrador, salir con navegación completa y volver: el texto del composer se recupera.
6. Bloquear desde el chat desactiva el envío y conserva historial/borrador. Desbloquear lo vuelve a habilitar.
7. Enviar un reporte sintético: la app confirma «Reporte recibido». Cambiar a la cuenta revisora muestra el reporte pendiente con los dos mensajes capturados por el servidor.
8. Revisar con una nota: desaparece de Pendientes y aparece como Revisado. La bandeja personal del administrador permanece vacía, sin heredar la conversación del comprador.
9. Revisión visual de chat y composer en 390×844 y 320×740, y de moderación en 1200×900. Sin errores de consola registrados durante el recorrido.
10. Cierre de la sesión de prueba y restauración del tamaño de navegador. El script de limpieza eliminó las tres cuentas temporales, su anuncio/foto, conversación, mensajes, bloqueos y reporte.

Después de esa limpieza, una consulta remota de solo lectura confirmó dos perfiles, una vivienda, dos administradores y tres fotos; cero conversaciones, mensajes, reportes o cuentas de la prueba de interfaz.

El reintento tras fallo de red, respuestas perdidas y carreras de cambio de cuenta están cubiertos por pruebas controladas del cliente y del backend; no se provocó una desconexión física del teléfono durante esta revisión web.

Después de compilar el APK, se reinició la vista previa limpiando la caché de Metro. La recarga mostró de nuevo Explorar, la vivienda existente y el acceso a mensajes, sin errores de consola. La vista previa quedó abierta en `localhost:8083`.

## Android e iOS

El APK 0.1.3 (código Android 4) se compiló en 6 min 14 s, con la firma de pruebas existente. Verificador, alineación de 16 KB y copia a Descargas comprobados. Tamaño: 81,69 MB. SHA-256: `2dea49fafe825cdbf467e9538de854698ec2f78a23885739e2ae826c2a51ad60`. La evidencia detallada se registra en [verificación del APK](messaging-apk-verification.md).

La verificación web y las exportaciones de Expo no prueban teclado, almacenamiento ni red en un teléfono físico. No se generó un IPA ni se publicó en tiendas. La prueba física Android continúa pendiente al entregar el archivo.
