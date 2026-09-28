# Búsquedas guardadas y alertas

28 de septiembre de 2026. Aprobado por el usuario: guardar desde Explorar con lista en Mi espacio (A), los «busco» avisan solos (A), aviso al vendedor cuando se aprueba un busco que encaja (A).

## Problema

Quien no encuentra hoy no vuelve mañana. Los avisos actuales solo nacen de una conversación; no hay forma de enterarse de que apareció una vivienda que encaja, ni de que alguien busca lo que uno vende.

## Diseño

### Servidor

Migración `supabase/migrations/20260928000100_search_alerts.sql`.

Búsquedas guardadas:

- `kh_private.saved_searches(id uuid pk, user_id uuid → profiles on delete cascade, name text 1-60, filters jsonb, enabled boolean default true, created_at, updated_at, version integer ≥ 1)`. Índice `(user_id, created_at desc)`. Máximo 10 por usuario (`KH_SEARCH_LIMIT`).
- `filters` normalizados por `kh_private.normalize_search_filters(jsonb) returns jsonb`: claves permitidas `query` (texto ≤ 80, normalizado como en `kh_search_properties`), `type` (`Casa`/`Apartamento`/nulo), `province` (lista oficial o nulo), `condition`, `min_price`, `max_price`, `min_area`, `max_area` (numéricos ≥ 0, mín ≤ máx), `min_bedrooms` (0-20), `min_bathrooms` (0-20 o nulo), `negotiable_only` (`true` o nulo), `amenities` (array ≤ 20 de texto normalizado), `operations` (array no vacío de `sale`/`swap`/`wanted`; por defecto `['sale','swap']`). Cualquier otra clave o valor → `KH_SEARCH_INVALID`.
- RPC (`security definer`, actor por `kh_private.chat_actor(p_actor_id)`, ejecutables por `authenticated`):
  - `kh_list_saved_searches(p_actor_id) → jsonb[]` ordenadas por creación descendente.
  - `kh_save_search(p_actor_id, p_payload {id?, name, filters, enabled, expectedVersion?}) → jsonb`. Sin `id` crea (comprueba el límite); con `id` exige `expectedVersion` = `version` (`KH_SEARCH_CONFLICT`) y actualiza `name`, `filters`, `enabled`. Bloqueo consultivo por usuario.
  - `kh_delete_saved_search(p_actor_id, p_id) → void`.
- JSON de una búsqueda: `{ id, name, filters, enabled, version, createdAt, updatedAt }`.

Avisos:

- `kh_private.notifications`: `conversation_id` y `message_id` pasan a nulos; columnas nuevas `property_id uuid → properties on delete cascade` y `saved_search_id uuid → saved_searches on delete cascade`. Categoría admite `alert`. Restricciones: `category='alert'` ⇔ (`conversation_id is null and message_id is null and property_id is not null`); las categorías anteriores conservan sus obligatorios. `message_id` sigue único (índice único parcial `where message_id is not null`). Índice único parcial `(recipient_id, property_id, coalesce(saved_search_id, '00000000-0000-0000-0000-000000000000'))` donde `category='alert'`: un aviso por coincidencia.
- `notification_json` añade `propertyId` y `savedSearchId`. `notification_visible`: para `alert`, `recipient_id = p_actor` y sin bloqueo entre destinatario y `actor_id`; el resto como hoy.
- `notification_preferences.alerts boolean not null default true`; `kh_save_notification_preferences` acepta `alerts` opcional (si falta, conserva el valor actual: clientes 0.1.7 no lo envían). `notification_preferences_json` lo incluye. `push_eligible` mapea `alert` → `alerts`.
- `kh_list_notifications` acepta `p_category='alert'`.
- `kh_resolve_push_notification` devuelve además `propertyId` (nulo en las categorías con conversación).

Coincidencia, `kh_private.alert_on_approval(p_property public.properties)`, llamada desde `kh_review_property` tras aprobar:

