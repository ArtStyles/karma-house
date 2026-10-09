# Verificación de botones y filtros — 9 de octubre de 2026

Primera fase implementada localmente en `codex/apple-interactions`, sobre `2435e2d` (KarmaHouse 0.1.21). Conserva apariencia, navegación y la franja de cuatro tarjetas de Explorar. No agrega dependencias.

## Resultado

- Botones: compresión al tocar y retorno amortiguado desde el valor actual. Las tarjetas de vivienda usan una compresión menor. Una pulsación nueva puede interrumpir el retorno.
- Filtros móviles: seguimiento directo del agarre, retorno ante un arrastre corto y cierre según distancia y velocidad. Retomar el panel invalida el cierre anterior.
- El formulario conserva su borrador hasta aplicar; cerrar o arrastrar no confirma. Aplicar se ejecuta una sola vez.
- Escritorio: diálogo centrado desde 700 puntos, sin agarre. Movimiento reducido: fundidos cortos y sin compresión o desplazamiento.

## Comprobaciones

| Comprobación | Resultado y alcance |
| --- | --- |
| TypeScript: `npm run typecheck` | Correcto. |
| 20 pruebas nuevas de movimiento y componentes | 20/20 correctas con `node --test tests/filter-sheet-motion.test.ts tests/motion-pressable.test.ts tests/catalog-filter-sheet.test.ts tests/filter-sheet-component.test.ts`. |
| Suite completa: `npm test` | 682 pruebas: 675 correctas, 3 fallidas, 4 omitidas. |
| Comparación con la base | Base: 662 pruebas, 655 correctas, los mismos 3 fallos y 4 omitidas. Los fallos se reprodujeron también en el checkout original antes de los cambios. |
| Exportación: `EXPO_NO_DOTENV=1 npx expo export --platform all --output-dir artifacts/apple-export` | Web, Android e iOS exportados correctamente. Es una compilación de JavaScript/Hermes y assets, no una APK ni una instalación física. |
| Aplicación real, navegador 390 × 844 | Abrir; seleccionar Alquiler y cancelar conserva Venta y permuta; aplicar actualiza Operación a Alquiler; limpiar y aplicar restablece la búsqueda. |
| Edición de precios | Mínimo 200 y máximo 100 muestran el error y deshabilitan Aplicar. El formulario se desplaza sin mover el panel. |
| Gestos del panel web | Arrastre desde el agarre de 83 px retorna a `translateY(0)`; arrastre de 343 px cierra sin aplicar el borrador inválido. |
| Escritorio 1280 × 900 | Panel de 640 px centrado, sin agarre; Escape cierra. |
| Móvil compacto 320 × 568 | Título y acciones completos; Aplicar mide 52 px de alto y termina en y=540, dentro del viewport. |
| Consola de la aplicación | Sin errores ni advertencias de ejecución capturados durante las comprobaciones principales. |
| Boceto interactivo | Variantes Móvil/Escritorio, confirmación local y cambio de variante comprobados. Ajuste de 320 px revisado; el boceto no es una captura de la APK. |

Las pruebas TSX ejecutan los componentes reales con adaptadores de hooks, gestos y animación. Verifican estados, eventos y orden de callbacks, incluyendo callbacks diferidos; no miden física, frames ni percepción en un dispositivo.

## Fallos previos

En `tests/agency-refresh-recovery.test.ts:158`, las tres variantes de recuperación transitoria de `kh_read_agency_conversation`, `kh_get_agency_conversation` y `kh_list_agency_messages` fallan por `Missing control Reintentar propuesta`. No se modificó ese flujo. La suite completa sigue sin estar verde.

El log completo se conserva localmente en `artifacts/apple-tests.log`; la exportación en `artifacts/apple-export`. Capturas reales: `artifacts/apple-mobile.jpg` y `artifacts/apple-desktop.jpg`. Estos archivos de verificación son locales e ignorados por Git.

## Revisión independiente y ejecución

| Bloque | Evidencia |
| --- | --- |
| Reglas y respuesta táctil | `630cefc`: pruebas fallidas antes de implementar, luego correctas. |
| Panel e integración | `663b7ff`: pruebas de borrador, cierre, teclado y callbacks; typecheck correcto. |
| Corrección tras revisión | `a17b920`: se reprodujo y corrigió una carrera al retomar un cierre y cambiar el modo antes de procesar los callbacks de JS. Una solicitud nueva sustituye el cierre descartable anterior; nunca sustituye una confirmación Aplicar. |
| Entrega | Plan y especificación en `docs/superpowers`; boceto en la carpeta de visualizaciones de este chat. Cambios ajenos del checkout principal preservados. |

## Pendiente de dispositivo

No se ha generado ni instalado una APK para esta fase. Falta comprobar teclado y botón Atrás físicos, interrupción mediante toque real, lector de pantalla, safe areas reales y fluidez/percepción en Android. No se afirma una tasa de frames ni una sensación idéntica a iOS. No se ha integrado esta rama al checkout principal ni publicado en remoto.

## Referencias consultadas antes de implementar

- [Skill apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md).
- [Documentación versionada Expo 57](https://docs.expo.dev/versions/v57.0.0/).
- [Reanimated 4: withSpring](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/).

La primera fase toma la respuesta inmediata, continuidad e interrupción como criterios prácticos. Blur, glass y hápticos quedan fuera de este cambio.
