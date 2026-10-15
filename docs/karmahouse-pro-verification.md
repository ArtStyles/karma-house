# KarmaHouse Pro — verificación

Fecha: 14 de octubre de 2026. Rama `feat/karmahouse-pro`, commit `0a5239f`. Diseño: [spec](superpowers/specs/2026-10-14-karmahouse-pro-design.md). Plan: [plan](superpowers/plans/2026-10-14-karmahouse-pro.md).

Estado: **implementado y probado en local; migración aplicada en producción el 14 de octubre de 2026 (18:59 UTC); cliente web publicado en app.karmahouse.site el mismo día (19:13 UTC); APK pendiente.**

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
- Aplicación (`--commit`), pedida expresamente por el usuario: **hecha** a las 18:59 UTC. Antes, sin transacciones largas abiertas. Resultado: `migración aplicada`, ambas suites superadas sobre el esquema aplicado, filas sintéticas antes y después 0. El ledger tiene `20261014000100 karmahouse_pro` con SHA-256 `0cceb878b6e00f9f2575b92a0c2239966640733dcd3746a303f4e32a2a80f388`, igual que el archivo.
- Comprobación posterior (solo lectura): 65 anuncios, ninguno subido; `pro_status`, `pro_codes` y el historial Pro vacíos; 65 puntos iniciales de historial de precios. Como visitante anónimo, `kh_search_properties` devuelve el catálogo (9 activos) con `is_pro` y `bumped_at` en cada fila y pagina con cursor; `public.kh_is_pro(p)` responde por anuncio.
- Recorrido real del propietario (Task 11, paso 4): **pendiente**; necesita el cliente nuevo publicado (web) y las cuentas del propietario.

## Orden de publicación

1. ~~`node scripts/apply-pro.mjs --commit`~~: hecho.
2. Comprobar que la app publicada sigue leyendo anuncios: hecho a nivel SQL como visitante anónimo; falta mirarla en un navegador o un teléfono.
3. ~~Fusionar con `main`~~: hecho (`76e49de`). El primer despliegue de la app falló en el «Ignored Build Step» (`fatal: bad object`: el clon poco profundo de Vercel no tenía el commit anterior tras un push de 25 commits); arreglado en `pwa/vercel.json` (`5930ad8`) y publicado. Los archivos servidos contienen `kh_bump_property`, `kh_is_pro` y «Cuenta Pro de KarmaHouse».
4. ~~Nuevo APK~~: hecho, 0.1.26 (ver abajo). El APK 0.1.25 no tiene la pantalla Pro: ve el nuevo orden de «Más recientes», pero no el sello ni el canje.

## Android 0.1.26

| Dato | Resultado |
| --- | --- |
| Fuente | `93f701630d4ddb9354ec041c714cf71f1ad1b9fd` (`release: prepare Android 0.1.26 with KarmaHouse Pro`) |
| Paquete / versión / código | `com.karmahouse.karmahouse` / `0.1.26` / `27` |
| APK | `KarmaHouse.apk`, 85.231.031 bytes (81,28 MiB) |
| APK SHA-256 | `d077ca0b71a8e8e6643f78cf6b0ec1548d6d631274477fdad393946f46d9b676` |
| AAB SHA-256 (local) | `c927a7b3f3e4345f6fb2b40c195cb5c8475c71302f759e59b2784e8bcb7f3062` |
| Certificado SHA-256 | `1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6`, el mismo de las versiones anteriores |
| Firma / Android / ABI | v2 correcta, no depurable, minSdk 24 (Android 7), arm64-v8a y armeabi-v7a |
| Secretos | 1386 entradas sin los valores privados de `infra/.env.local` ni marcadores PEM o credenciales JSON |
| Alineación | ZIP de 16 KB correcta; no evalúa la alineación ELF |
| JavaScript | El bundle contiene `kh_bump_property`, `kh_is_pro`, `kh_redeem_pro_code`, `kh_admin_create_pro_code` y «Cuenta Pro de KarmaHouse» |

- Compilado en el entorno aislado `artifacts/v24` (caché Android de la 0.1.25) con la fuente de `93f7016` extraída por `git archive`: 411 archivos de texto y 7 recursos binarios idénticos al commit. `versionCode`/`versionName` del proyecto nativo de `v24` actualizados a mano a 27 / 0.1.26 (las dependencias nativas no cambiaron desde la 0.1.25). `build-android-preview.ps1 -Release -RefreshBundleCache`: correcto en 1 min 54 s. Logs en `artifacts/v24/artifacts/android-build-0.1.26.log` y `distribution-0.1.26.log`; entrega en `artifacts/distribution/0.1.26/`.
- [Release v0.1.26](https://github.com/ArtStyles/karma-house/releases/tag/v0.1.26), «KarmaHouse 0.1.26 · KarmaHouse Pro», pública y última, etiqueta en `93f7016`. Se creó como borrador, se subieron los tres archivos (`curl --limit-rate 400k`) y se publicó con sus digests ya iguales a los locales.
- Descarga sin sesión de los tres archivos: SHA-256 idénticos a los preparados. `releases/latest/download/KarmaHouse.apk` redirige a v0.1.26.
- Sin instalación en teléfono en esta entrega: falta probar la actualización sobre 0.1.25 y el análisis de Play Protect en un dispositivo.

## Cambio del 15 de octubre de 2026: Pro solo para quien lo tiene

Por decisión del usuario, los anuncios, el detalle y el perfil público ya no muestran la etiqueta «Pro»: solo le interesa a quien lo tiene. Mi espacio enseña la etiqueta junto a tu nombre y «Activo hasta el …» en la fila KarmaHouse Pro; la pantalla Pro lo explica. «Subir anuncio» y el orden de «Más recientes» no cambian. El servidor sigue devolviendo `is_pro` en el catálogo y la RPC pública `kh_pro_badge`, que el cliente ya no usa.

## Límites

- La página web pública de la inmobiliaria no muestra el sello (spec §3).
- Sin comprobación visual en el navegador: la vista previa local apunta a la Supabase de producción y el sistema de permisos la bloqueó. La pantalla `/pro`, la administración y los botones están cubiertos por `tsc`, la exportación y las pruebas de renderizado de Mis anuncios y la cartera, no por una prueba visual.
- Las suites solo valen justo después de la migración: algunas aserciones cuentan todas las cuentas Pro y todo el historial Pro, así que fallarían (sin efectos, por el `rollback`) cuando ya haya Pro real.
- El informe de mercado no se ha generado con datos reales. Las búsquedas guardadas solo se usan con `--with-searches`, que debe esperar a que la política de privacidad publicada lo explique (spec §9).
- Sin prueba en un APK físico.
