# Esquema remoto de KarmaHouse

La migración `supabase/migrations/20260917000100_cloud_marketplace.sql` crea tablas, RPC y políticas para el catálogo. Es aditiva y debe aplicarse una sola vez mediante el registro de migraciones, después de inventariar el proyecto. No borra ni importa anuncios de demostración.

## Tablas y lecturas

| Tabla | Lectura de cliente | Escritura de cliente |
| --- | --- | --- |
| `profiles` | Perfil propio, vendedores con anuncio público, o administradores | Insertar perfil propio y modificar solo `display_name` |
| `properties` | `approved` + `active`, anuncios propios o administradores | Solo RPC |
| `favorites` | Solo el usuario de `user_id` | Insertar favorito propio de un anuncio `approved` + `active`; borrar favorito propio |
| `kh_admins` | Sin acceso directo | Sin acceso directo |

`profiles` contiene `id`, `display_name`, `created_at` y `updated_at`; nunca almacena el correo de Auth. El trigger crea el perfil al registrar la cuenta. Si falta un nombre válido, utiliza «Usuario de KarmaHouse», sin derivarlo del correo. La actualización del perfil no cambia roles.

`properties` usa nombres de columna en snake_case y los campos definidos en la especificación. El catálogo público nunca incluye anuncios pendientes, rechazados, borradores, pausados ni vendidos. El propietario y el administrador pueden consultarlos. Los motivos de rechazo solo existen cuando el anuncio está rechazado; aprobar o editar elimina `review_note`. No se publica la identidad del revisor.

La disponibilidad (`active`, `paused`, `sold`) y la moderación (`draft`, `pending`, `approved`, `rejected`) son independientes. Cambiar disponibilidad no aprueba un anuncio. Toda edición de contenido de un anuncio previamente enviado vuelve a `pending`, incluso si el cliente solicita `draft`. Un borrador inicial sí puede mantenerse como borrador.

Las cotas son: título 3–100 caracteres; ubicación y provincia 2–80; descripción 20–2000; precio >0 y ≤100.000.000; área >0 y ≤10.000; dormitorios y baños enteros 1–20; tipo `Casa` o `Apartamento`; hasta 20 comodidades de 60 caracteres. Las comodidades se recortan, deduplican y ordenan para comparar reintentos.

## RPC y concurrencia

`kh_save_property(p_payload jsonb) → jsonb` devuelve **un objeto**, con la fila en snake_case, incluidos `id`, `version`, `moderation`, `photo_paths` y `client_request_id`.

```json
{
  "ownerId": "UUID de la sesión que abrió el formulario",
  "clientRequestId": "UUID o identificador estable",
  "title": "Casa con patio",
  "location": "Vedado",
  "province": "La Habana",
  "type": "Casa",
  "price": "50000",
  "area": "80",
  "bedrooms": "2",
  "bathrooms": "1",
  "description": "Descripción completa de la vivienda.",
  "amenities": ["Patio"],
  "photoPaths": ["UUID/solicitud/archivo.jpg"],
  "moderation": "pending"
}
```

`ownerId` es opcional para compatibilidad; el repositorio debe enviarlo siempre. Si difiere de `auth.uid()`, se rechaza con `KH_ACCOUNT_CHANGED`, evitando crear un anuncio en otra cuenta si cambia la sesión durante el envío. El propietario efectivo siempre procede de `auth.uid()`.

Para editar, incluir `id` y `expectedVersion` de la versión mostrada al abrir el formulario. Conservar el `clientRequestId` original: solo se admiten letras ASCII, números, guion y guion bajo, entre 1 y 100 caracteres. Los valores numéricos aceptan texto o números JSON. Omitir `moderation` equivale a `pending`. Solo se permiten `draft` y `pending` desde el cliente.

La combinación `(owner_id, client_request_id)` es única. Un reintento de creación sin `id`, con la misma carga inicial normalizada, devuelve la fila actual sin modificarla, incluso si ya fue aprobada o editada. Una carga diferente con esa solicitud se rechaza con `KH_REQUEST_CONFLICT`. No se permite usar un reintento de creación para sobrescribir un anuncio.

