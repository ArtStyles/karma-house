# Permuta y «Busco vivienda»: verificación

27 de septiembre de 2026. Commits `896f57a`…`945f627` en `main`. Diseño: [spec](superpowers/specs/2026-09-26-operations-design.md); plan: [plan](superpowers/plans/2026-09-26-operations.md).

## Migración aplicada

`scripts/apply-operations.mjs --commit` y `scripts/verify-operations.mjs` (node de Codex) contra el proyecto real:

```
migración aplicada
{"commit":true,"before":{"users":2,"properties":1,"objects":5},"after":{"users":2,"properties":1,"objects":5},"inventoryUnchanged":true}
suite superada sobre el esquema aplicado
{"columns":5,"constraints":5,"non_sale":0}
suite superada sobre el esquema aplicado
```

La suite `supabase/tests/operations.sql` (transacción revertida) cubre: permuta completa por `kh_save_property`; permuta sin `swapWants` o con importe sin diferencia → `KH_INVALID_SWAP`; busco sin fotos, superficie, baños ni tipo se guarda y un administrador lo aprueba con `kh_review_property`; payload sin `operation` → `sale`; `operation` desconocida → `KH_INVALID_OPERATION`; cambiar la operación al editar → `KH_OPERATION_LOCKED`; `kh_search_properties` sin `operations` muestra la permuta y oculta el busco; `['wanted']` y `['swap']` devuelven solo el suyo; `kh_map_clusters` no cuenta buscos.

Hallazgo durante la implementación: `kh_review_property` y `kh_submit_property` también exigían una foto, así que un busco nunca se habría aprobado. La migración los redefine con la misma excepción que `kh_save_property`.

## Pruebas locales

`npm run check`: typecheck limpio, 268 pruebas. `tests/operations.test.ts` (15): validación por operación, `updateListing` al pasar a busco, filtros y atajos, textos de presentación, payload, filas remotas con nulos solo en busco, borrador, instantánea local, `searchPayload`, lista de columnas del `select`. `tests/public-listing.test.ts` (13) incluye el render de permuta y busco.

## Navegador

Modo demo (sin Supabase), por los subagentes de cada tarea: Publicar muestra Vender / Permutar / Busco vivienda; Busco tiene dos pasos sin fotos, mapa, baños ni superficie; Permutar añade «A cambio busco» con importe solo al elegir diferencia; Vender queda igual; chips «Permutas» y «Busco» y pills «Operación» en filtros; tarjeta de busco con bloque de icono, «Busco», «Hasta $ 45,000 USD», «desde 2 hab · Casa o apartamento»; detalle de busco y de permuta.

Modo nube (web local contra el proyecto real, lectura pública sin sesión) con dos anuncios sintéticos aprobados insertados por SQL (`verify-swap`, `verify-wanted`) y borrados al final (`deleted: 2`, quedan 1 anuncio y 0 no-venta):

- Explorar por defecto: la permuta aparece con «Permuta» y «$ 70,000 USD · valor est.»; el busco no aparece. Chip «Busco»: solo el busco («Busco vivienda», «Hasta $ 60,000 USD», «desde 3 hab · Casa o apartamento», «Ver esta búsqueda»). Chip «Permutas»: solo la permuta.
- Detalle del busco: bloque de icono, «Búsqueda activa», «Presupuesto máximo / Hasta $ 60,000 USD», «3 hab / Mínimo», «Casa o apartamento / Tipo», «Qué busca», barra «Presupuesto máximo · USD» y botón «Tengo algo que encaja».
- Detalle de la permuta: «Permuta», «En permuta», «Valor estimado», sección «A cambio busca» con el texto, «Añade hasta $ 5,000» y «La Habana, Mayabeque»; barra «Valor estimado · USD».
- Sin errores de consola.

Fallo encontrado y corregido en esta verificación (`e86ec22`): el detalle, favoritos y Mis anuncios leen con una lista explícita de columnas (`PROPERTY_COLUMNS`) que no incluía las nuevas; la permuta se veía como venta y el busco daba «no disponible». Ahora hay una prueba que lo impide.

## Ficha pública (Vercel)

`https://karmahouse.vercel.app/p/<id>` con los dos anuncios sintéticos:

```
<title>Permuta: Apartamento en Miramar para permutar</title>
og:description="Valor est. 70,000 USD · Miramar, La Habana · 2 hab · 1 baños · 90 m²"
<h2>A cambio busca</h2> · Añade hasta $ 5,000
<title>Busco: Busco casa de 3 cuartos en Playa</title>
og:description="Hasta 60,000 USD · Playa o Marianao, La Habana · desde 3 hab · Casa o apartamento"
<dt>Habitaciones mínimas</dt><dd>3</dd> · Tengo algo que encaja
```

## Pendiente

- Publicar una permuta y un busco reales con sesión (el navegador integrado no tenía sesión iniciada) y aprobarlos desde Admin: la ruta está cubierta por la suite SQL y por el modo demo, no por un recorrido con cuenta.
- APK nuevo: el 0.1.6 instalado sigue viendo permutas como ventas y nunca recibe buscos.

## Límites

- «1 baños» en la línea de datos de la ficha pública cuando hay un baño (texto previo, no de esta entrega).
- Sin búsqueda de texto dentro de «a cambio busco»; sin avisos cuando aparece una vivienda que encaja con un busco (entrega 3).
