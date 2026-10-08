# Administración e inmobiliaria principal: entrega 0.1.21

Fecha: 8 de octubre de 2026. El usuario aprobó el rediseño, pidió integrar con `main` y actualizar el teléfono conectado, y autorizó expresamente aplicar `20261008000100` y `20261008000200` en Supabase para completar la actualización.

## Entrega

- `codex/admin-redesign` se integró por avance directo en `main`: `76072af`, con las tarjetas, filtros, paginación y recarga al deslizar aprobados.
- `7baf15b` actualizó la versión Android a **0.1.21 / versionCode 22**. La APK y el AAB de distribución se compilaron desde ese estado, con la configuración pública del entorno real.
- `69aa5ed` añadió el contrato de verificación de las dos migraciones nuevas, conservando el manifest, los registros SQL y los hashes históricos. Estos commits se subieron a `origin/main`.
- La web compatible se desplegó en Vercel antes de aplicar las migraciones. GitHub confirmó `check: success` y Vercel confirmó el despliegue de `69aa5ed`.

## APK y teléfono

APK local: `artifacts/releases/KarmaHouse-0.1.21.apk`.

| Dato | Comprobación |
|---|---|
| Paquete | `com.karmahouse.karmahouse` |
| Versión instalada | 0.1.21 / 22, comprobada después de instalar |
| Dispositivo | Pixel 7 Pro conectado por ADB |
| Instalación | `adb install -r`, resultado `Success`; fecha de primera instalación conservada |
| Tamaño | 85.013.411 bytes |
| SHA-256 APK | `bee24b2caab8cd592a6c22a1c97d2005fe7200f1f40e91a1f375073cac5ad117` |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6`, igual al de la APK previamente instalada |
| Distribución | Firma v2, no depurable, minSdk 24, arm64-v8a/armeabi-v7a; alineación ZIP de 16 KB comprobada |

La app abrió con la sesión del propietario conservada. En el teléfono real se comprobó el panel de administración con sus nuevas tarjetas y contadores, y el espacio de KarmaHouse como inmobiliaria principal con sello dorado. La navegación de comprobación usó intents de rutas existentes; no se realizaron operaciones de moderación ni cambios en anuncios.

El gesto táctil de recarga no se ejecutó físicamente en esta comprobación. Sus controles de estado tienen pruebas automatizadas y están incluidos en la APK instalada. La comprobación de alineación indicada arriba corresponde al ZIP, sin afirmar validación independiente de cada ELF.

## Supabase

Se obtuvo un respaldo en formato custom de `public`, `kh_private` y `supabase_migrations` antes de intervenir. Su índice y descompresión completa se comprobaron con `pg_restore`; no se ejecutó una restauración de ensayo. Respaldo privado local: `artifacts/admin-redesign-release/backend-before.dump`, 1.214.117 bytes, SHA-256 `f6674fef26a13fb181ac6e76da97f1e20ec829d63800969174aca37ae760372d`.

Ambas migraciones se aplicaron en orden en una sola transacción, con TLS verificado, bloqueo de migraciones y verificación completa del contrato alojado antes de COMMIT. La operación confirmó a las **20:45:20 UTC**:

- **12 migraciones, 249 funciones y 43 tablas**, con definiciones, permisos y políticas contrastados contra el manifest revisado.
- Las filas de las **111 tablas existentes** de negocio, Auth y Storage permanecieron iguales dentro de la instantánea de la transacción.
- Historial anterior de migraciones y bandera del módulo conservados. El módulo ya estaba habilitado antes de esta actualización.
- Los dos nuevos registros incluyen el SQL literal y su SHA-256; se solicitó recarga del esquema a PostgREST.

Después del COMMIT y de abrir la app con la cuenta real del propietario, una consulta de solo lectura confirmó una única inmobiliaria principal aprobada y verificada, con el propietario actual como miembro `admin` activo. Su perfil comercial aún no está completo: la proyección pública contiene únicamente identidad y sello, sin inventar contactos, dirección ni responsable.

Pruebas externas posteriores: las dos RPC protegidas rechazan peticiones anónimas con HTTP 401 / SQLSTATE 42501; el perfil público devuelve HTTP 200 con `isPrincipal`, `verified` e `identityOnly` verdaderos. La [página pública de la inmobiliaria principal](https://karmahouse.vercel.app/agency/5f62fcd9-ae5b-48f9-a289-4fd21a8fe8a0) respondió HTTP 200 y renderizó el nombre y la etiqueta «Inmobiliaria principal».

## Verificación y evidencias

- `npm run check`: **662 pruebas, 660 correctas, 0 fallos y 2 omitidas**; TypeScript correcto. Las dos omisiones pertenecen al fixture histórico anterior; las pruebas nuevas de ambos perfiles SQL sí se ejecutaron.
- Contrato SQL nativo: estado histórico y extendido comprobados; quince alteraciones de SQL, registros, esquema o permisos rechazadas por cada perfil local y alojado.
- Compilación web correcta; compilación firmada Android correcta. Las [comprobaciones visuales y SQL de la fase inicial](administration-redesign-verification.md) conservan sus límites de datos sintéticos y exportación multiplataforma.
- Evidencias privadas locales en `artifacts/admin-redesign-release`: `backend-applied.json`, `backend-state-verified.json`, `public-rpc-verified.json`, `public-web-verified.json`, `device-install-verified.json`, `apk-verification.log`, `build.log` y capturas del teléfono `phone-administration.png` y `phone-principal-workspace.png`.

Los cambios ajenos que existían en el checkout se conservaron y no se incluyeron en los commits. El clúster PostgreSQL temporal de pruebas se detuvo al finalizar. Los respaldos, capturas y artefactos firmados permanecen fuera de Git. Esta entrega actualiza el teléfono conectado y no publica una nueva descarga pública de APK.
