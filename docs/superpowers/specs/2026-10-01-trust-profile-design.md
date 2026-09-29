# Perfil público con confianza

1 de octubre de 2026. Aprobado por el usuario: verificación manual por un administrador en lugar de SMS (A1), perfil con antigüedad, anuncios, tiempo de respuesta, visitas concertadas y nivel de karma (B), visible desde el detalle, el chat y la ficha pública web (C).

## Problema

Comprar o alquilar una vivienda a un desconocido da miedo a la estafa. Hoy el detalle solo muestra un nombre y una fecha. Los datos que dan confianza ya existen en la base (antigüedad, anuncios aprobados, conversaciones, visitas aceptadas, reportes), pero nadie los ve.

## Diseño

### Servidor (`supabase/migrations/20261001000100_trust_profile.sql`)

Verificación manual:

- `kh_private.verified_users(user_id uuid primary key → profiles on delete cascade, verified_by uuid not null, verified_at timestamptz not null default clock_timestamp(), note text check (note is null or char_length(note) <= 500))`. RLS activa, sin permisos para `anon`/`authenticated`.
- `public.kh_set_user_verified(p_actor_id uuid, p_user_id uuid, p_verified boolean, p_note text) returns jsonb`: solo administradores (`kh_is_admin()` con `kh_private.chat_actor`), nunca sobre sí mismo (`KH_CANNOT_VERIFY_SELF`); inserta o borra; devuelve el perfil público resultante.

Perfil público:

- `public.kh_public_profile(p_user_id uuid) returns jsonb`, `security definer`, ejecutable por `anon` y `authenticated`. Visible solo si la persona tiene al menos un anuncio aprobado y activo, o si quien consulta comparte una conversación con ella, o si quien consulta es administrador o ella misma; si no, `KH_PROFILE_NOT_FOUND`. Nunca devuelve correo, teléfono ni identificadores de otros.
- Respuesta: `{ id, displayName, memberSince, verified, level, levelReasons: string[], activeListings: uuid[] (máx. 24, más recientes primero), activeListingCount, approvedListingCount, responseMinutes (mediana, nulo con menos de 3 conversaciones respondidas), responseRate (0-100, nulo igual), visitsAgreed, avatarUrlPath (ruta en el bucket o nulo) }`.
- Cálculos (funciones privadas `stable`):
  - `responseMinutes` y `responseRate`: sobre conversaciones donde la persona es vendedora y el comprador escribió primero; tiempo entre el primer mensaje del comprador y la primera respuesta del vendedor; tasa = respondidas / recibidas, solo conversaciones de más de 24 h de antigüedad o ya respondidas.
  - `visitsAgreed`: negociaciones `kind='visit'` con `status='accepted'` en conversaciones donde participa.
  - Reportes confirmados: `kh_property_reports` con `unpublished = true` sobre sus anuncios.
  - Nivel (`kh_private.karma_level`): puntos = meses de antigüedad (máx. 12) + 3 por anuncio aprobado (máx. 15) + 1 por conversación respondida (máx. 20) + 2 por visita concertada (máx. 20) + 10 si está verificada − 15 por reporte confirmado. `new` < 10 ≤ `active` < 25 ≤ `trusted` < 45 ≤ `featured`. Con algún reporte confirmado en los últimos 90 días el nivel no pasa de `active`. `levelReasons` lista en español lo que suma («Verificado por KarmaHouse», «3 anuncios aprobados», «Responde a 9 de cada 10 mensajes», «5 visitas concertadas», «En KarmaHouse desde hace 8 meses»).
- Avatar: política nueva `kh_avatar_public_read` en `storage.objects` para `anon` y `authenticated` sobre el bucket `account-avatars`, permitida cuando `kh_private.avatar_is_public(name)` (función `security definer`: la ruta pertenece a alguien con un anuncio aprobado y activo). El cliente firma la URL como hace con las fotos.
- `ponytail:` los cálculos se hacen en cada consulta; con miles de conversaciones por persona conviene materializarlos.

### Cliente

- `src/profiles/types.ts`, `domain.ts` (puro: `levelLabel` → Nuevo / Activo / Confiable / Destacado, `levelDescription`, `responseText(minutes)` → «Suele responder en menos de una hora», «…en unas 3 horas», «…en un día», `memberSinceText`, `decodePublicProfile`), `repository.ts` (`get(userId, context?)`, `setVerified` para administradores; con sesión envía el `Authorization`, sin sesión usa la clave pública), `usePublicProfile.ts`.
- Pantalla `src/screens/PublicProfileScreen.tsx`, ruta `src/app/user/[id].tsx`: avatar, nombre, insignia «Verificado por KarmaHouse», chip de nivel que abre una hoja con `levelDescription` y `levelReasons`, «En KarmaHouse desde …», respuesta, visitas concertadas, y «Sus anuncios» con `PropertyCard` (carga por ids con el repositorio del catálogo). Administrador: botón «Verificar» / «Quitar verificación» con nota opcional.
- Entradas: bloque del vendedor en `DetailScreen` (nombre, nivel e insignia; al tocar abre el perfil; sustituye la consulta directa a `profiles`); cabecera de `ConversationScreen` (tocar el nombre abre el perfil); fila «Ver mi perfil público» en Mi espacio cuando la persona tiene anuncios activos.
- Funciona sin sesión para perfiles con anuncios activos.

### Ficha pública web (`web/api/p.ts`)

Línea «Publicado por {nombre} · {nivel}» y «Verificado por KarmaHouse» cuando aplique, obtenida con `POST /rest/v1/rpc/kh_public_profile` y la clave `anon`; si falla, la ficha se muestra sin esa línea. La consulta de la vivienda añade `owner_id` solo para esta llamada y no lo imprime.

### Compatibilidad

Todo es aditivo. Clientes anteriores no cambian.

## Verificación

- `supabase/tests/trust_profile.sql` (transacción revertida): perfil de alguien sin anuncios activos → `KH_PROFILE_NOT_FOUND` para `anon`, visible para su interlocutor y para sí mismo; mediana y tasa de respuesta con conversaciones sintéticas; visitas concertadas; nivel por umbrales; reporte confirmado reciente limita el nivel; verificación solo por administrador y nunca sobre sí mismo; la respuesta no contiene correo; `avatar_is_public`. Scripts `apply-trust-profile.mjs` / `verify-trust-profile.mjs`.
- Unitarias `tests/trust-profile.test.ts`: textos de `domain.ts`, decodificación estricta, repositorio con y sin sesión; `tests/public-listing.test.ts`: línea del vendedor y su ausencia cuando la consulta falla.
- Navegador y teléfono: abrir el perfil desde un detalle y desde el chat, hoja del nivel, verificación como administrador.

## Fuera de alcance

Verificación por SMS; valoraciones con estrellas o reseñas de texto; perfil público en la web (`/u/<id>`); materializar estadísticas.
