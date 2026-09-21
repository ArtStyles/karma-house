# Entrega conectada — 17 de septiembre de 2026

## Resultado

KarmaHouse conserva la interfaz de React Native/Expo y utiliza Supabase para cuentas, anuncios, fotos y favoritos. La revisión administrativa controla la publicación. El modo conectado empieza vacío; no importa datos ni fotografías de la demostración.

La invitación administrativa indicada por el usuario está guardada en el esquema privado. Se concede el rol al registrar y confirmar ese correo, sin crear una contraseña por el usuario y sin confiar en metadatos del cliente.

## Evidencia local

- `npm run check`: TypeScript correcto y **55 pruebas aprobadas**.
- Expo Doctor: **21/21 comprobaciones aprobadas**.
- Exportación final de web, Android e iOS correcta en `artifacts/cloud-export/`.
- `git diff --check`: sin errores.
- `node scripts/check-client-secrets.mjs`: sin contraseña de base de datos, clave privada ni correo administrativo en los archivos de entrega y bundles revisados.

Se cubren aislamiento entre cuentas, resultados tardíos, permisos de edición, favoritos concurrentes, idempotencia, fotos, fallos de almacenamiento, recuperación de borradores, conflicto de versión, callbacks de correo y plazo de red de 20 segundos sin repetir escrituras automáticamente.

## Evidencia remota

Migración `20260917000100` aplicada con transacción, registro de versión y SHA-256. Esquema inicial inventariado vacío. Pruebas SQL y **34 comprobaciones REST** con Auth/Storage reales aprobadas; [detalle del esquema y pruebas](cloud-schema.md).

Los enlaces de autenticación se configuraron en el panel:

- Site URL de desarrollo: `http://localhost:8083/auth/callback`.
- Redirect URLs: `http://localhost:8083/auth/callback**` y `karmahouse://auth/callback**`.

La confirmación por correo permanece activa. No se ha probado entrega a un buzón real ni configurado un dominio público en esta entrega.

## Recorrido en navegador

Se verificó con dos cuentas temporales independientes, sin envío de correos:

1. Acceso como vendedor y publicación con dos imágenes locales comprimidas.
2. Recuperación del borrador después de recargar la app.
3. Guardado real del anuncio como pendiente y consulta desde Mis anuncios.
4. Cierre de sesión: datos privados y contadores del vendedor desaparecen.
5. Acceso como administrador, consulta de todas las fotos y aprobación desde la app.
6. Aparición en el catálogo, favorito y persistencia tras recargar.
7. Cambio entre ambas fotos en la galería.

Revisión visual a 390 × 844 y 1280 × 900. Se corrigió el desplazamiento entre pasos y una galería administrativa que repetía la portada. Hubo fallos intermitentes de red durante la prueba; los reintentos conservaron el borrador y finalizaron sin duplicar el anuncio. Se añadieron mensajes en español y un plazo de espera acotado.

Al finalizar se eliminaron las dos cuentas temporales, el anuncio, el favorito y las fotos. Consulta final: **0 usuarios, 0 anuncios, 0 fotos y 1 invitación administrativa pendiente**. Las pruebas REST también verificaron la eliminación de sus propias cuentas y archivos.

## Límites y siguiente paso

- Registrar y confirmar la cuenta administradora con una contraseña elegida por el usuario.
- Configurar y comprobar entrega de confirmación y recuperación con un proveedor de correo adecuado antes de admitir público general.
- Probar Android e iPhone físicos: enlaces de correo, galería, SecureStore y cambio de cuenta. Los bundles exportados no equivalen a APK/IPA instalados.
- Mensajería/contacto, mapas y publicación en tiendas siguen pendientes; la interfaz lo indica.
- No se desplegó una web pública. Para desplegarla hay que añadir el dominio y sus callbacks autorizados.

Los borradores sin enviar son locales. Las fotos guardadas en Storage se leen con URLs firmadas de una hora; retirar un anuncio bloquea nuevos accesos, pero no revoca inmediatamente enlaces ya emitidos.
