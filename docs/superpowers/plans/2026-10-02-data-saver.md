# Modo ahorro de datos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Explorar gaste una fracción de los datos actuales, que lo ya visto no se vuelva a descargar, que se pueda abrir sin red y que exista un interruptor para no cargar fotos ni mapa sin pedirlo.

**Architecture:** Miniatura de portada subida junto a las fotos y referenciada por `properties.cover_thumb_path`; caché local de URL firmadas de 7 días para que la caché de imágenes del sistema acierte; instantánea en `AsyncStorage` de la primera página del catálogo; preferencia local «Ahorro de datos».

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React Native / Expo Router, `expo-image-manipulator`, `@react-native-async-storage/async-storage`, `node --test`.

Spec: `docs/superpowers/specs/2026-10-02-data-saver-design.md` (léela entera).

**Contexto**: `npm run check` = `tsc --noEmit` + `node --experimental-strip-types --test tests/*.test.ts`; dominio y datos sin React Native en los módulos probados. Node del sistema sin red: `N="$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"; "$N" scripts/...`; nunca `--commit` sin permiso. Commits con última línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Referencias: fotos en `src/components/ListingPhotos.tsx`, `src/data/photoUpload.ts`, `src/data/supabaseMarketplace.ts` (`createRowSigner`, `PROPERTY_COLUMNS`, `PHOTO_URL_SECONDS`), `src/data/remoteMapping.ts`, `src/components/PropertyImage.tsx`, catálogo en `src/catalog/` (controlador, repositorio, `useCatalog.ts`), almacenamiento local en `src/data/draftStorage.ts`, `kh_save_property` y políticas de fotos en `supabase/migrations/20260917000100_cloud_marketplace.sql` y su versión vigente en `20260930000100_optional_area.sql`.

### Task 1: Servidor — miniatura de portada

**Files:** Create `supabase/migrations/20261002000100_cover_thumb.sql`, `supabase/tests/cover_thumb.sql`, `scripts/apply-cover-thumb.mjs`, `scripts/verify-cover-thumb.mjs`.

- [ ] Migración según la spec (columna, `kh_save_property` copiado de la versión vigente con `coverThumbPath`, política `kh_photo_read` y `photo_delete_allowed` ampliadas). Suite con los escenarios de la spec. Scripts como `apply-rent.mjs`. Ensayo en verde y suites anteriores (`optional_area`, `rent`, `operations`, `search_alerts`, `trust_profile`) sobre la migración.
- [ ] Commit `feat: reference a cover thumbnail from a listing`.

### Task 2: Caché de URL firmadas, instantánea y preferencia (módulos puros)

**Files:** Create `src/data/signedUrlCache.ts`, `src/catalog/offlineSnapshot.ts`, `src/settings/dataSaver.ts`, `tests/data-saver.test.ts`.

- [ ] Tests primero: `createSignedUrlCache({ storage, now })`: `get(path)` devuelve la URL vigente, nada si caduca en menos de 24 h; `missing(paths)` lista solo lo que falta; `put(entries)` persiste; límite de 500 descarta las más antiguas; almacenamiento corrupto se ignora. `offlineSnapshot`: `save(rows, now)`, `load(now)` devuelve `{ rows, savedAt }`, nulo si tiene más de 7 días, si está corrupto o si alguna fila no pasa la validación mínima (id uuid, título, precio). `dataSaver`: `read()`/`write(boolean)` con almacenamiento inyectado, por defecto `false`.
- [ ] Implementación con almacenamiento inyectado (`{ getItem, setItem, removeItem }`), sin importar React Native.
- [ ] `npm run check`. Commit `feat: cache signed photo links, the last catalogue page and the data saver choice`.

### Task 3: Cliente — subir y usar la miniatura, reutilizar firmas

**Files:** `src/components/ListingPhotos.tsx`, `src/data/photoUpload.ts`, `src/data/propertyPayload.ts`, `src/data/supabaseMarketplace.ts`, `src/data/remoteMapping.ts`, `src/domain/listings.ts` (tipos), `src/components/PropertyImage.tsx`, `src/components/PropertyCard.tsx`, `src/screens/MyListingsScreen.tsx`, tests afectados.

- [ ] Miniatura generada con `ImageManipulator` al elegir o reordenar la primera foto; `PhotoDraft.thumbUri?`; subida como `<nombre>_t.jpg`; `propertyPayload` envía `coverThumbPath`; mapeo de `cover_thumb_path` a `Listing.coverThumb`; firma de filas con caché (7 días) y preferencia por la miniatura en `photos: 'cover'`; `PropertyImage` acepta `variant: 'thumb' | 'full'`.
- [ ] Tests de mapeo, payload y firma con caché. `npm run check`. Commit `feat: browse the catalogue with cover thumbnails and reusable photo links`.

### Task 4: Cliente — sin conexión e interruptor

**Files:** `src/catalog/useCatalog.ts` (y controlador si hace falta), `src/screens/ExploreScreen.tsx`, `src/screens/DetailScreen.tsx`, `src/components/PropertyImage.tsx`, `src/components/ExploreMap.tsx`, `src/screens/ProfileScreen.tsx`, `src/settings/useDataSaver.ts`.

- [ ] Instantánea guardada tras la primera página por defecto y mostrada cuando la carga falla por red; aviso con antigüedad y «Reintentar»; controles deshabilitados. Detalle desde la instantánea.
- [ ] Interruptor en Mi espacio; con el modo encendido: foto bajo demanda en tarjetas, fotos del detalle una a una, «Cargar mapa» en Explorar y detalle.
- [ ] `npm run check`; navegador en modo demo para el interruptor. Commit `feat: open the catalogue offline and load photos and maps on demand`.

### Task 5: Aplicar, medir y documentar

- [ ] Con permiso: `apply-cover-thumb.mjs --commit`, verificaciones, push, build e instalación en el teléfono.
- [ ] Medición en el teléfono con `dumpsys netstats` por uid: Explorar en frío antes (0.1.11) y después; segunda apertura; modo avión; interruptor. `docs/data-saver-verification.md`, README, roadmap. Commit `docs: verify the data saver` y push.
