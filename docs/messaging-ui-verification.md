# Mensajería: interfaz y borradores

## Implementación (18 de septiembre de 2026)

- Rutas `/messages` y `/messages/[id]`, bandeja y conversación con aspecto coherente con las cuatro pestañas existentes.
- Bandeja: acceso a cuenta con retorno, estados sin conversaciones/demostración, última actividad, no leídos, bloqueo, actualización manual y al recuperar el foco. El proveedor gestiona la actualización global de 15 segundos; la pantalla no duplica ese temporizador.
- Conversación: consulta cada 5 segundos solo con pantalla enfocada y AppState activo. Historial paginado, texto seleccionable, fecha/hora, Enviando/Enviado/No enviado, reintento y descarte manual con confirmación. No hay envío automático al recuperar conexión.
- Leídos: se toma la secuencia de mensajes del servidor realmente visibles, con un tiempo mínimo de 350 ms y cobertura de ventana que admite mensajes largos. Se exige estar al final, tener foco y app activa; menús y reporte suspenden la lectura. Cada petición captura su secuencia; al terminar se reevalúa una secuencia nueva visible. Los fallos ofrecen reintento.
- Composer: AsyncStorage separado por cuenta y conversación, hidratación protegida, escrituras serializadas, sin sobrescribir un borrador cuya lectura falló. Instancias sucesivas de la misma pantalla comparten su cola de escritura; una cuenta distinta obtiene otro almacén. El texto solo se limpia tras resolver `sendMessage`, cuando la bandeja de salida ya lo conserva. Una limpieza tardía no borra un texto posterior.
- Bloquear/desbloquear conserva historial. Envío y reintento deshabilitados si no se puede enviar; el texto del borrador permanece. Reportes con motivo/comentario e identificador estable al reintentar el mismo contenido; confirmación únicamente tras resolver la operación remota. Cerrar y reabrir el formulario no pierde un intento pendiente dentro de la conversación.
- No se escribieron usuarios, conversaciones ni mensajes reales desde esta tarea.

## Evidencia ejecutada

`node --experimental-strip-types --test tests/message-composer.test.ts`: **5/5**.

1. Separación por cuenta/conversación y recuperación del texto.
2. Fallo de lectura impide sobrescritura y permite reintento.
3. Escrituras demoradas mantienen el orden del texto más reciente.
4. Mensaje encolado limpia el composer, sin borrar un borrador nuevo.
5. Fallo de escritura conserva texto y reintenta sin releer datos antiguos.

`git diff --check` de los archivos de esta tarea: sin errores. Docs exactas de Expo 57 consultadas antes de implementar.

## Verificación de integración

Al cerrar la implementación inicial, el proveedor aún se estaba implementando en paralelo y TypeScript señalaba su importación ausente. Una vez integrado, TypeScript terminó sin errores y la suite completa pasó sus 102 pruebas. El recorrido de navegador con cuentas sintéticas comprobó contacto, envío, respuesta, borrador recuperado, no leídos, bloqueo/desbloqueo y reporte/revisión; tamaños 320×740, 390×844 y 1200×900. La paginación, fallos de envío y carreras tienen pruebas controladas adicionales. Evidencia y límites físicos en [verificación de integración](messaging-verification.md).
