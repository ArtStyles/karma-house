# Publicación asistida y traspaso de gestión de anuncios

**Estado: aprobado para implementación el 5 de octubre de 2026. Activación remota pendiente.**

Regla prioritaria confirmada: solo la cuenta principal oficial identificada por la configuración protegida puede iniciar traspasos, solo de fichas que gestione. Otros administradores y miembros no pueden emitirlos ni transferirse anuncios entre sí. Los veinte anuncios son un máximo por lote; se admiten lotes posteriores sin límite total por colaborador. La aprobación cubre código y verificación, no publicar material real, aplicar migraciones a producción ni desplegar públicamente.

Este documento y el [plan de implementación](../plans/2026-10-05-assisted-listings-transfer.md) guían la implementación aprobada. La sección de investigación conserva la evidencia y límites del análisis original; los resultados de implementación se registrarán aparte.

## 1. Propuesta que se somete a revisión

KarmaHouse puede comenzar con viviendas reales aportadas directamente por unos pocos propietarios, gestores o agencias, con difusión inicial gratuita. La cuenta oficial prepara las fichas, confirma precio y disponibilidad y atiende el chat. El colaborador puede trabajar inicialmente sin cuenta. Cuando se registre, la administración identifica su cuenta, ofrece el traspaso y el colaborador lo acepta dentro de la app.

Recomiendo **cambiar el gestor de la misma ficha**, conservando su UUID, enlace, fecha de publicación, fotos y favoritos. La aceptación se resuelve en una sola transacción de servidor. Las fotografías se mantienen en sus rutas originales, pero sus permisos se vinculan al anuncio y a su gestor actual. Los mensajes anteriores siguen siendo privados para los participantes originales; el comprador puede abrir una conversación distinta con el nuevo gestor.

El mínimo entregable incluye registro privado de colaboradores y autorización, publicación asistida con el formulario existente, selección de anuncios por colaborador, solicitud y aceptación, permisos de imágenes, aviso de cambio de gestor, auditoría y limpieza recuperable. No incluye scraping, reclamación por teléfono/enlace, equipos de agencia, comisiones, pagos, traslado de mensajes privados ni nuevas categorías de push.

Un lote de 10–15 ofertas puede servir para aprender, pero no es una cuota ni una garantía de comunidad. Conviene priorizar material completo, vigente y autorizado, y capacidad real de responder a las consultas.

## 2. Base y límites de la investigación

