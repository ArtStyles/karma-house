# Alquiler: verificación

29 de septiembre de 2026. Commits `b8a8549`…`cbd3465` en `main`. Diseño: [spec](superpowers/specs/2026-09-29-rent-design.md); plan: [plan](superpowers/plans/2026-09-29-rent.md).

## Migración aplicada

`scripts/apply-rent.mjs --commit`, `scripts/verify-rent.mjs`, `scripts/verify-operations.mjs` y `scripts/verify-search-alerts.mjs` contra el proyecto real:

```
migración aplicada
{"commit":true,"before":{"users":2,"properties":2,"notifications":12,"searches":0,"objects":6},"after":{…igual…},"inventoryUnchanged":true}
suite superada sobre el esquema aplicado
{"columns":3,"constraints":2,"rentals":0}
suite superada sobre el esquema aplicado   (rent)
suite superada sobre el esquema aplicado   (operations)
suite superada sobre el esquema aplicado   (search_alerts)
```

`supabase/tests/rent.sql` cubre: alquiler por mes con estancia mínima y por noche sin ella; sin `rentPeriod`, periodo `week` o `rentMinStay` 400 → `KH_INVALID_RENT`; busco con `wantedOperations: ['rent']`; `['buy']`, vacío o repetido → `KH_INVALID_WANTED`; payload viejo → `{sale,swap}`; alertas: el busco de alquiler recibe aviso al aprobarse un alquiler, el arrendador recibe «Alguien busca lo que publicas», un busco de compra/permuta no; búsqueda guardada con `['rent']` recibe alerta y con `['sale']` no; catálogo sin `operations` oculta alquileres y con `['rent']` los devuelve.

## Pruebas locales

`npm run check`: typecheck limpio, 279 pruebas (16 en `tests/operations.test.ts`, 15 en `tests/public-listing.test.ts`, ampliación en `tests/search-alerts.test.ts`).

## Navegador (modo demo, por el subagente)

Publicar → «Alquilar»: «Cobro» por mes, «Precio por mes (USD)», «Estancia mínima (opcional)»; revisión «Alquiler», «$ 300 USD / mes», «Estancia mínima: 3 meses». Busco: pills «Qué busco» (Comprar y Permutar por defecto; con solo Alquilar, «Presupuesto máximo por mes (USD)» y «Busca: alquilar»). Explorar: por defecto no muestra el alquiler; chip «Alquileres» muestra la tarjeta con «Alquiler» y «$ 300 USD / mes». Detalle: «En alquiler», «Estancia mínima: 3 meses», barra «Alquiler · USD / mes». Sin errores de consola.

## Proyecto real

Alquiler sintético aprobado (insertado y borrado por SQL, `deleted 1`) y ficha pública en Vercel tras el despliegue:

```
GET https://karmahouse.vercel.app/p/e1bab5bd-… → 200
<title>Alquiler: Apartamento en Miramar por meses</title>
og:description="Alquiler 350 USD/mes · Miramar, La Habana · 2 hab · 1 baños · 70 m²"
$ 350 USD / mes · Estancia mínima: 3 meses
```

## Pendiente

- Publicar un alquiler real con sesión y aprobarlo en Admin.
- APK 0.1.8: el 0.1.7 no recibe alquileres ni alertas.

## Límites

- Un busco solo de alquiler muestra «Hasta $ X» sin «/ mes» en tarjeta y ficha (solo la etiqueta del formulario lo dice).
- Sin depósito, servicios, calendario ni precio en CUP.
