# Aviso de actualización en Android: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La app de Android avisa de una versión nueva del APK, muestra sus detalles y la descarga, comprueba e instala al tocar «Descargar».

**Architecture:** Un manifiesto estático en karmahouse.site (`web/public/android/latest.json`) generado por
`prepare-android-distribution.ps1`. En la app, un módulo puro (`src/updates/release.ts`) valida y compara, y un
store de módulo (`src/updates/useAppUpdate.ts`), como el de Ahorro de datos, consulta como mucho una vez al día,
descarga con expo-file-system, comprueba el SHA-256 con expo-crypto y abre el instalador con expo-intent-launcher.

**Tech Stack:** Expo 57, expo-file-system (`File`, `Paths`, `File.createDownloadTask`, `contentUri`), expo-crypto,
expo-intent-launcher, expo-constants, AsyncStorage (`draftStorage`), PowerShell 5.1.

Diseño: `docs/superpowers/specs/2026-10-15-android-update-notice-design.md`. Sin commits: el dueño los pide aparte.

Cambio frente al diseño: `web/src/content.ts` conserva su constante `VERSION`. Importar JSON desde `web/public`
choca con las reglas de Vite. En su lugar, una prueba exige que la constante y el manifiesto coincidan, y `npm run check` corre en CI.

---

### Task 1: Módulo puro y pruebas

**Files:**
- Create: `src/updates/release.ts`
- Test: `tests/app-update.test.ts`

- [ ] Escribir la prueba: manifiesto válido; URL de otro repositorio, `http`, versión distinta en la URL,
  SHA en mayúsculas o corto, tamaño 0 y notas no textuales se rechazan; `isNewer` con versionCode mayor, igual,
  menor y sin versión instalada; `readUpdateState` tolera basura; `dueForCheck` a las 24 h y con el reloj atrasado;
  `toHex` coincide con `node:crypto`; `formatSize(85268595) === '85,3 MB'`; la constante `VERSION` de la web
  coincide con `web/public/android/latest.json`, y ese manifiesto pasa `parseRelease`.
- [ ] Ejecutar `npm test` y ver el fallo por módulo inexistente.
- [ ] Implementar `release.ts`: `AppRelease`, `MANIFEST_URL`, `apkUrl(version)`, `parseRelease`, `isNewer`,
  `formatSize`, `formatReleaseDate`, `UpdateState`, `EMPTY_UPDATE`, `readUpdateState`, `dueForCheck`, `toHex`.
  La URL debe ser exactamente `apkUrl(version)`.
- [ ] `npm test` en verde.

### Task 2: Store y dependencias nativas

**Files:**
- Create: `src/updates/useAppUpdate.ts`
- Modify: `package.json`, `package-lock.json` (`npx expo install expo-intent-launcher`), `app.json` (`android.permissions`)

- [ ] Instalar expo-intent-launcher con `npx expo install` y añadir `android.permission.REQUEST_INSTALL_PACKAGES`.
- [ ] Store: hidrata desde `draftStorage` (clave `karmahouse.appUpdate.v1`); borra un APK en caché que ya no
  corresponda; consulta al iniciar y en `AppState` `active` si `dueForCheck`; `dismissUpdate`, `installUpdate`
  (reutiliza el APK completo, si no descarga con progreso en enteros; comprueba el SHA; abre
  `android.intent.action.VIEW` con `contentUri`, tipo APK y flag 1), `cancelUpdate`, `useAppUpdate()`.
  Nada se ejecuta fuera de Android.

### Task 3: Interfaz

**Files:**
- Create: `src/components/UpdateSheet.tsx`
- Modify: `src/screens/ProfileScreen.tsx` (fila y prop `dot` en `AccountRow`), `src/app/(tabs)/_layout.tsx` (punto),
  `src/components/SideRail.tsx` (punto)

- [ ] Modal con versión, fecha, tamaño, notas, aviso de Play Protect, progreso, error, «Descargar · 85,3 MB» o
  «Instalar», «Ahora no» y «Cancelar descarga».
- [ ] Fila «Nueva versión X» encima de Ahorro de datos; punto mientras no esté pospuesta.
- [ ] Punto en la pestaña (solo sin contador de no leídos) y en la barra lateral, con etiqueta accesible.

### Task 4: Publicación

**Files:**
- Modify: `scripts/prepare-android-distribution.ps1` (notas desde archivo, `latest.json`, BOM UTF-8),
  `docs/android-distribution-verification.md`
- Create: `docs/release-notes/0.1.28.txt`, `web/public/android/latest.json` (0.1.28, la entrega pública actual)

- [ ] El script exige `docs/release-notes/<versión>.txt`, escribe las notas en `NOTAS-RELEASE.txt` y el
  manifiesto UTF-8 sin BOM en la carpeta de la entrega y en `web/public/android/latest.json`.
- [ ] Probar el bloque del manifiesto en PowerShell 5.1 y 7 con los datos de 0.1.28 y validarlo con `parseRelease`.
- [ ] Documentar el orden: publicar la release, comprobar la descarga y después desplegar el manifiesto con `VERSION`.

### Task 5: Verificación

- [ ] `npx tsc --noEmit` y `npm test` en verde.
- [ ] Revisar que la web no muestra nada (Platform) y anotar lo que solo se prueba en un teléfono.