Un reintento de edición idéntico, con el mismo `expectedVersion`, devuelve la versión ya guardada solo si esa edición sigue siendo la última mutación. Una revisión, cambio de disponibilidad u otra edición intermedia provoca `KH_VERSION_CONFLICT`. Los recibos se almacenan en `kh_private.property_save_requests`, inaccesible al cliente. Los bloqueos y la restricción única también cubren solicitudes simultáneas.

| RPC | Resultado y requisitos |
| --- | --- |
| `kh_set_property_status(p_id uuid, p_status text)` | `void`; propietario; `active`, `paused` o `sold`; incrementar versión solo al cambiar |
| `kh_submit_property(p_id uuid)` | `void`; propietario; borrador/rechazado vuelve a pendiente; pendiente/aprobado no cambia |
| `kh_review_property(p_id uuid, p_decision text, p_note text, p_expected_version integer)` | `void`; administrador; pendiente; versión exacta; `approved` o `rejected`; rechazo requiere motivo de 1–1000 caracteres |
| `kh_is_admin()` | `boolean`; identidad comprobada en tabla privada para clientes |

Un administrador no puede revisar su propio anuncio. Los RPC de mutación rechazan sesiones anónimas, usan `SECURITY DEFINER` con `search_path=''`, y verifican `auth.uid()` antes de escribir. No se concede escritura directa de anuncios, asignaciones administrativas ni recibos.

Errores funcionales principales: `KH_AUTH_REQUIRED`, `KH_ACCOUNT_CHANGED`, `KH_ADMIN_REQUIRED`, `KH_PROPERTY_NOT_FOUND`, `KH_INVALID_PROPERTY`, `KH_INVALID_REQUEST_ID`, `KH_INVALID_PHOTOS`, `KH_INVALID_PHOTO_PATH`, `KH_PHOTO_NOT_FOUND`, `KH_EXPECTED_VERSION_REQUIRED`, `KH_REQUEST_CONFLICT`, `KH_VERSION_CONFLICT`, `KH_NOT_PENDING`, `KH_REVIEW_NOTE_REQUIRED` y `KH_CANNOT_REVIEW_OWN_PROPERTY`.

## Fotos

El bucket `property-photos` es privado, acepta JPEG/PNG/WebP y limita cada archivo a 4 MiB. Usar `upsert: false` y rutas `userId/clientRequestId/random.jpg` (también `.jpeg`, `.png` o `.webp`). El nombre de archivo admite 1–100 letras ASCII, números, guiones y guiones bajos. No utilizar `getPublicUrl`; obtener URLs firmadas de corta duración con la sesión adecuada.

Guardar o enviar un anuncio requiere que todas sus rutas pertenezcan al propietario y a la solicitud, sean distintas y existan en `storage.objects`. Se admiten hasta seis fotos y se exige al menos una salvo en borradores. El dueño puede leer archivos de su prefijo aún no vinculados, para comprobar cargas y reintentos. Un administrador puede leer todas las fotos. Otros usuarios y visitantes solo pueden leer fotos referenciadas por anuncios actualmente públicos.

No existe política de `UPDATE`: una foto cargada no se sobrescribe. El propietario solo puede eliminar fotos que no estén vinculadas a ningún anuncio, incluido un borrador o anuncio pendiente. Guardado y eliminación usan los mismos bloqueos por ruta para evitar referencias a fotos borradas en una carrera. Retirar una foto del anuncio permite eliminarla después; editar el anuncio lo devuelve a revisión.

Las URLs ya firmadas conservan acceso hasta su expiración. El cliente debe usar una duración corta y renovar al cargar; la retirada de un anuncio impide emitir nuevos accesos, pero no revoca inmediatamente una URL firmada existente. La comprobación SQL valida la existencia del objeto, no sustituye una prueba real de carga y descarga de bytes por Storage.

## Alta administrativa operativa