- `kh_private.property_matches(p_filters jsonb, p_id uuid) returns boolean`: `execute 'select exists(select 1 from public.properties p where '||kh_private.kh_catalog_where(p_filters)||' and p.id=$2'||<fts>||')' using p_filters, p_id`, donde `<fts>` es `and p.search_vector @@ $3` cuando `query` no está vacío, con la misma construcción de `tsquery` por prefijo que `kh_search_properties` (extraída a `kh_private.kh_catalog_tsquery(text) returns tsquery`, que `kh_search_properties` pasa a usar). Sin ruta por subcadena.
- Filtros derivados de un busco: `{ province, type (si lo fija), max_price: price, min_bedrooms: bedrooms, operations: ['sale','swap'] }`.
- Venta o permuta aprobada:
  - por cada `saved_searches s` con `enabled` y `user_id <> owner_id` tal que `property_matches(s.filters, id)`: aviso `alert` a `s.user_id`, `saved_search_id = s.id`, título «Nueva vivienda para tu búsqueda», cuerpo «{nombre de la búsqueda}: {title}, {precio} USD, {location}».
  - por cada busco aprobado y activo `w` con `owner_id <> owner_id` tal que `property_matches(derivados(w), id)`: aviso a `w.owner_id`, `saved_search_id` nulo, título «Una vivienda encaja con lo que buscas», cuerpo «{title}, {precio} USD, {location}».
- Busco aprobado: por cada venta o permuta aprobada y activa `o` con `owner_id <> owner_id` tal que `property_matches(derivados(busco), o.id)`: aviso a `o.owner_id`, `property_id = busco.id`, título «Alguien busca lo que publicas», cuerpo «{título del busco}, hasta {presupuesto} USD, {location}». El índice único deja uno por vendedor y busco aunque encajen varias viviendas.
- Reglas comunes: `actor_id` = dueño del anuncio aprobado; `actor_name` = su `display_name`; `property_title` = título del anuncio a abrir; se respeta el bloqueo de `notification_from_message`; se respeta la preferencia `alerts`; bloqueo consultivo por destinatario antes de asignar `seq`. Solo en la aprobación; reactivar un anuncio pausado no avisa. `ponytail:` sin tope de avisos por aprobación; añadir si un anuncio genera cientos.

### Cliente

Avisos (`src/notifications/`):

- `NotificationCategory` añade `alert`; `AppNotification.conversationId: string | null`, `messageId: string | null`, `propertyId: string | null`, `savedSearchId: string | null`. `decodeNotification`: en `alert`, `propertyId` uuid y conversación nula; en el resto como hoy.
- `NotificationPreferences.alerts`; `SaveNotificationPreferencesInput.alerts`; `NotificationSettingsScreen` añade la fila «Alertas de búsqueda» («Cuando se publique una vivienda que encaje con tus búsquedas guardadas o tu busco, y cuando alguien busque lo que publicas.»).
- `NotificationCard`: icono `search-outline`, etiqueta «Alerta», botón «Ver vivienda». `NotificationsScreen.onOpen`: `alert` → `/property/<propertyId>`, resto → `/messages/<conversationId>`. Texto vacío de la bandeja menciona las alertas.
- Push: `kh_resolve_push_notification` decodifica `propertyId` opcional; `navigate` recibe `{ conversationId } | { propertyId }` y `PushProvider` enruta a `/messages/[id]` o `/property/[id]`.

Búsquedas guardadas (`src/searches/`):

