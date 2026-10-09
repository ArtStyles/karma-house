# Favoritos con respuesta inmediata

Petición aprobada: mostrar siempre el corazón y reflejar cada toque en el cliente antes de esperar a la red.

## Diseño

El controlador de la cuenta mantiene favoritos confirmados y una cola de intenciones optimistas. Tarjetas, ficha, contador y lista consumen el mismo estado. Las escrituras conservan su orden y resuelven la identidad canónica antes de enviarse. Una respuesta antigua nunca sustituye una intención posterior; un fallo retira solo su intención y recupera el estado confirmado. Cambiar de cuenta invalida todo el trabajo anterior.

La comprobación del corazón ocurre en segundo plano, conserva el estado conocido y no bloquea el botón. Tarjeta y ficha permiten nuevos toques durante la sincronización. Se mantienen conexión requerida, acceso de invitados e intención de inicio de sesión.

## Tareas

- [ ] Añadir pruebas con red suspendida para actualización inmediata, toques rápidos, fallos, lectura concurrente, alias y cambio de cuenta; comprobar fallos antes del cambio.
- [ ] Implementar la superposición optimista en `src/state/remoteMarketplaceStore.ts` sin modificar contratos del servidor.
- [ ] Ajustar `useFavoriteHeart`, `PropertyCard` y `DetailScreen`; probar TSX real y avisos de fallo vigentes.
- [ ] Ejecutar pruebas enfocadas, `npm run check` y revisión independiente antes de integrar en main local.
- [ ] Preparar APK firmada 0.1.23 y verificar actualización/prueba en el Pixel conectado, conservando datos y restaurando los favoritos usados en la prueba.

## Casos de revisión

- Dos toques mientras el primero está pendiente: el último estado permanece visible y se guarda en orden.
- Fallo de una petición antigua: no revierte una intención posterior ni muestra un aviso obsoleto.
- Alias de una vivienda fusionada: contador, corazón y escritura usan una sola identidad.
- Refresco o cambio de cuenta: una respuesta antigua no pisa el estado visible ni cruza cuentas.
- Lectura inicial lenta: el corazón permanece visible y el toque se conserva hasta cargar el estado de la cuenta.

## Registro

Se reutiliza el worktree ya autorizado, actualizado desde `bdf491d`, en `codex/optimistic-favorites`. Los cambios ajenos del checkout principal permanecen intactos. La petición del usuario especifica el comportamiento y autoriza ejecutar la corrección sin otro paso de aprobación.
