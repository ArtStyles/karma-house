# Persistencia del mapa — 17 de septiembre de 2026

## Contrato

`Listing.mapLocation` y `ListingDraft.mapLocation` son opcionales. El punto contiene latitud, longitud y precisión `exact` o `approximate`. La publicación aproximada conserva dos decimales, la exacta seis. La fórmula compartida es `floor(coordinate * factor + 0.5) / factor`, con aritmética binaria de JavaScript y `double precision` en PostgreSQL antes de convertir el resultado a `numeric`.

El selector no depende del permiso GPS. La capa de datos no genera puntos a partir de direcciones. Al borrar el punto el cliente envía `mapLocation: null`; si un cliente antiguo omite ese campo al editar, el servidor conserva el punto existente. Las ediciones vuelven a revisión y los reintentos se comparan con el punto normalizado.

Los borradores y copias públicas locales se normalizan antes de persistirse. PostgreSQL también normaliza antes de guardar, tanto en el RPC como mediante trigger. Los campos públicos `latitude`, `longitude`, `location_precision` solo admiten un punto completo o los tres nulos. El recibo privado de idempotencia tampoco guarda el punto exacto recibido para una publicación aproximada.

## Migraciones remotas aplicadas

- `20260917000200_property_map.sql`: columnas, restricciones, trigger, normalización, RPC y compatibilidad de recibos anteriores. SHA256 `94c993d0e44a9e73c69d38d69901ac172453f2839b98810c6e0c2bdf441aefe4`.
- `20260917000300_map_rounding_parity.sql`: ajuste aditivo para que los empates binarios `20.025` y `-81.915` coincidan entre JavaScript y SQL. No reescribe ubicaciones existentes ni altera la migración anterior. SHA256 `bdd989ecd7ce8ce1f5fa39d1c0997fa57ee6cc05fd16f32f2a5492b2154f9c36`.

`node scripts/apply-property-map.mjs --apply` aplica únicamente migraciones pendientes, verifica checksums, prueba dentro de savepoints y vuelve a comparar conteos y hashes de los datos existentes. `--test` ejecuta las pruebas con rollback; sin opciones solo inventaría. Se verificó una segunda ejecución sin reaplicar cambios. Registro: `artifacts/property-map-sql-verification.log`.

Inventario conservado: 1 propiedad, 2 perfiles, 0 favoritos y 3 fotos. Hashes de contenido, puntos y recibos idénticos antes/después. Cero usuarios sintéticos de SQL residuales.

## Evidencia

- Ocho pruebas nuevas en `tests/map-data.test.ts`: coordenadas inválidas, normalización, retirada, datos antiguos, restauración, instantánea de autoguardado, clonación/persistencia local, mapeo remoto y payload. Se ejecutaron primero en rojo y luego en verde.
- 48 pruebas de dominio/persistencia/repositorio relevantes pasan. Una ejecución conjunta con los cambios de picker/renderizador alcanzó 71 pruebas en verde; la verificación final integrada corresponde al agente principal.
- TypeScript sin errores al integrar los modelos.
- 31 aserciones SQL pasan: validación, privacidad, RLS, normalización servidor, exacta, aproximada, reintentos, versiones, moderación, retirada y omisión de clientes antiguos. Se reprodujo el fallo de paridad antes de aplicar la migración 003.
- `node scripts/verify-cloud.mjs`: 40 comprobaciones REST pasan con tres cuentas sintéticas confirmadas mediante Admin API, sin correos. Incluye subida/lectura real de PNG, RLS, favoritos, control de cuenta, moderación y las nuevas comprobaciones de mapa. Usuarios, anuncios, perfiles, favoritos, administradores, fotos e invitaciones sintéticos eliminados y verificados en cero.
- La suite REST completa se ejecutó con la migración 002; la posterior 003 recibió verificación SQL específica y la suite SQL completa. La 003 solo cambia el cálculo de redondeo de empates.

Estas pruebas verifican los datos y servicios. La interacción del mapa, la APK y la conectividad desde un teléfono físico requieren su propia evidencia.