- `types.ts`: `SavedSearch { id, name, filters: SavedSearchFilters, enabled, version, createdAt, updatedAt }`, `SavedSearchFilters` = las claves del servidor.
- `domain.ts` (puro, probado): `toSavedFilters(filters: ListingFilters): SavedSearchFilters` (misma traducción que `searchPayload` sin cursor/limit/sort/with_total), `fromSavedFilters(saved): ListingFilters`, `searchName(filters): string` («Casas en La Habana hasta $ 30,000», «Apartamentos de 3+ hab en Matanzas», «Permutas en Toda Cuba», «Busco en La Habana», «Todas las viviendas»), `describeSearch(filters): string` (línea de resumen), `decodeSavedSearch`.
- `repository.ts`: `list`, `save`, `remove` sobre las RPC con el contexto de sesión (`MessagingRequestContext`, como avisos).
- `useSavedSearches.ts`: carga, guardar, activar/pausar, borrar, error y límite (`KH_SEARCH_LIMIT` → «Ya tienes 10 alertas. Borra alguna para guardar otra.»).
- Explorar: botón «Guardar búsqueda» (icono `bookmark-outline`) en la fila de controles. Sin sesión → `/auth` con `returnTo=/`. Con sesión → hoja modal con el nombre prellenado por `searchName`, editable, y «Guardar». Al guardar: aviso breve «Te avisaremos cuando aparezca una vivienda que encaje» con enlace a «Mis alertas». Si Explorar recibe el parámetro `search=<id>`, carga esa búsqueda y aplica `fromSavedFilters`.
- Pantalla `/saved-searches` («Mis alertas», `src/screens/SavedSearchesScreen.tsx`): lista con nombre, `describeSearch`, interruptor activar/pausar, «Ver resultados» (`router.push({ pathname: '/', params: { search: id } })`) y «Borrar» con confirmación. Vacío: «Guarda una búsqueda desde Explorar y te avisaremos.». Fila «Mis alertas» en Mi espacio con el recuento.
- Detalle de un busco propio: aviso «Te avisaremos cuando aparezca una vivienda que encaje.».

### Compatibilidad

- APK 0.1.7 no envía `alerts` en preferencias: se conserva el valor actual.
- Su `decodeNotification` rechaza un aviso sin conversación y tumbaría toda la bandeja. Por eso `kh_list_notifications` y `kh_notification_summary` reciben `p_include_alerts boolean default false` y solo el cliente nuevo lo pasa `true`; un cliente viejo ni ve ni cuenta alertas. Como PostgREST no distingue sobrecargas con parámetros por defecto, ambas funciones se eliminan y se recrean con la firma nueva, con los mismos permisos.
- `kh_private.push_devices` no guarda la versión de la app, así que un 0.1.7 sí recibe el push de una alerta; al tocarlo, `kh_resolve_push_notification` devuelve `conversationId` nulo, el controlador no navega y no pasa nada más. Aceptado y documentado.

## Verificación

- `supabase/tests/search_alerts.sql` en transacción revertida: normalización y rechazo de filtros; crear, editar con versión, borrar, límite 10; aprobar una venta crea aviso para la búsqueda que encaja (provincia y precio) y no para la que no (otra provincia); busco implícito recibe aviso; vendedor recibe «Alguien busca lo que publicas» al aprobar un busco; deduplicación al aprobar dos veces (rechazo + nueva aprobación); preferencia `alerts=false` y bloqueo suprimen; el dueño nunca se avisa a sí mismo; `kh_list_notifications` sin `p_include_alerts` no devuelve alertas. Scripts `apply-search-alerts.mjs` / `verify-search-alerts.mjs`.
- Unitarias `tests/search-alerts.test.ts`: `toSavedFilters`/`fromSavedFilters` ida y vuelta, `searchName`, `describeSearch`, `decodeSavedSearch`, `decodeNotification` con `alert`, navegación por categoría, preferencias con `alerts`.
- Navegador con Supabase: guardar una búsqueda (con sesión del usuario si está disponible; si no, por SQL), aprobar por SQL una vivienda sintética que encaje, ver la alerta en la campana, abrirla, «Mis alertas» con activar/pausar/borrar. `docs/search-alerts-verification.md`.
- Push en teléfono: el usuario.

## Fuera de alcance

Alertas por correo; coincidencia por subcadena del texto; alertas al reactivar un anuncio pausado; editar filtros desde «Mis alertas»; tope de avisos por aprobación; resumen diario.
