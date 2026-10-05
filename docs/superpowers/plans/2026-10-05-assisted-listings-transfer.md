# Plan de implementación: publicación asistida y traspaso de gestión

> **Para quien implemente:** usar superpowers:executing-plans para ejecutar las tareas en orden. superpowers:subagent-driven-development es una alternativa solo si se autoriza ese método. Las casillas son trabajo futuro: ninguna está completada por este encargo de análisis.

**Estado:** aprobado para implementación, 5 de octubre de 2026. Despliegue/producción y publicación real no autorizados por esta aprobación.

**Regla prioritaria:** únicamente la cuenta principal oficial protegida emite traspasos de sus fichas. Ningún otro administrador o miembro puede iniciarlos. Máximo 20 por lote, sin límite total por colaborador.

**Objetivo:** publicar oferta real autorizada desde la cuenta oficial y entregar su gestión a una cuenta vinculada que acepte, conservando fichas, imágenes, favoritos y privacidad del chat.

**Arquitectura:** owner_id indica el gestor vigente. Una identidad privada de creación protege reintentos, un registro por anuncio autoriza los adjuntos heredados y las solicitudes se aceptan mediante una transacción SQL idempotente. El chat anterior conserva participantes; la nueva pareja inicia otro chat. La limpieza de objetos retirados se procesa desde una cola de servidor.

**Tecnología:** Expo 57.0.23, React Native 0.86.3, React 19.2.3, Expo Router 57.0.21, TypeScript, Supabase Postgres/RLS/Auth/Storage, tests de Node ya usados por el proyecto. Sin nuevos paquetes nativos previstos.

**Diseño:** [2026-10-05-assisted-listings-transfer-design.md](../specs/2026-10-05-assisted-listings-transfer-design.md).

**Base funcional:** 734adcbc0a150dbbc61e34cb850697cf965f05b8 en D:/work/karma-house. Este worktree documental está en 0dcb94b; hay que incorporar una base pertinente antes de ejecutar. No trasladar cambios locales ajenos de web/configuración por accidente.

## Restricciones globales

