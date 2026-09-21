# Mensajería: backend y verificación — 18 de septiembre de 2026

## Implementación aplicada

La migración aditiva `20260918000100_messaging.sql` está aplicada en el proyecto Supabase de KarmaHouse. SHA256 verificado: `8e7acaac8696f60a3ee1e5857a07eb471f35b0b76b6ecf72b67f7367cb78c645`. No se modificaron las migraciones anteriores ni los roles de cuentas existentes.

Se crearon `kh_conversations`, `kh_messages`, `kh_conversation_reads`, `kh_user_blocks` y `kh_message_reports`. Todas tienen RLS y los clientes autenticados carecen de permisos para escribir directamente. Las conversaciones/mensajes solo se leen por sus dos participantes. Los administradores leen reportes y su evidencia; no reciben acceso general al chat. Los nombres públicos de las contrapartes se obtienen dentro de RPC autorizadas, sin ampliar el acceso general a `profiles` ni exponer correos o teléfonos.

Las once RPC del contrato verifican `p_actor_id = auth.uid()`, usan `SECURITY DEFINER` con `search_path` vacío y permisos EXECUTE explícitos. Incluyen `kh_find_sent_messages` para reconciliar hasta cincuenta identificadores del propio remitente, incluso fuera de la página reciente.

## Consistencia

- Conversación única por propiedad/comprador/vendedor, iniciada solo sobre un anuncio aprobado y activo; no permite contacto consigo mismo.
- UUID de envío único por remitente. Reintentar el mismo cuerpo/conversación devuelve el mensaje aceptado, sin nueva secuencia ni contador. Reutilizar el ID con otro contenido se rechaza.
- Bloqueo por actor para cuotas e idempotencia; bloqueo por pareja para serializar envíos y bloqueo global; bloqueo de fila por conversación para secuencias y lecturas. Los bloqueos se mantienen hasta el fin de la transacción.
- Las secuencias son monotónicas. El cursor de lectura solo avanza, se limita a la secuencia existente y cuenta únicamente mensajes del otro participante. El envío propio no marca automáticamente mensajes recibidos como leídos.
- El bloqueo impide nuevos mensajes en ambos sentidos y en cualquier vivienda compartida. Solo puede retirarse el bloqueo propio. El historial y los ACK de mensajes ya aceptados continúan disponibles.
- Un anuncio no disponible congela nuevos envíos. La conversación conserva el título y zona públicos originales, sin revelar futuras ediciones privadas del anuncio.
- Límites de ventanas móviles: veinte conversaciones nuevas por comprador en veinticuatro horas; veinte mensajes por minuto y trescientos por hora por remitente; diez reportes en veinticuatro horas. Los reintentos aceptados no vuelven a consumir cuota.

## Reportes y conservación

El servidor captura hasta veinte mensajes confirmados recientes, ordenados por secuencia, al guardar el reporte. El cliente no proporciona ni puede modificar la evidencia. El UUID estable evita duplicados y rechaza cambios de motivo/comentario al reintentar.

La revisión exige un administrador ajeno a las partes. Marca el reporte como revisado conservando el contexto. Un reintento con la misma nota es idempotente.

La conversación conserva el UUID y snapshot de la propiedad aunque se elimine el anuncio. Si desaparece un perfil participante, su conversación se elimina por cascada. Los reportes no tienen cascadas desde propiedades, conversaciones o cuentas: conservan su evidencia independiente. Las herramientas de prueba eliminan explícitamente únicamente sus propios reportes sintéticos.

## Verificación ejecutada

1. Se escribieron primero las pruebas SQL y se comprobó el fallo por ausencia de las RPC.
2. La migración se aplicó dentro de una transacción con advisory lock, ledger y checksum; las pruebas usan savepoint y revierten todos sus fixtures.
3. `supabase/tests/messaging.sql`: **57 aserciones en verde**, incluyendo aislamiento tercero/anónimo/admin, secuencias, no leídos, cursor futuro acotado, paginación exclusiva, deduplicación, ACK bajo bloqueo/no disponibilidad, bloqueo global, todas las cuotas, snapshots de reportes y conservación tras eliminar la conversación.
4. `scripts/verify-messaging.mjs`: **47 comprobaciones REST en verde** con cuatro cuentas sintéticas confirmadas mediante Admin API, sin enviar correos. Incluye llamadas reales concurrentes, actor incorrecto en las once RPC, subida de PNG, propiedad/revisión, dos viviendas, sesiones reales, ACK antiguo, reportes y revisión.
5. Segunda ejecución del runner en modo `verified_existing`: checksum idéntico y ninguna reaplicación de la migración.
6. Ambos scripts pasan `node --check`.

Registro SQL: `artifacts/messaging-sql-verification.log`.

## Limpieza e inventario conservado

La limpieza REST confirmó cero cuentas, propiedades, conversaciones, mensajes, reportes, bloqueos, administradores o fotos sintéticos restantes. Todas las tablas nuevas de chat volvieron a estar vacías.

Conteos originales conservados: dos perfiles, una propiedad, cero favoritos, dos administradores, cero invitaciones pendientes, un recibo de guardado y tres objetos de Storage. Los hashes de todas esas tablas fueron idénticos antes y después; también se compararon los hashes de las tablas de mensajería.

## Repetir la verificación

Usar el Node incluido en el runtime local de Codex para evitar diferencias de red del Node del sistema:

```text
node scripts/apply-messaging.mjs          # Inventario de solo lectura
node scripts/apply-messaging.mjs --test   # SQL con rollback, requiere esquema aplicado
node scripts/apply-messaging.mjs --apply  # Aplica si falta; verifica checksum si ya existe
node scripts/verify-messaging.mjs         # REST con usuarios propios y limpieza
```

Los runners comparan inventarios completos: ejecutar sin otro proceso de QA que modifique datos simultáneamente. Las credenciales se leen del archivo privado existente; nunca forman parte de la salida.

Esta evidencia corresponde al backend. La experiencia web/móvil, la bandeja de salida local, la APK, el teléfono físico e iOS se verifican por separado. El backend no configura notificaciones push ni publicación Realtime; la primera entrega usa la sincronización activa indicada en el contrato del cliente.
