# Perfil público con confianza: verificación

1 de octubre de 2026. Commits `130e788`, `106764e`, `0271fe3` y siguientes en `main`. Diseño: [spec](superpowers/specs/2026-10-01-trust-profile-design.md); plan: [plan](superpowers/plans/2026-10-01-trust-profile.md).

## Migración aplicada

```
migración aplicada
{"commit":true,"before":{"users":2,"properties":2,"conversations":1,"reports":0,"notifications":12,"objects":6},"after":{…igual…},"inventoryUnchanged":true}
suite superada sobre el esquema aplicado
{"tables":1,"rpcs":2,"policies":1}
suite superada sobre el esquema aplicado   (trust_profile, optional_area, rent, search_alerts)
```

`supabase/tests/trust_profile.sql` cubre: perfil invisible para anónimos y desconocidos cuando la persona no tiene anuncios activos, visible para su interlocutor, para sí misma y para un administrador; mismo error `KH_PROFILE_NOT_FOUND` para inexistente, oculto e id nulo; claves exactas de la respuesta, sin `@` ni identificadores ajenos; mediana y tasa de respuesta; visitas concertadas; umbrales del nivel y tope por reporte confirmado reciente; verificación solo por administrador y nunca sobre sí mismo; política del avatar; permisos.

La suite cazó un fallo antes de confirmar: con espectador anónimo `profile_visible` devolvía nulo y el perfil de alguien sin anuncios pasaba. Ahora cierra por defecto.

## Pruebas locales

`npm run check`: typecheck limpio, 327 pruebas. `tests/trust-profile.test.ts` (6) y 19 en `tests/public-listing.test.ts` (línea del vendedor, 12 casos de fallo de la RPC que dejan la ficha en `200` sin esa línea).

## Proyecto real

- `POST /rest/v1/rpc/kh_public_profile` con la clave `anon`: devuelve nombre, `level: "new"`, `verified: false`, `levelReasons: ["2 anuncios aprobados"]`, `activeListingCount: 2`, `responseMinutes: null`. Un id inexistente devuelve `KH_PROFILE_NOT_FOUND`.
- Ficha pública en Vercel: «Publicado por Frank James · Nuevo». El identificador del dueño solo aparece dentro de las rutas de las fotos (`property-photos/<dueño>/…`), que es como se almacenan desde la primera entrega.

## Teléfono (Pixel 7 Pro, APK 0.1.10, ETECSA LTE)

- Detalle de una vivienda de otra persona: bloque del vendedor con foto, nombre y «Nuevo»; al tocar abre el perfil.
- Perfil: foto, nombre, chip «Nuevo», «En KarmaHouse desde septiembre de 2026», «2 anuncios aprobados», «Sus anuncios · 2» con sus tarjetas.
- Hoja del nivel: descripción, motivos y explicación de cómo se calcula.
- Como administrador: «Verificar» → hoja con nota opcional → la insignia «Verificado por KarmaHouse» aparece y el nivel pasa a «Activo». «Quitar verificación» lo devuelve a «Nuevo»; el servidor queda con 0 verificados.
- Justo tras abrir la app, el botón «Verificar» tarda unos segundos en aparecer: espera a que cargue el perfil de la sesión con su rol.

## Pendiente

- Cabecera del chat → perfil, con una conversación real.
- Tiempo de respuesta y visitas concertadas con datos reales (hoy no hay 3 conversaciones respondidas).
- La 0.1.10 instalada muestra «0 visitas concertadas»; corregido en `main` para el próximo build (se oculta cuando es cero).

## Límites

- Sin verificación por SMS; la insignia la otorga un administrador.
- Las estadísticas se calculan en cada consulta (`ponytail` en la migración).