- Implementación aprobada. Las migraciones se desarrollan y verifican localmente; no aplicarlas a producción ni activar el piloto real sin autorización de esa etapa.
- Leer la [documentación exacta Expo v57](https://docs.expo.dev/versions/v57.0.0/) según AGENTS.md antes de escribir producto; verificar las versiones del checkout elegido. No actualizar Expo por iniciativa propia.
- Cuenta oficial → colaborador vinculado; solo propietario inicia/cancela y ve datos sensibles. No reclamar por enlace/teléfono, cambiar roles ni transferir anuncios ajenos.
- Conservar UUID, created_at, client_request_id, fotos/miniatura, contenido, moderación, disponibilidad y favoritos. Incrementar version una vez al aceptar.
- Lotes de 1–20 fichas, un colaborador y una cuenta; aceptación completa; plazo de siete días de servidor. Una modificación de cualquier ficha invalida el lote.
- Fichas elegibles: asistidas aprobadas, activas o pausadas, con autorización y vínculo vigentes. Ninguna cerrada, borrador, pendiente o rechazada.
- No entregar conversaciones previas, contactos privados, evidencias, ofertas, visitas o notificaciones al destinatario. No generar «Nueva vivienda» por aceptar.
- Conservar firmas históricas de las RPC y semántica de omisiones de clientes antiguos. La aceptación solo se ofrece en el cliente compatible; transfers_enabled comienza false.
- Publicación gratuita inicial. Sin scraping, mensajes masivos, pagos, comisiones, equipos de agencia, cambio de titular de KarmaHouse o nueva categoría push.
- No ejecutar scripts existentes de verificación contra infraestructura real sin identificar su destino: scripts/cloud-db.mjs usa infra/.env.local y sus verificadores pueden conectarse al servidor.

## Riesgos que debe cubrir la revisión

| Condición de uso | Comportamiento esperado | Tarea que la comprueba |
|---|---|---|
| Se perdió la respuesta de creación antes del traspaso y vuelve un APK antiguo | No recrear ni devolver una ficha privada del destinatario | 2 y 5 |
| El lote contiene una ficha pausada o falta su miniatura/objeto | Vista privada autorizada; aceptación total o ninguna, con error recuperable | 3, 5 y 7 |
| El gestor cambia entre la primera lectura del chat y adquirir el lock | No usar una pareja distinta de la bloqueada; refrescar y reconfirmar el destino | 6 |
| Suspensión/eliminación mientras se acepta o se sube una foto | Bloqueos compatibles; un único orden observable; no conceder a una cuenta no operativa | 4 y 5 |
| Sesión cambia con datos sensibles en pantalla o una respuesta tarda | Borrar estado privado y descartar respuesta/errores antiguos; no actuar con otra cuenta | 7, 8 y 9 |

## Archivos y dependencias

La estructura nueva se agrupa por función y reutiliza componentes/transportes actuales, sin reestructurar los archivos grandes existentes.

| Unidad | Archivos propuestos | Responsabilidad |
|---|---|---|
| Publicación asistida | src/assisted/types.ts, domain.ts, repository.ts, useAssistedListings.ts | Procedencia, validación privada y transporte con sesión capturada |
| Transferencias | src/transfers/types.ts, domain.ts, repository.ts, controller.ts, useListingTransfers.ts | Contratos, estados efectivos, recibos y sincronización |
| Pantallas | src/screens/AssistedListingsScreen.tsx, AssistedListingEditorScreen.tsx, ListingTransfersScreen.tsx, ListingTransferScreen.tsx; rutas correspondientes en src/app | Administración y revisión/decisión del destinatario |
| UI compartida | src/components/transfers/TransferOfferSheet.tsx y TransferRequestCard.tsx | Resumen y fichas seleccionadas, usando ui/theme actuales |
| Backend | Tres migraciones y suites propuestas, detalladas por tarea | Registro privado/medios; solicitudes/cuentas; contexto de chat/perfil |
| Storage privado de revisión | supabase/functions/listing-transfer-preview/index.ts | Validación de solicitud con JWT y firma de adjuntos de ficha pausada durante 300 segundos |
| Operación | scripts/verify-assisted-listings-transfer.mjs; scripts/verify-listing-transfer-concurrency.mjs; scripts/cleanup-retired-media.mjs | Ensayos con destino explícito, concurrencia y recuperación de objetos |
| Evidencia final | docs/assisted-listings-transfer-verification.md | Separar pruebas locales, SQL/servidor, UI y dispositivo |

Dependencias principales: 1 → 2 → 3 → 4 → 5 → 6. La tarea 7 usa los contratos 2–6; 8 depende de 7; 9 conecta 5–8 con la app; 10 verifica el conjunto; 11 activa el piloto solo después de 10. La operación manual de fase 0 no requiere activar transferencias.

## Fase 0. Preparación operativa, sin automatizaciones

### Tarea 1. Fijar base, límites y protocolo de operación

**Archivos:** leer AGENTS.md, package.json, package-lock.json, docs/import-listing-verification.md, docs/owner-administration-verification.md y el diseño; crear docs/assisted-listings-operation.md sin datos personales.

**Entregable:** checkout de ejecución identificado y protocolo aprobado; no publica material real como parte de esta tarea.

- [ ] Inspeccionar Git/worktrees/artefactos; elegir una sucesora de 734adcbc que conserve Administración y ahorro de datos. Reutilizar el checkout adecuado o crear aislamiento sin pisar cambios ajenos.
- [ ] Leer Expo v57 y registrar versiones instaladas, SHA y cambios locales relevantes. Confirmar que no hay una implementación posterior equivalente.
- [ ] Redactar protocolo: material directo, autoridad del colaborador sobre fotos/texto, permiso para difusión/corrección/atención de consultas, contacto privado, retirada y futura aceptación independiente.
- [ ] Acordar con el usuario responsable operativo, nombre público oficial y política de retención de la evidencia de permiso tras retirada. No almacenar material real hasta que esté resuelto este punto operativo.
- [ ] Registrar los mismos campos mínimos en un registro privado provisional si se inicia captación antes del nuevo cliente. Usar «Pegar anuncio» solo con material entregado; revisar fotos, precio USD, operación, período, permuta y disponibilidad.
- [ ] Revisar el protocolo contra los apartados 3 y 10 del diseño; guardar un commit documental acotado si se trabaja en una rama de implementación.

## Fase 1. Identidad de creación y material reutilizable

### Tarea 2. Registro privado y publicación asistida transaccional

**Crear:** supabase/migrations/20261005000100_assisted_listing_records.sql; supabase/tests/assisted_listing_records.sql; src/assisted/types.ts y domain.ts; tests/assisted-listings-domain.test.ts.

**Modificar dentro de la migración nueva:** última kh_save_property de 20261002000100_cover_thumb.sql; guardas necesarias de publicación asistida. No editar migraciones históricas aplicadas.

**Interfaces que produce:**

- AssistedCollaborator: id, kind owner/manager/agency, privateName, privateContact, contactChannel, accountId nullable, linkEvidenceReference, linkConfirmedAt, version, state active/withdrawn.
- AssistedProvenance: collaboratorId, collaboratorReference, sourceChannel, sourceReference nullable, receivedAt, consentText, consentVersion, consentAt, evidenceReference, lastConfirmedAt, confirmedPrice, confirmedAvailability y version del registro. Edición requiere expectedVersion. receivedAt/consentAt/lastConfirmedAt reflejan el evento aportado; el servidor registra aparte recordedAt/recordedBy y rechaza fechas futuras. No sustituir una evidencia antigua por la fecha de carga.
- kh_admin_save_assisted_collaborator(p_actor_id uuid, p_payload jsonb) → proyección privada versionada. Payload de alta/edición incluye clientRequestId UUID estable; la edición expectedVersion; vínculo accountId requiere evidencia de confirmación.
- kh_save_assisted_property(p_actor_id uuid, p_listing_payload jsonb, p_provenance_payload jsonb) → fila de anuncio con la forma actual de kh_save_property, sin agregar procedencia al resultado público.
- kh_admin_list_assisted_listings(p_actor_id uuid, p_collaborator_id uuid, p_offset integer default 0) → items y hasMore, con máximo 50 visibles y 51 para calcular continuidad.
- kh_get_listing_management(p_property_id uuid) → null si no visible; de lo contrario propertyId, managerId, assistedByKarmaHouse. No devuelve datos privados de colaboradores.

- [ ] Escribir casos SQL que fallen: no propietario, actor discordante, material sin autorización, destino falsamente vinculado, datos sensibles por lectura directa, intento de traspasar un anuncio ordinario, referencia repetida con carga distinta, guardar ficha sin guardar procedencia y viceversa.
- [ ] Agregar el caso de identidad: creación idempotente sin id devuelve la ficha; tras mover su gestión en fixture, replay devuelve KH_PROPERTY_MANAGEMENT_CHANGED, conserva una sola property y no expone datos privados.
- [ ] Crear tablas privadas de configuración, colaboradores, procedencia y property_publication_keys del diseño. Backfill de claves desde filas existentes, antes de habilitar transferencias. Desactivar mediante transfers_enabled=false.
- [ ] Sustituir unique(owner_id, client_request_id) por la reserva inmutable de creación. Mantener ediciones por id + expectedVersion. Usar reserva/advisory lock también para creación concurrente y mantener los recibos canónicos existentes.
- [ ] Implementar wrapper de publicación: autorización vigente para publicar, confirmación registrada y colaboración válida en la misma transacción del anuncio. Borrador puede estar incompleto, pero submit y guardas no lo hacen visible sin completar el registro. Alertas del propietario solo tras validación de esa transacción. Editar autorización/confirmación toma el lock de la ficha antes de procedencia y aumenta su versión privada; revocar el permiso también retira/pausa la ficha bajo moderación sin transferirla de vuelta.
- [ ] Permitir registrar procedencia sobre UUID existentes de la cuenta oficial producidos durante fase 0, con expectedVersion y autorización comprobada; negar fichas de otras cuentas y no recrear anuncios. Incluir prueba de mismo UUID/createdAt/favoritos tras incorporar ese registro.
- [ ] Implementar dominio de validación con límites explícitos: privateName 2–120; privateContact 1–200; referencias/notas 0–500; consentText 20–2000; collaboratorReference 1–100; campos de confirmación coherentes con operación actual. No HTML ni descarga de referencias; sourceReference/evidenceReference son texto privado, no instrucciones para importar.
- [ ] Ejecutar en BD desechable las pruebas nuevas con BEGIN/ROLLBACK; comprobar además fixtures de creación/edición/reintentos actuales. Node: node --experimental-strip-types --test tests/assisted-listings-domain.test.ts tests/remote-marketplace.test.ts. Esperado: sin duplicados, fuga de campos ni regresión de recibos.
- [ ] Commit sugerido: feat: record assisted listings and preserve publication identity. Transferencias siguen desactivadas.

### Tarea 3. Adjuntos por ficha y validación de fotos heredadas

**Continuar migración:** 20261005000100_assisted_listing_records.sql antes de su aplicación. **Crear:** supabase/tests/listing_media_assets.sql. **Modificar:** src/data/photoUpload.ts, supabaseMarketplace.ts y pruebas existentes de subidas en tests/remote-marketplace.test.ts. **Añadir:** tests/listing-media-assets.test.ts.

**Consume:** property_publication_keys y las filas actuales de properties. **Produce:** registro property_media_assets; helper privado validate_property_media(property_id nullable, actor_id uuid, request_id text, photo_paths text[], thumb_path text, moderation text, operation text) → void; mantiene los contratos públicos de guardar/submit/review.

**Cambio de cliente propuesto:** uploadDraftPhotos añade un argumento opcional final de contexto { propertyId: string; reusablePaths: readonly string[] }, derivado de current recibido del servidor. Sin ese argumento conserva el caso de alta actual. El contexto permite enviar adjuntos heredados de esa ficha; la RPC sigue siendo la autoridad.

- [ ] Escribir pruebas negativas de fotos/miniaturas de otra ficha, mismo request en otra cuenta, path conocido sin vínculo, objeto faltante, path retired y subida con upsert; probar mezcla de fotos originales y nuevas, mantener portada y cambiar portada.
- [ ] Hacer backfill de cada photo_paths y cover_thumb_path; detectar referencias duplicadas entre fichas, paths inválidos u objetos ausentes y detener la habilitación con inventario sanitizado. No arreglar ni borrar contenido real silenciosamente.
- [ ] Reemplazar la restricción properties_cover_thumb_path para validar forma, no prefijo mutable; la RPC y guardas de referencia verifican pertenencia y que la miniatura no sea una foto del array. No eliminar validación sin sustituirla.
- [ ] Incorporar validate_property_media a kh_save_property, kh_submit_property y la definición más reciente de kh_review_property, incluidos wanted sin fotografías y contratos de alquiler/permuta/superficie opcional.
- [ ] Sincronizar el registro y las referencias en la misma transacción: paths únicos por ficha, attached/retired, reserva irreversible para no reutilizar retired. Orden estable de locks por path, también en borrado. Subidas nuevas mantienen actor/request y seis fotos de máximo 4 MB.
- [ ] Cambiar kh_photo_read: público por ficha approved/active; gestor vigente para propia ficha no pública; administrador según contrato existente; prefijo de uploader solo para subidas aún no asignadas. Negar nuevos permisos por prefijo a adjuntos de otra ficha.
- [ ] Cambiar photo_delete_allowed: denegar todo objeto referenciado y todo adjunto reservado a limpieza; permitir al actor limpiar únicamente sus subidas no registradas/no referenciadas. Mantener UPDATE inexistente.
- [ ] Adaptar supabaseMarketplace/photoUpload para reuse autorizado de current.photos, preservando todos los checkpoints y paths nuevos. No aceptar URLs remotas como imágenes.
- [ ] Revisar src/data/rowSigner.ts y signedUrlCache.ts: conservar caché compartida de medios públicos; firmas de fichas propias no públicas usan contexto de sesión y se limpian al salir. No añadir medios privados a la caché global que hoy se conserva al cerrar sesión. Probar cambio de cuenta con ficha pausada y conservar ahorro de datos de fichas públicas.
- [ ] Ejecutar SQL media_assets, cover_thumb, cover_thumb_upgrade, operaciones/rent/optional_area y replay de guardado en BD desechable; Node: node --experimental-strip-types --test tests/listing-media-assets.test.ts tests/remote-marketplace.test.ts. Revisar RLS con anon, gestor antiguo, nuevo y tercero; no usar solo service_role.
- [ ] Commit sugerido: feat: authorize inherited listing photos by property. No activar transfers_enabled.

## Fase 2. Recuperación y aceptación de servidor

### Tarea 4. Estado de eliminación y limpieza recuperable

**Continuar migración 1:** media_cleanup_jobs, estado privado de eliminación y helper de retirada de adjuntos. **Crear:** scripts/cleanup-retired-media.mjs; tests/media-cleanup.test.ts; supabase/tests/listing_media_cleanup.sql. **Modificar mediante migración nueva:** kh_private.begin_account_deletion, kh_delete_account y políticas restrictivas de subida. **Revisar:** src/auth/deleteAccount.ts; mantener su regla de prefijo.

**Interfaces que produce:** media_cleanup_jobs por path, helpers privados para reservar limpieza y completar/reintentar; trabajador de operador con --dry-run por defecto y --commit explícito, destino/credenciales solo por entorno confiable. Nunca acepta lista de paths arbitrarios desde una app.

- [ ] Escribir pruebas: borrar cuenta receptora con fotos heredadas, limpieza fallida y repetida, objeto ya ausente, cuenta suspendida que necesita eliminarse, intento de subir/aceptar mientras se elimina, y objeto que sigue referenciado por una ficha viva.
- [ ] Añadir marcador de eliminación al primer paso bajo lock kh:account compatible con suspensión y aceptación; impedir publicar, aceptar, vincular o subir mientras está activo. Conservar eliminación de una cuenta propia suspendida; proteger el propietario antes de cualquier paso destructivo.
- [ ] Reservar limpieza de adjuntos antes de eliminar referencias/filas; las tareas sobreviven a cascade de anuncio/cuenta. Las fotos del prefijo actual siguen el contrato de borrado del cliente; las heredadas se limpian en servidor. No enviar prefijos oficiales a deleteAccount.ts.
- [ ] Implementar worker que revalida referencias, reserva retired → deleting y deja prohibida la reutilización antes de Storage API remove. Ante fallo, guardar intento/error sin secretos y permitir reintento. Not found es done. No usar DELETE SQL sobre storage.objects en producción.
- [ ] Comprobar metadata real de ownership de Storage antes de finalizar Auth: no asumir propiedad por path. En v1 no mover objetos heredados de la cuenta oficial protegida. No bloquear la eliminación del receptor por objetos heredados que no le pertenecen.
- [ ] Test unitario del worker con Storage falso que falla una vez; assert: tarea persiste, referenced nunca se borra, un reintento converge y no toca otro path. Probar también estado de eliminación con dos conexiones de BD.
- [ ] Verificar play_compliance y owner_administration en BD desechable; registrar que chat sin FK de property_id y reportes ya sobreviven al anuncio. No agregar FKs que vuelvan destructiva esa operación.
- [ ] Commit sugerido: feat: recover cleanup of inherited listing media.

### Tarea 5. Solicitudes y aceptación atómica

**Crear:** supabase/migrations/20261005000200_listing_management_transfers.sql; supabase/tests/listing_management_transfers.sql; scripts/verify-listing-transfer-concurrency.mjs; src/transfers/types.ts, domain.ts; tests/listing-transfers-domain.test.ts.

**Consume:** configuración, vinculación/procedencia, claves de creación, medios y bloqueo de cuenta/eliminación de tareas 2–4. **Produce:** RPC de solicitud/listado/detalle/decisión del diseño; eventos para historial; estados efectivos.

**Contratos cliente concretos:**

- TransferState = pending / accepted / rejected / cancelled / expired / invalidated.
- TransferItem = propertyId, expectedPropertyVersion, expectedProvenanceVersion, snapshot de Listing, sourceManagerId.
- TransferRequest = id, requestVersion, state, effectiveState, expiresAt, recipient { id, displayName, avatarUrlPath }, items, canAccept, canReject, canCancel, reasonCode nullable y resultPropertyVersions nullable. La versión de administración agrega datos privados por una proyección separada, no opcionales mezclados en el DTO del receptor.
- OfferTransferInput = clientRequestId UUID, collaboratorId UUID, expectedCollaboratorVersion integer, recipientId UUID, items { propertyId UUID, expectedVersion integer, expectedProvenanceVersion integer }[].
- DecideTransferInput = requestId UUID, expectedRequestVersion integer, clientRequestId UUID, decision accept/reject/cancel. Resultado: requestId, state, requestVersion y propertyVersions[]; terminales sin traslado devuelven array vacío.
- Errores de negocio: KH_TRANSFER_NOT_FOUND, KH_TRANSFER_INELIGIBLE, KH_TRANSFER_EXPIRED, KH_TRANSFER_STALE, KH_TRANSFER_RECIPIENT_CHANGED, KH_TRANSFER_DECISION_CONFLICT, KH_TRANSFER_MEDIA_MISSING, KH_PROPERTY_MANAGEMENT_CHANGED. No filtrar existencia de solicitudes ajenas.

- [ ] Escribir matriz SQL positiva/negativa: actor/JWT discordante, rol insuficiente, ID conocido de un tercero, anuncio ajeno/ordinario, cuenta oficial como receptora, vínculo cambiado, permisos retirados, lote mezclado, 0/21 fichas, versiones distintas, fecha vencida, ficha cerrada/rechazada y medio faltante.
- [ ] Crear request/items/eventos privados sin cascade que borre aceptación histórica. Un destinatario borrado deja vínculo nulo e invalida pendientes; un anuncio borrado conserva snapshots/eventos mínimos. Crear reserva única de pending por ficha.
- [ ] Implementar offer y lecturas con scope autorizado: siete días desde reloj de servidor; 1–20 del mismo colaborador; snapshots completos sin contactos/pruebas privadas para receptor. Al ofrecer materializar caducidad/obsolescencia y liberar reservas antiguas dentro de la transacción.
- [ ] Implementar accept con orden: cuenta operativa del receptor → colaborador → solicitud → propiedades ordenadas → registros de procedencia → paths ordenados. Oferta/vinculación/eliminación comparten ese orden; un cambio de vínculo toma las cuentas afectadas ordenadas antes del colaborador. Revalidar ambas versiones y reloj después de esperar. source_owner debe coincidir con la cuenta oficial configurada y con cada fila.
- [ ] Cambiar owner_id y version +1 en un commit; no alterar otro campo, roles, claves de creación ni arrays. Insertar recibo/evento e historial sanitizado. No llamar alert_on_approval ni mutar conversaciones/negociaciones bajo estos locks.
- [ ] Implementar reject/cancel y terminalización por plazo/obsolescencia de forma idempotente. ID repetido + otra carga = conflicto; lectura de accepted devuelve resultado aunque ya no haya fichas propias. No usar excepciones que reviertan el evento de invalidación que se pretende persistir: devolver resultado terminal para esos casos.
- [ ] Agregar eventos de transferencia a kh_admin_history con nombre/razón sanitizados y proyección solo operativa; mantener datos sensibles fuera del historial accesible a otros administradores.
- [ ] Ensayar doble aceptación, dos ofertas que compiten por una ficha, aceptación contra edición/moderación/pausa/revocación de permiso, cambio de vínculo a otra cuenta, vencimiento durante espera de lock, suspensión, eliminación y read/sign frente a cambio de gestor. Usar dos conexiones, barreras/locks reales y timeouts; no simular concurrencia ejecutando SQL secuencialmente.
- [ ] Assert global de cada ensayo: resultado completo o 0 cambios, un evento/recibo, incrementos únicos, enlaces/favoritos/fotos iguales, roles intactos y ninguna alerta nueva. Probar replay de creación antes/después con claves de tarea 2.
- [ ] Commit sugerido: feat: accept assisted listing management atomically. Mantener flag desactivado.

### Tarea 6. Contexto de chat, contacto nuevo y confianza

**Crear:** supabase/migrations/20261005000300_transfer_chat_context.sql; supabase/tests/transfer_chat_context.sql; tests/transfer-chat-context.test.ts.

**Modificar:** src/messaging/types.ts, domain.ts, repository.ts; src/negotiations/presentation.ts si hace falta una explicación de historial; src/screens/PublicProfileScreen.tsx. Modificaciones de SQL siempre en migración nueva.

**Interfaces que produce:** Conversation conserva campos actuales y agrega managementChanged boolean, currentManagerId UUID|null, currentManagerName string|null y currentContactAvailable boolean. Campos ausentes de un servidor antiguo se leen como false/null. propertyAvailable y canSend mantienen su semántica histórica para el chat antiguo.

Nueva RPC: kh_start_conversation_for_manager(p_property_id uuid, p_actor_id uuid, p_expected_manager_id uuid) → Conversation. kh_start_conversation(uuid,uuid) permanece como wrapper compatible del mismo algoritmo seguro, con expectativa opcional solo internamente.

- [ ] Escribir SQL: chat comprador–oficial antes/pendiente/aceptado; nuevo receptor intenta leer chat, mensajes, lecturas, negociación o reporte privado antiguo; mensajes con ACK perdido; bloqueos de pareja vieja/nueva; denuncias y cancelación de acuerdos por participantes originales.
- [ ] Extender chat_conversation_json con contexto autorizado. managementChanged se deriva de owner_id actual o evento histórico si se retiró la ficha; currentManager solo cuando esa ficha es visible para contacto. No revelar perfil/destino de una ficha privada a un antiguo comprador.
- [ ] Corregir inicio de conversación para comprobar gestor antes/después del lock de pareja/anuncio; si cambia, devolver KH_CHAT_MANAGER_CHANGED para refrescar. Verificar mismo límite de 20 conversaciones/día, autocontacto, bloqueos y unicidad actuales.
- [ ] Conservar RLS de participantes, seller_id, last_seq, cursores y unreadCount. No insertar mensajes de sistema para transferencias; no migrar propuestas ni avisos. Cuando enviar esté congelado, reintentos de mensajes ya confirmados siguen devolviendo ACK correcto.
- [ ] Conservar canAct false al cambiar responsable y reglas actuales que permiten cancelación histórica. Añadir texto de presentación «Este acuerdo pertenece a la conversación anterior»; no alterar estados aceptados ni cancelar automáticamente una visita acordada.
- [ ] Ajustar full_public_profile: activeListings sigue por owner_id actual; el componente approvedListingCount usado para puntuar confianza cuenta publicaciones originadas por esa cuenta y todavía gestionadas por ella, consultando property_publication_keys. No premiar publicaciones recibidas ni mover antigüedad, respuestas, visitas, verificación o reportes previos. Mantener wrapper identityOnly del propietario.
- [ ] Actualizar explicación pública de nivel para especificar anuncios propios publicados y aprobados. Prueba de perfil receptor: su lista incorpora la ficha, su verificación/antigüedad/respuestas/visitas no cambian y no gana puntuación por la publicación ajena.
- [ ] Verificar notifications/search_alerts/push resolver con antiguos destinos y sin nuevos eventos por traspaso. No modificar categorías message/visit/offer/alert.
- [ ] Ejecutar suites transfer_chat_context, messaging, negotiations, chat_negotiation_cards, trust_profile, notifications, search_alerts y owner_administration en BD desechable, con fixtures y rollback. Node: node --experimental-strip-types --test tests/transfer-chat-context.test.ts tests/messaging-repository.test.ts tests/messaging-domain.test.ts tests/trust-profile.test.ts.
- [ ] Commit sugerido: feat: explain manager changes without sharing chat history.

## Fase 3. Flujo administrativo y del destinatario

### Tarea 7. Transporte con sesión capturada y revisión privada

**Crear:** src/assisted/repository.ts, useAssistedListings.ts; src/transfers/repository.ts, controller.ts, useListingTransfers.ts; supabase/functions/listing-transfer-preview/index.ts; tests/listing-transfers-repository.test.ts, listing-transfers-controller.test.ts y transfer-preview.test.ts.

**Consume:** DTO/RPC de tareas 2,5,6 y MessagingRequestContext existente. **Produce:**

- ListingTransferRepository: list(scope, context), get(id, context), offer(input, context), decide(input, context); todas Promise con DTO validado y checkpoint antes/después. Parámetros de listado llevan offset y acumulan por ID; error/éxito de una sesión anterior se descarta.
- createListingTransferController(repository, storage, uuidGenerator): activate(context), refresh(), open(id), offer(input), decide(input), reset(). Guarda IDs de acciones pendientes por actor en almacenamiento privado; nunca persiste contactos/evidencias ni URLs privadas. Una respuesta incierta se reconcilia por requestId y la misma clientRequestId.
- Endpoint listing-transfer-preview: JWT del receptor + requestId → URLs/snapshot de los adjuntos del lote autorizado; firma por 300 segundos, sin conceder SELECT general de Storage al candidato. Responde solo a solicitudes pending efectivas y receptor exacto.

- [ ] Escribir pruebas de DTO corrupto, receptor distinto, repetición de páginas, token cambiado, error tardío, acción exitosa con respuesta perdida y doble toque. Assertions: una única petición lógica y ningún resultado se publica bajo otra sesión.
- [ ] Implementar repositorios como transportes de funciones, reutilizando patrones admin/request y MessagingRequestContext. Capturar Authorization y AbortSignal; el rol de cliente solo afecta UI, no autoridad.
- [ ] Implementar controller con busy por acción, ID estable antes de enviar y reconciliación de timeout. No escribir «aceptado» optimistamente. Vaciar snapshots al cambiar actor/cerrar sesión; no borrar borradores ajenos o toda AsyncStorage.
- [ ] Implementar endpoint con cliente JWT que consulta kh_get_listing_transfer y verifica sesión vigente; solo luego el cliente de servidor firma paths autorizados. Nunca aceptar URLs/paths de la petición ni una identidad declarada sin JWT. CORS y errores sin datos privados.
- [ ] Firmas de solicitudes pausadas van solo a memoria scoped de esa pantalla y nunca a signedUrlCache global. Cancelación puede dejar una URL emitida válida como máximo 300 segundos: registrar este límite y probar que no se emiten firmas nuevas después.
- [ ] Test del endpoint con Auth/RPC/Storage falsos; fixture HTTP real con actores sintéticos en entorno desechable antes de afirmar integración. Las credenciales del servidor nunca están en Expo ni bundle web.
- [ ] Node: node --experimental-strip-types --test tests/listing-transfers-repository.test.ts tests/listing-transfers-controller.test.ts tests/transfer-preview.test.ts. Esperado: scopes correctos, ninguna firma para tercero/vencida/obsoleta y retries convergentes.
- [ ] Commit sugerido: feat: review transfer requests with scoped sessions.

### Tarea 8. Administración y publicación asistida

**Crear:** src/screens/AssistedListingsScreen.tsx, AssistedListingEditorScreen.tsx; src/components/transfers/TransferOfferSheet.tsx; src/app/assisted-listings.tsx y assisted-listing-editor.tsx; scripts/assisted-listings-ui-fixture.mjs.

**Modificar:** src/screens/AdministrationScreen.tsx, AdminManagementScreen.tsx; src/admin/domain.ts para etiquetas sanitizadas de eventos; src/components/ListingForm.tsx solo si requiere un punto de extensión de guardado/vista previa. Reutilizar su importador y selector de fotos.

**Consume:** useAssistedListings y repository/controller anteriores. **Produce:** propietario prepara/vincula/publica y ofrece solicitudes sin cambiar cuentas ni roles desde el cliente.

- [ ] Preparar fixture de dos colaboradores, nombres iguales en cuentas diferentes, anuncio ordinario y fichas asistidas en cada estado. Ningún dato real ni secreto en fixture; en modo demo ocultar acciones de backend y explicar su disponibilidad.
- [ ] Añadir entrada para propietario y pantalla paginada privada. Usar PageTitle, Button, Notice, EmptyState, Pill y colores existentes; no meter contactos en la lista pública ni en el historial compartido.
- [ ] Implementar edición de colaborador y enlace por UUID de perfil aportado, con confirmación por canal conocido y control de version. Mostrar contacto solo al propietario; un admin ordinario ve moderación existente sin este acceso.
- [ ] Integrar ListingForm con wrapper asistido; mostrar preview/permiso/confirmación antes de publicar. Una validación fallida mantiene borrador y fotos locales; no publica primero para registrar procedencia después.
- [ ] Implementar selección 1–20 de un colaborador, motivos de inelegibilidad, destinatario vinculado y hoja de resumen con el texto del diseño. Emitir clientRequestId estable antes de enviar.
- [ ] Mostrar pendientes/resultados, cancelación y obsolescencia. Una modificación nunca actualiza silenciosamente snapshots de un lote ya enviado.
- [ ] Verificar visualmente a 390 px y 1280 px: formulario con teclado, textos largos, selección multi, estados/error/timeout, nombre duplicado, restricción de rol y cierre de sesión. Releer estado guardado cuando se use servidor de pruebas; fixture visual solo prueba UI.
- [ ] Commit sugerido: feat: prepare and offer assisted listings from administration.

### Tarea 9. Mi espacio, Mis anuncios, ficha y chat

**Crear:** src/screens/ListingTransfersScreen.tsx, ListingTransferScreen.tsx; src/components/transfers/TransferRequestCard.tsx; src/app/listing-transfers.tsx y listing-transfer/[id].tsx; tests/listing-management-refresh.test.ts.

**Modificar:** ProfileScreen.tsx, MyListingsScreen.tsx, DetailScreen.tsx, ConversationScreen.tsx, EditScreen.tsx; src/state/MarketplaceProvider.tsx y remoteMarketplaceStore.ts; src/catalog/useCatalog.ts y controller.ts; src/catalog/offlineSnapshot.ts si precisa invalidación específica; no cambiar su persistencia pública a datos privados.

**Consume:** controller de solicitud, contexto de chat y kh_get_listing_management. **Produce:** aceptación revisable y todas las superficies muestran el responsable vigente tras refrescar.

- [ ] Añadir acceso «Anuncios por aceptar · N» en Mi espacio/Mis anuncios sin contarlos como propios; detalle del lote y reglas completas de chats/moderación. Aceptar/rechazar con ID estable, confirmación de cuenta y comprobación posterior al timeout.
- [ ] Después de accepted, invalidar cargas iniciadas antes de la acción y refrescar ownListings, solicitud, fichas por ID, perfiles afectados y favoritos/catálogo visibles. Exponer invalidateListingManagement(propertyIds: readonly string[]) como evento local de generación, sin borrar datos públicos ajenos.
- [ ] Crear tests con promesas controladas: una carga vieja no repone ownerId antiguo; cuenta cambia mientras acepta; favoriteIds conserva contenido; ruta y createdAt son iguales; una respuesta de perfil anterior no aparece bajo la cuenta nueva.
- [ ] Refrescar gestión al enfocar/reanudar detalle y antes de iniciar chat; enviar expected_manager_id. Ante KH_CHAT_MANAGER_CHANGED, mostrar gestor nuevo y pedir el toque explícito sobre el CTA actualizado antes de crear contacto con alguien distinto.
- [ ] Mantener ahorro de datos y URLs públicas. Offline permite leer, pero aceptar/editar/contactar requiere servidor; no usar own cached para autoridad. EditScreen recibe permiso vigente/errores de traspaso y conserva borrador sin guardarlo bajo otro anuncio.
- [ ] Mostrar texto de asistencia y responsable del diseño en ficha. Chat antiguo presenta aviso y botón para abrir otro solo si currentContactAvailable; no repasar el historial ni copiar el composer. Denuncia, bloquear/desbloquear, lectura y eliminación de un mensaje propio pendiente conservan funcionamiento.
- [ ] Verificar RequestsScreen y tarjetas de ofertas/visitas: no parecen acuerdos con el nuevo gestor; acciones inhabilitadas salvo cancelaciones ya permitidas. Inbox/Notificaciones mantienen interlocutor original.
- [ ] Node: node --experimental-strip-types --test tests/listing-management-refresh.test.ts tests/catalog-controller.test.ts tests/messaging-controller.test.ts tests/negotiation-presentation.test.ts. Verificar UI integrada en 390/1280 px con fixture; luego E2E con tres cuentas sintéticas en servidor de prueba.
- [ ] Commit sugerido: feat: accept listing management and contact the current manager.

## Fase 4. Verificación y activación acotada

### Tarea 10. Verificar migraciones, concurrencia, integración y APK

**Crear:** scripts/verify-assisted-listings-transfer.mjs y docs/assisted-listings-transfer-verification.md. **Modificar:** suites existentes solo si sus expectativas han cambiado legítimamente, sin ocultar fallos anteriores.

**Consume:** tareas 2–9. **Produce:** evidencia para decidir activación. No activa por sí sola.

- [ ] Crear runner con destino explícito y protección contra usar producción por defecto; todas las suites SQL nuevas corren sobre BD desechable o pruebas sintéticas con rollback. El script de concurrencia limpia fixtures al terminar incluso si falla; verificar ausencia de residuos.
- [ ] Ejecutar nuevas suites y regresiones SQL de cloud_marketplace, cover_thumb/upgrade, owner_administration, operations, rent, optional_area, messaging, negotiations, chat_negotiation_cards, trust_profile, notifications y search_alerts. Diagnosticar el fallo histórico documentado de recuento global en cloud_marketplace contra una base sin el cambio; no contarlo como aprobado ni adaptar el test a ciegas.
- [ ] Ejecutar concurrencia real de tarea 5, incluyendo desaparición del objeto antes del accept, timeout tras commit y suspensión/eliminación. Comparar baseline/resultado: properties, favorites, mensajes, negociaciones, alertas, roles, objetos y cola, sin volcar contactos.
- [ ] Ejecutar npm run check por el cambio transversal de dominio/cliente y npm run export para comprobar rutas/bundles. Una sola pasada completa tras cerrar cambios; repetir solo lo afectado por errores/correcciones.
- [ ] Revisar permisos con REST autenticado de propietario, receptor y tercero, y anon: lectura de procedencia/tablas/eventos; seleccionar/firmar medios; preview privado; aceptar con otro actor; acceso directo a mensajes. SQL security-definer bajo rol privilegiado no sustituye estas pruebas.
- [ ] E2E servidor de prueba: oficial prepara/publica; comprador favorita y chatea; receptor acepta; misma ficha/fotos/favorito; comprador lee historial y abre nuevo chat; receptor edita con fotos heredadas/nuevas, pausa y envía a revisión; moderador retira/reactiva según contrato. Registrar resultados y limpiar cuentas/anuncios sintéticos.
- [ ] Prueba de privacidad del perfil: asistencia/aceptación no cambia verificaciones ni reputación histórica. Confirmar ausencia de contacto/autorización en respuesta pública, bundle y logs.
- [ ] Prueba de eliminación/limpieza con Storage real de prueba: fotos oficiales heredadas, nuevas propias y miniaturas; worker interrumpido y reintento; ningún objeto en uso borrado; historial de comprador–oficial sobreviviendo a retiro de la ficha y distinción de cascades por eliminación de participante.
- [ ] Compilar APK compatible según herramientas de release existentes. Revisar versión, firma y secretos; instalar conservando datos. En Android físico probar teclado/hojas, aceptar con pérdida/reconexión, background/foreground, apertura de la ficha desde enlace/favorito y edición con fotos heredadas y nuevas. No basta una build o instalación para afirmar estos recorridos.
- [ ] Verificar notificaciones ordinarias: consulta nueva notifica al receptor y la antigua conserva destino. Si no se hace recepción/tap reales en dispositivo, anotar límite físico pendiente y no declarar push probado. No crear notificaciones nuevas de traspaso.
- [ ] Documentar por separado: local/fixtures, SQL con rollback/concurrencia, REST/Storage real y dispositivo; SHA/base/versiones y resultados. Revisión específica de permisos, locks y recuperación antes del piloto.

### Tarea 11. Distribuir cliente y habilitar piloto

**Archivos:** documentación operativa/verificación; una herramienta privada de configuración controlada, por ejemplo scripts/configure-assisted-listings.mjs con --dry-run y --commit explícito. No dar flag de autoridad al cliente.

**Entregable:** piloto autorizado con transfers_enabled=true solo después de controles; no una carga masiva de catálogo.

- [ ] Preparar migraciones/endpoint/cliente como resultado revisable. Aplicación remota y distribución de APK siguen la autorización concreta de despliegue de esa etapa; aprobar este plan no implica por sí solo cambiar datos reales durante el análisis actual.
- [ ] Aplicar con flag false en entorno acordado y comprobar esquemas/privilegios y backfill reales sin modificar inventario comercial. Distribuir primero la app compatible al propietario y al primer colaborador voluntario.
- [ ] Confirmar registro de autorización, última disponibilidad y vínculo exacto del colaborador. El script configura official_publisher_id por UUID confirmado y exige que sea la cuenta propietaria protegida; nunca busca una cuenta por nombre.
- [ ] Habilitar transferencias solo tras evidencia de tarea 10 y un grupo pequeño disponible para comprobar el recorrido. El número de ofertas lo dicta la calidad/capacidad de atención, no una cuota.
- [ ] Comprobar primera aceptación voluntaria, consultas nuevas, edición/pausa/fotos y control de moderación. Ninguna prueba altera la sesión personal del usuario sin autorización para ese recorrido.
- [ ] Si falla, desactivar nuevas ofertas/aceptaciones; mantener lecturas de historial y la gestión ya aceptada. No revertir owner_id de lotes confirmados ni borrar fotos. Reparar con solicitud nueva/operación auditada según el diseño.
- [ ] Revisar pendientes/caducidades, última confirmación y cola de limpieza manualmente durante el piloto. Automatizar recordatorios/push solo en una propuesta posterior si hace falta.
- [ ] Cerrar con enlace/ruta de evidencia, versión distribuida, migraciones realmente aplicadas, resultado del piloto y límites pendientes. No afirmar despliegue, recepción física o funcionamiento de cuentas reales con evidencia de fixture.

## Migraciones propuestas y orden

| Orden | Nombre aún no creado/aplicado | Contenido |
|---|---|---|
| 1 | 20261005000100_assisted_listing_records.sql | Configuración/procedencia privada, identidad de creación, validación de adjuntos, RLS, retirada/limpieza y estado de eliminación; tareas 2–4 |
| 2 | 20261005000200_listing_management_transfers.sql | Solicitudes/items/eventos/recibos, reglas de estado, accept/reject/cancel, historial; tarea 5 |
| 3 | 20261005000300_transfer_chat_context.sql | Contexto y nuevo inicio de chat, compatibilidad de firma antigua, cálculo de confianza; tarea 6 |

No aplicar parcialmente la primera migración mientras se desarrolla: sus tareas se revisan y prueban como una unidad consistente, conservando el flag false. Las fechas/números se ajustan si otro trabajo usa esos nombres. Cada una debe comprobar prerequisitos y privilegios; no usar borrado de objetos o llamadas HTTP dentro de una transacción de aceptación.

## Matriz final de aceptación

| Requisito del diseño | Evidencia requerida | Tareas |
|---|---|---|
| Material autorizado, contacto privado y referencia única | SQL/RLS, REST de roles, UI de publicación y protocolo | 1,2,7,8,10 |
| Ficha/enlace/favoritos/material sin duplicación | Comparación baseline tras accept y reintentos de creación/decisión | 2,3,5,9,10 |
| Aceptación únicamente por receptor correcto | JWT/actor, vínculo, sesión, versiones, cuenta y flag | 4,5,7,10 |
| Lote atómico y errores recuperables | Dos conexiones, locks, red perdida, objeto faltante, replay | 3,4,5,7,10 |
| Historial privado sin transferir conductas/acuerdos | RLS/REST, chat viejo/nuevo, reportes/bloqueos/notificaciones | 6,9,10 |
| Fotos heredadas editables y limpieza fiable | RLS, upload/save/review, Storage API de prueba, worker interrumpido | 3,4,9,10 |
| Moderación y reputación conservadas | Roles, approved/pending, perfil, suspensión/reactivación | 5,6,10 |
| Ahorro de datos/clientes antiguos | Caché/rutas, omisiones/replay, snapshot offline y APK compatible | 2,3,6,9,10 |
| Activación controlada y sin reversión insegura | Flag privado, cliente distribuido, evidencia del piloto y runbook | 10,11 |

## Fuera de este plan y asuntos pendientes

No incluye scraping, permisos de portales, campañas externas, pago/comisión, alta masiva, calendario turístico, agency teams, reclaim público, migración de chats, push de traspasos o transferencia de plataforma. Las propuestas de comisión previas no cambian: promover, aportar comprador y cerrar son hechos distintos.

Los supuestos que se someten a aprobación están al final del diseño. Hay que confirmar operativamente identidad/nombre oficial, responsable de consultas y retención/texto de permiso antes de publicar material real. No se necesita pedir al usuario que vuelva a definir el objetivo ni una aprobación adicional para escribir este plan completo.

**Verificaciones realizadas al redactarlo:** inspección de Git/archivos y lectura de fuentes oficiales, contraste de contratos actuales y revisión documental. No se ejecutó ninguna tarea de implementación, suite de producto, migración, publicación, llamada a cuenta remota o prueba física.