La lista de invitaciones está en `kh_private.admin_invites(email text primary key, created_at timestamptz)`, sin permisos de cliente y fuera de los esquemas expuestos. Insertar el correo indicado por el usuario solo desde una conexión confiable y con parámetros, normalizado mediante `lower(btrim(...))`. No incluir correos reales ni secretos en archivos versionados.

Un trigger en `auth.users` consume la invitación y agrega `kh_admins` al insertar una cuenta ya confirmada o actualizar `email`/`email_confirmed_at`, siempre que `email_confirmed_at IS NOT NULL` y el correo coincida. `user_metadata` nunca asigna roles. Para una cuenta existente ya confirmada, la operación administrativa confiable debe consumir la invitación y agregar el identificador usando la coincidencia verificada de `auth.users`; crear la invitación por sí solo no modifica una cuenta existente.

## Verificación

`supabase/tests/cloud_marketplace.sql` está pensado para una conexión de propietario de base de datos, después de aplicar la migración. Ejecuta afirmaciones sobre identidades sintéticas `example.invalid` y revierte toda la transacción. Cubre privacidad, fotos, revisión, favoritos, invitación verificada, idempotencia y versiones. No envía correos ni crea archivos físicos en Storage.

Ejecutar con parada ante errores (`psql -v ON_ERROR_STOP=1 -f supabase/tests/cloud_marketplace.sql`, o un cliente PostgreSQL equivalente que conserve la misma conexión/transacción). Si hay un error, hacer `ROLLBACK`. Además se necesita el recorrido remoto por Auth/PostgREST/Storage con usuarios independientes y bytes de imagen reales. Un archivo de migración y unas pruebas escritas no son evidencia de aplicación remota ni de pruebas aprobadas.

`scripts/apply-cloud.mjs` muestra el inventario sin escribir por defecto. Con `--apply`, usa TLS con la CA configurada, ejecuta migración y afirmaciones dentro de una transacción y revierte las fixtures con un savepoint antes de confirmar. Registra la versión en `supabase_migrations.schema_migrations` y el SHA-256 en `supabase_migrations.karmahouse_migration_checksums`. Una ejecución posterior exige el mismo hash, vuelve a ejecutar las afirmaciones y conserva la migración aplicada. No sobrescribe un hash discrepante. Lee las credenciales y el correo administrativo exclusivamente de la configuración privada ignorada por Git.

`scripts/verify-cloud.mjs` crea tres cuentas sintéticas confirmadas mediante la API administrativa, sin enviar correo, y prueba REST/Auth/Storage/RPC con sesiones independientes. Descarga los PNG cargados y compara sus bytes, prueba lecturas públicas y privadas, intento de escritura ajena, aprobación, favoritos, reintentos simultáneos y versiones. Finalmente elimina los anuncios de sus UUID temporales, borra imágenes mediante Storage y elimina sus usuarios de Auth. Comprueba que no quedan fixtures. No requiere ni concede roles a una cuenta real.

### Evidencia del 17 de septiembre de 2026

- Inventario previo remoto: cero tablas públicas, buckets y políticas de `storage.objects`.
- Migración `20260917000100` aplicada y registrada, SHA-256 `5cb5e6821bb814ece5dbdf1aa4ac489c5d8714323712fb862c854edb6d599c18`.
- Afirmaciones SQL aprobadas en la aplicación inicial y al verificar una ejecución posterior con el mismo hash.
- Prueba REST final: **34 comprobaciones aprobadas**, incluida creación simultánea sin duplicados y descarga de PNG reales con bytes idénticos.
- Limpieza de las fixtures REST: **0 usuarios, anuncios, perfiles, favoritos, administradores, fotos e invitaciones restantes**. Las fixtures SQL se revirtieron.
- Invitación de la cuenta administrativa solicitada guardada de forma privada, pendiente de confirmar el correo. No se probó entrega SMTP ni un teléfono físico.

Supabase bloquea actualmente el `DELETE` directo de `storage.objects` mediante su trigger de protección. La regresión SQL comprueba el predicado de elegibilidad y revierte sus objetos de metadatos; la prueba REST comprueba las eliminaciones reales mediante Storage. No se desactiva ese trigger ni se borra metadato de imágenes por SQL.
