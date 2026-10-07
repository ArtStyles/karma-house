# Apariencia de KarmaHouse

En Mi espacio → Ajustes de cuenta → Apariencia se puede elegir Claro, Oscuro o Sistema,
incluso antes de iniciar sesión. Sistema es la opción inicial. La elección cambia la
interfaz al instante y se guarda en el dispositivo, sin vincularse a una cuenta.

`src/settings/appearance.ts` valida la preferencia al cargar y serializa las escrituras.
Una elección durante la carga tiene prioridad sobre el valor guardado. Si no se puede
guardar, la selección sigue activa y Ajustes permite reintentar tocando la opción.

`ThemeProvider` sigue `useColorScheme` y aplica el esquema nativo con `Appearance`.
La configuración de Expo usa `userInterfaceStyle: automatic` y un splash oscuro.
Para componentes nuevos, usar `useTheme` o `createThemedStyles` desde `src/theme.ts`.
Los tokens `surface` y `onPrimary` separan los paneles del texto blanco; `primary`
sirve para texto e iconos y `primaryFill` para controles con texto blanco.
Las fotografías y el mapa base Positron conservan su contenido original; la interfaz,
los controles y los marcadores del mapa se adaptan al tema.

Verificación local del 7 de octubre de 2026:

- `npm run check`: TypeScript y 429 pruebas correctas, incluidas 11 de apariencia.
- `npx expo export --platform all`: bundles Android, iOS y web generados.
- Vista web a 390 × 844 y 1280 × 900: Claro, Oscuro, selección accesible y por teclado,
  persistencia al recargar, Sistema con el SO oscuro, navegación y diálogo de filtros.
- Evidencia visual y registros en `artifacts/theme-modes/` (no se incluyen en Git).

Verificación Android del mismo día:

- APK y AAB 0.1.17 (versionCode 18) compilados con la firma de la versión instalada.
  `scripts/verify-android-preview.ps1` comprobó paquete, firma, configuración pública,
  bundle de producción y ausencia de credenciales privadas en los archivos empaquetados.
- Pixel 7 Pro actualizado mediante `adb install -r`, de 0.1.16 (17) a 0.1.17 (18).
  Se conservó `firstInstallTime` del 24 de septiembre de 2026 y la sesión existente.
- Claro y Oscuro cambiaron la interfaz y las barras del sistema al instante. Sistema
  respondió a los cambios de tema Android. Claro siguió seleccionado y visible tras
  detener la app y abrirla de nuevo, incluso con Android en oscuro.
- Se restauró el tema oscuro original del teléfono y se dejó KarmaHouse en Sistema.
  Capturas, XML de accesibilidad y registros en `artifacts/release-0.1.17/`.
- APK: `artifacts/releases/KarmaHouse-0.1.17.apk`.
  SHA-256: `72aff275728a6c5636fa56c9dc8178ae70d42f755ce39c410faaa89428531535`.

La compilación y la prueba física cubren Android; iOS solo cuenta con la exportación
del bundle. Esta actualización local no publica una nueva descarga en la web.