| Elemento | Evidencia de esta revisión |
|---|---|
| Worktree de documentos | C:/Users/ACER NITRO/.codex/worktrees/d9a9/karma-house, HEAD separado 0dcb94b93d5b8120981da6a83307accbc3956476; inicialmente limpio |
| Base funcional analizada | D:/work/karma-house, rama codex/data-saver-resume, HEAD 734adcbc0a150dbbc61e34cb850697cf965f05b8 |
| Desfase | El HEAD del worktree es antecesor de la base funcional; faltan 23 commits alcanzables, incluidos c5bbe23 y 6f28320 sobre propietario/Administración, y cambios de ahorro de datos |
| Referencia remota local | origin/main resuelve a cab71fedf264e9e2d8c356faf102d3ca9b889129; no se hizo fetch ni se comprobó el remoto actual |
| Trabajo ajeno en el checkout principal | Hay cambios locales de web, configuración de Claude, .gitignore y tsconfig.json. No hay cambios locales en src, supabase, package.json, package-lock.json o docs. No se tocaron esos cambios |
| Versiones | Base funcional: app 0.1.15; node_modules consultado: Expo 57.0.23, React 19.2.3, React Native 0.86.3 y Expo Router 57.0.21. Worktree: package.json 0.1.11 y Expo ~57.0.23; su lock contiene 57.0.23; no se instaló node_modules allí |
| Expo | Se leyó la [documentación exacta de SDK 57](https://docs.expo.dev/versions/v57.0.0/) antes de preparar los contratos del plan. Coincide con la familia instalada; no se propone actualizar Expo |
| Alcance de comprobación | Git, archivos, contratos SQL/cliente y documentación oficial. Sin acceso a datos remotos, suites ejecutadas, simulador, navegador de la app ni dispositivo en este encargo |

Las referencias de código siguientes corresponden a **734adcbc**, no necesariamente a los archivos del worktree antiguo. Antes de implementar hay que partir de esa base o de una sucesora que conserve estos contratos. Las verificaciones fechadas de docs son evidencia histórica, no pruebas nuevas realizadas hoy.

## 3. Captación y funcionamiento inicial

1. Elegir colaboradores con material propio o material que puedan autorizar. Recibir texto y fotos originales directamente, y un contacto privado para coordinar.
2. Acordar por escrito qué oferta se publica, uso de texto/fotos, correcciones de formato, difusión gratuita, atención inicial mediante KarmaHouse y cómo retirar o actualizar el anuncio. La posible gestión futura por su cuenta requiere aceptación independiente.
3. Confirmar operación, precio en USD, período del alquiler, disponibilidad y datos que no pueda inferir el parser. Evitar documentos de identidad, escrituras o direcciones exactas como requisitos de este MVP.
4. Crear la ficha desde Administración → Publicación asistida usando ListingForm y «Pegar anuncio». Revisar título, texto, mapa aproximado y fotos; eliminar datos de contacto también de fotos/marcas visibles antes de publicar.
5. Atender las consultas dentro del chat oficial. Trasladar manualmente una pregunta resumida al colaborador, minimizando datos personales. Si se necesita compartir teléfono, nombre u otro dato del interesado, obtener su permiso específico; la autorización del anunciante no autoriza divulgar datos del comprador.
6. Pedir actualización cuando cambie el precio o la disponibilidad, y pausar una oferta que el colaborador retire. Mostrar a la administración la última confirmación y avisar si lleva más de siete días sin actualizar; no crear una garantía de disponibilidad ni una renovación automática.
7. Cuando el colaborador tenga cuenta, confirmar por el canal previamente registrado que esa cuenta le corresponde; vincular su UUID de Auth y emitir la solicitud.

El permiso sobre el material no acredita titularidad legal de la vivienda. «Asistido por KarmaHouse» describe un servicio de publicación; no equivale a «propietario verificado» ni «vivienda verificada».

Si la operación manual de fase 0 ya produjo fichas, la administración registra su procedencia sobre esos mismos UUID al incorporar el nuevo flujo. Solo puede hacerlo con anuncios de la cuenta oficial y la evidencia correspondiente; no los vuelve a publicar ni supone que un texto importado acredita permiso.

Las [condiciones oficiales de Revolico](https://help.revolico.com/es/articles/7263759-condiciones-de-uso) exigen autorización escrita del portal para republicar sus contenidos y autorización previa para copiar material de terceros. [Meta explica que la extracción automatizada sin permiso vulnera sus políticas](https://about.fb.com/ltam/news/2021/04/como-combatimos-el-scraping/). La propuesta usa originales entregados directamente y autorización registrada; no obtiene contenido del portal, no automatiza mensajes y no promete una validez legal universal del consentimiento.

## 4. Mapa de impacto del producto actual

| Área | Contrato observado y archivos | Consecuencia para el diseño |
|---|---|---|
| Autoridad del anuncio | supabase/migrations/20260917000100_cloud_marketplace.sql:34–81; properties.owner_id, unique(owner_id, client_request_id), version y recibos privados | owner_id es el gestor técnico actual, no prueba de propiedad inmobiliaria. Un cambio directo es insuficiente; hay que proteger también la identidad original de creación |
| Creación y edición | src/data/propertyPayload.ts; src/data/supabaseMarketplace.ts:18,60,90; última definición de kh_save_property en 20261002000100_cover_thumb.sql | Mis anuncios filtra por owner_id. El servidor valida actor, UUID, petición y versión. Mantener esos contratos y el tratamiento de omisiones de clientes antiguos |
| Material y fotos | src/data/photoUpload.ts:5,36,71; validate_photos en 20260917000100_cloud_marketplace.sql:165 | Cliente y servidor exigen rutas del usuario actual y client_request_id. Deben admitir únicamente adjuntos heredados de esa ficha, nunca cualquier ruta conocida |
| Miniatura | 20261002000100_cover_thumb.sql:4,226,262,275; cover_thumb_path y Storage RLS | La restricción de prefijo depende de owner_id. Hay que sustituirla de forma controlada, cubrir miniaturas en lectura/borrado y conservar el fallback de portada |
| Referencias persistentes | favorites usa property_id; rutas src/app/property/[id].tsx; catálogo/mapa y búsquedas por UUID | Conservar UUID, created_at, operación, fotos y favoritos. No borrar/republicar ni mover la ficha al inicio del catálogo |
| Cuenta oficial y moderación | 20261003000100_owner_administration.sql:28–104,163–218; src/auth/AuthProvider.tsx; AdministrationScreen.tsx | El propietario de la plataforma publica directamente y puede suspender. El destinatario recibe gestión de anuncios, nunca este rol. Tras aceptar, sus cambios siguen la moderación ordinaria |
| Inicio y envío de chat | 20260918000100_messaging.sql:103–145,188–218 | seller_id se fija al crear; los envíos requieren coincidencia con owner_id actual. Ya se congela el envío antiguo tras el cambio, pero falta explicar la causa y ofrecer el nuevo contacto |
| Privacidad e historial | misma migración:2–45,82–92,220–265 | Conversaciones y mensajes se leen solo por participantes. property_id del chat no tiene FK al anuncio y sobrevive a su eliminación. No cambiar participantes ni abrir lectura al nuevo gestor |
| Negociaciones | 20260920000300_negotiations.sql:66–88,174–221; 20260924000100_chat_negotiation_cards.sql | Ofertas/visitas antiguas no pasan al nuevo gestor. CanAct exige gestor vigente. La cancelación permitida a participantes originales debe conservarse, incluso si el anuncio ya no está disponible |
| Bloqueos y denuncias | kh_user_blocks, kh_message_reports; 20260923000100_play_compliance.sql:4–97 | Bloqueos pertenecen a parejas de cuentas. Reportes conservan actor denunciado y evidencia original; no atribuir una conducta pasada al nuevo gestor |
| Notificaciones y alertas | 20260920000400_notifications.sql; 20260928000100_search_alerts.sql:151–180,272–294,336–390; src/push/repository.ts:43 | Destinos y destinatarios antiguos permanecen. Un traspaso no es «Nueva vivienda» ni un mensaje. No reutilizar categorías existentes para avisos de solicitud |
| Perfil de confianza | 20261001000100_trust_profile.sql:16–48,88–143; wrapper de 20261003000100_owner_administration.sql:229; src/profiles/domain.ts:47 | Nuevas fichas gestionadas aparecerán en el perfil destinatario. El cálculo actual puntúa anuncios por owner_id: hay que excluir los recibidos del componente de publicaciones propias; no trasladar antigüedad, respuestas, visitas, verificación ni reportes |
| Estado y caché | remoteMarketplaceStore.ts:33–158; catalog/useCatalog.ts:96–129; catalog/offlineSnapshot.ts; data/signedUrlCache.ts:4 | Refrescar propiedad, perfiles y listas tras aceptar. El snapshot puede durar siete días; nunca decidir gestión, destinatario o permiso de escritura desde datos offline |
| Eliminación | 20260923000100_play_compliance.sql:100–125; wrapper propietario en 20261003000100_owner_administration.sql:136–146; src/auth/deleteAccount.ts:19–29 | El cliente solo borra archivos bajo su propio prefijo. Las fotos heredadas necesitan una cola privada de limpieza de servidor; no ampliar ese cliente para aceptar rutas ajenas |
| UI existente | ProfileScreen.tsx:35,67,135; MyListingsScreen.tsx; AdminManagementScreen.tsx; EditScreen.tsx; ConversationScreen.tsx:168–183 | Extender Administración y Mi espacio con pantallas del mismo lenguaje visual. Editar requiere gestión vigente. El chat debe distinguir vivienda retirada de cambio de responsable |

La búsqueda de transfer/claim/reassign/traspas/reasign/delegat y la revisión de RPC de anuncios no encontró un traspaso equivalente. AccountSettingsScreen menciona la titularidad de KarmaHouse, un proceso diferente sin pantalla de transferencia. Las operaciones vigentes son venta, permuta, búsqueda y alquiler mensual/nocturno; el importador rellena conservadoramente, retira contactos reconocidos y añade fotos aparte. Sus limitaciones se mantienen: precio USD, completar la diferencia de permuta y revisión humana. Véanse docs/import-listing-verification.md y docs/superpowers/specs/2026-09-30-import-listing-design.md.

## 5. Decisiones de arquitectura

### Gestión: cambiar owner_id con aceptación

| Alternativa | Resultado | Decisión |
|---|---|---|
| Cambiar gestor de la misma ficha | Mis anuncios, edición y futuras consultas siguen los contratos existentes; exige adaptar fotos, identidad de creación y contexto de chat | Recomendada |
| Mantener owner_id oficial y añadir delegación permanente | Hay que crear dos autoridades en casi todas las RPC, RLS, listados, perfiles, suspensión y chat; abre cuestiones de permisos de equipo | Posponer hasta que exista una necesidad real de agencias con varios gestores |
| Copiar/republicar | Duplica catálogo, rompe favoritos/enlaces e historial y puede repetir alertas | Descartada |

El MVP permite únicamente **cuenta oficial configurada → cuenta del colaborador vinculado**. Inicialmente, el propietario de KarmaHouse inicia/cancela traspasos y accede al contacto/autorización; otros administradores conservan moderación y resúmenes sanitizados del historial. Esto reduce exposición de contactos y respeta el modelo de roles existente. No se permiten traspasos de anuncios ajenos por ser administrador.

La cuenta publicadora oficial se configura por UUID en una tabla privada, sin deducirla de correo o nombre. Inicialmente debe ser la cuenta propietaria protegida ya existente. Su condición de propietario de la plataforma nunca viaja con el anuncio. Cambiar esa configuración o convertirla en una cuenta no protegida requiere revisar la conservación de Storage y la titularidad de plataforma; no forma parte de este cambio.

### Imágenes: conservar rutas y vincular permisos al anuncio

Mover/copiar objetos a la carpeta del destinatario permitiría mantener algunos prefijos, pero agrega operaciones Storage fuera de la transacción SQL, ancho de banda, duplicados, nuevos enlaces firmados y recuperación por cada foto/miniatura. Un fallo parcial no puede confundirse con una aceptación completa.

Recomiendo un registro privado de adjuntos por property_id. Se mantienen photo_paths, cover_thumb_path y los objetos originales. La aceptación cambia únicamente la gestión; no llama a Storage ni descarga imágenes. Las nuevas fotos del destinatario se suben bajo su propio prefijo, con upsert=false, y se adjuntan mediante la RPC validada. La misma ficha puede contener rutas originales y nuevas.

Reglas imprescindibles:

- Backfill solo desde referencias reales de propiedades existentes; nunca conceder una carpeta completa.
- Un path queda reservado a una única ficha. Un nombre conocido, un enlace firmado o el mismo client_request_id no permiten reutilizarlo en otra.
- El servidor admite una foto heredada solo si está registrada en esa ficha. Una foto nueva debe existir y pertenecer al actor y al request de esa ficha; ambos casos requieren bloqueo de path y validación de formato.
- Cambiar la portada conserva la miniatura solo si corresponde a esa portada; quitarla la desadjunta. Se conservan máximos actuales: seis fotos, 4 MB y JPEG/PNG/WebP.
- El cliente puede reutilizar paths de la ficha actual recibida del servidor, pero su lista no es una credencial: SQL comprueba pertenencia y versión.
- Lectura: público para adjuntos de fichas aprobadas/activas; gestor actual para su ficha aunque esté pausada; administración según sus permisos existentes. El prefijo original por sí solo no concede lectura de adjuntos ya reasignados a un usuario ordinario.
- No se habilita UPDATE/upsert de objetos. Ni el nuevo gestor ni el publicador anterior pueden borrar un path todavía referenciado. Al desadjuntarlo, queda retirado de reutilización y se crea una tarea privada de limpieza.

El bucket sigue privado. [Supabase Storage controla estas operaciones mediante RLS](https://supabase.com/docs/guides/storage/security/access-control); no basta con alterar la propiedad de la fila del anuncio.

## 6. Datos privados mínimos y contratos

Nombres propuestos, sujetos a comprobar colisiones al implementar. Todas estas tablas viven en kh_private, con RLS y sin privilegios directos de anon/authenticated. Solo RPC específicas producen proyecciones autorizadas. No se guardan contactos reales ni pruebas de consentimiento en Git, logs de pruebas o metadatos públicos.

| Entidad propuesta | Datos y restricciones |
|---|---|
| assisted_listing_settings | singleton; official_publisher_id; transfers_enabled inicialmente false; escrituras solo servidor confiable; publicación/transferencia verifican la cuenta configurada |
| assisted_collaborators | UUID; tipo owner/manager/agency; nombre privado; canal y contacto privados; account_id nullable; link_confirmed_by/at y referencia privada de confirmación; version y estado active/withdrawn. Cambiar vínculo invalida solicitudes anteriores |
| assisted_listing_records | property_id único; collaborator_id; version del registro; referencia externa del colaborador para detectar duplicados; canal/origen del material; source_reference opcional; received_at; consent_text/version, consent_at, recorded_by, evidence_reference privada; alcance autorizado; consent_revoked_at; last_confirmed_at/by; precio/estado confirmados y notas cortas. No copiar conversaciones externas completas |
| property_publication_keys | property_id; immutable origin_actor_id y client_request_id; unique(origin_actor_id, client_request_id); created_at. Backfill del publicador actual antes de cualquier traspaso. La creación conserva esta identidad aunque owner_id cambie |
| property_media_assets | path único; property_id; kind photo/cover_thumb; uploader_id informativo; state attached/retired/deleting/deleted; created_at/retired_at. Solo RPC registra o retira; el prefijo no determina el gestor actual |
| media_cleanup_jobs | path único; state pending/processing/done; attempts, next_attempt_at, last_error sanitizado; motivo. Independiente de FK con cascade de propiedades/cuentas, para sobrevivir a su eliminación |
| listing_transfer_requests | UUID; collaborator_id y versión del vínculo; source_owner_id; recipient_id nullable al borrar cuenta; request_version; estado pending/accepted/rejected/cancelled/expired/invalidated; created_by/at; expires_at; decided_by/at; reason_code; receipt de idempotencia privado |
| listing_transfer_items | request_id + property_id; expected_property_version y expected_provenance_version; snapshot revisable de contenido publicado, paths y estado; gestor original. Una ficha solo puede pertenecer a una solicitud pendiente vigente |
| listing_transfer_events | secuencia/UUID; request_id; evento; actor_id nullable y rol al actuar; IDs de fichas, anterior/nuevo gestor, versiones y fecha; motivo sanitizado. Retención independiente de la vida del anuncio; no registrar cuerpos de chat ni contactos |

Las solicitudes aceptadas conservan el resultado y eventos aunque una cuenta o anuncio se elimine. Los vínculos de cuentas eliminadas quedan nulos y las peticiones pendientes se invalidan antes del borrado; IDs mínimos del evento pueden conservarse como evidencia administrativa, sin copiar perfiles. Al eliminar una ficha, borrar el material privado operacional cuando ya no sea necesario y conservar solo el evento mínimo. La duración de la evidencia de consentimiento tras retirada necesita una política de privacidad acordada antes de usar datos reales; no se propone retención indefinida automática.

Para evitar duplicados, la publicación asistida reserva la referencia por colaborador y la clave de petición. La misma referencia devuelve la ficha existente; un reintento con otra carga devuelve conflicto. No se usa la dirección o el teléfono como clave global de vivienda ni se fusionan automáticamente ofertas de gestores diferentes. Sin referencia externa, la administración debe confirmar que no está creando una ficha existente.

### RPC propuestas

Todas verifican auth.uid() = p_actor_id, existencia actual de cuenta, permiso/estado en servidor, límites de carga y sesión capturada. Las mutaciones sensibles verifican además que la sesión de Auth del JWT siga vigente. Ninguna acepta un owner_id arbitrario como autoridad. Funciones security definer con search_path vacío, nombres calificados, revoke explícito y grants mínimos.

- kh_admin_save_assisted_collaborator(actor, payload): alta/edición versionada e idempotente; enlace manual de cuenta con evidencia de confirmación.
- kh_save_assisted_property(actor, listing_payload, provenance_payload): wrapper de kh_save_property; guarda ficha y procedencia en una transacción, incluida la validación de autorización antes de hacer visible el anuncio.
- kh_admin_list_assisted_listings(actor, collaborator_id, offset): selección paginada, estado, versiones y última confirmación; contactos solo para el propietario.
- kh_offer_listing_transfer(actor, client_request_id, collaborator_id, expected_collaborator_version, recipient_id, items): emite una solicitud para 1–20 fichas del mismo colaborador.
- kh_list_listing_transfers(actor, scope, offset): scope incoming para destinatario y administration para propietario; proyecciones diferentes. Lectura calcula caducidad/obsolescencia sin adquirir permisos de escritura.
- kh_get_listing_transfer(actor, request_id): lote y snapshot revisable, resultado/capacidades efectivos; no expone contactos ni pruebas privadas al destinatario.
- kh_decide_listing_transfer(actor, request_id, expected_request_version, client_request_id, decision): aceptar/rechazar por destinatario; cancelar por propietario; respuesta terminal idempotente o conflicto explícito.
- kh_get_listing_management(property_id): proyección de ficha visible con gestor actual y assistedByKarmaHouse. Sin contacto, colaborador privado, solicitud, origen, UUID del publicador original ni prueba de autorización. La identidad actual ya es pública en properties.owner_id.
- kh_start_conversation_for_manager(property_id, actor, expected_manager_id): nuevo inicio con comprobación del gestor mostrado al usuario; la firma histórica de kh_start_conversation se conserva para clientes anteriores.

No se añaden columnas privadas a PROPERTY_COLUMNS ni al JSON público de catálogo/mapa. La etiqueta de asistencia se obtiene mediante la proyección dedicada en detalle; el catálogo no necesita etiquetas nuevas en el MVP.

## 7. Estados y aceptación fiable

Se recomienda un plazo de **siete días**, medido por reloj de servidor, y **hasta veinte anuncios por solicitud** por límite transaccional, no por política comercial. Cada lote pertenece a un solo colaborador/cuenta. Se acepta completo; para asumir solo algunos, se rechaza y la administración ofrece un lote nuevo. No se modifica silenciosamente un lote ya ofrecido.

| Estado efectivo | Quién actúa | Efecto |
|---|---|---|
| pending | destinatario acepta/rechaza; propietario cancela | Oficial conserva edición y recibe consultas; destinatario solo revisa |
| accepted | nadie vuelve a decidir | Se conserva recibo; destinatario gestiona; repetir la misma aceptación devuelve el mismo resultado |
| rejected / cancelled | terminal | No cambian fichas, fotos ni destinatarios de chat |
| expired | terminal al comprobarse | Transcurrido el plazo, aceptar está prohibido aunque la tarea de mantenimiento no haya escrito el evento |
| invalidated | terminal al comprobarse | Alguna versión, vínculo, autorización, cuenta o elegibilidad cambió; ofrecer un lote nuevo tras revisión |

La primera versión admite fichas asistidas aprobadas, activas o pausadas. Rechazadas, borradores, pendientes de moderación, cerradas o cuentas suspendidas/eliminándose no son elegibles. Se verifica al ofrecer y de nuevo al aceptar. La pausa se conserva: aceptar no reactiva ni aprueba contenido.

Cualquier edición, cambio de estado o moderación que aumente version mientras está pendiente vuelve obsoleto el lote completo. También lo hace una versión nueva del registro privado de autorización/confirmación. KarmaHouse puede seguir trabajando: no se congela la ficha siete días. El destinatario ve «Estos anuncios cambiaron. KarmaHouse debe enviarte una nueva solicitud» y no acepta una versión distinta de la revisada. Un vínculo cambiado, consentimiento retirado o eliminación también invalidan.

Lecturas devuelven estado efectivo expired/invalidated sin efectos secundarios. Una mutación de decisión/mantenimiento lo persiste, crea un solo evento y libera la reserva. Al ofrecer otra solicitud, la misma transacción materializa y libera cualquier reserva vencida/obsoleta de las fichas elegidas. No hace falta un cron nuevo para que el límite sea seguro.

### Transacción de aceptación

1. Capturar actor, sesión e ID estable de la decisión. Obtener bloqueo de cuenta del destinatario, compatible con suspensión y eliminación. En v1 el publicador oficial es el propietario protegido; no tiene otro bloqueo de suspensión.
2. Bloquear el colaborador y luego la solicitud; comprobar actor destinatario exacto y recibo. Un ID repetido con distinta carga es conflicto. Una aceptación ya confirmada devuelve su recibo, sin volver a cambiar versiones ni permisos.
3. Bloquear fichas por UUID ordenado y sus registros de procedencia. Comprobar versiones de ficha y procedencia, gestor oficial, mismo colaborador, vínculo, consentimiento, estado de cuentas, vigencia y habilitación. Recalcular el reloj después de esperar los locks.
4. Bloquear los paths adjuntos en orden estable y comprobar registro/objetos de fotos y miniatura. Si falta un objeto, rechazar la aceptación completa con motivo recuperable: reparar el material y volver a ofrecer la versión corregida. No fabricar ni sustituir una foto en silencio.
5. Cambiar owner_id de todas las fichas y version +1, manteniendo created_at, client_request_id, contenido, moderación, disponibilidad, fotos y favoritos. Los permisos de adjuntos se resuelven a través del gestor actual dentro de esa misma transacción.
6. Grabar estado accepted, recibo e historial administrativo. Evitar invocar alert_on_approval: el lote no es una nueva publicación. Commit único; un fallo revierte el lote entero.
7. El cliente recibe IDs/versiones actuales y refresca. Si se pierde la respuesta, consulta la misma solicitud o repite el mismo ID de decisión; nunca interpreta un timeout como rechazo ni genera otro lote.

No se modifican conversaciones/negociaciones/notificaciones dentro de esta transacción: evita invertir el orden de locks de chat, que hoy es actor → pareja → conversación → anuncio. Sus capacidades se derivan del gestor vigente al leer. Oferta, vinculación, eliminación y decisión comparten el orden cuenta destinataria → colaborador → solicitud → fichas → procedencia → paths; al cambiar de cuenta vinculada se bloquean las cuentas afectadas por UUID ordenado antes del colaborador. Editar procedencia toma antes el lock de su ficha. Las RPC de decisión no se llaman desde triggers de edición de properties; eso evita un ciclo anuncio → solicitud frente a solicitud → anuncio. La invalidez se deriva de versiones.

kh_start_conversation debe comprobar de nuevo la pareja después de adquirir el lock del anuncio: actualmente lee un gestor antes del lock de pareja y vuelve a leer después. Si cambió, se devuelve KH_CHAT_MANAGER_CHANGED y se reintenta desde el estado actualizado, sin crear una conversación bajo un lock de pareja equivocado. Un mensaje enviado concurrentemente antes del commit queda en el chat antiguo; después del commit se rechaza. Sus ACK existentes continúan siendo idempotentes.

### Identidad de creación y clientes antiguos

La unicidad actual owner_id + client_request_id cambia de significado si se mueve owner_id: un reintento antiguo de creación sin id podría volver a insertar. Antes de activar traspasos se sustituye por property_publication_keys, reservada por el publicador original. kh_save_property sin id busca esa reserva, no la propiedad actual. Si la ficha ya no le pertenece, devuelve KH_PROPERTY_MANAGEMENT_CHANGED y no devuelve contenido privado ni inserta otra.

La edición siempre usa id y expectedVersion; tras traspasar se invalida el recibo de edición por el aumento de versión. Si llega un borrador antiguo del publicador, no se guarda. El destinatario edita por UUID aunque client_request_id proceda de la cuenta oficial. Las peticiones nuevas de otras cuentas con el mismo texto de request no chocan entre sí.

Las firmas históricas de guardar, cambiar estado, enviar a revisión y revisar continúan. El backend valida fotos heredadas en todas ellas. Los APK antiguos del destinatario pueden rechazar fotos por su prefijo en el cliente; la solicitud indica que debe actualizar la app para aceptar/editar. La versión con traspasos debe distribuirse antes de activar transfers_enabled. No se afirma compatibilidad funcional completa con APK muy anteriores: docs/import-listing-verification.md ya documenta problemas de clientes 0.1.8 o previos con superficie opcional.

En el perfil, activeListings sigue mostrando las fichas gestionadas actualmente. El componente approvedListingCount que puntúa confianza se calcula solo con fichas publicadas originalmente por esa cuenta y todavía gestionadas por ella, usando la identidad inmutable de creación. El texto de nivel explica esa distinción. Recibir una ficha no hereda los puntos de su publicación original; respuestas y visitas futuras pueden contribuir por actividad real de esa cuenta.

## 8. Interfaz propuesta

Mantener componentes de ui, colores, tarjetas, hojas, estados vacíos y navegación de Expo Router actuales. El término público es «responsable» o «gestor del anuncio», no «nuevo propietario de la vivienda».

### Administración

- Nueva entrada «Publicación asistida» en Administración para el propietario: lista por colaborador, búsqueda, filtros de estado y última confirmación. Detalle privado con material/permiso, contacto y cuenta vinculada.
- «Preparar anuncio» reutiliza ListingForm e importador. Se guarda procedencia con el borrador; no se publica hasta completar autorización y confirmación. La vista previa muestra quién atiende el chat.
- Selección visible de una o varias fichas elegibles; contador y motivo de exclusión por ficha. El destino es la cuenta vinculada, con nombre y avatar públicos y referencia privada de la comprobación. El nombre de pantalla no basta para vincularla: resolver UUID mediante identificador de perfil aportado por el colaborador y confirmar por el canal conocido.
- Hoja de resumen: fotos/títulos, estados actuales, cuenta destinataria, caducidad y «KarmaHouse seguirá gestionando estos anuncios hasta que [nombre] acepte». Acción «Enviar solicitud».
- Pendientes: «Esperando aceptación», «Cancelar solicitud» y resultado de errores por versión. Historial usa eventos sanitizados; no replica teléfonos ni pruebas de consentimiento en la pantalla compartida con otros administradores.
- Solicitud aceptada: mismas fichas, «Gestiona [nombre] desde [fecha]». La administración conserva retirar/moderar/reportes, sin presentarse como editor del destinatario.

### Mi espacio y Mis anuncios

- Mostrar «Anuncios por aceptar · N» solo cuando haya solicitudes efectivas, con acceso también desde Mis anuncios. N cuenta solicitudes, no viviendas ya propias.
- Detalle del lote: «KarmaHouse te ofrece gestionar estos anuncios», fichas completas, disponibilidad actual y aviso «Al aceptar podrás editar y recibir nuevas consultas. Las conversaciones anteriores seguirán con sus participantes originales».
- Para fichas pausadas, la revisión se sirve por RPC y un endpoint de servidor que firma exclusivamente sus adjuntos durante 300 segundos. No se amplía SELECT general de properties ni Storage a destinatarios pendientes; no se usa la caché pública de siete días para estas vistas privadas.
- Acciones «Aceptar gestión» y «Rechazar». Confirmación final con cuenta actual y número de anuncios. Pérdida de red: «Estamos comprobando el resultado», botón de reintento con la misma petición.
- Tras aceptar: «Ya gestionas estos anuncios» y «Ver Mis anuncios». En la cuenta oficial desaparecen de sus fichas propias al refrescar. La administración mantiene acceso moderador. Edición del destinatario usa «Guardar y enviar a revisión» según su rol ordinario.

### Ficha y conversación

| Momento | Información visible / contacto |
|---|---|
| Antes y pendiente | «Publicado con asistencia de KarmaHouse. KarmaHouse atiende las consultas y las coordina con el anunciante»; CTA «Consultar con KarmaHouse» |
| Aceptado | «Publicado con asistencia de KarmaHouse. Ahora gestiona este anuncio [nombre]»; CTA «Consultar con [nombre]» |
| Chat previo | «Este anuncio cambió de responsable. Esta conversación con KarmaHouse conserva su historial. Puedes iniciar una nueva con [nombre]»; CTA «Hablar con el responsable actual» si la ficha está pública/activa y la cuenta puede contactar |
| Retirada/pausada/sin acceso | Historial disponible para participantes; explicación de indisponibilidad; no mostrar un responsable privado ni habilitar nuevo contacto |

El chat antiguo mantiene encabezado, otro usuario, mensajes, lectores y denuncias originales. El aviso se deriva del servidor, sin insertar un mensaje ficticio en nombre de otra persona ni aumentar last_seq/unreadCount. El comprador decide si inicia el nuevo chat; no se copian mensajes, archivos, visitas, ofertas, borradores ni contactos. Un texto propio no enviado se conserva en el chat antiguo y puede descartarse; no se envía automáticamente a la nueva cuenta.

Los bloqueos antiguos se conservan. La nueva pareja debe superar sus propios bloqueos y límites; el traspaso no desbloquea ni sustituye una identidad para evitarlos. No se traslada un bloqueo contra KarmaHouse al colaborador automáticamente, porque afecta a personas distintas. Reportar el chat antiguo sigue denunciando al interlocutor original. Las ofertas/visitas aceptadas antiguas se muestran como historial, no como acuerdos del nuevo gestor; las pendientes quedan sin capacidad de aceptar/contraofertar, conservando cancelación cuando el contrato existente la permite.

No se crea push de traspasos en v1. El destinatario ve solicitudes al abrir Mi espacio/Mis anuncios y la coordinación inicial puede hacerse manualmente. Las notificaciones anteriores conservan destinatario y destino; si se abren tras aceptar, muestran el chat histórico. Las nuevas consultas usan el canal ordinario del nuevo gestor. Una alerta guardada/favorito abre el mismo UUID y descubre su responsable actual.

## 9. Caché, retirada, eliminación y recuperación

El traspaso conserva las URLs de imágenes públicas para respetar ahorro de datos. Se refrescan ownListings, detalle, perfiles, contador de solicitudes y páginas de catálogo/favoritos afectadas con invalidación de generaciones: una respuesta iniciada antes de aceptar no puede restituir la gestión anterior. Clientes que no participaron refrescan al enfocar/reanudar y antes de contactar o escribir; no se necesita Realtime para el MVP. Las firmas privadas de fichas pausadas del gestor se separan de la caché pública global y se mantienen por sesión; no conservarlas al cerrar sesión bajo la suposición actual de que todas las fotos firmadas son públicas.

El snapshot offline es una vista de lectura y nunca autoriza traspasar, editar, resolver solicitudes o elegir el destinatario del chat. Antes del contacto se consulta el gestor actual y se verifica el esperado en servidor. Si no hay conexión, se conserva la ficha con el aviso offline existente y se pide conexión para continuar.

Hay un límite real de privacidad de imágenes ya públicas: el proyecto firma URLs por siete días. [Supabase documenta que las firmas permanecen válidas hasta su caducidad y no se invalidan por cambios de claves de Auth](https://supabase.com/docs/guides/storage/serving/downloads). Tampoco se recuperan imágenes ya descargadas. Retirar/moderar bloquea nuevas lecturas autorizadas, pero no permite prometer revocación inmediata de enlaces emitidos; las vistas privadas de solicitudes usan firmas cortas separadas y limpieza de estado al cerrar sesión.

### Suspensión y eliminación

- Destinatario suspendido: no ofrecer/aceptar; bloqueo compartido de cuenta impide carrera con aceptación. Si acepta primero y luego se suspende, se aplican la pausa y versionado actuales a sus nuevas fichas. Si se suspende primero, la aceptación no cambia nada.
- Reactivación: preservar la restauración existente por paused_version; no reactivar un anuncio moderado después ni una solicitud obsoleta.
- Eliminación iniciada: marcar/bloquear el estado de eliminación antes de borrar fichas/archivos, compatible con aceptación y subidas; cancelar/invalidate solicitudes pendientes y negar nuevas transferencias a esa cuenta. Verificar existencia de sesión y cuenta en cada mutación aunque quede un JWT emitido.
- Destinatario que elimina su cuenta después de aceptar: sus fichas se retiran por el flujo actual, y sus favoritos como titular se borran. Los favoritos de otras personas hacia esas fichas desaparecen por el cascade actual; no volver a publicar automáticamente desde KarmaHouse. Los chats comprador–KarmaHouse anteriores sobreviven a la eliminación de la ficha porque property_id del chat es un snapshot sin FK; chats con el destinatario eliminado sí siguen las cascadas actuales por participante.
- Fotos heredadas al borrar una ficha/cuenta: reservar tareas de limpieza antes de perder referencias. El cliente conserva la protección que solo admite sus prefijos; el servidor limpia adjuntos heredados mediante Storage API con credenciales privadas. La cuenta puede terminar de eliminarse sin esperar archivos que pertenezcan al publicador oficial, pero la cola queda durable y visible para reintento del operador.

[Supabase advierte de que una cuenta no puede eliminarse si todavía es propietaria de objetos de Storage, y de que borrar el usuario no invalida inmediatamente los JWT emitidos](https://supabase.com/docs/guides/auth/managing-user-data). El preflight de implementación debe revisar ownership real de Storage sin asumir que el prefijo equivale a owner_id del objeto. En v1 los objetos heredados pertenecen a la cuenta oficial protegida; no se reasigna esa propiedad al aceptar.

### Limpieza recuperable y corrección

El trabajador de limpieza es una herramienta de servidor invocada por operador inicialmente, no un requisito de cron/push. Revalida referencias, reserva un path retired como deleting, prohíbe volver a adjuntarlo y llama a Storage API. Si falla, la tarea conserva error/intentos y se reintenta; «objeto ya inexistente» equivale a limpieza terminada. Nunca se borran objetos directamente mediante SQL ni se borran paths de un lote cuya aceptación falló. No se pide una clave service_role en el cliente.

Cancelar/rechazar/vencer una petición pendiente no altera imágenes ni gestión. Tras un commit aceptado no existe «deshacer» unilateral: podría haber mensajes o cambios nuevos. Si se detecta un destinatario erróneo, el propietario puede retirar temporalmente la ficha y abrir una incidencia; una devolución requiere confirmación del gestor actual, una nueva aceptación y una operación de servidor auditada que vuelva a comprobar versiones y adjuntos. El MVP no incluye interfaz de traspasos entre miembros ni de reversión forzada.

## 10. Invariantes de aceptación del producto

1. La publicación asistida visible tiene autorización y confirmación privadas; ningún contacto/prueba sale por REST público, catálogo, perfil, logs ni notificación.
2. Un UUID, teléfono, nombre, link o path conocido no permite reclamar una ficha. Solo el propietario ofrece sus fichas asistidas oficiales al colaborador vinculado; solo ese UUID destinatario acepta.
3. Antes de aceptar, la cuenta oficial mantiene gestión. Después, el destinatario tiene las mismas fichas y puede editar/pausar/enviar a revisión; no recibe permisos de plataforma.
4. UUID, created_at, enlaces, contenido, fotos, miniatura, moderación, disponibilidad y favoritos se conservan exactamente al aceptar. Version aumenta una sola vez por ficha.
5. Un lote se acepta entero o no cambia ninguna ficha. Reintentos, dobles toques, pérdida de respuesta y solicitudes simultáneas no duplican fichas ni eventos.
6. Versiones cambiadas, autorización retirada, vínculo cambiado, cuenta suspendida/eliminándose, plazo vencido o imagen faltante bloquean aceptación con motivo claro.
7. Nuevas consultas van al gestor actual. Los chats, denuncias, lectura, bloqueos, ofertas, visitas y notificaciones anteriores conservan sus participantes y atribución.
8. Retirar/pausar/editar o eliminar una cuenta no abre lecturas indebidas ni borra fotos todavía utilizadas; la limpieza fallida es recuperable.
9. Clientes antiguos conservan firmas y omisiones del backend. El destinatario recibe la versión nueva antes de activar traspasos; no se promete que un APK antiguo pueda editar adjuntos heredados.
10. No se generan alertas de «nueva vivienda» por el traspaso, no cambia la fecha para impulsar ranking y no se otorga verificación o reputación por importar.

## 11. Fases, coste relativo y decisiones

| Fase | Resultado útil | Dependencia / tamaño relativo |
|---|---|---|
| 0. Operación manual | Material directo, autorización, confirmación y fichas con el formulario actual; registro privado provisional | Pequeña; puede comenzar tras acordar la operación, sin esperar automatización de traspasos |
| 1. Registro y publicación asistida | Procedencia privada y flujo administrativo; identidad de creación y registro de adjuntos preparados | Media; requisito de traspasos seguros |
| 2. Traspaso de servidor | Solicitudes, aceptación atómica, RLS, fotos y tratamiento de cuentas/eliminación | Mayor esfuerzo y mayor riesgo; no activar por separado sin cliente compatible |
| 3. UI y continuidad | Administración, Mi espacio/Mis anuncios, responsable en detalle/chat, sincronización | Media; depende de contratos de fase 2 |
| 4. Verificación y lanzamiento acotado | SQL con rollback y concurrencia, integración real, revisión visual y APK compatible; primera prueba voluntaria | Media; depende de todas las anteriores |

El [plan](../plans/2026-10-05-assisted-listings-transfer.md) descompone archivos, contratos, migraciones aún no creadas/aplicadas y pruebas. No se estima una fecha de entrega sin verificar el entorno de desarrollo, acceso de prueba y disponibilidad de dispositivo. La complejidad está en permisos/recuperación, no en añadir un botón.

**Recomendaciones incluidas en la propuesta:** solo propietario para iniciar/cancelar y datos sensibles; un colaborador por lote, máximo 20; aceptación completa; caducidad siete días; sin push nuevo; conservar rutas con registro de adjuntos; cambiar owner_id y dejar chats antiguos como historial; publicación inicial gratuita sin comisiones.

**Decisiones que requieren al usuario antes de operación real:** aprobar o ajustar esas reglas; confirmar el nombre público de la cuenta oficial y quién atenderá las consultas/confirmaciones; acordar el texto operativo de autorización y la retención de su evidencia después de una retirada. Las decisiones técnicas restantes pueden resolverse durante implementación conforme a los contratos aquí descritos.

Mejoras posteriores: aceptación por subconjuntos, avisos push propios y su resolver, cuentas de agencia/equipos, calendario de disponibilidad, reconfirmaciones automáticas, traspasos entre miembros y herramientas de reversión. Solo se justifican por uso real. Publicar, conseguir un comprador y cerrar una operación son hechos distintos: ninguna métrica ni este traspaso asigna comisiones.

## 12. Evidencia y comprobación de esta propuesta

Se contrastaron la dirección acordada, la base funcional y definiciones SQL más recientes, incluidos alquiler/búsquedas, trust profile, miniaturas, propietario y suspensión. Se verificó explícitamente que los chats no tienen cascade por property_id y que el borrado del cliente rechaza prefijos ajenos. Se consultaron las fuentes oficiales enlazadas; no se leyó contenido personal ni secretos de configuración.

Los informes históricos de importación, propietario, push y Android permanecen como antecedentes con sus fechas y límites. Este análisis no reejecutó sus resultados. Solo se crean dos archivos Markdown en el worktree; no se modifican src, supabase, configuración, datos remotos ni el checkout principal.
