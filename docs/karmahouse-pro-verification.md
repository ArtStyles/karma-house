# KarmaHouse Pro — verificación

Fecha: 14 de octubre de 2026. Rama `feat/karmahouse-pro`, commit `0a5239f`. Diseño: [spec](superpowers/specs/2026-10-14-karmahouse-pro-design.md). Plan: [plan](superpowers/plans/2026-10-14-karmahouse-pro.md).

Estado: **implementado y probado en local; ensayo en producción superado; no aplicado en producción; no publicado.**

## Local

Clúster PostgreSQL 17 desechable en `127.0.0.1:56440`, bases nuevas creadas con `scripts/local-sql/setup.mjs` (todas las migraciones, incluida la de Pro).

- Suites SQL en verde sobre el esquema final (23): `pro`, `pro_bump`, `owner_administration`, `search_alerts`, `operations`, `rent`, `optional_area`, `listing_media_assets`, `listing_management_transfers`, `listing_transfer_permissions`, `listing_transfer_failures`, `transfer_chat_context`, `assisted_listing_records`, `cover_thumb`, `trust_profile`, `notifications`, `messaging`, `negotiations`, `listing_details`, `property_map`, `administration_queries`, `play_compliance`, `chat_negotiation_cards`.
- `scripts/local-sql/verify-pro-concurrency.mjs`: en verde. Con dos conexiones reales, dos personas canjean el mismo código y solo una lo consigue; la misma persona canjea dos veces a la vez y Pro se amplía una sola vez.
- Fallos que ya existían antes de Pro y siguen igual con Pro:
  - `catalog_pagination`: el clúster local se creó con `--locale=C` y `lower('Á')` no pliega el acento. En una base con locale ICU pasa con y sin Pro, y una copia con la provincia en ASCII pasa sus 37 aserciones con y sin Pro.
  - `android_push`: el entorno local no tiene `extensions.digest`.
  - `principal_agency`: falla igual en una base sin la migración de Pro.
  - Las suites `agency_*` necesitan `run-agency-suites.mjs`, que exige una base fija que no existe en este equipo. No se ejecutaron contra el esquema con Pro.
- `npm run check`: `tsc` sin errores. 823 tests: 817 pasan, 4 omitidos y 2 fallan. Los 2 fallos son de `tests/android-private-reference.test.ts`, que lanza `pwsh` (PowerShell 7) y este equipo no lo tiene. No tocan Pro.
- `npx expo export --platform all`: web, Android e iOS exportados sin errores (en una carpeta temporal).
- Mutaciones comprobadas por los revisores: quitar cualquiera de las protecciones (alertas repetidas, revalidación de fotos, cambio de precio sin valor nuevo, `for update` del canje, permisos de reintento, compuerta de inmobiliaria) hace fallar la suite correspondiente.

## Producción

- Comprobación previa (solo lectura): sin transacciones largas abiertas, 65 anuncios, última migración del ledger `20261008000200`, sin tablas Pro.
- Ensayo `node scripts/apply-pro.mjs` (sin `--commit`), autorizado por el usuario: **superado**. Las dos suites pasaron sobre la migración dentro de transacciones que se deshicieron. Filas sintéticas antes y después: 0.
- Comprobación posterior: producción igual que antes (sin tablas Pro, sin `bumped_at`, 65 anuncios, ledger en `20261008000200`).
- Aplicación (`--commit`): **pendiente**. Se decidió no aplicarla sin el usuario presente: cambia el esquema de producción y nadie podría reaccionar a un fallo. `--commit` registra también la migración y su SHA-256 (`0cceb878…f388`) en `supabase_migrations`, y se niega a correr dos veces (probado en local).
- Recorrido real del propietario (Task 11, paso 4): **pendiente** hasta aplicar la migración.

## Orden de publicación

1. `node scripts/apply-pro.mjs --commit`, en una hora tranquila. Con el node del sistema bloqueado (`EACCES`), usar el node incluido: `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
2. Comprobar que la app publicada sigue leyendo anuncios.
3. Solo entonces fusionar la rama con `main`. Cada push a `main` publica app.karmahouse.site, y el cliente nuevo pide `bumped_at` y `kh_is_pro`: contra un servidor sin la migración no podría leer anuncios por id.
4. Nuevo APK. El APK 0.1.25 no tiene la pantalla Pro: verá el nuevo orden de «Más recientes», pero no el sello ni el canje. Por eso el mensaje de cada código dice que se canjea en app.karmahouse.site.

## Límites

- La página web pública de la inmobiliaria no muestra el sello (spec §3).
- Sin comprobación visual en el navegador: la vista previa local apunta a la Supabase de producción y el sistema de permisos la bloqueó. La pantalla `/pro`, la administración y los botones están cubiertos por `tsc`, la exportación y las pruebas de renderizado de Mis anuncios y la cartera, no por una prueba visual.
- Las suites solo valen justo después de la migración: algunas aserciones cuentan todas las cuentas Pro y todo el historial Pro, así que fallarían (sin efectos, por el `rollback`) cuando ya haya Pro real.
- El informe de mercado no se ha generado con datos reales. Las búsquedas guardadas solo se usan con `--with-searches`, que debe esperar a que la política de privacidad publicada lo explique (spec §9).
- Sin prueba en un APK físico.
