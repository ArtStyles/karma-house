# Búsquedas guardadas y alertas: verificación

28 de septiembre de 2026. Commits `1e72905`…`73e12b5` en `main`. Diseño: [spec](superpowers/specs/2026-09-28-search-alerts-design.md); plan: [plan](superpowers/plans/2026-09-28-search-alerts.md).

## Migración aplicada

`scripts/apply-search-alerts.mjs --commit`, `scripts/verify-search-alerts.mjs` y `scripts/verify-notifications.mjs` contra el proyecto real:

```
migración aplicada
{"commit":true,"before":{"users":2,"properties":2,"notifications":12,"objects":6,"searches":0},"after":{…igual…},"inventoryUnchanged":true}
suite superada sobre el esquema aplicado
{"searches_table":true,"columns":3,"functions":true,"list_args":6}
suite superada sobre el esquema aplicado
{"result":"notifications_verified", …}
```

La suite `supabase/tests/search_alerts.sql` (transacción revertida) cubre: normalización y rechazo de filtros; crear, editar con versión, borrar y límite de 10; venta aprobada crea alerta para la búsqueda que encaja y no para la que no; busco implícito; «Alguien busca lo que publicas» al vendedor; deduplicación al repetir la aprobación; preferencia `alerts=false` y bloqueo suprimen; nunca al dueño; `kh_list_notifications` sin `p_include_alerts` no devuelve alertas; `kh_resolve_push_notification` devuelve `propertyId`. Las suites anteriores (`notifications`, `operations`) se ajustaron a la firma nueva y siguen en verde.

Hallazgos durante la implementación: `20260922000100_bell_scope.sql` había cambiado la campana para excluir mensajes; las funciones nuevas conservan ese filtro. `push_payload` también necesitaba conocer la categoría `alert` para no titular el push como una oferta.

## Pruebas locales

`npm run check`: typecheck limpio, 273 pruebas. Nuevas: `tests/search-alerts.test.ts` (ida y vuelta de filtros, nombre y resumen, decodificación, repositorio), ampliaciones en `notifications-repository`, `push-repository`, `push-controller`, `notifications-preference-draft`.

## Proyecto real (SQL, transacción revertida)

Con la cuenta del usuario como destinataria y una venta sintética aprobada de otro usuario (`kh_save_search` + `alert_on_approval`), todo dentro de una transacción revertida (sin filas residuales):

```
search: "Verificación casas Habana"
alert: "Nueva vivienda para tu búsqueda" / "Verificación casas Habana: Casa de verificación de alertas, 85,000 USD, Cerro" (propertyId y savedSearchId correctos)
kh_notification_summary(actor) → unreadCount 0 (cliente antiguo no cuenta alertas)
kh_notification_summary(actor, true) → unreadCount 1
kh_resolve_push_notification → conversationId null, propertyId correcto
kh_list_saved_searches → 1
```

## Navegador (modo demo, por los subagentes)

Explorar muestra «Guardar búsqueda» y en demo avisa que hace falta cuenta; `/saved-searches` muestra el prompt de cuenta; Mi espacio no muestra «Mis alertas» en demo; sin errores de consola.

## Pendiente

- Recorrido con sesión real: guardar una búsqueda desde Explorar, aprobar un anuncio que encaje y ver la alerta en la campana y en el push del teléfono. El navegador integrado no tenía sesión.
- APK 0.1.8: el 0.1.7 no ve alertas (filtro `p_include_alerts`) y su toque en un push de alerta no navega.

## Límites

- Coincidencia de texto solo por prefijo (`search_vector`); sin ruta por subcadena.
- Sin tope de alertas por aprobación (`ponytail` en `kh_review_property`).
- `kh_search_properties` conserva su construcción de `tsquery`; `kh_catalog_tsquery` la duplica en lugar de sustituirla.

## Teléfono (Pixel 7 Pro, ETECSA LTE, APK 0.1.8, 28 de septiembre)

Instalado por ADB encima de 0.1.7 con la sesión conservada; controles localizados por etiqueta de accesibilidad con `uiautomator`.

- Explorar → «Guardar búsqueda» → hoja con «Todas las viviendas» (Venta y permuta · Toda Cuba) → Guardar → aviso «Te avisaremos cuando aparezca una vivienda que encaje» y botón «Ver mis alertas».
- «Mis alertas»: la búsqueda con resumen, interruptor «Activa», «Ver resultados» y «Borrar».
- Venta sintética aprobada de otro usuario (SQL + `alert_on_approval`): la campana marca 1; la bandeja muestra la tarjeta «Alerta» con «Nueva vivienda para tu búsqueda» y el cuerpo esperado; «Ver vivienda» abre la vivienda. Un alquiler sintético aprobado a la vez no generó alerta (la búsqueda es de venta y permuta), como debe ser.
- Push: «Activar en este teléfono» en Preferencias registró el dispositivo; el servidor canjeó el token en menos de un minuto; una segunda venta sintética aprobada produjo el push «KarmaHouse — Nueva vivienda para tu búsqueda.» en la barra del teléfono, y tocarlo abrió esa vivienda.
- «Borrar» desde «Mis alertas» con confirmación dejó la lista vacía y el servidor sin búsquedas. Las filas sintéticas se borraron por SQL (`deleted: 3`, `alerts: 0`).
- Preferencias: fila «Alertas de búsqueda» presente.
